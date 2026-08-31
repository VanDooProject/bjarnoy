using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Prunes <see cref="Entities.UserActivitySessionEntity"/> rows older than
/// <see cref="UserActivityOptions.RetentionDays"/>. This is session history
/// only — <see cref="Entities.UserActivityEntity"/> (the one-row-per-user
/// last-active summary) is never touched here; it has no age to prune, it is
/// just overwritten in place by every new ping.
/// </summary>
/// <remarks>
/// The actual work is here, not on the hosted service, for the same reason as
/// <c>LeaderboardService.RunDueAggregationsAsync</c>: it needs to be callable
/// (and testable) directly, without waiting on a timer.
/// </remarks>
public sealed class UserActivityRetentionService(
    GameDbContext dbContext,
    TimeProvider timeProvider,
    IOptions<UserActivityOptions> options)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly UserActivityOptions _options = options.Value;

    /// <summary>
    /// Deletes every session whose <see cref="Entities.UserActivitySessionEntity.LastSeenAtUtc"/>
    /// is older than <see cref="UserActivityOptions.RetentionDays"/>. Returns
    /// the number of rows deleted.
    /// </summary>
    public async Task<int> PruneOldSessionsAsync(CancellationToken cancellationToken = default)
    {
        var cutoff = _timeProvider.GetUtcNow() - TimeSpan.FromDays(_options.RetentionDays);

        // EF Core's SQLite provider cannot translate a relational comparison
        // on a DateTimeOffset column (see UserActivityQueryService's remarks
        // for where this was verified) — including inside ExecuteDeleteAsync's
        // WHERE clause. So the cutoff comparison happens in memory, over just
        // the two columns needed to decide it, and the actual delete is one
        // set-based DELETE keyed on the resulting id list (an equality/`IN`
        // predicate, which does translate on both providers) rather than a
        // per-row load-then-remove loop.
        var staleIds = await _dbContext.UserActivitySessions
            .AsNoTracking()
            .Select(s => new { s.Id, s.LastSeenAtUtc })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var idsToDelete = staleIds
            .Where(s => s.LastSeenAtUtc < cutoff)
            .Select(s => s.Id)
            .ToList();

        if (idsToDelete.Count == 0)
        {
            return 0;
        }

        return await _dbContext.UserActivitySessions
            .Where(s => idsToDelete.Contains(s.Id))
            .ExecuteDeleteAsync(cancellationToken)
            .ConfigureAwait(false);
    }
}
