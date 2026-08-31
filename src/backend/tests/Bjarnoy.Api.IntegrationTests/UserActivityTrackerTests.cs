using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <see cref="UserActivityService"/> against a real database and the
/// factory's <see cref="TestTimeProvider"/> — the same clock the app itself
/// resolves <see cref="TimeProvider"/> to, so advancing it is how these tests
/// move "now" rather than waiting on the throttle interval in real time.
/// </summary>
public sealed class UserActivityTrackerTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private async Task<(Guid UserId, UserActivityOptions Options)> CreateUserAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var user = new UserEntity
        {
            UserName = $"activity-{Guid.CreateVersion7():N}",
            NormalizedUserName = $"activity-{Guid.CreateVersion7():N}".ToLowerInvariant(),
            PasswordHash = "unused",
            CreatedAt = _factory.Time.GetUtcNow(),
        };
        db.Users.Add(user);
        await db.SaveChangesAsync(Ct);

        var options = scope.ServiceProvider.GetRequiredService<IOptions<UserActivityOptions>>().Value;
        return (user.Id, options);
    }

    private async Task TrackAsync(Guid userId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var tracker = scope.ServiceProvider.GetRequiredService<IUserActivityTracker>();
        await tracker.TrackAsync(userId, Ct);
    }

    private async Task<UserActivityEntity?> GetActivityAsync(Guid userId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.UserActivities.AsNoTracking().SingleOrDefaultAsync(a => a.UserId == userId, Ct);
    }

    private async Task<List<UserActivitySessionEntity>> GetSessionsAsync(Guid userId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        // Ordered by Id, not StartedAtUtc — see UserActivityService's remark:
        // SQLite cannot translate ORDER BY on a DateTimeOffset column, and Id
        // (UUIDv7) sorts chronologically anyway.
        return await db.UserActivitySessions.AsNoTracking()
            .Where(s => s.UserId == userId)
            .OrderBy(s => s.Id)
            .ToListAsync(Ct);
    }

    [Fact]
    public async Task First_ping_creates_the_activity_row_and_a_session()
    {
        var (userId, _) = await CreateUserAsync();

        await TrackAsync(userId);

        var activity = await GetActivityAsync(userId);
        Assert.NotNull(activity);
        Assert.Equal(_factory.Time.GetUtcNow(), activity!.LastActiveAtUtc);

        var sessions = await GetSessionsAsync(userId);
        var session = Assert.Single(sessions);
        Assert.Equal(_factory.Time.GetUtcNow(), session.StartedAtUtc);
        Assert.Equal(_factory.Time.GetUtcNow(), session.LastSeenAtUtc);
    }

    [Fact]
    public async Task A_ping_within_the_gap_but_past_the_throttle_extends_the_session_in_place()
    {
        var (userId, options) = await CreateUserAsync();
        await TrackAsync(userId);

        // Past the throttle so the second ping actually reaches the
        // database, but well inside the gap threshold.
        _factory.Time.Advance(options.ThrottleInterval + TimeSpan.FromSeconds(1));
        await TrackAsync(userId);

        var sessions = await GetSessionsAsync(userId);
        var session = Assert.Single(sessions);
        Assert.Equal(_factory.Time.GetUtcNow(), session.LastSeenAtUtc);

        var activity = await GetActivityAsync(userId);
        Assert.Equal(_factory.Time.GetUtcNow(), activity!.LastActiveAtUtc);
    }

    [Fact]
    public async Task A_ping_after_the_gap_threshold_opens_a_new_session()
    {
        var (userId, options) = await CreateUserAsync();
        await TrackAsync(userId);
        var firstSeenAt = _factory.Time.GetUtcNow();

        _factory.Time.Advance(options.GapThreshold + TimeSpan.FromSeconds(1));
        await TrackAsync(userId);

        var sessions = await GetSessionsAsync(userId);
        Assert.Equal(2, sessions.Count);
        Assert.Equal(firstSeenAt, sessions[0].StartedAtUtc);
        Assert.Equal(firstSeenAt, sessions[0].LastSeenAtUtc);
        Assert.Equal(_factory.Time.GetUtcNow(), sessions[1].StartedAtUtc);
        Assert.Equal(_factory.Time.GetUtcNow(), sessions[1].LastSeenAtUtc);
    }

    [Fact]
    public async Task An_immediate_second_ping_is_suppressed_by_the_write_throttle()
    {
        var (userId, _) = await CreateUserAsync();
        await TrackAsync(userId);
        var firstWriteAt = _factory.Time.GetUtcNow();

        // Well inside the throttle interval (but still inside the gap
        // threshold too, so if the throttle failed to suppress this we would
        // see the session's LastSeenAtUtc move instead).
        _factory.Time.Advance(TimeSpan.FromSeconds(1));
        await TrackAsync(userId);

        var activity = await GetActivityAsync(userId);
        Assert.Equal(firstWriteAt, activity!.LastActiveAtUtc);

        var sessions = await GetSessionsAsync(userId);
        var session = Assert.Single(sessions);
        Assert.Equal(firstWriteAt, session.LastSeenAtUtc);
    }

    [Fact]
    public async Task A_ping_after_the_throttle_interval_elapses_writes_again()
    {
        var (userId, options) = await CreateUserAsync();
        await TrackAsync(userId);

        _factory.Time.Advance(options.ThrottleInterval + TimeSpan.FromSeconds(1));
        await TrackAsync(userId);

        var activity = await GetActivityAsync(userId);
        Assert.Equal(_factory.Time.GetUtcNow(), activity!.LastActiveAtUtc);
    }
}
