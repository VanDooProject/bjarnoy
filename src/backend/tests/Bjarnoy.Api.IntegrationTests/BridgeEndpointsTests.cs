using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The bridge through HTTP and the EF model (<c>docs/design/economy.md</c> section 5): where the server lets one stand, and that it is listed
/// in the settlement snapshot the client reads bridges from.
/// </summary>
public sealed class BridgeEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    // Random, not version-7: the first hex digits of a v7 guid are the timestamp, equal for two calls in one test.
    private static string Unique(string prefix) => $"{prefix}-{Guid.NewGuid():N}"[..20];

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    private sealed record Player(SettlementResponse Settlement, AuthResponse Auth);

    private static async Task<Player> FoundAsync(HttpClient client, Guid worldId, IslandResponse island, TileCoordinate plot, string name)
    {
        var ownerId = Unique("local-owner-");
        var settlement = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, name, name, ownerId), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);
        var auth = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique(name.ToLowerInvariant() + "-"), "correct-horse-battery", ownerId), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        return new Player(settlement, auth);
    }

    private async Task<(HttpClient Client, WorldEntity World, IslandResponse Island, Player Owner, HashSet<HexCoord> Rivers)> SetUpAsync()
    {
        var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.Where(i => i.StartPositions.Count > 3).OrderByDescending(i => i.TileCount).First();
        var owner = await FoundAsync(client, world.Id, island, island.StartPositions[0], "Ulf");
        var rivers = island.RiverTiles.Select(t => new HexCoord(t.Q, t.R)).ToHashSet();
        return (client, world, island, owner, rivers);
    }

    private static async Task<Dictionary<HexCoord, string>> TerrainAroundAsync(HttpClient client, Guid worldId, HexCoord around, int window)
    {
        var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{worldId}/tiles?qMin={around.Q - window}&qMax={around.Q + window}" +
            $"&rMin={around.R - window}&rMax={around.R + window}",
            SqliteApiFixture.StrictJson, Ct);
        return chunk!.Tiles.ToDictionary(t => new HexCoord(t.Q, t.R), t => t.Terrain);
    }

    [Fact]
    public async Task A_bridge_is_placed_on_a_wide_river_only_and_shows_up_in_the_settlement_snapshot()
    {
        var (client, world, _, owner, _) = await SetUpAsync();
        using var _ = client;
        var centre = new HexCoord(owner.Settlement.Q, owner.Settlement.R);
        var terrain = await TerrainAroundAsync(client, world.Id, centre, 4);
        var plain = centre.WithinRadius(2)
            .Where(c => c != centre && terrain.TryGetValue(c, out var t) && t is "grass" or "sand" or "forest")
            .OrderBy(c => c.Q).ThenBy(c => c.R)
            .Take(3).ToList();
        Assert.Equal(3, plain.Count);
        var (wide, stream, dry) = (plain[0], plain[1], plain[2]);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            // Town Square 1 behind it; the settlement is founded at LH 1, a bridge needs LH 7.
            (await db.PlacedBuildings.SingleAsync(b => b.SettlementId == owner.Settlement.Id && b.Type == BuildingType.Longhouse, Ct)).Level = 7;
            var townSquareHex = centre.WithinRadius(2).First(c => c != centre && !plain.Contains(c) && terrain.TryGetValue(c, out var t) && t is "grass" or "sand");
            db.PlacedBuildings.Add(new PlacedBuildingEntity { SettlementId = owner.Settlement.Id, Q = townSquareHex.Q, R = townSquareHex.R, Type = BuildingType.TownSquare, Level = 1 });

            // This island's rivers become one wide straight tile (river width in and out) and one straight stream tile.
            var island = await db.Islands.SingleAsync(i => i.Id == owner.Settlement.IslandId, Ct);
            island.RiverTiles =
            [
                new RiverTileRecord(wide.Q, wide.R, (int)RiverTileShape.Straight, [(int)TileOrientation.W], (int)TileOrientation.E, (int)RiverWidth.River),
                new RiverTileRecord(stream.Q, stream.R, (int)RiverTileShape.Straight, [(int)TileOrientation.W], (int)TileOrientation.E, (int)RiverWidth.Stream),
            ];
            await db.SaveChangesAsync(Ct);
        }

        Authorize(client, owner.Auth.AccessToken);
        Task<HttpResponseMessage> Build(HexCoord at) =>
            client.PostJsonAsync($"/api/v1/settlements/{owner.Settlement.Id}/builds", new QueueBuildRequest("bridge", at.Q, at.R), Ct);

        Assert.Equal("BridgeNeedsWideRiver", await (await Build(stream)).RejectionAsync(Ct));
        Assert.Equal("TerrainNotAllowed", await (await Build(dry)).RejectionAsync(Ct));
        Assert.Equal(HttpStatusCode.Accepted, (await Build(wide)).StatusCode);
        Assert.Equal("AlreadyQueuedOnHex", await (await Build(wide)).RejectionAsync(Ct));

        // The foundation is listed with its wire name and level 0, which is what the frontend reads other settlements' bridges from.
        var snapshot = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{owner.Settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        var bridge = Assert.Single(snapshot!.Buildings, b => b.Type == "bridge");
        Assert.Equal((wide.Q, wide.R, 0), (bridge.Q, bridge.R, bridge.Level));
    }
}
