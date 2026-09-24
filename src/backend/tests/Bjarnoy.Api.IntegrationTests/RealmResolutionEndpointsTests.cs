using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <see cref="Bjarnoy.Api.Auth.CallerRealmResolver"/>: whether
/// <c>GET .../membership</c>, <c>.../fog-mask</c> and <c>.../plot-suggestion</c>
/// (GET and DELETE) resolve the right realm once accounts and JWTs enter the
/// anonymous-play picture that <c>X-Owner-Id</c> alone used to be enough for —
/// a claimed player logging in from a browser that never founded anything
/// (problem 1), and a bare client-local id no longer being trusted for a realm
/// someone else has since claimed (problem 2).
/// </summary>
public sealed class RealmResolutionEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private HttpClient Client() => _factory.CreateClient();

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

    private async Task<Guid> CreateWorldAsync(HttpClient client, int seed = 21, int radius = 60)
    {
        var world = await (await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), seed, radius), Ct))
            .ReadStrictAsync<WorldResponse>(Ct);
        return world.Id;
    }

    /// <summary>Founds a settlement on the world's first usable plot, under <paramref name="ownerId"/>, via the anonymous header.</summary>
    private async Task<SettlementResponse> FoundAsync(HttpClient client, Guid worldId, string ownerId)
    {
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldId}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<SettlementResponse>(Ct);
    }

    /// <summary>Registers a fresh account, optionally claiming every unclaimed settlement founded under <paramref name="existingOwnerId"/>.</summary>
    private async Task<AuthResponse> RegisterAsync(HttpClient client, string? existingOwnerId = null)
    {
        var response = await client.PostJsonAsync(
            "/api/v1/auth/register",
            new RegisterRequest(Unique("player"), "correct-horse-battery", existingOwnerId),
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.ReadStrictAsync<AuthResponse>(Ct);
    }

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    [Fact]
    public async Task New_browser_login_with_JWT_finds_membership_even_under_a_different_header()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var foundingOwnerId = Unique("owner");

        client.DefaultRequestHeaders.Add("X-Owner-Id", foundingOwnerId);
        var settlement = await FoundAsync(client, worldId, foundingOwnerId);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");

        var auth = await RegisterAsync(client, foundingOwnerId);
        Authorize(client, auth.AccessToken);

        // A brand-new browser's own local id — nothing this world has ever
        // seen — proving the JWT alone is what resolves the realm.
        client.DefaultRequestHeaders.Add("X-Owner-Id", Unique("new-browser"));

        var response = await client.GetAsync($"/api/v1/worlds/{worldId}/membership", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var membership = await response.ReadStrictAsync<WorldMembershipResponse>(Ct);

        Assert.Equal(settlement.Id.ToString(), membership.SettlementId);
        Assert.Equal(settlement.Name, membership.SettlementName);
    }

    [Fact]
    public async Task New_browser_login_with_JWT_and_no_header_finds_membership()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var foundingOwnerId = Unique("owner");

        client.DefaultRequestHeaders.Add("X-Owner-Id", foundingOwnerId);
        var settlement = await FoundAsync(client, worldId, foundingOwnerId);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");

        var auth = await RegisterAsync(client, foundingOwnerId);
        Authorize(client, auth.AccessToken);

        // No X-Owner-Id header at all — the JWT alone must be enough.
        var response = await client.GetAsync($"/api/v1/worlds/{worldId}/membership", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var membership = await response.ReadStrictAsync<WorldMembershipResponse>(Ct);

        Assert.Equal(settlement.Id.ToString(), membership.SettlementId);
    }

    [Fact]
    public async Task A_claimed_realms_header_alone_no_longer_proves_ownership_for_reads()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var foundingOwnerId = Unique("owner");

        client.DefaultRequestHeaders.Add("X-Owner-Id", foundingOwnerId);
        await FoundAsync(client, worldId, foundingOwnerId);

        // Claim it from a different client (a different account, own header) —
        // this client keeps presenting only the bare, now-claimed local id.
        using (var registrar = Client())
        {
            await RegisterAsync(registrar, foundingOwnerId);
        }

        var membership = await client.GetAsync($"/api/v1/worlds/{worldId}/membership", Ct);
        Assert.Equal(HttpStatusCode.OK, membership.StatusCode);
        var membershipBody = await membership.ReadStrictAsync<WorldMembershipResponse>(Ct);
        Assert.Null(membershipBody.SettlementId);
        Assert.Null(membershipBody.SettlementName);

        var fogMask = await client.GetAsync($"/api/v1/worlds/{worldId}/fog-mask", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, fogMask.StatusCode);
        var fogMaskError = await fogMask.ReadStrictAsync<AuthErrorResponse>(Ct);
        Assert.Equal("not_owner", fogMaskError.Error);

        var plotSuggestion = await client.GetAsync($"/api/v1/worlds/{worldId}/plot-suggestion", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, plotSuggestion.StatusCode);
        var plotSuggestionError = await plotSuggestion.ReadStrictAsync<AuthErrorResponse>(Ct);
        Assert.Equal("not_owner", plotSuggestionError.Error);
    }

    /// <summary>
    /// Warms <see cref="Bjarnoy.Infrastructure.Services.RealmDirectory"/>'s
    /// cache with the unclaimed realm (a header-only membership read) before
    /// registering claims it — proves <c>AuthService.RegisterAsync</c>
    /// actually invalidates the world rather than leaving the earlier,
    /// now-stale "unclaimed" cache entry to keep answering for up to its
    /// sliding-expiration window.
    /// </summary>
    [Fact]
    public async Task Claiming_a_settlement_invalidates_its_already_cached_unclaimed_realm()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var foundingOwnerId = Unique("owner");

        client.DefaultRequestHeaders.Add("X-Owner-Id", foundingOwnerId);
        var settlement = await FoundAsync(client, worldId, foundingOwnerId);

        // Warms the cache: an unclaimed realm found under this owner id.
        var beforeClaim = await client.GetAsync($"/api/v1/worlds/{worldId}/membership", Ct);
        Assert.Equal(HttpStatusCode.OK, beforeClaim.StatusCode);
        var beforeClaimBody = await beforeClaim.ReadStrictAsync<WorldMembershipResponse>(Ct);
        Assert.Equal(settlement.Id.ToString(), beforeClaimBody.SettlementId);

        using (var registrar = Client())
        {
            await RegisterAsync(registrar, foundingOwnerId);
        }

        // Same header-only client as before the claim: must now see nothing,
        // not the stale cached "unclaimed, mine" answer.
        var afterClaim = await client.GetAsync($"/api/v1/worlds/{worldId}/membership", Ct);
        Assert.Equal(HttpStatusCode.OK, afterClaim.StatusCode);
        var afterClaimBody = await afterClaim.ReadStrictAsync<WorldMembershipResponse>(Ct);
        Assert.Null(afterClaimBody.SettlementId);
        Assert.Null(afterClaimBody.SettlementName);
    }

    [Fact]
    public async Task Founding_while_logged_in_claims_the_new_settlement_immediately()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);

        var auth = await RegisterAsync(client);
        Authorize(client, auth.AccessToken);

        // A local id this account has never used before — founding itself
        // must be what claims the settlement, with no separate register call.
        var founderOwnerId = Unique("founder");
        client.DefaultRequestHeaders.Add("X-Owner-Id", founderOwnerId);
        var settlement = await FoundAsync(client, worldId, founderOwnerId);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");

        // A different local id, same JWT: membership must resolve via the
        // account, not the header, proving the settlement really is claimed.
        client.DefaultRequestHeaders.Add("X-Owner-Id", Unique("elsewhere"));
        var membership = await client.GetAsync($"/api/v1/worlds/{worldId}/membership", Ct);
        Assert.Equal(HttpStatusCode.OK, membership.StatusCode);
        var membershipBody = await membership.ReadStrictAsync<WorldMembershipResponse>(Ct);

        Assert.Equal(settlement.Id.ToString(), membershipBody.SettlementId);
    }

    [Fact]
    public async Task Fog_mask_via_JWT_from_a_new_browser_resolves_to_the_original_owner()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        var foundingOwnerId = Unique("owner");

        client.DefaultRequestHeaders.Add("X-Owner-Id", foundingOwnerId);
        await FoundAsync(client, worldId, foundingOwnerId);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");

        var auth = await RegisterAsync(client, foundingOwnerId);
        Authorize(client, auth.AccessToken);
        client.DefaultRequestHeaders.Add("X-Owner-Id", Unique("new-browser"));

        var response = await client.GetAsync($"/api/v1/worlds/{worldId}/fog-mask", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/png", response.Content.Headers.ContentType?.MediaType);
    }
}
