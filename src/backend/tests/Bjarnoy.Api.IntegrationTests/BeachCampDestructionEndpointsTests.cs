using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Destroying a beach camp (<c>docs/design/skirmish/beach-camp.md</c>) and the armies it leaves without a home
/// (<c>docs/design/troop-movement-range.md</c> §2a, <c>docs/design/garrison.md</c>). The scene: the camp owner (a registered player)
/// has a home settlement six hexes west of a camp at (0, 0); an anonymous attacker marches on the camp from the east and lands four
/// hours in; the camp's own army is out on the road south when it falls. Armies are planted straight into the database, one hex an hour.
/// </summary>
public sealed class BeachCampDestructionEndpointsTests : IAsyncLifetime
{
    private const string CampOwner = "camp-owner";
    private const string AttackerOwner = "camp-attacker";
    private const string Password = "correct-horse-battery";

    private static readonly HexCoord CampHex = new(0, 0);
    private static readonly HexCoord HomeHex = new(-6, 0);
    private static readonly HexCoord AttackerHome = new(20, 0);

    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    /// <summary>A single huge all-land island, as <c>ArmyStarvationEndpointsTests.LandOptions</c>.</summary>
    private static WorldGenerationOptions LandOptions => new()
    {
        Seed = 14,
        Radius = 500,
        IslandCellSize = 100,
        IslandChance = 1.0,
        IslandMaxReach = 0.0,
        IslandMinGap = 0.0,
        IslandMinWidth = 100.0,
        IslandMaxWidth = 100.0,
        IslandMinSegments = 1,
        IslandMaxSegments = 1,
        IslandCoastWarp = 0.0,
        IslandCoastNoise = 0.0,
        IslandSmallShare = 0.0,
        IslandLargeShare = 0.0,
        BeachThreshold = 1.0,
        MountainThreshold = 0.0,
        MountainRockiness = 2.0,
        ForestRockiness = 2.0,
    };

    private sealed record Scene(
        Guid WorldId, Guid HomeId, Guid CampId, Guid AttackerSettlementId, Guid AttackerArmyId, Guid? CampArmyId, string UserName);

