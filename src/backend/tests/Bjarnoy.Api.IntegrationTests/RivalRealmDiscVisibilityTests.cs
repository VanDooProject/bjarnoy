using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using Bjarnoy.TestSupport;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <c>docs/design/map-fog-v2.md</c> §1h: a rival is delivered as soon as any of it is visible through the fog. The visible area is the
/// caller's explored ground plus where the fog is not yet fully opaque (11.2 hexes past a settlement's or tower's explored ring, 5.55 past stored explored ground and a marching army's vision); a
/// building is sent when its own hex is in it, a tower or the Longhouse when any hex of its claim disc is. The caller here is a level 1
/// Longhouse at (own.Q, own.R): explored radius 5, so on the q axis the visible area ends at +16 (5 + 11.2 = 16.2) and +17 is out of it.
/// </summary>
public sealed class RivalRealmDiscVisibilityTests : IAsyncLifetime
{
    private const int LastVisible = 16;

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
        var islands = await client.GetFullIslandsAsync(world.Id, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];
        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", owner), Ct);
        return (world.Id, await response.ReadStrictAsync<SettlementResponse>(Ct), owner, client);
    }

    private async Task<Guid> PlantAsync(
        Guid worldId, Guid islandId, HexCoord centre, int longhouseLevel, params (HexCoord At, BuildingType Type, int Level)[] others)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            UserId = SystemUserIds.Abandoned,
            Name = Unique("rival"),
            OwnerName = "Rival",
            OwnerId = Unique("rival-owner"),
            CentreQ = centre.Q,
            CentreR = centre.R,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = [new PlacedBuildingEntity { Q = centre.Q, R = centre.R, Type = BuildingType.Longhouse, Level = longhouseLevel }],
        };
        foreach (var (at, type, level) in others)
        {
            settlement.Buildings.Add(new PlacedBuildingEntity { Q = at.Q, R = at.R, Type = type, Level = level });
        }

        db.Settlements.Add(settlement);
        await db.SaveChangesAsync(Ct);
        return settlement.Id;
    }

    private static Task<List<RivalBuildingResponse>?> BuildingsAsync(HttpClient client, Guid worldId) =>
        client.GetFromJsonAsync<List<RivalBuildingResponse>>($"/api/v1/worlds/{worldId}/rival-buildings", SqliteApiFixture.StrictJson, Ct);

    private static Task<List<WallResponse>?> WallsAsync(HttpClient client, Guid worldId) =>
        client.GetFromJsonAsync<List<WallResponse>>($"/api/v1/worlds/{worldId}/walls", SqliteApiFixture.StrictJson, Ct);

    private static Task<List<SettlementSummary>?> SettlementsAsync(HttpClient client, Guid worldId) =>
        client.GetFromJsonAsync<List<SettlementSummary>>($"/api/v1/worlds/{worldId}/settlements", SqliteApiFixture.StrictJson, Ct);

    private static HexCoord At(SettlementResponse own, int dq, int dr = 0) => new(own.Q + dq, own.R + dr);

    private static HexCoord At(HexCoord from, int dq, int dr = 0) => new(from.Q + dq, from.R + dr);

    [Fact]
    public async Task A_rival_seen_only_through_one_wall_hex_delivers_its_longhouse_and_tower_and_is_listed_with_a_label_inside_its_claim()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        // Nothing of the rival's centre or tower hex is in the visible area (+19 and +21 are past +16). Its Longhouse claim (radius 3 at
        // level 2) and the tower's (level 5, the Tower's top level) reach +16, and one palisade stands on a visible hex.
        var longhouse = At(own, 19);
        var tower = At(own, 21);
        var wall = At(own, 15, 1);
        var rivalId = await PlantAsync(
            worldId, own.IslandId, longhouse, 2,
            (tower, BuildingType.Tower, 5), (wall, BuildingType.Palisade, 1), (At(own, 20), BuildingType.Farm, 1));

        var buildings = await BuildingsAsync(client, worldId);

        Assert.Equivalent(
            new[] { (longhouse, "longhouse", 2), (tower, "tower", 5), (wall, "palisade", 1) },
            buildings!.Select(b => (new HexCoord(b.Q, b.R), b.Type, b.Level)).ToArray());
        Assert.All(buildings!, b => Assert.Equal(rivalId, b.SettlementId));

        var listed = Assert.Single((await SettlementsAsync(client, worldId))!, s => !s.Mine);
        Assert.Equal(rivalId, listed.Id);
        // The label goes on the visible hex of the claim closest to the centre (3 away), not on the wall (4 away) and never the centre.
        Assert.Equal((At(own, LastVisible).Q, At(own, LastVisible).R), (listed.LabelQ, listed.LabelR));
        Assert.Equal((longhouse.Q, longhouse.R), (listed.Q, listed.R));
        Assert.Equal(2, listed.LonghouseLevel);

        var walls = Assert.Single((await WallsAsync(client, worldId))!);
        Assert.Equal((wall.Q, wall.R), (walls.Q, walls.R));
    }

    [Fact]
    public async Task The_view_of_a_rival_seen_only_through_its_claim_holds_its_longhouse_and_tower_and_not_the_other_hexes()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        var rivalId = await PlantAsync(
            worldId, own.IslandId, At(own, 19), 2, (At(own, 21), BuildingType.Tower, 5), (At(own, 20), BuildingType.Farm, 1));

        var view = await client.GetFromJsonAsync<SettlementViewResponse>(
            $"/api/v1/settlements/{rivalId}/view", SqliteApiFixture.StrictJson, Ct);

        Assert.Equivalent(
            new[] { "longhouse", "tower" },
            view!.Buildings.Select(b => b.Type).ToArray());
    }

    [Fact]
    public async Task A_building_is_delivered_up_to_where_the_fog_is_fully_opaque_and_not_one_hex_further()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        // Explored radius 5; the mist stays see-through 11.2 straight-line hexes further. The rival's own claim stays out of reach.
        await PlantAsync(
            worldId, own.IslandId, At(own, 40), 1,
            (At(own, 9), BuildingType.Farm, 1), (At(own, LastVisible), BuildingType.Farm, 1), (At(own, LastVisible + 1), BuildingType.Farm, 1));

        var buildings = await BuildingsAsync(client, worldId);

        Assert.Equivalent(
            new[] { At(own, 9), At(own, LastVisible) },
            buildings!.Select(b => new HexCoord(b.Q, b.R)).ToArray());
    }

    [Theory]
    [InlineData(5)]
    [InlineData(2)]
    public async Task A_tower_is_delivered_when_its_claim_radius_from_the_catalogue_reaches_visible_ground_and_not_when_it_falls_short(int level)
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        var radius = Settlement.TowerClaimRadius(level);
        var reaching = At(own, LastVisible + radius);
        var short_ = At(own, LastVisible + radius + 1, 0);
        // Two rivals, so each tower is judged on its own claim (a Longhouse far away claims nothing visible).
        var reachingRival = await PlantAsync(worldId, own.IslandId, At(own, 50), 1, (reaching, BuildingType.Tower, level));
        var shortRival = await PlantAsync(worldId, own.IslandId, At(own, 50, 10), 1, (short_, BuildingType.Tower, level));

        var buildings = await BuildingsAsync(client, worldId);

        var tower = Assert.Single(buildings!);
        Assert.Equal((reaching.Q, reaching.R, "tower", level, reachingRival), (tower.Q, tower.R, tower.Type, tower.Level, tower.SettlementId));
        Assert.DoesNotContain(buildings!, b => b.SettlementId == shortRival);
        var listed = Assert.Single((await SettlementsAsync(client, worldId))!, s => !s.Mine);
        Assert.Equal(reachingRival, listed.Id);
    }

    [Fact]
    public async Task Stored_explored_ground_without_a_current_source_shows_buildings_where_its_fog_fringe_is_not_opaque_and_not_beyond()
    {
        var (worldId, own, owner, client) = await SetUpAsync();
        using var _ = client;
        // Ground explored earlier, far from every current source: the mist fades out from it like from a marching army's vision,
        // 5.55 hexes straight-line (the farm 3 away shows, the one 7 away does not). A tower whose claim reaches it is delivered too.
        var old = At(own, 40);
        await _factory.SeedExploredHexesAsync(worldId, owner, [old], Ct);
        await PlantAsync(
            worldId, own.IslandId, At(own, 70), 1,
            (old, BuildingType.Farm, 1), (At(old, 3), BuildingType.Farm, 1), (At(old, 5), BuildingType.Farm, 1),
            (At(old, 7), BuildingType.Farm, 1), (At(old, 0, 7), BuildingType.Farm, 1), (At(old, 8), BuildingType.Tower, 3));

        var buildings = await BuildingsAsync(client, worldId);

        Assert.Equivalent(
            new[] { (old, "farm"), (At(old, 3), "farm"), (At(old, 5), "farm"), (At(old, 8), "tower") },
            buildings!.Select(b => (new HexCoord(b.Q, b.R), b.Type)).ToArray());
    }

    [Fact]
    public async Task The_fringe_around_stored_ground_is_straight_line_not_hex_steps()
    {
        var (worldId, own, owner, client) = await SetUpAsync();
        using var _ = client;
        // (-3, 6) is 6 steps but 5.2 straight-line away (shown); (3, 4) is 7 steps and 6.1 away (hidden); (6, -1) is 6 steps and 5.6 away (hidden).
        var old = At(own, 40);
        await _factory.SeedExploredHexesAsync(worldId, owner, [old], Ct);
        await PlantAsync(
            worldId, own.IslandId, At(own, 70), 1,
            (At(old, -3, 6), BuildingType.Farm, 1), (At(old, 3, 4), BuildingType.Farm, 1), (At(old, 6, -1), BuildingType.Farm, 1));

        var buildings = await BuildingsAsync(client, worldId);

        Assert.Equivalent(
            new[] { At(old, -3, 6) },
            buildings!.Select(b => new HexCoord(b.Q, b.R)).ToArray());
    }

    [Theory]
    [InlineData(1, 0)]
    [InlineData(0, 1)]
    public async Task The_fringe_around_stored_ground_reaches_across_a_chunk_seam(int dq, int dr)
    {
        var (worldId, own, owner, client) = await SetUpAsync();
        using var _ = client;
        // An explored hex on the last texel column (dq = 1) or the last two texel rows (dr = 1, a hex step moves 2 rows) of its chunk,
        // so the rival's farm 3 hexes on lies in the next chunk, which holds no stored row at all.
        var edge = At(own, 40);
        while (true)
        {
            var texel = FogMaskLayout.ToTexel(edge);
            var onEdge = dq == 1 ? Mod(texel.U, FogChunkLayout.ChunkSize) == FogChunkLayout.ChunkSize - 1
                : Mod(texel.V, FogChunkLayout.ChunkSize) >= FogChunkLayout.ChunkSize - 2;
            if (onEdge)
            {
                break;
            }

            edge = dq == 1 ? new HexCoord(edge.Q + 1, edge.R) : new HexCoord(edge.Q, edge.R + 1);
        }

        var farm = new HexCoord(edge.Q + (3 * dq), edge.R + (3 * dr));
        Assert.NotEqual(FogChunkLayout.ChunkOf(edge), FogChunkLayout.ChunkOf(farm));
        await _factory.SeedExploredHexesAsync(worldId, owner, [edge], Ct);
        await PlantAsync(worldId, own.IslandId, new HexCoord(edge.Q + 30, edge.R), 1, (farm, BuildingType.Farm, 1));

        var buildings = await BuildingsAsync(client, worldId);

        Assert.Equal(farm, new HexCoord(Assert.Single(buildings!).Q, buildings![0].R));
    }

    private static int Mod(int value, int modulus) => ((value % modulus) + modulus) % modulus;

    [Fact]
    public async Task A_rival_with_nothing_in_sight_reveals_nothing_not_even_a_type_or_level()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        // The tower's claim (radius 3) stops short of the visible area; the Barracks lies just outside it.
        var rivalId = await PlantAsync(
            worldId, own.IslandId, At(own, 40), 1,
            (At(own, LastVisible + 4), BuildingType.Tower, 3), (At(own, LastVisible + 1), BuildingType.Barracks, 4));

        Assert.Empty((await BuildingsAsync(client, worldId))!);
        Assert.DoesNotContain((await SettlementsAsync(client, worldId))!, s => s.Id == rivalId);
        var view = await client.GetAsync($"/api/v1/settlements/{rivalId}/view", Ct);
        Assert.Equal(HttpStatusCode.NotFound, view.StatusCode);
    }

    [Fact]
    public async Task Only_towers_and_the_longhouse_are_delivered_through_a_claim_other_buildings_need_their_own_hex_in_sight()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        // Inside the tower's claim and the Longhouse's, but on hexes out of sight: a Barracks, a farm and a palisade stay hidden.
        await PlantAsync(
            worldId, own.IslandId, At(own, 19), 2,
            (At(own, 21), BuildingType.Barracks, 4), (At(own, 22), BuildingType.Farm, 1), (At(own, 18), BuildingType.Palisade, 1),
            (At(own, 20), BuildingType.Tower, 4));

        var buildings = await BuildingsAsync(client, worldId);

        Assert.Equivalent(
            new[] { "longhouse", "tower" },
            buildings!.Select(b => b.Type).ToArray());
        Assert.Empty((await WallsAsync(client, worldId))!);
    }
}
