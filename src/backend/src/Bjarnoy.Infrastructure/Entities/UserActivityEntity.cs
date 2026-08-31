namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// One row per user: the single "when did this user last do anything"
/// timestamp, upserted in place by <c>UserActivityService.TrackAsync</c> on
/// every tracked ping. Deliberately separate from
/// <see cref="UserActivitySessionEntity"/>, which is an append-mostly log of
/// distinct play sessions — this is the cheap, always-current summary a later
/// admin "who's online" view can read without scanning sessions.
/// </summary>
public class UserActivityEntity
{
    /// <summary>Also the primary key — one row per user, not per ping.</summary>
    public Guid UserId { get; set; }

    public UserEntity? User { get; set; }

    public DateTimeOffset LastActiveAtUtc { get; set; }
}

/// <summary>
/// A contiguous span of activity for one user: a new row starts whenever a
/// ping arrives more than <c>UserActivityOptions.GapThreshold</c> after the
/// user's last one, and every ping inside that gap just extends
/// <see cref="LastSeenAtUtc"/> on the most recent row in place. This is what
/// lets a later retention/reporting PR answer "how long was this session" and
/// "how many distinct sessions this week" — <see cref="UserActivityEntity"/>
/// alone only ever knows the single most recent instant.
/// </summary>
public class UserActivitySessionEntity
{
    /// <summary>UUIDv7, matching the primary-key convention used elsewhere in this model.</summary>
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    public UserEntity? User { get; set; }

    public DateTimeOffset StartedAtUtc { get; set; }

    public DateTimeOffset LastSeenAtUtc { get; set; }
}
