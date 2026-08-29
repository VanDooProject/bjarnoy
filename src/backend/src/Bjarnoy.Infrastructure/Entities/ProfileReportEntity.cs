namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// Where a <see cref="ProfileReportEntity"/> sits in the moderation queue.
/// <see cref="Pending"/> is the only state a player-submitted report starts
/// in; the other three are admin decisions (see <c>AdminProfileReportEndpoints</c>).
/// </summary>
public enum ProfileReportStatus
{
    /// <summary>Submitted by a player, not yet looked at by an admin.</summary>
    Pending = 0,

    /// <summary>An admin looked at it and no further action was needed.</summary>
    Reviewed = 1,

    /// <summary>An admin judged the report itself baseless.</summary>
    Dismissed = 2,

    /// <summary>
    /// An admin acted on it — typically by locking or banning the reported
    /// user through the existing <see cref="UserStatus"/> flow.
    /// </summary>
    Actioned = 3,
}

/// <summary>
/// A player's report of another player's profile (issue #42) — e.g. an
/// offensive bio — for moderator/admin review. Deliberately minimal: a
/// free-text reason plus an optional note, feeding the existing
/// <see cref="UserStatus"/> Active/Locked/Banned moderation flow rather than
/// introducing a parallel one. Report categories and rate limiting are
/// explicitly follow-ups, per the issue.
/// </summary>
public class ProfileReportEntity
{
    /// <summary>UUIDv7, so primary keys are time-ordered and index well.</summary>
    public Guid Id { get; set; } = Guid.CreateVersion7();

    /// <summary>The player who filed the report.</summary>
    public Guid ReporterUserId { get; set; }

    public UserEntity? Reporter { get; set; }

    /// <summary>The player whose profile was reported.</summary>
    public Guid ReportedUserId { get; set; }

    public UserEntity? ReportedUser { get; set; }

    /// <summary>Why the profile was reported, in the reporter's words.</summary>
    public required string Reason { get; set; }

    /// <summary>Optional extra context from the reporter.</summary>
    public string? Note { get; set; }

    public ProfileReportStatus Status { get; set; } = ProfileReportStatus.Pending;

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>When an admin moved this report out of <see cref="ProfileReportStatus.Pending"/>.</summary>
    public DateTimeOffset? ReviewedAt { get; set; }

    /// <summary>The admin who resolved this report.</summary>
    public Guid? ReviewedByUserId { get; set; }
}
