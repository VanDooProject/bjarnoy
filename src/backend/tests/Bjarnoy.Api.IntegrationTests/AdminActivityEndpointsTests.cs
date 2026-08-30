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
/// The admin activity surface added in this PR: the bucketed summary (with a
/// day-boundary-spanning session and an out-of-range rejection), the paged
/// users-by-last-active list (including never-active users), the per-user
/// session/detail endpoint (with 404), and the 403 matrix for a non-admin
/// caller.
/// </summary>
public sealed class AdminActivityEndpointsTests(SqliteApiFixture fixture) : IClassFixture<SqliteApiFixture>
{
    private readonly SqliteApiFixture _fixture = fixture;

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string UniqueName(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

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

    private async Task<(string AccessToken, Guid UserId)> CreatePlayerAsync(HttpClient client)
    {
        var userName = UniqueName("player");
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);
        return (auth.AccessToken, auth.User.Id);
    }

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    /// <summary>Creates a bare user row with no auth machinery, for seeding activity against.</summary>
    private async Task<Guid> CreateBareUserAsync()
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var user = new UserEntity
        {
            UserName = UniqueName("bare"),
            NormalizedUserName = UniqueName("bare").ToLowerInvariant(),
            PasswordHash = "unused",
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync(Ct);
        return user.Id;
    }

