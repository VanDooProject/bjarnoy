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

/// <summary>Training per building through HTTP: the building coordinate, the split modes and the response shape.</summary>
public sealed class TrainingSplitEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    /// <summary>A player's settlement with plenty of stock and two Barracks: level 1 and level 3.</summary>
    private async Task<(HttpClient Client, Guid SettlementId, Guid UserId, (int Q, int R) Low, (int Q, int R) High)> SetUpAsync()
    {
        var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var ownerId = Unique("local-owner-");
        var settlement = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);
        var player = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("ulf-"), "correct-horse-battery", ownerId), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);

        var adminName = Unique("admin");
        var admin = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(adminName, "correct-horse-battery"), Ct)).ReadStrictAsync<AuthResponse>(Ct);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            (await db.Users.SingleAsync(u => u.Id == admin.User.Id, Ct)).Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var adminToken = (await (await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(adminName, "correct-horse-battery"), Ct)).ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
        Authorize(client, adminToken);
        await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/resources",
            new GrantResourcesRequest(Wood: 1_000_000, Stone: 1_000_000, Food: 1_000_000, Iron: 1_000_000), Ct);

        var layout = await client.GetFromJsonAsync<AdminSettlementLayoutResponse>(
            $"/api/v1/admin/settlements/{settlement.Id}/layout", SqliteApiFixture.StrictJson, Ct);
        var hexes = layout!.Hexes.Where(h => !h.IsCentre && h.Building is null && (h.Terrain == "grass" || h.Terrain == "sand")).Take(2).ToList();
        await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/buildings/{hexes[0].Q}/{hexes[0].R}", new PlaceBuildingRequest("barracks", 1), Ct);
        await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/buildings/{hexes[1].Q}/{hexes[1].R}", new PlaceBuildingRequest("barracks", 3), Ct);

        Authorize(client, player.AccessToken);
        return (client, settlement.Id, player.User.Id, (hexes[0].Q, hexes[0].R), (hexes[1].Q, hexes[1].R));
    }

    private async Task SetPremiumAsync(Guid userId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        (await db.Users.SingleAsync(u => u.Id == userId, Ct)).IsPremium = true;
        await db.SaveChangesAsync(Ct);
    }

    [Fact]
    public async Task Training_here_returns_one_part_tagged_with_the_building()
    {
        var (client, settlementId, _, low, _) = await SetUpAsync();
        using var _ = client;

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/units", new TrainUnitsRequest("thrall", 3, low.Q, low.R), Ct);

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var part = Assert.Single((await response.ReadStrictAsync<TrainUnitsResponse>(Ct)).Orders);
        Assert.Equal((low.Q, low.R), (part.Q, part.R));
        Assert.Equal(3, part.Count);
        Assert.Equal(0, part.StartsInSeconds);
        Assert.Equal(part.TotalSeconds, part.CompletesInSeconds!.Value, 3);
    }

    [Fact]
    public async Task A_second_order_in_the_same_building_starts_when_the_first_is_done()
    {
        var (client, settlementId, _, low, _) = await SetUpAsync();
        using var _ = client;
        var first = Assert.Single((await (await client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/units", new TrainUnitsRequest("thrall", 2, low.Q, low.R), Ct))
            .ReadStrictAsync<TrainUnitsResponse>(Ct)).Orders);

        var second = Assert.Single((await (await client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/units", new TrainUnitsRequest("thrall", 1, low.Q, low.R), Ct))
            .ReadStrictAsync<TrainUnitsResponse>(Ct)).Orders);

        Assert.Equal(first.CompletesAtGameTime, second.StartsAtGameTime);
        Assert.True(second.StartsInSeconds > 0);

        var settlement = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlementId}", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(2, settlement!.TrainingQueue.Count(o => (o.Q, o.R) == (low.Q, low.R)));
    }

    [Fact]
    public async Task Evenly_gives_the_extra_unit_to_the_higher_level_building()
    {
        var (client, settlementId, _, low, high) = await SetUpAsync();
        using var _ = client;

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/units", new TrainUnitsRequest("thrall", 5, low.Q, low.R, "evenly"), Ct);

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var orders = (await response.ReadStrictAsync<TrainUnitsResponse>(Ct)).Orders;
        Assert.Equal(3, orders.Single(o => (o.Q, o.R) == (high.Q, high.R)).Count);
        Assert.Equal(2, orders.Single(o => (o.Q, o.R) == (low.Q, low.R)).Count);
    }

    [Fact]
    public async Task Fastest_needs_premium_and_then_splits_the_order()
    {
        var (client, settlementId, userId, low, high) = await SetUpAsync();
        using var _ = client;
        var request = new TrainUnitsRequest("thrall", 6, low.Q, low.R, "fastest");

        var refused = await client.PostJsonAsync($"/api/v1/settlements/{settlementId}/units", request, Ct);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("PremiumRequired", await refused.RejectionAsync(Ct));

        await SetPremiumAsync(userId);
        var accepted = await client.PostJsonAsync($"/api/v1/settlements/{settlementId}/units", request, Ct);

        Assert.Equal(HttpStatusCode.Accepted, accepted.StatusCode);
        var orders = (await accepted.ReadStrictAsync<TrainUnitsResponse>(Ct)).Orders;
        Assert.Equal(6, orders.Sum(o => o.Count));
        Assert.True(orders.Single(o => (o.Q, o.R) == (high.Q, high.R)).Count >= orders.Single(o => (o.Q, o.R) == (low.Q, low.R)).Count);
    }

    [Fact]
    public async Task Training_on_a_hex_without_the_right_building_is_refused()
    {
        var (client, settlementId, _, _, _) = await SetUpAsync();
        using var _ = client;

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/units", new TrainUnitsRequest("thrall", 1, 99, 99), Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("WrongBuilding", await response.RejectionAsync(Ct));
    }

    [Fact]
    public async Task An_unknown_split_is_a_bad_request()
    {
        var (client, settlementId, _, low, _) = await SetUpAsync();
        using var _ = client;

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/units", new TrainUnitsRequest("thrall", 1, low.Q, low.R, "sideways"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