    /// <summary>
    /// Plants the scene. <paramref name="campArmyProvisions"/>: the camp's own army (5 spearmen, 1.25 food an hour) marching south
    /// from the camp, ten hexes in ten hours, with that much food at the start; null for none. <paramref name="mission"/> and
    /// <paramref name="attackUnits"/>: what the attacker comes to do and with what (10 axemen by default).
    /// <paramref name="campGarrison"/>: the camp's own garrison, land troops and ships alike.
    /// </summary>
    private async Task<Scene> PlantAsync(
        double? campArmyProvisions,
        ArmyMission mission = ArmyMission.Attack,
        (UnitType Unit, int Count)[]? attackUnits = null,
        (UnitType Unit, int Count)[]? campGarrison = null)
    {
        using var client = _factory.CreateClient();
        var userName = $"jarl{Guid.CreateVersion7():N}"[..20];
        var registered = await (await client.PostJsonAsync("/api/v1/auth/register", new RegisterRequest(userName, Password), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var world = new WorldEntity { Name = $"w-{Guid.CreateVersion7():N}", MaxPlayers = 100 };
        world.ApplyGenerationOptions(LandOptions);
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Name = "Island", CentreQ = 0, CentreR = 0 };
        db.Islands.Add(island);

        var now = _factory.Time.GetUtcNow();
        var home = Settlement(world.Id, island.Id, CampOwner, registered.User.Id, HomeHex, now - TimeSpan.FromDays(1));
        home.Buildings.Add(new PlacedBuildingEntity { Q = HomeHex.Q, R = HomeHex.R, Type = BuildingType.Longhouse, Level = 1 });
        var camp = Settlement(world.Id, island.Id, CampOwner, registered.User.Id, CampHex, now);
        camp.Name = "Strandlager";
        camp.CapacityFood = BuildingCatalogue.BeachCampStorage;
        camp.Buildings.Add(new PlacedBuildingEntity { Q = CampHex.Q, R = CampHex.R, Type = BuildingType.BeachCamp, Level = 1 });
        foreach (var (unit, count) in campGarrison ?? [])
        {
            camp.Garrison.Add(new UnitStackEntity { SettlementId = camp.Id, UnitType = unit, Count = count, SpotQ = CampHex.Q, SpotR = CampHex.R });
        }

        var attacker = Settlement(world.Id, island.Id, AttackerOwner, SystemUserIds.Abandoned, AttackerHome, now - TimeSpan.FromDays(1));
        db.Settlements.AddRange(home, camp, attacker);

        // Lands on the camp four hours in.
        var attack = Army(
            attacker.Id, AttackerHome, [(4, 0), (3, 0), (2, 0), (1, 0), (0, 0)], [(0, 0), (1, 0), (2, 0), (3, 0), (4, 0)], 1_000,
            attackUnits ?? [(UnitType.Axeman, 10)]);
        attack.Mission = (int)mission;
        attack.TargetSettlementId = camp.Id;
        db.AddArmyRows(attack);

        ArmyEntity? campArmy = null;
        if (campArmyProvisions is { } provisions)
        {
            (int Q, int R)[] south = [.. Enumerable.Range(0, 11).Select(i => (0, i))];
            campArmy = Army(camp.Id, CampHex, south, [.. south.Reverse()], provisions, [(UnitType.Spearman, 5)]);
            db.AddArmyRows(campArmy);
        }

        await db.SaveChangesAsync(Ct);
        return new Scene(world.Id, home.Id, camp.Id, attacker.Id, attack.Id, campArmy?.Id, userName);
    }

    private SettlementEntity Settlement(Guid worldId, Guid islandId, string ownerId, Guid userId, HexCoord centre, DateTimeOffset foundedAt) => new()
    {
        WorldId = worldId,
        IslandId = islandId,
        Name = $"s-{Guid.CreateVersion7():N}",
        OwnerName = "Owner",
        OwnerId = ownerId,
        UserId = userId,
        CentreQ = centre.Q,
        CentreR = centre.R,
        SettledAt = _factory.Time.GetUtcNow(),
        FoundedAt = foundedAt,
        StockFood = 300,
        CapacityFood = 1000,
    };

    private ArmyEntity Army(
        Guid settlementId, HexCoord home, (int Q, int R)[] path, (int Q, int R)[] returnPath, double provisions, (UnitType Unit, int Count)[] units)
    {
        var departedAt = _factory.Time.GetUtcNow();
        List<double> hours = [.. path.Select((_, i) => (double)i)];
        List<double> returnHours = [.. returnPath.Select((_, i) => (double)i)];
        return new ArmyEntity
        {
            SettlementId = settlementId,
            HomeSpotQ = home.Q,
            HomeSpotR = home.R,
            Mission = (int)ArmyMission.Move,
            AtHome = false,
            Provisions = provisions,
            DepartedAt = departedAt,
            Path = [.. path.Select(p => new HexPoint(p.Q, p.R))],
            CumulativeHours = hours,
            EdgeHours = hours,
            ReturnPath = [.. returnPath.Select(p => new HexPoint(p.Q, p.R))],
            ReturnCumulativeHours = returnHours,
            ReturnEdgeHours = returnHours,
            TurnAroundAt = departedAt + TimeSpan.FromHours(100),
            IsReturning = false,
            Stacks = [.. units.Select(u => new ArmyUnitStackEntity { UnitType = u.Unit, Count = u.Count })],
        };
    }

    private HttpClient AttackerClient()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Owner-Id", AttackerOwner);
        return client;
    }

