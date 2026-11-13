using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Bjarnoy.TestSupport;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Settlement expansion end to end (issue #55): train settlers, accrue
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
    /// settlers require it) and grants a large resource stock so training is
    /// never blocked on cost.
    /// </summary>
    private async Task<(Guid WorldId, SettlementResponse Settlement, AuthResponse Player, FullIslandResponse Island)>
        SetUpPlayerReadyToExpandAsync(HttpClient client)
    {
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);

        var islands = await client.GetFullIslandsAsync(world.Id, Ct);
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
            // Longhouse 10: the Cart Workshop, and with it the Settler, opens at 10 (UnitCatalogue).
            new SetBuildingLevelRequest(10), Ct);
        Assert.Equal(HttpStatusCode.OK, levelResponse.StatusCode);

        var grantResponse = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/resources",
            new GrantResourcesRequest(Wood: 1_000_000, Stone: 1_000_000, Food: 1_000_000, Iron: 1_000_000), Ct);
        Assert.Equal(HttpStatusCode.OK, grantResponse.StatusCode);

        // Settler trains at a Cart Workshop (see
        // UnitCatalogue.RequiredBuildingType) — grant one before
        // TrainFiveSettlersAsync below.
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
    /// Trains exactly 5 settlers and fast-forwards the clock until the
    /// batch completes. Returns the refreshed tokens (see
    /// <see cref="RefreshAsync"/>) so a caller doing a further time-skip
    /// afterwards refreshes from the current refresh token, not a rotated-out
    /// one.
    /// </summary>
    private async Task<AuthResponse> TrainFiveSettlersAsync(HttpClient client, Guid settlementId, string refreshToken)
    {
        var current = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlementId}", SqliteApiFixture.StrictJson, Ct);
        var workshop = current!.Buildings.First(b => b.Type == "cartworkshop");
        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/units", new TrainUnitsRequest("settler", 5, workshop.Q, workshop.R), Ct);
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);

        // 5 settlers x 24 minutes each, per UnitCatalogue — well past the
        // 15-minute access token lifetime, so refresh before the next call.
        _factory.Time.Advance(TimeSpan.FromMinutes(121));
        var refreshed = await RefreshAsync(client, refreshToken);

        var settled = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlementId}", SqliteApiFixture.StrictJson, Ct);
        Assert.Contains(settled!.Garrison, g => g.Unit == "settler" && g.Count == 5);

        return refreshed;
    }

    /// <summary>Trains exactly 2 camp builders and fast-forwards until the batch completes (see <see cref="TrainFiveSettlersAsync"/>).</summary>
    private async Task<AuthResponse> TrainCampBuildersAsync(HttpClient client, Guid settlementId, string refreshToken)
    {
        var current = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlementId}", SqliteApiFixture.StrictJson, Ct);
        var workshop = current!.Buildings.First(b => b.Type == "cartworkshop");
        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/units", new TrainUnitsRequest("campbuilder", BeachCamp.RequiredBuilders, workshop.Q, workshop.R), Ct);
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);

        // 2 camp builders x 12 minutes — past the 15-minute access token lifetime together with the wait.
        _factory.Time.Advance(TimeSpan.FromMinutes(25));
        var refreshed = await RefreshAsync(client, refreshToken);

        var settled = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlementId}", SqliteApiFixture.StrictJson, Ct);
        Assert.Contains(settled!.Garrison, g => g.Unit == "campbuilder" && g.Count == BeachCamp.RequiredBuilders);
        return refreshed;
    }

    /// <summary>
    /// The closest sand hex on a shore (a sea neighbour), at least <paramref name="minDistance"/> hexes from <paramref name="settlement"/>,
    /// that a land army can walk to from it (a real BFS over the world's generated terrain) and nothing stands on yet.
    /// </summary>
    private async Task<TileCoordinate> FindSandShoreTargetAsync(
        HttpClient client, Guid worldId, SettlementResponse settlement, int minDistance = 0)
    {
        const int Window = 40;
        var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{worldId}/tiles?qMin={settlement.Q - Window}&qMax={settlement.Q + Window}" +
            $"&rMin={settlement.R - Window}&rMax={settlement.R + Window}",
            SqliteApiFixture.StrictJson, Ct);
        var terrainAt = chunk!.Tiles.ToDictionary(t => (t.Q, t.R), t => t.Terrain);
        var occupied = settlement.Buildings.Select(b => (b.Q, b.R)).ToHashSet();

        var start = (settlement.Q, settlement.R);
        var visited = new HashSet<(int Q, int R)> { start };
        var queue = new Queue<(int Q, int R)>();
        queue.Enqueue(start);
        while (queue.Count > 0)
        {
            var (q, r) = queue.Dequeue();
            if (terrainAt[(q, r)] == "sand" && !occupied.Contains((q, r))
                && HexDistance(settlement.Q, settlement.R, q, r) >= minDistance
                && AxialNeighbourOffsets.Any(o => terrainAt.TryGetValue((q + o.Dq, r + o.Dr), out var t) && t == "sea"))
            {
                return new TileCoordinate(q, r);
            }

            foreach (var o in AxialNeighbourOffsets)
            {
                var next = (Q: q + o.Dq, R: r + o.Dr);
                if (visited.Contains(next) || !terrainAt.TryGetValue(next, out var terrain) || terrain is "sea" or "lake")
                {
                    continue;
                }

                visited.Add(next);
                queue.Enqueue(next);
            }
        }

        Assert.Fail("No sand shore hex is reachable overland within the sampled window.");
        return default!;
    }

    /// <summary>
    /// Trains the camp builders and dispatches them (with food for the trip and the build wait) at the closest free sand shore at
    /// least <paramref name="siteMinDistance"/> hexes away (far enough, and the camp stands alone instead of joining the home realm).
    /// </summary>
    private async Task<(Guid WorldId, SettlementResponse Settlement, AuthResponse Player, TileCoordinate Site, ArmyResponse Army, AuthResponse Tokens,
        SettlementResponse Before, SettlementResponse After)>
        DispatchCampBuildersAsync(HttpClient client, int siteMinDistance = 0)
    {
        var (worldId, settlement, player, _) = await SetUpPlayerReadyToExpandAsync(client);
        Authorize(client, player.AccessToken);
        var tokens = await TrainCampBuildersAsync(client, settlement.Id, player.RefreshToken);
        var site = await FindSandShoreTargetAsync(client, worldId, settlement, siteMinDistance);
        var before = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);

        var dispatch = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/armies",
            new DispatchArmyRequest(
                [new(settlement.Spot(), [new UnitCountRequest("campbuilder", BeachCamp.RequiredBuilders)])], null, new HexPointRequest(site.Q, site.R), 80, "setupcamp"),
            Ct);
        Assert.True(dispatch.IsSuccessStatusCode, $"dispatch was refused: {await dispatch.Content.ReadAsStringAsync(Ct)}");
        var army = await dispatch.ReadStrictAsync<ArmyResponse>(Ct);
        var after = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        return (worldId, settlement, player, site, army, tokens, before!, after!);
    }

    [Fact]
    public async Task The_unit_catalogue_includes_the_settler()
    {
        using var client = Client();

        var catalogue = await client.GetFromJsonAsync<List<UnitDefinitionResponse>>(
            "/api/v1/units", SqliteApiFixture.StrictJson, Ct);

        Assert.Contains(catalogue!, u => u.Type == "settler" && u.Class == "civilian");
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
        Assert.Equal(80_000, renown.RequiredForNextSettlement);
        Assert.False(renown.CanFoundAnother);
    }

    [Fact]
    public async Task A_beach_camp_does_not_count_towards_the_renown_settlement_limit()
    {
        using var client = Client();
        var (worldId, _, player, _) = await SetUpPlayerReadyToExpandAsync(client);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var home = await db.Settlements.AsNoTracking().SingleAsync(s => s.WorldId == worldId, Ct);
            var camp = new SettlementEntity
            {
                WorldId = worldId,
                IslandId = home.IslandId,
                UserId = home.UserId,
                Name = "Strandlager",
                OwnerName = home.OwnerName,
                OwnerId = home.OwnerId,
                CentreQ = home.CentreQ + 40,
                CentreR = home.CentreR,
                FoundedAt = home.FoundedAt,
            };
            camp.Buildings.Add(new PlacedBuildingEntity { Q = camp.CentreQ, R = camp.CentreR, Type = BuildingType.BeachCamp, Level = 1 });
            db.Settlements.Add(camp);
            await db.SaveChangesAsync(Ct);
        }

        Authorize(client, player.AccessToken);
        var renown = await client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{worldId}/renown", SqliteApiFixture.StrictJson, Ct);

        Assert.Equal(1, renown!.SettlementCount);
        Assert.Equal(RenownThresholds.RequiredFor(2), renown.RequiredForNextSettlement);

        // The settlement list says which row is the camp: the flag, not the missing Longhouse level, tells.
        var mine = await client.GetFromJsonAsync<List<SettlementSummary>>(
            $"/api/v1/worlds/{worldId}/settlements/mine", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(2, mine!.Count);
        Assert.True(mine.Single(r => r.Name == "Strandlager").IsBeachCamp);
        Assert.False(mine.Single(r => r.Name != "Strandlager").IsBeachCamp);
    }

    [Fact]
    public async Task Renown_accrues_over_time_from_building_levels_but_buildings_alone_do_not_reach_the_second_settlement_soon()
    {
        using var client = Client();
        var (worldId, _, player, _) = await SetUpPlayerReadyToExpandAsync(client);
        Authorize(client, player.AccessToken);

        // Longhouse level 10 + a Cart Workshop => 11 renown/hour; 100 hours is
        // about a thousand renown, nowhere near the 80 000 the 2nd settlement needs.
        _factory.Time.Advance(TimeSpan.FromHours(100));
        await RefreshAsync(client, player.RefreshToken);

        var renown = await client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{worldId}/renown", SqliteApiFixture.StrictJson, Ct);

        Assert.True(renown!.Total >= 500);
        Assert.True(renown.Total < 80_000);
        Assert.False(renown.CanFoundAnother);
    }

    [Theory]
    [InlineData(true, 5.0)]
    [InlineData(false, 1.0)]
    public async Task Renown_hourly_rate_follows_the_world_speed_only_when_the_world_flag_is_on(bool followsSpeed, double expectedFactor)
    {
        using var client = Client();
        var (worldId, settlement, player, _) = await SetUpPlayerReadyToExpandAsync(client);
        var adminToken = await CreateAdminTokenAsync(client);

        var current = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        var levels = current!.Buildings.Sum(b => b.Level);

        Authorize(client, adminToken);
        var patched = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{worldId}/settings",
            new UpdateWorldSettingsRequest { SpeedFactor = 5.0, RenownFollowsSpeed = followsSpeed },
            Ct);
        Assert.Equal(HttpStatusCode.OK, patched.StatusCode);
        Assert.Equal(followsSpeed, (await patched.ReadStrictAsync<AdminWorldResponse>(Ct)).RenownFollowsSpeed);

        Authorize(client, player.AccessToken);
        var renown = await client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{worldId}/renown", SqliteApiFixture.StrictJson, Ct);

        Assert.Equal(levels * RenownAccount.PointsPerLevelPerHour * expectedFactor, renown!.PerHour);
    }

    [Fact]
    public async Task A_new_world_does_not_let_renown_follow_the_world_speed()
    {
        using var client = Client();
        var (worldId, _, _, _) = await SetUpPlayerReadyToExpandAsync(client);
        var adminToken = await CreateAdminTokenAsync(client);

        Authorize(client, adminToken);
        var worlds = await client.GetFromJsonAsync<List<AdminWorldResponse>>(
            "/api/v1/admin/worlds", SqliteApiFixture.StrictJson, Ct);

        Assert.False(worlds!.Single(w => w.Id == worldId).RenownFollowsSpeed);
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
        await TrainFiveSettlersAsync(client, settlement.Id, player.RefreshToken);

        var target = island.StartPositions[3];
        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/armies",
            new DispatchArmyRequest([new(settlement.Spot(), [new UnitCountRequest("settler", 5)])], null,
                // 5 Settlers carry at most 5 * 40 = 200 food
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

        var afterTraining = await TrainFiveSettlersAsync(client, settlement.Id, player.RefreshToken);

        // Clear the renown threshold for a 2nd settlement (feasts and buildings
        // are covered on their own above; 80 000 renown is weeks of play).
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
            new DispatchArmyRequest([new(settlement.Spot(), [new UnitCountRequest("settler", 5)])], null,
                // 5 Settlers carry at most 5 * 40 = 200 food
                // (FoodCarryCapacity) — a higher request is rejected before
                // Found-specific validation is ever reached.
                new HexPointRequest(target.Q, target.R), 200, "found"),
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
    [Fact]
    public async Task The_unit_catalogue_includes_the_camp_builder_at_its_flat_price()
    {
        using var client = Client();

        var catalogue = await client.GetFromJsonAsync<List<UnitDefinitionResponse>>(
            "/api/v1/units", SqliteApiFixture.StrictJson, Ct);

        var builder = Assert.Single(catalogue!, u => u.Type == "campbuilder");
        Assert.Equal("civilian", builder.Class);
        Assert.Equal(80, builder.TrainingCost.Wood);
        Assert.Equal(40, builder.TrainingCost.Stone);
        Assert.Equal(40, builder.TrainingCost.Food);
        Assert.Equal(20, builder.TrainingCost.Iron);
    }

    [Fact]
    public async Task Dispatching_camp_builders_charges_the_camp_cost_from_the_launching_settlement()
    {
        using var client = Client();
        var (_, settlement, player, site, army, _, before, after) = await DispatchCampBuildersAsync(client);

        Assert.Equal("setupcamp", army.Mission);
        // 200 wood and 100 brick left the stock (80 food went with the army as provisions).
        Assert.InRange(before.Resources.Stock.Wood - after.Resources.Stock.Wood, 199, 201);
        Assert.InRange(before.Resources.Stock.Stone - after.Resources.Stock.Stone, 99, 101);
        Assert.InRange(before.Resources.Stock.Food - after.Resources.Stock.Food, 79, 81);
        Assert.Equal(site.Q, army.Movement!.Path[^1].Q);
        Assert.Equal(site.R, army.Movement.Path[^1].R);

        // The cost sits in the army's loot (not in the stock): the whole 200 wood / 100 brick, and the builders left the garrison.
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var entity = await db.Armies.AsNoTracking().Include(a => a.Stacks).SingleAsync(a => a.Id == army.Id, Ct);
        Assert.Equal(BeachCamp.Cost, entity.ToDomain().Loot);
        var home = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.DoesNotContain(home!.Garrison, g => g.Unit == "campbuilder");
        Assert.NotNull(player);
    }

    [Fact]
    public async Task A_camp_dispatch_with_one_builder_is_refused()
    {
        using var client = Client();
        var (_, settlement, player, _) = await SetUpPlayerReadyToExpandAsync(client);
        Authorize(client, player.AccessToken);
        await TrainCampBuildersAsync(client, settlement.Id, player.RefreshToken);
        var site = await FindSandShoreTargetAsync(client, settlement.WorldId, settlement);

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/armies",
            new DispatchArmyRequest([new(settlement.Spot(), [new UnitCountRequest("campbuilder", 1)])], null, new HexPointRequest(site.Q, site.R), 40, "setupcamp"),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("WrongCampBuilderCount", await response.Content.ReadAsStringAsync(Ct));
    }

    /// <summary>Game hours the camp army walks to its site, from the dispatch response.</summary>
    private static TimeSpan OutboundTime(ArmyResponse army) => army.Movement!.ArrivesAt - army.Movement.DepartedAt;

    /// <summary>Far enough from the home settlement that a camp there does not touch its realm (the biggest claim radius plus the touching ring).</summary>
    private static readonly int UnlinkedSiteDistance = Settlement.MaxClaimRadius + 3;

    private async Task<int> SettlementCountAsync(Guid worldId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<GameDbContext>().Settlements.CountAsync(s => s.WorldId == worldId, Ct);
    }

    private async Task<List<SettlementSummary>> MySettlementsAsync(HttpClient client, Guid worldId) =>
        (await client.GetFromJsonAsync<List<SettlementSummary>>(
            $"/api/v1/worlds/{worldId}/settlements/mine", SqliteApiFixture.StrictJson, Ct))!;

    [Fact]
    public async Task Camp_builders_standing_on_their_site_for_the_build_time_set_up_a_camp_with_the_troops_and_the_leftover_food()
    {
        using var client = Client();
        var (worldId, home, _, site, army, tokens, _, _) = await DispatchCampBuildersAsync(client, siteMinDistance: UnlinkedSiteDistance);
        var outbound = OutboundTime(army);

        // Arrived, but the camp is not up yet: the army still stands on the site and no settlement exists.
        _factory.Time.Advance(outbound + TimeSpan.FromMinutes(5));
        tokens = await RefreshAsync(client, tokens.RefreshToken);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/armies/{army.Id}", Ct)).StatusCode);
        Assert.Equal(1, await SettlementCountAsync(worldId));

        // Arrival plus the 10 minute build time: the camp is up and the army is consumed.
        _factory.Time.Advance(TimeSpan.FromMinutes(6));
        await RefreshAsync(client, tokens.RefreshToken);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/armies/{army.Id}", Ct)).StatusCode);

        var mine = await MySettlementsAsync(client, worldId);
        Assert.Equal(2, mine.Count);
        var summary = Assert.Single(mine, s => s.Q == site.Q && s.R == site.R);
        Assert.Equal(0, summary.LonghouseLevel);

        var camp = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{summary.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal($"{home.OwnerName}'s Camp", camp!.Name);
        var centre = Assert.Single(camp.Buildings);
        Assert.Equal("beachcamp", centre.Type);
        Assert.Equal((site.Q, site.R), (centre.Q, centre.R));
        // The two builders are used up; nothing else came along.
        Assert.Empty(camp.Garrison);

        // The camp's food is what the army had left when the camp was finished: what it set out with, minus what it ate on the
        // way out and while the camp was built. The 200 wood / 100 brick were spent on the camp, not deposited.
        var upkeep = army.TotalUpkeepPerHour;
        var expectedFood = army.Provisions - upkeep * (outbound + BeachCamp.BuildDuration).TotalHours;
        Assert.InRange(camp.Resources.Stock.Food, expectedFood - 1, expectedFood + 1);
        Assert.Equal(0, camp.Resources.Stock.Wood);
        Assert.Equal(0, camp.Resources.Stock.Stone);
    }

    [Fact]
    public async Task A_beach_camps_food_pile_is_capped_at_two_thousand()
    {
        using var client = Client();
        var (worldId, home, _, _, _, _, _, _) = await DispatchCampBuildersAsync(client);
        // Far from the home realm, so the camp keeps a stock of its own.
        var site = new HexCoord(home.Q + 40, home.R);

        await using var scope = _factory.Services.CreateAsyncScope();
        var settlements = scope.ServiceProvider.GetRequiredService<SettlementService>();
        var owner = await scope.ServiceProvider.GetRequiredService<GameDbContext>().Settlements.AsNoTracking().SingleAsync(s => s.Id == home.Id, Ct);

        var camp = await settlements.FoundCampFromConvoyAsync(
            worldId, site, owner.UserId, owner.OwnerName, owner.OwnerId, "Camp", [], food: 5_000, _factory.Time.GetUtcNow(), Ct);

        Assert.Equal(BuildingCatalogue.BeachCampStorage, camp.ToDomain().Resources.At(_factory.Time.GetUtcNow()).Food);
    }

    [Fact]
    public async Task A_camp_touching_the_players_realm_joins_it_like_any_settlement_and_shares_its_stock()
    {
        using var client = Client();
        var (worldId, home, _, site, army, tokens, _, _) = await DispatchCampBuildersAsync(client);

        _factory.Time.Advance(OutboundTime(army) + BeachCamp.BuildDuration + TimeSpan.FromMinutes(1));
        await RefreshAsync(client, tokens.RefreshToken);
        // Reading the army settles it (lazy resolve on read).
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/armies/{army.Id}", Ct)).StatusCode);

        Assert.Equal(2, await SettlementCountAsync(worldId));
        await using var scope = _factory.Services.CreateAsyncScope();
        var campId = await scope.ServiceProvider.GetRequiredService<GameDbContext>().Settlements.AsNoTracking()
            .Where(s => s.WorldId == worldId && s.CentreQ == site.Q && s.CentreR == site.R).Select(s => s.Id).SingleAsync(Ct);
        var camp = await client.GetFromJsonAsync<SettlementResponse>($"/api/v1/settlements/{campId}", SqliteApiFixture.StrictJson, Ct);

        Assert.Equal(home.Id, camp!.RealmId);
        Assert.Equal(2, camp.LinkedMemberIds.Count);
        // One entry in the realm switcher: the oldest member's.
        Assert.Single(await MySettlementsAsync(client, worldId));
    }

    /// <summary>The army is gone, no camp stands, the builders are home again and the camp's cost is back in the stock.</summary>
    private async Task AssertCampCancelledAndCostHomeAsync(
        HttpClient client, Guid worldId, SettlementResponse home, ArmyResponse army, SettlementResponse afterDispatch)
    {
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/armies/{army.Id}", Ct)).StatusCode);
        Assert.Equal(1, await SettlementCountAsync(worldId));

        var back = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{home.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Contains(back!.Garrison, g => g.Unit == "campbuilder" && g.Count == BeachCamp.RequiredBuilders);
        // Production only adds to the stock and the storage cap only clamps it, so "the 200 / 100 are back" holds either way.
        Assert.True(back.Resources.Stock.Wood >= afterDispatch.Resources.Stock.Wood + 199, "the 200 wood did not come home");
        Assert.True(back.Resources.Stock.Stone >= afterDispatch.Resources.Stock.Stone + 99, "the 100 brick did not come home");
    }

    [Fact]
    public async Task A_camp_site_taken_while_the_army_stands_there_means_no_camp_and_the_army_brings_the_cost_home()
    {
        using var client = Client();
        var (worldId, home, _, site, army, tokens, _, afterDispatch) = await DispatchCampBuildersAsync(client);

        // Someone builds on the hex before the camp is up.
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var owner = await db.Settlements.SingleAsync(s => s.Id == home.Id, Ct);
            owner.Buildings.Add(new PlacedBuildingEntity { Q = site.Q, R = site.R, Type = BuildingType.Farm, Level = 1 });
            await db.SaveChangesAsync(Ct);
        }

        _factory.Time.Advance(OutboundTime(army) + TimeSpan.FromMinutes(11));
        tokens = await RefreshAsync(client, tokens.RefreshToken);
        var standing = await client.GetAsync($"/api/v1/armies/{army.Id}", Ct);
        Assert.Equal(HttpStatusCode.OK, standing.StatusCode);
        Assert.Equal(1, await SettlementCountAsync(worldId));
        // The shore was not free at completion: the army was recalled as of then, so it is returning (never builds later).
        Assert.True((await standing.ReadStrictAsync<ArmyResponse>(Ct)).Movement!.IsReturning);

        // The site frees up again: still no camp, the army just comes home.
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            db.PlacedBuildings.RemoveRange(db.PlacedBuildings.Where(b => b.Q == site.Q && b.R == site.R));
            await db.SaveChangesAsync(Ct);
        }

        _factory.Time.Advance(TimeSpan.FromDays(10));
        await RefreshAsync(client, tokens.RefreshToken);

        await AssertCampCancelledAndCostHomeAsync(client, worldId, home, army, afterDispatch);
    }

    [Fact]
    public async Task Recalling_the_army_during_the_build_cancels_the_camp_and_the_cost_comes_home()
    {
        using var client = Client();
        var (worldId, home, _, _, army, tokens, _, afterDispatch) = await DispatchCampBuildersAsync(client);

        _factory.Time.Advance(OutboundTime(army) + TimeSpan.FromMinutes(4));
        tokens = await RefreshAsync(client, tokens.RefreshToken);
        var recalled = await client.PostAsync($"/api/v1/armies/{army.Id}/recall", null, Ct);
        Assert.True(recalled.IsSuccessStatusCode, await recalled.Content.ReadAsStringAsync(Ct));

        // Well past arrival plus the build time and the way home: the recalled army never builds.
        _factory.Time.Advance(TimeSpan.FromDays(10));
        await RefreshAsync(client, tokens.RefreshToken);

        await AssertCampCancelledAndCostHomeAsync(client, worldId, home, army, afterDispatch);
    }
}
