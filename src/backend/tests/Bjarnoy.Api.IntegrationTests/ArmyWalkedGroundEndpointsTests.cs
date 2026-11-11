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
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Ground a travelling army walks is explored for good even when nobody polls the fog while it is on the road
/// (server restart, closed browser): every hex it crossed is saved, also once its leg has ended.
/// </summary>
public sealed class ArmyWalkedGroundEndpointsTests : IAsyncLifetime
{
    // Far enough from home that the settlement's own explored ring never covers the walked hexes being asserted.
    private const int HomeSafeDistance = 9;
    private const string Password = "correct-horse-battery";

    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private sealed record Scene(Guid WorldId, SettlementResponse Settlement, string OwnerId, string UserName, HttpClient Client);

    private async Task<Scene> DispatchedSceneAsync()
    {
        var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.Where(i => i.StartPositions.Count > 3).OrderByDescending(i => i.TileCount).First();
        var plot = island.StartPositions[0];

        var ownerId = Unique("local-owner-");
        var settlement = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);
        var userName = Unique("ulf-");
        var player = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, Password, ownerId), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);

        var adminName = Unique("admin");
        var admin = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(adminName, Password), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            (await db.Users.SingleAsync(u => u.Id == admin.User.Id, Ct)).Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        await LoginAsync(client, adminName);
        var granted = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/garrison", new AdjustGarrisonRequest("spearman", settlement.Spot(), 5), Ct);
        Assert.Equal(HttpStatusCode.OK, granted.StatusCode);
        granted = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/garrison", new AdjustGarrisonRequest("provisioner", settlement.Spot(), 5), Ct);
        Assert.Equal(HttpStatusCode.OK, granted.StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", player.AccessToken);

        var target = await FindFarTargetAsync(client, world.Id, settlement);
        var dispatched = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/armies",
            new DispatchArmyRequest([new(settlement.Spot(), [new UnitCountRequest("spearman", 5), new UnitCountRequest("provisioner", 5)])], null,
                new HexPointRequest(target.Q, target.R), 150), Ct);
        Assert.True(dispatched.IsSuccessStatusCode, await dispatched.Content.ReadAsStringAsync(Ct));

        return new Scene(world.Id, settlement, ownerId, userName, client);
    }

    private static async Task LoginAsync(HttpClient client, string userName)
    {
        var login = await (await client.PostJsonAsync("/api/v1/auth/login", new LoginRequest(userName, Password), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);
    }

    private async Task<TileCoordinate> FindFarTargetAsync(HttpClient client, Guid worldId, SettlementResponse settlement)
    {
        const int Window = 16;
        var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{worldId}/tiles?qMin={settlement.Q - Window}&qMax={settlement.Q + Window}" +
            $"&rMin={settlement.R - Window}&rMax={settlement.R + Window}",
            SqliteApiFixture.StrictJson, Ct);
        var terrain = chunk!.Tiles.ToDictionary(t => new HexCoord(t.Q, t.R), t => t.Terrain);
        var start = new HexCoord(settlement.Q, settlement.R);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var worldEntity = await db.Worlds.SingleAsync(w => w.Id == worldId, Ct);
        var sampler = await WorldTerrain.SamplerAsync(db, worldEntity, Ct);
        var rivers = await WorldRivers.IndexAsync(db, worldId, Ct);

        foreach (var candidate in terrain.Keys.OrderBy(c => c.DistanceTo(start)).ThenBy(c => c.Q).ThenBy(c => c.R))
        {
            var distance = candidate.DistanceTo(start);
            if (distance is >= HomeSafeDistance + 3 and <= HomeSafeDistance + 8
                && terrain[candidate] is "grass" or "sand" or "forest" && !rivers.IsRiver(candidate)
                && HexPathfinder.FindPath(start, candidate, sampler.TerrainAt, true, rivers.IsRiver, rivers.IsWide) is { Count: >= HomeSafeDistance + 6 and <= 24 })
            {
                return new TileCoordinate(candidate.Q, candidate.R);
            }
        }

        throw new InvalidOperationException("No reachable far target hex found near the settlement; widen the search or change the seed.");
    }

    private async Task<ArmyEntity> LoadArmyAsync(Guid settlementId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.Armies.AsNoTracking().SingleAsync(a => a.SettlementId == settlementId, Ct);
    }

    /// <summary>Moves the test clock to the instant the army has crossed into <c>Path[index]</c> (wall time equals game time here).</summary>
    private void AdvanceToHexIndex(ArmyEntity army, int index)
    {
        var target = army.DepartedAt + TimeSpan.FromHours(army.EdgeHours[index]) + TimeSpan.FromSeconds(1);
        _factory.Time.Advance(target - _factory.Time.GetUtcNow());
    }

    /// <summary>The hexes among <paramref name="hexes"/> that lie beyond the settlement's own explored ring and are not persisted as explored.</summary>
    private async Task<List<HexCoord>> UnexploredFarHexesAsync(Scene scene, IEnumerable<HexCoord> hexes)
    {
        var home = new HexCoord(scene.Settlement.Q, scene.Settlement.R);
        var far = hexes.Where(h => h.DistanceTo(home) > HomeSafeDistance - 3).Distinct().ToList();
        Assert.NotEmpty(far);

        await using var dbScope = _factory.Services.CreateAsyncScope();
        var db = dbScope.ServiceProvider.GetRequiredService<GameDbContext>();
        var rows = await db.PlayerExploredChunks.AsNoTracking()
            .Where(c => c.WorldId == scene.WorldId && c.OwnerId == scene.OwnerId).ToListAsync(Ct);
        var byChunk = rows.ToDictionary(r => new FogChunkCoord(r.ChunkU, r.ChunkV), r => new ExploredChunkData(r.Bits, r.IsFull));

        return [.. far.Where(h => !byChunk.TryGetValue(FogChunkLayout.ChunkOf(h), out var data)
            || !PersistedExploredBitset.Contains(FogChunkLayout.ChunkOf(h), data, h))];
    }

    private async Task PollFogAsync(Scene scene)
    {
        var home = FogChunkLayout.ChunkOf(new HexCoord(scene.Settlement.Q, scene.Settlement.R));
        var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/v1/worlds/{scene.WorldId}/fog-chunks?cuMin={home.U}&cuMax={home.U}&cvMin={home.V}&cvMax={home.V}");
        await LoginAsync(scene.Client, scene.UserName);
        Assert.Equal(HttpStatusCode.OK, (await scene.Client.SendAsync(request, Ct)).StatusCode);
    }

    [Fact]
    public async Task A_late_fog_read_still_explores_every_hex_the_army_crossed_since_the_last_one()
    {
        var scene = await DispatchedSceneAsync();
        var army = await LoadArmyAsync(scene.Settlement.Id);
        var reached = army.Path.Count - 2;
        AdvanceToHexIndex(army, reached);

        await PollFogAsync(scene);

        var walked = army.Path.Take(reached + 1).Select(p => new HexCoord(p.Q, p.R));
        Assert.Empty(await UnexploredFarHexesAsync(scene, walked));
    }

    [Fact]
    public async Task A_recalled_army_keeps_the_ground_it_walked_before_turning_back_without_any_fog_read()
    {
        var scene = await DispatchedSceneAsync();
        var army = await LoadArmyAsync(scene.Settlement.Id);
        var reached = army.Path.Count - 2;
        AdvanceToHexIndex(army, reached);
        await LoginAsync(scene.Client, scene.UserName);

        var recalled = await scene.Client.PostAsync($"/api/v1/armies/{army.Id}/recall", null, Ct);
        Assert.True(recalled.IsSuccessStatusCode, await recalled.Content.ReadAsStringAsync(Ct));

        var walked = army.Path.Take(reached + 1).Select(p => new HexCoord(p.Q, p.R));
        Assert.Empty(await UnexploredFarHexesAsync(scene, walked));
    }

    [Fact]
    public async Task A_full_round_trip_settled_after_the_army_is_home_leaves_the_whole_route_explored()
    {
        var scene = await DispatchedSceneAsync();
        var army = await LoadArmyAsync(scene.Settlement.Id);

        // Out, turn around on provisions, back home: no fog read at any point, one settle at the very end.
        var homeAgain = army.TurnAroundAt + TimeSpan.FromHours(army.ReturnCumulativeHours[^1]) + TimeSpan.FromHours(1);
        _factory.Time.Advance(homeAgain - _factory.Time.GetUtcNow());
        await LoginAsync(scene.Client, scene.UserName);
        var settled = await scene.Client.GetAsync($"/api/v1/armies/{army.Id}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, settled.StatusCode);

        var route = army.Path.Concat(army.ReturnPath).Select(p => new HexCoord(p.Q, p.R));
        Assert.Empty(await UnexploredFarHexesAsync(scene, route));
    }

    [Fact]
    public async Task A_fog_read_in_a_paused_world_explores_only_what_the_army_reached_in_game_time()
    {
        var scene = await DispatchedSceneAsync();
        var army = await LoadArmyAsync(scene.Settlement.Id);

        // Pause the world right after dispatch: game time stands still while wall time runs on.
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var world = await db.Worlds.SingleAsync(w => w.Id == scene.WorldId, Ct);
            world.ApplyClock(world.ToClock().Pause(_factory.Time.GetUtcNow()));
            await db.SaveChangesAsync(Ct);
        }

        // Wall time passes far beyond the army's whole outbound route.
        AdvanceToHexIndex(army, army.Path.Count - 1);

        await PollFogAsync(scene);

        var route = army.Path.Select(p => new HexCoord(p.Q, p.R));
        var home = new HexCoord(scene.Settlement.Q, scene.Settlement.R);
        var farRoute = route.Where(h => h.DistanceTo(home) > HomeSafeDistance + 2).ToList();
        Assert.NotEmpty(farRoute);
        Assert.Equal(farRoute.Distinct().Count(), (await UnexploredFarHexesAsync(scene, farRoute)).Count);
    }
}
