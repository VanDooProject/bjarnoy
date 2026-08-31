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
/// The admin user-management surface (issue #29): the 401/403 matrix, list/
/// search/filter, the edit PATCH (with its last-admin guard), the status POST
/// (with its self-action guard), and that the status change is actually
/// enforced elsewhere (login, and <see cref="Bjarnoy.Api.Auth.ActiveUserEndpointFilter"/>).
/// </summary>
public sealed class AdminUserEndpointsTests(SqliteApiFixture fixture) : IClassFixture<SqliteApiFixture>
{
    private readonly SqliteApiFixture _fixture = fixture;

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string UniqueName(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

    /// <summary>Registers a fresh player, promotes it to Admin in the DB, then logs in to mint a token carrying the role.</summary>
    private async Task<(string AccessToken, Guid UserId)> CreateAdminAsync(HttpClient client)
    {
        var userName = UniqueName("admin");
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == auth.User.Id, Ct);
            user.Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var loggedIn = await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, loggedIn.StatusCode);
        var loggedInAuth = await loggedIn.ReadStrictAsync<AuthResponse>(Ct);
        return (loggedInAuth.AccessToken, auth.User.Id);
    }

    private async Task<(string UserName, string AccessToken, Guid UserId)> CreatePlayerAsync(HttpClient client)
    {
        var userName = UniqueName("player");
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);
        return (userName, auth.AccessToken, auth.User.Id);
    }

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    /// <summary>
    /// The shared fixture accumulates an Admin account from every test in this
    /// class that calls <see cref="CreateAdminAsync"/>, so "the last admin"
    /// cannot be assumed just because this test only made one. This demotes
    /// every admin except <paramref name="keep"/> down to Player first, so the
    /// guard under test is exercised against a DB that genuinely has exactly
    /// one admin left, regardless of what earlier tests in the class left behind.
    /// </summary>
    private async Task IsolateAsOnlyAdminAsync(Guid keep)
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var otherAdmins = await db.Users
            .Where(u => u.Role == UserRole.Admin && u.Id != keep)
            .ToListAsync(Ct);
        foreach (var admin in otherAdmins)
        {
            admin.Role = UserRole.Player;
        }
        await db.SaveChangesAsync(Ct);
    }

    [Fact]
    public async Task Anonymous_and_player_callers_are_refused_the_admin_users_surface()
    {
        using var anonymous = _fixture.CreateClient();
        var anonymousResponse = await anonymous.GetAsync("/api/v1/admin/users", Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousResponse.StatusCode);

        using var player = _fixture.CreateClient();
        var (_, playerToken, _) = await CreatePlayerAsync(player);
        Authorize(player, playerToken);

        var playerResponse = await player.GetAsync("/api/v1/admin/users", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, playerResponse.StatusCode);
    }

    [Fact]
    public async Task Admin_can_list_search_and_filter_users()
    {
        using var client = _fixture.CreateClient();
        var (userName, _, userId) = await CreatePlayerAsync(client);
        var (adminToken, _) = await CreateAdminAsync(client);
        Authorize(client, adminToken);

        var searchResponse = await client.GetAsync($"/api/v1/admin/users?search={userName}", Ct);
        Assert.Equal(HttpStatusCode.OK, searchResponse.StatusCode);
        var searched = await searchResponse.ReadStrictAsync<PagedAdminUsersResponse>(Ct);
        Assert.Single(searched.Items, u => u.Id == userId);

        var statusResponse = await client.GetAsync("/api/v1/admin/users?status=active", Ct);
        Assert.Equal(HttpStatusCode.OK, statusResponse.StatusCode);
        var byStatus = await statusResponse.ReadStrictAsync<PagedAdminUsersResponse>(Ct);
        Assert.Contains(byStatus.Items, u => u.Id == userId);
        Assert.All(byStatus.Items, u => Assert.Equal("active", u.Status));
    }

    [Fact]
    public async Task Admin_can_edit_display_name_and_role_leaving_an_omitted_field_unchanged()
    {
        using var client = _fixture.CreateClient();
        var (_, _, userId) = await CreatePlayerAsync(client);
        var (adminToken, _) = await CreateAdminAsync(client);
        Authorize(client, adminToken);

        var response = await client.PatchJsonAsync(
            $"/api/v1/admin/users/{userId}", new UpdateAdminUserRequest("Ragnar"), Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.ReadStrictAsync<AdminUserResponse>(Ct);
        Assert.Equal("Ragnar", updated.DisplayName);
        Assert.Equal("player", updated.Role);

        // Omitting Role must leave it unchanged; a second PATCH sets it alone.
        var roleOnly = await client.PatchJsonAsync(
            $"/api/v1/admin/users/{userId}", new UpdateAdminUserRequest(Role: "admin"), Ct);
        Assert.Equal(HttpStatusCode.OK, roleOnly.StatusCode);
        var afterRole = await roleOnly.ReadStrictAsync<AdminUserResponse>(Ct);
        Assert.Equal("Ragnar", afterRole.DisplayName);
        Assert.Equal("admin", afterRole.Role);
    }

    [Fact]
    public async Task Demoting_the_last_remaining_admin_is_rejected()
    {
        using var client = _fixture.CreateClient();
        var (adminToken, adminId) = await CreateAdminAsync(client);
        await IsolateAsOnlyAdminAsync(adminId);
        Authorize(client, adminToken);

        var response = await client.PatchJsonAsync(
            $"/api/v1/admin/users/{adminId}", new UpdateAdminUserRequest(Role: "player"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_admin_cannot_lock_or_ban_their_own_account()
    {
        using var client = _fixture.CreateClient();
        var (adminToken, adminId) = await CreateAdminAsync(client);
        Authorize(client, adminToken);

        var lockResponse = await client.PostJsonAsync(
            $"/api/v1/admin/users/{adminId}/status", new SetUserStatusRequest("locked"), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, lockResponse.StatusCode);

        var banResponse = await client.PostJsonAsync(
            $"/api/v1/admin/users/{adminId}/status", new SetUserStatusRequest("banned"), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, banResponse.StatusCode);
    }

    [Fact]
    public async Task A_locked_user_can_still_log_in_but_a_mutating_game_action_is_refused()
    {
        using var client = _fixture.CreateClient();
        var (userName, playerToken, userId) = await CreatePlayerAsync(client);
        var (adminToken, _) = await CreateAdminAsync(client);

        Authorize(client, adminToken);
        var lockResponse = await client.PostJsonAsync(
            $"/api/v1/admin/users/{userId}/status", new SetUserStatusRequest("locked", "spamming chat"), Ct);
        Assert.Equal(HttpStatusCode.OK, lockResponse.StatusCode);
        var locked = await lockResponse.ReadStrictAsync<AdminUserResponse>(Ct);
        Assert.Equal("locked", locked.Status);

        var loggedIn = await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, loggedIn.StatusCode);

        Authorize(client, playerToken);
        var world = await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(UniqueName("world"), Seed: 4242, Radius: 30, MaxPlayers: 100), Ct);
        Assert.Equal(HttpStatusCode.Created, world.StatusCode);
        var worldResponse = await world.ReadStrictAsync<WorldResponse>(Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldResponse.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var founded = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldResponse.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", userName, userId.ToString()),
            Ct);

        Assert.Equal(HttpStatusCode.Forbidden, founded.StatusCode);
        var problem = await founded.Content.ReadFromJsonAsync<AuthErrorResponse>(SqliteApiFixture.StrictJson, Ct);
        Assert.Equal("user_locked", problem!.Error);
    }

    [Fact]
    public async Task A_banned_users_login_is_rejected()
    {
        using var client = _fixture.CreateClient();
        var (userName, _, userId) = await CreatePlayerAsync(client);
        var (adminToken, _) = await CreateAdminAsync(client);

        Authorize(client, adminToken);
        var banResponse = await client.PostJsonAsync(
            $"/api/v1/admin/users/{userId}/status", new SetUserStatusRequest("banned"), Ct);
        Assert.Equal(HttpStatusCode.OK, banResponse.StatusCode);

        client.DefaultRequestHeaders.Authorization = null;
        var loginResponse = await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, loginResponse.StatusCode);
        var problem = await loginResponse.Content.ReadFromJsonAsync<AuthErrorResponse>(SqliteApiFixture.StrictJson, Ct);
        Assert.Equal("user_banned", problem!.Error);
    }

    [Fact]
    public async Task Admin_endpoints_404_for_an_unknown_user()
    {
        using var client = _fixture.CreateClient();
        var (adminToken, _) = await CreateAdminAsync(client);
        Authorize(client, adminToken);

        var missing = Guid.CreateVersion7();

        var getResponse = await client.GetAsync($"/api/v1/admin/users/{missing}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, getResponse.StatusCode);

        var patchResponse = await client.PatchJsonAsync(
            $"/api/v1/admin/users/{missing}", new UpdateAdminUserRequest("Nobody"), Ct);
        Assert.Equal(HttpStatusCode.NotFound, patchResponse.StatusCode);

        var statusResponse = await client.PostJsonAsync(
            $"/api/v1/admin/users/{missing}/status", new SetUserStatusRequest("locked"), Ct);
        Assert.Equal(HttpStatusCode.NotFound, statusResponse.StatusCode);

        var premiumResponse = await client.PostJsonAsync(
            $"/api/v1/admin/users/{missing}/premium", new SetUserPremiumRequest(true), Ct);
        Assert.Equal(HttpStatusCode.NotFound, premiumResponse.StatusCode);
    }

    /// <summary>
    /// Regression coverage for the gap the troop-system e2e wave (issue #40's
    /// premium fight simulator) surfaced: nothing in the API could ever set
    /// <see cref="UserEntity.IsPremium"/> before this endpoint existed, so the
    /// simulator's <c>PremiumUserEndpointFilter</c> gate was unreachable in
    /// its "premium granted" branch from outside a raw DB write.
    /// </summary>
    [Fact]
    public async Task Admin_can_grant_and_revoke_a_users_premium_flag()
    {
        using var client = _fixture.CreateClient();
        var (_, _, userId) = await CreatePlayerAsync(client);
        var (adminToken, _) = await CreateAdminAsync(client);
        Authorize(client, adminToken);

        var granted = await client.PostJsonAsync(
            $"/api/v1/admin/users/{userId}/premium", new SetUserPremiumRequest(true), Ct);
        Assert.Equal(HttpStatusCode.OK, granted.StatusCode);
        var grantedUser = await granted.ReadStrictAsync<AdminUserResponse>(Ct);
        Assert.True(grantedUser.IsPremium);

        var revoked = await client.PostJsonAsync(
            $"/api/v1/admin/users/{userId}/premium", new SetUserPremiumRequest(false), Ct);
        Assert.Equal(HttpStatusCode.OK, revoked.StatusCode);
        var revokedUser = await revoked.ReadStrictAsync<AdminUserResponse>(Ct);
        Assert.False(revokedUser.IsPremium);
    }
}
