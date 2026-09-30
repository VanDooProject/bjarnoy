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
        public int Outlets;
        public int Rivers;
        public int Merges;
        public int Widenings;
        public int RiverStreamJoins;
        public int TruncatedBranches;
        public int DroppedRivers;
        public int IslandsWithoutMillSpace;

        public void Add(RiverStats other)
        {
            Springs += other.Springs;
            Outlets += other.Outlets;
            Rivers += other.Rivers;
            Merges += other.Merges;
            Widenings += other.Widenings;
            RiverStreamJoins += other.RiverStreamJoins;
            TruncatedBranches += other.TruncatedBranches;
            DroppedRivers += other.DroppedRivers;
        }
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
            var path = TracePath(spring, islandLand, depthAt, isLand, options, seed, out var outcome);
            if (outcome == TraceOutcome.Sea && path.Count >= options.MinRiverLength)
            {
                paths.Add(path);
            }
        }

        var survivors = ResolveCollisions(paths, options, allowConfluence);
        return BuildRiverTiles(survivors).Select(n => n.ToTile(RiverWidth.River)).ToList();
    }

    /// <summary>
    /// Green islands: a drainage network per island. Outlets sit on bays; a noisy shortest-path
    /// field over (tile, arrival direction) states says where water leaves every tile; springs
    /// (farthest-first on range edges) follow those pointers, so paths that meet share the rest
    /// of their route. Junctions are only made where the art can draw the Y, searched locally
    /// when the natural meeting is not drawable. Then a width pass (stream -> widening -> river).
    /// See <c>docs/design/river-generation.md</c>.
    /// </summary>
    private static IReadOnlyList<RiverTile> GenerateGreen(
        IReadOnlyList<HexCoord> islandTiles,
        Dictionary<HexCoord, Terrain> land,
        HashSet<HexCoord> islandLand,
        Func<HexCoord, double?> depthAt,
        Func<HexCoord, bool> isLand,
        WorldGenerationOptions options,
        int seed,
        RiverStats? callerStats)
    {
        var stats = callerStats is null ? null : new RiverStats();
        var candidates = SpringCandidates(islandTiles, land, islandLand);
        if (candidates.Count == 0)
        {
            return [];
        }

        var drainage = new Drainage(islandTiles, land, isLand, options, seed);
        if (stats is not null)
        {
            stats.Outlets += drainage.OutletCount;
        }

        var springs = PickSprings(candidates, islandTiles.Count, depthAt, drainage, options, seed);
        var order = springs
            .Select(spring => (Spring: spring, Cost: drainage.BestOut(drainage.Index[spring], -1, null).Cost))
            .OrderByDescending(x => x.Cost)
            .ThenBy(x => x.Spring.Q)
            .ThenBy(x => x.Spring.R)
            .Select(x => x.Spring)
            .ToList();

        var claims = new Claim?[drainage.Tiles.Length];
        var onPath = new bool[drainage.Tiles.Length];
        var paths = new List<List<HexCoord>>();
        foreach (var spring in order)
        {
            if (claims[drainage.Index[spring]] is not null)
            {
                continue;
            }

            var path = TraceDrainage(drainage, spring, claims, onPath, options, out var merged);
            if (path is null)
            {
                if (stats is not null)
                {
                    stats.DroppedRivers++;
                }

                continue;
            }

            if (path.Count < options.MinRiverLength)
            {
                continue;
            }

            Commit(drainage, path, merged, claims);
            paths.Add(path);
            if (stats is not null)
            {
                stats.Rivers++;
                if (merged)
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
        var tiles = AssignWidths(nodes, isLand, seed, stats);

        // The mills need river-width straights (Crop Mill: only those). An island whose rivers
        // cannot offer that many gets none: a river nobody can build on is only scenery.
        var mill = tiles.Count(t => t.Shape == RiverTileShape.Straight && t.Width == RiverWidth.River);
        if (mill < options.MinMillStraights)
        {
            if (callerStats is not null)
            {
                callerStats.IslandsWithoutMillSpace++;
            }

            return [];
        }

        callerStats?.Add(stats!);
        return tiles;
    }

    /// <summary>What a legacy walk ended on.</summary>
    private enum TraceOutcome
    {
        Failed,
        Sea,
    }

    /// <summary>A tile already part of a committed river: its inflow(s) and outflow as direction indices (-1 = none).</summary>
    private sealed class Claim
    {
        public int In1 = -1;
        public int In2 = -1;
        public int Out = -1;
        public bool Spring;

        /// <summary>Downstream of a confluence, so (probably) river width: a stream joining here can use the river-stream Y.</summary>
        public bool Downstream;

        /// <summary>A plain one-inflow tile a tributary can still join (never a spring, mouth or confluence).</summary>
        public bool Joinable => !Spring && In1 >= 0 && In2 < 0 && Out >= 0;
    }

    private static void Commit(Drainage drainage, List<HexCoord> path, bool merged, Claim?[] claims)
    {
        for (var i = 0; i < path.Count; i++)
        {
            var tile = path[i];
            var inDir = i > 0 ? DirectionIndex(tile, path[i - 1]) : -1;
            var outDir = i < path.Count - 1 ? DirectionIndex(tile, path[i + 1]) : -1;
            var idx = drainage.Index[tile];
            if (i == path.Count - 1 && merged)
            {
                claims[idx]!.In2 = inDir;
                for (var cur = idx; cur >= 0; cur = claims[cur]!.Out >= 0 ? drainage.Neighbour[(cur * 6) + claims[cur]!.Out] : -1)
                {
                    claims[cur]!.Downstream = true;
                }

                continue;
            }

            claims[idx] = new Claim { In1 = inDir, Out = outDir, Spring = i == 0 };
        }
    }

    /// <summary>
    /// One island's drainage field. Land tiles are indexed in (Q, R) order. Water leaves an
    /// interior tile (one that does not touch the sea) for a neighbour; the cost of the rest of
    /// the way to an outlet is kept per (tile, arrival direction) state, where the arrival
    /// direction is the direction from the tile back to its upstream neighbour, so turns can be
    /// priced and the art's shapes (no 180 degree hairpin) respected. Outlets are coastal tiles
    /// on bays.
    /// </summary>
    private sealed class Drainage
    {
        public readonly HexCoord[] Tiles;
        public readonly Dictionary<HexCoord, int> Index = [];
        public readonly int[] Neighbour;
        public readonly bool[] Interior;
        public readonly bool[] Outlet;
        public readonly double[] Step;
        public readonly double[] Dist;
        public readonly double BendCost;
        public readonly double SharpBendCost;
        public int OutletCount;

        public Drainage(
            IReadOnlyList<HexCoord> islandTiles,
            Dictionary<HexCoord, Terrain> land,
            Func<HexCoord, bool> isLand,
            WorldGenerationOptions options,
            int seed)
        {
            BendCost = options.BendCost;
            SharpBendCost = options.SharpBendCost;
            Tiles = islandTiles.OrderBy(t => t.Q).ThenBy(t => t.R).ToArray();
            var n = Tiles.Length;
            for (var i = 0; i < n; i++)
            {
                Index[Tiles[i]] = i;
            }

            Neighbour = new int[n * 6];
            Interior = new bool[n];
            Outlet = new bool[n];
            Step = new double[n];
            Dist = new double[n * 6];
            Array.Fill(Dist, double.PositiveInfinity);
            var coastal = new bool[n];
            for (var i = 0; i < n; i++)
            {
                var ns = Tiles[i].Neighbours();
                for (var d = 0; d < 6; d++)
                {
                    Neighbour[(i * 6) + d] = Index.TryGetValue(ns[d], out var idx) ? idx : -1;
                }

                // Neighbours that are island tiles are land without asking the (costly) sampler.
                coastal[i] = false;
                for (var d = 0; d < 6 && !coastal[i]; d++)
                {
                    coastal[i] = Neighbour[(i * 6) + d] < 0 && !isLand(ns[d]);
                }

                Interior[i] = !coastal[i];
                Step[i] = 1.0
                    + (options.DrainageNoise * ValueNoise.Hash2(Tiles[i].Q, Tiles[i].R, seed + 53))
                    + (options.ValleyNoise * ValueNoise.Sample(Tiles[i].Q, Tiles[i].R, seed + 61, options.ValleyScale))
                    + (land[Tiles[i]] == Terrain.Mountain ? options.MountainCost : 0.0);
            }

            var outlets = PickOutlets(coastal, options, seed);
            OutletCount = outlets.Count;
            var heap = new Heap();
            foreach (var o in outlets)
            {
                Outlet[o] = true;
                for (var j = 0; j < 6; j++)
                {
                    Dist[(o * 6) + j] = 0.0;
                    heap.Push(0.0, (o * 6) + j);
                }
            }

            while (heap.Count > 0)
            {
                var (d, s) = heap.Pop();
                if (d > Dist[s])
                {
                    continue;
                }

                var node = s / 6;
                var j = s % 6;
                var t = Neighbour[(node * 6) + j];
                if (t < 0 || !Interior[t])
                {
                    continue;
                }

                var outDir = (j + 3) % 6;
                for (var i = 0; i < 6; i++)
                {
                    if (i == outDir)
                    {
                        continue;
                    }

                    var nd = d + Step[node] + TurnCost(i, outDir);
                    var ts = (t * 6) + i;
                    if (nd < Dist[ts])
                    {
                        Dist[ts] = nd;
                        heap.Push(nd, ts);
                    }
                }
            }
        }

        /// <summary>The drainage cost of turning from arrival direction <paramref name="inDir"/> to leave by <paramref name="outDir"/>; negative when the art has no such tile (a 180 degree hairpin).</summary>
        public double TurnCost(int inDir, int outDir)
        {
            if (inDir < 0)
            {
                return 0.0;
            }

            if (inDir == outDir)
            {
                return -1.0;
            }

            var opposite = (inDir + 3) % 6;
            var turn = Math.Min((outDir - opposite + 6) % 6, (opposite - outDir + 6) % 6);
            return turn switch
            {
                0 => 0.0,
                1 => BendCost,
                _ => SharpBendCost,
            };
        }

        /// <summary>
        /// The cheapest way on from a tile entered from <paramref name="inDir"/> (-1 for a spring):
        /// the outflow direction and the cost of the rest of the way, or (-1, infinity) when
        /// nothing leads on. <paramref name="excluded"/> tiles are not offered.
        /// </summary>
        public (int Out, double Cost) BestOut(int tile, int inDir, Func<int, bool>? excluded)
        {
            var best = -1;
            var bestCost = double.PositiveInfinity;
            for (var o = 0; o < 6; o++)
            {
                var n = Neighbour[(tile * 6) + o];
                if (n < 0 || (inDir >= 0 && o == inDir))
                {
                    continue;
                }

                var d = Dist[(n * 6) + ((o + 3) % 6)];
                if (double.IsPositiveInfinity(d) || (excluded is not null && excluded(n)))
                {
                    continue;
                }

                var cost = d + Step[n] + TurnCost(inDir, o);
                if (cost < bestCost)
                {
                    bestCost = cost;
                    best = o;
                }
            }

            return (best, bestCost);
        }

        /// <summary>
        /// Coastal tiles that can take flow from an interior neighbour, scored by how much land
        /// is within three hexes (bays score high, spits low) plus a small hash; picked
        /// farthest-first, the first being the best score.
        /// </summary>
        private List<int> PickOutlets(bool[] coastal, WorldGenerationOptions options, int seed)
        {
            var candidates = new List<int>();
            var score = new List<double>();
            for (var i = 0; i < Tiles.Length; i++)
            {
                if (!coastal[i])
                {
                    continue;
                }

                var receives = false;
                for (var d = 0; d < 6 && !receives; d++)
                {
                    var n = Neighbour[(i * 6) + d];
                    receives = n >= 0 && Interior[n];
                }

                if (!receives)
                {
                    continue;
                }

                var nearby = 0;
                for (var dq = -3; dq <= 3; dq++)
                {
                    for (var dr = Math.Max(-3, -dq - 3); dr <= Math.Min(3, -dq + 3); dr++)
                    {
                        if (Index.ContainsKey(new HexCoord(Tiles[i].Q + dq, Tiles[i].R + dr)))
                        {
                            nearby++;
                        }
                    }
                }

                candidates.Add(i);
                score.Add(nearby + ValueNoise.Hash2(Tiles[i].Q, Tiles[i].R, seed + 59));
            }

            var outlets = new List<int>();
            if (candidates.Count == 0)
            {
                return outlets;
            }

            var k = Math.Clamp(
                (int)Math.Floor((Tiles.Length / (double)options.OutletTilesPer) + 0.5),
                1,
                options.MaxOutlets);
            var first = 0;
            for (var i = 1; i < candidates.Count; i++)
            {
                if (score[i] > score[first])
                {
                    first = i;
                }
            }

            outlets.Add(candidates[first]);
            var minDistance = new int[candidates.Count];
            for (var i = 0; i < candidates.Count; i++)
            {
                minDistance[i] = HexCoord.Distance(Tiles[candidates[i]], Tiles[candidates[first]]);
            }

            while (outlets.Count < k)
            {
                var best = 0;
                for (var i = 1; i < candidates.Count; i++)
                {
                    if (minDistance[i] > minDistance[best] || (minDistance[i] == minDistance[best] && score[i] > score[best]))
                    {
                        best = i;
                    }
                }

                if (minDistance[best] < options.MinOutletSpacing || minDistance[best] == 0)
                {
                    break;
                }

                outlets.Add(candidates[best]);
                for (var i = 0; i < candidates.Count; i++)
                {
                    minDistance[i] = Math.Min(minDistance[i], HexCoord.Distance(Tiles[candidates[i]], Tiles[candidates[best]]));
                }
            }

            return outlets;
        }
    }

    /// <summary>A binary min-heap on (priority, item); the item index breaks ties so pops are deterministic.</summary>
    private sealed class Heap
    {
        private readonly List<(double Priority, int Item)> items = [];

        public int Count => items.Count;

        private static bool Less((double Priority, int Item) a, (double Priority, int Item) b) =>
            a.Priority < b.Priority || (a.Priority == b.Priority && a.Item < b.Item);

        public void Push(double priority, int item)
        {
            items.Add((priority, item));
            var i = items.Count - 1;
            while (i > 0)
            {
                var parent = (i - 1) / 2;
                if (!Less(items[i], items[parent]))
                {
                    break;
                }

                (items[i], items[parent]) = (items[parent], items[i]);
                i = parent;
            }
        }

        public (double Priority, int Item) Pop()
        {
            var top = items[0];
            var last = items[^1];
            items.RemoveAt(items.Count - 1);
            if (items.Count > 0)
            {
                items[0] = last;
                var i = 0;
                while (true)
                {
                    var l = (2 * i) + 1;
                    var r = l + 1;
                    var m = i;
                    if (l < items.Count && Less(items[l], items[m]))
                    {
                        m = l;
                    }

                    if (r < items.Count && Less(items[r], items[m]))
                    {
                        m = r;
                    }

                    if (m == i)
                    {
                        break;
                    }

                    (items[i], items[m]) = (items[m], items[i]);
                    i = m;
                }
            }

            return top;
        }
    }

    /// <summary>
    /// Follows the drainage pointers from a spring to its outlet, after first looking for a
    /// nearby trunk to join (<see cref="SearchJunction"/>). Reaching a tile of an earlier river is
    /// a junction only where the art can draw it; otherwise the junction is searched again from
    /// there, and with none it runs on alone to the nearest free coast (a new mouth), or is dropped (null).
    /// </summary>
    private static List<HexCoord>? TraceDrainage(
        Drainage drainage,
        HexCoord spring,
        Claim?[] claims,
        bool[] onPath,
        WorldGenerationOptions options,
        out bool merged)
    {
        merged = false;
        var path = new List<HexCoord> { spring };
        var tiles = new List<int>();
        var current = drainage.Index[spring];
        tiles.Add(current);
        onPath[current] = true;
        try
        {
            var inDir = -1;
            var guard = drainage.Tiles.Length * 2;
            Func<int, bool> taken = i => claims[i] is not null || onPath[i];
            var anyClaims = claims.Any(c => c is not null);

            if (anyClaims)
            {
                // Join a nearby trunk at a drawable Y unless that is much longer than running on alone.
                var route = SearchJunction(drainage, path, claims, onPath, drainage.BestOut(current, inDir, null).Cost + options.MergeSlack, options.MergeReach, options.RiverStreamBonus);
                if (route is not null)
                {
                    path.AddRange(route);
                    merged = true;
                    return path;
                }
            }

            while (guard-- > 0)
            {
                if (drainage.Outlet[current])
                {
                    return path;
                }

                var (outDir, naturalCost) = drainage.BestOut(current, inDir, null);
                if (outDir < 0)
                {
                    return null;
                }

                var next = drainage.Neighbour[(current * 6) + outDir];
                if (!taken(next))
                {
                    if (!anyClaims || Crowding(drainage, claims, next) == 0.0)
                    {
                        Step(next, outDir);
                        continue;
                    }

                    // About to run alongside an earlier river: join it if a drawable Y is near.
                    var beside = SearchJunction(drainage, path, claims, onPath, naturalCost + options.MergeSlack, options.MergeReach, options.RiverStreamBonus);
                    if (beside is not null)
                    {
                        path.AddRange(beside);
                        merged = true;
                        return path;
                    }

                    Step(next, outDir);
                    continue;
                }

                if (claims[next] is { } claim)
                {
                    if (claim.Joinable && RiverConfluence.IsRepresentable(claim.In1, (outDir + 3) % 6, claim.Out))
                    {
                        path.Add(drainage.Tiles[next]);
                        merged = true;
                        return path;
                    }
                }

                if (anyClaims)
                {
                    var route = SearchJunction(drainage, path, claims, onPath, naturalCost + options.MergeSlack, options.MergeReach, options.RiverStreamBonus);
                    if (route is not null)
                    {
                        path.AddRange(route);
                        merged = true;
                        return path;
                    }
                }

                // No drawable junction: run on alone to the nearest free coast (a new mouth).
                var alone = SearchJunction(drainage, path, claims, onPath, double.PositiveInfinity, options.MergeReach * 3.0, 0.0, true);
                if (alone is not null)
                {
                    path.AddRange(alone);
                    return path;
                }

                return null;
            }

            return null;

            void Step(int to, int dir)
            {
                path.Add(drainage.Tiles[to]);
                tiles.Add(to);
                onPath[to] = true;
                current = to;
                inDir = (dir + 3) % 6;
            }
        }
        finally
        {
            foreach (var t in tiles)
            {
                onPath[t] = false;
            }
        }
    }

    /// <summary>
    /// The cheapest way for the walk (at its last tile) to join an earlier river at a Y the art
    /// can draw: a Dijkstra over (tile, arrival direction) states across free interior tiles,
    /// ending on a joinable trunk tile approached from a side its Y allows. A route is priced as
    /// its own cost plus the trunk's remaining cost to its outlet, and only counts when that is
    /// at most <paramref name="limit"/> (the walk's own way to an outlet plus the merge slack) and
    /// the route itself costs at most <paramref name="reach"/>, so a tributary joins a nearby trunk unless that would be much
    /// longer than running on alone. Returns the tiles to append (ending on the trunk tile), or
    /// null.
    /// </summary>
    private static List<HexCoord>? SearchJunction(
        Drainage drainage,
        List<HexCoord> path,
        Claim?[] claims,
        bool[] onPath,
        double limit,
        double reach,
        double riverStreamBonus,
        bool toMouth = false)
    {
        var last = path[^1];
        var start = drainage.Index[last];
        var startIn = path.Count > 1 ? DirectionIndex(last, path[^2]) : -1;
        var startKey = (start * 6) + Math.Max(startIn, 0);
        var cost = new Dictionary<int, double> { [startKey] = 0.0 };
        var parent = new Dictionary<int, int> { [startKey] = -1 };
        var heap = new Heap();
        heap.Push(0.0, startKey);

        var found = false;
        var bestTotal = limit;
        var bestState = -1;
        var bestJunction = -1;
        while (heap.Count > 0)
        {
            var (d, state) = heap.Pop();
            if (d > cost[state] || d > bestTotal || d > reach)
            {
                continue;
            }

            var tile = state / 6;
            var inDir = state == startKey ? startIn : state % 6;
            for (var dir = 0; dir < 6; dir++)
            {
                var turn = drainage.TurnCost(inDir, dir);
                var n = drainage.Neighbour[(tile * 6) + dir];
                if (turn < 0 || n < 0)
                {
                    continue;
                }

                if (toMouth)
                {
                    // Alone to the sea: any free coastal tile is a new mouth.
                    if (claims[n] is not null || onPath[n])
                    {
                        continue;
                    }

                    if (!drainage.Interior[n])
                    {
                        var total = d + turn + drainage.Step[n] + Crowding(drainage, claims, n);
                        if (!found || total < bestTotal)
                        {
                            found = true;
                            bestTotal = total;
                            bestState = state;
                            bestJunction = n;
                        }

                        continue;
                    }
                }
                else if (claims[n] is { } claim)
                {
                    if (!claim.Joinable || !RiverConfluence.IsRepresentable(claim.In1, (dir + 3) % 6, claim.Out))
                    {
                        continue;
                    }

                    var total = d + turn + drainage.Step[n] + drainage.Dist[(n * 6) + claim.In1];

                    // A stream reaching a river trunk prefers the wide Y: the river-stream Y needs no widening first.
                    var preferred = claim.Downstream && RiverConfluence.Classify(claim.In1, (dir + 3) % 6, claim.Out) == ConfluenceKind.Wide
                        ? total - riverStreamBonus
                        : total;
                    if (total <= limit && (!found || preferred < bestTotal))
                    {
                        found = true;
                        bestTotal = preferred;
                        bestState = state;
                        bestJunction = n;
                    }

                    continue;
                }

                if (!drainage.Interior[n] || onPath[n] || claims[n] is not null)
                {
                    continue;
                }

                var key = (n * 6) + ((dir + 3) % 6);
                var nd = d + turn + drainage.Step[n] + (toMouth ? Crowding(drainage, claims, n) : 0.0);
                if (nd <= reach && (!cost.TryGetValue(key, out var known) || nd < known))
                {
                    cost[key] = nd;
                    parent[key] = state;
                    heap.Push(nd, key);
                }
            }
        }

        if (!found)
        {
            return null;
        }

        var route = new List<HexCoord> { drainage.Tiles[bestJunction] };
        for (var cur = bestState; cur >= 0 && cur != startKey; cur = parent[cur])
        {
            route.Insert(0, drainage.Tiles[cur / 6]);
        }

        // A shortest route in state space can, rarely, cross its own tile in another state.
        return route.Distinct().Count() == route.Count ? route : null;
    }

    /// <summary>Extra cost of a tile beside an earlier river on a walk that is not joining it: keeps rivers that run on alone from hugging one another.</summary>
    private static double Crowding(Drainage drainage, Claim?[] claims, int tile)
    {
        var crowding = 0.0;
        for (var d = 0; d < 6; d++)
        {
            var n = drainage.Neighbour[(tile * 6) + d];
            if (n >= 0 && claims[n] is not null)
            {
                crowding += CrowdingCost;
            }
        }

        return crowding;
    }

    private const double CrowdingCost = 2.0;

    /// <summary>
    /// Spring candidates: mountain tiles of clusters of at least two that sit on a range edge (a
    /// non-mountain land neighbour) and do not touch the sea (falling back to any mountain tile
    /// of such a cluster that does not touch the sea).
    /// </summary>
    private static List<HexCoord> SpringCandidates(
        IReadOnlyList<HexCoord> islandTiles,
        Dictionary<HexCoord, Terrain> land,
        HashSet<HexCoord> islandLand)
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

        return strict.Count > 0 ? strict : loose;
    }

    /// <summary>
    /// Springs by farthest-point sampling over the candidates the drainage field can carry to an
    /// outlet. The first is the most inland candidate; each next one maximises its distance to
    /// the springs already chosen, until <c>K</c> springs or the best is closer than
    /// <see cref="WorldGenerationOptions.MinSpringSpacing"/>.
    /// </summary>
    private static List<HexCoord> PickSprings(
        List<HexCoord> allCandidates,
        int islandTileCount,
        Func<HexCoord, double?> depthAt,
        Drainage drainage,
        WorldGenerationOptions options,
        int seed)
    {
        var candidates = allCandidates
            .Where(c => drainage.BestOut(drainage.Index[c], -1, null).Out >= 0)
            .OrderBy(c => c.Q)
            .ThenBy(c => c.R)
            .ToList();
        var springs = new List<HexCoord>();
        if (candidates.Count == 0)
        {
            return springs;
        }

        var hash = new double[candidates.Count];
        for (var i = 0; i < candidates.Count; i++)
        {
            hash[i] = ValueNoise.Hash2(candidates[i].Q, candidates[i].R, seed + 41);
        }

        var k = Math.Clamp(
            (int)Math.Floor((islandTileCount / (double)options.RiverTilesPerSpring) + 0.5),
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
        out TraceOutcome outcome)
    {
        var path = new List<HexCoord> { spring };
        var visited = new HashSet<HexCoord> { spring };
        var frames = new Stack<TraceFrame>();
        frames.Push(new TraceFrame(BuildCandidates(spring, path, islandLand, visited, depthAt, options, seed)));

        // Each tile's candidate list is built once, when it's pushed, and
        // every candidate in it is consumed at most once before the frame is
        // popped — so total work is bounded by edges in the island's tile
        // graph, not exponential. This cap is a defensive backstop against
        // any pathological island shape, not the normal exit path.
        var budget = islandLand.Count * 8;

        while (frames.Count > 0 && budget-- > 0)
        {
            var current = path[^1];
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
            frames.Push(new TraceFrame(BuildCandidates(next, path, islandLand, visited, depthAt, options, seed)));
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
        int seed)
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

            var noise = ValueNoise.Hash2(neighbour.Q, neighbour.R, seed + 43);
            var score = depth.Value + (options.RiverMeanderWeight * noise);
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
                    else if (v.Out >= 0 && RiverConfluence.Classify(v.Ins[0], v.Ins[1], v.Out) == ConfluenceKind.Wide)
                    {
                        // A stream joining a river at the wide Y: the river-stream Y, no widening needed.
                        v.Width = RiverWidth.RiverStream;
                        v.OutRiver = true;
                        if (stats is not null)
                        {
                            stats.RiverStreamJoins++;
                        }
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
