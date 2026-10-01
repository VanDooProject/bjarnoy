using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Tests.Camps;

/// <summary>
/// <see cref="CampService"/> against a real (in-memory SQLite) model: the camp/state join, the realm and
/// building facts, the blocking index for the build rule, and the upsert. Plus the entities' domain round trips.
/// </summary>
public sealed class CampServiceTests : IDisposable
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public CampServiceTests()
    {
        _connection.Open();
        using var setup = CreateContext();
        setup.Database.EnsureCreated();
    }

    public void Dispose() => _connection.Dispose();

    private GameDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<GameDbContext>().UseSqlite(_connection).Options);

    private static WorldEntity NewWorld() => new() { Name = $"w-{Guid.NewGuid():N}", MaxPlayers = 100 };

    private static IslandEntity NewIsland(Guid worldId, int index, params CampRecord[] camps) => new()
    {
        WorldId = worldId,
        Index = index,
        Name = $"Island {index}",
        CentreQ = 0,
        CentreR = 0,
        Camps = [.. camps],
    };

    private static (SettlementEntity Settlement, UserEntity User) NewSettlement(
        Guid worldId, Guid islandId, int q, int r, params PlacedBuildingEntity[] extraBuildings)
    {
        var user = new UserEntity
        {
            UserName = $"u-{Guid.NewGuid():N}",
            NormalizedUserName = $"u-{Guid.NewGuid():N}",
            PasswordHash = "hash",
        };
        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            Name = "Home",
            OwnerName = "Owner",
            OwnerId = user.Id.ToString(),
            UserId = user.Id,
            CentreQ = q,
            CentreR = r,
        };
        settlement.Buildings.Add(new PlacedBuildingEntity
        {
            SettlementId = settlement.Id, Q = q, R = r, Type = BuildingType.Longhouse, Level = 1,
        });
        foreach (var b in extraBuildings)
        {
            b.SettlementId = settlement.Id;
            settlement.Buildings.Add(b);
        }

        return (settlement, user);
    }

    private static CampRecord Record(int q, int r, string family = CampFamilies.Wolfden, int level = 3) =>
        new(q, r, family, level, 0);

    [Fact]
    public async Task Camps_without_a_row_are_pristine_and_those_with_a_row_carry_their_state()
    {
        await using var db = CreateContext();
        var world = NewWorld();
        db.Worlds.Add(world);
        var island = NewIsland(world.Id, 0, Record(10, 0), Record(20, 0, CampFamilies.Harewarren, 1));
        db.Islands.Add(island);
        var stored = new CampState(new CampGarrison(1, 2, 0), T0, null, T0.AddHours(24), 4, new ResourceAmounts(1, 2, 3, 4));
        db.CampStates.Add(CampStateEntity.FromDomain(world.Id, new HexCoord(20, 0), stored));
        await db.SaveChangesAsync(Ct);

        var camps = await new CampService(db).LoadCampsAsync(world.Id, T0, cancellationToken: Ct);

        var pristine = camps.Single(c => c.Camp.Coord == new HexCoord(10, 0));
        Assert.Equal(CampGarrison.Full(CampStrength.Strong, 3), pristine.State.Snapshot);
        Assert.Equal(0, pristine.State.Clears);
        Assert.Equal(island.Id, pristine.IslandId);

        var withRow = camps.Single(c => c.Camp.Coord == new HexCoord(20, 0));
        Assert.Equal(stored, withRow.State);
    }

    [Fact]
    public async Task Camps_can_be_narrowed_to_one_island_and_wasted_islands_can_be_left_out()
    {
        await using var db = CreateContext();
        var world = NewWorld();
        db.Worlds.Add(world);
        var a = NewIsland(world.Id, 0, Record(10, 0));
        var wasted = NewIsland(world.Id, 1, Record(50, 0, CampFamilies.Fenrirbrood));
        wasted.IsWasted = true;
        db.Islands.AddRange(a, wasted);
        await db.SaveChangesAsync(Ct);
        var service = new CampService(db);

        Assert.Equal(2, (await service.LoadCampsAsync(world.Id, T0, cancellationToken: Ct)).Count);
        Assert.Equal(a.Id, (await service.LoadCampsAsync(world.Id, T0, a.Id, cancellationToken: Ct)).Single().IslandId);
        Assert.Equal(
            CampFamilies.Wolfden,
            (await service.LoadCampsAsync(world.Id, T0, includeWasted: false, cancellationToken: Ct)).Single().Camp.Family);
    }

    [Fact]
    public async Task Other_worlds_camps_and_states_are_not_mixed_in()
    {
        await using var db = CreateContext();
        var mine = NewWorld();
        var theirs = NewWorld();
        db.Worlds.AddRange(mine, theirs);
        db.Islands.AddRange(NewIsland(mine.Id, 0, Record(10, 0)), NewIsland(theirs.Id, 0, Record(10, 0)));
        db.CampStates.Add(CampStateEntity.FromDomain(
            theirs.Id, new HexCoord(10, 0),
            new CampState(CampGarrison.Empty, T0, T0, T0.AddHours(24), 7)));
        await db.SaveChangesAsync(Ct);

        var camp = Assert.Single(await new CampService(db).LoadCampsAsync(mine.Id, T0, cancellationToken: Ct));

        Assert.Equal(0, camp.State.Clears);
    }

    [Fact]
    public async Task The_realm_is_built_from_every_settlements_claim_and_buildings()
    {
        await using var db = CreateContext();
        var world = NewWorld();
        var island = NewIsland(world.Id, 0);
        db.Worlds.Add(world);
        db.Islands.Add(island);
        var (home, homeUser) = NewSettlement(world.Id, island.Id, 0, 0,
            new PlacedBuildingEntity { Q = 1, R = 0, Type = BuildingType.Farm, Level = 1 });
        var (far, farUser) = NewSettlement(world.Id, island.Id, 100, 0);
        db.Users.AddRange(homeUser, farUser);
        db.Settlements.AddRange(home, far);
        await db.SaveChangesAsync(Ct);

        var realm = await new CampService(db).LoadRealmAsync(world.Id, Ct);

        Assert.True(realm.InsideRealm(new HexCoord(2, 0)));
        Assert.True(realm.InsideRealm(new HexCoord(101, 0)));
        Assert.False(realm.InsideRealm(new HexCoord(50, 0)));
        Assert.True(realm.HasBuilding(new HexCoord(1, 0)));
        Assert.False(realm.HasBuilding(new HexCoord(2, 0)));
    }

    [Fact]
    public async Task The_blocking_index_lists_guarded_camps_and_not_cleared_ones_inside_a_realm()
    {
        await using var db = CreateContext();
        var world = NewWorld();
        var island = NewIsland(world.Id, 0, Record(1, 0, CampFamilies.Harewarren, 1), Record(2, 0, CampFamilies.Harewarren, 1));
        db.Worlds.Add(world);
        db.Islands.Add(island);
        var (home, user) = NewSettlement(world.Id, island.Id, 0, 0);
        db.Users.Add(user);
        db.Settlements.Add(home);
        db.CampStates.Add(CampStateEntity.FromDomain(
            world.Id, new HexCoord(1, 0), new CampState(CampGarrison.Empty, T0, T0, T0.AddHours(24), 1)));
        await db.SaveChangesAsync(Ct);

        var index = await new CampService(db).LoadBlockingIndexAsync(world.Id, T0.AddDays(10), Ct);

        Assert.False(index.TryGetCamp(new HexCoord(1, 0), out _));
        Assert.True(index.TryGetCamp(new HexCoord(2, 0), out _));
    }

    [Fact]
    public async Task A_state_is_upserted_once_per_camp_and_reloads_identically()
    {
        var world = NewWorld();
        var coord = new HexCoord(10, 0);
        await using (var db = CreateContext())
        {
            db.Worlds.Add(world);
            db.Islands.Add(NewIsland(world.Id, 0, Record(10, 0)));
            await db.SaveChangesAsync(Ct);
        }

        var first = new CampState(new CampGarrison(2, 0, 0), T0, null, T0.AddHours(24), 1, new ResourceAmounts(0, 0, 50, 0));
        var second = first with { Snapshot = CampGarrison.Empty, ClearedAt = T0.AddHours(1), Clears = 2, Leftover = default };

        await using (var db = CreateContext())
        {
            await new CampService(db).UpsertStateAsync(world.Id, coord, first, Ct);
            await db.SaveChangesAsync(Ct);
        }

        await using (var db = CreateContext())
        {
            await new CampService(db).UpsertStateAsync(world.Id, coord, second, Ct);
            await db.SaveChangesAsync(Ct);
        }

        await using var read = CreateContext();
        var row = await read.CampStates.SingleAsync(Ct);
        Assert.Equal(second, row.ToDomain());
        var found = await new CampService(read).FindCampAsync(world.Id, coord, T0, Ct);
        Assert.Equal(second, found!.State);
        Assert.Null(await new CampService(read).FindCampAsync(world.Id, new HexCoord(11, 0), T0, Ct));
    }

    [Fact]
    public void A_camp_state_survives_the_entity_round_trip_with_every_field()
    {
        var state = new CampState(
            new CampGarrison(3, 5, 1), T0, T0.AddMinutes(-5), T0.AddHours(24), 17, new ResourceAmounts(1.5, 2.5, 3.5, 4.5));

        var entity = CampStateEntity.FromDomain(Guid.NewGuid(), new HexCoord(-4, 9), state);

        Assert.Equal((-4, 9), (entity.Q, entity.R));
        Assert.Equal(state, entity.ToDomain());
    }

    [Fact]
    public async Task A_camp_report_round_trips_through_the_database_with_its_lines()
    {
        var world = NewWorld();
        var island = NewIsland(world.Id, 0, Record(10, 0));
        var (home, user) = NewSettlement(world.Id, island.Id, 0, 0);
        var camp = new Camp(new HexCoord(10, 0), CampFamilies.Wolfden, 3, TileOrientation.E);
        var sent = new[] { new UnitStack(UnitType.Axeman, 60), new UnitStack(UnitType.Spearman, 5) };
        var before = new CampGarrison(5, 12, 2);
        var plan = CampBattleResolver.Hunt(sent, before, camp, 3, seed: 11);
        var report = CampReport.From(
            Guid.CreateVersion7(), world.Id, CampReportKind.Hunt, T0, camp, 3, home.Id, Guid.CreateVersion7(),
            sent, before, plan, seed: 11);

        await using (var db = CreateContext())
        {
            db.Worlds.Add(world);
            db.Islands.Add(island);
            db.Users.Add(user);
            db.Settlements.Add(home);
            db.CampReports.Add(CampReportEntity.FromDomain(report));
            await db.SaveChangesAsync(Ct);
        }

        await using var read = CreateContext();
        var service = new CampReportService(read);
        var loaded = (await service.GetAsync(report.Id, Ct))!.ToDomain();

        Assert.Equal(report.Id, loaded.Id);
        Assert.Equal(report.Kind, loaded.Kind);
        Assert.Equal(report.OccurredAt, loaded.OccurredAt);
        Assert.Equal(report.CampCoord, loaded.CampCoord);
        Assert.Equal(report.Loot, loaded.Loot);
        Assert.Equal(report.CampCleared, loaded.CampCleared);
        // Lines come back in unit-type order, not the order they were sent in.
        Assert.Equal([.. report.UnitLines.OrderBy(l => l.Type)], loaded.UnitLines);
        Assert.Equal(report.BeastLines, loaded.BeastLines);

        var inbox = await service.GetForSettlementAsync(home.Id, Ct);
        Assert.Equal(report.Id, Assert.Single(inbox).Id);
        Assert.Empty(await service.GetForSettlementAsync(Guid.NewGuid(), Ct));
    }

    [Fact]
    public async Task A_towers_report_keeps_its_tower_hex_and_burn_flag()
    {
        var camp = new Camp(new HexCoord(10, 0), CampFamilies.Wolfden, 3, TileOrientation.E);
        var plan = CampBattleResolver.CampAttack(CampGarrison.Full(CampStrength.Strong, 3), camp, [], seed: 1);
        var report = CampReport.From(
            Guid.CreateVersion7(), Guid.NewGuid(), CampReportKind.Tower, T0, camp, 3, Guid.NewGuid(), null,
            [], CampGarrison.Full(CampStrength.Strong, 3), plan, seed: 1, towerCoord: new HexCoord(8, 1), towerBurned: true);

        var loaded = CampReportEntity.FromDomain(report).ToDomain();

        Assert.Equal(CampReportKind.Tower, loaded.Kind);
        Assert.Equal(new HexCoord(8, 1), loaded.TowerCoord);
        Assert.True(loaded.TowerBurned);
        Assert.Null(loaded.ArmyId);
        Assert.Equal(CampFightWinner.Camp, loaded.Winner);
    }
}
