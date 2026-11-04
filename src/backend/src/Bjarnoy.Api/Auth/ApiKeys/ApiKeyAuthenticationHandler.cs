using System.Diagnostics;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Api.Auth.ApiKeys;

/// <summary>
/// Authenticates a request that carries an API key (<c>Authorization: Bearer bjk_...</c> or <c>X-Api-Key: bjk_...</c>)
/// as the key's <em>owner</em>: the principal has the owner's id, name and (conditionally) role, so every existing
/// ownership filter and policy sees an ordinary user — what the key may actually reach is then narrowed by
/// <see cref="ApiKeyScopeMiddleware"/>.
/// </summary>
/// <remarks>
/// <para>
/// A presented but invalid key (unknown, wrong secret, revoked, expired, banned owner) fails authentication and also
/// leaves a marker on <see cref="HttpContext.Items"/>, because failing alone only leaves the request anonymous — which
/// is enough to refuse an <c>[Authorize]</c> endpoint but would let a revoked key keep reading anonymous ones. The
/// middleware turns the marker into a 401.
/// </para>
/// <para>
/// The <c>Admin</c> role is granted only when the owner <em>is</em> an admin <em>and</em> the key holds at least one
/// <c>admin.*</c> feature; a key owned by an admin but scoped to player features therefore cannot reach admin routes
/// even if a feature check were somehow skipped. A Locked owner authenticates normally — the existing
/// <see cref="ActiveUserEndpointFilter"/> already refuses their mutating actions.
/// </para>
/// </remarks>
public sealed class ApiKeyAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory loggerFactory,
    UrlEncoder encoder,
    GameDbContext dbContext,
    TimeProvider timeProvider)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, loggerFactory, encoder)
{
    public const string SchemeName = "ApiKey";

    public const string HeaderName = "X-Api-Key";

    /// <summary>How often a key's <see cref="ApiKeyEntity.LastUsedAt"/> is rewritten at most.</summary>
    private static readonly TimeSpan LastUsedGranularity = TimeSpan.FromMinutes(1);

    /// <summary>The raw API key the request presents, or null when it presents none (a JWT, or nothing).</summary>
    public static string? ExtractToken(HttpRequest request)
    {
        var header = request.Headers[HeaderName].ToString();
        if (!string.IsNullOrWhiteSpace(header))
        {
            return header.Trim();
        }

        var authorization = request.Headers.Authorization.ToString();
        const string bearer = "Bearer ";
        if (authorization.StartsWith(bearer, StringComparison.OrdinalIgnoreCase))
        {
            var token = authorization[bearer.Length..].Trim();
            if (token.StartsWith(ApiKeyToken.Prefix, StringComparison.Ordinal))
            {
                return token;
            }
        }

        return null;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var token = ExtractToken(Request);
        if (token is null)
        {
            return AuthenticateResult.NoResult();
        }

        if (!ApiKeyToken.TryParse(token, out var keyId, out var secret))
        {
            return Failed("Malformed API key.");
        }

        var cancellationToken = Context.RequestAborted;
        var key = await dbContext.ApiKeys
            .AsNoTracking()
            .Include(k => k.OwnerUser)
            .FirstOrDefaultAsync(k => k.KeyId == keyId, cancellationToken);

        // The same answer for "no such key" and "wrong secret": nothing to tell a prober apart.
        if (key is null || !ApiKeyToken.Verify(secret, key.SecretHash))
        {
            return Failed("Invalid API key.");
        }

        var now = timeProvider.GetUtcNow();
        switch (key.GetStatus(now))
        {
            case ApiKeyStatus.Revoked:
                return Failed("API key revoked.");
            case ApiKeyStatus.Expired:
                return Failed("API key expired.");
        }

        var owner = key.OwnerUser!;
        if (owner.Status == UserStatus.Banned)
        {
            return Failed("API key owner is banned.");
        }

        if (key.LastUsedAt is null || now - key.LastUsedAt.Value >= LastUsedGranularity)
        {
            await dbContext.ApiKeys
                .Where(k => k.Id == key.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(k => k.LastUsedAt, now), cancellationToken);
            Logger.LogInformation(
                "API key {ApiKeyName} ({ApiKeyId}) used as {OwnerUserName} ({OwnerUserId}).",
                key.Name, key.Id, owner.UserName, owner.Id);
        }

        var hasAdminFeature = key.Features.Keys.Any(f => ApiKeyFeature.Find(f)?.Admin == true);
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, owner.Id.ToString()),
            new("sub", owner.Id.ToString()),
            new("unique_name", owner.UserName),
            new(ApiKeyClaims.ApiKeyId, key.Id.ToString()),
            new(ApiKeyClaims.ApiKeyName, key.Name),
        };
        if (owner.Role == UserRole.Admin && hasAdminFeature)
        {
            claims.Add(new Claim(ClaimTypes.Role, nameof(UserRole.Admin)));
        }

        Context.Items[ApiKeyContext.ItemKey] = new ApiKeyContext(
            key.Id,
            key.KeyId,
            key.Name,
            owner.Id,
            key.Features,
            key.AllWorlds,
            key.WorldIds.ToHashSet(),
            key.RequestsPerMinute);

        Activity.Current?.SetTag("bjarnoy.api_key.id", key.Id.ToString());
        Activity.Current?.SetTag("bjarnoy.api_key.name", key.Name);

        var identity = new ClaimsIdentity(claims, SchemeName);
        return AuthenticateResult.Success(
            new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }

    private AuthenticateResult Failed(string reason)
    {
        Context.Items[ApiKeyContext.FailureItemKey] = reason;
        return AuthenticateResult.Fail(reason);
    }
}
