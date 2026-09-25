using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bjarnoy.Infrastructure.Tests.World;

public class WorldServiceTests : IDisposable
{
    // Seed 20 at radius 30 is a known, deterministic zero-*foundable*-island
    // draw (found by sampling WorldGenerator directly) — see the ~11%
    // zero-island rate this regression test guards against. Since wasted
    // islands shipped, this seed/radius actually produces exactly one
    // island — but it's wasted (no start positions, hidden until the
    // endboss triggers), so it must still count as "no islands" for a
    // player to found on; see HasFoundableIslands_wasted_only test below,
    // which pins down that this isn't a coincidence of the seed choice.
    private const int KnownBadSeed = 20;
    private const int KnownBadRadius = 30;

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

    [Fact]
    public async Task An_explicit_seed_that_produces_no_islands_is_reported_as_a_conflict()
    {
        var service = CreateService();
        var options = WorldGenerationOptions.ForSeed(KnownBadSeed) with { Radius = KnownBadRadius };

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
    /// <see cref="KnownBadSeed"/>/<see cref="KnownBadRadius"/> is exactly
    /// such a draw (one wasted island, zero green ones).
    /// </summary>
    [Fact]
    public async Task A_seed_that_produces_only_a_wasted_island_is_also_reported_as_a_conflict()
    {
        var options = WorldGenerationOptions.ForSeed(KnownBadSeed) with { Radius = KnownBadRadius };
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
        var options = WorldGenerationOptions.ForSeed(KnownBadSeed) with { Radius = KnownBadRadius };

        var world = await service.CreateWorldAsync(
            "auto-seed-world", options, maxPlayers: 10, autoSeed: true, Ct);

        Assert.NotEmpty(await _dbContext.Islands.Where(i => i.WorldId == world.Id).ToListAsync(Ct));
    }
}
