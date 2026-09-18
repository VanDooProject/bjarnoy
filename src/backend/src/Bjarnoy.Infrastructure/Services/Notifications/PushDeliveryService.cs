using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services.Notifications;

/// <summary>
/// Drains <c>notification_outbox</c>: sends each due, unsent row to every
/// one of its recipient's push subscriptions, via
/// <see cref="PushDeliveryHostedService"/> in <c>Bjarnoy.Api</c> (the same
/// "poll a due-work table" shape as <c>EndbossTriggerHostedService</c>). See
/// <c>docs/plans/push-notifications.md</c>.
/// </summary>
public sealed class PushDeliveryService(GameDbContext dbContext, IPushSender pushSender, TimeProvider timeProvider)
{
    /// <summary>Consecutive transient failures before a subscription is treated as dead and dropped.</summary>
    private const int MaxSubscriptionFailures = 5;

    /// <summary>Consecutive transient failures before an outbox row gives up rather than retrying forever.</summary>
    private const int MaxDeliveryAttempts = 5;

    private const int BatchSize = 100;

    private static readonly TimeSpan SentRowRetention = TimeSpan.FromDays(7);

    private readonly GameDbContext _dbContext = dbContext;
    private readonly IPushSender _pushSender = pushSender;
    private readonly TimeProvider _timeProvider = timeProvider;

    public async Task DeliverDueAsync(CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow();

        // DateTimeOffset comparisons (<=, >) are filtered client-side
        // throughout this method — SQLite's EF provider cannot translate
        // them, only equality (SentAt == null below); same workaround as
        // TradeService's ListBoardAsync/SettleDeliveriesAsync.
        var unsent = await _dbContext.NotificationOutbox
            .Where(o => o.SentAt == null)
            .ToListAsync(cancellationToken);

        var stale = unsent.Where(o => o.ExpiresAt <= now).ToList();
        foreach (var row in stale)
        {
            row.SentAt = now;
            row.LastError = "expired";
        }

        var due = unsent
            .Except(stale)
            .Where(o => o.ScheduledFor <= now)
            .Take(BatchSize)
            .ToList();

        foreach (var row in due)
        {
            await DeliverAsync(row, now, cancellationToken);
        }

        var sent = await _dbContext.NotificationOutbox
            .Where(o => o.SentAt != null)
            .ToListAsync(cancellationToken);
        var toPrune = sent.Where(o => o.SentAt <= now - SentRowRetention).ToList();
        if (toPrune.Count > 0)
        {
            _dbContext.NotificationOutbox.RemoveRange(toPrune);
        }

        if (stale.Count > 0 || due.Count > 0 || toPrune.Count > 0)
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task DeliverAsync(NotificationOutboxEntity row, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var userStatus = await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.Id == row.UserId)
            .Select(u => (UserStatus?)u.Status)
            .FirstOrDefaultAsync(cancellationToken);

        // A locked/banned account never receives push, same as it's refused
        // every other mutating/notifying action; an unknown user (deleted
        // between enqueue and delivery) is the same case as no subscriptions.
        if (userStatus is null or not UserStatus.Active)
        {
            row.SentAt = now;
            row.LastError = userStatus is null ? "user not found" : "user not active";
            return;
        }

        // Opt-outs (NotificationOptOutEntity) are checked here once
        // notification_opt_outs has rows to check against — see
        // docs/plans/push-notifications.md phase 2.

        var subscriptions = await _dbContext.PushSubscriptions
            .Where(s => s.UserId == row.UserId)
            .ToListAsync(cancellationToken);

        row.Attempts++;
        var anyTransientFailure = false;

        foreach (var subscription in subscriptions)
        {
            var timeToLive = row.ExpiresAt - now;
            if (timeToLive <= TimeSpan.Zero)
            {
                break;
            }

            var result = await _pushSender.SendAsync(subscription, row.PayloadJson, timeToLive, cancellationToken);

            switch (result.Outcome)
            {
                case PushSendOutcome.Delivered:
                    subscription.LastDeliveredAt = now;
                    subscription.FailureCount = 0;
                    break;

                case PushSendOutcome.Gone:
                    _dbContext.PushSubscriptions.Remove(subscription);
                    break;

                case PushSendOutcome.TransientFailure:
                    anyTransientFailure = true;
                    subscription.FailureCount++;
                    if (subscription.FailureCount >= MaxSubscriptionFailures)
                    {
                        _dbContext.PushSubscriptions.Remove(subscription);
                    }

                    break;
            }
        }

        if (!anyTransientFailure || row.Attempts >= MaxDeliveryAttempts)
        {
            row.SentAt = now;
            if (anyTransientFailure)
            {
                row.LastError = "gave up after repeated transient failures";
            }
        }
    }
}
