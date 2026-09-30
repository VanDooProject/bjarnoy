using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Settlement expansion end to end (issue #55): train settler crews, accrue
/// renown, dispatch a founding convoy, and resolve it on arrival — mirroring
/// <see cref="SettlementEndpointsTests"/>/<see cref="AdminSettlementEndpointsTests"/>'s
/// harness shape (a real HTTP stack, a real EF model, the clock advanced by
/// hand).
/// </summary>
public sealed class SettlerEndpointsTests : IAsyncLifetime
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

    private static readonly (int Dq, int Dr)[] AxialNeighbourOffsets =
    [
        (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1),
    ];

    /// <summary>
    /// Axial hex distance — mirrors <c>HexCoord.DistanceTo</c> without pulling in the domain type here.
    private static int HexDistance(int q1, int r1, int q2, int r2)
    {
        var dq = q2 - q1;
        var dr = r2 - r1;
        return (Math.Abs(dq) + Math.Abs(dq + dr) + Math.Abs(dr)) / 2;
    }

    /// <summary>
    /// A land hex reachable overland from <paramref name="settlement"/>'s own
    /// hex (a real BFS over the world's actual generated terrain, not a
    /// guessed coordinate) that clears the founding minimum-spacing rule
    /// (issue #55 §4). <c>SettlementService.MinimumSpacing</c> is sized off
    /// the *maximum possible* claim radius (<c>2 * Settlement.MaxClaimRadius
    /// + 1</c> — a level-10 Longhouse's radius of 7, so 15), not the
    /// dispatching settlement's current one, so the real minimum distance
    /// here is <c>currentClaimRadius (level 5) + MinimumSpacing</c>, not just
    /// <c>currentClaimRadius + currentClaimRadius</c>.
    /// <c>island.StartPositions</c> alone can't be trusted for this: they're
    /// curated "good building spot" tiles and can all sit well inside that
    /// radius of each other. Picks the *closest* qualifying hex, to keep the
    /// convoy's food/travel-time budget small.
    /// </summary>
    private async Task<TileCoordinate> FindOverlandFoundingTargetAsync(HttpClient client, Guid worldId, SettlementResponse settlement)
    {
        const int Window = 40;
        var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{worldId}/tiles?qMin={settlement.Q - Window}&qMax={settlement.Q + Window}" +
            $"&rMin={settlement.R - Window}&rMax={settlement.R + Window}",
            SqliteApiFixture.StrictJson, Ct);
        var terrainAt = chunk!.Tiles.ToDictionary(t => (t.Q, t.R), t => t.Terrain);

        var start = (settlement.Q, settlement.R);
        var visited = new HashSet<(int Q, int R)> { start };
        var queue = new Queue<(int Q, int R)>();
        queue.Enqueue(start);

        var minFoundingDistance = Settlement.ClaimRadiusForLonghouseLevel(5) + SettlementService.MinimumSpacing;

        (int Q, int R)? best = null;
        while (queue.Count > 0)
        {
            var (q, r) = queue.Dequeue();
            var distance = HexDistance(settlement.Q, settlement.R, q, r);
            if (distance >= minFoundingDistance
                && (best is null || distance < HexDistance(settlement.Q, settlement.R, best.Value.Q, best.Value.R)))
            {
                best = (q, r);
            }

            foreach (var o in AxialNeighbourOffsets)
            {
                var next = (Q: q + o.Dq, R: r + o.Dr);
                if (visited.Contains(next))
                {
                    continue;
                }

                if (!terrainAt.TryGetValue(next, out var terrain) || terrain == "sea")
                {
                    continue;
                }

                visited.Add(next);
                queue.Enqueue(next);
            }
        }

        Assert.True(best is not null, "No land hex reachable overland clears the founding minimum-spacing rule within the sampled window.");
        return new TileCoordinate(best!.Value.Q, best.Value.R);
    }

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    /// <summary>
    /// Access tokens are minted and validated against this app's own
    /// injected <c>TimeProvider</c> (see <c>Program.cs</c>'s remarks on
    /// <see cref="JwtBearerOptions"/>), which is exactly what
    /// <see cref="_factory"/>'s <c>Time.Advance</c> moves — a 15-minute
    /// access token does not survive this test's multi-hour/day fast-
    /// forwards to let renown accrue or a founding convoy arrive. Refresh
    /// tokens live 30 days, comfortably longer than any skip here, so this
    /// exchanges the stale access token for a fresh one and re-authorizes
    /// <paramref name="client"/> in place. Returns the refreshed tokens
    /// (refresh tokens rotate on every use — see
    /// <c>AuthEndpointsTests.A_rotated_out_refresh_token_cannot_be_reused</c>
    /// — so a caller doing more than one time-skip must thread this call's
    /// result into the next one rather than reusing the original token).
    /// </summary>
    private async Task<AuthResponse> RefreshAsync(HttpClient client, string refreshToken)
    {
        var refreshed = await (await client.PostJsonAsync(
            "/api/v1/auth/refresh", new RefreshRequest(refreshToken), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        Authorize(client, refreshed.AccessToken);
        return refreshed;
    }

    private async Task<string> CreateAdminTokenAsync(HttpClient client)
    {
        var userName = Unique("admin");
        var registered = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == registered.User.Id, Ct);
            user.Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var loggedIn = await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, "correct-horse-battery"), Ct);
        return (await loggedIn.ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
    }

    /// <summary>
    /// Founds a first settlement anonymously, then registers a real account
    /// claiming it (see <c>AuthEndpointsTests.Registering_with_an_existing_local_owner_id_claims_its_unowned_settlements</c>),
    /// and — via a throwaway admin token — levels its Longhouse to 5 (settler
    /// crews require it) and grants a large resource stock so training is
    /// never blocked on cost.
    /// </summary>
    private async Task<(Guid WorldId, SettlementResponse Settlement, AuthResponse Player, IslandResponse Island)>
        SetUpPlayerReadyToExpandAsync(HttpClient client)
    {
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        // Largest island available, not just the first with enough start
        // positions: the golden-path test needs enough landmass for an
        // overland-foundable hex to exist at all (see
        // FindOverlandFoundingTargetAsync's remarks on the real minimum
        // distance), which a small island may not have.
        var island = islands!.Where(i => i.StartPositions.Count > 3).OrderByDescending(i => i.TileCount).First();

        var plot = island.StartPositions[0];

        var ownerId = Unique("local-owner-");
        var settlement = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId),
            Ct)).ReadStrictAsync<SettlementResponse>(Ct);

        var player = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("ulf-"), "correct-horse-battery", ownerId), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);

        var adminToken = await CreateAdminTokenAsync(client);
        Authorize(client, adminToken);

        var levelResponse = await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/buildings/{plot.Q}/{plot.R}/level",
            new SetBuildingLevelRequest(5), Ct);
        Assert.Equal(HttpStatusCode.OK, levelResponse.StatusCode);

        var grantResponse = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/resources",
            new GrantResourcesRequest(Wood: 1_000_000, Stone: 1_000_000, Food: 1_000_000, Iron: 1_000_000), Ct);
        Assert.Equal(HttpStatusCode.OK, grantResponse.StatusCode);

        // SettlerCrew trains at a Cart Workshop (see
        // UnitCatalogue.RequiredBuildingType) — grant one before
        // TrainThreeSettlerCrewsAsync below.
        var layout = await client.GetFromJsonAsync<AdminSettlementLayoutResponse>(
            $"/api/v1/admin/settlements/{settlement.Id}/layout", SqliteApiFixture.StrictJson, Ct);
        var grassHex = layout!.Hexes.First(h => !h.IsCentre && h.Building is null && h.Terrain == "grass");
        await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/buildings/{grassHex.Q}/{grassHex.R}",
            new PlaceBuildingRequest("cartworkshop", 1), Ct);

        Authorize(client, player.AccessToken);

        return (world.Id, settlement, player, island);
    }

    /// <summary>
    /// Trains exactly 3 settler crews and fast-forwards the clock until the
    /// batch completes. Returns the refreshed tokens (see
    /// <see cref="RefreshAsync"/>) so a caller doing a further time-skip
    /// afterwards refreshes from the current refresh token, not a rotated-out
    /// one.
    /// </summary>
    private async Task<AuthResponse> TrainThreeSettlerCrewsAsync(HttpClient client, Guid settlementId, string refreshToken)
    {
        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/units", new TrainUnitsRequest("settlercrew", 3), Ct);
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);

        // 3 crews x 40 minutes each, per UnitCatalogue — well past the
        // 15-minute access token lifetime, so refresh before the next call.
        _factory.Time.Advance(TimeSpan.FromMinutes(121));
        var refreshed = await RefreshAsync(client, refreshToken);

        var settled = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlementId}", SqliteApiFixture.StrictJson, Ct);
        Assert.Contains(settled!.Garrison, g => g.Unit == "settlercrew" && g.Count == 3);

        return refreshed;
    }

    [Fact]
    public async Task The_unit_catalogue_includes_the_settler_crew()
    {
        using var client = Client();

        var catalogue = await client.GetFromJsonAsync<List<UnitDefinitionResponse>>(
            "/api/v1/units", SqliteApiFixture.StrictJson, Ct);

        Assert.Contains(catalogue!, u => u.Type == "settlercrew" && u.Class == "civilian");
    }

    [Fact]
    public async Task A_freshly_registered_players_renown_starts_at_zero_and_does_not_yet_allow_a_second_settlement()
    {
        using var client = Client();
        var (worldId, _, player, _) = await SetUpPlayerReadyToExpandAsync(client);
        Authorize(client, player.AccessToken);

        var renown = await client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{worldId}/renown", SqliteApiFixture.StrictJson, Ct);

        Assert.Equal(1, renown!.SettlementCount);
        Assert.Equal(55_000, renown.RequiredForNextSettlement);
        Assert.False(renown.CanFoundAnother);
    }

    [Fact]
    public async Task Renown_accrues_over_time_from_building_levels_but_buildings_alone_do_not_reach_the_second_settlement_soon()
    {
        using var client = Client();
        var (worldId, _, player, _) = await SetUpPlayerReadyToExpandAsync(client);
        Authorize(client, player.AccessToken);

        // Longhouse level 5 + a Cart Workshop => 6 renown/hour; 100 hours is
        // hundreds of renown, nowhere near the 55 000 the 2nd settlement needs.
        _factory.Time.Advance(TimeSpan.FromHours(100));
        await RefreshAsync(client, player.RefreshToken);

        var renown = await client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{worldId}/renown", SqliteApiFixture.StrictJson, Ct);

        Assert.True(renown!.Total >= 500);
        Assert.True(renown.Total < 55_000);
        Assert.False(renown.CanFoundAnother);
    }

    [Fact]
    public async Task Renown_reports_its_hourly_rate_and_the_renown_a_running_feast_still_owes()
    {
        using var client = Client();
        var (worldId, settlement, player, _) = await SetUpPlayerReadyToExpandAsync(client);
        var adminToken = await CreateAdminTokenAsync(client);
        await PlaceTownSquareAsync(client, settlement.Id, adminToken, player.AccessToken);

        var before = await client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{worldId}/renown", SqliteApiFixture.StrictJson, Ct);
        var current = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);

        // One renown per standing building level per hour.
        Assert.Equal(current!.Buildings.Sum(b => b.Level) * RenownAccount.PointsPerLevelPerHour, before!.PerHour);
        Assert.True(before.PerHour > 0);
        Assert.Equal(0, before.PendingFeastRenown);

        var started = await client.PostAsync($"/api/v1/settlements/{settlement.Id}/feast", null, Ct);
        Assert.Equal(HttpStatusCode.Accepted, started.StatusCode);

        var during = await client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{worldId}/renown", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(Feasts.RenownFor(3), during!.PendingFeastRenown, 3);

        _factory.Time.Advance(TimeSpan.FromHours(13));
        var auth = await RefreshAsync(client, player.RefreshToken);
        var after = await client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{worldId}/renown", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(0, after!.PendingFeastRenown);
        Assert.True(after.Total >= Feasts.RenownFor(3));
        Assert.NotNull(auth);
    }

    private async Task GrantRenownAsync(Guid userId, double total)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var user = await db.Users.SingleAsync(u => u.Id == userId, Ct);
        user.RenownTotal = total;
        await db.SaveChangesAsync(Ct);
    }

    /// <summary>Places a level-3 Town Square (an admin bypass of its prerequisites) and returns to the player's token.</summary>
    private async Task PlaceTownSquareAsync(HttpClient client, Guid settlementId, string adminToken, string playerToken)
    {
        Authorize(client, adminToken);
        var layout = await client.GetFromJsonAsync<AdminSettlementLayoutResponse>(
            $"/api/v1/admin/settlements/{settlementId}/layout", SqliteApiFixture.StrictJson, Ct);
        var hex = layout!.Hexes.Last(h => !h.IsCentre && h.Building is null && h.Terrain == "grass");
        var placed = await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{settlementId}/buildings/{hex.Q}/{hex.R}",
            new PlaceBuildingRequest("townsquare", 3), Ct);
        Assert.True(placed.IsSuccessStatusCode, await placed.Content.ReadAsStringAsync(Ct));
        Authorize(client, playerToken);
    }

    [Fact]
    public async Task A_feast_needs_a_town_square()
    {
        using var client = Client();
        var (_, settlement, player, _) = await SetUpPlayerReadyToExpandAsync(client);
        Authorize(client, player.AccessToken);

        var response = await client.PostAsync($"/api/v1/settlements/{settlement.Id}/feast", null, Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("NoTownSquare", await response.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task A_feast_is_paid_up_front_shown_on_the_settlement_and_refused_while_one_is_running()
    {
        using var client = Client();
        var (_, settlement, player, _) = await SetUpPlayerReadyToExpandAsync(client);
        var adminToken = await CreateAdminTokenAsync(client);
        await PlaceTownSquareAsync(client, settlement.Id, adminToken, player.AccessToken);

        var before = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Null(before!.Feast);
        Assert.Equal(3, before.NextFeast!.TownSquareLevel);
        Assert.Equal(1250, before.NextFeast.Cost.Wood, 3);
        Assert.Equal(12 * 3600, before.NextFeast.DurationSeconds, 3);

        var started = await client.PostAsync($"/api/v1/settlements/{settlement.Id}/feast", null, Ct);
        Assert.Equal(HttpStatusCode.Accepted, started.StatusCode);

        var during = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.NotNull(during!.Feast);
        Assert.Equal(before.NextFeast.RenownGain, during.Feast!.RenownGain, 3);
        Assert.True(during.Resources.Stock.Wood <= before.Resources.Stock.Wood - 1250 + 1);

        var second = await client.PostAsync($"/api/v1/settlements/{settlement.Id}/feast", null, Ct);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Contains("AlreadyRunning", await second.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task A_finished_feast_credits_its_renown_exactly_once()
    {
        using var client = Client();
        var (worldId, settlement, player, _) = await SetUpPlayerReadyToExpandAsync(client);
        var adminToken = await CreateAdminTokenAsync(client);
        await PlaceTownSquareAsync(client, settlement.Id, adminToken, player.AccessToken);

        var gain = Feasts.RenownFor(3);
        var started = await client.PostAsync($"/api/v1/settlements/{settlement.Id}/feast", null, Ct);
        Assert.Equal(HttpStatusCode.Accepted, started.StatusCode);

        // Half way through: nothing granted yet (only building renown accrued).
        _factory.Time.Advance(TimeSpan.FromHours(6));
        var auth = await RefreshAsync(client, player.RefreshToken);
        var midway = await client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{worldId}/renown", SqliteApiFixture.StrictJson, Ct);
        Assert.True(midway!.Total < gain);

        _factory.Time.Advance(TimeSpan.FromHours(7));
        await RefreshAsync(client, auth.RefreshToken);
        var settledRead = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Null(settledRead!.Feast);

        var after = await client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{worldId}/renown", SqliteApiFixture.StrictJson, Ct);
        var again = await client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{worldId}/renown", SqliteApiFixture.StrictJson, Ct);

        // 13 hours of building renown is at most a few hundred; the feast adds its gain once.
        Assert.InRange(after!.Total - midway.Total, gain, gain + 500);
        Assert.Equal(after.Total, again!.Total);
    }

    [Fact]
    public async Task A_feast_that_ended_without_anyone_reading_the_settlement_still_credits_its_renown()
    {
        using var client = Client();
        var (worldId, settlement, player, _) = await SetUpPlayerReadyToExpandAsync(client);
        var adminToken = await CreateAdminTokenAsync(client);
        await PlaceTownSquareAsync(client, settlement.Id, adminToken, player.AccessToken);
        await client.PostAsync($"/api/v1/settlements/{settlement.Id}/feast", null, Ct);

        _factory.Time.Advance(TimeSpan.FromHours(13));
        await RefreshAsync(client, player.RefreshToken);

        // Only the renown endpoint is read: it must find the finished feast itself.
        var renown = await client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{worldId}/renown", SqliteApiFixture.StrictJson, Ct);

        Assert.True(renown!.Total >= Feasts.RenownFor(3));
    }

    [Fact]
    public async Task Dispatching_a_founding_convoy_without_enough_renown_is_refused()
    {
        using var client = Client();
        var (_, settlement, player, island) = await SetUpPlayerReadyToExpandAsync(client);
        Authorize(client, player.AccessToken);
        await TrainThreeSettlerCrewsAsync(client, settlement.Id, player.RefreshToken);

        var target = island.StartPositions[3];
        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/armies",
            new DispatchArmyRequest(
                [new UnitCountRequest("settlercrew", 3)], null,
                // 3 SettlerCrews carry at most 3 * 40 = 120 food
                // (FoodCarryCapacity); this must be the rejection under
                // test — a renown/slot gate, not carry capacity.
                new HexPointRequest(target.Q, target.R), 100, "found"),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Founding_convoy_golden_path_trains_dispatches_and_founds_a_second_settlement()
    {
        using var client = Client();
        var (worldId, settlement, player, island) = await SetUpPlayerReadyToExpandAsync(client);
        Authorize(client, player.AccessToken);

        var afterTraining = await TrainThreeSettlerCrewsAsync(client, settlement.Id, player.RefreshToken);

        // Clear the renown threshold for a 2nd settlement (feasts and buildings
        // are covered on their own above; 55 000 renown is weeks of play).
        await GrantRenownAsync(player.User.Id, RenownThresholds.RequiredFor(2));
        _factory.Time.Advance(TimeSpan.FromHours(100));
        var afterRenownWait = await RefreshAsync(client, afterTraining.RefreshToken);
        await client.GetFromJsonAsync<RenownResponse>($"/api/v1/worlds/{worldId}/renown", SqliteApiFixture.StrictJson, Ct);

        // See FindOverlandFoundingTargetAsync's remarks: the target must
        // clear 16 hexes from the founding settlement, not just its own
        // claim radius — island.StartPositions alone can sit well inside
        // that (they're curated "good building spot" tiles, clustered
        // together), so this walks the island's actual land connectivity via
        // the real /tiles terrain to find a genuinely reachable, far-enough hex,
        // rather than guessing at a coordinate.
        var target = await FindOverlandFoundingTargetAsync(client, worldId, settlement);

        var dispatch = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/armies",
            new DispatchArmyRequest(
                [new UnitCountRequest("settlercrew", 3)], null,
                // 3 SettlerCrews carry at most 3 * 40 = 120 food
                // (FoodCarryCapacity) — a higher request is rejected before
                // Found-specific validation is ever reached.
                new HexPointRequest(target.Q, target.R), 120, "found"),
            Ct);

        Assert.True(dispatch.IsSuccessStatusCode, $"dispatch was refused: {await dispatch.Content.ReadAsStringAsync(Ct)}");
        var army = await dispatch.ReadStrictAsync<ArmyResponse>(Ct);
        Assert.Equal("found", army.Mission);

        // Fast-forward well past arrival, then read the army to resolve it —
        // same lazy-resolve-on-read contract as an Attack mission's battle.
        _factory.Time.Advance(TimeSpan.FromDays(2));
        await RefreshAsync(client, afterRenownWait.RefreshToken);
        var armyAfter = await client.GetAsync($"/api/v1/armies/{army.Id}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, armyAfter.StatusCode); // consumed by founding

        var mine = await client.GetFromJsonAsync<List<SettlementSummary>>(
            $"/api/v1/worlds/{worldId}/settlements/mine", SqliteApiFixture.StrictJson, Ct);

        Assert.Equal(2, mine!.Count);
        Assert.Contains(mine, s => s.Q == target.Q && s.R == target.R);
    }
}
