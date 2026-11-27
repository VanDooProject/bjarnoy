using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Bjarnoy.Infrastructure.World;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Bjarnoy.TestSupport;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The movement rules at the API: wide rivers and mountains stop a land army, so a dispatch with no
/// land route is refused with a clear 409 instead of being planned across them.
/// </summary>
public sealed class ArmyMovementRulesEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    [Fact]
    public async Task A_dispatch_to_a_target_walled_in_by_wide_rivers_is_refused_with_a_no_land_route_message()
    {
        using var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFullIslandsAsync(world.Id, Ct);
        var island = islands!.Where(i => i.StartPositions.Count > 3).OrderByDescending(i => i.TileCount).First();
        var plot = island.StartPositions[0];

        var ownerId = Unique("local-owner-");
        var settlement = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);
        var player = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("ulf-"), "correct-horse-battery", ownerId), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);

        // An admin puts spearmen straight into the garrison.
        var adminName = Unique("admin");
        var admin = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(adminName, "correct-horse-battery"), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            (await db.Users.SingleAsync(u => u.Id == admin.User.Id, Ct)).Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var adminToken = (await (await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(adminName, "correct-horse-battery"), Ct))
            .ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
        Authorize(client, adminToken);
        var granted = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/garrison", new AdjustGarrisonRequest("spearman", settlement.Spot(), 5), Ct);
        Assert.Equal(HttpStatusCode.OK, granted.StatusCode);
        Authorize(client, player.AccessToken);

        var target = await FindWalkableTargetAsync(client, world.Id, settlement);
        DispatchArmyRequest ToTarget() => new([new(settlement.Spot(), [new UnitCountRequest("spearman", 1)])], null, new HexPointRequest(target.Q, target.R), 10);

        // Control: the target is reachable until it is walled in.
        var control = await client.PostJsonAsync($"/api/v1/settlements/{settlement.Id}/armies", ToTarget(), Ct);
        Assert.True(control.IsSuccessStatusCode, await control.Content.ReadAsStringAsync(Ct));

        // A ring of wide rivers (river width in and out) around the target.
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var entity = await db.Islands.SingleAsync(i => i.Id == island.Id, Ct);
            var ring = new HexCoord(target.Q, target.R).Neighbours()
                .Select(n => new RiverTileRecord(n.Q, n.R, (int)RiverTileShape.Straight, [(int)TileOrientation.W], (int)TileOrientation.E));
            entity.RiverTiles = [.. entity.RiverTiles, .. ring];
            await db.SaveChangesAsync(Ct);
        }

        // The world's river index is cached; the islands were edited behind its back.
        WorldIslandCaches.Invalidate(world.Id);

        var refused = await client.PostJsonAsync($"/api/v1/settlements/{settlement.Id}/armies", ToTarget(), Ct);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        var problem = await refused.Content.ReadFromJsonAsync<ProblemDetails>(SqliteApiFixture.StrictJson, Ct);
        Assert.Equal("No land route: mountains and wide rivers can't be crossed.", problem!.Detail);
        Assert.Equal("UnreachableLeg", problem.Extensions["rejection"]?.ToString());
    }

    [Fact]
    public async Task A_dispatch_with_more_than_five_waypoints_is_refused_for_a_free_account()
    {
        using var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFullIslandsAsync(world.Id, Ct);
        var island = islands!.Where(i => i.StartPositions.Count > 3).OrderByDescending(i => i.TileCount).First();
        var plot = island.StartPositions[0];

        var ownerId = Unique("local-owner-");
        var settlement = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);
        var player = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("ulf-"), "correct-horse-battery", ownerId), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        Authorize(client, player.AccessToken);

        // The cap is checked before anything is planned, so the waypoints need not be walkable.
        var waypoints = Enumerable.Range(1, 6).Select(i => new HexPointRequest(plot.Q + i, plot.R)).ToList();
        var refused = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/armies",
            new DispatchArmyRequest([new(settlement.Spot(), [new UnitCountRequest("spearman", 1)])], waypoints, new HexPointRequest(plot.Q + 8, plot.R), 10),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        var problem = await refused.Content.ReadFromJsonAsync<ProblemDetails>(SqliteApiFixture.StrictJson, Ct);
        Assert.Equal("TooManyWaypoints", problem!.Extensions["rejection"]?.ToString());
        Assert.Equal("Too many waypoints: an order takes at most 5, or 10 with premium.", problem.Detail);
    }

    [Fact]
    public async Task A_waypoint_on_unexplored_water_is_snapped_to_the_shore_but_one_on_explored_water_is_refused()
    {
        using var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFullIslandsAsync(world.Id, Ct);
        var island = islands!.Where(i => i.StartPositions.Count > 3).OrderByDescending(i => i.TileCount).First();
        var plot = island.StartPositions[0];

        var ownerId = Unique("local-owner-");
        var settlement = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);
        var player = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("ulf-"), "correct-horse-battery", ownerId), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        var adminName = Unique("admin");
        var admin = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(adminName, "correct-horse-battery"), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            (await db.Users.SingleAsync(u => u.Id == admin.User.Id, Ct)).Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var adminToken = (await (await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(adminName, "correct-horse-battery"), Ct))
            .ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
        Authorize(client, adminToken);
        var granted = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/garrison", new AdjustGarrisonRequest("spearman", settlement.Spot(), 5), Ct);
        Assert.Equal(HttpStatusCode.OK, granted.StatusCode);
        Authorize(client, player.AccessToken);

        // Water hexes around the settlement, split by what the player has explored: the nearest unexplored one that touches land (a click
        // into the fog), and the nearest explored one.
        var start = new HexCoord(settlement.Q, settlement.R);
        HexCoord unexploredWater;
        HexCoord exploredWater;
        Func<HexCoord, bool> isLand;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var worldEntity = await db.Worlds.SingleAsync(w => w.Id == world.Id, Ct);
            var sampler = await WorldTerrain.SamplerAsync(db, worldEntity, Ct);
            isLand = hex => sampler.TerrainAt(hex).IsLand();

            var coastalWater = start.WithinRadius(40)
                .Where(hex => !isLand(hex) && hex.Neighbours().Any(isLand))
                .OrderBy(hex => hex.DistanceTo(start)).ThenBy(hex => hex.Q).ThenBy(hex => hex.R)
                .ToList();
            var exploredService = scope.ServiceProvider.GetRequiredService<ExploredAreaService>();
            var area = await exploredService.GetAsync(world.Id, ownerId, persist: false, Ct);
            var explored = await exploredService.ExploredAmongAsync(area!, coastalWater, Ct);
            unexploredWater = coastalWater.First(hex => !explored.Contains(hex));
            exploredWater = coastalWater.First(explored.Contains);
        }

        var target = await FindWalkableTargetAsync(client, world.Id, settlement);
        DispatchArmyRequest Via(HexCoord waypoint) => new(
            [new(settlement.Spot(), [new UnitCountRequest("spearman", 5)])],
            [new HexPointRequest(waypoint.Q, waypoint.R)], new HexPointRequest(target.Q, target.R), 100);

        var refused = await client.PostJsonAsync($"/api/v1/settlements/{settlement.Id}/armies", Via(exploredWater), Ct);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        var problem = await refused.Content.ReadFromJsonAsync<ProblemDetails>(SqliteApiFixture.StrictJson, Ct);
        Assert.Equal("WaypointNotLand", problem!.Extensions["rejection"]?.ToString());

        var accepted = await client.PostJsonAsync($"/api/v1/settlements/{settlement.Id}/armies", Via(unexploredWater), Ct);
        Assert.True(accepted.IsSuccessStatusCode, await accepted.Content.ReadAsStringAsync(Ct));
        var army = await accepted.Content.ReadFromJsonAsync<ArmyResponse>(SqliteApiFixture.StrictJson, Ct);
        var path = army!.Movement!.Path.Select(p => new HexCoord(p.Q, p.R)).ToList();
        Assert.DoesNotContain(unexploredWater, path);
        Assert.All(path, hex => Assert.True(isLand(hex), $"{hex} is not land"));
        Assert.Equal(new HexCoord(target.Q, target.R), path[^1]);
        Assert.Equal(start, path[0]);
    }

    /// <summary>
    /// A river-free grass/sand/forest hex 4-6 hexes from the settlement, reachable from it in at most 10
    /// steps, whose six neighbours are all plain land too, so a river ring around it is the only thing
    /// that can wall it in.
    /// </summary>
    private async Task<TileCoordinate> FindWalkableTargetAsync(HttpClient client, Guid worldId, SettlementResponse settlement)
    {
        const int Window = 12;
        var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{worldId}/tiles?qMin={settlement.Q - Window}&qMax={settlement.Q + Window}" +
            $"&rMin={settlement.R - Window}&rMax={settlement.R + Window}",
            SqliteApiFixture.StrictJson, Ct);
        var terrain = chunk!.Tiles.ToDictionary(t => new HexCoord(t.Q, t.R), t => t.Terrain);
        var start = new HexCoord(settlement.Q, settlement.R);

        // Reachable, not just plain: the island's rivers are generated, and a wide one between the settlement and an otherwise plain hex
        // makes the control dispatch below fail for a reason that has nothing to do with the ring. So the target is checked with the
        // server's own sampler, river index and pathfinder.
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var worldEntity = await db.Worlds.SingleAsync(w => w.Id == worldId, Ct);
        var sampler = await WorldTerrain.SamplerAsync(db, worldEntity, Ct);
        var rivers = await WorldRivers.IndexAsync(db, worldId, Ct);

        bool Plain(HexCoord c) => terrain.TryGetValue(c, out var t) && t is "grass" or "sand" or "forest" && !rivers.IsRiver(c);

        foreach (var candidate in terrain.Keys.OrderBy(c => c.DistanceTo(start)).ThenBy(c => c.Q).ThenBy(c => c.R))
        {
            var distance = candidate.DistanceTo(start);
            if (distance is >= 4 and <= 6 && Plain(candidate) && candidate.Neighbours().All(Plain) &&
                HexPathfinder.FindPath(start, candidate, sampler.TerrainAt, true, rivers.IsRiver, rivers.IsWide) is { Count: <= 10 })
            {
                return new TileCoordinate(candidate.Q, candidate.R);
            }
        }

        throw new InvalidOperationException("No fully-land, reachable target hex found near the settlement; widen the search or change the seed.");
    }
}
