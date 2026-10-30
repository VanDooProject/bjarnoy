using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Regression: a start position (and so the settlement founded on it) used to be able to sit on a river hex, a wide one
/// included. A land army can't step onto a wide river hex, so no return path <c>destination -> settlement centre</c>
/// existed and every land dispatch was refused with <c>UnreachableLeg</c> (the flaky aspire-e2e
/// <c>TroopTrainingAndDispatchTests</c>).
/// </summary>
public class StartPositionRiverTests
{
    private static GeneratedWorld Generate(int seed, int radius) =>
        new WorldGenerator(new WorldGenerationOptions { Seed = seed, Radius = radius })
            .Generate(TestContext.Current.CancellationToken);

    [Theory]
    [InlineData(602301472, 1000, 28, 10)]
    [InlineData(1955233266, 1000, -75, -62)]
    public void A_start_position_is_never_a_river_and_a_land_army_can_always_walk_home_from_its_neighbours(
        int seed, int radius, int q, int r)
    {
        var world = Generate(seed, radius);
        var sampler = new TerrainSampler(world.Options);
        var island = world.Islands.Single(i => i.Tiles.Contains(new HexCoord(q, r)));
        var rivers = new RiverIndex(island.RiverTiles);

        Assert.All(island.StartPositions, p => Assert.False(rivers.IsRiver(p), $"start position {p} is on a river"));

        Assert.NotEmpty(island.StartPositions);
        var start = island.StartPositions[0];
        var neighbours = start.Neighbours()
            .Where(n => sampler.TerrainAt(n) is Terrain.Grass or Terrain.Forest && !rivers.IsRiver(n))
            .ToList();
        Assert.NotEmpty(neighbours);
        foreach (var neighbour in neighbours)
        {
            Assert.NotNull(HexPathfinder.FindPath(neighbour, start, sampler.TerrainAt, true, rivers.IsRiver, rivers.IsWide));
            Assert.NotNull(HexPathfinder.FindPath(start, neighbour, sampler.TerrainAt, true, rivers.IsRiver, rivers.IsWide));
        }
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(21)]
    [InlineData(602301472)]
    [InlineData(1955233266)]
    [InlineData(1550218726)]
    public void No_island_offers_a_river_hex_as_a_start_position(int seed)
    {
        var world = Generate(seed, 600);

        foreach (var island in world.Islands)
        {
            var rivers = new RiverIndex(island.RiverTiles);
            Assert.All(island.StartPositions, p => Assert.False(rivers.IsRiver(p), $"seed {seed}: start position {p} is on a river"));
        }
    }
}
