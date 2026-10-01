using System.Globalization;

namespace Bjarnoy.Domain.World.Review;

/// <summary>
/// Cut-off land: per green island, the walkable hexes a land army cannot reach from the island's coast or its landing spots
/// when wide rivers and mountains are impassable - the rule set PR #366's pathing preview draws. Each connected region of
/// unreachable walkable land of at least <see cref="WorldReviewThresholds.CutOffMinRegionTiles"/> hexes is one finding.
/// </summary>
/// <remarks>
/// The definitions mirror #366's <c>scripts/worldgen-preview/pathing-world.ts</c> and <c>pathing-cutoff.ts</c> exactly:
/// a hex is <em>walkable</em> when its terrain (bog laid over the seed terrain) is grass, sand, forest or bog moss and it is
/// not a wide river hex; mountains and bog lakes never are. A river hex is <em>wide</em> (<see cref="IsWideRiver"/>) when at
/// least two of its arms are river width. Where this differs from #366's statistic is the start of the fill: #366 measures
/// what lies outside each island's largest walkable region, this check what a ship-borne army cannot walk to from any
/// shore (a walkable hex beside the open sea) or landing spot - a valley that opens onto a beach is reachable by sea.
/// </remarks>
public sealed class CutOffLandCheck : IWorldReviewCheck
{
    public void Run(WorldReviewContext context, IList<WorldReviewFinding> findings, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(findings);

        var perIsland = new List<WorldReviewFinding>[context.GreenIslands.Count];
        Parallel.For(
            0,
            context.GreenIslands.Count,
            new ParallelOptions { CancellationToken = cancellationToken },
            i => perIsland[i] = Measure(context, context.GreenIslands[i]));

        foreach (var list in perIsland)
        {
            foreach (var finding in list)
            {
                findings.Add(finding);
            }
        }
    }

    private static List<WorldReviewFinding> Measure(WorldReviewContext context, ReviewedIsland island)
    {
        var regions = CutOffRegions(island, out var walkableCount);
        var cutOff = regions.Sum(r => r.Count);
        context.AddCutOff(walkableCount, cutOff);

        var result = new List<WorldReviewFinding>();
        foreach (var region in regions.Where(r => r.Count >= WorldReviewThresholds.CutOffMinRegionTiles))
        {
            var share = walkableCount == 0 ? 0.0 : (double)region.Count / walkableCount;
            var severity = region.Count >= WorldReviewThresholds.CutOffErrorRegionTiles
                ? WorldReviewSeverity.Error
                : region.Count >= WorldReviewThresholds.CutOffWarnRegionTiles || share >= WorldReviewThresholds.CutOffWarnIslandShare
                    ? WorldReviewSeverity.Warn
                    : WorldReviewSeverity.Info;
            result.Add(new WorldReviewFinding(
                WorldReviewFindingKind.CutOffLand,
                severity,
                island.Index,
                ReviewedIsland.Middle(region),
                string.Create(
                    CultureInfo.InvariantCulture,
                    $"{region.Count} walkable hexes cut off by mountains and wide rivers ({share:P1} of the island's walkable land)"),
                region.Count));
        }

        return result;
    }

    /// <summary>
    /// Every connected region of walkable land on <paramref name="island"/> not reachable from its shore or its landing spots,
    /// largest first (ties by lowest hex), each region in (Q, R) order.
    /// </summary>
    public static List<List<HexCoord>> CutOffRegions(ReviewedIsland island, out int walkableCount)
    {
        ArgumentNullException.ThrowIfNull(island);

        var walkable = new HashSet<HexCoord>();
        foreach (var (coord, terrain) in island.Land)
        {
            if (IsWalkable(terrain) && !(island.Rivers.TryGetValue(coord, out var river) && IsWideRiver(river, island.Rivers)))
            {
                walkable.Add(coord);
            }
        }

        walkableCount = walkable.Count;

        // Start from every walkable hex on the open sea (a bog lake, pocket lakes included, is not a shore) and every landing spot.
        var reached = new HashSet<HexCoord>();
        var stack = new Stack<HexCoord>();
        foreach (var coord in walkable)
        {
            foreach (var n in coord.Neighbours())
            {
                if (!island.Land.ContainsKey(n) && !island.BogLakes.Contains(n))
                {
                    if (reached.Add(coord))
                    {
                        stack.Push(coord);
                    }

                    break;
                }
            }
        }

        foreach (var spot in island.Island.StartPositions)
        {
            if (walkable.Contains(spot) && reached.Add(spot))
            {
                stack.Push(spot);
            }
        }

        Fill(stack, walkable, reached);

        var regions = new List<List<HexCoord>>();
        foreach (var coord in island.Island.Tiles)
        {
            if (!walkable.Contains(coord) || reached.Contains(coord))
            {
                continue;
            }

            var region = new List<HexCoord>();
            reached.Add(coord);
            stack.Push(coord);
            while (stack.TryPop(out var c))
            {
                region.Add(c);
                foreach (var n in c.Neighbours())
                {
                    if (walkable.Contains(n) && reached.Add(n))
                    {
                        stack.Push(n);
                    }
                }
            }

            region.Sort(static (a, b) => a.Q != b.Q ? a.Q.CompareTo(b.Q) : a.R.CompareTo(b.R));
            regions.Add(region);
        }

        regions.Sort(static (a, b) => a.Count != b.Count
            ? b.Count.CompareTo(a.Count)
            : a[0].Q != b[0].Q ? a[0].Q.CompareTo(b[0].Q) : a[0].R.CompareTo(b[0].R));
        return regions;
    }

    private static void Fill(Stack<HexCoord> stack, HashSet<HexCoord> walkable, HashSet<HexCoord> reached)
    {
        while (stack.TryPop(out var c))
        {
            foreach (var n in c.Neighbours())
            {
                if (walkable.Contains(n) && reached.Add(n))
                {
                    stack.Push(n);
                }
            }
        }
    }

    /// <summary>Land a land army may enter under #366's rules, before the wide-river test: grass, sand, forest and bog moss.</summary>
    public static bool IsWalkable(Terrain terrain) => terrain is Terrain.Grass or Terrain.Sand or Terrain.Forest or Terrain.Bog;

    /// <summary>
    /// #366's <c>isWideRiverTile</c>: at least two of the tile's arms are river width. An in-arm is river width when the
    /// upstream river tile flows out as a river (every width but <see cref="RiverWidth.Stream"/>), or, with no river tile
    /// upstream (a lake or creek feeding it), when the tile itself is <see cref="RiverWidth.River"/>. The out-arm (a mouth's
    /// sea side counts as one) is river width when the tile flows out as a river. So river tiles and river-stream Ys are wide;
    /// widen tiles, stream-stream confluences and plain streams are not.
    /// </summary>
    public static bool IsWideRiver(RiverTile tile, IReadOnlyDictionary<HexCoord, RiverTile> rivers)
    {
        ArgumentNullException.ThrowIfNull(rivers);

        static bool FlowsOutAsRiver(RiverTile t) => t.Width != RiverWidth.Stream;

        var river = 0;
        foreach (var d in tile.InDirections)
        {
            var upstream = tile.Coord + HexCoord.Directions[(int)d];
            var isRiver = rivers.TryGetValue(upstream, out var up) ? FlowsOutAsRiver(up) : tile.Width == RiverWidth.River;
            if (isRiver)
            {
                river++;
            }
        }

        if ((tile.OutDirection is not null || tile.Shape == RiverTileShape.Mouth) && FlowsOutAsRiver(tile))
        {
            river++;
        }

        return river >= 2;
    }
}
