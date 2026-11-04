using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Api.IntegrationTests.ApiKeys;

/// <summary>
/// What a key may reach: feature levels, the never-for-keys routes, world scope, admin features, acting as a player,
/// and the rate limit.
/// </summary>
public sealed class ApiKeyScopeTests : ApiKeyTestBase
{
    private static async Task<string?> TitleAsync(HttpResponseMessage response) =>
        (await response.ReadStrictAsync<ProblemDetails>(Ct)).Title;

    // ---- feature level ----

    [Fact]
    public async Task A_read_only_feature_allows_get_and_refuses_writes()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));
        using var client = Harness.KeyClient(created.Token);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/worlds/", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/worlds/{world.Id}", Ct)).StatusCode);

        var write = await client.DeleteAsync($"/api/v1/worlds/{world.Id}/plot-suggestion", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, write.StatusCode);
        Assert.Equal("API key lacks worlds:write.", await TitleAsync(write));
    }

    [Fact]
    public async Task A_read_write_feature_allows_writes()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.ReadWrite)));
        using var client = Harness.KeyClient(created.Token);

        var write = await client.DeleteAsync($"/api/v1/worlds/{world.Id}/plot-suggestion", Ct);
        Assert.NotEqual(HttpStatusCode.Forbidden, write.StatusCode);
        Assert.NotEqual(HttpStatusCode.Unauthorized, write.StatusCode);
    }

    [Fact]
    public async Task A_feature_the_key_lacks_is_403_naming_the_feature()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));
        using var client = Harness.KeyClient(created.Token);

        var response = await client.GetAsync($"/api/v1/worlds/{world.Id}/leaderboards/", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("API key lacks leaderboards:read.", await TitleAsync(response));
    }

    [Fact]
    public async Task Public_endpoints_need_no_feature_but_any_valid_key()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("chat", ApiKeyAccess.Read)));
        using var client = Harness.KeyClient(created.Token);

        foreach (var route in new[] { "/api/v1/buildings", "/api/v1/units", "/api/v1/auth/me", "/api/v1/api-keys/features", "/api/v1/api-keys/self" })
        {
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(route, Ct)).StatusCode);
        }
    }

    [Fact]
    public async Task Forbidden_endpoints_refuse_even_an_admin_owned_key_with_every_feature()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var everything = Bjarnoy.Api.Auth.ApiKeys.ApiKeyFeature.Catalogue
            .ToDictionary(f => f.Id, _ => ApiKeyAccess.ReadWrite);
        var created = await Harness.CreateKeyAsync(admin, everything);
        using var client = Harness.KeyClient(created.Token);

        var heartbeat = await client.PostAsync("/api/v1/activity/heartbeat", null, Ct);
        Assert.Equal(HttpStatusCode.Forbidden, heartbeat.StatusCode);
        Assert.Equal("Not available to API keys.", await TitleAsync(heartbeat));

        foreach (var route in new[] { "/api/v1/admin/api-keys", "/api/v1/admin/api-key-requests" })
        {
            var response = await client.GetAsync(route, Ct);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            Assert.Equal("Not available to API keys.", await TitleAsync(response));
        }

        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.PostJsonAsync("/api/v1/auth/login", new LoginRequest("x", "y"), Ct)).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.PostJsonAsync("/api/v1/admin/api-keys", MinimalSettings(Factory), Ct)).StatusCode);
    }

    [Fact]
    public async Task An_endpoint_without_a_marker_fails_closed_for_keys()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));
        using var client = Harness.KeyClient(created.Token);

        // The /api/{**segment} JSON-404 fallback carries no marker, so for a key it fails closed like any other.
        var response = await client.GetAsync("/api/v1/does-not-exist", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // ---- world scope ----

    [Fact]
    public async Task A_world_limited_key_reaches_its_world_and_nothing_else()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, playerId, _) = await Harness.CreatePlayerAsync();
        var worldA = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("a"), 21, 60, cancellationToken: Ct);
        var worldB = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("b"), 22, 60, cancellationToken: Ct);
        var settlementA = await Harness.FoundSettlementAsync(worldA.Id, playerId);
        var settlementB = await Harness.FoundSettlementAsync(worldB.Id, playerId);

        var created = await Harness.CreateKeyAsync(
            admin,
            ApiKeyHarness.Features(("settlements", ApiKeyAccess.Read), ("worlds", ApiKeyAccess.Read)),
            ownerUserId: playerId,
            allWorlds: false,
            worldIds: [worldA.Id]);
        using var client = Harness.KeyClient(created.Token);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/settlements/{settlementA.Id}", Ct)).StatusCode);
        var other = await client.GetAsync($"/api/v1/settlements/{settlementB.Id}", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, other.StatusCode);
        Assert.Equal("API key is not allowed in this world.", await TitleAsync(other));

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/worlds/{worldA.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/v1/worlds/{worldB.Id}", Ct)).StatusCode);

        // A world-scoped endpoint that names no world at all.
        var none = await client.GetAsync("/api/v1/worlds/", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, none.StatusCode);
        Assert.Equal("API key is limited to specific worlds; this request names none.", await TitleAsync(none));
    }

    [Fact]
    public async Task A_request_for_a_missing_resource_passes_the_scope_check_and_gets_the_handlers_404()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var worldA = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("a"), 21, 60, cancellationToken: Ct);
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("armies", ApiKeyAccess.Read)), allWorlds: false, worldIds: [worldA.Id]);
        using var client = Harness.KeyClient(created.Token);

        var response = await client.GetAsync($"/api/v1/armies/{Guid.CreateVersion7()}", Ct);
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task The_world_query_value_is_checked_for_world_scoped_admin_routes()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        var worldA = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("a"), 21, 60, cancellationToken: Ct);
        var worldB = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("b"), 22, 60, cancellationToken: Ct);
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("admin.armies", ApiKeyAccess.Read)),
            ownerUserId: adminId, allWorlds: false, worldIds: [worldA.Id]);
        using var client = Harness.KeyClient(created.Token);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/admin/armies?worldId={worldA.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/v1/admin/armies?worldId={worldB.Id}", Ct)).StatusCode);
    }

    [Fact]
    public async Task The_world_query_value_counts_only_where_the_handler_filters_by_it()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        var worldA = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("a"), 21, 60, cancellationToken: Ct);
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("admin.worlds", ApiKeyAccess.ReadWrite)),
            ownerUserId: adminId, allWorlds: false, worldIds: [worldA.Id]);
        using var client = Harness.KeyClient(created.Token);

        // The admin world list and world creation ignore ?worldId=, so naming the key's own world there must not
        // unlock every world (or a brand-new one).
        var list = await client.GetAsync($"/api/v1/admin/worlds/?worldId={worldA.Id}", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, list.StatusCode);
        Assert.Equal("API key is limited to specific worlds; this request names none.", await TitleAsync(list));

        var create = await client.PostAsJsonAsync(
            $"/api/v1/admin/worlds/?worldId={worldA.Id}", new { name = ApiKeyHarness.Unique("sneaky") }, Ct);
        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);
    }

    [Fact]
    public async Task An_all_worlds_key_reaches_every_world()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var worldA = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("a"), 21, 60, cancellationToken: Ct);
        var worldB = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("b"), 22, 60, cancellationToken: Ct);
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)), allWorlds: true);
        using var client = Harness.KeyClient(created.Token);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/worlds/{worldA.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/worlds/{worldB.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/worlds/", Ct)).StatusCode);
    }

    [Fact]
    public async Task Non_world_scoped_features_ignore_the_world_list()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var worldA = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("a"), 21, 60, cancellationToken: Ct);
        var (_, playerId, _) = await Harness.CreatePlayerAsync();
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("profiles", ApiKeyAccess.Read)),
            allWorlds: false, worldIds: [worldA.Id]);
        using var client = Harness.KeyClient(created.Token);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/profiles/{playerId}", Ct)).StatusCode);
    }

    // ---- admin features ----

    [Fact]
    public async Task An_admin_owned_key_reaches_only_the_admin_features_it_holds()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);

        var withoutAdmin = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("settlements", ApiKeyAccess.ReadWrite)), ownerUserId: adminId);
        using (var client = Harness.KeyClient(withoutAdmin.Token))
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/admin/worlds/", Ct)).StatusCode);
        }

        var withWorlds = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("admin.worlds", ApiKeyAccess.Read)), ownerUserId: adminId);
        using (var client = Harness.KeyClient(withWorlds.Token))
        {
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/admin/worlds/", Ct)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/admin/users", Ct)).StatusCode);

            // Read-only: the admin write route is refused by level, not by role.
            var write = await client.PostJsonAsync(
                "/api/v1/admin/worlds/", TestWorlds.CreateRequest(ApiKeyHarness.Unique("nw"), 5, 300), Ct);
            Assert.Equal(HttpStatusCode.Forbidden, write.StatusCode);
            Assert.Equal("API key lacks admin.worlds:write.", await TitleAsync(write));
        }
    }

    [Fact]
    public async Task A_player_owned_key_cannot_be_created_with_an_admin_feature()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, playerId, _) = await Harness.CreatePlayerAsync();

        var response = await admin.PostJsonAsync(
            "/api/v1/admin/api-keys",
            new ApiKeySettingsRequest(
                "Sneaky", null, playerId, ApiKeyHarness.Features(("admin.users", ApiKeyAccess.Read)), true, null,
                Factory.Time.GetUtcNow().AddHours(1), null),
            Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.ReadStrictAsync<ValidationProblemDetails>(Ct);
        Assert.Contains("features", problem.Errors.Keys);
    }

    // ---- acting as a player ----

    [Fact]
    public async Task A_player_owned_key_acts_as_that_player_and_leaves_no_activity()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, playerId, _) = await Harness.CreatePlayerAsync();
        var (_, otherId, _) = await Harness.CreatePlayerAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var mine = await Harness.FoundSettlementAsync(world.Id, playerId);

        var layout = await admin.GetFromJsonAsync<AdminSettlementLayoutResponse>(
            $"/api/v1/admin/settlements/{mine.Id}/layout", SqliteApiFixture.StrictJson, Ct);
        var grass = layout!.Hexes.First(h => !h.IsCentre && h.Building is null && h.Terrain == "grass");

        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("settlements", ApiKeyAccess.ReadWrite)), ownerUserId: playerId);
        using var client = Harness.KeyClient(created.Token);

        var build = await client.PostJsonAsync(
            $"/api/v1/settlements/{mine.Id}/builds", new QueueBuildRequest("storagehouse", grass.Q, grass.R), Ct);
        Assert.Equal(HttpStatusCode.Accepted, build.StatusCode);

        // Another player's settlement: the key has the player's rights, not more.
        var otherWorld = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("o"), 22, 60, cancellationToken: Ct);
        var theirs = await Harness.FoundSettlementAsync(otherWorld.Id, otherId);
        var refused = await client.GetAsync($"/api/v1/settlements/{theirs.Id}", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);

        // The key's owner must not look online because an agent used their key.
        var activity = await Harness.WithDbAsync(db => db.UserActivities.AnyAsync(a => a.UserId == playerId, Ct));
        Assert.False(activity);
    }

    [Fact]
    public async Task A_locked_owners_key_cannot_mutate_but_can_read()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, playerId, _) = await Harness.CreatePlayerAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var mine = await Harness.FoundSettlementAsync(world.Id, playerId);
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("settlements", ApiKeyAccess.ReadWrite)), ownerUserId: playerId);
        await Harness.SetStatusAsync(playerId, UserStatus.Locked);
        using var client = Harness.KeyClient(created.Token);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/settlements/{mine.Id}", Ct)).StatusCode);
        var build = await client.PostJsonAsync($"/api/v1/settlements/{mine.Id}/builds", new QueueBuildRequest("storagehouse", 0, 0), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, build.StatusCode);
    }

    // ---- rate limit ----

    [Fact]
    public async Task The_per_key_rate_limit_answers_429_with_retry_after_and_resets_with_the_window()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)), requestsPerMinute: 3);
        using var client = Harness.KeyClient(created.Token);

        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/buildings", Ct)).StatusCode);
        }

        var limited = await client.GetAsync("/api/v1/buildings", Ct);
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.RetryAfter?.Delta > TimeSpan.Zero);

        // A different key is unaffected.
        var other = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));
        using var otherClient = Harness.KeyClient(other.Token);
        Assert.Equal(HttpStatusCode.OK, (await otherClient.GetAsync("/api/v1/buildings", Ct)).StatusCode);

        Factory.Time.Advance(TimeSpan.FromSeconds(61));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/buildings", Ct)).StatusCode);
    }

    private static ApiKeySettingsRequest MinimalSettings(BjarnoyApiFactory factory) =>
        new("x", null, null, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)), true, null,
            factory.Time.GetUtcNow().AddHours(1), null);
}
