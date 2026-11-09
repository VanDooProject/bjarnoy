using System.Net;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.AspNetCore.Mvc;

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
}
