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
/// The admin settlement god-mode surface (issue #30): the 401/403 matrix,
/// search/detail, resource grants (settle-first, signed delta), and setting a
/// placed building's level directly (settle-first, rate recalculation).
/// </summary>
public sealed class AdminSettlementEndpointsTests : IAsyncLifetime
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

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    /// <summary>Registers a fresh player, promotes it to Admin in the DB, then logs in to mint a token carrying the role.</summary>
    private async Task<string> CreateAdminTokenAsync(HttpClient client)
    {
        var userName = Unique("admin");
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);

        await using (var scope = _factory.Services.CreateAsyncScope())
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

    private async Task<string> CreatePlayerTokenAsync(HttpClient client)
    {
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("player"), "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        return (await registered.ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
    }

    /// <summary>Creates a world and founds a settlement on its first usable plot.</summary>
    private async Task<(Guid WorldId, SettlementResponse Settlement)> FoundAsync(
        HttpClient client, string ownerName = "Ulf", int seed = 21, int radius = 60)
    {
        var world = await (await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), seed, radius), Ct))
            .ReadStrictAsync<WorldResponse>(Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);

        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", ownerName, $"{ownerName}-player"),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (world.Id, await response.ReadStrictAsync<SettlementResponse>(Ct));
    }

    [Fact]
    public async Task Anonymous_and_player_callers_are_refused_the_admin_settlements_surface()
    {
        using var anonymous = Client();
        var anonymousResponse = await anonymous.GetAsync("/api/v1/admin/settlements", Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousResponse.StatusCode);

        using var player = Client();
        Authorize(player, await CreatePlayerTokenAsync(player));

        var playerResponse = await player.GetAsync("/api/v1/admin/settlements", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, playerResponse.StatusCode);
    }

    [Fact]
    public async Task Admin_can_search_settlements_by_world_and_owner()
    {
        using var client = Client();
        var (worldId, settlement) = await FoundAsync(client, ownerName: "Ragnar");
        Authorize(client, await CreateAdminTokenAsync(client));

        var byWorld = await client.GetFromJsonAsync<PagedAdminSettlementsResponse>(
            $"/api/v1/admin/settlements?worldId={worldId}", SqliteApiFixture.StrictJson, Ct);
        Assert.Single(byWorld!.Items, s => s.Id == settlement.Id);

        var byOwner = await client.GetFromJsonAsync<PagedAdminSettlementsResponse>(
            "/api/v1/admin/settlements?owner=ragnar", SqliteApiFixture.StrictJson, Ct);
        Assert.Contains(byOwner!.Items, s => s.Id == settlement.Id);
    }

    [Fact]
    public async Task Admin_get_returns_the_settlement_with_stocks_settled_to_now()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        var rate = settlement.Resources.RatePerHour.Food;
        _factory.Time.Advance(TimeSpan.FromHours(4));

        // Minted after the time advance, so the token's own lifetime isn't
        // what expires here.
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.GetAsync($"/api/v1/admin/settlements/{settlement.Id}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var detail = await response.ReadStrictAsync<SettlementResponse>(Ct);

        Assert.Equal(settlement.Resources.Stock.Food + (rate * 4), detail.Resources.Stock.Food, 0);
    }

    [Fact]
    public async Task Granting_resources_settles_accrued_production_first()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        var rate = settlement.Resources.RatePerHour.Wood;
        // Two hours of production accrue before the admin's grant lands, so the
        // grant must not silently discard or overwrite it.
        _factory.Time.Advance(TimeSpan.FromHours(2));

        // Minted after the time advance, so the token's own lifetime isn't
        // what expires here.
        Authorize(client, await CreateAdminTokenAsync(client));

        // Small enough that the grant lands well under capacity, so the
        // assertion is exercising settle-then-add rather than the capacity
        // clamp (that is covered separately, by the negative-delta test).
        var response = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/resources",
            new GrantResourcesRequest(Wood: 50), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var granted = await response.ReadStrictAsync<SettlementResponse>(Ct);

        Assert.Equal(settlement.Resources.Stock.Wood + (rate * 2) + 50, granted.Resources.Stock.Wood, 0);
    }

    [Fact]
    public async Task Granting_a_negative_delta_removes_resources_but_never_below_zero()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/resources",
            new GrantResourcesRequest(Wood: -1_000_000), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var granted = await response.ReadStrictAsync<SettlementResponse>(Ct);
        Assert.Equal(0, granted.Resources.Stock.Wood, 0);
    }

    [Fact]
    public async Task Granting_resources_to_an_unknown_settlement_is_a_404()
    {
        using var client = Client();
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{Guid.CreateVersion7()}/resources",
            new GrantResourcesRequest(Wood: 100), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Setting_a_buildings_level_recomputes_production_like_a_normal_completion()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        // The longhouse itself, standing at the settlement's centre.
        var response = await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/buildings/{settlement.Q}/{settlement.R}/level",
            new SetBuildingLevelRequest(4), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.ReadStrictAsync<SettlementResponse>(Ct);

        Assert.Equal(4, updated.LonghouseLevel);
        Assert.True(updated.Resources.RatePerHour.Food > settlement.Resources.RatePerHour.Food);
    }

    [Fact]
    public async Task Setting_the_level_on_a_hex_with_no_building_is_a_validation_error()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/buildings/{settlement.Q + 5}/{settlement.R + 5}/level",
            new SetBuildingLevelRequest(2), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Setting_a_level_beyond_the_catalogues_range_is_a_validation_error()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/buildings/{settlement.Q}/{settlement.R}/level",
            new SetBuildingLevelRequest(999), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Setting_a_level_on_an_unknown_settlement_is_a_404()
    {
        using var client = Client();
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{Guid.CreateVersion7()}/buildings/0/0/level",
            new SetBuildingLevelRequest(2), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
