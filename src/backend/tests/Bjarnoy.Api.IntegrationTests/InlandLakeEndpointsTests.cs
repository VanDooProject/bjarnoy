using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Inland lakes through HTTP, the EF model and the persisted island column: the server serves them, and only the Fishing Hut may
/// stand on an inland-lake hex beside land (<c>docs/design/world-generation-rules.md</c>). The compact test worlds hold no inland
/// lake, so the island's column is written straight, like the generator would have stored it.
/// </summary>
public sealed class InlandLakeEndpointsTests : IAsyncLifetime
{
    private const string OwnerId = "ulf-player";

    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    /// <summary>
    /// A settlement at Longhouse 20 with an inland lake beside it: <c>shore</c> touches the settlement's land, <c>interior</c> sits
    /// in the middle of the lake with water on all six sides.
    /// </summary>
    private async Task<(HttpClient Client, WorldEntity World, SettlementResponse Settlement, IslandResponse Island, Dictionary<string, HexCoord> Hexes)> SetUpAsync()
    {
        var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), seed: 21, radius: 60, cancellationToken: Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", OwnerId),
            Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var settlement = await response.ReadStrictAsync<SettlementResponse>(Ct);
        client.DefaultRequestHeaders.Add("X-Owner-Id", OwnerId);

        var centre = new HexCoord(settlement.Q, settlement.R);
        var interior = new HexCoord(centre.Q + 3, centre.R);
        var hexes = new Dictionary<string, HexCoord> { ["shore"] = new(centre.Q + 1, centre.R), ["interior"] = interior };

        // The lake: the shore hex, plus the interior hex with all its neighbours.
        var lake = new HashSet<HexCoord> { hexes["shore"], interior };
        lake.UnionWith(interior.Neighbours());

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var stored = await db.Islands.SingleAsync(i => i.Id == island.Id, Ct);
            stored.InlandLakeTiles = [.. lake.Select(c => new HexPoint(c.Q, c.R))];

            var longhouse = await db.PlacedBuildings.SingleAsync(b => b.SettlementId == settlement.Id && b.Type == BuildingType.Longhouse, Ct);
            longhouse.Level = 20;
            await db.SaveChangesAsync(Ct);
        }

        WorldTerrain.Invalidate(world.Id);
        return (client, world, settlement, island, hexes);
    }

    private static Task<HttpResponseMessage> Build(HttpClient client, Guid settlementId, string type, HexCoord at) =>
        client.PostJsonAsync($"/api/v1/settlements/{settlementId}/builds", new QueueBuildRequest(type, at.Q, at.R), Ct);

    [Fact]
    public async Task The_fishing_hut_is_placed_on_an_inland_lake_hex_beside_land()
    {
        var (client, _, settlement, _, hexes) = await SetUpAsync();
        using var _ = client;

        Assert.Equal(HttpStatusCode.Accepted, (await Build(client, settlement.Id, "fishinghut", hexes["shore"])).StatusCode);
    }

    [Fact]
    public async Task The_dockyard_is_refused_on_an_inland_lake_shore()
    {
        var (client, _, settlement, _, hexes) = await SetUpAsync();
        using var _ = client;

        var response = await Build(client, settlement.Id, "dockyard", hexes["shore"]);

        Assert.Equal("TerrainNotAllowed", await response.RejectionAsync(Ct));
    }

    [Fact]
    public async Task The_fishing_hut_is_refused_on_an_inland_lake_hex_with_no_land_neighbour()
    {
        var (client, _, settlement, _, hexes) = await SetUpAsync();
        using var _ = client;

        var response = await Build(client, settlement.Id, "fishinghut", hexes["interior"]);

        Assert.Equal("TerrainNotAllowed", await response.RejectionAsync(Ct));
    }

    [Fact]
    public async Task The_islands_endpoint_serves_the_stored_inland_lake_tiles()
    {
        var (client, world, _, island, hexes) = await SetUpAsync();
        using var _ = client;

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);

        var served = islands!.Single(i => i.Id == island.Id).InlandLakeTiles;
        Assert.Equal(8, served.Count);
        Assert.Contains(new TileCoordinate(hexes["shore"].Q, hexes["shore"].R), served);
        Assert.Contains(new TileCoordinate(hexes["interior"].Q, hexes["interior"].R), served);
    }
}
