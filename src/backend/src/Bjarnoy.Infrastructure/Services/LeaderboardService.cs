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

    /// <summary>
    /// Status of every board in <see cref="LeaderboardCatalogue.Boards"/> for
    /// <paramref name="worldId"/>: live with its current snapshot's stats, or
    /// dark with a reason (issue #43 §5, board directory).
    /// </summary>
    public async Task<IReadOnlyList<LeaderboardBoardStatus>> GetDirectoryAsync(
        Guid worldId, CancellationToken cancellationToken = default)
    {
        var current = await _dbContext.LeaderboardSnapshots
            .AsNoTracking()
            .Where(s => s.WorldId == worldId && s.PeriodStart == null && !s.IsFinal)
            .Select(s => new { s.Scope, s.Category, s.ComputedAt, EntryCount = s.Entries.Count })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return
        [
            .. LeaderboardCatalogue.Boards.Keys.Select(board =>
            {
                var snapshot = current.Find(s => s.Scope == board.Scope && s.Category == board.Category);
                return snapshot is not null
                    ? new LeaderboardBoardStatus(
                        board.Scope, board.Category, Available: true, Reason: null,
                        snapshot.ComputedAt, snapshot.EntryCount)
                    : new LeaderboardBoardStatus(
                        board.Scope, board.Category, Available: false,
                        LeaderboardCatalogue.DarkReason(board.Scope, board.Category), ComputedAt: null, EntryCount: null);
            }),
        ];
    }

    /// <summary>
    /// A keyset page (<c>Rank &gt; afterRank</c>, ordered by <c>Rank</c>) of the
    /// current, all-time snapshot for (<paramref name="scope"/>, <paramref name="category"/>),
    /// or the dark response if none exists yet (issue #43 §5, board page).
    /// </summary>
    public async Task<LeaderboardBoardPage> GetBoardPageAsync(
        Guid worldId,
        LeaderboardScope scope,
        LeaderboardCategory category,
        int afterRank,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await CurrentSnapshotAsync(worldId, scope, category, cancellationToken).ConfigureAwait(false);
        if (snapshot is null)
        {
            return new LeaderboardBoardPage(
                Available: false, LeaderboardCatalogue.DarkReason(scope, category),
                IsFinal: false, PeriodStart: null, PeriodEnd: null, ComputedAt: null,
                Items: [], NextAfterRank: null);
        }

        var items = await _dbContext.LeaderboardEntries
            .AsNoTracking()
            .Where(e => e.SnapshotId == snapshot.Id && e.Rank > afterRank)
            .OrderBy(e => e.Rank)
            .Take(pageSize)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return new LeaderboardBoardPage(
            Available: true, Reason: null,
            snapshot.IsFinal, snapshot.PeriodStart, snapshot.PeriodEnd, snapshot.ComputedAt,
            items, items.Count > 0 ? items[^1].Rank : null);
    }

    /// <summary>
    /// The caller's rank plus a window of <paramref name="radius"/> entries
    /// around it on the current snapshot, or <see langword="null"/> if
    /// <paramref name="subjectId"/> has no entry there (issue #43 §5, <c>/me</c>).
    /// </summary>
    public async Task<LeaderboardMeResult?> GetMyRankAsync(
        Guid worldId,
        LeaderboardScope scope,
        LeaderboardCategory category,
        Guid subjectId,
        int radius,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await CurrentSnapshotAsync(worldId, scope, category, cancellationToken).ConfigureAwait(false);
        if (snapshot is null)
        {
            return null;
        }

        var mine = await _dbContext.LeaderboardEntries
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.SnapshotId == snapshot.Id && e.SubjectId == subjectId, cancellationToken)
            .ConfigureAwait(false);
        if (mine is null)
        {
            return null;
        }

        var minRank = Math.Max(1, mine.Rank - radius);
        var maxRank = mine.Rank + radius;

        var items = await _dbContext.LeaderboardEntries
            .AsNoTracking()
            .Where(e => e.SnapshotId == snapshot.Id && e.Rank >= minRank && e.Rank <= maxRank)
            .OrderBy(e => e.Rank)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return new LeaderboardMeResult(mine.Rank, items);
    }

    /// <summary>
    /// Resolves which subject a <c>/me</c> call is asking about: the caller
    /// themselves for <see cref="LeaderboardScope.User"/>, or one of the
    /// caller's own settlements for <see cref="LeaderboardScope.Settlement"/>
    /// — <paramref name="requestedSettlementId"/> picks which one, defaulting
    /// to any settlement the caller owns in the world.
    /// </summary>
    public async Task<MeSubjectResolution> ResolveMeSubjectAsync(
        Guid worldId,
        LeaderboardScope scope,
        Guid userId,
        Guid? requestedSettlementId,
        CancellationToken cancellationToken = default)
    {
        if (scope != LeaderboardScope.Settlement)
        {
            return MeSubjectResolution.Resolved(userId);
        }

        if (requestedSettlementId is { } settlementId)
        {
            var settlement = await _dbContext.Settlements
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    s => s.Id == settlementId && s.WorldId == worldId, cancellationToken)
                .ConfigureAwait(false);

            if (settlement is null)
            {
                return MeSubjectResolution.SettlementNotFound;
            }

            return settlement.UserId == userId
                ? MeSubjectResolution.Resolved(settlement.Id)
                : MeSubjectResolution.NotOwner;
        }

        var owned = await _dbContext.Settlements
            .AsNoTracking()
            .Where(s => s.WorldId == worldId && s.UserId == userId)
            .Select(s => (Guid?)s.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return owned is { } ownedId ? MeSubjectResolution.Resolved(ownedId) : MeSubjectResolution.NoSettlementOwned;
    }

    private Task<LeaderboardSnapshotEntity?> CurrentSnapshotAsync(
        Guid worldId, LeaderboardScope scope, LeaderboardCategory category, CancellationToken cancellationToken) =>
        _dbContext.LeaderboardSnapshots
            .AsNoTracking()
            .FirstOrDefaultAsync(
                s => s.WorldId == worldId && s.Scope == scope && s.Category == category
                    && s.PeriodStart == null && !s.IsFinal,
                cancellationToken);
}

