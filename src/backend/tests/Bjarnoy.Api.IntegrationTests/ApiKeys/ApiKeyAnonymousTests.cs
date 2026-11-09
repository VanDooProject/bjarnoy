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
}
