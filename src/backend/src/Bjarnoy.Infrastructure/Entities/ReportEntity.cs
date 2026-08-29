namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// What kind of thing a <see cref="ReportEntity"/> points at. Chat is the only
/// source implemented today; the type exists so a future report on, say, a
/// settlement name or a trade offer reuses the same moderation queue instead
/// of inventing a parallel one.
/// </summary>
public enum ReportSourceType
{
    ChatMessage = 0,
}

public enum ReportStatus
{
    Open = 0,
    Resolved = 1,
    Dismissed = 2,
}

/// <summary>
/// A player's report of some other piece of game content, queued for an
/// Admin to review. Deliberately generic: <see cref="SourceType"/> plus
/// <see cref="SourceId"/> identify the reported thing polymorphically, with
/// no foreign key to any one table, so new report sources need no schema
/// change here — only a new <see cref="ReportSourceType"/> value and a
/// resolver for it.
/// </summary>
public class ReportEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid ReporterUserId { get; set; }

    public UserEntity? Reporter { get; set; }

    public ReportSourceType SourceType { get; set; }

    public Guid SourceId { get; set; }

    /// <summary>
    /// A denormalized copy of the reported content taken at report time (for
    /// chat: sender name and body), so the report stays reviewable even if
    /// the source row is later deleted, and the admin queue lists reports
    /// without a polymorphic join per source type.
    /// </summary>
    public required string ContextSnapshot { get; set; }

    public required string Reason { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public ReportStatus Status { get; set; } = ReportStatus.Open;

    public Guid? ResolvedByUserId { get; set; }

    public UserEntity? ResolvedBy { get; set; }

    public DateTimeOffset? ResolvedAt { get; set; }

    public string? ResolutionNote { get; set; }
}
