using System.Net;
using System.Net.Http.Headers;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <see cref="Bjarnoy.Api.Auth.UserActivityEndpointFilter"/> wired into the
/// real endpoint pipeline: an authenticated request to an endpoint that
/// carries it must produce activity rows; an anonymous request must not.
/// </summary>
public sealed class UserActivityEndpointFilterTests : IAsyncLifetime
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
    public async Task An_authenticated_request_to_a_filtered_endpoint_records_activity()
    {
        using var client = Client();
        var registered = await RegisterAsync(client, Unique("tracked-"));
        Authorize(client, registered.AccessToken);

        // ProfileEndpoints.UpdateOwnBio carries both ActiveUserEndpointFilter
        // and UserActivityEndpointFilter.
        var response = await client.PutJsonAsync(
            "/api/v1/profiles/me/bio", new UpdateBioRequest("Hello, world."), Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        Assert.True(await HasActivityRowsAsync(registered.User.Id));
    }

    [Fact]
    public async Task An_anonymous_request_records_no_activity()
    {
        using var client = Client();

        // /api/v1/worlds POST requires no authentication at all — anonymous
        // world creation must keep working exactly as before.
        var response = await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), 21, 60), Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        Assert.False(await db.UserActivities.AsNoTracking().AnyAsync(Ct));
        Assert.False(await db.UserActivitySessions.AsNoTracking().AnyAsync(Ct));
    }
}
