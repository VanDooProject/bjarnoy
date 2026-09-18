using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services.Notifications;

public enum SubscriptionDeleteOutcome
{
    Deleted,
    NotFound,
}

/// <summary>
/// Owns <see cref="PushSubscriptionEntity"/> rows: subscribing/updating a
/// device, listing an account's devices, and revoking one. See
/// <c>docs/plans/push-notifications.md</c>.
/// </summary>
public sealed class NotificationSubscriptionService(GameDbContext dbContext, TimeProvider timeProvider)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;

    public async Task<List<PushSubscriptionEntity>> ListForUserAsync(
        Guid userId, CancellationToken cancellationToken = default)
    {
        // Ordered client-side: SQLite's EF provider doesn't support
        // DateTimeOffset in ORDER BY — same workaround as TradeService's
        // ListMineAsync/ListReportsAsync/ListShipmentsAsync.
        var subscriptions = await _dbContext.PushSubscriptions.AsNoTracking()
            .Where(s => s.UserId == userId)
            .ToListAsync(cancellationToken);
        return [.. subscriptions.OrderBy(s => s.CreatedAt)];
    }

    /// <summary>
    /// Upserts by <see cref="PushSubscriptionEntity.Endpoint"/>: a browser
    /// install has exactly one subscription per origin. If the endpoint
    /// already belongs to a different user (a shared device, or logging in
    /// as someone else on the same browser), the row is re-parented to
    /// <paramref name="userId"/> — whoever is currently signed in on a
    /// device owns its subscription.
    /// </summary>
    public async Task<(bool Created, PushSubscriptionEntity Subscription)> UpsertAsync(
        Guid userId,
        string endpoint,
        string p256dh,
        string auth,
        string deviceLabel,
        string? userAgent,
        CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow();
        var existing = await _dbContext.PushSubscriptions
            .FirstOrDefaultAsync(s => s.Endpoint == endpoint, cancellationToken);

        if (existing is null)
        {
            var subscription = new PushSubscriptionEntity
            {
                UserId = userId,
                Endpoint = endpoint,
                P256dh = p256dh,
                Auth = auth,
                DeviceLabel = deviceLabel,
                UserAgent = userAgent,
                CreatedAt = now,
                LastSeenAt = now,
            };
            _dbContext.PushSubscriptions.Add(subscription);
            await _dbContext.SaveChangesAsync(cancellationToken);
            return (true, subscription);
        }

        existing.UserId = userId;
        existing.P256dh = p256dh;
        existing.Auth = auth;
        existing.DeviceLabel = deviceLabel;
        existing.UserAgent = userAgent;
        existing.LastSeenAt = now;
        existing.FailureCount = 0;
        await _dbContext.SaveChangesAsync(cancellationToken);
        return (false, existing);
    }

    public async Task<SubscriptionDeleteOutcome> DeleteAsync(
        Guid userId, Guid subscriptionId, CancellationToken cancellationToken = default)
    {
        var deleted = await _dbContext.PushSubscriptions
            .Where(s => s.Id == subscriptionId && s.UserId == userId)
            .ExecuteDeleteAsync(cancellationToken);

        return deleted > 0 ? SubscriptionDeleteOutcome.Deleted : SubscriptionDeleteOutcome.NotFound;
    }
}
