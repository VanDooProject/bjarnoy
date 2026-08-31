using System.Net;
using System.Net.Http.Headers;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// POST /api/v1/activity/heartbeat: an authenticated caller gets 204 and an
/// activity row, riding entirely on <see cref="Bjarnoy.Api.Auth.UserActivityEndpointFilter"/>
/// (the handler itself does nothing); an anonymous caller is rejected outright.
/// </summary>
public sealed class ActivityEndpointsTests : IAsyncLifetime
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

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    private async Task<bool> HasActivityRowsAsync(Guid userId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var hasActivity = await db.UserActivities.AsNoTracking().AnyAsync(a => a.UserId == userId, Ct);
        var hasSession = await db.UserActivitySessions.AsNoTracking().AnyAsync(s => s.UserId == userId, Ct);
        return hasActivity || hasSession;
    }

    [Fact]
    public async Task An_authenticated_heartbeat_returns_no_content_and_records_activity()
    {
        using var client = Client();
        var registered = await RegisterAsync(client, Unique("heartbeat-"));
        Authorize(client, registered.AccessToken);

        var response = await client.PostAsync("/api/v1/activity/heartbeat", null, Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.True(await HasActivityRowsAsync(registered.User.Id));
    }

    [Fact]
    public async Task An_anonymous_heartbeat_is_unauthorized()
    {
        using var client = Client();

        var response = await client.PostAsync("/api/v1/activity/heartbeat", null, Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
