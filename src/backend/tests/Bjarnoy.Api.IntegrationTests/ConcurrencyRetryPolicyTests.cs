using Bjarnoy.Api.Auth;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Issue #341: an endpoint whose handler can write a settlement or army must
/// run under <see cref="ConcurrencyRetryEndpointFilter"/>, or a lost race on it
/// silently overwrites the winner again. Like
/// <see cref="EndpointAccessPolicyTests"/>, this enumerates every mapped
/// endpoint so a newly added mutating route cannot forget the wrapper.
/// </summary>
/// <remarks>
/// The filter being <em>innermost</em> (added last, see
/// <see cref="ConcurrencyRetryBuilderExtensions.WithConcurrencyRetry"/>) is not
/// checked here: ASP.NET keeps endpoint filters out of endpoint metadata, so
/// only the marker is observable.
/// </remarks>
public sealed class ConcurrencyRetryPolicyTests
{
    /// <summary>Route prefixes whose every non-GET endpoint can write settlements or armies.</summary>
    private static readonly string[] MutatingPrefixes =
    [
        "/api/v1/settlements",
        "/api/v1/armies",
        "/api/v1/trade-offers",
        "/api/v1/treaties",
        "/api/v1/guilds",
        "/api/v1/admin/settlements",
        "/api/v1/admin/armies",
    ];

    /// <summary>Routes outside those prefixes that also write a settlement (founding, guild creation, account claim).</summary>
    private static readonly string[] MutatingRoutes =
    [
        "POST /api/v1/worlds/{worldId:guid}/settlements",
        "POST /api/v1/worlds/{worldId:guid}/guilds",
        "POST /api/v1/auth/register",
    ];

    /// <summary>GET endpoints that settle lazily and save.</summary>
    private static readonly string[] SavingReads =
    [
        "GET /api/v1/settlements/{settlementId:guid}",
        "GET /api/v1/settlements/{settlementId:guid}/view",
        "GET /api/v1/armies/{armyId:guid}",
        "GET /api/v1/worlds/{worldId:guid}/renown",
        "GET /api/v1/settlements/{settlementId:guid}/trade-offers/board",
        "GET /api/v1/settlements/{settlementId:guid}/trade-offers/mine",
        "GET /api/v1/settlements/{settlementId:guid}/shipments",
        "GET /api/v1/admin/settlements/{settlementId:guid}",
    ];

    private static async Task<Dictionary<string, RouteEndpoint>> MapEndpointsAsync()
    {
        await using var factory = BjarnoyApiFactory.Sqlite();
        using var client = factory.CreateClient();

        var mapped = new Dictionary<string, RouteEndpoint>();
        foreach (var dataSource in factory.Services.GetServices<EndpointDataSource>())
        {
            foreach (var endpoint in dataSource.Endpoints.OfType<RouteEndpoint>())
            {
                var methods = endpoint.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods ?? [];
                foreach (var method in methods)
                {
                    mapped[$"{method} {endpoint.RoutePattern.RawText}"] = endpoint;
                }
            }
        }

        return mapped;
    }

    private static bool HasRetry(RouteEndpoint endpoint) =>
        endpoint.Metadata.GetMetadata<ConcurrencyRetryMetadata>() is not null;

    [Fact]
    public async Task Every_mutating_settlement_army_trade_and_guild_endpoint_runs_under_the_retry_wrapper()
    {
        var mapped = await MapEndpointsAsync();

        var candidates = mapped
            .Where(e => !e.Key.StartsWith("GET ", StringComparison.Ordinal)
                && (MutatingRoutes.Contains(e.Key)
                    || MutatingPrefixes.Any(prefix => e.Key.Contains($" {prefix}/", StringComparison.Ordinal)
                        || e.Key.EndsWith($" {prefix}", StringComparison.Ordinal))))
            .ToList();

        // Guards the guard: the prefixes above must actually match something.
        Assert.True(candidates.Count >= 30, $"only {candidates.Count} endpoints matched — did a route prefix change?");
        foreach (var route in MutatingRoutes)
        {
            Assert.True(mapped.ContainsKey(route), $"{route} is no longer mapped — update {nameof(MutatingRoutes)}.");
        }

        var missing = candidates.Where(e => !HasRetry(e.Value)).Select(e => e.Key).Order().ToList();

        Assert.True(
            missing.Count == 0,
            "These mutating endpoints are not wrapped in .WithConcurrencyRetry() (as the LAST call on the endpoint): "
                + string.Join(", ", missing));
    }

    [Fact]
    public async Task The_reads_that_settle_lazily_and_save_run_under_the_retry_wrapper()
    {
        var mapped = await MapEndpointsAsync();

        foreach (var route in SavingReads)
        {
            Assert.True(mapped.ContainsKey(route), $"{route} is no longer mapped — update {nameof(SavingReads)}.");
            Assert.True(HasRetry(mapped[route]), $"{route} saves on read but has no .WithConcurrencyRetry().");
        }
    }

    [Fact]
    public async Task The_world_admin_endpoints_are_left_out_because_the_reseed_opens_its_own_transaction()
    {
        var mapped = await MapEndpointsAsync();

        var wrapped = mapped
            .Where(e => e.Key.Contains(" /api/v1/admin/worlds", StringComparison.Ordinal) && HasRetry(e.Value))
            .Select(e => e.Key)
            .ToList();

        Assert.Empty(wrapped);
    }
}
