using Bjarnoy.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bjarnoy.Infrastructure.Tests.Persistence;

/// <summary>
/// <see cref="GameDbContext.OnCommitted"/>: side effects such as a cache
/// invalidation must run only after the unit of work has committed, once, and
/// never for an attempt that was rolled back and retried.
/// </summary>
public sealed class CommitHookTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly GameDbContext _db;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public CommitHookTests()
    {
        _connection.Open();
        _db = new GameDbContext(new DbContextOptionsBuilder<GameDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
        GC.SuppressFinalize(this);
    }

    private ConcurrentWriteExecutor Executor() =>
        new(_db, NullLogger<ConcurrentWriteExecutor>.Instance);

    [Fact]
    public void Without_a_unit_of_work_the_action_runs_immediately()
    {
        var ran = 0;

        _db.OnCommitted(() => ran++);

        Assert.Equal(1, ran);
    }

    [Fact]
    public async Task Inside_a_unit_of_work_the_action_runs_after_the_commit_not_before()
    {
        var ran = 0;
        var ranBeforeReturn = -1;

        await Executor().ExecuteAsync(
            ct =>
            {
                _db.OnCommitted(() => ran++);
                ranBeforeReturn = ran;
                return Task.FromResult(0);
            },
            Ct);

        Assert.Equal(0, ranBeforeReturn);
        Assert.Equal(1, ran);
    }

    [Fact]
    public async Task The_action_runs_after_the_transaction_committed()
    {
        var committedWhenRun = false;

        await Executor().ExecuteAsync(
            async ct =>
            {
                // Saving opens the lazy transaction.
                _db.Worlds.Add(new Bjarnoy.Infrastructure.Entities.WorldEntity { Name = "W", Radius = 3 });
                await _db.SaveChangesAsync(ct);
                _db.OnCommitted(() => committedWhenRun = _db.Database.CurrentTransaction is null);
                return 0;
            },
            Ct);

        Assert.True(committedWhenRun);
    }

    [Fact]
    public async Task A_retried_attempts_action_is_dropped_and_the_successful_attempts_runs_exactly_once()
    {
        var attempts = 0;
        var ran = new List<int>();

        await Executor().ExecuteAsync(
            ct =>
            {
                var attempt = ++attempts;
                _db.OnCommitted(() => ran.Add(attempt));
                if (attempt == 1)
                {
                    throw new DbUpdateConcurrencyException("lost the race");
                }

                return Task.FromResult(0);
            },
            Ct);

        Assert.Equal(2, attempts);
        Assert.Equal([2], ran);
    }

    [Fact]
    public async Task A_failed_request_never_runs_its_action()
    {
        var ran = 0;

        await Assert.ThrowsAsync<InvalidOperationException>(() => Executor().ExecuteAsync<int>(
            ct =>
            {
                _db.OnCommitted(() => ran++);
                throw new InvalidOperationException("boom");
            },
            Ct));

        Assert.Equal(0, ran);
    }
}
