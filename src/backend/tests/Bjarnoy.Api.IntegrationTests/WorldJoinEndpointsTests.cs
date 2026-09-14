using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The player-facing "join another world" surface: <c>GET /api/v1/worlds/joinable</c>
/// (browsing worlds to join, anonymous — see <see cref="JoinableWorldResponse"/>)
/// and <c>GET /api/v1/worlds/{id}/membership</c> (whether the requesting owner
/// already has a settlement there).
/// </summary>
public sealed class WorldJoinEndpointsTests(SqliteApiFixture fixture) : IClassFixture<SqliteApiFixture>
{
    private readonly SqliteApiFixture _fixture = fixture;

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string UniqueName(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

    private async Task<WorldResponse> CreateWorldAsync(
        HttpClient client, int seed = 4242, int radius = 30, int maxPlayers = 100)
    {
        var response = await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(UniqueName("world"), seed, radius, maxPlayers), Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<WorldResponse>(Ct);
    }

    /// <summary>Registers a fresh player, promotes it to Admin in the DB, then logs in to mint a token carrying the role.</summary>
    private async Task<string> CreateAdminTokenAsync(HttpClient client)
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
        return (await loggedIn.ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
    }

    /// <summary>Founds a settlement (one longhouse) on <paramref name="world"/>'s first usable plot, under <paramref name="ownerId"/>.</summary>
    private async Task<SettlementResponse> FoundSettlementAsync(HttpClient client, WorldResponse world, string ownerId)
    {
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<SettlementResponse>(Ct);
    }

    [Fact]
    public async Task Joinable_worlds_omit_seed_generation_and_radius()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);

        var response = await client.GetAsync("/api/v1/worlds/joinable", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Strict deserialisation into JoinableWorldResponse: an extra property
        // in the JSON (seed, radius, generation, ...) fails the test — this is
        // the type-level guarantee that the response genuinely doesn't carry
        // map-reproducing data, not just that the record's own declared shape
        // happens to omit it.
        var worlds = await response.ReadStrictAsync<IReadOnlyList<JoinableWorldResponse>>(Ct);
        var listed = Assert.Single(worlds, w => w.Id == world.Id);

        Assert.Equal(world.Name, listed.Name);
        Assert.Equal(world.MaxPlayers, listed.MaxPlayers);
        Assert.True(listed.Joinable);
        Assert.Equal("none", listed.JoinableReason);

        // Belt-and-braces: the raw body itself must not mention any of the
        // fields JoinableWorldResponse deliberately drops, in case a future
        // change reintroduces one under a different casing StrictJson wouldn't
        // otherwise have caught.
        var body = await response.Content.ReadAsStringAsync(Ct);
        Assert.DoesNotContain("\"seed\"", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"radius\"", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"generation\"", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task A_world_with_joins_closed_is_reported_unjoinable_with_reason()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var patched = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(SpeedFactor: null, JoinsClosed: true),
            Ct);
        Assert.Equal(HttpStatusCode.OK, patched.StatusCode);

        client.DefaultRequestHeaders.Authorization = null;
        var response = await client.GetAsync("/api/v1/worlds/joinable", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var worlds = await response.ReadStrictAsync<IReadOnlyList<JoinableWorldResponse>>(Ct);
        var listed = Assert.Single(worlds, w => w.Id == world.Id);

        Assert.False(listed.Joinable);
        Assert.Equal("joinsclosed", listed.JoinableReason);
    }

    [Fact]
    public async Task Membership_reports_the_settlement_for_a_founder_and_null_for_a_stranger()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        var ownerId = UniqueName("owner");
        var settlement = await FoundSettlementAsync(client, world, ownerId);

        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
        var founderResponse = await client.GetAsync($"/api/v1/worlds/{world.Id}/membership", Ct);
        Assert.Equal(HttpStatusCode.OK, founderResponse.StatusCode);
        var founderMembership = await founderResponse.ReadStrictAsync<WorldMembershipResponse>(Ct);

        Assert.Equal(world.Id, founderMembership.WorldId);
        Assert.Equal(settlement.Id.ToString(), founderMembership.SettlementId);
        Assert.Equal(settlement.Name, founderMembership.SettlementName);

        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", UniqueName("stranger"));
        var strangerResponse = await client.GetAsync($"/api/v1/worlds/{world.Id}/membership", Ct);
        Assert.Equal(HttpStatusCode.OK, strangerResponse.StatusCode);
        var strangerMembership = await strangerResponse.ReadStrictAsync<WorldMembershipResponse>(Ct);

        Assert.Equal(world.Id, strangerMembership.WorldId);
        Assert.Null(strangerMembership.SettlementId);
        Assert.Null(strangerMembership.SettlementName);
    }

    [Fact]
    public async Task Membership_without_the_owner_header_is_a_400()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);

        var response = await client.GetAsync($"/api/v1/worlds/{world.Id}/membership", Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Membership_of_an_unknown_world_is_a_404()
    {
        using var client = _fixture.CreateClient();
        client.DefaultRequestHeaders.Add("X-Owner-Id", UniqueName("owner"));

        var response = await client.GetAsync($"/api/v1/worlds/{Guid.CreateVersion7()}/membership", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    /// <summary>
    /// The core premise of "join another world": founding is scoped by
    /// <c>(worldId, ownerId)</c> (<see cref="Bjarnoy.Infrastructure.Services.SettlementService.FoundAsync"/>),
    /// so the same client-local id can hold a settlement in more than one
    /// world at once. Nothing else currently asserts this — a future change
    /// that accidentally scoped founding by owner alone would silently break
    /// the feature this whole endpoint pair exists for.
    /// </summary>
    [Fact]
    public async Task The_same_owner_can_found_in_two_different_worlds()
    {
        using var client = _fixture.CreateClient();
        var ownerId = UniqueName("owner");

        var firstWorld = await CreateWorldAsync(client, seed: 11, radius: 30);
        var firstSettlement = await FoundSettlementAsync(client, firstWorld, ownerId);

        var secondWorld = await CreateWorldAsync(client, seed: 12, radius: 30);
        var secondSettlement = await FoundSettlementAsync(client, secondWorld, ownerId);

        Assert.NotEqual(firstSettlement.Id, secondSettlement.Id);

        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);

        var firstMembership = await (await client.GetAsync(
            $"/api/v1/worlds/{firstWorld.Id}/membership", Ct)).ReadStrictAsync<WorldMembershipResponse>(Ct);
        var secondMembership = await (await client.GetAsync(
            $"/api/v1/worlds/{secondWorld.Id}/membership", Ct)).ReadStrictAsync<WorldMembershipResponse>(Ct);

        Assert.Equal(firstSettlement.Id.ToString(), firstMembership.SettlementId);
        Assert.Equal(secondSettlement.Id.ToString(), secondMembership.SettlementId);
    }

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
}
