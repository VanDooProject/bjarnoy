using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.IntegrationTests.ApiKeys;

/// <summary>
/// A key that may act as several accounts: the owner stays the default, <c>X-Act-As</c> picks one of the extra
/// accounts, and every request is evaluated as exactly that one account.
/// </summary>
public sealed class ApiKeyMultiAccountTests : ApiKeyTestBase
{
    private static async Task<string> ActingUserNameAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/v1/auth/me", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.ReadStrictAsync<UserResponse>(Ct)).UserName;
    }

    private static HttpClient ActAs(HttpClient client, string userName)
    {
        client.DefaultRequestHeaders.Remove("X-Act-As");
        client.DefaultRequestHeaders.Add("X-Act-As", userName);
        return client;
    }

    [Fact]
    public async Task Without_the_header_the_key_acts_as_its_owner_and_the_header_picks_an_extra_account_case_insensitively()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, ownerId, ownerName) = await Harness.CreatePlayerAsync();
        var (_, extraId, extraName) = await Harness.CreatePlayerAsync();
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("profiles", ApiKeyAccess.Read)), ownerId, additionalUserIds: [extraId]);

        Assert.Equal(extraName, Assert.Single(created.ApiKey.AdditionalAccounts!).UserName);

        using var client = Harness.KeyClient(created.Token);
        Assert.Equal(ownerName, await ActingUserNameAsync(client));
        Assert.Equal(extraName, await ActingUserNameAsync(ActAs(client, extraName.ToUpperInvariant())));
        Assert.Equal(ownerName, await ActingUserNameAsync(ActAs(client, ownerName)));
    }

    [Fact]
    public async Task An_account_the_key_does_not_list_is_403_and_an_unknown_one_gets_the_same_answer()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, ownerId, _) = await Harness.CreatePlayerAsync();
        var (_, extraId, _) = await Harness.CreatePlayerAsync();
        var (_, _, strangerName) = await Harness.CreatePlayerAsync();
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("profiles", ApiKeyAccess.Read)), ownerId, additionalUserIds: [extraId]);
        using var client = Harness.KeyClient(created.Token);

        var notListed = await ActAs(client, strangerName).GetAsync("/api/v1/auth/me", Ct);
        var unknown = await ActAs(client, "nobody-" + Guid.CreateVersion7().ToString("N")[..8]).GetAsync("/api/v1/auth/me", Ct);

        Assert.Equal(HttpStatusCode.Forbidden, notListed.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, unknown.StatusCode);
    }

    [Fact]
    public async Task A_banned_acting_account_is_401_while_the_other_accounts_keep_working()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, ownerId, ownerName) = await Harness.CreatePlayerAsync();
        var (_, extraId, extraName) = await Harness.CreatePlayerAsync();
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("profiles", ApiKeyAccess.Read)), ownerId, additionalUserIds: [extraId]);
        await Harness.SetStatusAsync(extraId, UserStatus.Banned);
        using var client = Harness.KeyClient(created.Token);

        Assert.Equal(HttpStatusCode.Unauthorized, (await ActAs(client, extraName).GetAsync("/api/v1/auth/me", Ct)).StatusCode);
        Assert.Equal(ownerName, await ActingUserNameAsync(ActAs(client, ownerName)));
    }

    [Fact]
    public async Task A_mixed_admin_and_player_key_gets_admin_rights_only_while_acting_as_the_admin()
    {
        var (admin, adminId, adminName) = await Harness.CreateAdminAsync();
        var (_, playerId, playerName) = await Harness.CreatePlayerAsync();
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("admin.users", ApiKeyAccess.Read)), adminId, additionalUserIds: [playerId]);
        using var client = Harness.KeyClient(created.Token);

        Assert.Equal(HttpStatusCode.OK, (await ActAs(client, adminName).GetAsync("/api/v1/admin/users", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ActAs(client, playerName).GetAsync("/api/v1/admin/users", Ct)).StatusCode);
    }

    [Fact]
    public async Task Admin_features_still_need_an_admin_owner_even_when_an_extra_account_is_an_admin()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        var (_, playerId, _) = await Harness.CreatePlayerAsync();

        var response = await admin.PostJsonAsync(
            "/api/v1/admin/api-keys",
            new ApiKeySettingsRequest(
                "k", null, playerId, ApiKeyHarness.Features(("admin.users", ApiKeyAccess.Read)), true, null,
                Factory.Time.GetUtcNow().AddHours(1), null, null, [adminId]),
            Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Extra_accounts_are_validated_banned_duplicate_owner_and_unknown_ones_are_rejected()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, ownerId, _) = await Harness.CreatePlayerAsync();
        var (_, okId, _) = await Harness.CreatePlayerAsync();
        var (_, bannedId, _) = await Harness.CreatePlayerAsync();
        await Harness.SetStatusAsync(bannedId, UserStatus.Banned);

        async Task<HttpStatusCode> Create(params Guid[] extras) =>
            (await admin.PostJsonAsync(
                "/api/v1/admin/api-keys",
                new ApiKeySettingsRequest(
                    "k", null, ownerId, ApiKeyHarness.Features(("chat", ApiKeyAccess.Read)), true, null,
                    Factory.Time.GetUtcNow().AddHours(1), null, null, extras),
                Ct)).StatusCode;

        Assert.Equal(HttpStatusCode.Created, await Create(okId));
        Assert.Equal(HttpStatusCode.BadRequest, await Create(bannedId));
        Assert.Equal(HttpStatusCode.BadRequest, await Create(okId, okId));
        Assert.Equal(HttpStatusCode.BadRequest, await Create(ownerId));
        Assert.Equal(HttpStatusCode.BadRequest, await Create(Guid.CreateVersion7()));
    }

    [Fact]
    public async Task Editing_replaces_the_extra_accounts_and_omitting_them_keeps_them()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, ownerId, _) = await Harness.CreatePlayerAsync();
        var (_, aId, _) = await Harness.CreatePlayerAsync();
        var (_, bId, _) = await Harness.CreatePlayerAsync();
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("chat", ApiKeyAccess.Read)), ownerId, additionalUserIds: [aId]);

        async Task<ApiKeyResponse> Edit(IReadOnlyList<Guid>? extras)
        {
            var response = await admin.PutAsJsonAsync(
                $"/api/v1/admin/api-keys/{created.ApiKey.Id}",
                new ApiKeySettingsRequest(
                    "k", null, null, ApiKeyHarness.Features(("chat", ApiKeyAccess.Read)), true, null,
                    Factory.Time.GetUtcNow().AddHours(1), null, null, extras),
                SqliteApiFixture.StrictJson,
                Ct);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            return await response.ReadStrictAsync<ApiKeyResponse>(Ct);
        }

        Assert.Equal([aId], (await Edit(null)).AdditionalAccounts!.Select(a => a.UserId));
        Assert.Equal([bId], (await Edit([bId])).AdditionalAccounts!.Select(a => a.UserId));
        Assert.Empty((await Edit([])).AdditionalAccounts!);
    }

    [Fact]
    public async Task Recreating_a_key_carries_its_extra_accounts()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, ownerId, _) = await Harness.CreatePlayerAsync();
        var (_, extraId, _) = await Harness.CreatePlayerAsync();
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("chat", ApiKeyAccess.Read)), ownerId, additionalUserIds: [extraId]);

        var response = await admin.PostAsync($"/api/v1/admin/api-keys/{created.ApiKey.Id}/recreate", null, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var replacement = await response.ReadStrictAsync<ApiKeyTokenResponse>(Ct);

        Assert.Equal([extraId], replacement.ApiKey.AdditionalAccounts!.Select(a => a.UserId));
    }

    [Fact]
    public async Task A_request_can_hint_extra_accounts_and_approval_resolves_them_into_the_collected_key()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, ownerId, ownerName) = await Harness.CreatePlayerAsync();
        var (_, extraId, extraName) = await Harness.CreatePlayerAsync();
        using var agent = Factory.CreateClient();

        var response = await agent.PostJsonAsync(
            "/api/v1/api-key-requests/",
            new CreateApiKeyRequestRequest(
                "Agent", null, null, null, ownerName, ApiKeyHarness.Features(("chat", ApiKeyAccess.Read)),
                true, null, 60, null, [extraName.ToUpperInvariant(), "no-such-player"]),
            Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.ReadStrictAsync<ApiKeyRequestCreatedResponse>(Ct);

        var approve = await admin.PostJsonAsync(
            $"/api/v1/admin/api-key-requests/{created.Id}/approve", new ApproveApiKeyRequestRequest(), Ct);
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);
        var approved = await approve.ReadStrictAsync<ApiKeyRequestResponse>(Ct);
        Assert.Equal(ownerId, approved.Approved!.OwnerUserId);
        Assert.Equal([extraId], approved.Approved.AdditionalAccounts.Select(a => a.UserId));

        var collected = await agent.PostJsonAsync(
            $"/api/v1/api-key-requests/{created.Id}/token", new ApiKeyTokenPollRequest(created.PollSecret), Ct);
        var token = await collected.ReadStrictAsync<ApiKeyTokenResponse>(Ct);
        Assert.Equal([extraId], token.ApiKey.AdditionalAccounts!.Select(a => a.UserId));
    }

    [Fact]
    public async Task A_renewal_keeps_the_extra_accounts_of_the_key_it_replaces()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, ownerId, _) = await Harness.CreatePlayerAsync();
        var (_, extraId, _) = await Harness.CreatePlayerAsync();
        var created = await Harness.CreateKeyAsync(
            admin,
            ApiKeyHarness.Features(("chat", ApiKeyAccess.Read)),
            ownerId,
            autoRenewUntil: Factory.Time.GetUtcNow().AddDays(1),
            additionalUserIds: [extraId]);
        using var keyClient = Harness.KeyClient(created.Token);

        var renewal = await keyClient.PostJsonAsync("/api/v1/api-key-requests/renewal", new RenewApiKeyRequest(null, null, null), Ct);
        Assert.Equal(HttpStatusCode.Created, renewal.StatusCode);
        var requested = await renewal.ReadStrictAsync<ApiKeyRequestCreatedResponse>(Ct);

        using var anon = Factory.CreateClient();
        var collected = await anon.PostJsonAsync(
            $"/api/v1/api-key-requests/{requested.Id}/token", new ApiKeyTokenPollRequest(requested.PollSecret), Ct);
        Assert.Equal(HttpStatusCode.OK, collected.StatusCode);
        var token = await collected.ReadStrictAsync<ApiKeyTokenResponse>(Ct);
        Assert.Equal([extraId], token.ApiKey.AdditionalAccounts!.Select(a => a.UserId));
    }
}
