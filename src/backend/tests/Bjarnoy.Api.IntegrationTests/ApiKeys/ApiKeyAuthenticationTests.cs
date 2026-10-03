using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Api.IntegrationTests.ApiKeys;

/// <summary>
/// An API key as a credential: how it is presented, who it acts as, and every way it stops working.
/// </summary>
public sealed class ApiKeyAuthenticationTests : ApiKeyTestBase
{
    [Fact]
    public async Task An_admin_created_key_authenticates_by_bearer_and_by_x_api_key_and_describes_itself()
    {
        var (admin, adminId, adminName) = await Harness.CreateAdminAsync();
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)), name: "Smoke key");

        Assert.StartsWith("bjk_", created.Token);
        Assert.Equal(adminId, created.ApiKey.OwnerUserId);
        Assert.Equal(adminName, created.ApiKey.OwnerUserName);
        Assert.Equal(ApiKeyStatus.Active, created.ApiKey.Status);
        Assert.StartsWith("bjk_", created.ApiKey.KeyHint);
        Assert.DoesNotContain(created.Token, created.ApiKey.KeyHint, StringComparison.Ordinal);

        foreach (var viaHeader in new[] { false, true })
        {
            using var client = Harness.KeyClient(created.Token, viaHeader);

            var self = await client.GetAsync("/api/v1/api-keys/self", Ct);
            Assert.Equal(HttpStatusCode.OK, self.StatusCode);
            var key = await self.ReadStrictAsync<ApiKeyResponse>(Ct);
            Assert.Equal(created.ApiKey.Id, key.Id);
            Assert.Equal("Smoke key", key.Name);
            Assert.Equal(ApiKeyAccess.Read, key.Features["worlds"]);

            var me = await client.GetAsync("/api/v1/auth/me", Ct);
            Assert.Equal(HttpStatusCode.OK, me.StatusCode);
            Assert.Equal(adminId, (await me.ReadStrictAsync<UserResponse>(Ct)).Id);
        }
    }

    [Fact]
    public async Task The_token_is_never_stored_or_listed_only_a_hint()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));

        var list = await admin.GetAsync("/api/v1/admin/api-keys", Ct);
        var body = await list.Content.ReadAsStringAsync(Ct);
        Assert.DoesNotContain(created.Token, body, StringComparison.Ordinal);

        var stored = await Harness.WithDbAsync(db => db.ApiKeys.SingleAsync(k => k.Id == created.ApiKey.Id, Ct));
        Assert.DoesNotContain(stored.SecretHash, created.Token, StringComparison.Ordinal);
        Assert.Equal(64, stored.SecretHash.Length);
    }

    [Fact]
    public async Task Self_needs_a_key_not_a_login_and_not_nothing()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await admin.GetAsync("/api/v1/api-keys/self", Ct)).StatusCode);

        using var anonymous = Factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/v1/api-keys/self", Ct)).StatusCode);
    }

    [Fact]
    public async Task A_revoked_key_is_401_even_on_an_anonymous_endpoint()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));
        using var client = Harness.KeyClient(created.Token);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/buildings", Ct)).StatusCode);

        var revoke = await admin.PostAsync($"/api/v1/admin/api-keys/{created.ApiKey.Id}/revoke", null, Ct);
        Assert.Equal(HttpStatusCode.OK, revoke.StatusCode);
        Assert.Equal(ApiKeyStatus.Revoked, (await revoke.ReadStrictAsync<ApiKeyResponse>(Ct)).Status);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/buildings", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/api-keys/self", Ct)).StatusCode);
    }

    [Fact]
    public async Task An_expired_key_is_401()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)), lifetime: TimeSpan.FromMinutes(30));
        using var client = Harness.KeyClient(created.Token);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/api-keys/self", Ct)).StatusCode);

        Factory.Time.Advance(TimeSpan.FromMinutes(31));

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/api-keys/self", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/buildings", Ct)).StatusCode);
    }

    [Fact]
    public async Task A_banned_owner_makes_the_key_401_and_a_locked_owner_still_authenticates()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, playerId, _) = await Harness.CreatePlayerAsync();
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("profiles", ApiKeyAccess.ReadWrite)), ownerUserId: playerId);
        using var client = Harness.KeyClient(created.Token);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/api-keys/self", Ct)).StatusCode);

        await Harness.SetStatusAsync(playerId, UserStatus.Locked);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/api-keys/self", Ct)).StatusCode);

        await Harness.SetStatusAsync(playerId, UserStatus.Banned);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/api-keys/self", Ct)).StatusCode);
    }

    [Theory]
    [InlineData("bjk_nothex_x")]
    [InlineData("bjk_0123456789abcdef_wrongsecret")]
    [InlineData("bjk_")]
    public async Task A_malformed_or_unknown_key_is_401(string token)
    {
        using var client = Harness.KeyClient(token);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/buildings", Ct)).StatusCode);
    }

    [Fact]
    public async Task A_wrong_secret_for_a_real_key_id_is_401()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));
        var forged = created.Token[..^4] + "AAAA";

        using var client = Harness.KeyClient(forged);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/buildings", Ct)).StatusCode);
    }

    [Fact]
    public async Task LastUsedAt_is_written_at_most_once_a_minute()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));
        using var client = Harness.KeyClient(created.Token);
        Assert.Null(created.ApiKey.LastUsedAt);

        await client.GetAsync("/api/v1/buildings", Ct);
        var first = (await Harness.WithDbAsync(db => db.ApiKeys.AsNoTracking().SingleAsync(k => k.Id == created.ApiKey.Id, Ct))).LastUsedAt;
        Assert.NotNull(first);

        Factory.Time.Advance(TimeSpan.FromSeconds(30));
        await client.GetAsync("/api/v1/buildings", Ct);
        var second = (await Harness.WithDbAsync(db => db.ApiKeys.AsNoTracking().SingleAsync(k => k.Id == created.ApiKey.Id, Ct))).LastUsedAt;
        Assert.Equal(first, second);

        Factory.Time.Advance(TimeSpan.FromSeconds(40));
        await client.GetAsync("/api/v1/buildings", Ct);
        var third = (await Harness.WithDbAsync(db => db.ApiKeys.AsNoTracking().SingleAsync(k => k.Id == created.ApiKey.Id, Ct))).LastUsedAt;
        Assert.True(third > first);
    }

    [Fact]
    public async Task The_features_catalogue_is_public_and_marks_admin_and_world_scoped_features()
    {
        using var anonymous = Factory.CreateClient();
        var response = await anonymous.GetAsync("/api/v1/api-keys/features", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var features = await response.ReadStrictAsync<List<ApiKeyFeatureResponse>>(Ct);

        Assert.Contains(features, f => f is { Id: "settlements", WorldScoped: true, Admin: false });
        Assert.Contains(features, f => f is { Id: "chat", WorldScoped: false, Admin: false });
        Assert.Contains(features, f => f is { Id: "admin.users", WorldScoped: false, Admin: true });
        Assert.Contains(features, f => f is { Id: "admin.worlds", WorldScoped: true, Admin: true });
        Assert.All(features, f => Assert.False(string.IsNullOrWhiteSpace(f.Description)));
    }

    [Fact]
    public async Task Key_responses_serialise_enums_as_names()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var created = await admin.PostJsonAsync(
            "/api/v1/admin/api-keys",
            new ApiKeySettingsRequest(
                "Raw", null, null, ApiKeyHarness.Features(("worlds", ApiKeyAccess.ReadWrite)), true, null,
                Factory.Time.GetUtcNow().AddHours(1), null),
            Ct);
        var raw = await created.Content.ReadAsStringAsync(Ct);

        Assert.Contains("\"worlds\":\"ReadWrite\"", raw, StringComparison.Ordinal);
        Assert.Contains("\"status\":\"Active\"", raw, StringComparison.Ordinal);
    }
}
