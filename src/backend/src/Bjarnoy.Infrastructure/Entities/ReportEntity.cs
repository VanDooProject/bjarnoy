namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// What kind of thing a <see cref="ReportEntity"/> points at. Started as
/// chat-only (issue #41); <see cref="ProfileBio"/> folds in what used to be
/// the separate <c>ProfileReportEntity</c> (issue #42) onto this same queue.
/// The type exists so a future report source (a settlement name, a trade
/// offer) reuses the same moderation queue instead of inventing a parallel
/// one.
/// </summary>
public enum ReportSourceType
{
    ChatMessage = 0,
    ProfileBio = 1,
}

/// <summary>
/// <see cref="Pending"/> is the only state a player-submitted report starts
/// in; the other three are admin decisions.
/// </summary>
public enum ReportStatus
{
    /// <summary>Submitted by a player, not yet looked at by an admin.</summary>
    Pending = 0,

    /// <summary>An admin looked at it and no further action was needed.</summary>
    Resolved = 1,

    /// <summary>An admin judged the report itself baseless.</summary>
    Dismissed = 2,

    /// <summary>
    /// An admin acted on it — typically by locking or banning the reported
    /// user through the existing <see cref="UserStatus"/> flow.
    /// </summary>
    Actioned = 3,
}

/// <summary>
/// A player's report of some other piece of game content, queued for an
/// Admin to review. Deliberately generic: <see cref="SourceType"/> plus
/// <see cref="SourceId"/> identify the reported thing polymorphically, with
/// no foreign key to any one table, so new report sources need no schema
/// change here — only a new <see cref="ReportSourceType"/> value and
/// whatever builds its <see cref="ContextSnapshot"/>.
/// </summary>
public class ReportEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    /// <summary>The player who filed the report.</summary>
    public Guid ReporterUserId { get; set; }

    public UserEntity? Reporter { get; set; }

    /// <summary>
    /// The player being reported — a chat message's sender, or a profile's
    /// owner. Always a real user, so the admin queue can jump straight to
    /// <see cref="UserService.SetStatusAsync"/> without a per-source-type
    /// join. A user account going away must not silently delete the
    /// moderation record, hence <c>Restrict</c> on both this and
    /// <see cref="ReporterUserId"/> (users are never deleted today).
    /// </summary>
    public Guid ReportedUserId { get; set; }

    public UserEntity? ReportedUser { get; set; }

    public ReportSourceType SourceType { get; set; }

    /// <summary>The reported thing's id in its own table — a message id, or (for a profile) the same as <see cref="ReportedUserId"/>.</summary>
    public Guid SourceId { get; set; }

    /// <summary>
    /// A denormalized copy of the reported content taken at report time (a
    /// chat message's sender name and body, or a profile's bio), so the
    /// report stays reviewable even if the source row changes or is deleted,
    /// and the admin queue lists reports without a polymorphic join per
    /// source type.
    /// </summary>
    public required string ContextSnapshot { get; set; }

    /// <summary>Why the reporter is reporting this, in their own words.</summary>
    public required string Reason { get; set; }

    /// <summary>Optional extra context from the reporter.</summary>
    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public ReportStatus Status { get; set; } = ReportStatus.Pending;

    /// <summary>The admin who resolved this report.</summary>
    public Guid? ResolvedByUserId { get; set; }

    public UserEntity? ResolvedBy { get; set; }

    /// <summary>When an admin moved this report out of <see cref="ReportStatus.Pending"/>.</summary>
    public DateTimeOffset? ResolvedAt { get; set; }

    public string? ResolutionNote { get; set; }
}
