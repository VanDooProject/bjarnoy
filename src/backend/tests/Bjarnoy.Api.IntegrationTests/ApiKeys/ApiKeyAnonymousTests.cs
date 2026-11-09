using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Api.IntegrationTests.ApiKeys;

/// <summary>Keys and account-less (anonymous) settlements: the client <c>X-Owner-Id</c> is never a key's to send.</summary>
public sealed class ApiKeyAnonymousTests : ApiKeyTestBase
{
    [Fact]
    public async Task A_key_request_cannot_prove_an_anonymous_settlement_with_a_client_owner_id_header()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var (settlement, ownerId) = await Harness.FoundAnonymousSettlementAsync(world.Id);
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("settlements", ApiKeyAccess.ReadWrite)));

        // The browser that founded it still passes the gate with its own id ...
        using var browser = Factory.CreateClient();
        browser.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
        Assert.NotEqual(
            HttpStatusCode.Forbidden,
            (await browser.PostJsonAsync($"/api/v1/settlements/{settlement.Id}/builds", new QueueBuildRequest("storagehouse", 0, 0), Ct)).StatusCode);

        // ... a key that knows the id does not.
        using var key = Harness.KeyClient(created.Token);
        key.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
        var refused = await key.PostJsonAsync($"/api/v1/settlements/{settlement.Id}/builds", new QueueBuildRequest("storagehouse", 0, 0), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        Assert.Equal("not_owner", (await refused.ReadStrictAsync<AuthErrorResponse>(Ct)).Error);
    }

    private static HttpClient ActAs(HttpClient client, string value)
    {
        client.DefaultRequestHeaders.Remove("X-Act-As");
        client.DefaultRequestHeaders.Add("X-Act-As", value);
        return client;
    }

    private static Task<HttpResponseMessage> Build(HttpClient client, Guid settlementId) =>
        client.PostJsonAsync($"/api/v1/settlements/{settlementId}/builds", new QueueBuildRequest("storagehouse", 0, 0), Ct);

    [Fact]
    public async Task A_key_acting_as_a_jarl_owns_that_anonymous_settlement_only_and_has_no_admin_rights()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var (mine, mineOwnerId) = await Harness.FoundAnonymousSettlementAsync(world.Id, "Jarl-aae5");
        var otherWorld = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("o"), 22, 60, cancellationToken: Ct);
        var (theirs, theirOwnerId) = await Harness.FoundAnonymousSettlementAsync(otherWorld.Id, "Jarl-bbb6");
        var created = await Harness.CreateKeyAsync(
            admin,
            ApiKeyHarness.Features(("settlements", ApiKeyAccess.ReadWrite), ("admin.users", ApiKeyAccess.Read)),
            adminId);
        await Harness.GrantAnonymousAsync(created.ApiKey.Id, mineOwnerId, "Jarl-aae5");
        using var client = Harness.KeyClient(created.Token);
        ActAs(client, "JARL:jarl-AAE5");

        Assert.NotEqual(HttpStatusCode.Forbidden, (await Build(client, mine.Id)).StatusCode);

        // Another anonymous settlement stays closed, even when its id is sent the way a browser would.
        client.DefaultRequestHeaders.Add("X-Owner-Id", theirOwnerId);
        Assert.Equal(HttpStatusCode.Forbidden, (await Build(client, theirs.Id)).StatusCode);

        // The admin owner's rights do not follow along.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/admin/users", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/auth/me", Ct)).StatusCode);
    }

    [Fact]
    public async Task An_unknown_jarl_label_is_403_and_the_owner_still_works_without_the_header()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var (_, ownerId, ownerName) = await Harness.CreatePlayerAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var (_, anonOwnerId) = await Harness.FoundAnonymousSettlementAsync(world.Id, "Jarl-aae5");
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("profiles", ApiKeyAccess.Read)), ownerId);
        await Harness.GrantAnonymousAsync(created.ApiKey.Id, anonOwnerId, "Jarl-aae5");
        using var client = Harness.KeyClient(created.Token);

        Assert.Equal(HttpStatusCode.Forbidden, (await ActAs(client, "jarl:Jarl-zzzz").GetAsync("/api/v1/auth/me", Ct)).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Act-As");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/me", Ct)).StatusCode);
        Assert.Contains(ownerName, await (await client.GetAsync("/api/v1/auth/me", Ct)).Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task A_claimed_anonymous_account_stops_working_instead_of_following_the_new_account()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        var (_, newOwnerId, _) = await Harness.CreatePlayerAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var (settlement, ownerId) = await Harness.FoundAnonymousSettlementAsync(world.Id, "Jarl-aae5");
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("settlements", ApiKeyAccess.ReadWrite)), adminId);
        await Harness.GrantAnonymousAsync(created.ApiKey.Id, ownerId, "Jarl-aae5");
        using var client = Harness.KeyClient(created.Token);
        ActAs(client, "jarl:Jarl-aae5");
        Assert.NotEqual(HttpStatusCode.Forbidden, (await Build(client, settlement.Id)).StatusCode);

        await Harness.WithDbAsync(async db =>
        {
            var entity = await db.Settlements.SingleAsync(s => s.Id == settlement.Id, Ct);
            entity.UserId = newOwnerId;
            await db.SaveChangesAsync(Ct);
            return 0;
        });

        Assert.Equal(HttpStatusCode.Forbidden, (await Build(client, settlement.Id)).StatusCode);
    }

    [Fact]
    public async Task A_key_whose_owner_cannot_act_uses_the_primary_anonymous_account_by_default()
    {
        var (admin, adminId, adminName) = await Harness.CreateAdminAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var (settlement, ownerId) = await Harness.FoundAnonymousSettlementAsync(world.Id, "Jarl-aae5");
        var created = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("settlements", ApiKeyAccess.ReadWrite)), adminId);
        await Harness.GrantAnonymousAsync(created.ApiKey.Id, ownerId, "Jarl-aae5", primary: true);
        await Harness.WithDbAsync(async db =>
        {
            var key = await db.ApiKeys.SingleAsync(k => k.Id == created.ApiKey.Id, Ct);
            key.OwnerCanAct = false;
            await db.SaveChangesAsync(Ct);
            return 0;
        });
        using var client = Harness.KeyClient(created.Token);

        Assert.NotEqual(HttpStatusCode.Forbidden, (await Build(client, settlement.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ActAs(client, adminName).GetAsync("/api/v1/auth/me", Ct)).StatusCode);
    }

    [Fact]
    public async Task Founding_with_a_key_acting_as_a_jarl_uses_that_identity_whatever_the_body_says()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var other = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("o"), 22, 60, cancellationToken: Ct);
        var (_, ownerId) = await Harness.FoundAnonymousSettlementAsync(other.Id, "Jarl-aae5");
        var created = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("settlements", ApiKeyAccess.ReadWrite), ("worlds", ApiKeyAccess.Read)), adminId);
        await Harness.GrantAnonymousAsync(created.ApiKey.Id, ownerId, "Jarl-aae5");
        using var client = Harness.KeyClient(created.Token);
        ActAs(client, "jarl:Jarl-aae5");

        using var plain = Factory.CreateClient();
        var islands = await plain.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];
        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Hedeby", "Jarl-aae5", "some-other-id"),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var founded = await response.ReadStrictAsync<SettlementResponse>(Ct);
        var stored = await Harness.WithDbAsync(db => db.Settlements.SingleAsync(s => s.Id == founded.Id, Ct));
        Assert.Equal(ownerId, stored.OwnerId);
    }

    // ---- admin API ----

    private Task<HttpResponseMessage> PostKey(
        HttpClient admin,
        Guid ownerId,
        Dictionary<string, ApiKeyAccess> features,
        IReadOnlyList<AnonymousAccountInput>? anonymous,
        bool? ownerCanAct = null) =>
        admin.PostJsonAsync(
            "/api/v1/admin/api-keys",
            new ApiKeySettingsRequest(
                ApiKeyHarness.Unique("key"), null, ownerId, features, true, null,
                Factory.Time.GetUtcNow().AddHours(1), null, null, null, anonymous, ownerCanAct),
            Ct);

    [Fact]
    public async Task An_admin_grants_an_anonymous_jarl_by_settlement_and_the_owner_id_never_leaves_the_backend()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var (settlement, ownerId) = await Harness.FoundAnonymousSettlementAsync(world.Id, "Jarl-aae5");

        var response = await PostKey(
            admin, adminId, ApiKeyHarness.Features(("settlements", ApiKeyAccess.ReadWrite)),
            [new AnonymousAccountInput(null, settlement.Id, true)]);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var raw = await response.Content.ReadAsStringAsync(Ct);
        Assert.DoesNotContain(ownerId, raw);
        var created = System.Text.Json.JsonSerializer.Deserialize<ApiKeyTokenResponse>(raw, SqliteApiFixture.StrictJson)!;
        var account = Assert.Single(created.ApiKey.AnonymousAccounts!);
        Assert.Equal("Jarl-aae5", account.Label);
        Assert.True(account.IsPrimary);

        using var client = Harness.KeyClient(created.Token);
        ActAs(client, "jarl:Jarl-aae5");
        Assert.NotEqual(HttpStatusCode.Forbidden, (await Build(client, settlement.Id)).StatusCode);

        var listed = await (await admin.GetAsync("/api/v1/admin/api-keys", Ct)).ReadStrictAsync<List<ApiKeyResponse>>(Ct);
        var listedAccount = Assert.Single(Assert.Single(listed, k => k.Id == created.ApiKey.Id).AnonymousAccounts!);
        Assert.Equal(world.Name, listedAccount.WorldName);
        Assert.False(listedAccount.Claimed);
    }

    [Fact]
    public async Task Granting_validates_account_holders_owner_can_act_and_admin_features()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        var (_, playerId, _) = await Harness.CreatePlayerAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var (anonymous, _) = await Harness.FoundAnonymousSettlementAsync(world.Id, "Jarl-aae5");
        var claimedWorld = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("c"), 22, 60, cancellationToken: Ct);
        var (claimed, _) = await Harness.FoundAnonymousSettlementAsync(claimedWorld.Id, "Jarl-ccc3");
        await Harness.WithDbAsync(async db =>
        {
            (await db.Settlements.SingleAsync(s => s.Id == claimed.Id, Ct)).UserId = playerId;
            await db.SaveChangesAsync(Ct);
            return 0;
        });
        var features = ApiKeyHarness.Features(("settlements", ApiKeyAccess.Read));

        // A settlement that has an account is added as that account, not as an anonymous one.
        Assert.Equal(HttpStatusCode.BadRequest, (await PostKey(admin, adminId, features, [new(null, claimed.Id)])).StatusCode);
        // A sponsor-only key needs an anonymous account and cannot hold admin features.
        Assert.Equal(HttpStatusCode.BadRequest, (await PostKey(admin, adminId, features, [], ownerCanAct: false)).StatusCode);
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await PostKey(admin, adminId, ApiKeyHarness.Features(("admin.users", ApiKeyAccess.Read)), [new(null, anonymous.Id)], ownerCanAct: false)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await PostKey(admin, adminId, features, [new(null, anonymous.Id)], ownerCanAct: false)).StatusCode);
    }

    [Fact]
    public async Task Two_jarls_with_the_same_nickname_get_distinct_labels_from_their_settlement_names()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var other = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("o"), 22, 60, cancellationToken: Ct);
        var (a, _) = await Harness.FoundAnonymousSettlementAsync(world.Id, "Jarl-aae5");
        var (b, _) = await Harness.FoundAnonymousSettlementAsync(other.Id, "Jarl-aae5");

        var response = await PostKey(
            admin, adminId, ApiKeyHarness.Features(("settlements", ApiKeyAccess.Read)),
            [new(null, a.Id), new(null, b.Id)]);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var labels = (await response.ReadStrictAsync<ApiKeyTokenResponse>(Ct)).ApiKey.AnonymousAccounts!.Select(x => x.Label).ToList();
        Assert.Equal(2, labels.Distinct(StringComparer.OrdinalIgnoreCase).Count());
        Assert.All(labels, l => Assert.StartsWith("Jarl-aae5 (", l));
    }

    [Fact]
    public async Task Editing_keeps_replaces_or_clears_anonymous_accounts_and_recreate_and_renewal_carry_them()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var other = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("o"), 22, 60, cancellationToken: Ct);
        var (a, _) = await Harness.FoundAnonymousSettlementAsync(world.Id, "Jarl-aaaa");
        var (b, _) = await Harness.FoundAnonymousSettlementAsync(other.Id, "Jarl-bbbb");
        var features = ApiKeyHarness.Features(("settlements", ApiKeyAccess.Read));
        var created = await (await PostKey(admin, adminId, features, [new(null, a.Id)])).ReadStrictAsync<ApiKeyTokenResponse>(Ct);

        async Task<ApiKeyResponse> Edit(IReadOnlyList<AnonymousAccountInput>? anonymous)
        {
            var response = await admin.PutAsJsonAsync(
                $"/api/v1/admin/api-keys/{created.ApiKey.Id}",
                new ApiKeySettingsRequest(
                    "k", null, null, features, true, null, Factory.Time.GetUtcNow().AddHours(1),
                    null, null, null, anonymous, null),
                SqliteApiFixture.StrictJson,
                Ct);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            return await response.ReadStrictAsync<ApiKeyResponse>(Ct);
        }

        Assert.Equal(["Jarl-aaaa"], (await Edit(null)).AnonymousAccounts!.Select(x => x.Label));
        Assert.Equal(["Jarl-bbbb"], (await Edit([new(null, b.Id)])).AnonymousAccounts!.Select(x => x.Label));
        Assert.Empty((await Edit([])).AnonymousAccounts!);
        Assert.Equal(["Jarl-bbbb"], (await Edit([new(null, b.Id)])).AnonymousAccounts!.Select(x => x.Label));

        var recreated = await (await admin.PostAsync($"/api/v1/admin/api-keys/{created.ApiKey.Id}/recreate", null, Ct))
            .ReadStrictAsync<ApiKeyTokenResponse>(Ct);
        Assert.Equal(["Jarl-bbbb"], recreated.ApiKey.AnonymousAccounts!.Select(x => x.Label));
    }

    [Fact]
    public async Task A_renewal_keeps_the_anonymous_accounts_of_the_key_it_replaces()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        var (a, _) = await Harness.FoundAnonymousSettlementAsync(world.Id, "Jarl-aaaa");
        var response = await admin.PostJsonAsync(
            "/api/v1/admin/api-keys",
            new ApiKeySettingsRequest(
                "k", null, adminId, ApiKeyHarness.Features(("settlements", ApiKeyAccess.Read)), true, null,
                Factory.Time.GetUtcNow().AddHours(1), null, Factory.Time.GetUtcNow().AddDays(1), null, [new(null, a.Id)], null),
            Ct);
        var created = await response.ReadStrictAsync<ApiKeyTokenResponse>(Ct);
        using var keyClient = Harness.KeyClient(created.Token);

        var renewal = await keyClient.PostJsonAsync("/api/v1/api-key-requests/renewal", new RenewApiKeyRequest(null, null, null), Ct);
        var requested = await renewal.ReadStrictAsync<ApiKeyRequestCreatedResponse>(Ct);
        using var anon = Factory.CreateClient();
        var collected = await anon.PostJsonAsync(
            $"/api/v1/api-key-requests/{requested.Id}/token", new ApiKeyTokenPollRequest(requested.PollSecret), Ct);

        Assert.Equal(HttpStatusCode.OK, collected.StatusCode);
        Assert.Equal(["Jarl-aaaa"], (await collected.ReadStrictAsync<ApiKeyTokenResponse>(Ct)).ApiKey.AnonymousAccounts!.Select(x => x.Label));
    }
}
