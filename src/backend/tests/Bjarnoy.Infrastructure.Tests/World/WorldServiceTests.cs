using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bjarnoy.Infrastructure.Tests.World;

public class WorldServiceTests : IDisposable
{
    // Compact worlds (see WorldGenerationOptions.Compact) at radius 200 with a low island
    // chance (0.3), found by sampling the generator directly (seeds 0-399): an island has to
    // fit whole inside the world radius, so a small world now and then draws no island at all
    // (about 1% of seeds on the denser 66-hex cells; the zero-island case this regression
    // test guards against).
    // Seed 169 draws no island of any kind. Seed 55 draws wasted islands and no green
    // one: since wasted islands shipped that draw must still count as "no islands" for a
    // player to found on (they have no start positions and are hidden until the endboss
    // triggers) — see the wasted-only test below, which pins down that this isn't a
    // coincidence of the seed choice.
    private const int KnownBadSeed = 169;
    private const int WastedOnlySeed = 55;

    // A seed that draws a green island on the same small world (checked by the first async-creation test).
    private const int GoodSeed = 1;

    private static WorldGenerationOptions SmallWorld(int seed) =>
        WorldGenerationOptions.Compact(seed, 200) with { IslandChance = 0.3 };

    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly GameDbContext _dbContext;
    private readonly TestTimeProvider _time = new(DateTimeOffset.UtcNow);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public WorldServiceTests()
    {
        _connection.Open();
        var dbOptions = new DbContextOptionsBuilder<GameDbContext>().UseSqlite(_connection).Options;
        _dbContext = new GameDbContext(dbOptions);
        _dbContext.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _dbContext.Dispose();
        _connection.Dispose();
    }

    private WorldService CreateService() =>
        new(_dbContext, _time, NullLogger<WorldService>.Instance);

    /// <summary>
    /// A radius larger than ~300 is used on purpose: at a tiny radius a random seed can
    /// draw no island at all, which <c>SeedDefaultWorldIfNoneAsync</c> would swallow as a
    /// lost race and leave this test flaky.
    /// </summary>
    [Fact]
    public async Task Seeding_the_default_world_with_a_radius_stores_that_radius()
    {
        var service = CreateService();

        await service.SeedDefaultWorldIfNoneAsync("radius-world", NullLogger.Instance, radius: 1000, Ct);

        var world = await _dbContext.Worlds.SingleAsync(Ct);
        Assert.Equal(1000, world.Radius);
    }