    private async Task SeedSessionAsync(Guid userId, DateTimeOffset startedAt, DateTimeOffset lastSeenAt)
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        db.UserActivitySessions.Add(new UserActivitySessionEntity
        {
            UserId = userId,
            StartedAtUtc = startedAt,
            LastSeenAtUtc = lastSeenAt,
        });
        await db.SaveChangesAsync(Ct);
    }

    private async Task SeedLastActiveAsync(Guid userId, DateTimeOffset lastActiveAt)
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        db.UserActivities.Add(new UserActivityEntity { UserId = userId, LastActiveAtUtc = lastActiveAt });
        await db.SaveChangesAsync(Ct);
    }

    private static string Iso(DateTimeOffset value) => Uri.EscapeDataString(value.ToString("O"));

    [Fact]
    public async Task Anonymous_and_player_callers_are_refused_the_admin_activity_surface()
    {
        var userId = Guid.CreateVersion7();
        var from = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var to = new DateTimeOffset(2026, 1, 2, 0, 0, 0, TimeSpan.Zero);

        using var anonymous = _fixture.CreateClient();
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await anonymous.GetAsync($"/api/v1/admin/activity/summary?from={Iso(from)}&to={Iso(to)}&bucket=day", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/v1/admin/activity/users", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/api/v1/admin/activity/users/{userId}?from={Iso(from)}&to={Iso(to)}", Ct)).StatusCode);

        using var player = _fixture.CreateClient();
        var (playerToken, _) = await CreatePlayerAsync(player);
        Authorize(player, playerToken);

        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await player.GetAsync($"/api/v1/admin/activity/summary?from={Iso(from)}&to={Iso(to)}&bucket=day", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await player.GetAsync("/api/v1/admin/activity/users", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await player.GetAsync($"/api/v1/admin/activity/users/{userId}?from={Iso(from)}&to={Iso(to)}", Ct)).StatusCode);
    }

    [Fact]
    public async Task Summary_buckets_active_users_per_day_including_a_session_spanning_the_boundary()
    {
        using var client = _fixture.CreateClient();
        var (adminToken, _) = await CreateAdminAsync(client);
        Authorize(client, adminToken);

        var userA = await CreateBareUserAsync();
        var userB = await CreateBareUserAsync();

        var day1 = new DateTimeOffset(2026, 3, 10, 0, 0, 0, TimeSpan.Zero);
        var day2 = day1.AddDays(1);

        // User A: entirely inside day 1.
        await SeedSessionAsync(userA, day1.AddHours(10), day1.AddHours(11));

        // User B: starts late on day 1, extends into day 2 — the
        // boundary-spanning case. Must count toward both buckets.
        await SeedSessionAsync(userB, day1.AddHours(23), day2.AddHours(1));

        var from = day1;
        var to = day2.AddHours(23).AddMinutes(59);

        var response = await client.GetAsync(
            $"/api/v1/admin/activity/summary?from={Iso(from)}&to={Iso(to)}&bucket=day", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var summary = await response.ReadStrictAsync<ActivitySummaryResponse>(Ct);

        Assert.Equal(2, summary.Buckets.Count);
        Assert.Equal(day1, summary.Buckets[0].BucketStart);
        Assert.Equal(2, summary.Buckets[0].ActiveUserCount);
        Assert.Equal(day2, summary.Buckets[1].BucketStart);
        Assert.Equal(1, summary.Buckets[1].ActiveUserCount);
    }

    [Fact]
    public async Task Summary_rejects_a_range_beyond_the_max_for_the_chosen_bucket()
    {
        using var client = _fixture.CreateClient();
        var (adminToken, _) = await CreateAdminAsync(client);
        Authorize(client, adminToken);

        var from = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

        var tooWideForDay = from.AddDays(93);
        var dayResponse = await client.GetAsync(
            $"/api/v1/admin/activity/summary?from={Iso(from)}&to={Iso(tooWideForDay)}&bucket=day", Ct);
        Assert.Equal(HttpStatusCode.BadRequest, dayResponse.StatusCode);

        var tooWideForHour = from.AddDays(8);
        var hourResponse = await client.GetAsync(
            $"/api/v1/admin/activity/summary?from={Iso(from)}&to={Iso(tooWideForHour)}&bucket=hour", Ct);
        Assert.Equal(HttpStatusCode.BadRequest, hourResponse.StatusCode);

        // Within bounds must still succeed.
        var okResponse = await client.GetAsync(
            $"/api/v1/admin/activity/summary?from={Iso(from)}&to={Iso(from.AddDays(1))}&bucket=hour", Ct);
        Assert.Equal(HttpStatusCode.OK, okResponse.StatusCode);
    }

    [Fact]
    public async Task Users_list_is_paginated_sorted_by_last_active_and_includes_never_active_users()
    {
        using var client = _fixture.CreateClient();
        var (adminToken, _) = await CreateAdminAsync(client);
        Authorize(client, adminToken);

        var never = await CreateBareUserAsync();
        var older = await CreateBareUserAsync();
        var newer = await CreateBareUserAsync();

        var baseline = new DateTimeOffset(2026, 2, 1, 0, 0, 0, TimeSpan.Zero);
        await SeedLastActiveAsync(older, baseline);
        await SeedLastActiveAsync(newer, baseline.AddHours(5));

        var response = await client.GetAsync("/api/v1/admin/activity/users?page=1&pageSize=200", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await response.ReadStrictAsync<PagedAdminActivityUsersResponse>(Ct);

        Assert.Contains(page.Items, u => u.UserId == never && u.LastActiveAtUtc == null);

        var newerIndex = page.Items.ToList().FindIndex(u => u.UserId == newer);
        var olderIndex = page.Items.ToList().FindIndex(u => u.UserId == older);
        var neverIndex = page.Items.ToList().FindIndex(u => u.UserId == never);

        Assert.True(newerIndex >= 0 && olderIndex >= 0 && neverIndex >= 0);
        Assert.True(newerIndex < olderIndex, "The more-recently-active user must sort first.");
        Assert.True(olderIndex < neverIndex, "Never-active users must sort after any active user.");

        // Paging actually slices: page size 1 returns exactly the first item
        // of the full ordering above, and total count reflects everyone.
        var pagedResponse = await client.GetAsync("/api/v1/admin/activity/users?page=1&pageSize=1", Ct);
        var paged = await pagedResponse.ReadStrictAsync<PagedAdminActivityUsersResponse>(Ct);
        Assert.Single(paged.Items);
        Assert.Equal(newer, paged.Items[0].UserId);
        Assert.Equal(page.TotalCount, paged.TotalCount);
    }

    [Fact]
    public async Task Per_user_activity_returns_clipped_windows_and_totals_and_404s_for_an_unknown_user()
    {
        using var client = _fixture.CreateClient();
        var (adminToken, _) = await CreateAdminAsync(client);
        Authorize(client, adminToken);

        var userId = await CreateBareUserAsync();

        var from = new DateTimeOffset(2026, 4, 1, 0, 0, 0, TimeSpan.Zero);
        var to = from.AddDays(1);

        // Fully inside the range: 1 hour.
        await SeedSessionAsync(userId, from.AddHours(2), from.AddHours(3));

        // Starts before `from` and ends after `to` — clipped to exactly the
        // 24-hour range on both ends.
        await SeedSessionAsync(userId, from.AddHours(-5), to.AddHours(5));

        // Entirely outside the range: must not be counted at all.
        await SeedSessionAsync(userId, to.AddDays(1), to.AddDays(1).AddHours(1));

        var response = await client.GetAsync(
            $"/api/v1/admin/activity/users/{userId}?from={Iso(from)}&to={Iso(to)}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var detail = await response.ReadStrictAsync<AdminUserActivityDetailResponse>(Ct);

        Assert.Equal(2, detail.SessionCount);
        Assert.Equal(2, detail.Sessions.Count);
        Assert.Equal(TimeSpan.FromHours(1) + TimeSpan.FromDays(1), detail.TotalActiveDuration);

        var missing = Guid.CreateVersion7();
        var missingResponse = await client.GetAsync(
            $"/api/v1/admin/activity/users/{missing}?from={Iso(from)}&to={Iso(to)}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, missingResponse.StatusCode);
    }
}
