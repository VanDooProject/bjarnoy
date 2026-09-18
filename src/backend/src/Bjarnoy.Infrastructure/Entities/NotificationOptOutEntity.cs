using Bjarnoy.Domain.Notifications;

namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// A single "this user turned this notification type off" row. Absence of a
/// row for a given <see cref="UserId"/>/<see cref="Type"/> pair means the
/// type is enabled — chosen over a per-user JSON/bitmask column so that
/// shipping a new <see cref="NotificationType"/> value needs no migration or
/// backfill (every existing user is enabled for it by default), and so the
/// delivery worker's filter is a plain <c>NOT EXISTS</c> rather than
/// provider-specific JSON parsing (SQLite and PostgreSQL disagree on JSON
/// operators). See <c>docs/plans/push-notifications.md</c>.
/// </summary>
public class NotificationOptOutEntity
{
    public Guid UserId { get; set; }

    public UserEntity? User { get; set; }

    public NotificationType Type { get; set; }
}
