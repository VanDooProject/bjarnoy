namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// One browser/device's Web Push subscription (RFC 8030 endpoint + client
/// keys). One row per browser install — a browser has exactly one active
/// subscription per origin, enforced by a unique index on
/// <see cref="Endpoint"/> — owned by whichever account is currently signed
/// in on that device (re-parented on account switch, see
/// <c>NotificationEndpoints</c>). Revocation is a hard delete: unlike
/// <see cref="RefreshTokenEntity"/> there is no reuse-detection reason to
/// keep a row around after it stops being valid.
/// </summary>
public class PushSubscriptionEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    public UserEntity? User { get; set; }

    /// <summary>The push service URL a server posts encrypted messages to.</summary>
    public required string Endpoint { get; set; }

    /// <summary>Client public key (base64url), used to encrypt the push payload.</summary>
    public required string P256dh { get; set; }

    /// <summary>Client auth secret (base64url), used to encrypt the push payload.</summary>
    public required string Auth { get; set; }

    /// <summary>Client-derived default (e.g. "Chrome on Android"), user-editable.</summary>
    public required string DeviceLabel { get; set; }

    public string? UserAgent { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Touched by the client's reconcile-on-open pass.</summary>
    public DateTimeOffset LastSeenAt { get; set; }

    public DateTimeOffset? LastDeliveredAt { get; set; }

    /// <summary>
    /// Consecutive non-410 delivery failures. The row is deleted once this
    /// reaches the delivery worker's threshold — see <c>PushDeliveryService</c>.
    /// </summary>
    public int FailureCount { get; set; }
}
