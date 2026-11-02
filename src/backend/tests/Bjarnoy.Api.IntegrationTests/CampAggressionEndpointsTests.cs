using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Strong camps on the attack (docs/design/wildlife-camps.md, "Strong camps attack"): the lazy ambush on an army's
/// route, resolved when the army is read, and the tower scan (<see cref="CampAggressionService"/>), driven by hand
/// on the test clock — through HTTP, the EF model and a real database.
/// </summary>
public sealed class CampAggressionEndpointsTests : IAsyncLifetime
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

    private sealed record Setup(
        Guid WorldId, SettlementResponse Settlement, Guid IslandId, Dictionary<(int Q, int R), string> Terrain);

    /// <summary>A founded settlement with <paramref name="axemen"/> axemen in its garrison; no camp yet.</summary>
    private async Task<Setup> FoundAsync(HttpClient client, int axemen)
    {
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var founded = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", OwnerId),
            Ct);
        Assert.Equal(HttpStatusCode.Created, founded.StatusCode);
        var settlement = await founded.ReadStrictAsync<SettlementResponse>(Ct);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", OwnerId);

        var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{world.Id}/tiles?qMin={plot.Q - 10}&qMax={plot.Q + 10}&rMin={plot.R - 10}&rMax={plot.R + 10}",
            SqliteApiFixture.StrictJson, Ct);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            db.UnitStacks.Add(new UnitStackEntity { SettlementId = settlement.Id, UnitType = UnitType.Axeman, Count = axemen });
            await db.SaveChangesAsync(Ct);
        }

        return new Setup(world.Id, settlement, island.Id, chunk!.Tiles.ToDictionary(t => (t.Q, t.R), t => t.Terrain));
    }

    private async Task PlantCampAsync(Setup setup, HexCoord hex, string family = CampFamilies.Wolfden, int level = 1)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var island = await db.Islands.SingleAsync(i => i.Id == setup.IslandId, Ct);
        island.Camps = [.. island.Camps, new CampRecord(hex.Q, hex.R, family, level, 0)];
        await db.SaveChangesAsync(Ct);
    }

    private async Task SetCampStateAsync(Guid worldId, HexCoord hex, CampState state)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        db.CampStates.Add(CampStateEntity.FromDomain(worldId, hex, state));
        await db.SaveChangesAsync(Ct);
    }

    private static bool IsLand(string terrain) => terrain is "grass" or "forest" or "sand";

    /// <summary>The walkable land neighbours of the settlement, in a fixed order.</summary>
    private static List<HexCoord> GrassNeighbours(Setup setup) =>
    [
        .. NeighbourOffsets
            .Select(o => new HexCoord(setup.Settlement.Q + o.Dq, setup.Settlement.R + o.Dr))
            .Where(h => setup.Terrain.TryGetValue((h.Q, h.R), out var t) && IsLand(t)),
    ];

    private DateTimeOffset GameNow() => _factory.Time.GetUtcNow();

    private static Task<HttpResponseMessage> MoveAsync(
        HttpClient client, Guid settlementId, HexCoord to, int count, double provisions) =>
        client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/armies",
            new DispatchArmyRequest([new UnitCountRequest("axeman", count)], null, new HexPointRequest(to.Q, to.R), provisions),
            Ct);

    /// <summary>
    /// Sends <paramref name="count"/> axemen on a long march over land (the first destination 7 to 10 hexes away that
    /// the pathfinder accepts) and returns the army with its route.
    /// </summary>
    private async Task<ArmyResponse> MarchFarAsync(HttpClient client, Setup setup, int count)
    {
        var home = new HexCoord(setup.Settlement.Q, setup.Settlement.R);
        var candidates = setup.Terrain
            .Where(t => IsLand(t.Value))
            .Select(t => new HexCoord(t.Key.Q, t.Key.R))
            .Where(h => h.DistanceTo(home) is >= 7 and <= 10)
            .OrderBy(h => h.Q).ThenBy(h => h.R)
            .Take(40);

        var last = "no candidate";
        foreach (var destination in candidates)
        {
            var response = await MoveAsync(client, setup.Settlement.Id, destination, count, count * 5);
            if (response.StatusCode == HttpStatusCode.Created)
            {
                return await response.ReadStrictAsync<ArmyResponse>(Ct);
            }

            last = await response.Content.ReadAsStringAsync(Ct);
        }

        throw new InvalidOperationException($"No reachable destination 7+ hexes from the settlement in this world: {last}");
    }

    /// <summary>
    /// Plants a strong camp on the march's route, five hexes out (outside the guard range of the start), and advances the
    /// clock to just after the army enters that range. Returns the camp's hex.
    /// </summary>
    private async Task<HexCoord> AmbushSiteAsync(Setup setup, ArmyResponse army)
    {
        var movement = army.Movement!;
        var camp = movement.Path[5];
        var campHex = new HexCoord(camp.Q, camp.R);
        await PlantCampAsync(setup, campHex);

        var range = new Camp(campHex, CampFamilies.Wolfden, 1, TileOrientation.E).GuardRange;
        var entry = movement.Path
            .Select((p, i) => (Hex: new HexCoord(p.Q, p.R), Hours: movement.CumulativeHours[i]))
            .First(s => s.Hex.DistanceTo(campHex) <= range);
        Assert.True(entry.Hours > 0, "sanity: the army must not start inside the guard range");

        _factory.Time.Advance(movement.DepartedAt + TimeSpan.FromHours(entry.Hours) + TimeSpan.FromMinutes(1) - GameNow());
        return campHex;
    }

    private Task<List<CampReportResponse>?> CampReportsAsync(HttpClient client, Guid settlementId) =>
        client.GetFromJsonAsync<List<CampReportResponse>>(
            $"/api/v1/settlements/{settlementId}/camp-reports", SqliteApiFixture.StrictJson, Ct);

    private async Task<CampStateResponse> CampAtAsync(HttpClient client, Guid worldId, HexCoord hex) =>
        (await client.GetFromJsonAsync<List<CampStateResponse>>(
            $"/api/v1/worlds/{worldId}/camps", SqliteApiFixture.StrictJson, Ct))!.Single(c => (c.Q, c.R) == (hex.Q, hex.R));

    private async Task<int> ScanAsync(Guid worldId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var world = await db.Worlds.AsNoTracking().SingleAsync(w => w.Id == worldId, Ct);
        var now = world.ToClock().ToGameTime(GameNow());
        return await scope.ServiceProvider.GetRequiredService<CampAggressionService>().ProcessWorldAsync(worldId, now, Ct);
    }

    private async Task<(List<PlacedBuildingEntity> Buildings, List<BuildOrderEntity> Orders)> TowersAsync(Guid settlementId, HexCoord hex)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return (
            await db.PlacedBuildings.Where(b => b.SettlementId == settlementId && b.Q == hex.Q && b.R == hex.R).ToListAsync(Ct),
            await db.BuildOrders.Where(o => o.SettlementId == settlementId && o.Q == hex.Q && o.R == hex.R).ToListAsync(Ct));
    }

    /// <summary>A tower whose construction started now: its level-0 stub and a started order (8 h to go).</summary>
    private async Task StartTowerAsync(Guid settlementId, HexCoord hex)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        db.PlacedBuildings.Add(new PlacedBuildingEntity
        {
            SettlementId = settlementId, Q = hex.Q, R = hex.R, Type = BuildingType.Tower, Level = 0,
        });
        db.BuildOrders.Add(new BuildOrderEntity
        {
            SettlementId = settlementId, Q = hex.Q, R = hex.R, Type = BuildingType.Tower, TargetLevel = 1,
            QueuedAt = GameNow(), BaseDuration = TimeSpan.FromHours(8),
            StartedAt = GameNow(), CompletesAt = GameNow() + TimeSpan.FromHours(8),
        });
        await db.SaveChangesAsync(Ct);
    }

    private async Task StandTowerAsync(Guid settlementId, HexCoord hex)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        db.PlacedBuildings.Add(new PlacedBuildingEntity
        {
            SettlementId = settlementId, Q = hex.Q, R = hex.R, Type = BuildingType.Tower, Level = 1,
        });
        await db.SaveChangesAsync(Ct);
    }

    /// <summary>
    /// <paramref name="count"/> axemen standing on <paramref name="hex"/>, a hex next to home: arrived an hour ago, a day
    /// before turning around. Written straight to the database: dispatching from a settlement inside an aggressive camp's
    /// range would get the army ambushed on the spot, which is not what these tests are about.
    /// </summary>
    private async Task<Guid> StandArmyAsync(Setup setup, HexCoord hex, int count)
    {
        var home = new HexPoint(setup.Settlement.Q, setup.Settlement.R);
        var army = new ArmyEntity
        {
            SettlementId = setup.Settlement.Id,
            Mission = (int)ArmyMission.Move,
            AtHome = false,
            Provisions = 100,
            DepartedAt = GameNow() - TimeSpan.FromHours(1.5),
            Path = [home, new HexPoint(hex.Q, hex.R)],
            CumulativeHours = [0, 0.5],
            ReturnPath = [new HexPoint(hex.Q, hex.R), home],
            ReturnCumulativeHours = [0, 0.5],
            TurnAroundAt = GameNow() + TimeSpan.FromHours(24),
            Stacks = [new ArmyUnitStackEntity { UnitType = UnitType.Axeman, Count = count }],
        };

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        db.Armies.Add(army);
        await db.SaveChangesAsync(Ct);
        return army.Id;
    }

    private async Task<List<int>> ArmyCountsAsync(Guid settlementId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var armies = await db.Armies.Include(a => a.Stacks).Where(a => a.SettlementId == settlementId).ToListAsync(Ct);
        return [.. armies.Select(a => a.Stacks.Sum(s => s.Count))];
    }

    [Fact]
    public async Task A_march_into_a_strong_camps_range_that_it_cannot_beat_is_ambushed_and_retreats_home()
    {
        using var client = Client();
        var setup = await FoundAsync(client, axemen: 20);
        var army = await MarchFarAsync(client, setup, count: 5); // defense 75 against the camp's attack 156
        var campHex = await AmbushSiteAsync(setup, army);

        var read = await client.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{army.Id}", SqliteApiFixture.StrictJson, Ct);

        // Back on its feet only as a smaller army walking home.
        Assert.True(read!.Movement!.IsReturning);
        Assert.InRange(read.Stacks.Single().Count, 1, 4);

        var report = Assert.Single((await CampReportsAsync(client, setup.Settlement.Id))!);
        Assert.Equal("ambush", report.Kind);
        Assert.Equal("camp", report.Winner);
        Assert.Equal(army.Id, report.ArmyId);
        Assert.Null(report.Tower);
        Assert.False(report.TowerBurned);
        Assert.Equal((campHex.Q, campHex.R), (report.Camp.Q, report.Camp.R));
        Assert.Equal(5 - read.Stacks.Single().Count, Assert.Single(report.Units).Lost);
        Assert.Equal(new[] { "young", "adult" }, report.Beasts.Select(b => b.Tier));

        var camp = await CampAtAsync(client, setup.WorldId, campHex);
        Assert.NotNull(camp.CalmUntil);
        Assert.False(camp.Aggressive);

        // Immune on the way home: reading it again fights nothing more.
        await client.GetAsync($"/api/v1/armies/{army.Id}", Ct);
        Assert.Single((await CampReportsAsync(client, setup.Settlement.Id))!);
    }

    [Fact]
    public async Task A_march_that_beats_the_ambush_goes_on_and_the_camp_is_hurt_and_calm()
    {
        using var client = Client();
        var setup = await FoundAsync(client, axemen: 40);
        var army = await MarchFarAsync(client, setup, count: 20); // defense 300 against the camp's attack 156
        var campHex = await AmbushSiteAsync(setup, army);

        var read = await client.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{army.Id}", SqliteApiFixture.StrictJson, Ct);

        Assert.False(read!.Movement!.IsReturning);
        Assert.Equal(army.Movement!.Path.Count, read.Movement.Path.Count);
        Assert.InRange(read.Stacks.Single().Count, 1, 20);

        var report = Assert.Single((await CampReportsAsync(client, setup.Settlement.Id))!);
        Assert.Equal(("ambush", "army"), (report.Kind, report.Winner));
        Assert.False(report.CampCleared);

        var camp = await CampAtAsync(client, setup.WorldId, campHex);
        Assert.True(camp.Garrison.Adult < camp.FullGarrison.Adult, "the camp lost beasts");
        Assert.False(camp.Empty);
        Assert.NotNull(camp.CalmUntil);
        Assert.False(camp.Aggressive);
        Assert.Equal(0, camp.Clears);
    }

    [Fact]
    public async Task A_calm_camp_lets_a_march_pass()
    {
        using var client = Client();
        var setup = await FoundAsync(client, axemen: 20);
        var army = await MarchFarAsync(client, setup, count: 5);
        var campHex = new HexCoord(army.Movement!.Path[5].Q, army.Movement.Path[5].R);
        var camp = new Camp(campHex, CampFamilies.Wolfden, 1, TileOrientation.E);
        await SetCampStateAsync(setup.WorldId, campHex,
            CampState.Pristine(camp, GameNow()) with { CalmUntil = GameNow() + TimeSpan.FromHours(24) });
        await AmbushSiteAsync(setup, army);

        var read = await client.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{army.Id}", SqliteApiFixture.StrictJson, Ct);

        Assert.False(read!.Movement!.IsReturning);
        Assert.Equal(5, read.Stacks.Single().Count);
        Assert.Empty((await CampReportsAsync(client, setup.Settlement.Id))!);
    }

    [Fact]
    public async Task A_started_tower_in_range_burns_after_the_delay_without_a_refund()
    {
        using var client = Client();
        var setup = await FoundAsync(client, axemen: 20);
        var neighbours = GrassNeighbours(setup);
        var (campHex, towerHex) = (neighbours[0], neighbours[1]);
        await PlantCampAsync(setup, campHex);
        await StartTowerAsync(setup.Settlement.Id, towerHex);
        var stockBefore = (await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{setup.Settlement.Id}", SqliteApiFixture.StrictJson, Ct))!.Resources.Stock;

        _factory.Time.Advance(TimeSpan.FromMinutes(29));
        Assert.Equal(0, await ScanAsync(setup.WorldId));
        var (stubBefore, ordersBefore) = await TowersAsync(setup.Settlement.Id, towerHex);
        Assert.Single(stubBefore);
        Assert.Single(ordersBefore);

        _factory.Time.Advance(TimeSpan.FromMinutes(2));
        Assert.Equal(1, await ScanAsync(setup.WorldId));

        var (buildings, orders) = await TowersAsync(setup.Settlement.Id, towerHex);
        Assert.Empty(buildings);
        Assert.Empty(orders);

        var report = Assert.Single((await CampReportsAsync(client, setup.Settlement.Id))!);
        Assert.Equal(("tower", "camp"), (report.Kind, report.Winner));
        Assert.True(report.TowerBurned);
        Assert.Equal((towerHex.Q, towerHex.R), (report.Tower!.Q, report.Tower.R));
        Assert.Equal((campHex.Q, campHex.R), (report.Camp.Q, report.Camp.R));
        Assert.Null(report.ArmyId);
        Assert.Empty(report.Units);

        // The tower's 120 wood and 200 stone are gone, not handed back (an hour of production is far below that).
        var after = (await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{setup.Settlement.Id}", SqliteApiFixture.StrictJson, Ct))!;
        Assert.True(after.Resources.Stock.Stone < stockBefore.Stone + 100);
        Assert.True(after.Resources.Stock.Wood < stockBefore.Wood + 100);
        Assert.DoesNotContain(after.Buildings, b => (b.Q, b.R) == (towerHex.Q, towerHex.R));
        Assert.DoesNotContain(after.Queue, o => (o.Q, o.R) == (towerHex.Q, towerHex.R));

        // The camp is calm now and a second scan finds nothing to attack.
        Assert.False((await CampAtAsync(client, setup.WorldId, campHex)).Aggressive);
        Assert.Equal(0, await ScanAsync(setup.WorldId));
    }

    [Fact]
    public async Task A_standing_tower_with_no_defenders_is_razed_at_once()
    {
        using var client = Client();
        var setup = await FoundAsync(client, axemen: 20);
        var neighbours = GrassNeighbours(setup);
        await PlantCampAsync(setup, neighbours[0]);
        await StandTowerAsync(setup.Settlement.Id, neighbours[1]);

        Assert.Equal(1, await ScanAsync(setup.WorldId));

        Assert.Empty((await TowersAsync(setup.Settlement.Id, neighbours[1])).Buildings);
        var report = Assert.Single((await CampReportsAsync(client, setup.Settlement.Id))!);
        Assert.True(report.TowerBurned);
    }

    [Fact]
    public async Task An_army_standing_on_the_tower_defends_it_and_pays_in_losses()
    {
        using var client = Client();
        var setup = await FoundAsync(client, axemen: 40);
        var neighbours = GrassNeighbours(setup);
        var (campHex, towerHex) = (neighbours[0], neighbours[1]);
        await PlantCampAsync(setup, campHex);
        await StartTowerAsync(setup.Settlement.Id, towerHex);
        var armyId = await StandArmyAsync(setup, towerHex, count: 20); // defense 300 against attack 156

        // The construction started 30 minutes ago: the camp is due.
        _factory.Time.Advance(TimeSpan.FromMinutes(30));
        Assert.Equal(1, await ScanAsync(setup.WorldId));

        var (buildings, orders) = await TowersAsync(setup.Settlement.Id, towerHex);
        Assert.Single(buildings);
        Assert.Single(orders);

        var report = Assert.Single((await CampReportsAsync(client, setup.Settlement.Id))!);
        Assert.Equal(("tower", "army"), (report.Kind, report.Winner));
        Assert.False(report.TowerBurned);
        Assert.Equal(armyId, report.ArmyId);
        var line = Assert.Single(report.Units);
        Assert.Equal(20, line.Sent);
        Assert.InRange(line.Lost, 1, 10);
        Assert.Equal([20 - line.Lost], await ArmyCountsAsync(setup.Settlement.Id));

        var camp = await CampAtAsync(client, setup.WorldId, campHex);
        Assert.True(camp.Garrison.Adult < camp.FullGarrison.Adult);
        Assert.NotNull(camp.CalmUntil);
    }

    [Fact]
    public async Task Defenders_too_weak_for_the_camp_lose_men_and_the_tower()
    {
        using var client = Client();
        var setup = await FoundAsync(client, axemen: 20);
        var neighbours = GrassNeighbours(setup);
        await PlantCampAsync(setup, neighbours[0]);
        await StandTowerAsync(setup.Settlement.Id, neighbours[1]);
        await StandArmyAsync(setup, neighbours[1], count: 6); // defense 90 against attack 156

        Assert.Equal(1, await ScanAsync(setup.WorldId));

        Assert.Empty((await TowersAsync(setup.Settlement.Id, neighbours[1])).Buildings);
        var report = Assert.Single((await CampReportsAsync(client, setup.Settlement.Id))!);
        Assert.Equal("camp", report.Winner);
        Assert.True(report.TowerBurned);
        Assert.NotNull(report.ArmyId);
        var lost = Assert.Single(report.Units).Lost;
        Assert.InRange(lost, 1, 3);
        Assert.Equal([6 - lost], await ArmyCountsAsync(setup.Settlement.Id));
    }

    [Fact]
    public async Task An_army_that_already_turned_around_or_stands_elsewhere_does_not_defend()
    {
        using var client = Client();
        var setup = await FoundAsync(client, axemen: 60);
        var neighbours = GrassNeighbours(setup);
        await PlantCampAsync(setup, neighbours[0]);
        await StandTowerAsync(setup.Settlement.Id, neighbours[1]);

        // Strong enough to win, but standing on the wrong hex.
        await StandArmyAsync(setup, neighbours[2], count: 30);

        Assert.Equal(1, await ScanAsync(setup.WorldId));

        Assert.Empty((await TowersAsync(setup.Settlement.Id, neighbours[1])).Buildings);
        var report = Assert.Single((await CampReportsAsync(client, setup.Settlement.Id))!);
        Assert.True(report.TowerBurned);
        Assert.Null(report.ArmyId);
        Assert.Equal([30], await ArmyCountsAsync(setup.Settlement.Id));
    }

    [Fact]
    public async Task A_calm_camp_does_not_attack_a_tower()
    {
        using var client = Client();
        var setup = await FoundAsync(client, axemen: 20);
        var neighbours = GrassNeighbours(setup);
        await PlantCampAsync(setup, neighbours[0]);
        await SetCampStateAsync(setup.WorldId, neighbours[0],
            CampState.Pristine(new Camp(neighbours[0], CampFamilies.Wolfden, 1, TileOrientation.E), GameNow())
                with { CalmUntil = GameNow() + TimeSpan.FromHours(24) });
        await StandTowerAsync(setup.Settlement.Id, neighbours[1]);

        Assert.Equal(0, await ScanAsync(setup.WorldId));

        Assert.Single((await TowersAsync(setup.Settlement.Id, neighbours[1])).Buildings);
        Assert.Empty((await CampReportsAsync(client, setup.Settlement.Id))!);
    }

    [Fact]
    public async Task A_weak_camp_does_not_attack_a_tower()
    {
        using var client = Client();
        var setup = await FoundAsync(client, axemen: 20);
        var neighbours = GrassNeighbours(setup);
        await PlantCampAsync(setup, neighbours[0], CampFamilies.Harewarren);
        await StandTowerAsync(setup.Settlement.Id, neighbours[1]);

        Assert.Equal(0, await ScanAsync(setup.WorldId));

        Assert.Single((await TowersAsync(setup.Settlement.Id, neighbours[1])).Buildings);
    }

    [Fact]
    public async Task The_scan_acts_on_running_worlds_only()
    {
        using var client = Client();
        var setup = await FoundAsync(client, axemen: 20);
        var neighbours = GrassNeighbours(setup);
        await PlantCampAsync(setup, neighbours[0]);
        await StandTowerAsync(setup.Settlement.Id, neighbours[1]);

        async Task<int> ScanAllAsync()
        {
            using var scope = _factory.Services.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<CampAggressionService>().ProcessDueWorldsAsync(Ct);
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var world = await db.Worlds.SingleAsync(w => w.Id == setup.WorldId, Ct);
            world.ApplyClock(world.ToClock().Pause(GameNow()));
            await db.SaveChangesAsync(Ct);
        }

        Assert.Equal(0, await ScanAllAsync());
        Assert.Single((await TowersAsync(setup.Settlement.Id, neighbours[1])).Buildings);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var world = await db.Worlds.SingleAsync(w => w.Id == setup.WorldId, Ct);
            world.ApplyClock(world.ToClock().Resume(GameNow()));
            await db.SaveChangesAsync(Ct);
        }

        Assert.Equal(1, await ScanAllAsync());
        Assert.Empty((await TowersAsync(setup.Settlement.Id, neighbours[1])).Buildings);
    }
}
