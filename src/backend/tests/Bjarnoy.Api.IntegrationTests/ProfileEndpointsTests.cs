using System.Net;
using System.Net.Http.Headers;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The player-facing profile surface (issue #42): public profile reads (bio,
/// joined date, settlement count), the own-bio PUT (verbatim whitespace, the
/// length cap, auth), the report POST (auth, self-report and duplicate
/// guards), and the admin report queue (list, resolve, the 401/403 matrix).
/// </summary>
public sealed class ProfileEndpointsTests(SqliteApiFixture fixture) : IClassFixture<SqliteApiFixture>
{
    private readonly SqliteApiFixture _fixture = fixture;

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string UniqueName(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

    private async Task<(string UserName, string AccessToken, Guid UserId)> CreatePlayerAsync(HttpClient client)
    {
        var userName = UniqueName("player");
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);
        return (userName, auth.AccessToken, auth.User.Id);
    }

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

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    [Fact]
    public async Task A_profile_is_publicly_readable_by_id_and_by_name_with_joined_date_and_settlement_count()
    {
        using var registrar = _fixture.CreateClient();
        var (userName, _, userId) = await CreatePlayerAsync(registrar);

        using var anonymous = _fixture.CreateClient();

        var byId = await anonymous.GetAsync($"/api/v1/profiles/{userId}", Ct);
        Assert.Equal(HttpStatusCode.OK, byId.StatusCode);
        var profile = await byId.ReadStrictAsync<ProfileResponse>(Ct);
        Assert.Equal(userId, profile.Id);
        Assert.Equal(userName, profile.UserName);
        Assert.Null(profile.Bio);
        Assert.Equal(0, profile.SettlementCount);

        // The joined date is the account's CreatedAt, straight from the DB.
        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == userId, Ct);
            Assert.Equal(user.CreatedAt, profile.CreatedAt);
        }

        // By name is case-insensitive (the normalized column).
        var byName = await anonymous.GetAsync($"/api/v1/profiles/by-name/{userName.ToUpperInvariant()}", Ct);
        Assert.Equal(HttpStatusCode.OK, byName.StatusCode);
        var namedProfile = await byName.ReadStrictAsync<ProfileResponse>(Ct);
        Assert.Equal(userId, namedProfile.Id);
    }

    [Fact]
    public async Task Profile_settlement_count_reflects_owned_settlements()
    {
        // Found anonymously under a local owner id, then register with that
        // id — the same claim flow the real client uses (see
        // AuthService.RegisterAsync); a settlement founded before that
        // belongs to the Abandoned system user, not to anyone's profile.
        using var client = _fixture.CreateClient();
        var localOwnerId = $"local-{Guid.CreateVersion7():N}";

        var world = await client.PostJsonAsync(
            "/api/v1/worlds",
            new CreateWorldRequest(UniqueName("world"), Seed: 777, Radius: 30, MaxPlayers: 100), Ct);
        Assert.Equal(HttpStatusCode.Created, world.StatusCode);
        var worldResponse = await world.ReadStrictAsync<WorldResponse>(Ct);

        var islandsResponse = await client.GetAsync($"/api/v1/worlds/{worldResponse.Id}/islands", Ct);
        var islands = await islandsResponse.ReadStrictAsync<List<IslandResponse>>(Ct);
        var island = islands.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var founded = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldResponse.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ragnar", localOwnerId),
            Ct);
        Assert.Equal(HttpStatusCode.Created, founded.StatusCode);

        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register",
            new RegisterRequest(UniqueName("founder"), "correct-horse-battery", localOwnerId), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);

        var profileResponse = await client.GetAsync($"/api/v1/profiles/{auth.User.Id}", Ct);
        Assert.Equal(HttpStatusCode.OK, profileResponse.StatusCode);
        var profile = await profileResponse.ReadStrictAsync<ProfileResponse>(Ct);
        Assert.Equal(1, profile.SettlementCount);
    }

    [Fact]
    public async Task System_and_unknown_users_have_no_profile()
    {
        using var client = _fixture.CreateClient();

        var unknown = await client.GetAsync($"/api/v1/profiles/{Guid.CreateVersion7()}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);

        var system = await client.GetAsync($"/api/v1/profiles/{SystemUserIds.Abandoned}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, system.StatusCode);

        var systemByName = await client.GetAsync("/api/v1/profiles/by-name/Abandoned", Ct);
        Assert.Equal(HttpStatusCode.NotFound, systemByName.StatusCode);
    }

    [Fact]
    public async Task A_user_can_set_and_clear_their_own_bio_and_whitespace_survives_verbatim()
    {
        using var client = _fixture.CreateClient();
        var (_, accessToken, userId) = await CreatePlayerAsync(client);
        Authorize(client, accessToken);

        // ASCII art: leading spaces, internal runs of spaces, and newlines
        // must all come back exactly as sent.
        const string asciiArt = "  /\\_/\\\n ( o.o )   longship\n  > ^ <";

        var updated = await client.PutJsonAsync("/api/v1/profiles/me/bio", new UpdateBioRequest(asciiArt), Ct);
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var profile = await updated.ReadStrictAsync<ProfileResponse>(Ct);
        Assert.Equal(asciiArt, profile.Bio);

        // And it is what anyone reading the profile sees.
        using var anonymous = _fixture.CreateClient();
        var read = await anonymous.GetAsync($"/api/v1/profiles/{userId}", Ct);
        var readProfile = await read.ReadStrictAsync<ProfileResponse>(Ct);
        Assert.Equal(asciiArt, readProfile.Bio);

        // Null clears it.
        var cleared = await client.PutJsonAsync("/api/v1/profiles/me/bio", new UpdateBioRequest(null), Ct);
        Assert.Equal(HttpStatusCode.OK, cleared.StatusCode);
        var clearedProfile = await cleared.ReadStrictAsync<ProfileResponse>(Ct);
        Assert.Null(clearedProfile.Bio);
    }

    [Fact]
    public async Task Bio_updates_require_authentication_and_respect_the_length_cap()
    {
        using var anonymous = _fixture.CreateClient();
        var unauthorized = await anonymous.PutJsonAsync(
            "/api/v1/profiles/me/bio", new UpdateBioRequest("hi"), Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);

        using var client = _fixture.CreateClient();
        var (_, accessToken, _) = await CreatePlayerAsync(client);
        Authorize(client, accessToken);

        var tooLong = await client.PutJsonAsync(
            "/api/v1/profiles/me/bio", new UpdateBioRequest(new string('x', 2001)), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
    }

    [Fact]
    public async Task A_player_can_report_another_players_profile_but_not_their_own_and_not_twice_while_pending()
    {
        using var client = _fixture.CreateClient();
        var (_, _, reportedId) = await CreatePlayerAsync(client);
        var (_, reporterToken, reporterId) = await CreatePlayerAsync(client);
        Authorize(client, reporterToken);

        var created = await client.PostJsonAsync(
            $"/api/v1/profiles/{reportedId}/reports",
            new ReportProfileRequest("Offensive bio", "The ASCII art is rude."), Ct);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var report = await created.ReadStrictAsync<ProfileReportResponse>(Ct);
        Assert.Equal(reporterId, report.ReporterUserId);
        Assert.Equal(reportedId, report.ReportedUserId);
        Assert.Equal("Offensive bio", report.Reason);
        Assert.Equal("The ASCII art is rude.", report.Note);
        Assert.Equal("pending", report.Status);

        // A second report against the same user while one is pending is refused.
        var duplicate = await client.PostJsonAsync(
            $"/api/v1/profiles/{reportedId}/reports", new ReportProfileRequest("Still offensive"), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);

        // Self-report is refused.
        var self = await client.PostJsonAsync(
            $"/api/v1/profiles/{reporterId}/reports", new ReportProfileRequest("I am great actually"), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, self.StatusCode);

        // Reporting a non-existent user is a 404.
        var missing = await client.PostJsonAsync(
            $"/api/v1/profiles/{Guid.CreateVersion7()}/reports", new ReportProfileRequest("ghost"), Ct);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Reporting_requires_authentication()
    {
        using var client = _fixture.CreateClient();
        var (_, _, reportedId) = await CreatePlayerAsync(client);

        using var anonymous = _fixture.CreateClient();
        var response = await anonymous.PostJsonAsync(
            $"/api/v1/profiles/{reportedId}/reports", new ReportProfileRequest("spam"), Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Anonymous_and_player_callers_are_refused_the_admin_reports_surface()
    {
        using var anonymous = _fixture.CreateClient();
        var anonymousResponse = await anonymous.GetAsync("/api/v1/admin/profile-reports", Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousResponse.StatusCode);

        using var player = _fixture.CreateClient();
        var (_, playerToken, _) = await CreatePlayerAsync(player);
        Authorize(player, playerToken);

        var playerResponse = await player.GetAsync("/api/v1/admin/profile-reports", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, playerResponse.StatusCode);
    }

    [Fact]
    public async Task An_admin_can_list_pending_reports_and_resolve_one()
    {
        using var client = _fixture.CreateClient();
        var (reportedName, _, reportedId) = await CreatePlayerAsync(client);
        var (reporterName, reporterToken, _) = await CreatePlayerAsync(client);
        Authorize(client, reporterToken);

        var created = await client.PostJsonAsync(
            $"/api/v1/profiles/{reportedId}/reports", new ReportProfileRequest("Offensive bio"), Ct);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var report = await created.ReadStrictAsync<ProfileReportResponse>(Ct);

        var (adminToken, _) = await CreateAdminAsync(client);
        Authorize(client, adminToken);

        var listResponse = await client.GetAsync("/api/v1/admin/profile-reports?status=pending", Ct);
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        var listed = await listResponse.ReadStrictAsync<PagedProfileReportsResponse>(Ct);
        var listedReport = Assert.Single(listed.Items, r => r.Id == report.Id);
        Assert.Equal(reporterName, listedReport.ReporterUserName);
        Assert.Equal(reportedName, listedReport.ReportedUserName);
        Assert.Null(listedReport.ReviewedAt);

        var resolveResponse = await client.PostJsonAsync(
            $"/api/v1/admin/profile-reports/{report.Id}/resolve",
            new ResolveProfileReportRequest("dismissed"), Ct);
        Assert.Equal(HttpStatusCode.OK, resolveResponse.StatusCode);
        var resolved = await resolveResponse.ReadStrictAsync<ProfileReportResponse>(Ct);
        Assert.Equal("dismissed", resolved.Status);
        Assert.NotNull(resolved.ReviewedAt);

        // Resolved, it drops out of the pending queue.
        var pendingAfter = await client.GetAsync("/api/v1/admin/profile-reports?status=pending", Ct);
        var pendingItems = await pendingAfter.ReadStrictAsync<PagedProfileReportsResponse>(Ct);
        Assert.DoesNotContain(pendingItems.Items, r => r.Id == report.Id);

        // An unknown status string and an unknown report id are refused.
        var badStatus = await client.PostJsonAsync(
            $"/api/v1/admin/profile-reports/{report.Id}/resolve", new ResolveProfileReportRequest("nuked"), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, badStatus.StatusCode);

        var missing = await client.PostJsonAsync(
            $"/api/v1/admin/profile-reports/{Guid.CreateVersion7()}/resolve",
            new ResolveProfileReportRequest("reviewed"), Ct);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }
}
