using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.World;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SkiaSharp;

namespace Bjarnoy.Infrastructure.Tests.World;

public class FogOverviewServiceTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly GameDbContext _dbContext;
    private readonly IMemoryCache _cache = new MemoryCache(new MemoryCacheOptions());

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public FogOverviewServiceTests()
    {
        _connection.Open();
        var options = new DbContextOptionsBuilder<GameDbContext>().UseSqlite(_connection).Options;
        _dbContext = new GameDbContext(options);
        _dbContext.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _dbContext.Dispose();
        _connection.Dispose();
        _cache.Dispose();
    }

    private FogOverviewService NewService() => new(_dbContext, _cache, TimeProvider.System);

    private Guid AddWorld(int radius)
    {
        var worldId = Guid.NewGuid();
        _dbContext.Worlds.Add(new WorldEntity { Id = worldId, Name = "Test", Radius = radius });
        return worldId;
    }

    [Fact]
    public async Task Rejects_an_unknown_world()
    {
        var result = await NewService().GetAsync(Guid.NewGuid(), "player-1", Ct);

        Assert.Equal(FogOverviewRejection.WorldNotFound, result.Rejection);
        Assert.False(result.Accepted);
    }

    [Fact]
    public async Task Delivers_a_png_of_the_overview_grid_and_keeps_the_version_while_nothing_changes()
    {
        var worldId = AddWorld(30);
        await _dbContext.SaveChangesAsync(Ct);

        var first = await NewService().GetAsync(worldId, "player-1", Ct);
        var second = await NewService().GetAsync(worldId, "player-1", Ct);

        Assert.True(first.Accepted);
        Assert.Equal(FogOverviewGenerator.FactorFor(30), first.Factor);
        Assert.Equal(FogOverviewGenerator.OverviewBounds(30, first.Factor), first.Bounds);
        using var bitmap = SKBitmap.Decode(first.Png!);
        Assert.Equal(first.Width, bitmap.Width);
        Assert.Equal(first.Height, bitmap.Height);
        Assert.Equal(first.Version, second.Version);
        Assert.Same(first.Png, second.Png);
    }

    [Fact]
    public async Task The_version_changes_when_the_explored_history_does_and_not_for_another_player()
    {
        var worldId = AddWorld(30);
        await _dbContext.SaveChangesAsync(Ct);
        var before = await NewService().GetAsync(worldId, "player-1", Ct);

        var chunk = new FogChunkCoord(0, 0);
        var data = PersistedExploredBitset.Encode(chunk, [new HexCoord(0, 0)]);
        _dbContext.PlayerExploredChunks.Add(new PlayerExploredChunkEntity
        {
            WorldId = worldId, OwnerId = "player-1", ChunkU = chunk.U, ChunkV = chunk.V, Bits = data.Bits,
        });
        await _dbContext.SaveChangesAsync(Ct);

        var after = await NewService().GetAsync(worldId, "player-1", Ct);
        var other = await NewService().GetAsync(worldId, "player-2", Ct);

        Assert.NotEqual(before.Version, after.Version);
        Assert.NotSame(before.Png, after.Png);
        Assert.Equal(before.Version, other.Version);

        using var bitmap = SKBitmap.Decode(after.Png!);
        var texel = FogMaskLayout.ToTexel(new HexCoord(0, 0));
        Assert.Equal(0, bitmap.GetPixel(texel.U - after.Bounds.MinU, texel.V - after.Bounds.MinV).Red);
    }
}
