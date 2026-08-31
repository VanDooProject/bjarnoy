using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Computes leaderboard snapshots (issue #43). Refreshes the current,
/// non-final all-time boards — <see cref="LeaderboardCategory.Score"/> (per
/// user) and <see cref="LeaderboardCategory.BiggestSettlement"/> (per
/// settlement) — closes due weekly windows (issue #43 PR 4), and writes the
/// world-end "hall of fame" snapshots. Battle-report folding is PR 5's work.
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

    /// <summary>
    /// Length of a weekly window: 7 game-days, anchored at world creation
    /// (issue #43 §1). Independent of <see cref="WorldEntity.SpeedFactor"/> —
    /// that factor scales build/production rates, not the game clock itself
    /// (see <see cref="WorldEntity.ToClock"/>) — which is exactly what makes a
    /// short Fjørdhold round (3-20 minutes) never complete one: the same
    /// fixed-length window simply never elapses within the round, no
    /// round-mode branch needed.
    /// </summary>
    public static readonly TimeSpan WeeklyWindowLength = TimeSpan.FromDays(7);

    private static readonly (LeaderboardScope Scope, LeaderboardCategory Category)[] AllTimeBoards =
    [
        (LeaderboardScope.User, LeaderboardCategory.Score),
        (LeaderboardScope.Settlement, LeaderboardCategory.BiggestSettlement),
    ];

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
            await CloseDueWindowsAsync(worldId, cancellationToken).ConfigureAwait(false);
            await FinalizeWorldEndSnapshotsAsync(worldId, cancellationToken).ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Refreshes <paramref name="worldId"/>'s current (non-final, all-time)
    /// boards, unless the last refresh is still within <see cref="RefreshInterval"/>.
    /// </summary>
    /// <remarks>
    /// Only ensures the watermark row exists and its
    /// <see cref="LeaderboardWatermarkEntity.LastSnapshotAt"/> is current;
    /// window closing (<see cref="CloseDueWindowsAsync"/>) reads the same row.
    /// Battle-report folding (advancing <see cref="LeaderboardWatermarkEntity.LastBattleReportId"/>)
    /// is issue #43 PR 5's work.
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
    /// Closes every whole game-time window between <paramref name="worldId"/>'s
    /// watermark and game-now, oldest first (issue #43 §4 step 4) — a restart,
    /// a long deploy, or a paused world never skips a window and never
    /// double-counts one, since each closed window advances the watermark
    /// before the next tick looks again.
    /// </summary>
    public async Task CloseDueWindowsAsync(Guid worldId, CancellationToken cancellationToken = default)
    {
        var world = await _dbContext.Worlds
            .AsNoTracking()
            .SingleOrDefaultAsync(w => w.Id == worldId, cancellationToken).ConfigureAwait(false);
        if (world is null)
        {
            return;
        }

        // A world's watermark row is created by RefreshCurrentBoardsAsync;
        // nothing to close against until that has run once.
        var watermark = await _dbContext.LeaderboardWatermarks
            .FirstOrDefaultAsync(w => w.WorldId == worldId, cancellationToken).ConfigureAwait(false);
        if (watermark is null)
        {
            return;
        }

        var wallNow = _timeProvider.GetUtcNow();
        var gameNow = world.ToClock().ToGameTime(wallNow);

        var due = DueWindows(world.CreatedAt, watermark.LastClosedPeriodStart, gameNow);
        if (due.Count == 0)
        {
            return;
        }

        var scored = await LoadScoredSettlementsAsync(worldId, cancellationToken).ConfigureAwait(false);
        var scoreByUser = scored.GroupBy(x => x.Settlement.UserId).ToDictionary(g => g.Key, g => g.Sum(x => x.Score));
        var nameByUser = scored.GroupBy(x => x.Settlement.UserId)
            .ToDictionary(g => g.Key, g => g.First().Settlement.Owner!.DisplayName ?? g.First().Settlement.Owner!.UserName);

        for (var i = 0; i < due.Count; i++)
        {
            await CloseOneWindowAsync(
                worldId, due[i].Start, due[i].End, isMostRecent: i == due.Count - 1,
                scoreByUser, nameByUser, watermark, wallNow, cancellationToken).ConfigureAwait(false);
        }
    }

    private static List<(DateTimeOffset Start, DateTimeOffset End)> DueWindows(
        DateTimeOffset anchor, DateTimeOffset? lastClosedStart, DateTimeOffset gameNow)
    {
        var cursor = lastClosedStart is { } last ? last + WeeklyWindowLength : anchor;
        var windows = new List<(DateTimeOffset, DateTimeOffset)>();
        while (cursor + WeeklyWindowLength <= gameNow)
        {
            windows.Add((cursor, cursor + WeeklyWindowLength));
            cursor += WeeklyWindowLength;
        }

        return windows;
    }

    /// <summary>
    /// Closes one window: upserts every active user's <see cref="WeeklyStatEntity"/>
    /// row and writes the matching final <see cref="LeaderboardCategory.WeeklyScoreGained"/>
    /// snapshot, then advances the watermark to this window's start.
    /// </summary>
    /// <remarks>
    /// <see cref="Bjarnoy.Domain.Buildings.Settlement.Score"/> is a pure function
    /// of *current* building levels — there is no historical ledger to read a
    /// user's score as of a past window boundary. So each user's cumulative
    /// gain so far (the sum of their already-final <see cref="WeeklyStatEntity.ScoreGained"/>
    /// rows) stands in for "score at the previous window's end", and only the
    /// window closing against a live "score now" (<paramref name="isMostRecent"/>)
    /// can compute a real delta. When one tick catches up several missed
    /// windows at once, the earlier ones in that batch get <c>ScoreGained = 0</c>
    /// rather than a guessed split — the whole elapsed gain lands on the most
    /// recent window instead, which is the last point at which "current score"
    /// and "score at this window's end" actually coincide.
    /// </remarks>
    private async Task CloseOneWindowAsync(
        Guid worldId,
        DateTimeOffset start,
        DateTimeOffset end,
        bool isMostRecent,
        Dictionary<Guid, double> scoreByUser,
        Dictionary<Guid, string> nameByUser,
        LeaderboardWatermarkEntity watermark,
        DateTimeOffset wallNow,
        CancellationToken cancellationToken)
    {
        var baselineByUser = await _dbContext.WeeklyStats
            .AsNoTracking()
            .Where(s => s.WorldId == worldId && s.IsFinal)
            .GroupBy(s => s.UserId)
            .Select(g => new { UserId = g.Key, Total = g.Sum(s => s.ScoreGained) })
            .ToDictionaryAsync(x => x.UserId, x => x.Total, cancellationToken).ConfigureAwait(false);

        var userIds = scoreByUser.Keys.Union(baselineByUser.Keys).ToList();
        var ranked = new List<(Guid UserId, string Name, double Gained)>();

        foreach (var userId in userIds)
        {
            var baseline = baselineByUser.GetValueOrDefault(userId);
            var gained = isMostRecent ? scoreByUser.GetValueOrDefault(userId) - baseline : 0.0;

            var stat = await _dbContext.WeeklyStats.FirstOrDefaultAsync(
                s => s.WorldId == worldId && s.UserId == userId && s.PeriodStart == start, cancellationToken)
                .ConfigureAwait(false);
            if (stat is null)
            {
                stat = new WeeklyStatEntity { WorldId = worldId, UserId = userId, PeriodStart = start, PeriodEnd = end };
                _dbContext.WeeklyStats.Add(stat);
            }

            stat.ScoreGained = gained;
            stat.IsFinal = true;

            ranked.Add((userId, nameByUser.GetValueOrDefault(userId, "Unknown"), gained));
        }

        var previous = await _dbContext.LeaderboardSnapshots
            .Include(s => s.Entries)
            .FirstOrDefaultAsync(
                s => s.WorldId == worldId && s.Scope == LeaderboardScope.User
                    && s.Category == LeaderboardCategory.WeeklyScoreGained
                    && s.PeriodStart == start - WeeklyWindowLength && s.IsFinal,
                cancellationToken)
            .ConfigureAwait(false);
        var previousRanks = previous?.Entries.ToDictionary(e => e.SubjectId, e => e.Rank) ?? [];

        var entries = ranked
            .OrderByDescending(e => e.Gained)
            .ThenBy(e => e.UserId)
            .Select((e, index) => new LeaderboardEntryEntity
            {
                Rank = index + 1,
                SubjectId = e.UserId,
                SubjectName = e.Name,
                Value = e.Gained,
                PreviousRank = previousRanks.TryGetValue(e.UserId, out var rank) ? rank : null,
            })
            .ToList();

        _dbContext.LeaderboardSnapshots.Add(new LeaderboardSnapshotEntity
        {
            WorldId = worldId,
            Scope = LeaderboardScope.User,
            Category = LeaderboardCategory.WeeklyScoreGained,
            PeriodStart = start,
            PeriodEnd = end,
            IsFinal = true,
            ComputedAt = wallNow,
            Entries = entries,
        });

        watermark.LastClosedPeriodStart = start;

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Once a world has ended (<see cref="WorldEntity.EndbossTriggeredAt"/>
    /// set), writes the final all-time "hall of fame" snapshot for every
    /// always-live board — idempotent, since each write checks for an
    /// existing final all-time snapshot of that board first (issue #43 §4
    /// step 5).
    /// </summary>
    public async Task FinalizeWorldEndSnapshotsAsync(Guid worldId, CancellationToken cancellationToken = default)
    {
        var world = await _dbContext.Worlds
            .AsNoTracking()
            .SingleOrDefaultAsync(w => w.Id == worldId, cancellationToken).ConfigureAwait(false);
        if (world?.EndbossTriggeredAt is null)
        {
            return;
        }

        var now = _timeProvider.GetUtcNow();
        var scored = await LoadScoredSettlementsAsync(worldId, cancellationToken).ConfigureAwait(false);

        var settlementBoard = scored
            .Select(x => (SubjectId: x.Settlement.Id, SubjectName: x.Settlement.Name, x.Score))
            .ToList();
        var userBoard = scored
            .GroupBy(x => x.Settlement.UserId)
            .Select(g => (
                SubjectId: g.Key,
                SubjectName: g.First().Settlement.Owner!.DisplayName ?? g.First().Settlement.Owner!.UserName,
                Score: g.Sum(x => x.Score)))
            .ToList();

        await WriteFinalAllTimeBoardAsync(
            worldId, LeaderboardScope.Settlement, LeaderboardCategory.BiggestSettlement,
            settlementBoard, now, cancellationToken).ConfigureAwait(false);
        await WriteFinalAllTimeBoardAsync(
            worldId, LeaderboardScope.User, LeaderboardCategory.Score,
            userBoard, now, cancellationToken).ConfigureAwait(false);
    }

    private async Task WriteFinalAllTimeBoardAsync(
        Guid worldId,
        LeaderboardScope scope,
        LeaderboardCategory category,
        List<(Guid SubjectId, string SubjectName, double Score)> items,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var alreadyFinalized = await _dbContext.LeaderboardSnapshots.AnyAsync(
            s => s.WorldId == worldId && s.Scope == scope && s.Category == category
                && s.PeriodStart == null && s.IsFinal,
            cancellationToken).ConfigureAwait(false);
        if (alreadyFinalized)
        {
            return;
        }

        var entries = items
            .OrderByDescending(i => i.Score)
            .ThenBy(i => i.SubjectId)
            .Select((i, index) => new LeaderboardEntryEntity
            {
                Rank = index + 1,
                SubjectId = i.SubjectId,
                SubjectName = i.SubjectName,
                Value = i.Score,
                PreviousRank = null,
            })
            .ToList();

        _dbContext.LeaderboardSnapshots.Add(new LeaderboardSnapshotEntity
        {
            WorldId = worldId,
            Scope = scope,
            Category = category,
            PeriodStart = null,
            PeriodEnd = null,
            IsFinal = true,
            ComputedAt = now,
            Entries = entries,
        });

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// The world's closed weekly windows, oldest first — derived from the
    /// watermark rather than from snapshot rows, so it stays correct even for
    /// weekly categories PR 4 does not compute (issue #43 §5, board directory).
    /// </summary>
    public async Task<IReadOnlyList<(DateTimeOffset PeriodStart, DateTimeOffset PeriodEnd)>> GetClosedWindowsAsync(
        Guid worldId, CancellationToken cancellationToken = default)
    {
        var world = await _dbContext.Worlds
            .AsNoTracking()
            .SingleOrDefaultAsync(w => w.Id == worldId, cancellationToken).ConfigureAwait(false);
        if (world is null)
        {
            return [];
        }

        var watermark = await _dbContext.LeaderboardWatermarks
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.WorldId == worldId, cancellationToken).ConfigureAwait(false);
        if (watermark?.LastClosedPeriodStart is not { } lastClosed)
        {
            return [];
        }

        var windows = new List<(DateTimeOffset, DateTimeOffset)>();
        var start = world.CreatedAt;
        while (start <= lastClosed)
        {
            windows.Add((start, start + WeeklyWindowLength));
            start += WeeklyWindowLength;
        }

        return windows;
    }

    /// <summary>
    /// A keyset page of <paramref name="userId"/>'s weekly stat cards, newest
    /// window first (issue #43 §5). Ids are UUIDv7 and windows close in
    /// ascending order, so paging by descending <c>Id</c> is equivalent to
    /// paging by descending <c>PeriodStart</c> without needing to order by a
    /// <see cref="DateTimeOffset"/> (SQLite has no native type for one).
    /// </summary>
    public async Task<(IReadOnlyList<WeeklyStatEntity> Items, Guid? NextCursor)> GetWeeklyStatsAsync(
        Guid worldId, Guid userId, Guid? cursor, int pageSize, CancellationToken cancellationToken = default)
    {
        var query = _dbContext.WeeklyStats
            .AsNoTracking()
            .Where(s => s.WorldId == worldId && s.UserId == userId);

        if (cursor is { } after)
        {
            query = query.Where(s => s.Id.CompareTo(after) < 0);
        }

        var items = await query
            .OrderByDescending(s => s.Id)
            .Take(pageSize)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return (items, items.Count == pageSize ? items[^1].Id : null);
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

        // Weekly boards have no "current" (all-time) snapshot; the latest
        // closed window is the closest thing to one, and is what lights
        // WeeklyScoreGained up the moment the first window closes.
        var finals = await _dbContext.LeaderboardSnapshots
            .AsNoTracking()
            .Where(s => s.WorldId == worldId && s.IsFinal && s.PeriodStart != null)
            .Select(s => new { s.Scope, s.Category, s.PeriodStart, s.ComputedAt, EntryCount = s.Entries.Count })
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        var latestFinal = finals
            .GroupBy(s => (s.Scope, s.Category))
            .Select(g => g.OrderByDescending(s => s.PeriodStart).First())
            .ToList();

        return
        [
            .. LeaderboardCatalogue.Boards.Keys.Select(board =>
            {
                var snapshot = current.Find(s => s.Scope == board.Scope && s.Category == board.Category);
                if (snapshot is not null)
                {
                    return new LeaderboardBoardStatus(
                        board.Scope, board.Category, Available: true, Reason: null,
                        snapshot.ComputedAt, snapshot.EntryCount);
                }

                var final = latestFinal.Find(s => s.Scope == board.Scope && s.Category == board.Category);
                return final is not null
                    ? new LeaderboardBoardStatus(
                        board.Scope, board.Category, Available: true, Reason: null,
                        final.ComputedAt, final.EntryCount)
                    : new LeaderboardBoardStatus(
                        board.Scope, board.Category, Available: false,
                        LeaderboardCatalogue.DarkReason(board.Scope, board.Category), ComputedAt: null, EntryCount: null);
            }),
        ];
    }

    /// <summary>
    /// A keyset page (<c>Rank &gt; afterRank</c>, ordered by <c>Rank</c>) of a
    /// board's snapshot, or the dark response if none exists yet (issue #43
    /// §5, board page). <paramref name="periodStart"/> null means the current
    /// board (the live all-time snapshot, or — for a weekly-only category —
    /// the most recently closed window); a non-null value asks for that exact
    /// closed window's final snapshot.
    /// </summary>
    public async Task<LeaderboardBoardPage> GetBoardPageAsync(
        Guid worldId,
        LeaderboardScope scope,
        LeaderboardCategory category,
        DateTimeOffset? periodStart,
        int afterRank,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await CurrentSnapshotAsync(worldId, scope, category, periodStart, cancellationToken).ConfigureAwait(false);
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
        var snapshot = await CurrentSnapshotAsync(worldId, scope, category, periodStart: null, cancellationToken).ConfigureAwait(false);
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

    /// <summary>
    /// Resolves which snapshot a board read means by "this board": the exact
    /// final window when <paramref name="periodStart"/> is given, otherwise
    /// the live current (all-time) snapshot, falling back to the most
    /// recently closed window for a weekly-only category that has no current
    /// snapshot of its own.
    /// </summary>
    private async Task<LeaderboardSnapshotEntity?> CurrentSnapshotAsync(
        Guid worldId,
        LeaderboardScope scope,
        LeaderboardCategory category,
        DateTimeOffset? periodStart,
        CancellationToken cancellationToken)
    {
        if (periodStart is not null)
        {
            return await _dbContext.LeaderboardSnapshots
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    s => s.WorldId == worldId && s.Scope == scope && s.Category == category
                        && s.PeriodStart == periodStart && s.IsFinal,
                    cancellationToken).ConfigureAwait(false);
        }

        var current = await _dbContext.LeaderboardSnapshots
            .AsNoTracking()
            .FirstOrDefaultAsync(
                s => s.WorldId == worldId && s.Scope == scope && s.Category == category
                    && s.PeriodStart == null && !s.IsFinal,
                cancellationToken).ConfigureAwait(false);
        if (current is not null)
        {
            return current;
        }

        // OrderByDescending(Id) rather than PeriodStart: SQLite cannot ORDER BY
        // a DateTimeOffset, and windows close in ascending order, so the
        // newest window also has the newest (UUIDv7) Id.
        return await _dbContext.LeaderboardSnapshots
            .AsNoTracking()
            .Where(s => s.WorldId == worldId && s.Scope == scope && s.Category == category
                && s.PeriodStart != null && s.IsFinal)
            .OrderByDescending(s => s.Id)
            .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
    }
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
