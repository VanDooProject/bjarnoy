using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <see cref="UserActivityRetentionService.PruneOldSessionsAsync"/> against a
/// real database and the factory's <see cref="TestTimeProvider"/>: old
/// sessions go, recent ones stay, and <see cref="UserActivityEntity.LastActiveAtUtc"/>
/// is never touched by it. Exercised directly rather than through
/// <c>UserActivityRetentionHostedService</c>'s timer — see that class's
/// remarks — so this needs no real wall-clock wait.
/// </summary>
public sealed class UserActivityRetentionServiceTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private async Task<Guid> CreateUserAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var user = new UserEntity
        {
            UserName = $"retention-{Guid.CreateVersion7():N}",
            NormalizedUserName = $"retention-{Guid.CreateVersion7():N}".ToLowerInvariant(),
            PasswordHash = "unused",
            CreatedAt = _factory.Time.GetUtcNow(),
        };
        db.Users.Add(user);
        await db.SaveChangesAsync(Ct);
        return user.Id;
    }

    private async Task<Guid> SeedSessionAsync(Guid userId, DateTimeOffset startedAt, DateTimeOffset lastSeenAt)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var session = new UserActivitySessionEntity
        {
            UserId = userId,
            StartedAtUtc = startedAt,
            LastSeenAtUtc = lastSeenAt,
        };
        db.UserActivitySessions.Add(session);
        await db.SaveChangesAsync(Ct);
        return session.Id;
    }

    private async Task SeedLastActiveAsync(Guid userId, DateTimeOffset lastActiveAt)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        db.UserActivities.Add(new UserActivityEntity { UserId = userId, LastActiveAtUtc = lastActiveAt });
        await db.SaveChangesAsync(Ct);
    }

    private async Task<List<Guid>> GetRemainingSessionIdsAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.UserActivitySessions.AsNoTracking().Select(s => s.Id).ToListAsync(Ct);
    }

    private async Task<int> PruneAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var retention = scope.ServiceProvider.GetRequiredService<UserActivityRetentionService>();
        return await retention.PruneOldSessionsAsync(Ct);
    }

    [Fact]
    public async Task Sessions_older_than_the_retention_window_are_deleted_and_recent_ones_kept()
    {
        var userId = await CreateUserAsync();

        var options = _factory.Services.GetRequiredService<IOptions<UserActivityOptions>>().Value;
        var now = _factory.Time.GetUtcNow();
        var retentionWindow = TimeSpan.FromDays(options.RetentionDays);

        // Well past the retention window — must be pruned.
        var staleId = await SeedSessionAsync(
            userId, now - retentionWindow - TimeSpan.FromDays(10), now - retentionWindow - TimeSpan.FromDays(9));

        // Just inside the window — must be kept.
        var freshId = await SeedSessionAsync(
            userId, now - retentionWindow + TimeSpan.FromDays(1), now - retentionWindow + TimeSpan.FromDays(2));

        // Untouched by any age — must be kept.
        var currentId = await SeedSessionAsync(userId, now, now);

        await SeedLastActiveAsync(userId, now);

        var deletedCount = await PruneAsync();
        Assert.Equal(1, deletedCount);

        var remaining = await GetRemainingSessionIdsAsync();
        Assert.DoesNotContain(staleId, remaining);
        Assert.Contains(freshId, remaining);
        Assert.Contains(currentId, remaining);

        // The last-active summary row is never touched by session pruning.
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var activity = await db.UserActivities.AsNoTracking().SingleAsync(a => a.UserId == userId, Ct);
        Assert.Equal(now, activity.LastActiveAtUtc);
    }

    [Fact]
    public async Task Pruning_with_nothing_stale_deletes_nothing()
    {
        var userId = await CreateUserAsync();
        var now = _factory.Time.GetUtcNow();
        await SeedSessionAsync(userId, now, now);

        var deletedCount = await PruneAsync();

        Assert.Equal(0, deletedCount);
        Assert.Single(await GetRemainingSessionIdsAsync());
    }
}
