using Bjarnoy.Infrastructure.Entities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>
/// Runs one request as a unit of work that survives losing a write race:
/// if a concurrent writer changed a settlement between this request's read
/// and its save, the whole request is re-run against fresh state (issue #341).
/// </summary>
/// <remarks>
/// <para>
/// Works together with <see cref="SettlementEntity.Version"/>'s concurrency
/// token, which turns a lost update into a <see cref="DbUpdateConcurrencyException"/>,
/// and with <see cref="GameDbContext"/>'s lazy transaction, which makes a
/// request that saves more than once (army arrival, trade, founding, renown
/// collection) commit all-or-nothing when the attempt ends. A request that
/// only reads never opens a transaction.
/// </para>
/// <para>
/// The action must be safe to re-run from the top: a retry clears the change
/// tracker and repeats it, so it must not do anything irreversible outside the
/// database. An action that opens its own transaction (the world reseed does)
/// is left alone — this only commits a transaction it began itself.
/// </para>
/// </remarks>
public sealed class ConcurrentWriteExecutor(GameDbContext dbContext, ILogger<ConcurrentWriteExecutor> logger)
{
    /// <summary>Attempts before giving up with <see cref="ConcurrentUpdateException"/>.</summary>
    public const int MaxAttempts = 3;

    public async Task<T> ExecuteAsync<T>(Func<CancellationToken, Task<T>> action, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(action);

        for (var attempt = 1; ; attempt++)
        {
            dbContext.UnitOfWorkActive = true;
            try
            {
                var result = await action(cancellationToken).ConfigureAwait(false);
                await dbContext.CommitUnitOfWorkAsync(cancellationToken).ConfigureAwait(false);
                return result;
            }
            catch (Exception ex) when (IsRetryable(ex))
            {
                await dbContext.RollbackUnitOfWorkAsync().ConfigureAwait(false);
                dbContext.ChangeTracker.Clear();

                if (attempt >= MaxAttempts)
                {
                    throw new ConcurrentUpdateException(attempt, ex);
                }

                logger.LogWarning(
                    ex,
                    "Concurrent write conflict (attempt {Attempt} of {MaxAttempts}); re-running the request.",
                    attempt,
                    MaxAttempts);
            }
            catch
            {
                await dbContext.RollbackUnitOfWorkAsync().ConfigureAwait(false);
                throw;
            }
            finally
            {
                dbContext.UnitOfWorkActive = false;
            }
        }
    }

    /// <summary>
    /// A lost optimistic-concurrency race, or the database refusing a
    /// transaction that a concurrent one made impossible: SQLite
    /// BUSY/LOCKED, PostgreSQL serialization failure or deadlock. Provider
    /// errors usually arrive wrapped in <see cref="DbUpdateException"/>.
    /// </summary>
    internal static bool IsRetryable(Exception exception)
    {
        for (var ex = exception; ex is not null; ex = ex.InnerException)
        {
            switch (ex)
            {
                case DbUpdateConcurrencyException:
                    return true;
                case SqliteException { SqliteErrorCode: 5 or 6 }:
                    return true;
                case PostgresException { SqlState: "40001" or "40P01" }:
                    return true;
            }
        }

        return false;
    }
}
