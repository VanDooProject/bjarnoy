using Bjarnoy.Domain.Buildings;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bjarnoy.Infrastructure.Tests.Persistence;

/// <summary>
/// Issue #341 at the persistence layer: <see cref="SettlementEntity.Version"/>
/// must move on every settlement write (including a child-row-only one), and
/// <see cref="ConcurrentWriteExecutor"/> must re-run a request that lost the
/// race, give up cleanly when it keeps losing, and make a multi-save request
/// all-or-nothing.
/// </summary>
public sealed class SettlementConcurrencyTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly GameDbContext _db;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public SettlementConcurrencyTests()
    {
        _connection.Open();
        _db = NewContext();
        _db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
        GC.SuppressFinalize(this);
    }

    /// <summary>A second context on the same database — stands in for a concurrent request.</summary>
    private GameDbContext NewContext() =>
        new(new DbContextOptionsBuilder<GameDbContext>().UseSqlite(_connection).Options);

    private async Task<Guid> SeedSettlementAsync()
    {
        var worldId = Guid.CreateVersion7();
        var islandId = Guid.CreateVersion7();
        _db.Worlds.Add(new WorldEntity { Id = worldId, Name = "Test", Radius = 6 });
        _db.Islands.Add(new IslandEntity { Id = islandId, WorldId = worldId, Name = "Home Isle" });
        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            UserId = SystemUserIds.Abandoned,
            Name = "Home",
            OwnerName = "Player One",
            OwnerId = "owner-1",
            CentreQ = 0,
            CentreR = 0,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = [new PlacedBuildingEntity { Q = 0, R = 0, Type = BuildingType.Longhouse, Level = 1 }],
        };
        _db.Settlements.Add(settlement);
        await _db.SaveChangesAsync(Ct);
        _db.ChangeTracker.Clear();
        return settlement.Id;
    }

    private static BuildOrderEntity Order(Guid settlementId) => new()
    {
        SettlementId = settlementId,
        Q = 1,
        R = 0,
        Type = BuildingType.Farm,
        TargetLevel = 1,
    };

    private ConcurrentWriteExecutor Executor() =>
        new(_db, NullLogger<ConcurrentWriteExecutor>.Instance);

    [Fact]
    public async Task Adding_only_a_child_row_bumps_the_settlements_version()
    {
        var id = await SeedSettlementAsync();
        var settlement = await _db.Settlements.SingleAsync(s => s.Id == id, Ct);
        var before = settlement.Version;

        _db.BuildOrders.Add(Order(id));
        await _db.SaveChangesAsync(Ct);

        Assert.NotEqual(before, settlement.Version);
        await using var other = NewContext();
        Assert.Equal(settlement.Version, (await other.Settlements.SingleAsync(s => s.Id == id, Ct)).Version);
    }

    [Fact]
    public async Task Removing_only_a_child_row_bumps_the_settlements_version()
    {
        var id = await SeedSettlementAsync();
        var settlement = await _db.Settlements.Include(s => s.Buildings).SingleAsync(s => s.Id == id, Ct);
        var before = settlement.Version;

        _db.PlacedBuildings.Remove(settlement.Buildings[0]);
        await _db.SaveChangesAsync(Ct);

        Assert.NotEqual(before, settlement.Version);
    }

    [Fact]
    public async Task A_save_from_a_context_holding_a_stale_version_is_refused_after_a_child_only_write()
    {
        var id = await SeedSettlementAsync();
        await using var stale = NewContext();
        var staleCopy = await stale.Settlements.SingleAsync(s => s.Id == id, Ct);

        await using (var winner = NewContext())
        {
            await winner.Settlements.SingleAsync(s => s.Id == id, Ct);
            winner.BuildOrders.Add(Order(id));
            await winner.SaveChangesAsync(Ct);
        }

        staleCopy.StockWood += 10;

        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => stale.SaveChangesAsync(Ct));
    }

    [Fact]
    public async Task A_child_write_with_the_parent_not_tracked_still_saves()
    {
        var id = await SeedSettlementAsync();

        _db.BuildOrders.Add(Order(id));
        await _db.SaveChangesAsync(Ct);

        await using var other = NewContext();
        Assert.Single(await other.BuildOrders.Where(o => o.SettlementId == id).ToListAsync(Ct));
    }

    [Fact]
    public async Task The_executor_gives_up_after_three_attempts_and_clears_the_tracker_between_them()
    {
        var id = await SeedSettlementAsync();
        var trackedAtStart = new List<int>();

        var ex = await Assert.ThrowsAsync<ConcurrentUpdateException>(() => Executor().ExecuteAsync<int>(
            async ct =>
            {
                trackedAtStart.Add(_db.ChangeTracker.Entries().Count());
                await _db.Settlements.SingleAsync(s => s.Id == id, ct);
                throw new DbUpdateConcurrencyException("lost the race");
            },
            Ct));

        Assert.Equal(ConcurrentWriteExecutor.MaxAttempts, ex.Attempts);
        Assert.Equal(3, trackedAtStart.Count);
        Assert.All(trackedAtStart, count => Assert.Equal(0, count));
        Assert.IsType<DbUpdateConcurrencyException>(ex.InnerException);
        Assert.False(_db.UnitOfWorkActive);
    }

    [Fact]
    public async Task The_executor_re_runs_the_action_against_fresh_state_and_the_second_attempt_wins()
    {
        var id = await SeedSettlementAsync();
        var attempts = 0;

        var result = await Executor().ExecuteAsync(
            async ct =>
            {
                attempts++;
                var settlement = await _db.Settlements.SingleAsync(s => s.Id == id, ct);

                if (attempts == 1)
                {
                    // A competing request commits between this read and save.
                    await using var other = NewContext();
                    (await other.Settlements.SingleAsync(s => s.Id == id, ct)).StockWood = 500;
                    await other.SaveChangesAsync(ct);
                }

                settlement.StockWood += 1;
                await _db.SaveChangesAsync(ct);
                return settlement.StockWood;
            },
            Ct);

        Assert.Equal(2, attempts);
        Assert.Equal(501, result);
    }

    [Fact]
    public async Task A_request_that_saves_twice_commits_all_or_nothing()
    {
        var id = await SeedSettlementAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() => Executor().ExecuteAsync<int>(
            async ct =>
            {
                var settlement = await _db.Settlements.SingleAsync(s => s.Id == id, ct);
                settlement.StockWood = 42;
                await _db.SaveChangesAsync(ct);

                _db.BuildOrders.Add(Order(id));
                await _db.SaveChangesAsync(ct);

                throw new InvalidOperationException("boom after two saves");
            },
            Ct));

        await using var check = NewContext();
        Assert.Equal(0, (await check.Settlements.SingleAsync(s => s.Id == id, Ct)).StockWood);
        Assert.Empty(await check.BuildOrders.ToListAsync(Ct));
        Assert.Null(_db.Database.CurrentTransaction);
    }

    [Fact]
    public async Task A_request_that_only_reads_never_opens_a_transaction()
    {
        var id = await SeedSettlementAsync();

        var hadTransaction = await Executor().ExecuteAsync(
            async ct =>
            {
                await _db.Settlements.SingleAsync(s => s.Id == id, ct);
                return _db.Database.CurrentTransaction is not null;
            },
            Ct);

        Assert.False(hadTransaction);
    }

    [Fact]
    public async Task A_transaction_the_action_opened_itself_is_left_to_the_action()
    {
        var id = await SeedSettlementAsync();

        await Executor().ExecuteAsync(
            async ct =>
            {
                await using var own = await _db.Database.BeginTransactionAsync(ct);
                var settlement = await _db.Settlements.SingleAsync(s => s.Id == id, ct);
                settlement.StockWood = 7;
                await _db.SaveChangesAsync(ct);
                await own.CommitAsync(ct);
                return 0;
            },
            Ct);

        await using var check = NewContext();
        Assert.Equal(7, (await check.Settlements.SingleAsync(s => s.Id == id, Ct)).StockWood);
    }

    [Fact]
    public void Only_lost_races_and_busy_databases_are_retryable()
    {
        Assert.True(ConcurrentWriteExecutor.IsRetryable(new DbUpdateConcurrencyException()));
        Assert.True(ConcurrentWriteExecutor.IsRetryable(
            new DbUpdateException("wrapped", new SqliteException("busy", 5))));
        Assert.True(ConcurrentWriteExecutor.IsRetryable(new SqliteException("locked", 6)));
        Assert.False(ConcurrentWriteExecutor.IsRetryable(new SqliteException("constraint", 19)));
        Assert.False(ConcurrentWriteExecutor.IsRetryable(new InvalidOperationException()));
    }
}
