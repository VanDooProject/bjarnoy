using System.ComponentModel.DataAnnotations;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.Contracts;

public sealed record SendMessageRequest(
    [property: Required] Guid RecipientUserId,
    [property: Required, MinLength(1), MaxLength(2000)] string Body);

/// <param name="ReadAt">
/// When the recipient read this message — but only ever populated for the
/// sender when <paramref name="ReadReceiptVisible"/> is true (sender and
/// recipient in the same guild). Always null for the recipient's own copy,
/// and always null for everyone until guilds exist.
/// </param>
/// <param name="ReadReceiptVisible">
/// Whether <paramref name="ReadAt"/> is allowed to be shown to the caller —
/// distinct from "unread", so the client can tell "hidden" from "not yet read".
/// </param>
public sealed record MessageResponse(
    Guid Id,
    Guid SenderUserId,
    Guid RecipientUserId,
    string Body,
    DateTimeOffset SentAt,
    DateTimeOffset? ReadAt,
    bool ReadReceiptVisible)
{
    public static MessageResponse From(MessageEntity message, Guid recipientUserId, bool readReceiptVisible)
    {
        ArgumentNullException.ThrowIfNull(message);

        var recipient = message.Recipients.First(r => r.RecipientUserId == recipientUserId);
        return new MessageResponse(
            message.Id,
            message.SenderUserId,
            recipientUserId,
            message.Body,
            message.SentAt,
            readReceiptVisible ? recipient.ReadAt : null,
            readReceiptVisible);
    }
}

public sealed record ConversationResponse(
    Guid OtherUserId,
    string OtherUserName,
    string? OtherDisplayName,
    MessageResponse LastMessage,
    int UnreadCount);

public sealed record PagedMessagesResponse(IReadOnlyList<MessageResponse> Items, int TotalCount, int Page, int PageSize);

public sealed record PagedConversationsResponse(
    IReadOnlyList<ConversationResponse> Items, int Page, int PageSize);

public sealed record MarkReadResponse(int MarkedRead);

public sealed record ReportMessageRequest([property: Required, MinLength(1), MaxLength(500)] string Reason);

/// <param name="Status">One of <c>pending</c>, <c>resolved</c>, <c>dismissed</c>, <c>actioned</c>.</param>
public sealed record ReportResponse(
    Guid Id,
    Guid ReporterUserId,
    string ReporterUserName,
    Guid ReportedUserId,
    string ReportedUserName,
    string SourceType,
    Guid SourceId,
    string ContextSnapshot,
    string Reason,
    string? Note,
    DateTimeOffset CreatedAt,
    string Status,
    DateTimeOffset? ResolvedAt,
    string? ResolutionNote)
{
    public static ReportResponse From(ReportEntity report)
    {
        ArgumentNullException.ThrowIfNull(report);
        ArgumentNullException.ThrowIfNull(report.Reporter);
        ArgumentNullException.ThrowIfNull(report.ReportedUser);

        return new ReportResponse(
            report.Id,
            report.ReporterUserId,
            report.Reporter.UserName,
            report.ReportedUserId,
            report.ReportedUser.UserName,
            ToWireName(report.SourceType),
            report.SourceId,
            report.ContextSnapshot,
            report.Reason,
            report.Note,
            report.CreatedAt,
            report.Status.ToString().ToLowerInvariant(),
            report.ResolvedAt,
            report.ResolutionNote);
    }

    /// <summary>camelCase on the wire, matching the AdminListReports query param's <c>sourceType</c> values.</summary>
    private static string ToWireName(ReportSourceType sourceType)
    {
        var name = sourceType.ToString();
        return char.ToLowerInvariant(name[0]) + name[1..];
    }
}

public sealed record PagedReportsResponse(IReadOnlyList<ReportResponse> Items, int TotalCount, int Page, int PageSize);

public sealed record ResolveReportRequest(
    [property: Required] string Outcome,
    [property: MaxLength(500)] string? Note = null);
