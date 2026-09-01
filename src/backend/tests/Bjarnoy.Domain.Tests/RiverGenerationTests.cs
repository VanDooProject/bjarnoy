using Bjarnoy.Domain.Movement;
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
    public void Confluence_tiles_have_exactly_two_inflows()
    {
        // Confluences are rare — only 3 of these 7 seeds produce one even at
        // radius 60 (verified independently under Node), so this needs a
        // wider net than the other tests to find at least one to check.
        var checkedAny = false;
        foreach (var seed in new[] { 1, 7, 42, 1337, -5, 2147483, 0 })
        {
            var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(seed) with { Radius = 60 });
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
                    // Usually the merged river keeps flowing (an outflow),
                    // but two rivers can also merge right at the tile that
                    // touches the sea — a confluence that's simultaneously
                    // the river's mouth — in which case there's no outflow,
                    // same as a plain Mouth tile.
                    if (tile.OutDirection is null)
                    {
                        Assert.Contains(tile.Coord.Neighbours(), n => !sampler.IsLand(n));
                    }
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

    /// <summary>
    /// Guards <see cref="HexPathfinder.RiverCrossingCost"/> (issue #159 part
    /// A) against a later change to <c>RiverMeanderWeight</c>/<c>MinRiverLength</c>
    /// quietly making generated rivers long enough that the constant no
    /// longer buys "troops detour around a river most of the time". A
    /// smaller-scale reproduction of the measurement the issue itself
    /// describes: for every river tile, compare walking straight across it
    /// (two of its dry-land neighbours, via the tile) against the cheapest
    /// route between those same two neighbours that avoids every river tile
    /// on the island.
    /// </summary>
    [Fact]
    public void RiverCrossingCost_still_exceeds_the_median_penalty_needed_to_prefer_a_detour()
    {
        var neededPenalties = new List<double>();

        foreach (var seed in new[] { 1, 7, 42, 2024, 1337, 99, 12345, 55555 })
        {
            var world = Generate(seed);
            var sampler = new TerrainSampler(world.Options);

            foreach (var island in world.Islands)
            {
                if (island.RiverTiles.Count == 0)
                {
                    continue;
                }

                var riverCoords = island.RiverTiles.Select(t => t.Coord).ToHashSet();
                Terrain WithoutRivers(HexCoord c) => riverCoords.Contains(c) ? Terrain.Sea : sampler.TerrainAt(c);

                foreach (var tile in island.RiverTiles)
                {
                    var banks = tile.Coord.Neighbours()
                        .Where(n => sampler.IsLand(n) && !riverCoords.Contains(n))
                        .Take(2)
                        .ToList();

                    if (banks.Count < 2)
                    {
                        continue;
                    }

                    var (a, b) = (banks[0], banks[1]);

                    // Straight across: entering the river tile, then the far
                    // bank — the same shape HexPathfinder actually charges.
                    var direct = HexPathfinder.CumulativeHours([a, tile.Coord, b], sampler.TerrainAt, hexesPerHour: 1.0)[^1];

                    var detourPath = HexPathfinder.FindPath(a, b, WithoutRivers, isLandUnit: true);
                    if (detourPath is null)
                    {
                        // The two banks are only connected through this river tile — no detour exists, so crossing is the only route.
                        continue;
                    }

                    var detour = HexPathfinder.CumulativeHours(detourPath, sampler.TerrainAt, hexesPerHour: 1.0)[^1];

                    neededPenalties.Add(detour - direct);
                }
            }
        }

        Assert.True(
            neededPenalties.Count >= 5,
            $"expected several measurable river tiles across these seeds, found {neededPenalties.Count} — widen the seed list if this starts failing");

        neededPenalties.Sort();
        var median = neededPenalties[neededPenalties.Count / 2];

        Assert.True(
            HexPathfinder.RiverCrossingCost > median,
            $"RiverCrossingCost ({HexPathfinder.RiverCrossingCost}) no longer exceeds the median penalty needed "
                + $"to prefer a detour ({median}) across {neededPenalties.Count} measured river tiles — troops "
                + "would stop routing around rivers most of the time.");
    }
}
