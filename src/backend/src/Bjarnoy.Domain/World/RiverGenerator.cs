namespace Bjarnoy.Domain.World;

/// <summary>
/// Traces rivers for a single island: spring placement on mountain clusters,
/// a funnel-to-coast walk with a meander term, a minimum-length filter, and a
/// merge-two/drop-the-third rule for paths that collide. See
/// <c>docs/design/river-generation.md</c> for the full rationale — this is a
/// direct implementation of that doc, not an independent design.
/// </summary>
internal static class RiverGenerator
{
    public static IReadOnlyList<RiverTile> Generate(
        IReadOnlyList<HexCoord> islandTiles,
        Dictionary<HexCoord, Terrain> land,
        TerrainSampler sampler,
        WorldGenerationOptions options,
        int islandIndex)
    {
        var islandLand = new HashSet<HexCoord>(islandTiles);

        // Large prime spacing so two islands never draw from overlapping
        // noise, the same trick IslandNames uses for its own per-index offset.
        var seed = options.Seed + (islandIndex * 104_729);

        var springs = new List<HexCoord>();
        foreach (var cluster in ClusterMountains(islandTiles, land))
        {
            if (cluster.Count < 2)
            {
                continue;
            }

            springs.Add(PickSpring(cluster, seed));
        }

        var paths = new List<List<HexCoord>>();
        foreach (var spring in springs)
        {
            var path = TracePath(spring, islandLand, sampler, options, seed);
            if (path.Count >= options.MinRiverLength)
            {
                paths.Add(path);
            }
        }

        var survivors = ResolveCollisions(paths, options);
        return BuildRiverTiles(survivors);
    }

    /// <summary>Connected groups of mountain tiles within one island (mountain-to-mountain adjacency only).</summary>
    private static List<List<HexCoord>> ClusterMountains(
        IReadOnlyList<HexCoord> islandTiles,
        Dictionary<HexCoord, Terrain> land)
    {
        var mountains = new HashSet<HexCoord>();
        foreach (var tile in islandTiles)
        {
            if (land[tile] == Terrain.Mountain)
            {
                mountains.Add(tile);
            }
        }

        var visited = new HashSet<HexCoord>();
        var clusters = new List<List<HexCoord>>();

        // Sorted scan order keeps cluster (and therefore spring) assignment
        // stable for a given seed, the same reasoning WorldGenerator.Generate
        // applies to island indices.
        foreach (var start in mountains.OrderBy(c => c.Q).ThenBy(c => c.R))
        {
            if (!visited.Add(start))
            {
                continue;
            }

            var cluster = new List<HexCoord>();
            var pending = new Stack<HexCoord>();
            pending.Push(start);

            while (pending.TryPop(out var coord))
            {
                cluster.Add(coord);
                foreach (var neighbour in coord.Neighbours())
                {
                    if (mountains.Contains(neighbour) && visited.Add(neighbour))
                    {
                        pending.Push(neighbour);
                    }
                }
            }

            clusters.Add(cluster);
        }

        return clusters;
    }

    /// <summary>The highest seed-hash-scored tile in a qualifying cluster.</summary>
    private static HexCoord PickSpring(List<HexCoord> cluster, int seed)
    {
        var best = cluster[0];
        var bestScore = -1.0;

        foreach (var coord in cluster.OrderBy(c => c.Q).ThenBy(c => c.R))
        {
            var score = ValueNoise.Hash2(coord.Q, coord.R, seed + 41);
            if (score > bestScore)
            {
                bestScore = score;
                best = coord;
            }
        }

        return best;
    }

    /// <summary>
    /// Walks from a spring toward the coast: never steps to a lower-depth
    /// neighbour (so it can't loop or backtrack), scores the rest by depth
    /// plus a meander noise term, and stops the step *before* it would leave
    /// land, so the last tile in the path is always the river's mouth.
    /// </summary>
    private static List<HexCoord> TracePath(
        HexCoord spring,
        HashSet<HexCoord> islandLand,
        TerrainSampler sampler,
        WorldGenerationOptions options,
        int seed)
    {
        var path = new List<HexCoord> { spring };
        var visited = new HashSet<HexCoord> { spring };
        var current = spring;

        // islandLand.Count is a hard upper bound on path length (visited
        // tiles are never revisited), so this can't loop forever.
        for (var step = 0; step < islandLand.Count; step++)
        {
            var touchesSea = false;
            foreach (var neighbour in current.Neighbours())
            {
                if (!sampler.IsLand(neighbour))
                {
                    touchesSea = true;
                    break;
                }
            }

            if (touchesSea)
            {
                break;
            }

            var currentDepth = sampler.IslandDepthAt(current) ?? 0.0;
            HexCoord? bestCandidate = null;
            var bestScore = double.NegativeInfinity;

            foreach (var neighbour in current.Neighbours())
            {
                if (!islandLand.Contains(neighbour) || visited.Contains(neighbour))
                {
                    continue;
                }

                var depth = sampler.IslandDepthAt(neighbour);
                if (depth is null || depth < currentDepth)
                {
                    continue;
                }

                var noise = ValueNoise.Hash2(neighbour.Q, neighbour.R, seed + 43);
                var score = depth.Value + (options.RiverMeanderWeight * noise);

                if (score > bestScore)
                {
                    bestScore = score;
                    bestCandidate = neighbour;
                }
            }

            if (bestCandidate is not { } next)
            {
                // Dead end: no non-decreasing-depth land neighbour left to
                // take, and not coastal yet either. Stop with what we have.
                break;
            }

            path.Add(next);
            visited.Add(next);
            current = next;
        }

        return path;
    }

