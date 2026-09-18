using System.Collections.Concurrent;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services.Notifications;

namespace Bjarnoy.Api.IntegrationTests.Infrastructure;

/// <summary>
/// A fake <see cref="IPushSender"/> that records every send instead of
/// calling a real push service — swapped in by
/// <see cref="BjarnoyApiFactory.WithPush"/> the same way the factory swaps
/// <see cref="TimeProvider"/>. Tests set <see cref="NextOutcome"/> to drive
/// <see cref="PushDeliveryService"/>'s branches (410 deletes the
/// subscription, a transient failure retries).
/// </summary>
public sealed class RecordingPushSender : IPushSender
{
    public sealed record SentPush(Guid SubscriptionId, string PayloadJson);

    private readonly ConcurrentQueue<SentPush> _sent = new();

    /// <summary>What the next (and every subsequent, until changed) send returns. Defaults to a successful delivery.</summary>
    public PushSendResult NextOutcome { get; set; } = new(PushSendOutcome.Delivered);

    public IReadOnlyCollection<SentPush> Sent => [.. _sent];

    public Task<PushSendResult> SendAsync(
        PushSubscriptionEntity subscription, string payloadJson, TimeSpan timeToLive, CancellationToken cancellationToken)
    {
        _sent.Enqueue(new SentPush(subscription.Id, payloadJson));
        return Task.FromResult(NextOutcome);
    }
}