    /// <summary>A client signed in as the camp owner now (an access token does not survive the hours these tests skip).</summary>
    private async Task<HttpClient> OwnerClientAsync(Scene scene)
    {
        var client = _factory.CreateClient();
        var auth = await (await client.PostJsonAsync("/api/v1/auth/login", new LoginRequest(scene.UserName, Password), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return client;
    }

    /// <summary>
    /// Moves the clock on to just after the attacker lands and reads its army, which settles the attack (a wiped-out attacker
    /// reads as not found).
    /// </summary>
    private async Task LandTheAttackAsync(Scene scene)
    {
        _factory.Time.Advance(TimeSpan.FromHours(4.5));
        using var attacker = AttackerClient();
        var read = await attacker.GetAsync($"/api/v1/armies/{scene.AttackerArmyId}", Ct);
        Assert.Contains(read.StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.NotFound });
    }

    private async Task<T> InDbAsync<T>(Func<GameDbContext, Task<T>> read)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        return await read(scope.ServiceProvider.GetRequiredService<GameDbContext>());
    }

    [Fact]
    public async Task An_attack_on_an_empty_camp_destroys_it_and_both_players_keep_the_battle_report()
    {
        var scene = await PlantAsync(campArmyProvisions: null);

        await LandTheAttackAsync(scene);

        Assert.False(await InDbAsync(db => db.Settlements.AnyAsync(s => s.Id == scene.CampId, Ct)));
        Assert.False(await InDbAsync(db => db.PlacedBuildings.AnyAsync(b => b.SettlementId == scene.CampId, Ct)));

        using var owner = await OwnerClientAsync(scene);
        var mine = await owner.GetFromJsonAsync<List<SettlementSummary>>(
            $"/api/v1/worlds/{scene.WorldId}/settlements/mine", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal([scene.HomeId], mine!.Select(s => s.Id));
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/v1/settlements/{scene.CampId}", Ct)).StatusCode);

        // The report names the camp that is gone; the defender still has it, and so does the attacker.
        var ownerReports = await owner.GetFromJsonAsync<List<BattleReportResponse>>(
            $"/api/v1/worlds/{scene.WorldId}/reports", SqliteApiFixture.StrictJson, Ct);
        var report = Assert.Single(ownerReports!);
        Assert.Equal(scene.CampId, report.DefenderSettlementId);
        Assert.Equal(scene.AttackerArmyId, report.AttackerArmyId);

        using var attacker = AttackerClient();
        var attackerReports = await attacker.GetFromJsonAsync<List<BattleReportResponse>>(
            $"/api/v1/worlds/{scene.WorldId}/reports", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(report.Id, Assert.Single(attackerReports!).Id);

        // The attacker walks home with its loot; the camp is no longer its target.
        var back = await attacker.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{scene.AttackerArmyId}", SqliteApiFixture.StrictJson, Ct);
        Assert.True(back!.Movement!.IsReturning);
        Assert.Null(back.TargetSettlementId);
        Assert.Equal(scene.AttackerSettlementId, back.SettlementId);
    }

    [Fact]
    public async Task An_attack_that_leaves_troops_in_the_camp_does_not_destroy_it()
    {
        // 50 spearmen hold against 10 axemen.
        var scene = await PlantAsync(campArmyProvisions: null, campGarrison: [(UnitType.Spearman, 50)]);

        await LandTheAttackAsync(scene);

        Assert.True(await InDbAsync(db => db.Settlements.AnyAsync(s => s.Id == scene.CampId, Ct)));
        Assert.False(await InDbAsync(db => db.Armies.AnyAsync(a => a.Id == scene.AttackerArmyId, Ct)));
        Assert.Single(await InDbAsync(db => db.BattleReports.Where(r => r.DefenderSettlementId == scene.CampId).ToListAsync(Ct)));
    }

    [Fact]
    public async Task A_mutual_wipe_leaves_the_camp_standing()
    {
        // One axeman (40) beats one spearman (35) and loses (35/40)^1.5 = 82 % of itself: nobody is left on either side.
        var scene = await PlantAsync(
            campArmyProvisions: null, attackUnits: [(UnitType.Axeman, 1)], campGarrison: [(UnitType.Spearman, 1)]);

        await LandTheAttackAsync(scene);

        Assert.False(await InDbAsync(db => db.Armies.AnyAsync(a => a.Id == scene.AttackerArmyId, Ct)));
        Assert.True(await InDbAsync(db => db.Settlements.AnyAsync(s => s.Id == scene.CampId, Ct)));
        Assert.False(await InDbAsync(db => db.UnitStacks.AnyAsync(g => g.SettlementId == scene.CampId && g.Count > 0, Ct)));
    }

    [Fact]
    public async Task A_raid_that_leaves_nobody_in_the_camp_only_plunders_it_and_its_catapults_do_no_damage()
    {
        var scene = await PlantAsync(
            campArmyProvisions: null, mission: ArmyMission.Raid, attackUnits: [(UnitType.Axeman, 10), (UnitType.Catapult, 4)]);

        await LandTheAttackAsync(scene);

        Assert.True(await InDbAsync(db => db.Settlements.AnyAsync(s => s.Id == scene.CampId, Ct)));
        Assert.Equal(1, await InDbAsync(db => db.PlacedBuildings.Where(b => b.SettlementId == scene.CampId && b.Type == BuildingType.BeachCamp)
            .Select(b => b.Level).SingleAsync(Ct)));
        var report = await InDbAsync(db => db.BattleReports.SingleAsync(r => r.DefenderSettlementId == scene.CampId, Ct));
        Assert.True(report.WasRaid);
        Assert.Null(report.SiegeLevelAfter);
    }

    [Fact]
    public async Task Catapults_against_a_camp_guarded_only_by_a_guest_fleet_neither_destroy_it_nor_lower_it()
    {
        var scene = await PlantAsync(
            campArmyProvisions: null, attackUnits: [(UnitType.Axeman, 10), (UnitType.Catapult, 10)]);
        await PlantGuestAsync(scene, [(UnitType.Longship, 3)]);

        await LandTheAttackAsync(scene);

        Assert.True(await InDbAsync(db => db.Settlements.AnyAsync(s => s.Id == scene.CampId, Ct)));
        Assert.Equal(1, await InDbAsync(db => db.PlacedBuildings.Where(b => b.SettlementId == scene.CampId && b.Type == BuildingType.BeachCamp)
            .Select(b => b.Level).SingleAsync(Ct)));
        var report = await InDbAsync(db => db.BattleReports.SingleAsync(r => r.DefenderSettlementId == scene.CampId, Ct));
        Assert.Null(report.SiegeLevelAfter);
    }

    [Fact]
    public async Task A_land_attack_that_kills_every_land_troop_while_the_camps_own_fleet_survives_does_not_destroy_it()
    {
        var scene = await PlantAsync(
            campArmyProvisions: null, campGarrison: [(UnitType.Spearman, 2), (UnitType.Longship, 2)]);

        await LandTheAttackAsync(scene);

        Assert.True(await InDbAsync(db => db.Settlements.AnyAsync(s => s.Id == scene.CampId, Ct)));
        var garrison = await InDbAsync(db => db.UnitStacks.Where(g => g.SettlementId == scene.CampId && g.Count > 0).ToListAsync(Ct));
        Assert.Equal([UnitType.Longship], garrison.Select(g => g.UnitType).Distinct());
    }

    /// <summary>Plants an army of the attacker's rival (the camp owner's home settlement) supporting the camp.</summary>
    private async Task<Guid> PlantGuestAsync(Scene scene, (UnitType Unit, int Count)[] units)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var guestHome = Settlement(scene.WorldId, await db.Settlements.Where(s => s.Id == scene.HomeId).Select(s => s.IslandId).SingleAsync(Ct),
            "camp-friend", SystemUserIds.Abandoned, new HexCoord(-12, 0), _factory.Time.GetUtcNow() - TimeSpan.FromDays(1));
        db.Settlements.Add(guestHome);
        var now = _factory.Time.GetUtcNow();
        var guest = new ArmyEntity
        {
            SettlementId = guestHome.Id,
            HomeSpotQ = guestHome.CentreQ,
            HomeSpotR = guestHome.CentreR,
            Mission = (int)ArmyMission.Support,
            AtHome = false,
            IsSupporting = true,
            TargetSettlementId = scene.CampId,
            TargetBuildingQ = CampHex.Q,
            TargetBuildingR = CampHex.R,
            Provisions = 100,
            DepartedAt = now,
            Path = [new HexPoint(CampHex.Q, CampHex.R)],
            CumulativeHours = [0],
            EdgeHours = [0],
            IsReturning = false,
            Stacks = [.. units.Select(u => new ArmyUnitStackEntity { UnitType = u.Unit, Count = u.Count })],
        };
        db.AddArmyRows(guest);
        await db.SaveChangesAsync(Ct);
        return guest.Id;
    }

    [Fact]
    public async Task A_camp_army_out_in_the_field_gets_the_owners_settlement_it_can_reach_as_its_new_home()
    {
        var scene = await PlantAsync(campArmyProvisions: 100);

        await LandTheAttackAsync(scene);

        var army = await InDbAsync(db => db.Armies.SingleAsync(a => a.Id == scene.CampArmyId, Ct));
        Assert.Equal(scene.HomeId, army.SettlementId);
        Assert.Equal((HomeHex.Q, HomeHex.R), (army.HomeSpotQ, army.HomeSpotR));
        Assert.False(army.IsStranded);
    }

    [Fact]
    public async Task A_camp_army_that_can_reach_no_spot_has_no_home_shows_in_the_owners_list_and_starves_with_a_report()
    {
        // 15 food: ten left at the fall, not enough to finish the march and walk back to the home settlement.
        var scene = await PlantAsync(campArmyProvisions: 15);

        await LandTheAttackAsync(scene);

        using (var owner = await OwnerClientAsync(scene))
        {
            var listed = await owner.GetFromJsonAsync<List<ArmySummary>>(
                $"/api/v1/settlements/{scene.HomeId}/armies", SqliteApiFixture.StrictJson, Ct);
            Assert.Contains(listed!, a => a.Id == scene.CampArmyId);

            var army = await owner.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{scene.CampArmyId}", SqliteApiFixture.StrictJson, Ct);
            Assert.Null(army!.SettlementId);
            Assert.True(army.Movement!.IsStranded);
            // It stays where it was when the camp fell: four hexes down its road.
            Assert.Equal(new HexPointResponse(0, 4), army.Position);
            var startedAt = _factory.Time.GetUtcNow() - TimeSpan.FromHours(4.5);
            Assert.Equal(startedAt + TimeSpan.FromHours(15 / 1.25), army.StarvesAt!.Value, TimeSpan.FromSeconds(1));

            var recall = await owner.PostAsync($"/api/v1/armies/{scene.CampArmyId}/recall", null, Ct);
            Assert.Equal(HttpStatusCode.Conflict, recall.StatusCode);
            Assert.Equal("NoHome", await recall.RejectionAsync(Ct));
        }

        _factory.Time.Advance(TimeSpan.FromHours(8));
        using var later = await OwnerClientAsync(scene);
        Assert.Equal(HttpStatusCode.NotFound, (await later.GetAsync($"/api/v1/armies/{scene.CampArmyId}", Ct)).StatusCode);
        var reports = await later.GetFromJsonAsync<List<ArmyReportResponse>>(
            $"/api/v1/worlds/{scene.WorldId}/army-reports", SqliteApiFixture.StrictJson, Ct);
        var starved = Assert.Single(reports!);
        Assert.Equal("starved", starved.Kind);
        Assert.Equal(scene.CampArmyId, starved.ArmyId);
        Assert.Equal(new HexPointResponse(0, 4), starved.Hex);
    }

    /// <summary>
    /// Half an hour after the attacker landed, before anything settled its attack, the owner calls the camp's army back (an order
    /// that starts then); then the attacker's army is read, which settles the attack and destroys the camp.
    /// </summary>
    private async Task<(DateTimeOffset OrderedAt, ArmyResponse Army)> RecallTheCampArmyThenLandTheAttackAsync(Scene scene)
    {
        _factory.Time.Advance(TimeSpan.FromHours(4.5));
        var orderedAt = _factory.Time.GetUtcNow();
        using var owner = await OwnerClientAsync(scene);
        var ordered = await owner.PostAsync($"/api/v1/armies/{scene.CampArmyId}/recall", null, Ct);
        Assert.True(ordered.StatusCode == HttpStatusCode.OK, await ordered.Content.ReadAsStringAsync(Ct));
        Assert.True(await InDbAsync(db => db.Settlements.AnyAsync(s => s.Id == scene.CampId, Ct)));

        using var attacker = AttackerClient();
        Assert.Equal(HttpStatusCode.OK, (await attacker.GetAsync($"/api/v1/armies/{scene.AttackerArmyId}", Ct)).StatusCode);
        Assert.False(await InDbAsync(db => db.Settlements.AnyAsync(s => s.Id == scene.CampId, Ct)));

        var army = await owner.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{scene.CampArmyId}", SqliteApiFixture.StrictJson, Ct);
        return (orderedAt, army!);
    }

    [Fact]
    public async Task A_camp_army_called_back_after_the_battle_is_rehomed_from_where_its_order_started_not_rewound_to_the_battle()
    {
        var scene = await PlantAsync(campArmyProvisions: 100);

        var (orderedAt, army) = await RecallTheCampArmyThenLandTheAttackAsync(scene);

        Assert.Equal(scene.HomeId, army.SettlementId);
        Assert.True(army.Movement!.IsReturning);
        Assert.Equal(orderedAt, army.Movement.DepartedAt, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task A_camp_army_called_back_after_the_battle_that_loses_its_home_stays_where_its_order_started_not_rewound_to_the_battle()
    {
        // 8 food: 2.4 left when it is called back, not enough for the 2.5 hours' march to the home settlement.
        var scene = await PlantAsync(campArmyProvisions: 8);

        var (orderedAt, army) = await RecallTheCampArmyThenLandTheAttackAsync(scene);

        Assert.Null(army.SettlementId);
        Assert.True(army.Movement!.IsStranded);
        Assert.Equal(orderedAt, army.Movement.DepartedAt, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task An_army_without_a_home_sent_to_the_owners_longhouse_folds_in_there()
    {
        var scene = await PlantAsync(campArmyProvisions: 15);
        await LandTheAttackAsync(scene);

        using (var owner = await OwnerClientAsync(scene))
        {
            var ordered = await owner.PostJsonAsync(
                $"/api/v1/armies/{scene.CampArmyId}/orders", new FieldOrderRequest(null, new HexPointRequest(HomeHex.Q, HomeHex.R)), Ct);
            Assert.Equal(HttpStatusCode.OK, ordered.StatusCode);
            var moving = await ordered.ReadStrictAsync<ArmyResponse>(Ct);
            Assert.Null(moving.SettlementId);
            Assert.False(moving.Movement!.IsStranded);
        }

        _factory.Time.Advance(TimeSpan.FromHours(4));
        using var later = await OwnerClientAsync(scene);
        Assert.Equal(HttpStatusCode.NotFound, (await later.GetAsync($"/api/v1/armies/{scene.CampArmyId}", Ct)).StatusCode);
        var home = await later.GetFromJsonAsync<SettlementResponse>($"/api/v1/settlements/{scene.HomeId}", SqliteApiFixture.StrictJson, Ct);
        Assert.Contains(home!.Garrison, g => g.Unit == "spearman" && g.Count == 5);
        Assert.False(await InDbAsync(db => db.Armies.AnyAsync(a => a.Id == scene.CampArmyId, Ct)));
    }

    [Fact]
    public async Task Another_players_army_on_its_way_to_the_destroyed_camp_goes_on_to_its_hex_and_stands_there()
    {
        var scene = await PlantAsync(campArmyProvisions: null);
        Guid secondId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            // Sent at the camp too, landing four hours after the first.
            var second = Army(
                scene.AttackerSettlementId, AttackerHome, [.. Enumerable.Range(0, 9).Select(i => (8 - i, 0))], [(0, 0), (1, 0)], 1_000,
                [(UnitType.Axeman, 3)]);
            second.Mission = (int)ArmyMission.Attack;
            second.TargetSettlementId = scene.CampId;
            db.AddArmyRows(second);
            await db.SaveChangesAsync(Ct);
            secondId = second.Id;
        }

        await LandTheAttackAsync(scene);
        Assert.False(await InDbAsync(db => db.Settlements.AnyAsync(s => s.Id == scene.CampId, Ct)));

        _factory.Time.Advance(TimeSpan.FromHours(5));
        using var attacker = AttackerClient();
        var standing = await attacker.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{secondId}", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal("move", standing!.Mission);
        Assert.Null(standing.TargetSettlementId);
        Assert.False(standing.Movement!.IsReturning);
        Assert.Equal(new HexPointResponse(CampHex.Q, CampHex.R), standing.Position);
        Assert.Equal(3, standing.Stacks.Sum(s => s.Count));
        Assert.Single(await InDbAsync(db => db.BattleReports.Where(r => r.DefenderSettlementId == scene.CampId).ToListAsync(Ct)));
    }

    [Fact]
    public async Task Every_kind_of_army_around_a_falling_camp_lets_go_of_it_before_its_row_is_deleted()
    {
        // The camp's own army out south, rehomed to the home settlement.
        var scene = await PlantAsync(campArmyProvisions: 100);
        (int Q, int R)[] south = [.. Enumerable.Range(0, 11).Select(i => (0, i))];
        (int Q, int R)[] east = [.. Enumerable.Range(2, 11).Select(i => (i, 0))];
        Guid stranded, returning, grouped, supporting, enRoute, comingBack, foreignGroup, campGathering, foreignGathering;

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var now = _factory.Time.GetUtcNow();

            // The camp's own: one out of food (left without a home), one on its way back, one walking to a gathering of the camp,
            // one supporting the home settlement.
            var outOfFood = Army(scene.CampId, CampHex, south, [.. south.Reverse()], 15, [(UnitType.Spearman, 5)]);
            var back = Army(scene.CampId, CampHex, [.. south.Reverse()], [.. south.Reverse()], 100, [(UnitType.Spearman, 5)]);
            back.IsReturning = true;
            back.TurnAroundAt = now;
            var gathering = new GatheringEntity
            {
                SettlementId = scene.CampId,
                HexQ = 0,
                HexR = 8,
                DepartAt = now + TimeSpan.FromHours(20),
                Mission = (int)ArmyMission.Move,
                Stops = [new HexPoint(0, 10)],
                HomeSpotQ = CampHex.Q,
                HomeSpotR = CampHex.R,
            };
            db.Gatherings.Add(gathering);
            var group = Army(scene.CampId, CampHex, [.. south.Take(9)], [.. south.Take(9).Reverse()], 100, [(UnitType.Spearman, 5)]);
            group.GatheringId = gathering.Id;
            group.GatherDepartAt = gathering.DepartAt;
            var guestAtHome = Army(scene.CampId, CampHex, [(HomeHex.Q, HomeHex.R)], [(HomeHex.Q, HomeHex.R)], 100, [(UnitType.Spearman, 5)]);
            guestAtHome.Mission = (int)ArmyMission.Support;
            guestAtHome.IsSupporting = true;
            guestAtHome.TargetSettlementId = scene.HomeId;
            guestAtHome.TargetBuildingQ = HomeHex.Q;
            guestAtHome.TargetBuildingR = HomeHex.R;

            // The attacker's: a second attack on its way, a raid on its way back from the camp, and a group of a gathering sent at it.
            var second = Army(scene.AttackerSettlementId, AttackerHome, [.. Enumerable.Range(0, 9).Select(i => (8 - i, 0))], [(0, 0), (1, 0)], 1_000, [(UnitType.Axeman, 3)]);
            second.Mission = (int)ArmyMission.Attack;
            second.TargetSettlementId = scene.CampId;
            var raidBack = Army(scene.AttackerSettlementId, AttackerHome, east, east, 1_000, [(UnitType.Axeman, 3)]);
            raidBack.Mission = (int)ArmyMission.Raid;
            raidBack.TargetSettlementId = scene.CampId;
            raidBack.IsReturning = true;
            raidBack.TurnAroundAt = now;
            var sentAt = new GatheringEntity
            {
                SettlementId = scene.AttackerSettlementId,
                HexQ = 14,
                HexR = 0,
                DepartAt = now + TimeSpan.FromHours(20),
                Mission = (int)ArmyMission.Attack,
                TargetSettlementId = scene.CampId,
                HomeSpotQ = AttackerHome.Q,
                HomeSpotR = AttackerHome.R,
            };
            db.Gatherings.Add(sentAt);
            var foreign = Army(scene.AttackerSettlementId, AttackerHome, [.. Enumerable.Range(14, 7).Select(i => (34 - i, 0))], [(14, 0), (15, 0)], 1_000, [(UnitType.Axeman, 3)]);
            foreign.GatheringId = sentAt.Id;
            foreign.GatherDepartAt = sentAt.DepartAt;

            db.AddArmyRows(outOfFood, back, group, guestAtHome, second, raidBack, foreign);
            await db.SaveChangesAsync(Ct);
            (stranded, returning, grouped, supporting, enRoute, comingBack, foreignGroup, campGathering, foreignGathering) =
                (outOfFood.Id, back.Id, group.Id, guestAtHome.Id, second.Id, raidBack.Id, foreign.Id, gathering.Id, sentAt.Id);
        }

        // A guest of a third player stands in the camp and dies in the fight.
        var guest = await PlantGuestAsync(scene, [(UnitType.Spearman, 1)]);

        await LandTheAttackAsync(scene);

        Assert.False(await InDbAsync(db => db.Settlements.AnyAsync(s => s.Id == scene.CampId, Ct)));
        Assert.False(await InDbAsync(db => db.Armies.AnyAsync(a => a.SettlementId == scene.CampId || a.TargetSettlementId == scene.CampId, Ct)));
        Assert.False(await InDbAsync(db => db.Gatherings.AnyAsync(g => g.SettlementId == scene.CampId || g.TargetSettlementId == scene.CampId, Ct)));
        Assert.False(await InDbAsync(db => db.Armies.AnyAsync(a => a.Id == guest, Ct)));
        Assert.False(await InDbAsync(db => db.Gatherings.AnyAsync(g => g.Id == campGathering, Ct)));

        var armies = await InDbAsync(db => db.Armies.AsNoTracking().ToDictionaryAsync(a => a.Id, Ct));
        Assert.Null(armies[stranded].SettlementId);
        Assert.Equal(scene.HomeId, armies[returning].SettlementId);
        Assert.Equal(scene.HomeId, armies[supporting].SettlementId);
        Assert.Equal(scene.HomeId, armies[grouped].SettlementId);
        Assert.Null(armies[grouped].GatheringId);
        Assert.Null(armies[grouped].GatherDepartAt);
        Assert.Equal((int)ArmyMission.Move, armies[enRoute].Mission);
        Assert.True(armies[comingBack].IsReturning);
        Assert.Equal(foreignGathering, armies[foreignGroup].GatheringId);
        Assert.Equal(
            (int)ArmyMission.Move, await InDbAsync(db => db.Gatherings.Where(g => g.Id == foreignGathering).Select(g => g.Mission).SingleAsync(Ct)));
    }
}
