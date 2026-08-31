using System.Net;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// POST /api/v1/auth/refresh is not JWT-authenticated, so
/// UserActivityEndpointFilter never sees it — AuthService.RefreshAsync tracks
/// activity directly instead. See AuthService's remark on RefreshAsync.
/// </summary>
public sealed class AuthRefreshActivityTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private HttpClient Client() => _factory.CreateClient();

    private static string Unique(string prefix) => $"{prefix}{Guid.CreateVersion7():N}"[..16];

    private async Task<AuthResponse> RegisterAsync(HttpClient client, string? userName = null)
    {
        var response = await client.PostJsonAsync(
            "/api/v1/auth/register",
            new RegisterRequest(userName ?? Unique("user-"), "correct-horse-battery", null),
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.ReadStrictAsync<AuthResponse>(Ct);
    }

    [Fact]
    public async Task A_successful_refresh_updates_last_active_and_extends_or_creates_a_session()
    {
        using var client = Client();
        var registered = await RegisterAsync(client, Unique("refresher-"));

        var response = await client.PostJsonAsync(
            "/api/v1/auth/refresh", new RefreshRequest(registered.RefreshToken), Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();

        var activity = await db.UserActivities.AsNoTracking()
            .SingleOrDefaultAsync(a => a.UserId == registered.User.Id, Ct);
        Assert.NotNull(activity);
        Assert.Equal(_factory.Time.GetUtcNow(), activity!.LastActiveAtUtc);

        var session = await db.UserActivitySessions.AsNoTracking()
            .SingleOrDefaultAsync(s => s.UserId == registered.User.Id, Ct);
        Assert.NotNull(session);
        Assert.Equal(_factory.Time.GetUtcNow(), session!.LastSeenAtUtc);
    }

    [Fact]
    public async Task A_failed_refresh_creates_no_activity_rows()
    {
        using var client = Client();
        var registered = await RegisterAsync(client, Unique("badtoken-"));

        var response = await client.PostJsonAsync(
            "/api/v1/auth/refresh", new RefreshRequest("not-a-real-refresh-token"), Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        Assert.False(await db.UserActivities.AsNoTracking().AnyAsync(a => a.UserId == registered.User.Id, Ct));
        Assert.False(await db.UserActivitySessions.AsNoTracking().AnyAsync(s => s.UserId == registered.User.Id, Ct));
    }
}
