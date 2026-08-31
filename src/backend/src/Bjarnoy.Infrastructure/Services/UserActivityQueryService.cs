using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>The bucket granularity for <see cref="UserActivityQueryService.GetSummaryAsync"/>.</summary>
public enum ActivityBucketSize
{
    Day,
    Hour,
}

public enum ActivitySummaryOutcome
{
    Success,

    /// <summary>The requested range exceeds the max allowed for the chosen bucket size.</summary>
    RangeTooLarge,
}

public sealed record ActivityBucket(DateTimeOffset BucketStart, int ActiveUserCount);

public sealed record ActivitySummary(IReadOnlyList<ActivityBucket> Buckets);

public sealed record ActivityUserRow(Guid UserId, string UserName, string? DisplayName, DateTimeOffset? LastActiveAtUtc);

public sealed record ActivityUsersPage(IReadOnlyList<ActivityUserRow> Users, int TotalCount);

public sealed record ActivitySessionWindow(DateTimeOffset StartedAtUtc, DateTimeOffset LastSeenAtUtc);

public sealed record UserActivityDetail(
    IReadOnlyList<ActivitySessionWindow> Sessions, int SessionCount, TimeSpan TotalActiveDuration);

/// <summary>
/// Read side of the admin activity surface (this PR): a bucketed "how many
/// distinct users were active" summary, a paged users-by-last-active list, and
/// one user's session windows/totals in a range. Writing activity is
/// <see cref="UserActivityService"/>'s job; this only reads what that already
/// records.
/// </summary>
/// <remarks>
/// Every query here avoids a relational comparison (<c>&lt;</c>, <c>&gt;=</c>,
/// <c>ORDER BY</c>, ...) on a <see cref="DateTimeOffset"/> column in SQL: EF
/// Core's SQLite provider cannot translate those (only equality does) — a
/// stricter version of the same "can't <c>ORDER BY</c> a
/// <see cref="DateTimeOffset"/>" limitation <see cref="UserActivityService"/>'s
/// remarks describe and that <c>WorldService.TriggerDueEndbossesAsync</c>
/// already works around the same way: pull the rows a translatable predicate
/// (an equality, or none at all) can select, then do the actual time
/// comparison in memory. One code path, identical on SQLite and PostgreSQL.
/// </remarks>
public sealed class UserActivityQueryService(GameDbContext dbContext)
{
    /// <summary>Max range for a <c>bucket=day</c> summary request.</summary>
    public static readonly TimeSpan MaxDayRange = TimeSpan.FromDays(92);

    /// <summary>Max range for a <c>bucket=hour</c> summary request.</summary>
    public static readonly TimeSpan MaxHourRange = TimeSpan.FromDays(7);

    private readonly GameDbContext _dbContext = dbContext;

    public static TimeSpan MaxRangeFor(ActivityBucketSize bucket) =>
        bucket == ActivityBucketSize.Day ? MaxDayRange : MaxHourRange;

    /// <summary>
    /// Distinct-active-user counts per bucket over <c>[from, to]</c>: a user is
    /// "active" in a bucket if any of their session windows overlaps it.
    /// </summary>
    public async Task<(ActivitySummaryOutcome Outcome, ActivitySummary? Summary)> GetSummaryAsync(
        DateTimeOffset from, DateTimeOffset to, ActivityBucketSize bucket, CancellationToken cancellationToken = default)
    {
        if (to - from > MaxRangeFor(bucket))
        {
            return (ActivitySummaryOutcome.RangeTooLarge, null);
        }

        // No SQL-side date filter — see this class's remarks. The overlap
        // check (a session's window intersects [from, to]) happens below,
        // once the rows are in memory.
        var allSessions = await _dbContext.UserActivitySessions
            .AsNoTracking()
            .Select(s => new { s.UserId, s.StartedAtUtc, s.LastSeenAtUtc })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var sessions = allSessions.Where(s => s.StartedAtUtc <= to && s.LastSeenAtUtc >= from).ToList();

        var step = bucket == ActivityBucketSize.Day ? TimeSpan.FromDays(1) : TimeSpan.FromHours(1);
        var bucketStart = TruncateToBucket(from, bucket);
        var lastBucketStart = TruncateToBucket(to, bucket);

        var buckets = new List<ActivityBucket>();
        while (bucketStart <= lastBucketStart)
        {
            var bucketEnd = bucketStart + step;
            var activeUsers = new HashSet<Guid>();
            foreach (var session in sessions)
            {
                if (session.StartedAtUtc < bucketEnd && session.LastSeenAtUtc >= bucketStart)
                {
                    activeUsers.Add(session.UserId);
                }
            }

            buckets.Add(new ActivityBucket(bucketStart, activeUsers.Count));
            bucketStart = bucketEnd;
        }

        return (ActivitySummaryOutcome.Success, new ActivitySummary(buckets));
    }

