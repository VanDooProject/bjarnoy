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
        var service = new FogMaskService(_dbContext, _cache);

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

        var service = new FogMaskService(_dbContext, _cache);
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

        var service = new FogMaskService(_dbContext, _cache);
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

        var service = new FogMaskService(_dbContext, _cache);
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
}
