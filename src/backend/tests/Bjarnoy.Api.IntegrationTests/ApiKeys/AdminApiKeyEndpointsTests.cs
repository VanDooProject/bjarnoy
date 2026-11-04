using System.Net;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.IntegrationTests.ApiKeys;

/// <summary>The admin-only key management routes: who may call them, and their validation and lifecycle rules.</summary>
public sealed class AdminApiKeyEndpointsTests : ApiKeyTestBase
{
    private ApiKeySettingsRequest Settings(
        string? name = "Key",
        Guid? owner = null,
        Dictionary<string, ApiKeyAccess>? features = null,
        TimeSpan? lifetime = null,
        int? rpm = null,
        bool allWorlds = true,
        IReadOnlyList<Guid>? worlds = null) =>
        new(
            name, "purpose", owner,
            features ?? ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)),
            allWorlds, worlds,
            Factory.Time.GetUtcNow() + (lifetime ?? TimeSpan.FromHours(1)),
            rpm);

    [Fact]
    public async Task Only_admins_may_manage_keys_and_requests()
    {
        using var anonymous = Factory.CreateClient();
        var (player, _, _) = await Harness.CreatePlayerAsync();

        string[] gets = ["/api/v1/admin/api-keys", "/api/v1/admin/api-key-requests"];
        foreach (var route in gets)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(route, Ct)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await player.GetAsync(route, Ct)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.Forbidden, (await player.PostJsonAsync("/api/v1/admin/api-keys", Settings(), Ct)).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await player.PostAsync($"/api/v1/admin/api-keys/{Guid.CreateVersion7()}/revoke", null, Ct)).StatusCode);
    }

    [Fact]
    public async Task The_owner_defaults_to_the_calling_admin_and_can_be_any_user()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        var (_, playerId, playerName) = await Harness.CreatePlayerAsync();

        var own = await (await admin.PostJsonAsync("/api/v1/admin/api-keys", Settings(), Ct)).ReadStrictAsync<ApiKeyTokenResponse>(Ct);
        Assert.Equal(adminId, own.ApiKey.OwnerUserId);
        Assert.Equal(adminId, own.ApiKey.CreatedByUserId);

        var forPlayer = await (await admin.PostJsonAsync("/api/v1/admin/api-keys", Settings(owner: playerId), Ct))
            .ReadStrictAsync<ApiKeyTokenResponse>(Ct);
        Assert.Equal(playerId, forPlayer.ApiKey.OwnerUserId);
        Assert.Equal(playerName, forPlayer.ApiKey.OwnerUserName);
        Assert.Equal(adminId, forPlayer.ApiKey.CreatedByUserId);
        Assert.Equal(120, forPlayer.ApiKey.RequestsPerMinute);
    }

    [Fact]
    public async Task Creation_validates_the_settings()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, playerId, _) = await Harness.CreatePlayerAsync();
        await Harness.SetStatusAsync(playerId, UserStatus.Banned);

        var cases = new Dictionary<string, ApiKeySettingsRequest>
        {
            ["name"] = Settings(name: " "),
            ["features"] = Settings(features: []),
            ["features "] = Settings(features: ApiKeyHarness.Features(("nonsense", ApiKeyAccess.Read))),
            ["expiresAt"] = Settings(lifetime: TimeSpan.FromMinutes(-1)),
            ["expiresAt "] = Settings(lifetime: TimeSpan.FromDays(31)),
            ["requestsPerMinute"] = Settings(rpm: 0),
            ["requestsPerMinute "] = Settings(rpm: 5000),
            ["ownerUserId"] = Settings(owner: Guid.CreateVersion7()),
            ["ownerUserId "] = Settings(owner: playerId),
            ["worldIds"] = Settings(allWorlds: false, worlds: [Guid.CreateVersion7()]),
        };

        foreach (var (field, body) in cases)
        {
            var response = await admin.PostJsonAsync("/api/v1/admin/api-keys", body, Ct);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var problem = await response.ReadStrictAsync<ValidationProblemDetails>(Ct);
            Assert.Contains(field.Trim(), problem.Errors.Keys);
        }
    }

    [Fact]
    public async Task An_owner_may_hold_only_a_limited_number_of_active_keys()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, playerId, _) = await Harness.CreatePlayerAsync();

        for (var i = 0; i < 20; i++)
        {
            Assert.Equal(
                HttpStatusCode.Created,
                (await admin.PostJsonAsync("/api/v1/admin/api-keys", Settings(owner: playerId), Ct)).StatusCode);
        }

        var over = await admin.PostJsonAsync("/api/v1/admin/api-keys", Settings(owner: playerId), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, over.StatusCode);

        // A revoked key frees a slot.
        var keys = await (await admin.GetAsync("/api/v1/admin/api-keys", Ct)).ReadStrictAsync<List<ApiKeyResponse>>(Ct);
        await admin.PostAsync($"/api/v1/admin/api-keys/{keys[0].Id}/revoke", null, Ct);
        Assert.Equal(HttpStatusCode.Created, (await admin.PostJsonAsync("/api/v1/admin/api-keys", Settings(owner: playerId), Ct)).StatusCode);
    }

    [Fact]
    public async Task The_list_shows_active_keys_by_default_and_everything_on_request()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var active = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));
        var revoked = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));
        var expiring = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)), lifetime: TimeSpan.FromMinutes(10));
        await admin.PostAsync($"/api/v1/admin/api-keys/{revoked.ApiKey.Id}/revoke", null, Ct);
        Factory.Time.Advance(TimeSpan.FromMinutes(11));
        (admin, _, _) = await Harness.CreateAdminAsync();

        var defaults = await (await admin.GetAsync("/api/v1/admin/api-keys", Ct)).ReadStrictAsync<List<ApiKeyResponse>>(Ct);
        Assert.Contains(defaults, k => k.Id == active.ApiKey.Id);
        Assert.DoesNotContain(defaults, k => k.Id == revoked.ApiKey.Id);
        Assert.DoesNotContain(defaults, k => k.Id == expiring.ApiKey.Id);

        var all = await (await admin.GetAsync("/api/v1/admin/api-keys?includeInactive=true", Ct)).ReadStrictAsync<List<ApiKeyResponse>>(Ct);
        Assert.Equal(ApiKeyStatus.Revoked, all.Single(k => k.Id == revoked.ApiKey.Id).Status);
        Assert.Equal(ApiKeyStatus.Expired, all.Single(k => k.Id == expiring.ApiKey.Id).Status);
        Assert.Equal(ApiKeyStatus.Active, all.Single(k => k.Id == active.ApiKey.Id).Status);
    }

    [Fact]
    public async Task Update_changes_the_settings_but_keeps_the_token_working()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, playerId, _) = await Harness.CreatePlayerAsync();
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)), requestsPerMinute: 50);
        using var client = Harness.KeyClient(created.Token);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/profiles/" + playerId, Ct)).StatusCode);

        var update = await admin.PutJsonAsync(
            $"/api/v1/admin/api-keys/{created.ApiKey.Id}",
            Settings(name: "Renamed", owner: playerId, features: ApiKeyHarness.Features(("profiles", ApiKeyAccess.Read)), lifetime: TimeSpan.FromHours(3)),
            Ct);
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var updated = await update.ReadStrictAsync<ApiKeyResponse>(Ct);
        Assert.Equal("Renamed", updated.Name);
        Assert.Equal(playerId, updated.OwnerUserId);
        Assert.Equal([ApiKeyAccess.Read], updated.Features.Values);
        Assert.Contains("profiles", updated.Features.Keys);
        Assert.Equal(50, updated.RequestsPerMinute); // omitted: kept
        Assert.Equal(Factory.Time.GetUtcNow().AddHours(3), updated.ExpiresAt);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/profiles/" + playerId, Ct)).StatusCode);
    }

    [Fact]
    public async Task A_revoked_key_cannot_be_edited_or_recreated_and_unknown_ids_are_404()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));
        await admin.PostAsync($"/api/v1/admin/api-keys/{created.ApiKey.Id}/revoke", null, Ct);

        Assert.Equal(HttpStatusCode.Conflict, (await admin.PutJsonAsync($"/api/v1/admin/api-keys/{created.ApiKey.Id}", Settings(), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsync($"/api/v1/admin/api-keys/{created.ApiKey.Id}/recreate", null, Ct)).StatusCode);

        var unknown = Guid.CreateVersion7();
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutJsonAsync($"/api/v1/admin/api-keys/{unknown}", Settings(), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsync($"/api/v1/admin/api-keys/{unknown}/recreate", null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsync($"/api/v1/admin/api-keys/{unknown}/revoke", null, Ct)).StatusCode);
    }

    [Fact]
    public async Task Recreate_revokes_the_old_key_and_issues_a_new_secret_with_the_same_settings()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, playerId, _) = await Harness.CreatePlayerAsync();
        var original = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("profiles", ApiKeyAccess.Read)), ownerUserId: playerId, requestsPerMinute: 77);

        var response = await admin.PostAsync($"/api/v1/admin/api-keys/{original.ApiKey.Id}/recreate", null, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var replacement = await response.ReadStrictAsync<ApiKeyTokenResponse>(Ct);

        Assert.NotEqual(original.Token, replacement.Token);
        Assert.NotEqual(original.ApiKey.Id, replacement.ApiKey.Id);
        Assert.Equal(original.ApiKey.Name, replacement.ApiKey.Name);
        Assert.Equal(playerId, replacement.ApiKey.OwnerUserId);
        Assert.Equal(77, replacement.ApiKey.RequestsPerMinute);
        Assert.Equal(original.ApiKey.Features, replacement.ApiKey.Features);

        using var oldClient = Harness.KeyClient(original.Token);
        using var newClient = Harness.KeyClient(replacement.Token);
        Assert.Equal(HttpStatusCode.Unauthorized, (await oldClient.GetAsync("/api/v1/api-keys/self", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await newClient.GetAsync("/api/v1/api-keys/self", Ct)).StatusCode);

        var all = await (await admin.GetAsync("/api/v1/admin/api-keys?includeInactive=true", Ct)).ReadStrictAsync<List<ApiKeyResponse>>(Ct);
        var old = all.Single(k => k.Id == original.ApiKey.Id);
        Assert.Equal(ApiKeyStatus.Revoked, old.Status);
        Assert.Equal(replacement.ApiKey.Id, old.ReplacedByApiKeyId);
    }

    [Fact]
    public async Task Revoking_twice_is_harmless()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));

        var first = await (await admin.PostAsync($"/api/v1/admin/api-keys/{created.ApiKey.Id}/revoke", null, Ct)).ReadStrictAsync<ApiKeyResponse>(Ct);
        Factory.Time.Advance(TimeSpan.FromMinutes(5));
        var second = await (await admin.PostAsync($"/api/v1/admin/api-keys/{created.ApiKey.Id}/revoke", null, Ct)).ReadStrictAsync<ApiKeyResponse>(Ct);

        Assert.Equal(first.RevokedAt, second.RevokedAt);
    }

    [Fact]
    public async Task An_admin_key_cannot_manage_keys_even_when_owned_by_an_admin()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("admin.users", ApiKeyAccess.ReadWrite)), ownerUserId: adminId);
        using var client = Harness.KeyClient(created.Token);

        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostJsonAsync("/api/v1/admin/api-keys", Settings(), Ct)).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.PostAsync($"/api/v1/admin/api-keys/{created.ApiKey.Id}/revoke", null, Ct)).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await client.PostAsync($"/api/v1/admin/api-key-requests/{Guid.CreateVersion7()}/approve", null, Ct)).StatusCode);
    }

    [Fact]
    public async Task Listing_requests_rejects_an_unknown_status_filter()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/v1/admin/api-key-requests?status=bogus", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/v1/admin/api-key-requests?status=all", Ct)).StatusCode);
    }

    [Fact]
    public async Task Approval_overrides_are_validated_like_a_direct_creation()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, playerId, _) = await Harness.CreatePlayerAsync();
        using var agent = Factory.CreateClient();
        var requested = await (await agent.PostJsonAsync(
                "/api/v1/api-key-requests/",
                new CreateApiKeyRequestRequest(
                    "Agent", null, null, null, null, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)), true, null, 60, null),
                Ct))
            .ReadStrictAsync<ApiKeyRequestCreatedResponse>(Ct);

        var adminFeatureOnPlayer = await admin.PostJsonAsync(
            $"/api/v1/admin/api-key-requests/{requested.Id}/approve",
            new ApproveApiKeyRequestRequest(OwnerUserId: playerId, Features: ApiKeyHarness.Features(("admin.users", ApiKeyAccess.Read))),
            Ct);
        Assert.Equal(HttpStatusCode.BadRequest, adminFeatureOnPlayer.StatusCode);

        var tooLong = await admin.PostJsonAsync(
            $"/api/v1/admin/api-key-requests/{requested.Id}/approve",
            new ApproveApiKeyRequestRequest(LifetimeMinutes: 60 * 24 * 40),
            Ct);
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Contains("lifetimeMinutes", (await tooLong.ReadStrictAsync<ValidationProblemDetails>(Ct)).Errors.Keys);

        // The request is still pending after the failed attempts, and an auto-renew window can be set on approval.
        var ok = await admin.PostJsonAsync(
            $"/api/v1/admin/api-key-requests/{requested.Id}/approve",
            new ApproveApiKeyRequestRequest(AutoRenewMinutes: 600),
            Ct);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var approved = await ok.ReadStrictAsync<ApiKeyRequestResponse>(Ct);
        Assert.Equal(Factory.Time.GetUtcNow().AddMinutes(600), approved.Approved!.AutoRenewUntil);
    }
}