    private static DateTimeOffset TruncateToBucket(DateTimeOffset value, ActivityBucketSize bucket)
    {
        var utc = value.UtcDateTime;
        var truncated = bucket == ActivityBucketSize.Day
            ? new DateTime(utc.Year, utc.Month, utc.Day, 0, 0, 0, DateTimeKind.Utc)
            : new DateTime(utc.Year, utc.Month, utc.Day, utc.Hour, 0, 0, DateTimeKind.Utc);
        return new DateTimeOffset(truncated);
    }

    /// <summary>
    /// Every non-system user, left-joined with their <see cref="UserActivityEntity"/>
    /// (so a never-active user still appears, with a null last-active), sorted
    /// newest-active-first and paged.
    /// </summary>
    /// <remarks>
    /// One query, not a per-user round trip: the join executes in SQL; only
    /// the sort (on a nullable <see cref="DateTimeOffset"/>) and the paging
    /// happen after materializing, for the same reason as this class's other
    /// queries.
    /// </remarks>
    public async Task<ActivityUsersPage> GetUsersAsync(
        int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var totalCount = await _dbContext.Users
            .CountAsync(u => !u.IsSystem, cancellationToken)
            .ConfigureAwait(false);

        var rows = await (
            from u in _dbContext.Users.AsNoTracking()
            where !u.IsSystem
            join a in _dbContext.UserActivities.AsNoTracking() on u.Id equals a.UserId into activityJoin
            from activity in activityJoin.DefaultIfEmpty()
            select new ActivityUserRow(u.Id, u.UserName, u.DisplayName, activity == null ? null : activity.LastActiveAtUtc))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var page1 = rows
            .OrderByDescending(r => r.LastActiveAtUtc ?? DateTimeOffset.MinValue)
            .ThenBy(r => r.UserId)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return new ActivityUsersPage(page1, totalCount);
    }

    /// <summary>
    /// One user's session windows overlapping <c>[from, to]</c>, oldest first,
    /// plus the session count and total active duration (each window clipped
    /// to the requested range). Returns null if the user does not exist.
    /// </summary>
    public async Task<UserActivityDetail?> GetUserDetailAsync(
        Guid userId, DateTimeOffset from, DateTimeOffset to, CancellationToken cancellationToken = default)
    {
        var userExists = await _dbContext.Users
            .AnyAsync(u => u.Id == userId && !u.IsSystem, cancellationToken)
            .ConfigureAwait(false);

        if (!userExists)
        {
            return null;
        }

        // UserId is an equality filter (translatable); the date-range overlap
        // check happens in memory once these are loaded — see this class's
        // remarks.
        var userSessions = await _dbContext.UserActivitySessions
            .AsNoTracking()
            .Where(s => s.UserId == userId)
            .Select(s => new { s.StartedAtUtc, s.LastSeenAtUtc })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var ordered = userSessions
            .Where(s => s.StartedAtUtc <= to && s.LastSeenAtUtc >= from)
            .OrderBy(s => s.StartedAtUtc)
            .ToList();

        var windows = ordered
            .Select(s => new ActivitySessionWindow(s.StartedAtUtc, s.LastSeenAtUtc))
            .ToList();

        var totalActiveDuration = ordered.Aggregate(TimeSpan.Zero, (sum, s) =>
        {
            var clippedStart = s.StartedAtUtc < from ? from : s.StartedAtUtc;
            var clippedEnd = s.LastSeenAtUtc > to ? to : s.LastSeenAtUtc;
            var duration = clippedEnd - clippedStart;
            return sum + (duration > TimeSpan.Zero ? duration : TimeSpan.Zero);
        });

        return new UserActivityDetail(windows, windows.Count, totalActiveDuration);
    }
}
