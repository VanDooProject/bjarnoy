using Bjarnoy.Infrastructure.Entities;
using Microsoft.AspNetCore.Routing;

namespace Bjarnoy.Api.Auth.ApiKeys;

/// <summary>
/// Narrows what a request authenticated with an API key may reach. Registered after <c>UseAuthentication</c> and before
/// <c>UseAuthorization</c>; does nothing for any other request.
/// </summary>
/// <remarks>
/// <para>In order, for a key request under <c>/api/</c>:</para>
/// <list type="number">
/// <item>A key that failed authentication (revoked, expired, wrong secret, banned owner) is a 401, even on an anonymous endpoint.</item>
/// <item>An endpoint marked <see cref="ApiKeyEndpointKind.Forbidden"/>, or with no <see cref="ApiKeyEndpointMarker"/> at all, is a 403 — fail closed.</item>
/// <item>The per-key fixed-window rate limit (429 with <c>Retry-After</c>); applied before any database work so an abusive loop is cheap to refuse.</item>
/// <item>A <see cref="ApiKeyEndpointKind.Public"/> endpoint passes.</item>
/// <item>The key must hold the endpoint's feature at the level its HTTP method needs.</item>
/// <item>For a world-scoped feature and a key limited to some worlds: the world the request names (route <c>worldId</c>, or the world of the settlement/army/guild/treaty/offer/report it names, or the <c>worldId</c> query value) must be one of them.</item>
/// </list>
/// Paths outside <c>/api/</c> (health probes, OpenAPI and Scalar, the SPA and its assets) carry no game data and pass.
/// </remarks>
public sealed class ApiKeyScopeMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(
        HttpContext context,
        ApiKeyRateLimiter rateLimiter,
        ApiKeyWorldResolver worldResolver)
    {
        ArgumentNullException.ThrowIfNull(context);

        if (!context.Request.Path.StartsWithSegments("/api"))
        {
            await next(context);
            return;
        }

        if (context.Items.TryGetValue(ApiKeyContext.FailureItemKey, out var failure))
        {
            await Refuse(context, StatusCodes.Status401Unauthorized, failure as string ?? "Invalid API key.");
            return;
        }

        if (!context.User.IsApiKey() || ApiKeyContext.From(context) is not { } key)
        {
            await next(context);
            return;
        }

        var endpoint = context.GetEndpoint();
        var marker = endpoint?.Metadata.GetMetadata<ApiKeyEndpointMarker>();
        if (endpoint is null || marker is null || marker.Kind == ApiKeyEndpointKind.Forbidden)
        {
            await Refuse(context, StatusCodes.Status403Forbidden, "Not available to API keys.");
            return;
        }

        if (!rateLimiter.TryAcquire(key.ApiKeyId, key.RequestsPerMinute, out var retryAfter))
        {
            context.Response.Headers.RetryAfter = Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds)).ToString();
            await Refuse(context, StatusCodes.Status429TooManyRequests, "API key rate limit exceeded.");
            return;
        }

        if (marker.Kind == ApiKeyEndpointKind.Public)
        {
            await next(context);
            return;
        }

        var feature = marker.Feature!;
        var required = ApiKeyFeature.RequiredAccess(context.Request.Method);
        if (key.AccessTo(feature) < required)
        {
            var verb = required == ApiKeyAccess.Read ? "read" : "write";
            await Refuse(context, StatusCodes.Status403Forbidden, $"API key lacks {feature}:{verb}.");
            return;
        }

        if (ApiKeyFeature.Find(feature)!.WorldScoped && !key.AllWorlds)
        {
            var refusal = await CheckWorldAsync(context, endpoint, key, worldResolver);
            if (refusal is not null)
            {
                await Refuse(context, StatusCodes.Status403Forbidden, refusal);
                return;
            }
        }

        await next(context);
    }

    /// <summary>Null when the request stays inside the key's worlds, otherwise the refusal text.</summary>
    private static async Task<string?> CheckWorldAsync(
        HttpContext context, Endpoint endpoint, ApiKeyContext key, ApiKeyWorldResolver resolver)
    {
        var cancellationToken = context.RequestAborted;
        var pattern = (endpoint as RouteEndpoint)?.RoutePattern.RawText ?? string.Empty;
        var sources = 0;
        var lists = new List<IReadOnlyList<Guid>>();

        async Task Consider(string routeKey, Func<Guid, Task<IReadOnlyList<Guid>>> resolve)
        {
            if (context.Request.RouteValues.TryGetValue(routeKey, out var raw)
                && Guid.TryParse(raw?.ToString(), out var id))
            {
                sources++;
                lists.Add(await resolve(id));
            }
        }

        await Consider("worldId", id => Task.FromResult<IReadOnlyList<Guid>>([id]));
        await Consider("settlementId", id => resolver.ForSettlementAsync(id, cancellationToken));
        await Consider("armyId", id => resolver.ForArmyAsync(id, cancellationToken));
        await Consider("guildId", id => resolver.ForGuildAsync(id, cancellationToken));
        await Consider("treatyId", id => resolver.ForTreatyAsync(id, cancellationToken));
        await Consider("offerId", id => resolver.ForTradeOfferAsync(id, cancellationToken));

        if (pattern.StartsWith("/api/v1/reports/", StringComparison.Ordinal))
        {
            await Consider("reportId", id => resolver.ForBattleReportAsync(id, cancellationToken));
        }
        else if (pattern.StartsWith("/api/v1/field-reports/", StringComparison.Ordinal))
        {
            await Consider("reportId", id => resolver.ForFieldReportAsync(id, cancellationToken));
        }
        else if (pattern.StartsWith("/api/v1/camp-reports/", StringComparison.Ordinal))
        {
            await Consider("reportId", id => resolver.ForCampReportAsync(id, cancellationToken));
        }

        if (Guid.TryParse(context.Request.Query["worldId"].ToString(), out var queryWorld))
        {
            sources++;
            lists.Add([queryWorld]);
        }

        if (sources == 0)
        {
            return "API key is limited to specific worlds; this request names none.";
        }

        foreach (var worlds in lists)
        {
            // An empty list is a resource that does not exist: not a denial, the handler answers 404.
            if (worlds.Count > 0 && !worlds.Any(key.WorldIds.Contains))
            {
                return "API key is not allowed in this world.";
            }
        }

        return null;
    }

    private static Task Refuse(HttpContext context, int statusCode, string title) =>
        Results.Problem(title: title, statusCode: statusCode).ExecuteAsync(context);
}
