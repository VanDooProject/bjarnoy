namespace Bjarnoy.Infrastructure.Entities;

/// <summary>Who a leaderboard entry's <see cref="LeaderboardEntryEntity.SubjectId"/> identifies.</summary>
/// <remarks><see cref="Guild"/> is reserved: no guild schema exists yet (issue #43 §3).</remarks>
public enum LeaderboardScope
{
    User = 0,
    Settlement = 1,
    Guild = 2,
}

/// <summary>
/// Which ranking a snapshot holds. The weekly and army categories are reserved:
/// they ship dark until #40's battle reports and army model exist (issue #43 §3).
/// </summary>
public enum LeaderboardCategory
{
    Score = 0,
    BiggestSettlement = 1,
    WeeklyScoreGained = 2,
    WeeklyFightsWon = 3,
    WeeklyFightsLost = 4,
    WeeklyResourcesLooted = 5,
    BiggestArmy = 6,
}

/// <summary>
/// One materialized ranking for a <see cref="LeaderboardScope"/>/<see cref="LeaderboardCategory"/>
/// pair, computed by <c>LeaderboardService</c> rather than queried live — see
/// issue #43 §1, "rankings are snapshots, ordered pages, not sorted live queries".
/// </summary>
/// <remarks>
/// <see cref="IsFinal"/> distinguishes the current, replaceable board (the only
/// kind PR 1 produces) from an immutable closed-window record (PR 4 onward).
/// </remarks>
public class LeaderboardSnapshotEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid WorldId { get; set; }

    public WorldEntity? World { get; set; }

    public LeaderboardScope Scope { get; set; }

    public LeaderboardCategory Category { get; set; }

    /// <summary>Game time; <see langword="null"/> means an all-time board.</summary>
    public DateTimeOffset? PeriodStart { get; set; }

    /// <summary><see langword="null"/> for an all-time board; set once a weekly window is closed.</summary>
    public DateTimeOffset? PeriodEnd { get; set; }

    /// <summary>True once a weekly window (or the world) has closed. Final snapshots are never replaced.</summary>
    public bool IsFinal { get; set; }

    /// <summary>Wall clock the snapshot was computed at. Diagnostics only.</summary>
    public DateTimeOffset ComputedAt { get; set; }

    public List<LeaderboardEntryEntity> Entries { get; set; } = [];
}

/// <summary>One ranked subject within a <see cref="LeaderboardSnapshotEntity"/>.</summary>
public class LeaderboardEntryEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid SnapshotId { get; set; }

    public LeaderboardSnapshotEntity? Snapshot { get; set; }

    /// <summary>Dense, 1-based.</summary>
    public int Rank { get; set; }

    /// <summary>
    /// The user/settlement/guild id, per the snapshot's <see cref="LeaderboardSnapshotEntity.Scope"/>.
    /// No FK — polymorphic by scope, the same pattern as <c>ReportEntity.SourceId</c> in #41.
    /// </summary>
    public Guid SubjectId { get; set; }

    /// <summary>
    /// Denormalized display name at snapshot time, so a final snapshot stays
    /// readable if the subject renames or is deleted.
    /// </summary>
    public required string SubjectName { get; set; }

    /// <summary>Score, count, or loot sum — category-dependent.</summary>
    public double Value { get; set; }

    /// <summary>Rank in the previous snapshot of the same board; <see langword="null"/> = new entrant.</summary>
    public int? PreviousRank { get; set; }
}

/// <summary>
/// One row per world: the aggregation job's "already done" marker, the same
/// idea as <see cref="WorldEntity.EndbossTriggeredAt"/> but in its own table
/// because it will grow cursors and the world row should not churn every poll.
/// </summary>
public class LeaderboardWatermarkEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid WorldId { get; set; }

    public WorldEntity? World { get; set; }

    /// <summary>Game time of the newest closed window; <see langword="null"/> = none closed yet.</summary>
    public DateTimeOffset? LastClosedPeriodStart { get; set; }

    /// <summary>Wall clock of the last current-board refresh, for staleness checks.</summary>
    public DateTimeOffset LastSnapshotAt { get; set; }

    /// <summary>
    /// UUIDv7 cursor into battle reports already folded into weekly stats
    /// (issue #43 PR 5); <see langword="null"/> until #40 PR 3 lands.
    /// </summary>
    public Guid? LastBattleReportId { get; set; }
}
