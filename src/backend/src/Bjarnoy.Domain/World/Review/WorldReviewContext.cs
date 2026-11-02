namespace Bjarnoy.Domain.World.Review;

/// <summary>
/// What every review check reads: the world, a terrain sampler for it, and per green island the terrain the game sees (seed
/// terrain with the bog laid over it), its rivers by hex and its landing candidates. Built once, in parallel, before the checks run.
/// </summary>
public sealed class WorldReviewContext
{
    private long _walkableTiles;
    private long _cutOffTiles;

    public WorldReviewContext(GeneratedWorld world, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(world);
        World = world;
        Sampler = new TerrainSampler(world.Options);

        var green = world.Islands.Where(i => !i.IsWasted).ToList();
        var views = new ReviewedIsland[green.Count];
        Parallel.For(
            0,
            green.Count,
            new ParallelOptions { CancellationToken = cancellationToken },
            i => views[i] = new ReviewedIsland(green[i], Sampler));
        GreenIslands = views;
    }

    public GeneratedWorld World { get; }

    public WorldGenerationOptions Options => World.Options;

    /// <summary>The seed's own terrain, without any bog (what <see cref="BogRules"/> and the inland-mouth rule read).</summary>
    public TerrainSampler Sampler { get; }

    /// <summary>Every green island, in index order.</summary>
    public IReadOnlyList<ReviewedIsland> GreenIslands { get; }

    /// <summary>Walkable hexes over every green island under the cut-off rules (set by the cut-off check).</summary>
    public long WalkableTiles => Interlocked.Read(ref _walkableTiles);

    /// <summary>Cut-off walkable hexes over every green island, regions of any size (set by the cut-off check).</summary>
    public long CutOffTiles => Interlocked.Read(ref _cutOffTiles);

    /// <summary>The largest share of one island's walkable land that is cut off (set by the cut-off check).</summary>
    public double WorstIslandCutOffShare { get; private set; }

    private readonly Lock _shareLock = new();

    internal void AddCutOff(long walkable, long cutOff)
    {
        Interlocked.Add(ref _walkableTiles, walkable);
        Interlocked.Add(ref _cutOffTiles, cutOff);
        if (walkable > 0)
        {
            var share = (double)cutOff / walkable;
            lock (_shareLock)
            {
                WorstIslandCutOffShare = Math.Max(WorstIslandCutOffShare, share);
            }
        }
    }
}

/// <summary>A green island as the review reads it.</summary>
public sealed class ReviewedIsland
{
    internal ReviewedIsland(GeneratedIsland island, TerrainSampler sampler)
        : this(island, sampler.TerrainAt)
    {
    }

    /// <summary>An island over any base terrain (tests build islands by hand).</summary>
    internal ReviewedIsland(GeneratedIsland island, Func<HexCoord, Terrain> baseTerrain)
    {
        Island = island;
        BaseLand = new Dictionary<HexCoord, Terrain>(island.Tiles.Count);
        foreach (var tile in island.Tiles)
        {
            BaseLand[tile] = baseTerrain(tile);
        }

        Land = BogTerrain.Overlay(BaseLand, island.BogTiles);
        Rivers = new Dictionary<HexCoord, RiverTile>(island.RiverTiles.Count);
        foreach (var river in island.RiverTiles)
        {
            Rivers[river.Coord] = river;
        }

        BogLakes = island.BogTiles.Where(t => t.Kind == BogTileKind.Lake).Select(t => t.Coord).ToHashSet();
        LandingCandidates = LandingCandidatesOf(island.Tiles, BaseLand);
    }

    public GeneratedIsland Island { get; }

    public int Index => Island.Index;

    /// <summary>The seed's terrain of every land hex, before the bog.</summary>
    public Dictionary<HexCoord, Terrain> BaseLand { get; }

    /// <summary>The terrain the game sees: <see cref="BaseLand"/> with bog moss and bog lakes laid over it.</summary>
    public Dictionary<HexCoord, Terrain> Land { get; }

    public Dictionary<HexCoord, RiverTile> Rivers { get; }

    /// <summary>Bog lake hexes, including enclosed sea pockets turned into a lake (those are not in <see cref="Land"/>).</summary>
    public HashSet<HexCoord> BogLakes { get; }

    /// <summary>
    /// Landing-spot candidates by terrain alone, on the seed terrain before the bog: the bog guarantee's own definition
    /// (<see cref="BogGenerator"/>, <c>GuaranteeCandidates</c>) - grass with a forest and two grass neighbours and no water
    /// within two hexes. Giants, strong camps and the bog-in-reach rule are not applied.
    /// </summary>
    public IReadOnlyList<HexCoord> LandingCandidates { get; }

    internal static List<HexCoord> LandingCandidatesOf(IReadOnlyList<HexCoord> tiles, Dictionary<HexCoord, Terrain> land)
    {
        var result = new List<HexCoord>();
        foreach (var tile in tiles)
        {
            if (land[tile] != Terrain.Grass)
            {
                continue;
            }

            var forest = 0;
            var grass = 0;
            foreach (var n in tile.Neighbours())
            {
                if (land.TryGetValue(n, out var terrain))
                {
                    if (terrain == Terrain.Forest)
                    {
                        forest++;
                    }
                    else if (terrain == Terrain.Grass)
                    {
                        grass++;
                    }
                }
            }

            if (forest < 1 || grass < 2)
            {
                continue;
            }

            var coastal = false;
            foreach (var nearby in tile.WithinRadius(2))
            {
                if (!land.ContainsKey(nearby))
                {
                    coastal = true;
                    break;
                }
            }

            if (!coastal)
            {
                result.Add(tile);
            }
        }

        return result;
    }

    /// <summary>The tile nearest the average position of <paramref name="tiles"/>: a region's representative hex.</summary>
    internal static HexCoord Middle(IReadOnlyCollection<HexCoord> tiles)
    {
        double q = 0;
        double r = 0;
        foreach (var t in tiles)
        {
            q += t.Q;
            r += t.R;
        }

        q /= tiles.Count;
        r /= tiles.Count;
        var best = default(HexCoord);
        var bestDistance = double.MaxValue;
        foreach (var t in tiles)
        {
            var d = ((t.Q - q) * (t.Q - q)) + ((t.R - r) * (t.R - r));
            if (d < bestDistance || (d == bestDistance && (t.Q < best.Q || (t.Q == best.Q && t.R < best.R))))
            {
                bestDistance = d;
                best = t;
            }
        }

        return best;
    }
}
