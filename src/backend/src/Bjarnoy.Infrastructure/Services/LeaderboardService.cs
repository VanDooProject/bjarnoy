using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Computes leaderboard snapshots (issue #43). PR 1 only refreshes the current,
/// non-final all-time boards — <see cref="LeaderboardCategory.Score"/> (per
/// user) and <see cref="LeaderboardCategory.BiggestSettlement"/> (per
/// settlement). Weekly window closing and battle-report folding are later
/// PRs' work; see the no-ops noted in <see cref="RefreshCurrentBoardsAsync"/>.
/// </summary>
/// <remarks>
/// Rankings are materialized snapshots, not live queries (issue #43 §1): a
/// board is computed here, written once, and read cheaply by everyone else.
/// Nothing but this service ever writes a <see cref="LeaderboardSnapshotEntity"/>.
/// </remarks>
public sealed class LeaderboardService(
    GameDbContext dbContext,
    TimeProvider timeProvider,
    ILogger<LeaderboardService> logger)
{
    /// <summary>
    /// How stale a current board must be before a refresh recomputes it. The
    /// hosted service polls far more often than this; this is what keeps a
    /// short poll interval from re-writing every board on every tick.
    /// </summary>
    public static readonly TimeSpan RefreshInterval = TimeSpan.FromMinutes(15);

    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<LeaderboardService> _logger = logger;

    /// <summary>
    /// One tick of the aggregation job: refreshes the current boards of every
    /// world that is not <see cref="WorldStatus.Inactive"/>.
    /// </summary>
    public async Task RunDueAggregationsAsync(CancellationToken cancellationToken = default)
    {
        var worldIds = await _dbContext.Worlds
            .AsNoTracking()
            .Where(w => w.Status != WorldStatus.Inactive)
            .Select(w => w.Id)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        foreach (var worldId in worldIds)
        {
            await RefreshCurrentBoardsAsync(worldId, cancellationToken).ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Refreshes <paramref name="worldId"/>'s current (non-final, all-time)
    /// boards, unless the last refresh is still within <see cref="RefreshInterval"/>.
    /// </summary>
    /// <remarks>
    /// Window closing (advancing <see cref="LeaderboardWatermarkEntity.LastClosedPeriodStart"/>)
    /// and battle-report folding (advancing <see cref="LeaderboardWatermarkEntity.LastBattleReportId"/>)
    /// are issue #43 PR 4 and PR 5's work — this method only ensures the
    /// watermark row exists and its <see cref="LeaderboardWatermarkEntity.LastSnapshotAt"/>
    /// is current, so those PRs have a row to build on.
    /// </remarks>
    public async Task RefreshCurrentBoardsAsync(Guid worldId, CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow();

        var watermark = await _dbContext.LeaderboardWatermarks
            .FirstOrDefaultAsync(w => w.WorldId == worldId, cancellationToken).ConfigureAwait(false);

        if (watermark is not null && now - watermark.LastSnapshotAt < RefreshInterval)
        {
            return;
        }

        var scored = await LoadScoredSettlementsAsync(worldId, cancellationToken).ConfigureAwait(false);

        var settlementBoard = scored
            .Select(x => (SubjectId: x.Settlement.Id, SubjectName: x.Settlement.Name, x.Score))
            .ToList();
        await RefreshBoardAsync(
            worldId, LeaderboardScope.Settlement, LeaderboardCategory.BiggestSettlement,
            settlementBoard, now, cancellationToken).ConfigureAwait(false);

        var userBoard = scored
            .GroupBy(x => x.Settlement.UserId)
            .Select(g => (
                SubjectId: g.Key,
                SubjectName: g.First().Settlement.Owner!.DisplayName ?? g.First().Settlement.Owner!.UserName,
                Score: g.Sum(x => x.Score)))
            .ToList();
        await RefreshBoardAsync(
            worldId, LeaderboardScope.User, LeaderboardCategory.Score,
            userBoard, now, cancellationToken).ConfigureAwait(false);

        if (watermark is null)
        {
            watermark = new LeaderboardWatermarkEntity { WorldId = worldId, LastSnapshotAt = now };
            _dbContext.LeaderboardWatermarks.Add(watermark);
        }
        else
        {
            watermark.LastSnapshotAt = now;
        }

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "World {WorldId} leaderboard boards refreshed: {Settlements} settlements, {Users} users.",
            worldId, settlementBoard.Count, userBoard.Count);
    }

    /// <summary>
    /// Every settlement in <paramref name="worldId"/> with a real (non-system)
    /// owner, paired with its <see cref="Bjarnoy.Domain.Buildings.Settlement.Score"/>.
    /// </summary>
    private async Task<List<(SettlementEntity Settlement, double Score)>> LoadScoredSettlementsAsync(
        Guid worldId, CancellationToken cancellationToken)
    {
        var settlements = await _dbContext.Settlements
            .AsNoTracking()
            .Where(s => s.WorldId == worldId && !s.Owner!.IsSystem)
            .Include(s => s.Buildings)
            .Include(s => s.Owner)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return [.. settlements.Select(s => (s, (double)s.ToDomain().Score))];
    }

    /// <summary>
    /// Replaces the current (<c>PeriodStart = null</c>, non-final) snapshot for
    /// one (<paramref name="scope"/>, <paramref name="category"/>) board:
    /// ranks <paramref name="items"/> densely (ties broken by ascending subject
    /// id), carries <c>PreviousRank</c> from the snapshot being replaced, then
    /// deletes that previous snapshot. Final snapshots are never touched here.
    /// </summary>
    private async Task RefreshBoardAsync(
        Guid worldId,
        LeaderboardScope scope,
        LeaderboardCategory category,
        List<(Guid SubjectId, string SubjectName, double Score)> items,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var previous = await _dbContext.LeaderboardSnapshots
            .Include(s => s.Entries)
            .FirstOrDefaultAsync(
                s => s.WorldId == worldId && s.Scope == scope && s.Category == category
                    && s.PeriodStart == null && !s.IsFinal,
                cancellationToken)
            .ConfigureAwait(false);

        var previousRanks = previous?.Entries.ToDictionary(e => e.SubjectId, e => e.Rank)
            ?? [];

        var entries = items
            .OrderByDescending(i => i.Score)
            .ThenBy(i => i.SubjectId)
            .Select((i, index) => new LeaderboardEntryEntity
            {
                Rank = index + 1,
                SubjectId = i.SubjectId,
                SubjectName = i.SubjectName,
                Value = i.Score,
                PreviousRank = previousRanks.TryGetValue(i.SubjectId, out var rank) ? rank : null,
            })
            .ToList();

        var snapshot = new LeaderboardSnapshotEntity
        {
            WorldId = worldId,
            Scope = scope,
            Category = category,
            PeriodStart = null,
            PeriodEnd = null,
            IsFinal = false,
            ComputedAt = now,
            Entries = entries,
        };

        // Two round-trips rather than one: the (WorldId, Scope, Category,
        // PeriodStart, IsFinal) unique index would otherwise briefly hold two
        // rows with the same key within a single SaveChanges if the insert
        // were ordered before the delete.
        if (previous is not null)
        {
            _dbContext.LeaderboardSnapshots.Remove(previous);
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }

        _dbContext.LeaderboardSnapshots.Add(snapshot);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }
}
