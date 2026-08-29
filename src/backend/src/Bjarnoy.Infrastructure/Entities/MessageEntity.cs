namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// A player-to-player chat message. One row per message, one or more
/// <see cref="MessageRecipientEntity"/> rows for delivery — a direct message
/// today, a group/guild broadcast later, without a schema break.
/// </summary>
public class MessageEntity
{
    /// <summary>UUIDv7, so primary keys are time-ordered and index well.</summary>
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid SenderUserId { get; set; }

    public UserEntity? Sender { get; set; }

    public required string Body { get; set; }

    public DateTimeOffset SentAt { get; set; }

    public List<MessageRecipientEntity> Recipients { get; set; } = [];
}

/// <summary>
/// One recipient's delivery of a <see cref="MessageEntity"/>. This row is
/// also the read receipt: <see cref="ReadAt"/> is set the first time the
/// recipient reads it — there is no separate receipt table. Whether the
/// sender is allowed to <em>see</em> that value is a query-time rule (same
/// guild), not something enforced here.
/// </summary>
public class MessageRecipientEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid MessageId { get; set; }

    public MessageEntity? Message { get; set; }

    public Guid RecipientUserId { get; set; }

    public UserEntity? Recipient { get; set; }

    /// <summary>Null means unread.</summary>
    public DateTimeOffset? ReadAt { get; set; }
}
