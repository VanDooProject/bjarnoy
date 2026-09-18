using Bjarnoy.Domain.Notifications;

namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// A queued (or already-sent) push notification. Every notification — a
/// synchronous event (a message sent) or a scheduled fact (a build
/// completing) — becomes exactly one row here; <c>PushDeliveryService</c> is
/// the single place that fans a row out to every one of the recipient's
/// <see cref="PushSubscriptionEntity"/> rows. See
/// <c>docs/plans/push-notifications.md</c> for the full design.
/// </summary>
public class NotificationOutboxEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    public UserEntity? User { get; set; }

    public NotificationType Type { get; set; }

    /// <summary>
    /// Identifies the underlying event so enqueuing it twice (a read racing
    /// the due-completion scanner, a retried request) is a no-op — e.g.
    /// <c>"build-complete:{orderId}"</c>, <c>"message:{messageRecipientId}"</c>.
    /// </summary>
    public required string DedupeKey { get; set; }

    /// <summary>Server-rendered, already-localised <c>{title, body, url, tag}</c> JSON.</summary>
    public required string PayloadJson { get; set; }

    /// <summary>Now, for immediate events; in the future for events scheduled ahead of time.</summary>
    public DateTimeOffset ScheduledFor { get; set; }

    /// <summary>Per-type TTL; also sent as the Web Push <c>TTL</c> header.</summary>
    public DateTimeOffset ExpiresAt { get; set; }

    public int Attempts { get; set; }

    /// <summary>Null while pending; set once delivery is attempted to completion (success or given up).</summary>
    public DateTimeOffset? SentAt { get; set; }

    public string? LastError { get; set; }
}
