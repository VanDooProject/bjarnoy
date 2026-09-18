using System.Text.Json;
using Bjarnoy.Domain.Notifications;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services.Notifications;

/// <summary>
/// Queues one <see cref="NotificationOutboxEntity"/> row. Deliberately does
/// <em>not</em> call <c>SaveChangesAsync</c> itself — it adds to the
/// caller's own <see cref="GameDbContext"/> unit of work, so the row is
/// persisted by the same <c>SaveChangesAsync</c> as the domain write that
/// triggered it (e.g. <c>ChatService.SendAsync</c>'s message insert). An
/// event is enqueued if, and only if, the thing it describes actually
/// happened. Rendering the payload text (localised, per
/// <see cref="NotificationTextRenderer"/>) and computing the dedupe key are
/// the caller's job — this class only owns the outbox row shape.
/// </summary>
public sealed class NotificationEnqueuer(GameDbContext dbContext, TimeProvider timeProvider, PushFeatureState pushFeatureState)
{
    private static readonly JsonSerializerOptions PayloadJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly PushFeatureState _pushFeatureState = pushFeatureState;

    /// <summary>
    /// A no-op if <paramref name="dedupeKey"/> is already queued (or already
    /// sent) — e.g. a read racing the due-completion scanner for the same
    /// build order. The database's own unique index on
    /// <c>DedupeKey</c> is the actual guarantee against a race between two
    /// concurrent callers; this check only avoids the common, non-racing
    /// case of enqueuing the same event twice in one request.
    /// </summary>
    public async Task EnqueueAsync(
        Guid userId,
        NotificationType type,
        NotificationPayload payload,
        string dedupeKey,
        TimeSpan timeToLive,
        CancellationToken cancellationToken = default)
    {
        if (!_pushFeatureState.Enabled)
        {
            return;
        }

        var alreadyQueued = await _dbContext.NotificationOutbox
            .AnyAsync(o => o.DedupeKey == dedupeKey, cancellationToken);
        if (alreadyQueued)
        {
            return;
        }

        var now = _timeProvider.GetUtcNow();
        _dbContext.NotificationOutbox.Add(new NotificationOutboxEntity
        {
            UserId = userId,
            Type = type,
            DedupeKey = dedupeKey,
            PayloadJson = JsonSerializer.Serialize(payload, PayloadJsonOptions),
            ScheduledFor = now,
            ExpiresAt = now + timeToLive,
        });
    }
}
