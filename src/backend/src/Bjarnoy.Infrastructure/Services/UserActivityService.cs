using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Tuning for <see cref="UserActivityService"/>, bound from the
/// <c>UserActivity</c> config section — see <see cref="Auth.JwtOptions"/> for
/// the same convention.
/// </summary>
public sealed class UserActivityOptions
{
    public const string SectionName = "UserActivity";

    /// <summary>
    /// How long a gap in pings is still considered "the same session". A ping
    /// arriving sooner than this after the user's last one extends their
    /// current <see cref="UserActivitySessionEntity"/> in place; a later one
    /// opens a new session row.
    /// </summary>
    public TimeSpan GapThreshold { get; set; } = TimeSpan.FromMinutes(30);

    /// <summary>
    /// The write-throttle: at most one database write per user per this
    /// interval. Every <see cref="IUserActivityTracker.TrackAsync"/> call in
    /// between is a cheap no-op — see <see cref="UserActivityService"/>'s
    /// remarks for why this is a real throttle rather than a test-only shortcut.
    /// </summary>
    public TimeSpan ThrottleInterval { get; set; } = TimeSpan.FromSeconds(60);

    /// <summary>
    /// How long a <see cref="UserActivitySessionEntity"/> is kept before a
    /// retention job may delete it. Unused until that later PR lands; defined
    /// here now so the config shape (and any deployed <c>UserActivity</c>
    /// section) does not need to change out from under it.
    /// </summary>
    public int RetentionDays { get; set; } = 180;
}

/// <summary>
/// Records that a user did something, right now. One call site is the
/// authenticated-request endpoint filter (<c>UserActivityEndpointFilter</c>);
/// another is the refresh-token exchange, which resolves a user id from a
/// DB-backed token rather than a validated JWT and so is not covered by that
/// filter.
/// </summary>
public interface IUserActivityTracker
{
    Task TrackAsync(Guid userId, CancellationToken cancellationToken = default);
}

/// <summary>
/// Upserts <see cref="UserActivityEntity.LastActiveAtUtc"/> and extends or
/// opens a <see cref="UserActivitySessionEntity"/>, throttled so a chatty
/// client cannot turn "track activity" into "write to the database on every
/// request".
/// </summary>
/// <remarks>
/// The throttle keys off the same <see cref="TimeProvider"/> the rest of the
/// app uses (see <c>AuthService</c>), and the interval is real production
/// configuration (<see cref="UserActivityOptions.ThrottleInterval"/>), not a
/// branch on whether this is a test run — per this repo's CLAUDE.md, the
/// exact same code path throttles in tests and in production; a test that
/// wants to see a second write simply advances the injected clock past the
/// interval, the same way <c>TestTimeProvider</c> is used everywhere else in
/// this suite.
/// </remarks>
public sealed class UserActivityService(
    GameDbContext dbContext,
    TimeProvider timeProvider,
    IMemoryCache cache,
    IOptions<UserActivityOptions> options) : IUserActivityTracker
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly IMemoryCache _cache = cache;
    private readonly UserActivityOptions _options = options.Value;

    private static string ThrottleCacheKey(Guid userId) => $"user-activity-throttle:{userId}";

    public async Task TrackAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow();

        // Write-throttle: if the last persisted write for this user was
        // inside the interval, skip the database entirely. The cache entry
        // itself expires at the same instant the throttle window ends, so a
        // stale entry can never suppress a write it shouldn't.
        var cacheKey = ThrottleCacheKey(userId);
        if (_cache.TryGetValue<DateTimeOffset>(cacheKey, out var lastWrite)
            && now - lastWrite < _options.ThrottleInterval)
        {
            return;
        }

        var activity = await _dbContext.UserActivities.FirstOrDefaultAsync(a => a.UserId == userId, cancellationToken);
        if (activity is null)
        {
            activity = new UserActivityEntity { UserId = userId, LastActiveAtUtc = now };
            _dbContext.UserActivities.Add(activity);
        }
        else
        {
            activity.LastActiveAtUtc = now;
        }

        // Ordered by Id, not LastSeenAtUtc: SQLite's provider cannot translate
        // ORDER BY on a DateTimeOffset column, and Id (a UUIDv7 — see
        // GameDbContext's remarks on ValueGeneratedNever) sorts chronologically
        // anyway, which for this table is equivalent to "most recently
        // extended" — sessions are created strictly in order and only ever
        // the newest one is ever extended in place. Same "ORDER BY id means
        // creation order" idiom as WorldService/LeaderboardService/ProfileService.
        var session = await _dbContext.UserActivitySessions
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (session is not null && now - session.LastSeenAtUtc < _options.GapThreshold)
        {
            session.LastSeenAtUtc = now;
        }
        else
        {
            _dbContext.UserActivitySessions.Add(new UserActivitySessionEntity
            {
                UserId = userId,
                StartedAtUtc = now,
                LastSeenAtUtc = now,
            });
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        // Recorded after the write succeeds, so a failed SaveChangesAsync
        // does not itself suppress the retry a caller might make.
        _cache.Set(cacheKey, now, _options.ThrottleInterval);
    }
}
