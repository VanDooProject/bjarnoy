using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Regression coverage for the settlement-read fog gate: before this,
/// <c>GET /settlements/{id}</c> and <c>GET /worlds/{worldId}/settlements</c>
/// handed any caller a rival's full state (stock, rates, queues, garrison) or
/// the whole world's settlement list, regardless of fog. Both are now scoped
/// to what the caller's own fog mask actually shows them — see
/// <c>SettlementEndpoints.Get</c>/<c>GetView</c>/<c>ListForWorld</c> and
/// <c>Bjarnoy.Infrastructure.World.ExploredAreaService</c>.
/// </summary>
public sealed class FogGatedSettlementReadsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private HttpClient Client() => _factory.CreateClient();

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    private async Task<Guid> CreateWorldAsync(HttpClient client, int seed = 21, int radius = 80)
    {
        var world = await _factory.CreateWorldAsync(Unique("w"), seed, radius, cancellationToken: Ct);
        return world.Id;
    }

    /// <summary>Founds a settlement on the world's first usable plot, under <paramref name="ownerId"/>, via the anonymous header.</summary>
    private async Task<SettlementResponse> FoundAsync(HttpClient client, Guid worldId, string ownerId)
    {
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldId}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<SettlementResponse>(Ct);
    }

    private async Task<AuthResponse> RegisterAsync(HttpClient client, string? existingOwnerId = null)
    {
        var response = await client.PostJsonAsync(
            "/api/v1/auth/register",
            new RegisterRequest(Unique("player"), "correct-horse-battery", existingOwnerId),
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.ReadStrictAsync<AuthResponse>(Ct);
    }

    /// <summary>
    /// Inserts a settlement directly via the DB, bypassing founding's
    /// spacing/plot validation entirely — this suite needs full control over
    /// exactly where a rival stands, relative to the caller's own explored
    /// radius, which real founding's minimum-spacing rule would otherwise
    /// fight.
    /// </summary>
    private async Task<Guid> PlantRivalAsync(
        Guid worldId, Guid islandId, string ownerId, string ownerName, int centreQ, int centreR,
        IReadOnlyList<(int Q, int R)>? extraBuildings = null)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();

        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            UserId = SystemUserIds.Abandoned,
            Name = Unique("rival"),
            OwnerName = ownerName,
            OwnerId = ownerId,
            CentreQ = centreQ,
            CentreR = centreR,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = [new PlacedBuildingEntity { Q = centreQ, R = centreR, Type = BuildingType.Longhouse, Level = 1 }],
        };

        foreach (var (q, r) in extraBuildings ?? [])
        {
            settlement.Buildings.Add(new PlacedBuildingEntity { Q = q, R = r, Type = BuildingType.Farm, Level = 1 });
        }

        db.Settlements.Add(settlement);
        await db.SaveChangesAsync(Ct);
        return settlement.Id;
    }

    // ------------------------------------------------------- GET /settlements/{id}

    [Fact]
    public async Task Get_by_id_is_refused_for_an_anonymous_caller_under_someone_elses_header()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var owner = Unique("owner");
        client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        var settlement = await FoundAsync(client, worldId, owner);

        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", Unique("someone-else"));

        var response = await client.GetAsync($"/api/v1/settlements/{settlement.Id}", Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var error = await response.ReadStrictAsync<AuthErrorResponse>(Ct);
        Assert.Equal("not_owner", error.Error);
    }

    [Fact]
    public async Task Get_by_id_is_refused_for_a_different_logged_in_account()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var owner = Unique("owner");
        client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        var settlement = await FoundAsync(client, worldId, owner);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");

        // A different real account entirely — its own JWT proves nothing
        // about this settlement, and it presents no header at all.
        var rival = await RegisterAsync(client);
        Authorize(client, rival.AccessToken);

        var response = await client.GetAsync($"/api/v1/settlements/{settlement.Id}", Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Get_by_id_succeeds_for_the_unclaimed_founding_browser()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var owner = Unique("owner");
        client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        var settlement = await FoundAsync(client, worldId, owner);

        var response = await client.GetAsync($"/api/v1/settlements/{settlement.Id}", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.ReadStrictAsync<SettlementResponse>(Ct);
        Assert.Equal(settlement.Id, body.Id);
    }

    [Fact]
    public async Task Get_by_id_succeeds_for_the_claimed_owners_own_JWT()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var owner = Unique("owner");
        client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        var settlement = await FoundAsync(client, worldId, owner);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");

        var auth = await RegisterAsync(client, owner);
        Authorize(client, auth.AccessToken);

        var response = await client.GetAsync($"/api/v1/settlements/{settlement.Id}", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    // ------------------------------------------------------- GET /settlements/{id}/view

    [Fact]
    public async Task View_of_a_rival_far_outside_explored_ground_is_404()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var owner = Unique("owner");
        client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        var settlement = await FoundAsync(client, worldId, owner);

        // Level 1 -> ExploredRadius = 5. Twenty hexes out is nowhere close.
        var rivalId = await PlantRivalAsync(
            worldId, settlement.IslandId, Unique("rival-owner"), "Skoll",
            settlement.Q + 20, settlement.R);

        var response = await client.GetAsync($"/api/v1/settlements/{rivalId}/view", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task View_of_an_explored_rival_is_200_with_no_stock_or_rate_fields_and_filters_far_buildings()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var owner = Unique("owner");
        client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        var settlement = await FoundAsync(client, worldId, owner);

        // Level 1 -> ExploredRadius = 5 around the caller's own settlement.
        // The rival's centre (and its extra "near" building) sits exactly at
        // that boundary; its "far" building sits well past it.
        var nearQ = settlement.Q + 5;
        var farQ = settlement.Q + 9;
        var rivalId = await PlantRivalAsync(
            worldId, settlement.IslandId, Unique("rival-owner"), "Skoll",
            nearQ, settlement.R,
            extraBuildings: [(farQ, settlement.R)]);

        var response = await client.GetAsync($"/api/v1/settlements/{rivalId}/view", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // Strict deserialisation into SettlementViewResponse fails outright
        // if the body carries any field beyond that record's own shape — in
        // particular, stock/rates/queue/garrison/runes, which the old,
        // ungated Get used to leak to any caller.
        var body = await response.ReadStrictAsync<SettlementViewResponse>(Ct);

        Assert.Equal(rivalId, body.Id);
        Assert.Equal("Skoll", body.OwnerName);
        Assert.Contains(body.Buildings, b => b.Q == nearQ && b.R == settlement.R);
        Assert.DoesNotContain(body.Buildings, b => b.Q == farQ && b.R == settlement.R);
    }

    [Fact]
    public async Task View_is_refused_for_a_caller_with_no_resolvable_realm_at_all()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var owner = Unique("owner");
        client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        var settlement = await FoundAsync(client, worldId, owner);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");

        // No header, no JWT: nothing to resolve a realm from at all.
        var response = await client.GetAsync($"/api/v1/settlements/{settlement.Id}/view", Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var error = await response.ReadStrictAsync<AuthErrorResponse>(Ct);
        Assert.Equal("not_owner", error.Error);
    }

    // ------------------------------------------------------- GET /worlds/{worldId}/settlements

    [Fact]
    public async Task World_list_is_empty_for_an_anonymous_caller_with_no_realm()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var owner = Unique("owner");
        client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        var settlement = await FoundAsync(client, worldId, owner);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");

        // No header at all — the exact shape of an anonymous landing-page
        // visitor's own poll, before they've founded anything of their own.
        var response = await client.GetFromJsonAsync<List<SettlementSummary>>(
            $"/api/v1/worlds/{worldId}/settlements", SqliteApiFixture.StrictJson, Ct);

        Assert.NotNull(response);
        Assert.Empty(response);
        // (settlement exists, just never handed to a caller with no realm)
        Assert.NotEqual(Guid.Empty, settlement.Id);
    }

    [Fact]
    public async Task Fog_gated_reads_never_write_explored_history()
    {
        // Regression: the world list and /view used to persist newly explored
        // ground too. The frontend polls the world list in the same tick as
        // the fog mask, so for a brand-new player both requests inserted the
        // first player_explored row and the loser 500'd on the
        // (WorldId, OwnerId) unique index (seen on Postgres in aspire-e2e).
        // Only the fog mask may write it.
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var owner = Unique("owner");
        client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        var settlement = await FoundAsync(client, worldId, owner);

        var list = await client.GetAsync($"/api/v1/worlds/{worldId}/settlements", Ct);
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        var view = await client.GetAsync($"/api/v1/settlements/{settlement.Id}/view", Ct);
        Assert.Equal(HttpStatusCode.OK, view.StatusCode);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            Assert.False(await db.PlayerExplored.AnyAsync(e => e.WorldId == worldId && e.OwnerId == owner, Ct));
        }

        var fog = await client.GetAsync($"/api/v1/worlds/{worldId}/fog-mask", Ct);
        Assert.Equal(HttpStatusCode.OK, fog.StatusCode);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            Assert.True(await db.PlayerExplored.AnyAsync(e => e.WorldId == worldId && e.OwnerId == owner, Ct));
        }
    }

    [Fact]
    public async Task World_list_shows_own_and_explored_rivals_but_not_unexplored_ones()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var owner = Unique("owner");
        client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        var settlement = await FoundAsync(client, worldId, owner);

        var nearRivalId = await PlantRivalAsync(
            worldId, settlement.IslandId, Unique("near-rival"), "Near",
            settlement.Q + 5, settlement.R);
        var farRivalId = await PlantRivalAsync(
            worldId, settlement.IslandId, Unique("far-rival"), "Far",
            settlement.Q + 20, settlement.R);

        var response = await client.GetFromJsonAsync<List<SettlementSummary>>(
            $"/api/v1/worlds/{worldId}/settlements", SqliteApiFixture.StrictJson, Ct);

        Assert.NotNull(response);
        var ids = response.Select(s => s.Id).ToHashSet();
        Assert.Contains(settlement.Id, ids);
        Assert.Contains(nearRivalId, ids);
        Assert.DoesNotContain(farRivalId, ids);
    }

    // ------------------------------------------------------- GET /worlds/{worldId}/plot-suggestion

    [Fact]
    public async Task Plot_suggestion_carries_only_the_suggested_islands_own_settlements()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        client.DefaultRequestHeaders.Add("X-Owner-Id", Unique("visitor"));

        // The suggestion is pinned to one island/plot for this visitor from
        // the first call on — everything below plants settlements around
        // that already-decided island rather than trying to predict which
        // one the algorithm would pick.
        var first = await (await client.GetAsync($"/api/v1/worlds/{worldId}/plot-suggestion", Ct))
            .ReadStrictAsync<PlotSuggestionResponse>(Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldId}/islands", SqliteApiFixture.StrictJson, Ct);
        var suggestedIsland = islands!.Single(i => i.Id == first.IslandId);
        var otherIsland = islands!.First(i => i.Id != first.IslandId);

        // Well clear of the pinned plot itself, so planting this doesn't
        // change what the still-pinned suggestion offers.
        var residentId = await PlantRivalAsync(
            worldId, suggestedIsland.Id, Unique("resident"), "Resident",
            suggestedIsland.Q + 15, suggestedIsland.R + 15);
        var elsewhereId = await PlantRivalAsync(
            worldId, otherIsland.Id, Unique("elsewhere"), "Elsewhere",
            otherIsland.Q, otherIsland.R);

        var response = await client.GetAsync($"/api/v1/worlds/{worldId}/plot-suggestion", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var suggestion = await response.ReadStrictAsync<PlotSuggestionResponse>(Ct);

        Assert.Equal(first.IslandId, suggestion.IslandId);
        Assert.Contains(suggestion.IslandSettlements, s => s.Id == residentId);
        Assert.DoesNotContain(suggestion.IslandSettlements, s => s.Id == elsewhereId);
    }
}
