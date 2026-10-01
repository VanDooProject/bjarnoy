using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Streams, merge-aware tracing and late widening (docs/design/river-generation.md, "Streams and
/// widening"). These walk the finished tile lists of many generated islands and check the
/// invariants the art needs: every path ends at a real sea mouth or at a confluence the art can
/// draw, and a stream never meets the sea or a river.
/// </summary>
public class RiverStreamTests
{
    private static readonly int[] Seeds = Enumerable.Range(1, 8).ToArray();

    private static IEnumerable<(int Seed, GeneratedIsland Island, TerrainSampler Sampler)> GreenIslands()
    {
        foreach (var seed in Seeds)
        {
            var world = TestWorlds.Default(seed);
            var sampler = new TerrainSampler(world.Options);
            foreach (var island in world.Islands.Where(i => !i.IsWasted && i.RiverTiles.Count > 0))
            {
                yield return (seed, island, sampler);
            }
        }
    }

    private static HexCoord Step(HexCoord from, TileOrientation direction) => from + HexCoord.Directions[(int)direction];

    /// <summary>
    /// Follows the water from a river tile that hands it to a bog creek: down the creek into the lake, out of the
    /// lake by its outflow mouth and on down that creek to the river it feeds. Returns that river tile, or null when
    /// the water ends in a lake with no outflow (a river sunk into a pocket).
    /// </summary>
    private static RiverTile? ThroughBog(GeneratedIsland island, HexCoord start, Dictionary<HexCoord, RiverTile> rivers)
    {
        var bog = island.BogTiles.ToDictionary(t => t.Coord);
        var current = start;
        for (var guard = 0; guard < 400; guard++)
        {
            if (!bog.TryGetValue(current, out var tile))
            {
                return rivers.GetValueOrDefault(current) is { } r ? r : throw new Xunit.Sdk.XunitException($"water leaves the bog into {current}, which is neither bog nor river");
            }

            if (tile.Kind == BogTileKind.Mouth && tile.OutDirection is { } o && bog.TryGetValue(Step(current, o), out var next) && next.Kind == BogTileKind.Lake)
            {
                // Into the lake: it leaves by the lake's outflow mouth, if it has one.
                var lake = new HashSet<HexCoord> { next.Coord };
                var stack = new Stack<HexCoord>();
                stack.Push(next.Coord);
                while (stack.Count > 0)
                {
                    var c = stack.Pop();
                    foreach (var d in HexCoord.Directions.ToArray())
                    {
                        var n = c + d;
                        if (bog.TryGetValue(n, out var nt) && nt.Kind == BogTileKind.Lake && lake.Add(n))
                        {
                            stack.Push(n);
                        }
                    }
                }

                var outflow = island.BogTiles.FirstOrDefault(t => t.Kind == BogTileKind.Mouth
                    && t.WaterEdges.Count == 1 && t.InDirections.Count == 1 && t.InDirections[0] == t.WaterEdges[0]
                    && lake.Contains(Step(t.Coord, t.WaterEdges[0])));
                if (outflow.Kind != BogTileKind.Mouth)
                {
                    return null;
                }

                current = Step(outflow.Coord, outflow.OutDirection!.Value);
                continue;
            }

            if (tile.OutDirection is not { } outDirection)
            {
                throw new Xunit.Sdk.XunitException($"the creek at {current} has no outflow");
            }

            current = Step(current, outDirection);
        }

        throw new Xunit.Sdk.XunitException("a creek loops");
    }

    [Fact]
    public void Every_river_path_ends_at_a_sea_mouth_never_inland()
    {
        // Regression: ResolveCollisions used to merge two rivers and drop the third at a
        // confluence, leaving a confluence with no outflow ("mouth" inland) on ~2% of rivers.
        var checkedIslands = 0;
        foreach (var (seed, island, sampler) in GreenIslands())
        {
            checkedIslands++;
            var byCoord = island.RiverTiles.ToDictionary(t => t.Coord);
            foreach (var spring in island.RiverTiles.Where(t => t.Shape == RiverTileShape.Spring))
            {
                var current = spring;
                var guard = 0;
                var ended = false;
                while (current.OutDirection is { } outDirection)
                {
                    Assert.True(guard++ < island.RiverTiles.Count, $"seed {seed}: river loops at {current.Coord}");
                    var nextCoord = Step(current.Coord, outDirection);
                    if (!byCoord.TryGetValue(nextCoord, out var next))
                    {
                        // A river may hand its water to a bog creek; the water comes back out of the lake (or ends in a pocket lake).
                        var back = ThroughBog(island, nextCoord, byCoord);
                        if (back is null)
                        {
                            ended = true;
                            break;
                        }

                        current = back.Value;
                        continue;
                    }

                    Assert.Contains((TileOrientation)(((int)outDirection + 3) % 6), next.InDirections);
                    current = next;
                }

                if (ended)
                {
                    continue;
                }

                Assert.Equal(RiverTileShape.Mouth, current.Shape);
                Assert.True(
                    current.Coord.Neighbours().Any(n => !sampler.IsLand(n)),
                    $"seed {seed} island {island.Index}: the river from {spring.Coord} ends at {current.Coord}, which does not touch the sea");
            }
        }

        Assert.True(checkedIslands >= 30, $"only {checkedIslands} islands with rivers were checked");
    }

    [Fact]
    public void Every_confluence_has_two_inflows_an_outflow_and_a_Y_the_art_can_draw()
    {
        var confluences = 0;
        foreach (var (seed, island, _) in GreenIslands())
        {
            foreach (var tile in island.RiverTiles.Where(t => t.Shape == RiverTileShape.Confluence))
            {
                confluences++;
                Assert.Equal(2, tile.InDirections.Count);
                Assert.NotNull(tile.OutDirection);
                Assert.True(
                    RiverConfluence.IsRepresentable((int)tile.InDirections[0], (int)tile.InDirections[1], (int)tile.OutDirection!.Value),
                    $"seed {seed}: confluence {tile.Coord} ins [{string.Join(",", tile.InDirections)}] out {tile.OutDirection} has no art");
            }
        }

        Assert.True(confluences > 0, "expected some merges across the worlds");
    }

    [Fact]
    public void A_stream_never_reaches_the_sea_or_meets_a_river()
    {
        var widenings = 0;
        var riverStreamJoins = 0;
        foreach (var (seed, island, sampler) in GreenIslands())
        {
            var byCoord = island.RiverTiles.ToDictionary(t => t.Coord);
            // A creek is river width, so a tile fed by one has a river upstream.
            bool UpstreamIsRiver(RiverTile t, TileOrientation d) => !byCoord.TryGetValue(Step(t.Coord, d), out var up) || up.Width != RiverWidth.Stream;

            foreach (var tile in island.RiverTiles)
            {
                var where = $"seed {seed} tile {tile.Coord} ({tile.Shape}, {tile.Width})";
                switch (tile.Width)
                {
                    case RiverWidth.Stream:
                        Assert.True(tile.Shape is RiverTileShape.Spring or RiverTileShape.Straight or RiverTileShape.Bend or RiverTileShape.Bend60, where);
                        Assert.All(tile.InDirections, d => Assert.False(UpstreamIsRiver(tile, d), where));
                        break;
                    case RiverWidth.Widen:
                        widenings++;
                        Assert.True(tile.Shape is RiverTileShape.Straight or RiverTileShape.Confluence or RiverTileShape.Mouth, where);
                        Assert.All(tile.InDirections, d => Assert.False(UpstreamIsRiver(tile, d), where));
                        if (tile.Shape == RiverTileShape.Mouth)
                        {
                            var opposite = (TileOrientation)(((int)tile.InDirections[0] + 3) % 6);
                            Assert.False(sampler.IsLand(Step(tile.Coord, opposite)), where + ": widening mouth must face the sea");
                        }

                        break;
                    case RiverWidth.RiverStream:
                        riverStreamJoins++;
                        Assert.Equal(RiverTileShape.Confluence, tile.Shape);
                        Assert.Equal(ConfluenceKind.Wide, RiverConfluence.Classify((int)tile.InDirections[0], (int)tile.InDirections[1], (int)tile.OutDirection!.Value));
                        Assert.Equal(1, tile.InDirections.Count(d => UpstreamIsRiver(tile, d)));
                        break;
                    default:
                        Assert.True(tile.Shape != RiverTileShape.Spring, where);
                        Assert.All(tile.InDirections, d => Assert.True(UpstreamIsRiver(tile, d), where));
                        break;
                }
            }
        }

        Assert.True(widenings > 0);
        Assert.True(riverStreamJoins > 0, "expected some streams joining a river at the wide Y");
    }

    [Fact]
    public void A_widening_straight_sits_in_the_second_half_of_its_stream_run()
    {
        var checkedWidenings = 0;
        foreach (var (seed, island, _) in GreenIslands())
        {
            var byCoord = island.RiverTiles.ToDictionary(t => t.Coord);
            foreach (var tile in island.RiverTiles.Where(t => t.Width == RiverWidth.Widen && t.Shape == RiverTileShape.Straight))
            {
                // Tiles above it in the run (a run is a pure chain up to its spring).
                var above = 0;
                var up = tile;
                while (up.InDirections.Count > 0 && byCoord.TryGetValue(Step(up.Coord, up.InDirections[0]), out var upstream))
                {
                    up = upstream;
                    above++;
                }

                // Tiles below it up to (excluding) the confluence or mouth the run feeds.
                // (A run that hands its water to a bog creek ends at that tile.)
                var below = 0;
                var cursor = tile;
                while (byCoord.TryGetValue(Step(cursor.Coord, cursor.OutDirection!.Value), out var next)
                    && next.Shape != RiverTileShape.Confluence && next.Shape != RiverTileShape.Mouth)
                {
                    below++;
                    cursor = next;
                }

                var runLength = above + 1 + below;
                checkedWidenings++;
                Assert.True(above >= 1, $"seed {seed}: widening {tile.Coord} is the spring");
                Assert.True(2 * above >= runLength, $"seed {seed}: widening {tile.Coord} at {above} of a {runLength}-tile run is in the first half");
            }
        }

        Assert.True(checkedWidenings > 5, $"only {checkedWidenings} widening straights across the seeds");
    }

    [Fact]
    public void Truncated_branches_and_dropped_rivers_are_rare()
    {
        var stats = new RiverGenerator.RiverStats();
        foreach (var seed in Seeds)
        {
            var world = TestWorlds.Default(seed);
            var sampler = new TerrainSampler(world.Options);
            foreach (var island in world.Islands.Where(i => !i.IsWasted))
            {
                RiverGenerator.Generate(island.Tiles, island.Tiles.ToDictionary(t => t, sampler.TerrainAt), sampler, world.Options, island.Index, stats: stats);
            }
        }

        Assert.True(stats.Rivers > 20, $"only {stats.Rivers} rivers");
        Assert.True(
            stats.TruncatedBranches + stats.DroppedRivers < 0.05 * stats.Rivers,
            $"{stats.TruncatedBranches} truncated + {stats.DroppedRivers} dropped of {stats.Rivers} rivers");
    }

    [Fact]
    public void Springs_are_spread_apart()
    {
        foreach (var (seed, island, _) in GreenIslands())
        {
            var springs = island.RiverTiles.Where(t => t.Shape == RiverTileShape.Spring).Select(t => t.Coord).ToList();
            for (var i = 0; i < springs.Count; i++)
            {
                for (var j = i + 1; j < springs.Count; j++)
                {
                    Assert.True(
                        HexCoord.Distance(springs[i], springs[j]) >= 8,
                        $"seed {seed}: springs {springs[i]} and {springs[j]} are closer than MinSpringSpacing");
                }
            }
        }
    }

    [Fact]
    public void Drainage_networks_merge_and_runs_do_not_hug()
    {
        var stats = new RiverGenerator.RiverStats();
        var islandsWithManyRivers = 0;
        var merges = 0;
        var adjacent = 0;
        var riverTiles = 0;
        foreach (var seed in Seeds)
        {
            var world = TestWorlds.Default(seed);
            var sampler = new TerrainSampler(world.Options);
            foreach (var island in world.Islands.Where(i => !i.IsWasted))
            {
                var local = new RiverGenerator.RiverStats();
                var tiles = RiverGenerator.Generate(island.Tiles, island.Tiles.ToDictionary(t => t, sampler.TerrainAt), sampler, world.Options, island.Index, stats: local);
                stats.Add(local);
                if (local.Rivers >= 4 && tiles.Count > 0)
                {
                    islandsWithManyRivers++;
                    merges += local.Merges;
                }

                // Adjacent tiles of rivers that drain to different mouths: runs that hug without merging.
                var byCoord = tiles.ToDictionary(t => t.Coord);
                string Root(RiverTile t)
                {
                    var cur = t;
                    while (cur.OutDirection is { } o && byCoord.TryGetValue(Step(cur.Coord, o), out var next))
                    {
                        cur = next;
                    }

                    return cur.Coord.ToString();
                }

                var roots = tiles.ToDictionary(t => t.Coord, Root);
                riverTiles += tiles.Count;
                foreach (var t in tiles)
                {
                    foreach (var n in t.Coord.Neighbours())
                    {
                        if (roots.TryGetValue(n, out var other) && roots[t.Coord] != other && n.Q * 100000L + n.R > t.Coord.Q * 100000L + t.Coord.R)
                        {
                            adjacent++;
                        }
                    }
                }
            }
        }

        Assert.True(islandsWithManyRivers >= 20, $"only {islandsWithManyRivers} islands with >= 4 rivers");
        Assert.True(merges >= islandsWithManyRivers, $"{merges} merges over {islandsWithManyRivers} islands with >= 4 rivers");
        Assert.True(adjacent < 0.03 * riverTiles, $"{adjacent} hugging adjacencies over {riverTiles} river tiles");
    }

    [Fact]
    public void Lava_rivers_stay_river_width()
    {
        foreach (var seed in Seeds)
        {
            var world = TestWorlds.Default(seed);
            foreach (var island in world.Islands.Where(i => i.IsWasted))
            {
                Assert.All(island.RiverTiles, t => Assert.Equal(RiverWidth.River, t.Width));
            }
        }
    }

    [Theory]
    [InlineData(2, 3, 0, ConfluenceKind.Narrow)]
    [InlineData(3, 2, 0, ConfluenceKind.Narrow)]
    [InlineData(5, 0, 3, ConfluenceKind.Narrow)] // out 3: ins at offsets 2 and 3
    [InlineData(2, 4, 0, ConfluenceKind.Wide)]
    [InlineData(4, 2, 0, ConfluenceKind.Wide)]
    [InlineData(3, 5, 1, ConfluenceKind.Wide)]
    [InlineData(3, 4, 0, null)] // the mirror of the narrow Y has no art
    [InlineData(1, 2, 0, null)]
    [InlineData(0, 3, 1, null)]
    public void Confluence_classification(int a, int b, int o, ConfluenceKind? expected)
    {
        Assert.Equal(expected, RiverConfluence.Classify(a, b, o));
    }
}
