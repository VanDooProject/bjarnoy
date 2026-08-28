using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Register/login/refresh/logout through the real HTTP stack, a real EF model
/// and a real database — see issue #26's acceptance criteria.
/// </summary>
public sealed class AuthEndpointsTests : IAsyncLifetime
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

    private async Task<AuthResponse> RegisterAsync(
        HttpClient client, string? userName = null, string password = "correct-horse", string? existingOwnerId = null)
    {
        var response = await client.PostJsonAsync(
            "/api/v1/auth/register",
            new RegisterRequest(userName ?? Unique("user-"), password, existingOwnerId),
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.ReadStrictAsync<AuthResponse>(Ct);
    }

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    private async Task SetStatusAsync(Guid userId, UserStatus status)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var user = await db.Users.SingleAsync(u => u.Id == userId, Ct);
        user.Status = status;
        await db.SaveChangesAsync(Ct);
    }

    [Fact]
    public async Task Register_then_login_then_refresh_then_logout_is_a_working_happy_path()
    {
        using var client = Client();
        var userName = Unique("jarl-");

        var registered = await RegisterAsync(client, userName, "correct-horse-battery");
        Assert.Equal(userName, registered.User.UserName);
        Assert.Equal("player", registered.User.Role);
        Assert.Equal("active", registered.User.Status);
        Assert.False(string.IsNullOrWhiteSpace(registered.AccessToken));
        Assert.False(string.IsNullOrWhiteSpace(registered.RefreshToken));

        var loginResponse = await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);
        var loggedIn = await loginResponse.ReadStrictAsync<AuthResponse>(Ct);

        var refreshResponse = await client.PostJsonAsync(
            "/api/v1/auth/refresh", new RefreshRequest(loggedIn.RefreshToken), Ct);
        Assert.Equal(HttpStatusCode.OK, refreshResponse.StatusCode);
        var refreshed = await refreshResponse.ReadStrictAsync<AuthResponse>(Ct);
        Assert.NotEqual(loggedIn.RefreshToken, refreshed.RefreshToken);

        var logoutResponse = await client.PostJsonAsync(
            "/api/v1/auth/logout", new LogoutRequest(refreshed.RefreshToken), Ct);
        Assert.Equal(HttpStatusCode.NoContent, logoutResponse.StatusCode);

        // The just-revoked refresh token no longer works.
        var afterLogout = await client.PostJsonAsync(
            "/api/v1/auth/refresh", new RefreshRequest(refreshed.RefreshToken), Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, afterLogout.StatusCode);
    }

    [Fact]
    public async Task Registering_the_same_username_twice_is_refused()
    {
        using var client = Client();
        var userName = Unique("dupe-");
        await RegisterAsync(client, userName);

        var response = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "another-password"), Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Registering_the_same_username_with_different_casing_is_still_refused()
    {
        using var client = Client();
        var userName = Unique("case-");
        await RegisterAsync(client, userName);

        var response = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName.ToUpperInvariant(), "another-password"), Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Logging_in_with_the_wrong_password_is_401()
    {
        using var client = Client();
        var userName = Unique("wrongpw-");
        await RegisterAsync(client, userName, "correct-horse-battery");

        var response = await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, "not-the-password"), Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_banned_user_is_refused_login_with_a_machine_readable_reason()
    {
        using var client = Client();
        var userName = Unique("banned-");
        var registered = await RegisterAsync(client, userName, "correct-horse-battery");
        await SetStatusAsync(registered.User.Id, UserStatus.Banned);

        var response = await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, "correct-horse-battery"), Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.ReadStrictAsync<AuthErrorResponse>(Ct);
        Assert.Equal("user_banned", body.Error);
    }

    [Fact]
    public async Task A_refresh_token_stops_working_the_moment_its_user_is_banned()
    {
        using var client = Client();
        var registered = await RegisterAsync(client, Unique("laterban-"));

        // Ban happens after the refresh token was already issued — this is
        // exactly the "propagates within one refresh cycle" acceptance
        // criterion: the access token would still validate, but the refresh
        // endpoint re-checks live status.
        await SetStatusAsync(registered.User.Id, UserStatus.Banned);

        var response = await client.PostJsonAsync(
            "/api/v1/auth/refresh", new RefreshRequest(registered.RefreshToken), Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.ReadStrictAsync<AuthErrorResponse>(Ct);
        Assert.Equal("user_banned", body.Error);
    }

    [Fact]
    public async Task A_rotated_out_refresh_token_cannot_be_reused()
    {
        using var client = Client();
        var registered = await RegisterAsync(client, Unique("rotate-"));

        var firstRefresh = await client.PostJsonAsync(
            "/api/v1/auth/refresh", new RefreshRequest(registered.RefreshToken), Ct);
        Assert.Equal(HttpStatusCode.OK, firstRefresh.StatusCode);

        // Reusing the token /auth/register handed out, now that it has been
        // rotated away by the refresh above, must fail rather than silently
        // succeeding a second time.
        var reuse = await client.PostJsonAsync(
            "/api/v1/auth/refresh", new RefreshRequest(registered.RefreshToken), Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, reuse.StatusCode);
    }

    [Fact]
    public async Task Me_without_a_token_is_401()
    {
        using var client = Client();
        var response = await client.GetAsync("/api/v1/auth/me", Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_reflects_live_status_not_the_tokens_stale_claims()
    {
        using var client = Client();
        var registered = await RegisterAsync(client, Unique("livestate-"));
        Authorize(client, registered.AccessToken);

        var before = await client.GetFromJsonAsync<UserResponse>(
            "/api/v1/auth/me", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal("active", before!.Status);

        // The access token itself never changes, but /me still reflects the
        // status flip because it reads the database, not the token's claims.
        await SetStatusAsync(registered.User.Id, UserStatus.Locked);

        var after = await client.GetFromJsonAsync<UserResponse>(
            "/api/v1/auth/me", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal("locked", after!.Status);
    }

    [Fact]
    public async Task A_locked_user_is_refused_a_mutating_settlement_action_while_anonymous_still_succeeds()
    {
        using var client = Client();

        var world = await (await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), 21, 60), Ct))
            .ReadStrictAsync<WorldResponse>(Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var registered = await RegisterAsync(client, Unique("lockedbuilder-"));
        Authorize(client, registered.AccessToken);
        await SetStatusAsync(registered.User.Id, UserStatus.Locked);

        var foundedAsLocked = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Lockstad", "Lock", "lock-owner"),
            Ct);

        Assert.Equal(HttpStatusCode.Forbidden, foundedAsLocked.StatusCode);
        var body = await foundedAsLocked.ReadStrictAsync<AuthErrorResponse>(Ct);
        Assert.Equal("user_locked", body.Error);

        // The exact same request, without the Authorization header, must
        // still work — anonymous play is unaffected by this account existing.
        using var anonymousClient = Client();
        var foundedAnonymously = await anonymousClient.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Freestad", "Free", "free-owner"),
            Ct);

        Assert.Equal(HttpStatusCode.Created, foundedAnonymously.StatusCode);
    }

    [Fact]
    public async Task Registering_with_an_existing_local_owner_id_claims_its_unowned_settlements()
    {
        using var client = Client();

        var world = await (await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), 21, 60), Ct))
            .ReadStrictAsync<WorldResponse>(Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var ownerId = Unique("local-owner-");
        var founded = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Claimstad", "Someone", ownerId),
            Ct)).ReadStrictAsync<SettlementResponse>(Ct);

        var registered = await RegisterAsync(client, Unique("claimer-"), existingOwnerId: ownerId);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var settlement = await db.Settlements.AsNoTracking().SingleAsync(s => s.Id == founded.Id, Ct);

        Assert.Equal(registered.User.Id, settlement.UserId);
        // The legacy string column is untouched — claiming is additive.
        Assert.Equal(ownerId, settlement.OwnerId);
    }
}
