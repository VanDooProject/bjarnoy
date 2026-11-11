using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <c>GET /worlds/{id}/rival-buildings</c>: every building of another player's settlement, standing or under construction (level 0), that
/// stands on a hex the caller has explored, whatever its type. A hex the caller has not explored is never listed, and the caller's own buildings are left out.
/// </summary>
public sealed class RivalBuildingsEndpointsTests : IAsyncLifetime
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

    private async Task<(Guid WorldId, SettlementResponse Own, string Owner, HttpClient Client)> SetUpAsync()
    {
        var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 80, cancellationToken: Ct);
        var owner = Unique("owner");
        client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];
        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", owner), Ct);
        return (world.Id, await response.ReadStrictAsync<SettlementResponse>(Ct), owner, client);
    }

    private async Task<Guid> PlantAsync(
        Guid worldId, Guid islandId, Guid userId, int centreQ, int centreR, params (int Q, int R, BuildingType Type, int Level)[] walls)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            UserId = userId,
            Name = Unique("rival"),
            OwnerName = "Rival",
            OwnerId = Unique("rival-owner"),
            CentreQ = centreQ,
            CentreR = centreR,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = [new PlacedBuildingEntity { Q = centreQ, R = centreR, Type = BuildingType.Longhouse, Level = 1 }],
        };
        foreach (var (q, r, type, level) in walls)
        {
            settlement.Buildings.Add(new PlacedBuildingEntity { Q = q, R = r, Type = type, Level = level });
        }

        db.Settlements.Add(settlement);
        await db.SaveChangesAsync(Ct);
        return settlement.Id;
    }

    private async Task<Guid> RegisterUserAsync()
    {
        using var client = _factory.CreateClient();
        var response = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("player"), "correct-horse-battery", null), Ct);
        var auth = await response.ReadStrictAsync<AuthResponse>(Ct);
        return auth.User.Id;
    }

    private static Task<List<WallResponse>?> WallsAsync(HttpClient client, Guid worldId) =>
        client.GetFromJsonAsync<List<WallResponse>>($"/api/v1/worlds/{worldId}/walls", SqliteApiFixture.StrictJson, Ct);

    private static Task<List<RivalBuildingResponse>?> BuildingsAsync(HttpClient client, Guid worldId) =>
        client.GetFromJsonAsync<List<RivalBuildingResponse>>($"/api/v1/worlds/{worldId}/rival-buildings", SqliteApiFixture.StrictJson, Ct);

    [Fact]
    public async Task Lists_only_the_visible_hexes_of_a_rival_and_its_longhouse_whose_claim_reaches_them_with_type_level_and_owner()
    {
        var (worldId, own, owner, client) = await SetUpAsync();
        using var _ = client;
        var rivalUser = await RegisterUserAsync();
        var seen = new HexCoord(own.Q + 19, own.R);
        var rivalId = await PlantAsync(
            worldId, own.IslandId, rivalUser, own.Q + 20, own.R,
            (seen.Q, seen.R, BuildingType.Farm, 2),
            (own.Q + 26, own.R, BuildingType.Farm, 1));
        await _factory.SeedExploredHexesAsync(worldId, owner, [seen], Ct);

        var buildings = (await BuildingsAsync(client, worldId))!;

        // The farm on the explored hex, plus the Longhouse next to it (inside its 5.55-hex fringe); the farm 7 hexes on stays hidden.
        Assert.Equal(
            [(seen.Q, seen.R, "farm", 2, rivalId, (Guid?)rivalUser, false), (own.Q + 20, own.R, "longhouse", 1, rivalId, (Guid?)rivalUser, false)],
            buildings.OrderBy(b => b.Q).Select(b => (b.Q, b.R, b.Type, b.Level, b.SettlementId, b.OwnerUserId, b.OutsideRealm)).ToArray());
    }

    [Fact]
    public async Task Lists_the_rivals_centre_longhouse_when_the_centre_is_explored()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        await PlantAsync(worldId, own.IslandId, SystemUserIds.Abandoned, own.Q + 5, own.R);

        var building = Assert.Single((await BuildingsAsync(client, worldId))!);

        Assert.Equal((own.Q + 5, own.R, "longhouse", 1), (building.Q, building.R, building.Type, building.Level));
        Assert.Null(building.OwnerUserId);
    }

    [Fact]
    public async Task Lists_a_rivals_building_under_construction_as_level_0()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        await PlantAsync(
            worldId, own.IslandId, SystemUserIds.Abandoned, own.Q + 5, own.R,
            (own.Q + 4, own.R, BuildingType.Farm, 0),
            (own.Q + 4, own.R + 1, BuildingType.Palisade, 0));

        var buildings = (await BuildingsAsync(client, worldId))!;

        Assert.Equal(
            [(own.Q + 4, own.R, "farm", 0), (own.Q + 4, own.R + 1, "palisade", 0), (own.Q + 5, own.R, "longhouse", 1)],
            buildings.OrderBy(b => b.Q).ThenBy(b => b.R).Select(b => (b.Q, b.R, b.Type, b.Level)).ToArray());
    }

    [Fact]
    public async Task Leaves_out_the_callers_own_buildings()
    {
        var (worldId, _, _, client) = await SetUpAsync();
        using var _ = client;

        Assert.Empty((await BuildingsAsync(client, worldId))!);
    }

    [Fact]
    public async Task Own_buildings_lists_every_building_of_the_callers_settlements_and_no_rivals()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        await PlantAsync(worldId, own.IslandId, SystemUserIds.Abandoned, own.Q + 5, own.R, (own.Q + 4, own.R, BuildingType.Farm, 1));

        var buildings = (await client.GetFromJsonAsync<List<RivalBuildingResponse>>(
            $"/api/v1/worlds/{worldId}/own-buildings", SqliteApiFixture.StrictJson, Ct))!;

        Assert.NotEmpty(buildings);
        Assert.All(buildings, b => Assert.Equal(own.Id, b.SettlementId));
        Assert.Contains(buildings, b => b.Type == "longhouse" && b.Q == own.Q && b.R == own.R);
    }

    [Fact]
    public async Task Own_build_orders_lists_the_running_build_of_the_callers_realm_with_its_timing()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        var queued = await client.PostJsonAsync(
            $"/api/v1/settlements/{own.Id}/builds", new QueueBuildRequest("longhouse", own.Q, own.R), Ct);
        Assert.Equal(System.Net.HttpStatusCode.Accepted, queued.StatusCode);

        var orders = (await client.GetFromJsonAsync<List<OwnBuildOrdersResponse>>(
            $"/api/v1/worlds/{worldId}/own-build-orders", SqliteApiFixture.StrictJson, Ct))!;

        var realm = Assert.Single(orders);
        Assert.Equal(own.Id, realm.SettlementId);
        var order = Assert.Single(realm.Queue);
        Assert.Equal((own.Q, own.R, "building"), (order.Q, order.R, order.State));
        Assert.True(order.TotalSeconds > 0);
    }

    [Fact]
    public async Task Own_build_orders_settles_a_finished_build_and_survives_losing_the_write_race_to_a_concurrent_writer()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        var queued = await client.PostJsonAsync(
            $"/api/v1/settlements/{own.Id}/builds", new QueueBuildRequest("longhouse", own.Q, own.R), Ct);
        Assert.Equal(System.Net.HttpStatusCode.Accepted, queued.StatusCode);
        var running = (await client.GetFromJsonAsync<List<OwnBuildOrdersResponse>>(
            $"/api/v1/worlds/{worldId}/own-build-orders", SqliteApiFixture.StrictJson, Ct))!;
        var order = Assert.Single(Assert.Single(running).Queue);

        // The build finishes, so the next read settles it and saves; a concurrent write to the same settlement lands between
        // that read and the save (what a build/poll of the open settlement does in the browser).
        _factory.Time.Advance(TimeSpan.FromSeconds(order.TotalSeconds * 2));
        _factory.Race.Arm(own.Id, () => SettlementRaceInterceptor.BumpAsync(_factory.Services, own.Id, Ct), repeat: false);

        var response = await client.GetAsync($"/api/v1/worlds/{worldId}/own-build-orders", Ct);

        _factory.Race.Disarm();
        Assert.Equal(1, _factory.Race.Fired);
        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(Assert.Single(await response.ReadStrictAsync<List<OwnBuildOrdersResponse>>(Ct)).Queue);
    }

    [Fact]
    public async Task Is_empty_for_a_caller_with_no_realm()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        await PlantAsync(worldId, own.IslandId, SystemUserIds.Abandoned, own.Q + 5, own.R, (own.Q + 4, own.R, BuildingType.Farm, 1));
        using var stranger = _factory.CreateClient();
        stranger.DefaultRequestHeaders.Authorization = null;

        Assert.Empty((await BuildingsAsync(stranger, worldId))!);
    }
}
