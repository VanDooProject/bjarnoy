using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.World;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SkiaSharp;

namespace Bjarnoy.Infrastructure.Tests.World;

public class FogMaskServiceTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly GameDbContext _dbContext;
    private readonly IMemoryCache _cache = new MemoryCache(new MemoryCacheOptions());

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public FogMaskServiceTests()
    {
        _connection.Open();
        var options = new DbContextOptionsBuilder<GameDbContext>()
            .UseSqlite(_connection)
            .Options;
        _dbContext = new GameDbContext(options);
        _dbContext.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _dbContext.Dispose();
        _connection.Dispose();
        _cache.Dispose();
    }

    [Fact]
    public async Task Rejects_an_unknown_world()
    {
        var service = new FogMaskService(_dbContext, _cache, TimeProvider.System);

        var result = await service.GeneratePlayerMaskAsync(Guid.NewGuid(), "player-1", Ct);

        Assert.Equal(FogMaskRejection.WorldNotFound, result.Rejection);
        Assert.False(result.Accepted);
    }

    [Fact]
    public async Task Bakes_a_decodable_png_lit_up_around_the_players_own_settlement()
    {
        var worldId = Guid.NewGuid();
        var islandId = Guid.NewGuid();
        _dbContext.Worlds.Add(new WorldEntity { Id = worldId, Name = "Test", Radius = 6 });
        _dbContext.Islands.Add(new IslandEntity { Id = islandId, WorldId = worldId, Name = "Home Isle" });
        _dbContext.Settlements.Add(new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            UserId = SystemUserIds.Abandoned,
            Name = "Home",
            OwnerName = "Player One",
            OwnerId = "player-1",
            CentreQ = 0,
            CentreR = 0,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = [new PlacedBuildingEntity { Q = 0, R = 0, Type = BuildingType.Longhouse, Level = 1 }],
        });
        await _dbContext.SaveChangesAsync(Ct);

        var service = new FogMaskService(_dbContext, _cache, TimeProvider.System);
        var result = await service.GeneratePlayerMaskAsync(worldId, "player-1", Ct);

        Assert.True(result.Accepted);
        using var bitmap = SKBitmap.Decode(result.Png);

        var originTexel = FogMaskLayout.ToTexel(HexCoord.Origin);
        var bounds = FogMaskLayout.WorldBounds(6);
        var pixel = bitmap.GetPixel(originTexel.U - bounds.MinU, originTexel.V - bounds.MinV);

        // At the settlement's own centre, both ramps must read fully revealed.
        Assert.Equal(0, pixel.Red);
        Assert.Equal(0, pixel.Green);
    }

    [Fact]
    public async Task Excludes_another_players_settlements()
    {
        var worldId = Guid.NewGuid();
        var islandId = Guid.NewGuid();
        _dbContext.Worlds.Add(new WorldEntity { Id = worldId, Name = "Test", Radius = 6 });
        _dbContext.Islands.Add(new IslandEntity { Id = islandId, WorldId = worldId, Name = "Home Isle" });
        _dbContext.Settlements.Add(new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            UserId = SystemUserIds.Abandoned,
            Name = "Someone else's",
            OwnerName = "Player Two",
            OwnerId = "player-2",
            CentreQ = 0,
            CentreR = 0,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = [new PlacedBuildingEntity { Q = 0, R = 0, Type = BuildingType.Longhouse, Level = 1 }],
        });
        await _dbContext.SaveChangesAsync(Ct);

        var service = new FogMaskService(_dbContext, _cache, TimeProvider.System);
        var result = await service.GeneratePlayerMaskAsync(worldId, "player-1", Ct);

        Assert.True(result.Accepted);
        using var bitmap = SKBitmap.Decode(result.Png);

        var originTexel = FogMaskLayout.ToTexel(HexCoord.Origin);
        var bounds = FogMaskLayout.WorldBounds(6);
        var pixel = bitmap.GetPixel(originTexel.U - bounds.MinU, originTexel.V - bounds.MinV);

        // Nothing of player-1's own is here, so it must read fully unknown.
        Assert.Equal(255, pixel.Red);
    }

    [Fact]
    public async Task Caches_the_encoded_png_and_bumps_the_etag_when_the_settlement_set_changes()
    {
        var worldId = Guid.NewGuid();
        var islandId = Guid.NewGuid();
        _dbContext.Worlds.Add(new WorldEntity { Id = worldId, Name = "Test", Radius = 6 });
        _dbContext.Islands.Add(new IslandEntity { Id = islandId, WorldId = worldId, Name = "Home Isle" });
        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            UserId = SystemUserIds.Abandoned,
            Name = "Home",
            OwnerName = "Player One",
            OwnerId = "player-1",
            CentreQ = 0,
            CentreR = 0,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = [new PlacedBuildingEntity { Q = 0, R = 0, Type = BuildingType.Longhouse, Level = 1 }],
        };
        _dbContext.Settlements.Add(settlement);
        await _dbContext.SaveChangesAsync(Ct);

        var service = new FogMaskService(_dbContext, _cache, TimeProvider.System);
        var first = await service.GeneratePlayerMaskAsync(worldId, "player-1", Ct);
        var second = await service.GeneratePlayerMaskAsync(worldId, "player-1", Ct);

        // Same settlement set both times: same ETag, and the second call's
        // bytes come back from cache rather than a fresh encode — same
        // reference, not merely equal content, proves the cache hit.
        Assert.Equal(first.ETag, second.ETag);
        Assert.Same(first.Png, second.Png);

        settlement.Buildings[0].Level = 2;
        await _dbContext.SaveChangesAsync(Ct);

        var third = await service.GeneratePlayerMaskAsync(worldId, "player-1", Ct);

        // The longhouse leveled up, so the vision radius changed: the ETag
        // (derived from the settlement set, including level) must bump, and
        // the cache must miss rather than serve the stale pre-level-up mask.
        Assert.NotEqual(first.ETag, third.ETag);
        Assert.NotSame(first.Png, third.Png);
    }

    [Fact]
    public async Task Persisted_history_survives_the_settlement_that_explored_it_being_lost()
    {
        var worldId = Guid.NewGuid();
        var islandId = Guid.NewGuid();
        _dbContext.Worlds.Add(new WorldEntity { Id = worldId, Name = "Test", Radius = 8 });
        _dbContext.Islands.Add(new IslandEntity { Id = islandId, WorldId = worldId, Name = "Home Isle" });
        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            UserId = SystemUserIds.Abandoned,
            Name = "Home",
            OwnerName = "Player One",
            OwnerId = "player-1",
            CentreQ = 0,
            CentreR = 0,
            FoundedAt = DateTimeOffset.UnixEpoch,
            // Level 6 -> ExploredRadius(6) = 2 + 6/2 + 3 = 8, reaching (8, 0).
            Buildings = [new PlacedBuildingEntity { Q = 0, R = 0, Type = BuildingType.Longhouse, Level = 6 }],
        };
        _dbContext.Settlements.Add(settlement);
        await _dbContext.SaveChangesAsync(Ct);

        var service = new FogMaskService(_dbContext, _cache, TimeProvider.System);
        await service.GeneratePlayerMaskAsync(worldId, "player-1", Ct);

        // The settlement is gone entirely (abandoned/razed) — a fresh
        // FogMaskService call must still show the ground it once scouted as
        // explored, because §1e's whole point is that history outlives the
        // current source that produced it.
        _dbContext.Settlements.Remove(settlement);
        await _dbContext.SaveChangesAsync(Ct);

        var afterLoss = await service.GeneratePlayerMaskAsync(worldId, "player-1", Ct);

        Assert.True(afterLoss.Accepted);
        using var bitmap = SKBitmap.Decode(afterLoss.Png);
        var bounds = FogMaskLayout.WorldBounds(8);
        var farEdgeTexel = FogMaskLayout.ToTexel(new HexCoord(8, 0));
        var pixel = bitmap.GetPixel(farEdgeTexel.U - bounds.MinU, farEdgeTexel.V - bounds.MinV);

        Assert.Equal(0, pixel.Red);
    }

    [Fact]
    public async Task An_in_transit_armys_walked_ground_becomes_persisted_history()
    {
        var worldId = Guid.NewGuid();
        var islandId = Guid.NewGuid();
        _dbContext.Worlds.Add(new WorldEntity { Id = worldId, Name = "Test", Radius = 10 });
        _dbContext.Islands.Add(new IslandEntity { Id = islandId, WorldId = worldId, Name = "Home Isle" });
        var settlement = new SettlementEntity
        {
            Id = Guid.NewGuid(),
            WorldId = worldId,
            IslandId = islandId,
            UserId = SystemUserIds.Abandoned,
            Name = "Home",
            OwnerName = "Player One",
            OwnerId = "player-1",
            CentreQ = 0,
            CentreR = 0,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = [new PlacedBuildingEntity { Q = 0, R = 0, Type = BuildingType.Longhouse, Level = 1 }],
        };
        _dbContext.Settlements.Add(settlement);

        // Far out on a one-hex "leg" that's long since been reached (departed
        // long ago, a single cumulative-hours entry of 0) — Movement.PositionAt
        // then reports this hex regardless of exactly when "now" is evaluated,
        // so the test doesn't need a fake clock. Level-1 ExploredRadius is 6,
        // so (9, 0) is well outside the settlement's own scouted ring — only
        // the army's walked-ground contribution can explain it reading explored.
        _dbContext.Armies.Add(new ArmyEntity
        {
            SettlementId = settlement.Id,
            Settlement = settlement,
            AtHome = false,
            IsSupporting = false,
            DepartedAt = DateTimeOffset.UnixEpoch,
            Path = [new HexPoint(9, 0)],
            CumulativeHours = [0],
            ReturnPath = [new HexPoint(9, 0), new HexPoint(0, 0)],
            ReturnCumulativeHours = [0, 1],
            TurnAroundAt = DateTimeOffset.UnixEpoch.AddDays(3650),
            IsReturning = false,
        });
        await _dbContext.SaveChangesAsync(Ct);

        var service = new FogMaskService(_dbContext, _cache, TimeProvider.System);
        var result = await service.GeneratePlayerMaskAsync(worldId, "player-1", Ct);

        Assert.True(result.Accepted);
        using var bitmap = SKBitmap.Decode(result.Png);
        var bounds = FogMaskLayout.WorldBounds(10);
        var armyTexel = FogMaskLayout.ToTexel(new HexCoord(9, 0));
        var pixel = bitmap.GetPixel(armyTexel.U - bounds.MinU, armyTexel.V - bounds.MinV);

        Assert.Equal(0, pixel.Red);

        // And it's really persisted, not just "currently in range of a live
        // source": a second call must still show it explored even reading
        // straight from the saved bitset (the OR-write from the first call).
        var stored = await _dbContext.PlayerExplored.SingleAsync(e => e.WorldId == worldId && e.OwnerId == "player-1", Ct);
        Assert.Contains(new HexCoord(9, 0), PersistedExploredBitset.Decode(bounds, stored.Bits));
    }

    [Fact]
    public async Task Etag_is_stable_across_calls_when_nothing_new_was_explored()
    {
        var worldId = Guid.NewGuid();
        var islandId = Guid.NewGuid();
        _dbContext.Worlds.Add(new WorldEntity { Id = worldId, Name = "Test", Radius = 6 });
        _dbContext.Islands.Add(new IslandEntity { Id = islandId, WorldId = worldId, Name = "Home Isle" });
        _dbContext.Settlements.Add(new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            UserId = SystemUserIds.Abandoned,
            Name = "Home",
            OwnerName = "Player One",
            OwnerId = "player-1",
            CentreQ = 0,
            CentreR = 0,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = [new PlacedBuildingEntity { Q = 0, R = 0, Type = BuildingType.Longhouse, Level = 1 }],
        });
        await _dbContext.SaveChangesAsync(Ct);

        var service = new FogMaskService(_dbContext, _cache, TimeProvider.System);
        var first = await service.GeneratePlayerMaskAsync(worldId, "player-1", Ct);
        var second = await service.GeneratePlayerMaskAsync(worldId, "player-1", Ct);

        // Nothing newly explored between calls (the settlement's ring was
        // already fully OR-ed in on the first call) — the persisted layer's
        // own contribution to the ETag must not force a bump on its own.
        Assert.Equal(first.ETag, second.ETag);
        Assert.Same(first.Png, second.Png);
    }
}