/// <summary>One board's directory entry (issue #43 §5).</summary>
public sealed record LeaderboardBoardStatus(
    LeaderboardScope Scope,
    LeaderboardCategory Category,
    bool Available,
    string? Reason,
    DateTimeOffset? ComputedAt,
    int? EntryCount);

/// <summary>One keyset page of a board, or its dark response.</summary>
public sealed record LeaderboardBoardPage(
    bool Available,
    string? Reason,
    bool IsFinal,
    DateTimeOffset? PeriodStart,
    DateTimeOffset? PeriodEnd,
    DateTimeOffset? ComputedAt,
    IReadOnlyList<LeaderboardEntryEntity> Items,
    int? NextAfterRank);

/// <summary>The caller's rank plus the entries around it.</summary>
public sealed record LeaderboardMeResult(int MyRank, IReadOnlyList<LeaderboardEntryEntity> Items);

/// <summary>Outcome of resolving which subject a <c>/me</c> call is about.</summary>
public readonly struct MeSubjectResolution
{
    private MeSubjectResolution(Guid? subjectId, string? failure)
    {
        SubjectId = subjectId;
        Failure = failure;
    }

    public Guid? SubjectId { get; }

    /// <summary><see langword="null"/> when resolution succeeded.</summary>
    public string? Failure { get; }

    public bool Succeeded => Failure is null;

    public static MeSubjectResolution Resolved(Guid subjectId) => new(subjectId, null);

    public static MeSubjectResolution NoSettlementOwned { get; } = new(null, nameof(NoSettlementOwned));

    public static MeSubjectResolution NotOwner { get; } = new(null, nameof(NotOwner));

    public static MeSubjectResolution SettlementNotFound { get; } = new(null, nameof(SettlementNotFound));
}
