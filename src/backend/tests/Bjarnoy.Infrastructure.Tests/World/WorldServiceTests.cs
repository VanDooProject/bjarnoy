using Bjarnoy.Domain.World;
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
    public async Task An_auto_drawn_seed_that_produces_no_islands_is_retried_until_one_does()
    {
        var service = CreateService();
        var options = SmallWorld(KnownBadSeed);

        var world = await service.CreateWorldAsync(
            "auto-seed-world", options, maxPlayers: 10, autoSeed: true, Ct);

        Assert.NotEmpty(await _dbContext.Islands.Where(i => i.WorldId == world.Id).ToListAsync(Ct));
    }
}
