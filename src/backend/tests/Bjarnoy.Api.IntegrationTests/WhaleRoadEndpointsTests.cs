using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The whale road, the first water camp, end to end (docs/design/wildlife-camps.md, "Water camps"): a fleet hunts it
/// and brings food home, a fleet sailing through its hex is ambushed, and land units and fleets are refused each
/// other's camps — through HTTP, the EF model and a real database, with the clock under the test's control.
/// </summary>
public sealed class WhaleRoadEndpointsTests : IAsyncLifetime
{
    private const string OwnerId = "ulf-player";

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

    private static readonly (int Dq, int Dr)[] NeighbourOffsets = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)];

    private sealed record Setup(Guid WorldId, SettlementResponse Settlement, Guid IslandId, Dictionary<(int Q, int R), string> Terrain)
    {
        public HexCoord Home => new(Settlement.Q, Settlement.R);
    }

    private static bool IsSea(Dictionary<(int Q, int R), string> terrain, HexCoord hex) =>
        terrain.TryGetValue((hex.Q, hex.R), out var t) && t == "sea";

    /// <summary>The hexes of a straight line from <paramref name="from"/> to <paramref name="to"/> (cube-coordinate lerp).</summary>
    private static List<HexCoord> HexLine(HexCoord from, HexCoord to)
    {
        var n = from.DistanceTo(to);
        var line = new List<HexCoord>();
        for (var i = 0; i <= n; i++)
        {
            var t = n == 0 ? 0 : (double)i / n;
            double q = from.Q + ((to.Q - from.Q) * t), r = from.R + ((to.R - from.R) * t), s = -q - r;
            int rq = (int)Math.Round(q), rr = (int)Math.Round(r), rs = (int)Math.Round(s);
            double dq = Math.Abs(rq - q), dr = Math.Abs(rr - r), ds = Math.Abs(rs - s);
            if (dq > dr && dq > ds)
            {
                rq = -rr - rs;
            }
            else if (dr > ds)
            {
                rr = -rq - rs;
            }

            line.Add(new HexCoord(rq, rr));
        }

        return line;
    }

    /// <summary>
    /// A founded settlement on a coastal hex (the island's start position is moved there) with Longships and Karves
    /// in its garrison, plus its surroundings' terrain. The settlement's own hex is land with open sea beside it.
    /// </summary>
    private async Task<Setup> FoundOnTheCoastAsync(HttpClient client)
    {
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{world.Id}/tiles?qMin={plot.Q - 25}&qMax={plot.Q + 25}&rMin={plot.R - 25}&rMax={plot.R + 25}",
            SqliteApiFixture.StrictJson, Ct);
        var terrain = chunk!.Tiles.ToDictionary(t => (t.Q, t.R), t => t.Terrain);

        // A grass hex of this island with sea on at least three neighbours, nearest the start position, whose open
        // sea runs at least 9 hexes straight out in some direction.
        var coast = terrain
            .Where(t => t.Value == "grass")
            .Select(t => new HexCoord(t.Key.Q, t.Key.R))
            .Where(h => NeighbourOffsets.Count(o => IsSea(terrain, new HexCoord(h.Q + o.Dq, h.R + o.Dr))) >= 3)
            .Where(h => h.DistanceTo(new HexCoord(plot.Q, plot.R)) <= 20)
            .OrderBy(h => h.DistanceTo(new HexCoord(plot.Q, plot.R))).ThenBy(h => h.Q).ThenBy(h => h.R)
            .First(h => OpenSeaTargets(terrain, h).Count > 0);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var entity = await db.Islands.SingleAsync(i => i.Id == island.Id, Ct);
            entity.StartPositions = [.. entity.StartPositions, new HexPoint(coast.Q, coast.R)];
            await db.SaveChangesAsync(Ct);
        }

        var founded = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, coast.Q, coast.R, "Bjornstad", "Ulf", OwnerId),
            Ct);
        Assert.Equal(HttpStatusCode.Created, founded.StatusCode);
        var settlement = await founded.ReadStrictAsync<SettlementResponse>(Ct);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", OwnerId);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            db.UnitStacks.Add(new UnitStackEntity { SettlementId = settlement.Id, UnitType = UnitType.Longship, Count = 10 });
            db.UnitStacks.Add(new UnitStackEntity { SettlementId = settlement.Id, UnitType = UnitType.Karve, Count = 10 });
            db.UnitStacks.Add(new UnitStackEntity { SettlementId = settlement.Id, UnitType = UnitType.Axeman, Count = 20 });
            await db.SaveChangesAsync(Ct);
        }

        return new Setup(world.Id, settlement, island.Id, terrain);
    }

    /// <summary>Sea hexes 7 or 8 away from <paramref name="home"/> whose straight line from it is open sea after the first hex.</summary>
    private static List<HexCoord> OpenSeaTargets(Dictionary<(int Q, int R), string> terrain, HexCoord home) =>
    [
        .. terrain.Where(t => t.Value == "sea")
            .Select(t => new HexCoord(t.Key.Q, t.Key.R))
            .Where(h => h.DistanceTo(home) is 7 or 8)
            .Where(h => HexLine(home, h).Skip(1).All(l => IsSea(terrain, l)))
            .OrderBy(h => h.Q).ThenBy(h => h.R),
    ];

    private async Task PlantCampAsync(Setup setup, HexCoord hex, string family, int level = 1)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var island = await db.Islands.SingleAsync(i => i.Id == setup.IslandId, Ct);
        island.Camps = [.. island.Camps, new CampRecord(hex.Q, hex.R, family, level, 0)];
        await db.SaveChangesAsync(Ct);
    }

    private Task<HttpResponseMessage> DispatchAsync(
        HttpClient client, Guid settlementId, string unit, int count, HexCoord to, double provisions, string? mission = null) =>
        client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/armies",
            new DispatchArmyRequest([new UnitCountRequest(unit, count)], null, new HexPointRequest(to.Q, to.R), provisions, mission),
            Ct);

    private Task<List<CampReportResponse>?> CampReportsAsync(HttpClient client, Guid settlementId) =>
        client.GetFromJsonAsync<List<CampReportResponse>>(
            $"/api/v1/settlements/{settlementId}/camp-reports", SqliteApiFixture.StrictJson, Ct);

    private async Task<CampStateResponse> CampAtAsync(HttpClient client, Guid worldId, HexCoord hex) =>
        (await client.GetFromJsonAsync<List<CampStateResponse>>(
            $"/api/v1/worlds/{worldId}/camps", SqliteApiFixture.StrictJson, Ct))!.Single(c => (c.Q, c.R) == (hex.Q, hex.R));

    private async Task<SettlementResponse> SettlementAsync(HttpClient client, Guid id) =>
        (await client.GetFromJsonAsync<SettlementResponse>($"/api/v1/settlements/{id}", SqliteApiFixture.StrictJson, Ct))!;

    [Fact]
    public async Task A_fleet_hunts_the_whale_road_clears_it_and_brings_food_home_within_its_capacity()
    {
        using var client = Client();
        var setup = await FoundOnTheCoastAsync(client);
        var whale = OpenSeaTargets(setup.Terrain, setup.Home)[0];
        await PlantCampAsync(setup, whale, CampFamilies.Whaleroad);

        var camp = await CampAtAsync(client, setup.WorldId, whale);
        Assert.Equal((CampFamilies.Whaleroad, true, 0), (camp.Family, camp.Strong, camp.GuardRange));

        var dispatched = await DispatchAsync(client, setup.Settlement.Id, "longship", 5, whale, 200, "hunt");
        Assert.Equal(HttpStatusCode.Created, dispatched.StatusCode);
        var army = await dispatched.ReadStrictAsync<ArmyResponse>(Ct);
        Assert.Equal("hunt", army.Mission);
        Assert.Equal((whale.Q, whale.R), (army.Movement!.Path[^1].Q, army.Movement.Path[^1].R));

        // Out and the fight, a few minutes after the arrival (the read settles the army; the pack has barely regrown).
        var arrival = army.Movement!.DepartedAt + TimeSpan.FromHours(army.Movement.CumulativeHours[^1]);
        _factory.Time.Advance(arrival + TimeSpan.FromMinutes(5) - _factory.Time.GetUtcNow());
        await client.GetAsync($"/api/v1/armies/{army.Id}", Ct);

        var after = await CampAtAsync(client, setup.WorldId, whale);
        Assert.True(after.Empty);
        Assert.Equal(1, after.Clears);
        Assert.NotNull(after.CalmUntil);
        Assert.False(after.Removed);

        var report = Assert.Single((await CampReportsAsync(client, setup.Settlement.Id))!);
        Assert.Equal(("hunt", "army", true), (report.Kind, report.Winner, report.CampCleared));
        Assert.Equal(CampFamilies.Whaleroad, report.Camp.Family);
        Assert.True(report.Loot.Food > 0);
        Assert.Equal((0d, 0d, 0d), (report.Loot.Wood, report.Loot.Stone, report.Loot.Iron));
        var survivors = 5 - report.Units.Single().Lost;
        Assert.True(report.Loot.Food <= survivors * UnitCatalogue.Get(UnitType.Longship).CarryCapacity);

        // What the ships could not carry stays on the whale road.
        Assert.Equal(1800, report.Loot.Food + after.Leftover.Food);
    }

    [Fact]
    public async Task Land_units_and_fleets_are_refused_each_others_camps()
    {
        using var client = Client();
        var setup = await FoundOnTheCoastAsync(client);
        var whale = OpenSeaTargets(setup.Terrain, setup.Home)[0];
        await PlantCampAsync(setup, whale, CampFamilies.Whaleroad);
        var landHex = NeighbourOffsets
            .Select(o => new HexCoord(setup.Home.Q + o.Dq, setup.Home.R + o.Dr))
            .First(h => setup.Terrain.TryGetValue((h.Q, h.R), out var t) && t == "grass");
        await PlantCampAsync(setup, landHex, CampFamilies.Wolfden);

        var landAtSea = await DispatchAsync(client, setup.Settlement.Id, "axeman", 10, whale, 50, "hunt");
        Assert.Equal(HttpStatusCode.Conflict, landAtSea.StatusCode);
        Assert.Equal("HuntRequiresFleet", await landAtSea.RejectionAsync(Ct));

        var seaAtLand = await DispatchAsync(client, setup.Settlement.Id, "longship", 5, landHex, 50, "hunt");
        Assert.Equal(HttpStatusCode.Conflict, seaAtLand.StatusCode);
        Assert.Equal("HuntRequiresLandUnits", await seaAtLand.RejectionAsync(Ct));

        var landAtLand = await DispatchAsync(client, setup.Settlement.Id, "axeman", 10, landHex, 50, "hunt");
        Assert.Equal(HttpStatusCode.Created, landAtLand.StatusCode);
    }

    [Fact]
    public async Task A_fleet_sailing_through_the_whale_roads_hex_is_ambushed_and_turns_home()
    {
        using var client = Client();
        var setup = await FoundOnTheCoastAsync(client);
        var far = OpenSeaTargets(setup.Terrain, setup.Home)[0];

        var dispatched = await DispatchAsync(client, setup.Settlement.Id, "karve", 2, far, 60);
        Assert.Equal(HttpStatusCode.Created, dispatched.StatusCode);
        var army = await dispatched.ReadStrictAsync<ArmyResponse>(Ct);
        var movement = army.Movement!;

        // A whale road on the route, three hexes out; the fleet enters its own hex at the instant the clock passes.
        var site = new HexCoord(movement.Path[3].Q, movement.Path[3].R);
        await PlantCampAsync(setup, site, CampFamilies.Whaleroad, level: 3);
        var arrival = movement.DepartedAt + TimeSpan.FromHours(movement.CumulativeHours[3]) + TimeSpan.FromMinutes(1);
        _factory.Time.Advance(arrival - _factory.Time.GetUtcNow());

        var read = await client.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{army.Id}", SqliteApiFixture.StrictJson, Ct);

        // Karves (defense 30) against a level 3 pack's attack: beaten, the survivors walk home immune.
        Assert.True(read!.Movement!.IsReturning);
        Assert.InRange(read.Stacks.Single().Count, 1, 2);

        var report = Assert.Single((await CampReportsAsync(client, setup.Settlement.Id))!);
        Assert.Equal(("ambush", "camp"), (report.Kind, report.Winner));
        Assert.Equal(CampFamilies.Whaleroad, report.Camp.Family);
        Assert.Equal((site.Q, site.R), (report.Camp.Q, report.Camp.R));
        Assert.Equal(army.Id, report.ArmyId);

        var camp = await CampAtAsync(client, setup.WorldId, site);
        Assert.NotNull(camp.CalmUntil);
        Assert.False(camp.Aggressive);

        // Immune on the way home: reading it again fights nothing more.
        await client.GetAsync($"/api/v1/armies/{army.Id}", Ct);
        Assert.Single((await CampReportsAsync(client, setup.Settlement.Id))!);
    }

    [Fact]
    public async Task A_fleet_hunting_the_whale_road_is_not_ambushed_by_it_on_the_way_in()
    {
        using var client = Client();
        var setup = await FoundOnTheCoastAsync(client);
        var whale = OpenSeaTargets(setup.Terrain, setup.Home)[0];
        await PlantCampAsync(setup, whale, CampFamilies.Whaleroad, level: 5);

        // Two karves cannot beat a level 5 pack: the hunt is lost, and it is a hunt report, not an ambush.
        var dispatched = await DispatchAsync(client, setup.Settlement.Id, "karve", 2, whale, 60, "hunt");
        Assert.Equal(HttpStatusCode.Created, dispatched.StatusCode);
        var army = await dispatched.ReadStrictAsync<ArmyResponse>(Ct);

        _factory.Time.Advance(TimeSpan.FromHours(6));
        await client.GetAsync($"/api/v1/armies/{army.Id}", Ct);

        var report = Assert.Single((await CampReportsAsync(client, setup.Settlement.Id))!);
        Assert.Equal(("hunt", "camp"), (report.Kind, report.Winner));
        var home = await SettlementAsync(client, setup.Settlement.Id);
        Assert.Equal(8, home.Garrison.Single(g => g.Unit == "karve").Count);
    }
}
