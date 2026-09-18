using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Infrastructure.Services.Notifications;

/// <summary>
/// Outcome of one delivery attempt to one <see cref="PushSubscriptionEntity"/>.
/// </summary>
public enum PushSendOutcome
{
    Delivered,

    /// <summary>Push service returned 404/410 — the subscription no longer exists and must be deleted.</summary>
    Gone,

    /// <summary>429 or a 5xx — worth retrying later, not a reason to drop the subscription.</summary>
    TransientFailure,
}

public readonly record struct PushSendResult(PushSendOutcome Outcome, string? Error = null);

/// <summary>
/// Sends one already-rendered notification payload to one push subscription.
/// The only interface anything outside <c>Notifications/</c> should depend
/// on — <see cref="WebPushSender"/> is the sole caller of the
/// <c>Lib.Net.Http.WebPush</c> package, so the choice of library stays
/// swappable and tests never need a real push service.
/// </summary>
public interface IPushSender
{
    Task<PushSendResult> SendAsync(
        PushSubscriptionEntity subscription,
        string payloadJson,
        TimeSpan timeToLive,
        CancellationToken cancellationToken);
}
