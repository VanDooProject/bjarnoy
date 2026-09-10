using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Movement = Bjarnoy.Domain.Movement.Movement;

namespace Bjarnoy.Infrastructure.Tests.Combat;

/// <summary>
/// Infra-level coverage for <see cref="FieldBattleService"/> (issue #206):
/// hostility short-circuits, home-hex exclusion, a full end-to-end
/// interception (winner keeps marching, loser is force-retreated home),
/// an exact tie, and the exactly-once claim under a simulated race between
/// two independent <see cref="GameDbContext"/> instances sharing one
/// connection. Uses the same in-memory SQLite pattern as
/// <c>PlotReservationServiceTests</c>.
/// </summary>
public sealed class FieldBattleServiceTests : IDisposable
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public FieldBattleServiceTests()
    {
        _connection.Open();
        using var setup = CreateContext();
        setup.Database.EnsureCreated();
    }

    public void Dispose() => _connection.Dispose();

    private GameDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<GameDbContext>().UseSqlite(_connection).Options);

    /// <summary>
    /// All-land generation options: a single, huge island covering every hex
    /// near the origin, so movement paths and <see cref="Army.ForceFieldRetreat"/>'s
    /// pathfinding never have to think about water.
    /// </summary>
    private static WorldGenerationOptions LandOptions => new()
    {
        Seed = 1,
        Radius = 500,
        // IslandCellSize bumped 2->250 and the multi-lobe/warp fields zeroed
        // out: with the island-shape retune, the reach-budget check (see
        // WorldGenerationOptions.Validate) scales with IslandMaxElongation/
        // IslandLobeMaxScale/IslandCoastWarp, none of which this all-land
        // hack cares about (it just wants huge overlapping plain circles).
        IslandCellSize = 250,
        IslandChance = 1.0,
        IslandMinRadius = 1000,
        IslandMaxRadius = 1000,
        IslandMaxElongation = 0.0,
        IslandLobeMinScale = 0.3,
        IslandLobeMaxScale = 0.3,
        IslandCoastWarp = 0.0,
        BeachThreshold = 1.0,
        MountainThreshold = 0.0,
        MountainRockiness = 2.0,
        ForestRockiness = 2.0,
    };

    private Guid AddWorld(GameDbContext db)
    {
        var options = LandOptions;
        var world = new WorldEntity { Name = "Test", MaxPlayers = 100 };
        world.ApplyGenerationOptions(options);
        db.Worlds.Add(world);
        return world.Id;
    }

    private Guid AddUser(GameDbContext db, Guid? guildId = null)
    {
        var user = new UserEntity
        {
            UserName = $"user-{Guid.NewGuid()}",
            NormalizedUserName = $"user-{Guid.NewGuid()}",
            PasswordHash = "hash",
            GuildId = guildId,
        };
        db.Users.Add(user);
        return user.Id;
    }

    private Guid AddIsland(GameDbContext db, Guid worldId)
    {
        var island = new IslandEntity
        {
            WorldId = worldId,
            Index = 0,
            Name = "Test Island",
            CentreQ = 0,
            CentreR = 0,
            StartPositions = [new HexPoint(0, 0)],
        };
        db.Islands.Add(island);
        return island.Id;
    }

    private Guid AddSettlement(GameDbContext db, Guid worldId, Guid islandId, Guid userId, int centreQ, int centreR)
    {
        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            Name = "Home",
            OwnerName = "Owner",
            OwnerId = userId.ToString(),
            UserId = userId,
            CentreQ = centreQ,
            CentreR = centreR,
        };
        db.Settlements.Add(settlement);
        return settlement.Id;
    }

    private static ArmyEntity MakeInTransitArmy(
        Guid settlementId,
        (int Q, int R)[] path,
        double[] cumulativeHours,
        DateTimeOffset departedAt,
        params (UnitType Type, int Count)[] stacks)
    {
        var army = new ArmyEntity
        {
            SettlementId = settlementId,
            Mission = (int)ArmyMission.Move,
            AtHome = false,
            DepartedAt = departedAt,
            Path = [.. path.Select(p => new HexPoint(p.Q, p.R))],
            CumulativeHours = [.. cumulativeHours],
            ReturnPath = [.. path.Reverse().Select(p => new HexPoint(p.Q, p.R))],
            ReturnCumulativeHours = [.. cumulativeHours],
            TurnAroundAt = departedAt + TimeSpan.FromHours(cumulativeHours[^1]),
            IsReturning = false,
        };

        foreach (var (type, count) in stacks)
        {
            army.Stacks.Add(new ArmyUnitStackEntity { ArmyId = army.Id, UnitType = type, Count = count });
        }

        return army;
    }

    /// <summary>Mirrors <c>ArmyService</c>'s own <c>LoadArmyAsync</c> include chain — everything <see cref="FieldBattleService"/> touches.</summary>
    private static Task<ArmyEntity?> LoadAsync(GameDbContext db, Guid armyId, CancellationToken ct) =>
        db.Armies
            .Include(a => a.Stacks)
            .Include(a => a.Settlement!).ThenInclude(s => s.World)
            .Include(a => a.Settlement!).ThenInclude(s => s.Owner)
            .Include(a => a.Settlement!).ThenInclude(s => s.Buildings)
            .FirstOrDefaultAsync(a => a.Id == armyId, ct);

    [Fact]
    public async Task Same_owner_armies_never_fight_even_on_a_head_on_crossing()
    {
        using var db = CreateContext();
        var worldId = AddWorld(db);
        var islandId = AddIsland(db, worldId);
        var userId = AddUser(db);
        var settlementA = AddSettlement(db, worldId, islandId, userId, -20, 0);
        var settlementB = AddSettlement(db, worldId, islandId, userId, 20, 0);

        var armyA = MakeInTransitArmy(
            settlementA, [(-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0)], [0, 1, 2, 3, 4], T0, (UnitType.Axeman, 10));
        var armyB = MakeInTransitArmy(
            settlementB, [(2, 0), (1, 0), (0, 0), (-1, 0), (-2, 0)], [0, 1, 2, 3, 4], T0, (UnitType.Spearman, 5));
        db.Armies.AddRange(armyA, armyB);
        await db.SaveChangesAsync(Ct);

        var service = new FieldBattleService(db, NullLogger<FieldBattleService>.Instance);
        var loaded = (await LoadAsync(db, armyA.Id, Ct))!;
        var resolved = await service.TryResolveAsync(loaded, loaded.ToDomain(), T0 + TimeSpan.FromHours(3), Ct);

        Assert.False(resolved);
        Assert.Empty(db.FieldBattleReports);
    }

    [Fact]
    public async Task Same_guild_armies_never_fight()
    {
        using var db = CreateContext();
        var worldId = AddWorld(db);
        var islandId = AddIsland(db, worldId);
        var guildId = Guid.NewGuid();
        var userA = AddUser(db, guildId);
        var userB = AddUser(db, guildId);
        var settlementA = AddSettlement(db, worldId, islandId, userA, -20, 0);
        var settlementB = AddSettlement(db, worldId, islandId, userB, 20, 0);

        var armyA = MakeInTransitArmy(
            settlementA, [(-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0)], [0, 1, 2, 3, 4], T0, (UnitType.Axeman, 10));
        var armyB = MakeInTransitArmy(
            settlementB, [(2, 0), (1, 0), (0, 0), (-1, 0), (-2, 0)], [0, 1, 2, 3, 4], T0, (UnitType.Spearman, 5));
        db.Armies.AddRange(armyA, armyB);
        await db.SaveChangesAsync(Ct);

        var service = new FieldBattleService(db, NullLogger<FieldBattleService>.Instance);
        var loaded = (await LoadAsync(db, armyA.Id, Ct))!;
        var resolved = await service.TryResolveAsync(loaded, loaded.ToDomain(), T0 + TimeSpan.FromHours(3), Ct);

        Assert.False(resolved);
        Assert.Empty(db.FieldBattleReports);
    }

    [Fact]
    public async Task Arrivals_on_an_armys_own_home_hex_are_never_treated_as_a_meeting()
    {
        // Both armies' paths pass through side B's home hex (20,0) at the
        // same moment — this must never be reported as an interception,
        // matching MovementOccupancy.EarliestMeeting's excludeHex contract.
        using var db = CreateContext();
        var worldId = AddWorld(db);
        var islandId = AddIsland(db, worldId);
        var userA = AddUser(db);
        var userB = AddUser(db);
        var settlementA = AddSettlement(db, worldId, islandId, userA, -20, 0);
        var settlementB = AddSettlement(db, worldId, islandId, userB, 20, 0);

        var armyA = MakeInTransitArmy(
            settlementA, [(18, 0), (19, 0), (20, 0)], [0, 1, 2], T0, (UnitType.Axeman, 10));
        var armyB = MakeInTransitArmy(
            settlementB, [(20, 0)], [0], T0, (UnitType.Spearman, 5));
        db.Armies.AddRange(armyA, armyB);
        await db.SaveChangesAsync(Ct);

        var service = new FieldBattleService(db, NullLogger<FieldBattleService>.Instance);
        var loaded = (await LoadAsync(db, armyA.Id, Ct))!;
        var resolved = await service.TryResolveAsync(loaded, loaded.ToDomain(), T0 + TimeSpan.FromHours(3), Ct);

        Assert.False(resolved);
        Assert.Empty(db.FieldBattleReports);
    }

    [Fact]
    public async Task A_hostile_meeting_resolves_the_winner_keeps_marching_and_the_loser_is_force_retreated()
    {
        using var db = CreateContext();
        var worldId = AddWorld(db);
        var islandId = AddIsland(db, worldId);
        var userA = AddUser(db);
        var userB = AddUser(db);
        var settlementA = AddSettlement(db, worldId, islandId, userA, -20, 0);
        var settlementB = AddSettlement(db, worldId, islandId, userB, 20, 0);

        // Both cross hex (0,0) during [T0+2h, T0+3h) — a clean, unambiguous meeting.
        var armyA = MakeInTransitArmy(
            settlementA, [(-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0)], [0, 1, 2, 3, 4], T0, (UnitType.Axeman, 10));
        var armyB = MakeInTransitArmy(
            settlementB, [(2, 0), (1, 0), (0, 0), (-1, 0), (-2, 0)], [0, 1, 2, 3, 4], T0, (UnitType.Spearman, 5));
        db.Armies.AddRange(armyA, armyB);
        await db.SaveChangesAsync(Ct);

        var service = new FieldBattleService(db, NullLogger<FieldBattleService>.Instance);
        var loadedA = (await LoadAsync(db, armyA.Id, Ct))!;
        var now = T0 + TimeSpan.FromHours(3);
        var resolved = await service.TryResolveAsync(loadedA, loadedA.ToDomain(), now, Ct);
        Assert.True(resolved);
        await db.SaveChangesAsync(Ct);

        var report = Assert.Single(db.FieldBattleReports);
        Assert.Equal(0, report.HexQ);
        Assert.Equal(0, report.HexR);

        // 10 Axemen (Attack 40 each -> 400) beat 5 Spearmen (Attack 15 each -> 75) on neutral ground.
        Assert.Equal((int)FieldBattleWinner.SideA, report.Winner);

        var winnerAfter = (await LoadAsync(db, armyA.Id, Ct))!.ToDomain();
        Assert.IsType<ArmyLocation.InTransit>(winnerAfter.Location);
        var winnerTransit = (ArmyLocation.InTransit)winnerAfter.Location;
        // The winner's own journey is untouched.
        Assert.False(winnerTransit.Movement.IsReturning);
        Assert.Equal(armyA.Path, ((List<HexPoint>)[.. winnerTransit.Movement.Path.Select(c => new HexPoint(c.Q, c.R))]));

        var loserAfter = (await LoadAsync(db, armyB.Id, Ct))!.ToDomain();
        Assert.IsType<ArmyLocation.InTransit>(loserAfter.Location);
        var loserTransit = (ArmyLocation.InTransit)loserAfter.Location;
        // The loser was forced onto a brand-new retreat leg, immune and heading home.
        Assert.True(loserTransit.Movement.IsReturning);
        Assert.True(loserTransit.Movement.RetreatImmune);
        Assert.Equal(new HexCoord(0, 0), loserTransit.Movement.Path[0]);
    }

    [Fact]
    public async Task An_exact_tie_leaves_both_sides_with_survivors_and_no_loot_changes_hands()
    {
        using var db = CreateContext();
        var worldId = AddWorld(db);
        var islandId = AddIsland(db, worldId);
        var userA = AddUser(db);
        var userB = AddUser(db);
        var settlementA = AddSettlement(db, worldId, islandId, userA, -20, 0);
        var settlementB = AddSettlement(db, worldId, islandId, userB, 20, 0);

        // Identical stacks -> identical Attack power -> a tie.
        var armyA = MakeInTransitArmy(
            settlementA, [(-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0)], [0, 1, 2, 3, 4], T0, (UnitType.Axeman, 10));
        var armyB = MakeInTransitArmy(
            settlementB, [(2, 0), (1, 0), (0, 0), (-1, 0), (-2, 0)], [0, 1, 2, 3, 4], T0, (UnitType.Axeman, 10));
        db.Armies.AddRange(armyA, armyB);
        await db.SaveChangesAsync(Ct);

        var service = new FieldBattleService(db, NullLogger<FieldBattleService>.Instance);
        var loadedA = (await LoadAsync(db, armyA.Id, Ct))!;
        var resolved = await service.TryResolveAsync(loadedA, loadedA.ToDomain(), T0 + TimeSpan.FromHours(3), Ct);
        Assert.True(resolved);
        await db.SaveChangesAsync(Ct);

        var report = Assert.Single(db.FieldBattleReports);
        Assert.Equal(0.0, report.LootWood + report.LootStone + report.LootFood + report.LootIron);

        var afterA = (await LoadAsync(db, armyA.Id, Ct))!.ToDomain();
        var afterB = (await LoadAsync(db, armyB.Id, Ct))!.ToDomain();
        Assert.IsType<ArmyLocation.InTransit>(afterA.Location);
        Assert.IsType<ArmyLocation.InTransit>(afterB.Location);
        Assert.True(((ArmyLocation.InTransit)afterA.Location).Movement.IsReturning);
        Assert.True(((ArmyLocation.InTransit)afterB.Location).Movement.IsReturning);
        // Raid-capped 50% loss on a tie, floor-rounded: 10 -> at least 5 survivors, some losses.
        Assert.True(afterA.Stacks.Sum(s => s.Count) is > 0 and < 10);
        Assert.True(afterB.Stacks.Sum(s => s.Count) is > 0 and < 10);
    }

    [Fact]
    public async Task Concurrent_resolution_of_the_same_meeting_happens_exactly_once()
    {
        // Two independent GameDbContext instances (the shape two concurrent
        // requests would use) racing to resolve the very same interception —
        // the deterministic claim id must let only one of them win.
        using var setupDb = CreateContext();
        var worldId = AddWorld(setupDb);
        var islandId = AddIsland(setupDb, worldId);
        var userA = AddUser(setupDb);
        var userB = AddUser(setupDb);
        var settlementA = AddSettlement(setupDb, worldId, islandId, userA, -20, 0);
        var settlementB = AddSettlement(setupDb, worldId, islandId, userB, 20, 0);

        var armyA = MakeInTransitArmy(
            settlementA, [(-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0)], [0, 1, 2, 3, 4], T0, (UnitType.Axeman, 10));
        var armyB = MakeInTransitArmy(
            settlementB, [(2, 0), (1, 0), (0, 0), (-1, 0), (-2, 0)], [0, 1, 2, 3, 4], T0, (UnitType.Spearman, 5));
        setupDb.Armies.AddRange(armyA, armyB);
        await setupDb.SaveChangesAsync(Ct);

        using var db1 = CreateContext();
        using var db2 = CreateContext();
        var service1 = new FieldBattleService(db1, NullLogger<FieldBattleService>.Instance);
        var service2 = new FieldBattleService(db2, NullLogger<FieldBattleService>.Instance);

        var loaded1 = (await LoadAsync(db1, armyA.Id, Ct))!;
        var loaded2 = (await LoadAsync(db2, armyA.Id, Ct))!;
        var now = T0 + TimeSpan.FromHours(3);

        // db1 claims first (its own dedicated SaveChangesAsync inside TryClaimAsync
        // commits immediately, before db2 gets a chance to insert the same row).
        var result1 = await service1.TryResolveAsync(loaded1, loaded1.ToDomain(), now, Ct);
        var result2 = await service2.TryResolveAsync(loaded2, loaded2.ToDomain(), now, Ct);

        Assert.True(result1);
        Assert.False(result2);

        await db1.SaveChangesAsync(Ct);

        using var verify = CreateContext();
        Assert.Equal(1, await verify.FieldBattleReports.CountAsync(Ct));
        Assert.Equal(1, await verify.FieldBattleClaims.CountAsync(Ct));
    }

}
