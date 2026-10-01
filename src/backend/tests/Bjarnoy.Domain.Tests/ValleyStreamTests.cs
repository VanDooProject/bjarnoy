using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Valley streams (docs/design/river-generation.md, "Valley streams"): a stream out of every mountain-enclosed valley of at
/// least <see cref="RiverGenerator.ValleyMinHexes"/> hexes. These run on a hand-built island - a disc of grass with a ring of
/// mountains round a valley - so the valley's size, border and neighbours are exactly what the test says. The twin of the
/// frontend's <c>valleyStreams.test.ts</c>, with the same island and seeds.
/// </summary>
public class ValleyStreamTests
{
    private const int Radius = 15;
    private const int ValleyRadius = 6; // 127 hexes

    /// <summary>A world seed for which the island's one outer-rim spring leaves the valley alone (checked by the first test).</summary>
    private const int Seed = 6;

    /// <summary>One where the nearest reachable hex across the ring is a river tile, so the stream joins it.</summary>
    private const int JoiningSeed = 12;

    private static readonly HexCoord Origin = new(0, 0);

    /// <summary>How many valley streams a generated island carries (their springs are extra to the picked ones).</summary>
    internal static int ValleyStreamsOf(GeneratedIsland island, WorldGenerationOptions options)
    {
        var sampler = new TerrainSampler(options);
        var land = island.Tiles.ToDictionary(t => t, t => sampler.TerrainAt(t));
        var stats = new RiverGenerator.RiverStats();
        RiverGenerator.GenerateWithBogs(island.Tiles, land, sampler, options, island.Index, stats: stats);
        return stats.ValleyStreams;
    }

    private sealed record Isle(List<HexCoord> Tiles, Dictionary<HexCoord, Terrain> Land, HashSet<HexCoord> Valley);

    private static List<HexCoord> Disc(int radius)
    {
        var tiles = new List<HexCoord>();
        for (var q = -radius; q <= radius; q++)
        {
            for (var r = Math.Max(-radius, -q - radius); r <= Math.Min(radius, -q + radius); r++)
            {
                tiles.Add(new HexCoord(q, r));
            }
        }

        return tiles;
    }

    /// <summary>A disc island: a grass valley of <paramref name="valleyHexes"/> hexes (the hexagon of radius 6 trimmed from its rim), three rings of mountain, grass and a sand rim.</summary>
    private static Isle Island(int valleyHexes)
    {
        var tiles = Disc(Radius);
        var valleyDisc = Disc(ValleyRadius);
        var rim = valleyDisc.Where(c => HexCoord.Distance(Origin, c) == ValleyRadius).OrderBy(c => c.Q).ThenBy(c => c.R).ToList();
        var trimmed = rim.Take(valleyDisc.Count - valleyHexes).ToHashSet();
        var valley = valleyDisc.Where(c => !trimmed.Contains(c)).ToHashSet();
        var land = new Dictionary<HexCoord, Terrain>();
        foreach (var c in tiles)
        {
            var d = HexCoord.Distance(Origin, c);
            land[c] = valley.Contains(c) ? Terrain.Grass
                : d <= ValleyRadius + 3 ? Terrain.Mountain
                : d >= Radius - 1 ? Terrain.Sand
                : Terrain.Grass;
        }

        return new Isle(tiles, land, valley);
    }

    private static (RiverGenerator.Result Result, RiverGenerator.RiverStats Stats) Generate(Isle isle, int seed)
    {
        var stats = new RiverGenerator.RiverStats();
        var result = RiverGenerator.GenerateGreen(
            isle.Tiles,
            isle.Land,
            new HashSet<HexCoord>(isle.Tiles),
            c => (Radius - HexCoord.Distance(Origin, c)) / (double)Radius, // only picks the first spring (the lowest): inverted, it puts the one spring on the ring's outer edge
            c => HexCoord.Distance(Origin, c) <= Radius,
            WorldGenerationOptions.ForSeed(seed),
            seed,
            stats);
        return (result, stats);
    }

    /// <summary>The hexes a land army can reach from the island's rim: land that is not mountain, plus every river tile that is not wide.</summary>
    private static HashSet<HexCoord> ReachableFromCoast(Isle isle, IReadOnlyList<RiverTile> rivers)
    {
        var riverAt = rivers.ToDictionary(t => t.Coord);
        bool Walkable(HexCoord c) =>
            riverAt.TryGetValue(c, out var t) ? !RiverGenerator.IsWideRiver(t, riverAt) : isle.Land[c] != Terrain.Mountain;

        var start = new HexCoord(Radius - 3, 0);
        var seen = new HashSet<HexCoord> { start };
        var queue = new List<HexCoord> { start };
        for (var i = 0; i < queue.Count; i++)
        {
            foreach (var n in queue[i].Neighbours())
            {
                if (HexCoord.Distance(Origin, n) <= Radius && !seen.Contains(n) && Walkable(n))
                {
                    seen.Add(n);
                    queue.Add(n);
                }
            }
        }

        return seen;
    }