    [Fact]
    public async Task An_explicit_seed_that_produces_no_islands_is_reported_as_a_conflict()
    {
        var service = CreateService();
        var options = SmallWorld(KnownBadSeed);

        var ex = await Assert.ThrowsAsync<WorldCreationException>(
            () => service.CreateWorldAsync("explicit-seed-world", options, maxPlayers: 10, autoSeed: false, Ct));

        Assert.Contains("no islands", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Regression test for a bug the wasted-islands feature introduced: the
    /// "no islands" checks originally counted <c>generated.Islands.Count</c>
    /// directly, which a wasted-only draw (no green islands, so nobody could
    /// ever found on it) satisfied just as well as a real one — silently
    /// creating an unplayable world instead of reporting the conflict.
    /// <see cref="WastedOnlySeed"/> is exactly such a draw (wasted islands, zero green ones).
    /// </summary>
    [Fact]
    public async Task A_seed_that_produces_only_a_wasted_island_is_also_reported_as_a_conflict()
    {
        var options = SmallWorld(WastedOnlySeed);
        var generated = new WorldGenerator(options).Generate(Ct);

        Assert.NotEmpty(generated.Islands);
        Assert.All(generated.Islands, i => Assert.True(i.IsWasted));

        var service = CreateService();
        var ex = await Assert.ThrowsAsync<WorldCreationException>(
            () => service.CreateWorldAsync("wasted-only-world", options, maxPlayers: 10, autoSeed: false, Ct));

        Assert.Contains("no islands", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Beginning_a_world_stores_it_as_creating_without_islands_and_completing_it_activates_it()
    {
        var service = CreateService();
        var options = SmallWorld(GoodSeed);

        var begun = await service.BeginWorldCreationAsync("async-world", options, maxPlayers: 10, Ct);

        Assert.Equal(WorldStatus.Creating, begun.Status);
        Assert.Empty(await _dbContext.Islands.Where(i => i.WorldId == begun.Id).ToListAsync(Ct));

        await service.CompleteWorldCreationAsync(begun.Id, autoSeed: false, Ct);

        var world = await _dbContext.Worlds.AsNoTracking().SingleAsync(Ct);
        Assert.Equal(WorldStatus.Active, world.Status);
        Assert.Null(world.CreationError);
        Assert.NotEmpty(await _dbContext.Islands.Where(i => i.WorldId == world.Id).ToListAsync(Ct));
    }

    [Fact]
    public async Task Completing_a_world_whose_explicit_seed_has_no_islands_fails_it_with_the_reason()
    {
        var service = CreateService();
        var begun = await service.BeginWorldCreationAsync("bad-seed-async", SmallWorld(KnownBadSeed), maxPlayers: 10, Ct);

        await service.CompleteWorldCreationAsync(begun.Id, autoSeed: false, Ct);

        var world = await _dbContext.Worlds.AsNoTracking().SingleAsync(Ct);
        Assert.Equal(WorldStatus.Failed, world.Status);
        Assert.Contains("no islands", world.CreationError, StringComparison.OrdinalIgnoreCase);
        Assert.Empty(await _dbContext.Islands.Where(i => i.WorldId == world.Id).ToListAsync(Ct));
    }

    [Fact]
    public async Task A_failed_world_is_replaced_by_a_new_one_of_the_same_name_but_a_live_one_is_not()
    {
        var service = CreateService();
        var first = await service.BeginWorldCreationAsync("same-name", SmallWorld(KnownBadSeed), maxPlayers: 10, Ct);
        await service.CompleteWorldCreationAsync(first.Id, autoSeed: false, Ct);

        var second = await service.BeginWorldCreationAsync("same-name", SmallWorld(GoodSeed), maxPlayers: 10, Ct);

        Assert.NotEqual(first.Id, second.Id);
        Assert.Equal(second.Id, (await _dbContext.Worlds.AsNoTracking().SingleAsync(Ct)).Id);

        await Assert.ThrowsAsync<WorldCreationException>(
            () => service.BeginWorldCreationAsync("same-name", SmallWorld(GoodSeed), maxPlayers: 10, Ct));
    }

    [Fact]
    public async Task Worlds_still_creating_at_startup_are_failed_as_interrupted()
    {
        var service = CreateService();
        var begun = await service.BeginWorldCreationAsync("interrupted", SmallWorld(GoodSeed), maxPlayers: 10, Ct);

        await service.FailInterruptedWorldCreationsAsync(_time.GetUtcNow().AddMinutes(1), Ct);

        var world = await _dbContext.Worlds.AsNoTracking().SingleAsync(w => w.Id == begun.Id, Ct);
        Assert.Equal(WorldStatus.Failed, world.Status);
        Assert.Contains("interrupted", world.CreationError, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task A_world_created_after_the_process_started_is_not_failed_as_interrupted()
    {
        var service = CreateService();
        var startedAt = _time.GetUtcNow().AddMinutes(-1);
        var begun = await service.BeginWorldCreationAsync("just-created", SmallWorld(GoodSeed), maxPlayers: 10, Ct);

        await service.FailInterruptedWorldCreationsAsync(startedAt, Ct);

        Assert.Equal(WorldStatus.Creating, (await _dbContext.Worlds.AsNoTracking().SingleAsync(w => w.Id == begun.Id, Ct)).Status);
    }

    [Fact]
    public async Task An_auto_drawn_seed_that_produces_no_islands_is_retried_until_one_does()
    {
        var service = CreateService();
        var options = SmallWorld(KnownBadSeed);

        var world = await service.CreateWorldAsync(
            "auto-seed-world", options, maxPlayers: 10, autoSeed: true, Ct);

        Assert.NotEmpty(await _dbContext.Islands.Where(i => i.WorldId == world.Id).ToListAsync(Ct));
    }

    [Fact]
    public async Task A_created_world_stores_each_islands_fog_chunk_footprint()
    {
        var service = CreateService();
        var options = SmallWorld(1);
        var generated = new WorldGenerator(options).Generate(Ct);

        var world = await service.CreateWorldAsync("fog-chunk-world", options, maxPlayers: 10, autoSeed: false, Ct);

        var stored = await _dbContext.Islands.Where(i => i.WorldId == world.Id).ToListAsync(Ct);
        Assert.NotEmpty(stored);
        foreach (var island in stored)
        {
            var tiles = generated.Islands.Single(g => g.Index == island.Index).Tiles;
            Assert.NotEmpty(island.FogChunks);
            Assert.Equal(FogChunkLayout.ChunksOf(tiles), island.FogChunks);
            Assert.All(tiles, t => Assert.Contains(FogChunkLayout.ChunkOf(t), island.FogChunks));
        }
    }
}
