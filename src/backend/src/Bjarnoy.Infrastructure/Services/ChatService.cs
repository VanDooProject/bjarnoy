using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

public enum SendMessageOutcome
{
    Success,
    RecipientNotFound,
    MessageToSelf,
}

public enum ReportMessageOutcome
{
    Success,

    /// <summary>Already open/resolved for this reporter — the existing report is returned instead.</summary>
    AlreadyReported,

    /// <summary>No such message, or the caller is neither its sender nor its recipient.</summary>
    MessageNotVisible,
}

public enum ResolveReportOutcome
{
    Success,
    NotFound,
}

public sealed record ConversationSummary(
    UserEntity OtherUser, MessageEntity LastMessage, bool LastMessageReadReceiptVisible, int UnreadCount);

public sealed record MessagesPage(IReadOnlyList<MessageEntity> Messages, int TotalCount);

public sealed record ReportsPage(IReadOnlyList<ReportEntity> Reports, int TotalCount);

/// <summary>
/// Player-to-player direct messages, reports on them, and the guild-scoped
/// read-receipt visibility rule — issue #41. A message is delivered as one
/// <see cref="MessageEntity"/> plus one <see cref="MessageRecipientEntity"/>
/// per recipient (a single row for a DM today); that row's
/// <see cref="MessageRecipientEntity.ReadAt"/> doubles as the read receipt.
/// </summary>
public sealed class ChatService(GameDbContext dbContext, TimeProvider timeProvider)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;

    /// <summary>
    /// Whether <paramref name="senderId"/> is allowed to see when
    /// <paramref name="recipientId"/> read a message: only when both are in
    /// the same guild. There is no guild system yet (see
    /// <see cref="UserEntity.GuildId"/>), so this is always false until one
    /// exists — the single place that changes when it does.
    /// </summary>
    private async Task<bool> IsReadReceiptVisibleAsync(
        Guid senderId, Guid recipientId, CancellationToken cancellationToken)
    {
        var guildIds = await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.Id == senderId || u.Id == recipientId)
            .Select(u => new { u.Id, u.GuildId })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var senderGuild = guildIds.FirstOrDefault(u => u.Id == senderId)?.GuildId;
        var recipientGuild = guildIds.FirstOrDefault(u => u.Id == recipientId)?.GuildId;
        return senderGuild is not null && senderGuild == recipientGuild;
    }

    public async Task<(SendMessageOutcome Outcome, MessageEntity? Message)> SendAsync(
        Guid senderId, Guid recipientId, string body, CancellationToken cancellationToken = default)
    {
        if (senderId == recipientId)
        {
            return (SendMessageOutcome.MessageToSelf, null);
        }

        var recipientExists = await _dbContext.Users
            .AsNoTracking()
            .AnyAsync(u => u.Id == recipientId, cancellationToken)
            .ConfigureAwait(false);
        if (!recipientExists)
        {
            return (SendMessageOutcome.RecipientNotFound, null);
        }

        var message = new MessageEntity
        {
            SenderUserId = senderId,
            Body = body,
            SentAt = _timeProvider.GetUtcNow(),
            Recipients = [new MessageRecipientEntity { RecipientUserId = recipientId }],
        };

        _dbContext.Messages.Add(message);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return (SendMessageOutcome.Success, message);
    }

    /// <summary>One row per counterparty, most recently active conversation first.</summary>
    public async Task<IReadOnlyList<ConversationSummary>> GetConversationsAsync(
        Guid userId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        // Every message this user sent or received, newest first; grouped in
        // memory by counterparty since "the other party" flips between
        // SenderUserId and RecipientUserId depending on direction, which SQL
        // GROUP BY cannot express as cleanly as a short in-memory fold. Chat
        // history is not expected to be huge enough for this to matter.
        var involving = await _dbContext.Messages
            .AsNoTracking()
            .Where(m => m.SenderUserId == userId || m.Recipients.Any(r => r.RecipientUserId == userId))
            .Include(m => m.Recipients)
            .OrderByDescending(m => m.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var byOther = new Dictionary<Guid, (MessageEntity Last, int Unread)>();
        foreach (var message in involving)
        {
            var isSender = message.SenderUserId == userId;
            var otherId = isSender
                ? message.Recipients.First().RecipientUserId
                : message.SenderUserId;

            if (!byOther.ContainsKey(otherId))
            {
                byOther[otherId] = (message, 0);
            }

            if (!isSender && message.Recipients.First(r => r.RecipientUserId == userId).ReadAt is null)
            {
                var (last, unread) = byOther[otherId];
                byOther[otherId] = (last, unread + 1);
            }
        }

        var ordered = byOther
            .OrderByDescending(kv => kv.Value.Last.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        var otherIds = ordered.Select(kv => kv.Key).ToList();
        var otherUsers = await _dbContext.Users
            .AsNoTracking()
            .Where(u => otherIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, cancellationToken)
            .ConfigureAwait(false);

        var summaries = new List<ConversationSummary>();
        foreach (var (otherId, (last, unread)) in ordered)
        {
            if (!otherUsers.TryGetValue(otherId, out var otherUser))
            {
                continue;
            }

            var readReceiptVisible = last.SenderUserId == userId
                && await IsReadReceiptVisibleAsync(userId, otherId, cancellationToken).ConfigureAwait(false);
            summaries.Add(new ConversationSummary(otherUser, last, readReceiptVisible, unread));
        }

        return summaries;
    }

    /// <summary>Messages between the caller and one other user, newest first.</summary>
    public async Task<MessagesPage> GetConversationAsync(
        Guid userId, Guid otherUserId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var query = _dbContext.Messages
            .AsNoTracking()
            .Include(m => m.Recipients)
            .Where(m =>
                (m.SenderUserId == userId && m.Recipients.Any(r => r.RecipientUserId == otherUserId))
                || (m.SenderUserId == otherUserId && m.Recipients.Any(r => r.RecipientUserId == userId)));

        var totalCount = await query.CountAsync(cancellationToken).ConfigureAwait(false);

        var messages = await query
            .OrderByDescending(m => m.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new MessagesPage(messages, totalCount);
    }

    /// <summary>Whether <paramref name="userId"/> may see <paramref name="senderId"/>'s ReadAt on a message it sent.</summary>
    public Task<bool> CanSeeReadReceiptAsync(Guid senderId, Guid recipientId, CancellationToken cancellationToken = default) =>
        IsReadReceiptVisibleAsync(senderId, recipientId, cancellationToken);

    /// <summary>Marks every unread message from <paramref name="otherUserId"/> to <paramref name="userId"/> as read.</summary>
    public async Task<int> MarkConversationReadAsync(
        Guid userId, Guid otherUserId, CancellationToken cancellationToken = default)
    {
        var unread = await _dbContext.MessageRecipients
            .Where(r => r.RecipientUserId == userId
                && r.ReadAt == null
                && r.Message!.SenderUserId == otherUserId)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (unread.Count == 0)
        {
            return 0;
        }

        var now = _timeProvider.GetUtcNow();
        foreach (var recipient in unread)
        {
            recipient.ReadAt = now;
        }

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return unread.Count;
    }

    public async Task<(ReportMessageOutcome Outcome, ReportEntity? Report)> ReportMessageAsync(
        Guid reporterId, Guid messageId, string reason, CancellationToken cancellationToken = default)
    {
        var message = await _dbContext.Messages
            .AsNoTracking()
            .Include(m => m.Sender)
            .Include(m => m.Recipients)
            .FirstOrDefaultAsync(m => m.Id == messageId, cancellationToken)
            .ConfigureAwait(false);

        var visible = message is not null
            && (message.SenderUserId == reporterId || message.Recipients.Any(r => r.RecipientUserId == reporterId));
        if (!visible)
        {
            return (ReportMessageOutcome.MessageNotVisible, null);
        }

        var existing = await _dbContext.Reports
            .Include(r => r.Reporter)
            .FirstOrDefaultAsync(
                r => r.ReporterUserId == reporterId
                    && r.SourceType == ReportSourceType.ChatMessage
                    && r.SourceId == messageId,
                cancellationToken)
            .ConfigureAwait(false);
        if (existing is not null)
        {
            return (ReportMessageOutcome.AlreadyReported, existing);
        }

        var reporter = await _dbContext.Users
            .FirstAsync(u => u.Id == reporterId, cancellationToken)
            .ConfigureAwait(false);

        var report = new ReportEntity
        {
            ReporterUserId = reporterId,
            Reporter = reporter,
            SourceType = ReportSourceType.ChatMessage,
            SourceId = messageId,
            ContextSnapshot = $"{message!.Sender?.UserName ?? message.SenderUserId.ToString()}: {message.Body}",
            Reason = reason,
            CreatedAt = _timeProvider.GetUtcNow(),
        };

        _dbContext.Reports.Add(report);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return (ReportMessageOutcome.Success, report);
    }

    public async Task<ReportsPage> GetReportsAsync(
        ReportStatus? status, ReportSourceType? sourceType, int page, int pageSize,
        CancellationToken cancellationToken = default)
    {
        var query = _dbContext.Reports.AsNoTracking().Include(r => r.Reporter).AsQueryable();

        if (status is { } statusFilter)
        {
            query = query.Where(r => r.Status == statusFilter);
        }

        if (sourceType is { } sourceTypeFilter)
        {
            query = query.Where(r => r.SourceType == sourceTypeFilter);
        }

        var totalCount = await query.CountAsync(cancellationToken).ConfigureAwait(false);

        var reports = await query
            .OrderBy(r => r.Status)
            .ThenBy(r => r.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new ReportsPage(reports, totalCount);
    }

    public async Task<(ResolveReportOutcome Outcome, ReportEntity? Report)> ResolveReportAsync(
        Guid reportId, Guid adminUserId, ReportStatus outcome, string? note,
        CancellationToken cancellationToken = default)
    {
        var report = await _dbContext.Reports
            .Include(r => r.Reporter)
            .FirstOrDefaultAsync(r => r.Id == reportId, cancellationToken)
            .ConfigureAwait(false);
        if (report is null)
        {
            return (ResolveReportOutcome.NotFound, null);
        }

        report.Status = outcome;
        report.ResolvedByUserId = adminUserId;
        report.ResolvedAt = _timeProvider.GetUtcNow();
        report.ResolutionNote = note;

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return (ResolveReportOutcome.Success, report);
    }
}
