using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Wasted-island generation rules: no start positions, no shrine, lava
/// rivers that never confluence, and Utgard/volcano placement — see
/// <see cref="WorldGenerator"/>, <see cref="RiverGenerator"/> and
/// <see cref="GiantGenerator"/>. Mirrors <see cref="GiantGenerationTests"/>
/// and <see cref="RiverGenerationTests"/>'s own patterns.
/// </summary>
public class WastedIslandGenerationTests
{
    // Seed 61 at radius 90 is known to place two wasted islands, both with
    // lava rivers and a giant (found by scanning seeds 1-200).
    private const int TwoWastedIslandSeed = 61;

    private static GeneratedWorld Generate(int seed, int radius = 90) =>
        new WorldGenerator(WorldGenerationOptions.ForSeed(seed) with { Radius = radius })
            .Generate(TestContext.Current.CancellationToken);

    [Fact]
    public void Across_many_seeds_at_least_one_world_places_a_wasted_island()
    {
        var anyWasted = Enumerable.Range(1, 100)
            .Select(seed => Generate(seed))
            .Any(world => world.Islands.Any(i => i.IsWasted));

        Assert.True(anyWasted, "expected at least one wasted island across 100 scanned seeds");
    }

    [Fact]
    public void Wasted_islands_are_indexed_after_every_green_island()
    {
        var world = Generate(TwoWastedIslandSeed);

        var lastGreenIndex = world.Islands.Where(i => !i.IsWasted).Max(i => i.Index);
        var wastedIndices = world.Islands.Where(i => i.IsWasted).Select(i => i.Index).ToList();

        Assert.NotEmpty(wastedIndices);
        Assert.All(wastedIndices, index => Assert.True(index > lastGreenIndex));
    }

    [Fact]
    public void Wasted_islands_have_no_start_positions()
    {
        var world = Generate(TwoWastedIslandSeed);
        var wasted = world.Islands.Where(i => i.IsWasted).ToList();

        Assert.NotEmpty(wasted);
        Assert.All(wasted, i => Assert.Empty(i.StartPositions));
    }

    [Fact]
    public void Wasted_islands_never_carry_a_shrine()
    {
        foreach (var seed in Enumerable.Range(1, 60))
        {
            var world = Generate(seed);
            foreach (var island in world.Islands.Where(i => i.IsWasted))
            {
                Assert.DoesNotContain(island.Giants, g => g.Family == GiantGenerator.ShrineFamily);
            }
        }
    }

    [Fact]
    public void Wasted_island_giants_are_volcanoes_or_a_single_utgard()
    {
        var world = Generate(TwoWastedIslandSeed);
        var withGiants = world.Islands.Where(i => i.IsWasted && i.Giants.Count > 0).ToList();

        Assert.NotEmpty(withGiants);
        foreach (var island in withGiants)
        {
            Assert.All(
                island.Giants,
                g => Assert.True(g.Family is GiantGenerator.VolcanoFamily or GiantGenerator.UtgardFamily));
            Assert.True(island.Giants.Count(g => g.Family == GiantGenerator.UtgardFamily) <= 1);
        }
    }

    [Fact]
    public void Wasted_island_names_never_collide_with_green_island_names()
    {
        var world = Generate(TwoWastedIslandSeed);
        var names = world.Islands.Select(i => i.Name).ToList();

        Assert.Equal(names.Count, names.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void Lava_streams_on_a_wasted_island_never_share_a_tile()
    {
        var world = Generate(TwoWastedIslandSeed);
        var withRivers = world.Islands.Where(i => i.IsWasted && i.RiverTiles.Count > 0).ToList();

        Assert.NotEmpty(withRivers);
        foreach (var island in withRivers)
        {
            Assert.DoesNotContain(island.RiverTiles, t => t.Shape == RiverTileShape.Confluence);
        }
    }

    [Fact]
    public void Wasted_island_rivers_run_entirely_over_wasted_land()
    {
        var world = Generate(TwoWastedIslandSeed);
        var withRivers = world.Islands.Where(i => i.IsWasted && i.RiverTiles.Count > 0).ToList();

        Assert.NotEmpty(withRivers);
        foreach (var island in withRivers)
        {
            var islandLand = new HashSet<HexCoord>(island.Tiles);
            Assert.All(island.RiverTiles, t => Assert.Contains(t.Coord, islandLand));
        }
    }

    [Fact]
    public void The_same_seed_produces_the_same_wasted_islands()
    {
        var first = Generate(TwoWastedIslandSeed);
        var second = Generate(TwoWastedIslandSeed);

        Assert.Equal(
            first.Islands.Where(i => i.IsWasted).Select(i => i.Giants),
            second.Islands.Where(i => i.IsWasted).Select(i => i.Giants));
        Assert.Equal(
            first.Islands.Where(i => i.IsWasted).Select(i => i.RiverTiles),
            second.Islands.Where(i => i.IsWasted).Select(i => i.RiverTiles));
    }
}