    /// <summary>
    /// Deterministic-priority pass over independently-traced paths: the
    /// first two to reach a tile share it (a confluence); a path is
    /// truncated the moment it reaches a tile already claimed twice, and
    /// discarded if that leaves it under the minimum length.
    /// </summary>
    private static List<List<HexCoord>> ResolveCollisions(
        List<List<HexCoord>> paths,
        WorldGenerationOptions options)
    {
        var ordered = paths.OrderBy(p => p[0].Q).ThenBy(p => p[0].R).ToList();
        var claimCount = new Dictionary<HexCoord, int>();
        var survivors = new List<List<HexCoord>>();

        foreach (var path in ordered)
        {
            var truncated = new List<HexCoord>();

            foreach (var tile in path)
            {
                var count = claimCount.GetValueOrDefault(tile);
                if (count >= 2)
                {
                    break;
                }

                truncated.Add(tile);
                claimCount[tile] = count + 1;

                if (count >= 1)
                {
                    // This tile just became a confluence: this path merges
                    // into whichever path already owns it rather than
                    // continuing past it as an independent line.
                    break;
                }
            }

            if (truncated.Count >= options.MinRiverLength)
            {
                survivors.Add(truncated);
            }
        }

        return survivors;
    }

    private static List<RiverTile> BuildRiverTiles(List<List<HexCoord>> paths)
    {
        var inDirections = new Dictionary<HexCoord, List<TileOrientation>>();
        var outDirection = new Dictionary<HexCoord, TileOrientation>();
        var allTiles = new HashSet<HexCoord>();

        foreach (var path in paths)
        {
            for (var i = 0; i < path.Count; i++)
            {
                var tile = path[i];
                allTiles.Add(tile);

                if (i > 0)
                {
                    var previous = path[i - 1];
                    var direction = (TileOrientation)DirectionIndex(tile, previous);
                    if (!inDirections.TryGetValue(tile, out var list))
                    {
                        list = [];
                        inDirections[tile] = list;
                    }

                    list.Add(direction);
                }

                if (i < path.Count - 1)
                {
                    var next = path[i + 1];
                    outDirection[tile] = (TileOrientation)DirectionIndex(tile, next);
                }
            }
        }

        var result = new List<RiverTile>();
        foreach (var tile in allTiles.OrderBy(t => t.Q).ThenBy(t => t.R))
        {
            var ins = inDirections.TryGetValue(tile, out var list)
                ? (IReadOnlyList<TileOrientation>)list
                : [];
            var hasOut = outDirection.TryGetValue(tile, out var outDir);

            RiverTileShape shape;
            if (ins.Count == 0)
            {
                shape = RiverTileShape.Spring;
            }
            else if (ins.Count >= 2)
            {
                shape = RiverTileShape.Confluence;
            }
            else if (!hasOut)
            {
                shape = RiverTileShape.Mouth;
            }
            else
            {
                var opposite = ((int)ins[0] + 3) % 6;
                shape = opposite == (int)outDir ? RiverTileShape.Straight : RiverTileShape.Bend;
            }

            result.Add(new RiverTile(tile, shape, ins, hasOut ? outDir : null));
        }

        return result;
    }

    /// <summary>The direction index (0-5, matching <see cref="TileOrientation"/>) from one hex to an adjacent one.</summary>
    private static int DirectionIndex(HexCoord from, HexCoord to)
    {
        var neighbours = from.Neighbours();
        for (var i = 0; i < neighbours.Length; i++)
        {
            if (neighbours[i] == to)
            {
                return i;
            }
        }

        throw new InvalidOperationException($"{to} is not a neighbour of {from}");
    }
}
