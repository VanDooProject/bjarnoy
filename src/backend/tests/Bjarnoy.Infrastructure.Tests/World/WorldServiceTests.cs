using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bjarnoy.Infrastructure.Tests.World;

public class WorldServiceTests : IDisposable
{
    // Seed 20 at radius 30 is a known, deterministic zero-island draw (found
    // by sampling WorldGenerator directly) — see the ~11% zero-island rate
    // this regression test guards against.
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
