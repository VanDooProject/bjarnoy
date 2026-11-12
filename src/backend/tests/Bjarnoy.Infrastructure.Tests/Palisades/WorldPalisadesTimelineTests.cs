using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Tests.Palisades;

/// <summary>
/// <see cref="WorldPalisades.TimelineAsync"/>: when each wall hex of a world stands from, including walls whose build order completed while
/// their owner's settlement was not settled since (the order is applied lazily, the wall stands for every army all the same).
/// </summary>
public sealed class WorldPalisadesTimelineTests : IDisposable
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public WorldPalisadesTimelineTests()
    {
        _connection.Open();
        using var setup = CreateContext();
        setup.Database.EnsureCreated();
    }

    public void Dispose() => _connection.Dispose();

    private GameDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<GameDbContext>().UseSqlite(_connection).Options);

    private static BuildOrderEntity Order(
        int q, BuildingType type, int targetLevel, DateTimeOffset completesAt, BuildOrderKind kind = BuildOrderKind.Build) => new()
    {
        Q = q, R = 0, Type = type, TargetLevel = targetLevel, Kind = kind,
        QueuedAt = T0, BaseDuration = TimeSpan.FromHours(1), StartedAt = T0, CompletesAt = completesAt,
    };

    [Fact]
    public async Task Walls_stand_from_their_recorded_instant_or_their_completed_order_and_upgrades_change_nothing()
    {
        await using var db = CreateContext();
        var world = new WorldEntity { Name = "W", MaxPlayers = 10 };
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Index = 0, Name = "I", CentreQ = 0, CentreR = 0 };
        db.Islands.Add(island);
        var user = new UserEntity { UserName = "u", NormalizedUserName = "U", PasswordHash = "h" };
        db.Users.Add(user);
        var settlement = new SettlementEntity
        {
            WorldId = world.Id, IslandId = island.Id, Name = "H", OwnerName = "O", OwnerId = user.Id.ToString(), UserId = user.Id, CentreQ = 0, CentreR = 0,
        };
        settlement.Buildings.Add(new PlacedBuildingEntity { Q = 1, R = 0, Type = BuildingType.Palisade, Level = 1 });
        settlement.Buildings.Add(new PlacedBuildingEntity { Q = 2, R = 0, Type = BuildingType.Palisade, Level = 2, StandingSince = T0.AddHours(-3) });
        // A foundation whose order completed an hour ago: the settlement was not settled since, so its row still says level 0.
        settlement.Buildings.Add(new PlacedBuildingEntity { Q = 3, R = 0, Type = BuildingType.Palisade, Level = 0 });
        settlement.Buildings.Add(new PlacedBuildingEntity { Q = 4, R = 0, Type = BuildingType.PalisadeGate, Level = 0 });
        settlement.Buildings.Add(new PlacedBuildingEntity { Q = 5, R = 0, Type = BuildingType.Palisade, Level = 0 });
        settlement.Queue.Add(Order(2, BuildingType.Palisade, 3, T0.AddHours(-1)));
        settlement.Queue.Add(Order(3, BuildingType.Palisade, 1, T0.AddHours(-1)));
        settlement.Queue.Add(Order(4, BuildingType.PalisadeGate, 1, T0.AddHours(2)));
        db.Settlements.Add(settlement);
        await db.SaveChangesAsync(Ct);

        var timeline = (await WorldPalisades.TimelineAsync(db, world.Id, Ct)).ToDictionary(w => w.Wall.Coord);

        Assert.Equal(DateTimeOffset.MinValue, timeline[new HexCoord(1, 0)].StandingFrom);
        Assert.Equal(T0.AddHours(-3), timeline[new HexCoord(2, 0)].StandingFrom);
        Assert.Equal(T0.AddHours(-1), timeline[new HexCoord(3, 0)].StandingFrom);
        Assert.Equal(T0.AddHours(2), timeline[new HexCoord(4, 0)].StandingFrom);
        Assert.True(timeline[new HexCoord(4, 0)].Wall.IsGate);
        Assert.False(timeline.ContainsKey(new HexCoord(5, 0)));

        var index = await WorldPalisades.IndexAsync(db, world.Id, _ => Terrain.Grass, _ => false, T0, Ct);
        Assert.True(index.IsWall(new HexCoord(3, 0)));
        Assert.False(index.IsWall(new HexCoord(4, 0)));
    }

    [Fact]
    public async Task A_wall_whose_raze_order_completed_stops_standing_then_even_while_its_owner_never_settled()
    {
        await using var db = CreateContext();
        var world = new WorldEntity { Name = "W", MaxPlayers = 10 };
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Index = 0, Name = "I", CentreQ = 0, CentreR = 0 };
        db.Islands.Add(island);
        var user = new UserEntity { UserName = "u", NormalizedUserName = "U", PasswordHash = "h" };
        db.Users.Add(user);
        var settlement = new SettlementEntity
        {
            WorldId = world.Id, IslandId = island.Id, Name = "H", OwnerName = "O", OwnerId = user.Id.ToString(), UserId = user.Id, CentreQ = 0, CentreR = 0,
        };
        settlement.Buildings.Add(new PlacedBuildingEntity { Q = 1, R = 0, Type = BuildingType.Palisade, Level = 1, StandingSince = T0.AddHours(-5) });
        settlement.Buildings.Add(new PlacedBuildingEntity { Q = 2, R = 0, Type = BuildingType.Palisade, Level = 2, StandingSince = T0.AddHours(-5) });
        settlement.Buildings.Add(new PlacedBuildingEntity { Q = 3, R = 0, Type = BuildingType.PalisadeGate, Level = 1, StandingSince = T0.AddHours(-5) });
        // Razed to nothing an hour ago (not applied yet), lowered to level 1 (still a wall), and razed to nothing in two hours.
        settlement.Queue.Add(Order(1, BuildingType.Palisade, 0, T0.AddHours(-1), BuildOrderKind.Raze));
        settlement.Queue.Add(Order(2, BuildingType.Palisade, 1, T0.AddHours(-1), BuildOrderKind.Raze));
        settlement.Queue.Add(Order(3, BuildingType.PalisadeGate, 0, T0.AddHours(2), BuildOrderKind.Raze));
        db.Settlements.Add(settlement);
        await db.SaveChangesAsync(Ct);

        var now = await WorldPalisades.IndexAsync(db, world.Id, _ => Terrain.Grass, _ => false, T0, Ct);
        Assert.False(now.IsWall(new HexCoord(1, 0)));
        Assert.True(now.IsWall(new HexCoord(2, 0)));
        Assert.True(now.IsWall(new HexCoord(3, 0)));
        var before = await WorldPalisades.IndexAsync(db, world.Id, _ => Terrain.Grass, _ => false, T0.AddHours(-2), Ct);
        Assert.True(before.IsWall(new HexCoord(1, 0)));
        var later = await WorldPalisades.IndexAsync(db, world.Id, _ => Terrain.Grass, _ => false, T0.AddHours(2), Ct);
        Assert.False(later.IsWall(new HexCoord(3, 0)));

        var timeline = (await WorldPalisades.TimelineAsync(db, world.Id, Ct)).ToDictionary(w => w.Wall.Coord);
        Assert.Equal(T0.AddHours(-1), timeline[new HexCoord(1, 0)].StandingUntil);
        Assert.Null(timeline[new HexCoord(2, 0)].StandingUntil);
        Assert.Equal(T0.AddHours(2), timeline[new HexCoord(3, 0)].StandingUntil);
    }
}
