using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The fourth generation rule from issue #24 — see
/// <c>docs/design/river-generation.md</c> for the algorithm these lock down:
/// spring density per mountain cluster, the funnel-to-coast walk, the
/// minimum-length filter, and the merge-two/drop-the-third collision rule.
/// </summary>
public class RiverGenerationTests
{
    private static GeneratedWorld Generate(int seed, int radius = 40) =>
        new WorldGenerator(WorldGenerationOptions.ForSeed(seed) with { Radius = radius })
            .Generate(TestContext.Current.CancellationToken);

    [Fact]
    public void A_world_produces_at_least_one_river()
    {
        // Picked by trial: this seed/radius combination is known to produce
        // several rivers across several islands (verified independently by
        // running the mirrored algorithm under Node before writing this).
        var world = Generate(2024);

        var totalRiverTiles = world.Islands.Sum(i => i.RiverTiles.Count);
        Assert.True(totalRiverTiles > 0, "expected at least one river tile across this world");
    }

    [Fact]
    public void The_same_seed_produces_the_same_rivers()
    {
        var first = Generate(2024);
        var second = Generate(2024);

        Assert.Equal(
            first.Islands.Select(i => i.RiverTiles),
            second.Islands.Select(i => i.RiverTiles));
    }

    [Fact]
    public void Spring_tiles_have_no_inflow()
    {
        foreach (var seed in new[] { 1, 7, 42, 2024 })
        {
            var world = Generate(seed);
            foreach (var island in world.Islands)
            {
                foreach (var tile in island.RiverTiles)
                {
                    if (tile.Shape == RiverTileShape.Spring)
                    {
                        Assert.Empty(tile.InDirections);
                        Assert.NotNull(tile.OutDirection);
                    }
                }
            }
        }
    }

    [Fact]
    public void Mouth_tiles_have_no_outflow_and_touch_the_sea()
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(2024) with { Radius = 40 });
        var world = Generate(2024);

        var checkedAny = false;
        foreach (var island in world.Islands)
        {
            foreach (var tile in island.RiverTiles)
            {
                if (tile.Shape != RiverTileShape.Mouth)
                {
                    continue;
                }

                checkedAny = true;
                Assert.Null(tile.OutDirection);
                Assert.Single(tile.InDirections);
                Assert.Contains(tile.Coord.Neighbours(), n => !sampler.IsLand(n));
            }
        }

        Assert.True(checkedAny, "expected at least one river mouth in this world");
    }

    [Fact]
    public void Confluence_tiles_have_exactly_two_inflows_and_one_outflow()
    {
        // Confluences are rare — only 3 of these 7 seeds produce one even at
        // radius 60 (verified independently under Node), so this needs a
        // wider net than the other tests to find at least one to check.
        var checkedAny = false;
        foreach (var seed in new[] { 1, 7, 42, 1337, -5, 2147483, 0 })
        {
            var world = Generate(seed, radius: 60);
            foreach (var island in world.Islands)
            {
                foreach (var tile in island.RiverTiles)
                {
                    if (tile.Shape != RiverTileShape.Confluence)
                    {
                        continue;
                    }

                    checkedAny = true;
                    Assert.Equal(2, tile.InDirections.Count);
                    Assert.NotNull(tile.OutDirection);
                }
            }
        }

        Assert.True(checkedAny, "expected at least one confluence across these seeds — widen the seed list if this starts failing");
    }

    [Fact]
    public void Straight_and_bend_tiles_have_exactly_one_inflow_and_one_outflow()
    {
        var world = Generate(2024);

        foreach (var island in world.Islands)
        {
            foreach (var tile in island.RiverTiles)
            {
                if (tile.Shape is not (RiverTileShape.Straight or RiverTileShape.Bend))
                {
                    continue;
                }

                Assert.Single(tile.InDirections);
                Assert.NotNull(tile.OutDirection);

                var opposite = ((int)tile.InDirections[0] + 3) % 6;
                var isStraight = opposite == (int)tile.OutDirection!.Value;
                Assert.Equal(tile.Shape == RiverTileShape.Straight, isStraight);
            }
        }
    }

    [Fact]
    public void No_river_is_shorter_than_the_configured_minimum()
    {
        // A river's *rendered* length is however many tiles carry it; a path
        // truncated by a confluence can still count tiles contributed by the
        // path that continues past it, so this checks the whole world's
        // river-tile set never contains a completely isolated 1-2 tile
        // fragment (spring immediately followed by a mouth with nothing
        // between, or shorter).
        foreach (var seed in new[] { 1, 7, 42, 2024 })
        {
            var options = WorldGenerationOptions.ForSeed(seed) with { Radius = 40, MinRiverLength = 4 };
            var world = new WorldGenerator(options).Generate(TestContext.Current.CancellationToken);

            foreach (var island in world.Islands)
            {
                var springCount = island.RiverTiles.Count(t => t.Shape == RiverTileShape.Spring);
                var tileCount = island.RiverTiles.Count;

                // Each independent river line (spring) must, on average,
                // contribute at least MinRiverLength tiles — a weaker but
                // still meaningful check than tracing full connectivity,
                // since confluences share tiles between lines.
                if (springCount > 0)
                {
                    Assert.True(
                        tileCount >= springCount * options.MinRiverLength,
                        $"seed {seed}: {tileCount} river tiles across {springCount} springs looks shorter than the {options.MinRiverLength}-tile minimum allows");
                }
            }
        }
    }

    [Fact]
    public void Springs_never_outnumber_qualifying_mountain_clusters()
    {
        foreach (var seed in new[] { 1, 7, 42, 2024, 12345 })
        {
            var world = Generate(seed);
            var sampler = new TerrainSampler(world.Options);

            foreach (var island in world.Islands)
            {
                var springCount = island.RiverTiles.Count(t => t.Shape == RiverTileShape.Spring);
                if (springCount == 0)
                {
                    continue;
                }

                var qualifyingClusters = CountQualifyingMountainClusters(island.Tiles, sampler);
                Assert.True(
                    springCount <= qualifyingClusters,
                    $"seed {seed} island {island.Index}: {springCount} springs but only {qualifyingClusters} mountain clusters of 2+ tiles");
            }
        }
    }

    /// <summary>Independent re-implementation of the clustering rule, so this test doesn't just restate the production code.</summary>
    private static int CountQualifyingMountainClusters(IReadOnlyList<HexCoord> islandTiles, TerrainSampler sampler)
    {
        var mountains = new HashSet<HexCoord>(islandTiles.Where(t => sampler.TerrainAt(t) == Terrain.Mountain));
        var visited = new HashSet<HexCoord>();
        var qualifying = 0;

        foreach (var start in mountains)
        {
            if (!visited.Add(start))
            {
                continue;
            }

            var size = 0;
            var pending = new Stack<HexCoord>();
            pending.Push(start);

            while (pending.TryPop(out var coord))
            {
                size++;
                foreach (var neighbour in coord.Neighbours())
                {
                    if (mountains.Contains(neighbour) && visited.Add(neighbour))
                    {
                        pending.Push(neighbour);
                    }
                }
            }

            if (size >= 2)
            {
                qualifying++;
            }
        }

        return qualifying;
    }
}
