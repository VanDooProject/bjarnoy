using System.ComponentModel.DataAnnotations;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.Contracts;

/// <summary>Whether push is enabled in this environment, and the public VAPID key the service worker's subscribe call needs.</summary>
public sealed record NotificationConfigResponse(bool Enabled, string? VapidPublicKey);

public sealed record PushSubscriptionResponse(
    Guid Id,
    string DeviceLabel,
    string? UserAgent,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastSeenAt,
    DateTimeOffset? LastDeliveredAt)
{
    /// <summary>Endpoint/keys are never returned — this device already has them.</summary>
    public static PushSubscriptionResponse From(PushSubscriptionEntity subscription)
    {
        ArgumentNullException.ThrowIfNull(subscription);

        return new PushSubscriptionResponse(
            subscription.Id,
            subscription.DeviceLabel,
            subscription.UserAgent,
            subscription.CreatedAt,
            subscription.LastSeenAt,
            subscription.LastDeliveredAt);
    }
}

public sealed record UpsertPushSubscriptionRequest(
    [property: Required, MaxLength(2048)] string Endpoint,
    [property: Required, MaxLength(256)] string P256dh,
    [property: Required, MaxLength(64)] string Auth,
    [property: Required, MaxLength(60)] string DeviceLabel,
    [property: MaxLength(512)] string? UserAgent);