    [Fact]
    public void A_stream_leaves_a_ringed_valley_of_100_plus_hexes_and_ends_in_the_sea()
    {
        var isle = Island(127);
        Assert.True(isle.Valley.Count >= RiverGenerator.ValleyMinHexes);
        var (result, stats) = Generate(isle, Seed);

        Assert.Equal(1, stats.ValleyCandidates);
        Assert.Equal(1, stats.ValleyStreams);
        var reachable = ReachableFromCoast(isle, result.Rivers);
        Assert.All(isle.Valley, c => Assert.Contains(c, reachable));

        // Exactly one spring in the valley; following its water leads over mountains and ends at a mouth on the coast.
        var cur = Assert.Single(result.Rivers, t => t.Shape == RiverTileShape.Spring && isle.Valley.Contains(t.Coord));
        var byCoord = result.Rivers.ToDictionary(t => t.Coord);
        var overMountain = 0;
        for (var guard = 0; cur.OutDirection is { } o && guard < 1000; guard++)
        {
            if (isle.Land[cur.Coord] == Terrain.Mountain)
            {
                overMountain++;
            }

            cur = byCoord[cur.Coord + HexCoord.Directions[(int)o]];
        }

        Assert.True(overMountain >= 1);
        Assert.Equal(RiverTileShape.Mouth, cur.Shape);
        Assert.Contains(cur.Coord.Neighbours(), n => HexCoord.Distance(Origin, n) > Radius);
    }

    [Fact]
    public void A_stream_joins_the_river_it_meets_on_the_far_side_of_the_mountains()
    {
        var isle = Island(127);
        var (result, stats) = Generate(isle, JoiningSeed);

        Assert.Equal(1, stats.ValleyStreams);
        Assert.Equal(1, stats.ValleyStreamsIntoRivers);
        var reachable = ReachableFromCoast(isle, result.Rivers);
        Assert.All(isle.Valley, c => Assert.Contains(c, reachable));
        Assert.Single(result.Rivers, t => t.Shape == RiverTileShape.Spring && isle.Valley.Contains(t.Coord));
        Assert.Contains(result.Rivers, t => t.Shape == RiverTileShape.Confluence);
    }

    [Fact]
    public void A_valley_of_99_hexes_is_left_alone()
    {
        var isle = Island(99);
        Assert.Equal(99, isle.Valley.Count);
        var (result, stats) = Generate(isle, Seed);

        Assert.Equal(0, stats.ValleyCandidates);
        Assert.Equal(0, stats.ValleyStreams);
        Assert.DoesNotContain(result.Rivers, t => isle.Valley.Contains(t.Coord));
        Assert.DoesNotContain(Origin, ReachableFromCoast(isle, result.Rivers));
    }

    [Fact]
    public void A_valley_with_a_wide_river_on_its_border_is_not_a_candidate()
    {
        var isle = Island(127);
        var none = RiverGenerator.ValleyCandidates(isle.Tiles, isle.Land, [], []);
        var only = Assert.Single(none);
        Assert.Equal(127, only.Size);

        // A river-width tile in the mountain ring beside the valley is a wall of its own, not a mountain.
        var at = new HexCoord(ValleyRadius + 1, 0);
        RiverTile Tile(RiverWidth width) => new(at, RiverTileShape.Straight, [TileOrientation.W], TileOrientation.E, width);
        Assert.Empty(RiverGenerator.ValleyCandidates(isle.Tiles, isle.Land, [Tile(RiverWidth.River)], []));
        // A stream there is walkable and joins the valley instead: still enclosed by mountains.
        Assert.Single(RiverGenerator.ValleyCandidates(isle.Tiles, isle.Land, [Tile(RiverWidth.Stream)], []));
    }

    [Fact]
    public void The_same_seed_gives_the_same_rivers_twice()
    {
        var (a, statsA) = Generate(Island(127), Seed);
        var (b, statsB) = Generate(Island(127), Seed);

        Assert.Equal(a.Rivers.Count, b.Rivers.Count);
        Assert.True(a.Rivers.SequenceEqual(b.Rivers));
        Assert.Equal(statsA.ValleyStreams, statsB.ValleyStreams);
        Assert.Equal(1, statsA.ValleyStreams);
    }
}
