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
    /// <summary>Counters a caller can pass to <see cref="Generate"/> to see what the tracer did (tests, the preview tool).</summary>
    internal sealed class RiverStats
    {
        public int Springs;
        public int Rivers;
        public int Merges;
        public int Widenings;
        public int TruncatedBranches;
        public int DroppedRivers;
    }

    public static IReadOnlyList<RiverTile> Generate(
        IReadOnlyList<HexCoord> islandTiles,
        Dictionary<HexCoord, Terrain> land,
        TerrainSampler sampler,
        WorldGenerationOptions options,
        int islandIndex,
        bool wasted = false,
        bool allowConfluence = true,
        RiverStats? stats = null)
    {
        var islandLand = new HashSet<HexCoord>(islandTiles);

        // Large prime spacing so two islands never draw from overlapping
        // noise, the same trick IslandNames uses for its own per-index offset.
        var seed = options.Seed + (islandIndex * 104_729);

        // Wasted islands use the wasted-depth field (their own separate cell
        // grid); green islands use the ordinary one. Passed through rather
        // than branching inline everywhere depth is sampled, so a green
        // island's trace is untouched byte-for-byte.
        Func<HexCoord, double?> depthAt = wasted ? sampler.WastedDepthAt : sampler.IslandDepthAt;

        // Sea/coast detection. TerrainAt (and therefore sampler.IsLand)
        // reports wasted land as Sea, so a wasted island's own trace must
        // check its land set directly instead — but a green island's trace
        // keeps sampler.IsLand exactly as before (rather than islandLand),
        // since a hex just past the world's generation radius can still
        // sample as land there even though it was never flood-filled into
        // any island's tile list, and treating it as "sea" would truncate a
        // river a hex early right at the map edge.
        Func<HexCoord, bool> isLand = wasted ? islandLand.Contains : sampler.IsLand;

        if (wasted || !allowConfluence)
        {
            return GenerateLegacy(islandTiles, land, islandLand, depthAt, isLand, options, seed, wasted, allowConfluence);
        }

        return GenerateGreen(islandTiles, land, islandLand, depthAt, isLand, options, seed, stats);
    }

    /// <summary>
    /// Lava (wasted) rivers, unchanged: one spring per mountain cluster, independent walks, no
    /// merging, river width everywhere.
    /// </summary>
    private static IReadOnlyList<RiverTile> GenerateLegacy(
        IReadOnlyList<HexCoord> islandTiles,
        Dictionary<HexCoord, Terrain> land,
        HashSet<HexCoord> islandLand,
        Func<HexCoord, double?> depthAt,
        Func<HexCoord, bool> isLand,
        WorldGenerationOptions options,
        int seed,
        bool wasted,
        bool allowConfluence)
    {
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
            var path = TracePath(spring, islandLand, depthAt, isLand, options, seed, null, null, out var outcome);
            if (outcome == TraceOutcome.Sea && path.Count >= options.MinRiverLength)
            {
                paths.Add(path);
            }
        }

        var survivors = ResolveCollisions(paths, options, allowConfluence);
        return BuildRiverTiles(survivors).Select(n => n.ToTile(RiverWidth.River)).ToList();
    }

    /// <summary>
    /// Green islands: farthest-first springs, sequential merge-aware tracing, then a width pass
    /// (stream -> widening -> river). See <c>docs/design/river-generation.md</c>.
    /// </summary>
    private static IReadOnlyList<RiverTile> GenerateGreen(
        IReadOnlyList<HexCoord> islandTiles,
        Dictionary<HexCoord, Terrain> land,
        HashSet<HexCoord> islandLand,
        Func<HexCoord, double?> depthAt,
        Func<HexCoord, bool> isLand,
        WorldGenerationOptions options,
        int seed,
        RiverStats? stats)
    {
        var springs = PickSprings(islandTiles, land, islandLand, depthAt, options, seed);
        var claims = new Dictionary<HexCoord, Claim>();
        var claimDistance = new Dictionary<HexCoord, int>();
        var paths = new List<List<HexCoord>>();
        foreach (var spring in springs)
        {
            if (claims.ContainsKey(spring))
            {
                continue;
            }

            var path = TracePath(spring, islandLand, depthAt, isLand, options, seed, claims, claimDistance, out var outcome);
            if (outcome == TraceOutcome.Failed || path.Count < options.MinRiverLength)
            {
                continue;
            }

            Commit(path, outcome == TraceOutcome.Merged, claims);
            SpreadClaimDistance(path, claims, islandLand, options.MergeAttractionRadius, claimDistance);
            paths.Add(path);
            if (stats is not null)
            {
                stats.Rivers++;
                if (outcome == TraceOutcome.Merged)
                {
                    stats.Merges++;
                }
            }
        }

        if (stats is not null)
        {
            stats.Springs += springs.Count;
        }

        var nodes = BuildRiverTiles(paths);
        return AssignWidths(nodes, isLand, seed, stats);
    }

    /// <summary>What a walk ended on.</summary>
    private enum TraceOutcome
    {
        Failed,
        Sea,
        Merged,
    }

    /// <summary>A tile already part of a committed river: its inflow(s) and outflow as direction indices (-1 = none).</summary>
    private sealed class Claim
    {
        public int In1 = -1;
        public int In2 = -1;
        public int Out = -1;
        public bool Spring;
    }

    private static void Commit(List<HexCoord> path, bool merged, Dictionary<HexCoord, Claim> claims)
    {
        for (var i = 0; i < path.Count; i++)
        {
            var tile = path[i];
            var inDir = i > 0 ? DirectionIndex(tile, path[i - 1]) : -1;
            var outDir = i < path.Count - 1 ? DirectionIndex(tile, path[i + 1]) : -1;
            if (i == path.Count - 1 && merged)
            {
                claims[tile].In2 = inDir;
                continue;
            }

            claims[tile] = new Claim { In1 = inDir, Out = outDir, Spring = i == 0 };
        }
    }

    /// <summary>
    /// Records, for every island tile within <paramref name="radius"/> hexes of an approach tile of
    /// <paramref name="path"/>, its distance to the nearest one (1 = the approach tile itself). An
    /// approach tile is a free neighbour of a plain tile of the path from which a walk could step
    /// on and merge - where the art can draw the Y. The pull leads a tributary to the right
    /// side of a trunk, not just near it.
    /// </summary>
    private static void SpreadClaimDistance(
        List<HexCoord> path,
        Dictionary<HexCoord, Claim> claims,
        HashSet<HexCoord> islandLand,
        int radius,
        Dictionary<HexCoord, int> claimDistance)
    {
        var frontier = new List<HexCoord>();
        foreach (var tile in path)
        {
            var claim = claims[tile];
            if (claim.Spring || claim.In1 < 0 || claim.In2 >= 0 || claim.Out < 0)
            {
                continue;
            }

            for (var b = 0; b < 6; b++)
            {
                var approach = tile + HexCoord.Directions[b];
                if (islandLand.Contains(approach) && !claims.ContainsKey(approach)
                    && RiverConfluence.IsRepresentable(claim.In1, b, claim.Out)
                    && !(claimDistance.TryGetValue(approach, out var known) && known <= 1))
                {
                    claimDistance[approach] = 1;
                    frontier.Add(approach);
                }
            }
        }

        for (var d = 2; d <= radius && frontier.Count > 0; d++)
        {
            var next = new List<HexCoord>();
            foreach (var tile in frontier)
            {
                foreach (var n in tile.Neighbours())
                {
                    if (!islandLand.Contains(n) || claims.ContainsKey(n) || (claimDistance.TryGetValue(n, out var known) && known <= d))
                    {
                        continue;
                    }

                    claimDistance[n] = d;
                    next.Add(n);
                }
            }

            frontier = next;
        }
    }

    /// <summary>
    /// Springs by farthest-point sampling over the island's spring candidates: mountain tiles of
    /// clusters of at least two that sit on a range edge (a non-mountain land neighbour) and do
    /// not touch the sea (falling back to any mountain tile of such a cluster that does not touch
    /// the sea). The first is the most inland candidate; each next one maximises its distance to
    /// the springs already chosen. Pick order is priority order.
    /// </summary>
    private static List<HexCoord> PickSprings(
        IReadOnlyList<HexCoord> islandTiles,
        Dictionary<HexCoord, Terrain> land,
        HashSet<HexCoord> islandLand,
        Func<HexCoord, double?> depthAt,
        WorldGenerationOptions options,
        int seed)
    {
        var strict = new List<HexCoord>();
        var loose = new List<HexCoord>();
        foreach (var cluster in ClusterMountains(islandTiles, land))
        {
            if (cluster.Count < 2)
            {
                continue;
            }

            foreach (var tile in cluster)
            {
                var seaAdjacent = false;
                var rangeEdge = false;
                foreach (var n in tile.Neighbours())
                {
                    if (!islandLand.Contains(n))
                    {
                        seaAdjacent = true;
                        break;
                    }

                    if (land[n] != Terrain.Mountain)
                    {
                        rangeEdge = true;
                    }
                }

                if (seaAdjacent)
                {
                    continue;
                }

                loose.Add(tile);
                if (rangeEdge)
                {
                    strict.Add(tile);
                }
            }
        }

        var candidates = strict.Count > 0 ? strict : loose;
        var springs = new List<HexCoord>();
        if (candidates.Count == 0)
        {
            return springs;
        }

        candidates.Sort((a, b) => a.Q != b.Q ? a.Q.CompareTo(b.Q) : a.R.CompareTo(b.R));
        var hash = new double[candidates.Count];
        for (var i = 0; i < candidates.Count; i++)
        {
            hash[i] = ValueNoise.Hash2(candidates[i].Q, candidates[i].R, seed + 41);
        }

        var k = Math.Clamp(
            (int)Math.Floor((islandTiles.Count / (double)options.RiverTilesPerSpring) + 0.5),
            1,
            options.MaxSpringsPerIsland);

        var first = 0;
        var firstDepth = depthAt(candidates[0]) ?? 0.0;
        for (var i = 1; i < candidates.Count; i++)
        {
            var d = depthAt(candidates[i]) ?? 0.0;
            if (d < firstDepth || (d == firstDepth && hash[i] > hash[first]))
            {
                first = i;
                firstDepth = d;
            }
        }

        springs.Add(candidates[first]);
        var minDistance = new int[candidates.Count];
        for (var i = 0; i < candidates.Count; i++)
        {
            minDistance[i] = HexCoord.Distance(candidates[i], candidates[first]);
        }

        while (springs.Count < k)
        {
            var best = -1;
            for (var i = 0; i < candidates.Count; i++)
            {
                if (best < 0 || minDistance[i] > minDistance[best]
                    || (minDistance[i] == minDistance[best] && hash[i] > hash[best]))
                {
                    best = i;
                }
            }

            if (minDistance[best] < options.MinSpringSpacing || minDistance[best] == 0)
            {
                break;
            }

            springs.Add(candidates[best]);
            for (var i = 0; i < candidates.Count; i++)
            {
                minDistance[i] = Math.Min(minDistance[i], HexCoord.Distance(candidates[i], candidates[best]));
            }
        }

        return springs;
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
    /// Walks from a spring toward the coast: prefers stepping to a
    /// non-decreasing-depth neighbour, scored by depth plus a meander noise
    /// term, and stops the step *before* it would leave land, so the last
    /// tile in the path is always the river's mouth. Once the walk already
    /// has an inflow direction, a step that would turn 120° off
    /// straight-ahead (a <see cref="RiverTileShape.Bend60"/> tile) is a legal
    /// candidate, just scored down by
    /// <see cref="WorldGenerationOptions.SharpBendPenalty"/> so it stays
    /// rarer than a straight continuation or the gentler 60°-off
    /// <see cref="RiverTileShape.Bend"/> curve (see
    /// <c>docs/design/river-generation.md</c>).
    /// </summary>
    /// <remarks>
    /// The non-decreasing-depth rule is a preference, not a hard constraint:
    /// when every non-decreasing-depth neighbour is a dead end (already
    /// visited by this walk, or itself only leads to dead ends), the walk
    /// backtracks and falls back to a lower-depth neighbour instead of
    /// stopping short of the coast. Without this, a local dip in the depth
    /// field strands the river mid-island with no route out, and it still
    /// gets classified as a <see cref="RiverTileShape.Mouth"/> tile even
    /// though it never touches the sea. <paramref name="reachedSea"/> is
    /// <see langword="false"/> only when no route to the coast exists at
    /// all (or the backtracking budget below is exhausted), in which case
    /// the caller discards the path.
    /// </remarks>
    private static List<HexCoord> TracePath(
        HexCoord spring,
        HashSet<HexCoord> islandLand,
        Func<HexCoord, double?> depthAt,
        Func<HexCoord, bool> isLand,
        WorldGenerationOptions options,
        int seed,
        Dictionary<HexCoord, Claim>? claims,
        Dictionary<HexCoord, int>? claimDistance,
        out TraceOutcome outcome)
    {
        var path = new List<HexCoord> { spring };
        var visited = new HashSet<HexCoord> { spring };
        var frames = new Stack<TraceFrame>();
        frames.Push(new TraceFrame(BuildCandidates(spring, path, islandLand, visited, depthAt, options, seed, claims, claimDistance)));

        // Each tile's candidate list is built once, when it's pushed, and
        // every candidate in it is consumed at most once before the frame is
        // popped — so total work is bounded by edges in the island's tile
        // graph, not exponential. This cap is a defensive backstop against
        // any pathological island shape, not the normal exit path.
        var budget = islandLand.Count * 8;

        while (frames.Count > 0 && budget-- > 0)
        {
            var current = path[^1];
            if (claims is not null && path.Count > 1 && claims.ContainsKey(current))
            {
                // Stepped onto an earlier river (BuildCandidates only offers a tile the art
                // can draw as a Y): the tributary has become part of the trunk.
                outcome = TraceOutcome.Merged;
                return path;
            }

            if (TouchesSea(current, isLand))
            {
                outcome = TraceOutcome.Sea;
                return path;
            }

            var frame = frames.Peek();
            if (frame.NextIndex >= frame.Candidates.Count)
            {
                // Dead end: no candidate from here leads anywhere new.
                // Backtrack — unvisit this tile so a different branch from
                // its parent can still route through it.
                frames.Pop();
                visited.Remove(current);
                path.RemoveAt(path.Count - 1);
                continue;
            }

            var next = frame.Candidates[frame.NextIndex++];
            if (!visited.Add(next))
            {
                continue;
            }

            path.Add(next);
            frames.Push(new TraceFrame(BuildCandidates(next, path, islandLand, visited, depthAt, options, seed, claims, claimDistance)));
        }

        outcome = TraceOutcome.Failed;
        return path;
    }

    /// <summary>
    /// A tile "touches the sea" when at least one of its neighbours is not
    /// land, per <paramref name="isLand"/> — a green island's own
    /// <c>sampler.IsLand</c>, or a wasted island's own land set (since
    /// <c>TerrainAt</c> reports wasted land as Sea).
    /// </summary>
    private static bool TouchesSea(HexCoord tile, Func<HexCoord, bool> isLand)
    {
        foreach (var neighbour in tile.Neighbours())
        {
            if (!isLand(neighbour))
            {
                return true;
            }
        }

        return false;
    }

    private sealed class TraceFrame(List<HexCoord> candidates)
    {
        public List<HexCoord> Candidates { get; } = candidates;
        public int NextIndex { get; set; }
    }

    /// <summary>
    /// Unvisited land neighbours of <paramref name="tile"/>, non-decreasing-depth
    /// candidates first (ordered best score to worst), then lower-depth
    /// fallback candidates (also best score to worst) — so the walk only
    /// ever reaches for a downhill step once every uphill/flat option is
    /// exhausted or has backtracked out as a dead end.
    /// </summary>
    private static List<HexCoord> BuildCandidates(
        HexCoord tile,
        List<HexCoord> path,
        HashSet<HexCoord> islandLand,
        HashSet<HexCoord> visited,
        Func<HexCoord, double?> depthAt,
        WorldGenerationOptions options,
        int seed,
        Dictionary<HexCoord, Claim>? claims,
        Dictionary<HexCoord, int>? claimDistance)
    {
        var neighbours = tile.Neighbours();

        // The two candidate directions a 120°-off-straight-ahead turn would
        // take, once there's a previous tile to measure "straight ahead"
        // from — scored down below rather than excluded, so a Bend60 tile
        // stays possible but rarer. The direction straight back to that
        // previous tile is excluded anyway by the `visited` check below.
        int? sharpTurnA = null;
        int? sharpTurnB = null;
        if (path.Count >= 2)
        {
            var inIndex = DirectionIndex(tile, path[^2]);
            var straightAhead = (inIndex + 3) % 6;
            sharpTurnA = (straightAhead + 2) % 6;
            sharpTurnB = (straightAhead + 4) % 6;
        }

        var currentDepth = depthAt(tile) ?? 0.0;
        var forward = new List<(HexCoord Coord, double Score)>();
        var fallback = new List<(HexCoord Coord, double Score)>();

        for (var i = 0; i < neighbours.Length; i++)
        {
            var neighbour = neighbours[i];
            if (!islandLand.Contains(neighbour) || visited.Contains(neighbour))
            {
                continue;
            }

            var depth = depthAt(neighbour);
            if (depth is null)
            {
                continue;
            }

            var merge = false;
            if (claims is not null && claims.TryGetValue(neighbour, out var claim))
            {
                // A tile of an earlier river is a step only as a merge, and only into a plain
                // one-inflow tile whose Y the art can draw (never a spring, mouth or confluence).
                if (claim.Spring || claim.In1 < 0 || claim.In2 >= 0 || claim.Out < 0
                    || !RiverConfluence.IsRepresentable(claim.In1, (i + 3) % 6, claim.Out))
                {
                    continue;
                }

                merge = true;
            }

            var noise = ValueNoise.Hash2(neighbour.Q, neighbour.R, seed + 43);
            var score = depth.Value + (options.RiverMeanderWeight * noise);
            if (merge)
            {
                score += options.MergeBonus;
            }
            else if (claimDistance is not null && claimDistance.TryGetValue(neighbour, out var pull))
            {
                score += options.MergeAttraction * (options.MergeAttractionRadius - pull + 1) / options.MergeAttractionRadius;
            }

            if (i == sharpTurnA || i == sharpTurnB)
            {
                score -= options.SharpBendPenalty;
            }

            (depth.Value >= currentDepth ? forward : fallback).Add((neighbour, score));
        }

        forward.Sort((a, b) => b.Score.CompareTo(a.Score));
        fallback.Sort((a, b) => b.Score.CompareTo(a.Score));

        var candidates = new List<HexCoord>(forward.Count + fallback.Count);
        candidates.AddRange(forward.Select(c => c.Coord));
        candidates.AddRange(fallback.Select(c => c.Coord));
        return candidates;
    }

    /// <summary>
    /// Deterministic-priority pass over independently-traced paths: the
    /// first two to reach a tile share it (a confluence); a path is
    /// truncated the moment it reaches a tile already claimed twice, and
    /// discarded if that leaves it under the minimum length.
    /// </summary>
    private static List<List<HexCoord>> ResolveCollisions(
        List<List<HexCoord>> paths,
        WorldGenerationOptions options,
        bool allowConfluence)
    {
        var ordered = paths.OrderBy(p => p[0].Q).ThenBy(p => p[0].R).ToList();
        var claimCount = new Dictionary<HexCoord, int>();
        var survivors = new List<List<HexCoord>>();

        foreach (var path in ordered)
        {
            if (!allowConfluence)
            {
                // Lava streams never merge, never share a tile: a path that
                // reaches any tile an earlier path already claimed is
                // dropped entirely rather than truncated into a confluence.
                if (path.Any(tile => claimCount.ContainsKey(tile)))
                {
                    continue;
                }

                if (path.Count < options.MinRiverLength)
                {
                    continue;
                }

                foreach (var tile in path)
                {
                    claimCount[tile] = 1;
                }

                survivors.Add(path);
                continue;
            }

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

    private static List<Node> BuildRiverTiles(List<List<HexCoord>> paths)
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

        var result = new List<Node>();
        foreach (var tile in allTiles.OrderBy(t => t.Q).ThenBy(t => t.R))
        {
            var ins = inDirections.TryGetValue(tile, out var list) ? list.Select(d => (int)d).ToList() : [];
            var hasOut = outDirection.TryGetValue(tile, out var outDir);
            var outIndex = hasOut ? (int)outDir : -1;
            result.Add(new Node(tile, ShapeOf(ins, outIndex), ins, outIndex));
        }

        return result;
    }

    private static RiverTileShape ShapeOf(List<int> ins, int outDir)
    {
        if (ins.Count == 0)
        {
            return RiverTileShape.Spring;
        }

        if (ins.Count >= 2)
        {
            return RiverTileShape.Confluence;
        }

        if (outDir < 0)
        {
            return RiverTileShape.Mouth;
        }

        // 0 degrees: continues straight through. 60 either side: a gentle Bend. 120 either
        // side: the sharper Bend60.
        var opposite = (ins[0] + 3) % 6;
        var turn = Math.Min((outDir - opposite + 6) % 6, (opposite - outDir + 6) % 6);
        return turn switch
        {
            0 => RiverTileShape.Straight,
            2 => RiverTileShape.Bend60,
            _ => RiverTileShape.Bend,
        };
    }

    /// <summary>A traced river hex on its way to becoming a <see cref="RiverTile"/>.</summary>
    private sealed class Node(HexCoord coord, RiverTileShape shape, List<int> ins, int outDir)
    {
        public HexCoord Coord { get; } = coord;
        public RiverTileShape Shape { get; set; } = shape;
        public List<int> Ins { get; } = ins;
        public int Out { get; } = outDir;
        public RiverWidth Width { get; set; } = RiverWidth.River;
        public bool OutRiver { get; set; }
        public bool Removed { get; set; }

        public RiverTile ToTile(RiverWidth width) => new(
            Coord,
            Shape,
            Ins.Select(d => (TileOrientation)d).ToList(),
            Out >= 0 ? (TileOrientation)Out : null,
            width);
    }

    /// <summary>
    /// Assigns each tile's width. Every tile starts as a stream; two streams meeting widen at
    /// the Y (smallwide Y, river below); a branch that must arrive at river width (the sea
    /// mouth, a confluence with a river) widens on a Straight tile chosen by hash from the
    /// second half of its stream run, and is truncated when that half has none.
    /// </summary>
    private static List<RiverTile> AssignWidths(
        List<Node> nodes, Func<HexCoord, bool> isLand, int seed, RiverStats? stats)
    {
        var byCoord = nodes.ToDictionary(n => n.Coord);
        var pending = nodes.ToDictionary(n => n.Coord, n => n.Ins.Count);
        var queue = new Queue<Node>(nodes.Where(n => n.Ins.Count == 0));

        Node Upstream(Node n, int dir) => byCoord[n.Coord + HexCoord.Directions[dir]];

        // The pure stream run ending at `last`, spring first.
        List<Node> Chain(Node last)
        {
            var chain = new List<Node>();
            var cur = last;
            while (true)
            {
                chain.Add(cur);
                if (cur.Ins.Count == 0)
                {
                    break;
                }

                cur = Upstream(cur, cur.Ins[0]);
            }

            chain.Reverse();
            return chain;
        }

        // Widens somewhere in the second half of the chain; false when no Straight tile lives there.
        bool TryWiden(List<Node> chain, HexCoord requirement)
        {
            var candidates = new List<int>();
            for (var i = Math.Max(1, (chain.Count + 1) / 2); i < chain.Count; i++)
            {
                if (chain[i].Shape == RiverTileShape.Straight)
                {
                    candidates.Add(i);
                }
            }

            if (candidates.Count == 0)
            {
                return false;
            }

            var pick = candidates[(int)Math.Floor(ValueNoise.Hash2(requirement.Q, requirement.R, seed + 47) * candidates.Count)];
            chain[pick].Width = RiverWidth.Widen;
            chain[pick].OutRiver = true;
            for (var i = pick + 1; i < chain.Count; i++)
            {
                chain[i].Width = RiverWidth.River;
                chain[i].OutRiver = true;
            }

            if (stats is not null)
            {
                stats.Widenings++;
            }

            return true;
        }

        void Remove(List<Node> chain)
        {
            foreach (var n in chain)
            {
                n.Removed = true;
            }
        }

        while (queue.Count > 0)
        {
            var v = queue.Dequeue();
            switch (v.Shape)
            {
                case RiverTileShape.Spring:
                    v.Width = RiverWidth.Stream;
                    v.OutRiver = false;
                    break;

                case RiverTileShape.Confluence:
                {
                    var a = Upstream(v, v.Ins[0]);
                    var b = Upstream(v, v.Ins[1]);
                    if (!a.OutRiver && !b.OutRiver)
                    {
                        v.Width = RiverWidth.Widen;
                        v.OutRiver = true;
                        if (stats is not null)
                        {
                            stats.Widenings++;
                        }
                    }
                    else if (a.OutRiver && b.OutRiver)
                    {
                        v.Width = RiverWidth.River;
                        v.OutRiver = true;
                    }
                    else
                    {
                        var (streamBranch, streamDir, riverBranch) = a.OutRiver ? (b, v.Ins[1], a) : (a, v.Ins[0], b);
                        var chain = Chain(streamBranch);
                        if (TryWiden(chain, v.Coord))
                        {
                            v.Width = RiverWidth.River;
                        }
                        else
                        {
                            // No straight tile to widen on: the branch is dropped up to where it would join,
                            // and this tile carries on as a plain tile of the river.
                            Remove(chain);
                            v.Ins.Remove(streamDir);
                            v.Shape = ShapeOf(v.Ins, v.Out);
                            v.Width = RiverWidth.River;
                            if (stats is not null)
                            {
                                stats.TruncatedBranches++;
                            }
                        }

                        v.OutRiver = true;
                    }

                    break;
                }

                case RiverTileShape.Mouth:
                {
                    var up = Upstream(v, v.Ins[0]);
                    if (up.OutRiver)
                    {
                        v.Width = RiverWidth.River;
                        v.OutRiver = true;
                    }
                    else
                    {
                        var chain = Chain(up);
                        if (TryWiden(chain, v.Coord))
                        {
                            v.Width = RiverWidth.River;
                        }
                        else if (!isLand(v.Coord + HexCoord.Directions[(v.Ins[0] + 3) % 6]))
                        {
                            v.Width = RiverWidth.Widen;
                            if (stats is not null)
                            {
                                stats.Widenings++;
                            }
                        }
                        else
                        {
                            chain.Add(v);
                            Remove(chain);
                            if (stats is not null)
                            {
                                stats.DroppedRivers++;
                            }
                        }

                        v.OutRiver = true;
                    }

                    break;
                }

                default:
                {
                    var up = Upstream(v, v.Ins[0]);
                    v.Width = up.OutRiver ? RiverWidth.River : RiverWidth.Stream;
                    v.OutRiver = up.OutRiver;
                    break;
                }
            }

            if (v.Out >= 0 && !v.Removed)
            {
                var next = byCoord[v.Coord + HexCoord.Directions[v.Out]];
                if (--pending[next.Coord] == 0)
                {
                    queue.Enqueue(next);
                }
            }
        }

        return nodes.Where(n => !n.Removed).Select(n => n.ToTile(n.Width)).ToList();
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
