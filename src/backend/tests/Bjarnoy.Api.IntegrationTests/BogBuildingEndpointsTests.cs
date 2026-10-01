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
/// The bog buildings through HTTP, the EF model and the persisted bog: where the server lets each stand
/// (<c>docs/design/bog.md</c>, "Buildings"). The compact test worlds hold no bog, so the island's bog is written
/// straight into its column around the settlement, like the generator would have stored it.
/// </summary>
public sealed class BogBuildingEndpointsTests : IAsyncLifetime
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

    private static BogTileRecord Bog(HexCoord at, BogTileKind kind, int? outDirection = null, int[]? inDirections = null, int[]? waterEdges = null) =>
        new(at.Q, at.R, (int)kind, inDirections ?? [], outDirection, waterEdges ?? []);

    /// <summary>
    /// A settlement at Longhouse 20 with a level-10 bog-ore works standing, and one hex of every bog kind around its centre:
    /// plain moss twice, a creek, a half shore, a shore, a lake; the rest stays grass.
    /// </summary>
    private async Task<(HttpClient Client, SettlementResponse Settlement, Dictionary<string, HexCoord> Hexes)> SetUpAsync()
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
        var hexes = new Dictionary<string, HexCoord>
        {
            ["moss1"] = new(centre.Q + 1, centre.R),
            ["moss2"] = new(centre.Q + 1, centre.R - 1),
            ["creek"] = new(centre.Q, centre.R - 1),
            ["half"] = new(centre.Q - 1, centre.R),
            ["shore"] = new(centre.Q - 1, centre.R + 1),
            ["lake"] = new(centre.Q - 2, centre.R),
            ["grass"] = new(centre.Q, centre.R + 1),
        };

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();

            var stored = await db.Islands.SingleAsync(i => i.Id == island.Id, Ct);
            stored.BogTiles =
            [
                Bog(hexes["moss1"], BogTileKind.Bog),
                Bog(hexes["moss2"], BogTileKind.Bog),
                Bog(hexes["creek"], BogTileKind.Creek, outDirection: 0, inDirections: [3]),
                Bog(hexes["half"], BogTileKind.Half, waterEdges: [2, 3, 4]),
                Bog(hexes["shore"], BogTileKind.Shore, waterEdges: [3, 4]),
                Bog(hexes["lake"], BogTileKind.Lake),
            ];

            var longhouse = await db.PlacedBuildings.SingleAsync(b => b.SettlementId == settlement.Id && b.Type == BuildingType.Longhouse, Ct);
            longhouse.Level = 20;
            db.PlacedBuildings.Add(new PlacedBuildingEntity
            {
                SettlementId = settlement.Id,
                Q = centre.Q - 1,
                R = centre.R - 2,
                Type = BuildingType.BogOreWorks,
                Level = 10,
            });
            await db.SaveChangesAsync(Ct);
        }

        WorldTerrain.Invalidate(world.Id);
        return (client, settlement, hexes);
    }

    private static Task<HttpResponseMessage> Build(HttpClient client, Guid settlementId, string type, HexCoord at) =>
        client.PostJsonAsync($"/api/v1/settlements/{settlementId}/builds", new QueueBuildRequest(type, at.Q, at.R), Ct);

    [Fact]
    public async Task The_clay_brickworks_and_the_bog_ore_works_are_placed_on_plain_moss_and_nowhere_else()
    {
        var (client, settlement, hexes) = await SetUpAsync();
        using var _ = client;

        Assert.Equal(HttpStatusCode.Accepted, (await Build(client, settlement.Id, "claybrickworks", hexes["moss1"])).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await Build(client, settlement.Id, "bogoreworks", hexes["moss2"])).StatusCode);

        foreach (var (type, hex) in new[]
        {
            ("claybrickworks", "grass"), ("claybrickworks", "shore"), ("claybrickworks", "creek"), ("claybrickworks", "half"), ("claybrickworks", "lake"),
            ("bogoreworks", "grass"), ("bogoreworks", "shore"), ("bogoreworks", "creek"), ("bogoreworks", "half"), ("bogoreworks", "lake"),
        })
        {
            var response = await Build(client, settlement.Id, type, hexes[hex]);
            Assert.Equal("TerrainNotAllowed", await response.RejectionAsync(Ct));
        }
    }

    [Fact]
    public async Task The_hammerschmiede_is_placed_on_a_creek_only()
    {
        var (client, settlement, hexes) = await SetUpAsync();
        using var _ = client;

        foreach (var hex in new[] { "moss1", "half", "shore", "lake", "grass" })
        {
            var response = await Build(client, settlement.Id, "hammerschmiede", hexes[hex]);
            Assert.Equal("TerrainNotAllowed", await response.RejectionAsync(Ct));
        }

        Assert.Equal(HttpStatusCode.Accepted, (await Build(client, settlement.Id, "hammerschmiede", hexes["creek"])).StatusCode);
    }

    [Fact]
    public async Task The_fishing_hut_is_placed_on_a_lake_half_shore_and_on_no_other_bog_hex()
    {
        var (client, settlement, hexes) = await SetUpAsync();
        using var _ = client;

        foreach (var hex in new[] { "moss1", "creek", "shore", "lake", "grass" })
        {
            var response = await Build(client, settlement.Id, "fishinghut", hexes[hex]);
            Assert.Equal("TerrainNotAllowed", await response.RejectionAsync(Ct));
        }

        Assert.Equal(HttpStatusCode.Accepted, (await Build(client, settlement.Id, "fishinghut", hexes["half"])).StatusCode);
    }

    [Fact]
    public async Task No_grass_building_is_placed_on_any_bog_hex()
    {
        var (client, settlement, hexes) = await SetUpAsync();
        using var _ = client;

        foreach (var type in new[] { "farm", "tower", "storagehouse", "townsquare", "barracks", "meadery" })
        {
            foreach (var hex in new[] { "moss1", "creek", "half", "shore", "lake" })
            {
                var response = await Build(client, settlement.Id, type, hexes[hex]);
                Assert.NotEqual(HttpStatusCode.Accepted, response.StatusCode);
                Assert.Equal("TerrainNotAllowed", await response.RejectionAsync(Ct));
            }
        }
    }

    [Fact]
    public async Task The_admin_editor_places_bog_buildings_by_the_same_kind_rules()
    {
        var (client, settlement, hexes) = await SetUpAsync();
        using var _ = client;
        client.DefaultRequestHeaders.Remove("X-Owner-Id");

        var userName = Unique("admin");
        var registered = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct)).ReadStrictAsync<AuthResponse>(Ct);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            (await db.Users.SingleAsync(u => u.Id == registered.User.Id, Ct)).Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var token = (await (await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, "correct-horse-battery"), Ct)).ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        Task<HttpResponseMessage> Place(string type, string hex) => client.PutJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/buildings/{hexes[hex].Q}/{hexes[hex].R}", new PlaceBuildingRequest(type, 3), Ct);

        Assert.Equal(HttpStatusCode.OK, (await Place("bogoreworks", "moss1")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Place("hammerschmiede", "creek")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Place("fishinghut", "half")).StatusCode);
        Assert.NotEqual(HttpStatusCode.OK, (await Place("bogoreworks", "shore")).StatusCode);
        Assert.NotEqual(HttpStatusCode.OK, (await Place("hammerschmiede", "moss2")).StatusCode);
        Assert.NotEqual(HttpStatusCode.OK, (await Place("claybrickworks", "lake")).StatusCode);
    }
}
