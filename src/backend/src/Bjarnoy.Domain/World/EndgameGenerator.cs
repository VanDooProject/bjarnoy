using Bjarnoy.Domain.Palisades;

namespace Bjarnoy.Domain.World;

/// <summary>
/// Places the endgame sites of a wasted island that has Utgard: up to two rings of Utgard walls around the fortress and a few Jötun
/// watchtowers spread over the rest of the island (<c>docs/design/endgame.md</c>, "Map"). Pure and seed-derived, called once per
/// island from <see cref="WorldGenerator"/> after giants and camps, and mirrored bit for bit by <c>endgamePlacement.ts</c>.
/// </summary>
/// <remarks>
/// Wall pieces are never chosen here: the walls are collected as a <see cref="WallSet"/> and every hex resolves through
/// <see cref="PalisadeRules"/>, the same code path player palisades use.
/// </remarks>
internal static class EndgameGenerator
{
    /// <summary>The pure result: walls (ring by ring, in ring order) and tower hexes (placement order), orientation not attached.</summary>
    public readonly record struct Sites(IReadOnlyList<UtgardWall> Walls, IReadOnlyList<HexCoord> Towers)
    {
        public static Sites None { get; } = new([], []);
    }

    public static (IReadOnlyList<UtgardWall> Walls, IReadOnlyList<JotunTower> Towers) Generate(
        IReadOnlyList<HexCoord> islandTiles,
        IReadOnlyDictionary<HexCoord, Terrain> land,
        TerrainSampler sampler,
        WorldGenerationOptions options,
        int islandIndex,
        IReadOnlyList<RiverTile> riverTiles,
        IReadOnlyList<Giant> giants,
        IReadOnlyList<Camp> camps)
    {
        var sites = PlaceCore(
            islandTiles,
            land,
            riverTiles.Select(t => t.Coord).ToHashSet(),
            [.. giants.Select(g => new GiantGenerator.Placement(g.Anchor, g.Family))],
            camps.Select(c => c.Coord).ToHashSet(),
            options.Seed,
            islandIndex);

        return (sites.Walls, [.. sites.Towers.Select(t => new JotunTower(t, sampler.OrientationAt(t)))]);
    }

    /// <summary>
    /// The placement core. <paramref name="land"/> holds the island's land terrain; any hex missing from it is sea.
    /// Returns <see cref="Sites.None"/> for an island without an Utgard giant.
    /// </summary>
    public static Sites PlaceCore(
        IReadOnlyList<HexCoord> islandTiles,
        IReadOnlyDictionary<HexCoord, Terrain> land,
        IReadOnlySet<HexCoord> riverTiles,
        IReadOnlyList<GiantGenerator.Placement> giants,
        IReadOnlySet<HexCoord> campHexes,
        int worldSeed,
        int islandIndex)
    {
        var utgard = giants.Where(g => g.Family == GiantGenerator.UtgardFamily).Select(g => (HexCoord?)g.Anchor).FirstOrDefault();
        if (utgard is not { } anchor)
        {
            return Sites.None;
        }

        // Large prime spacing, like the other generators, so this draws from its own noise field.
        var seed = worldSeed + (islandIndex * 400_009);

        var giantHexes = new HashSet<HexCoord>();
        foreach (var giant in giants)
        {
            giantHexes.UnionWith(Giant.Footprint(giant.Anchor));
        }

        var walls = PlaceWalls(anchor, land, riverTiles, giantHexes, campHexes, seed);
        var wallHexes = walls.Select(w => w.Coord).ToHashSet();
        var towers = PlaceTowers(islandTiles, anchor, land, riverTiles, giantHexes, campHexes, wallHexes, seed);
        return new Sites(walls, towers);
    }

    private static Terrain TerrainOf(IReadOnlyDictionary<HexCoord, Terrain> land, HexCoord c) =>
        land.TryGetValue(c, out var terrain) ? terrain : Terrain.Sea;

    /// <summary>The hexes at exactly <paramref name="radius"/> from <paramref name="centre"/>, in a fixed cyclic order (each hex adjacent to the next).</summary>
    internal static List<HexCoord> Ring(HexCoord centre, int radius)
    {
        var hexes = new List<HexCoord>(6 * radius);
        var hex = centre + new HexCoord(HexCoord.Directions[4].Q * radius, HexCoord.Directions[4].R * radius);
        for (var side = 0; side < 6; side++)
        {
            for (var step = 0; step < radius; step++)
            {
                hexes.Add(hex);
                hex += HexCoord.Directions[side];
            }
        }

        return hexes;
    }

    private static List<UtgardWall> PlaceWalls(
        HexCoord anchor,
        IReadOnlyDictionary<HexCoord, Terrain> land,
        IReadOnlySet<HexCoord> riverTiles,
        IReadOnlySet<HexCoord> giantHexes,
        IReadOnlySet<HexCoord> campHexes,
        int seed)
    {
        var ctx = new PalisadePlacementContext(c => TerrainOf(land, c), riverTiles.Contains);
        var result = new List<UtgardWall>();

        // The outer line keeps one clear hex from the inner one, so the two rings never touch.
        var nearInner = new HashSet<HexCoord>();
        foreach (var ringKind in new[] { UtgardRing.Inner, UtgardRing.Outer })
        {
            var ring = NaturalLoop(anchor, ringKind, land, riverTiles, giantHexes, seed, ringKind == UtgardRing.Outer ? nearInner : []);
            if (ringKind == UtgardRing.Inner)
            {
                foreach (var hex in ring)
                {
                    nearInner.Add(hex);
                    nearInner.UnionWith(hex.Neighbours());
                }
            }

            var eligible = new bool[ring.Count];
            var eligibleCount = 0;
            for (var i = 0; i < ring.Count; i++)
            {
                var hex = ring[i];
                eligible[i] = TerrainOf(land, hex) != Terrain.Sea
                    && !riverTiles.Contains(hex)
                    && !giantHexes.Contains(hex)
                    && !campHexes.Contains(hex)
                    && PalisadeRules.CanPlace(hex, WallSet.Empty, ctx) is null;
                if (eligible[i])
                {
                    eligibleCount++;
                }
            }

            if (ring.Count == 0 || eligibleCount < EndgameRules.MinRingLandShare * ring.Count)
            {
                continue;
            }

            result.AddRange(ResolveRing(ring, eligible, land, seed, ringKind));
        }

        return result;
    }

    /// <summary>Control points of the ring's wobble round the full circle (more on the longer outer ring).</summary>
    private static int NoisePoints(UtgardRing ring) => ring == UtgardRing.Inner ? 5 : 8;

    /// <summary>The finer second octave: its own control points (more than twice the first's).</summary>
    private static int DetailPoints(UtgardRing ring) => ring == UtgardRing.Inner ? 11 : 17;

    /// <summary>How far the finer octave pushes the target distance in or out.</summary>
    private const double DetailAmplitude = 0.9;

    /// <summary>Range the wobble's target distance is drawn from, per ring.</summary>
    private static (double Lo, double Hi) TargetRange(UtgardRing ring) => ring == UtgardRing.Inner ? (2.6, 6.4) : (6.6, 11.4);

    /// <summary>Cost of a hex the line can follow without a wall (mountain, river, a giant) against a hex that needs one.</summary>
    private const double BarrierStepCost = 0.35;

    private const double WallStepCost = 1;

    /// <summary>Cost of a sea hex: the line keeps to land where the band allows, so a small island's ring hugs its coast.</summary>
    private const double SeaStepCost = 15;

    /// <summary>Cost per hex of distance between a hex and the wobble's target distance at its angle.</summary>
    private const double TargetPull = 3;

    private static double Periodic(double[] values, double u)
    {
        var x = u * values.Length;
        var k = (int)Math.Floor(x);
        var f = x - k;
        return (values[k % values.Length] * (1 - f)) + (values[(k + 1) % values.Length] * f);
    }

    /// <summary>
    /// The closed line one ring follows round Utgard, as a cycle of hexes (each adjacent to the next, no two non-consecutive ones
    /// adjacent): the cheapest loop through the ring's band, where a hex costs more the further it is from a wobbling target distance
    /// and much less when the terrain already stops an army (mountain, river, a giant). Mirrors <c>naturalLoop</c> in
    /// <c>endgamePlacement.ts</c> step for step, tie-breaks included.
    /// </summary>
    internal static List<HexCoord> NaturalLoop(
        HexCoord anchor,
        UtgardRing kind,
        IReadOnlyDictionary<HexCoord, Terrain> land,
        IReadOnlySet<HexCoord> riverTiles,
        IReadOnlySet<HexCoord> giantHexes,
        int seed,
        IReadOnlySet<HexCoord> blocked)
    {
        var (minD, maxD) = EndgameRules.RingBand(kind);
        var points = NoisePoints(kind);
        var (lo, hi) = TargetRange(kind);
        var salt = kind == UtgardRing.Inner ? 601 : 607;
        var control = new double[points];
        for (var k = 0; k < points; k++)
        {
            control[k] = lo + ((hi - lo) * ValueNoise.Hash2(k, points, seed + salt));
        }

        var detailPoints = DetailPoints(kind);
        var detail = new double[detailPoints];
        for (var k = 0; k < detailPoints; k++)
        {
            detail[k] = DetailAmplitude * ((2 * ValueNoise.Hash2(k, detailPoints, seed + salt + 2)) - 1);
        }

        // The band's hexes in a fixed order (distance, then ring order), with their angle and step cost.
        var hexOf = new List<HexCoord>();
        var uOf = new List<double>();
        var costOf = new List<double>();
        var index = new Dictionary<HexCoord, int>();
        for (var d = minD; d <= maxD; d++)
        {
            var hexes = Ring(anchor, d);
            for (var i = 0; i < hexes.Count; i++)
            {
                var hex = hexes[i];
                if (blocked.Contains(hex))
                {
                    continue;
                }

                var u = i / (double)(6 * d);
                var target = Periodic(control, u) + Periodic(detail, u);
                var terrain = TerrainOf(land, hex);
                var barrier = terrain == Terrain.Mountain || riverTiles.Contains(hex) || giantHexes.Contains(hex);
                index[hex] = hexOf.Count;
                var dq = hex.Q - anchor.Q;
                var dr = hex.R - anchor.R;
                var radius = Math.Sqrt((double)((dq * dq) + (dq * dr) + (dr * dr)));
                hexOf.Add(hex);
                uOf.Add(u);
                costOf.Add((terrain == Terrain.Sea ? SeaStepCost : barrier ? BarrierStepCost : WallStepCost) + (TargetPull * Math.Abs(radius - target)));
            }
        }

        var n = hexOf.Count;
        var adjacency = new List<int>[n];
        for (var a = 0; a < n; a++)
        {
            adjacency[a] = [];
            foreach (var dir in HexCoord.Directions)
            {
                if (index.TryGetValue(hexOf[a] + dir, out var j))
                {
                    adjacency[a].Add(j);
                }
            }
        }

        // Crossing the cut at u = 0 going round (u rising) moves a lap up; back across, a lap down.
        int LapStep(int a, int b) =>
            uOf[a] >= 0.75 && uOf[b] < 0.25 ? 1 : uOf[a] < 0.25 && uOf[b] >= 0.75 ? -1 : 0;

        double bestCost = 0;
        List<int>? bestPath = null;
        for (var s = 0; s < n; s++)
        {
            if (uOf[s] != 0)
            {
                continue;
            }

            // Dijkstra over (hex, lap) from (s, 0) to (s, 1); O(V^2) with fixed tie-breaks.
            var dist = new double[2 * n];
            Array.Fill(dist, double.PositiveInfinity);
            var prev = new int[2 * n];
            Array.Fill(prev, -1);
            var done = new bool[2 * n];
            dist[s] = 0;
            var goal = n + s;
            while (true)
            {
                var v = -1;
                for (var i = 0; i < 2 * n; i++)
                {
                    if (!done[i] && dist[i] < double.PositiveInfinity && (v == -1 || dist[i] < dist[v]))
                    {
                        v = i;
                    }
                }

                if (v == -1 || v == goal)
                {
                    break;
                }

                done[v] = true;
                var lap = v >= n ? 1 : 0;
                var a = v - (lap * n);
                foreach (var b in adjacency[a])
                {
                    var nextLap = lap + LapStep(a, b);
                    if (nextLap < 0 || nextLap > 1)
                    {
                        continue;
                    }

                    if (nextLap == 0 && b == s)
                    {
                        continue;
                    }

                    var w = (nextLap * n) + b;
                    var cost = dist[v] + costOf[b];
                    if (cost < dist[w])
                    {
                        dist[w] = cost;
                        prev[w] = v;
                    }
                }
            }

            if (double.IsPositiveInfinity(dist[goal]))
            {
                continue;
            }

            if (bestPath is not null && dist[goal] >= bestCost)
            {
                continue;
            }

            var path = new List<int>();
            for (var v = prev[goal]; v != -1; v = prev[v])
            {
                path.Add(v % n);
            }

            path.Reverse();
            bestCost = dist[goal];
            bestPath = path;
        }

        return bestPath is null ? [] : WithoutChords([.. bestPath.Select(i => hexOf[i])]);
    }

    /// <summary>
    /// Cuts shortcuts out of a closed hex path until no two non-consecutive hexes are the same or adjacent: at the first such pair
    /// (lowest i, then lowest j) the shorter of the two arcs between them is dropped (the forward one on a tie).
    /// </summary>
    internal static List<HexCoord> WithoutChords(IReadOnlyList<HexCoord> cycle)
    {
        var c = cycle.ToList();
        while (true)
        {
            var n = c.Count;
            (int I, int J)? cut = null;
            for (var i = 0; i < n && cut is null; i++)
            {
                for (var j = i + 2; j < n; j++)
                {
                    if (i == 0 && j == n - 1)
                    {
                        continue;
                    }

                    if (c[i].DistanceTo(c[j]) <= 1)
                    {
                        cut = (i, j);
                        break;
                    }
                }
            }

            if (cut is not { } found || n <= 6)
            {
                return c;
            }

            var (ci, cj) = found;
            var same = c[ci].DistanceTo(c[cj]) == 0;
            var forward = cj - ci - 1;
            var backward = n - (cj - ci) - 1 + (same ? 1 : 0);
            if (forward <= backward)
            {
                c = [.. c.Take(ci + 1), .. c.Skip(same ? cj + 1 : cj)];
            }
            else
            {
                c = [.. c.Skip(ci).Take((same ? cj : cj + 1) - ci)];
            }
        }
    }

    /// <summary>One qualified ring: runs, shore ends, refused runs dropped, gates, pieces.</summary>
    private static List<UtgardWall> ResolveRing(
        List<HexCoord> ring, bool[] eligible, IReadOnlyDictionary<HexCoord, Terrain> land, int seed, UtgardRing ringKind)
    {
        var n = ring.Count;
        Func<HexCoord, Terrain> terrainAt = c => TerrainOf(land, c);

        // Runs of consecutive eligible ring indices, cyclic. A fully eligible ring is one closed run with no ends.
        var runs = new List<List<int>>();
        var closed = eligible.All(e => e);
        if (closed)
        {
            runs.Add([.. Enumerable.Range(0, n)]);
        }
        else
        {
            var start = 0;
            while (eligible[start])
            {
                start++;
            }

            // Walk once around from the first ineligible index.
            List<int>? current = null;
            for (var k = 1; k <= n; k++)
            {
                var i = (start + k) % n;
                if (eligible[i])
                {
                    current ??= [];
                    current.Add(i);
                }
                else if (current is not null)
                {
                    runs.Add(current);
                    current = null;
                }
            }

            if (current is not null)
            {
                runs.Add(current);
            }
        }

        // Land walls of every run first; shore ends are only added where exactly one wall hex touches the sea hex.
        var landWalls = new HashSet<HexCoord>(runs.SelectMany(r => r).Select(i => ring[i]));
        var shoreOfRun = new List<List<int>>();
        var shoreCandidates = new List<(int Run, int Index)>();
        for (var r = 0; r < runs.Count; r++)
        {
            shoreOfRun.Add([]);
            if (closed)
            {
                continue;
            }

            var run = runs[r];
            foreach (var neighbourIndex in new[] { (run[0] + n - 1) % n, (run[^1] + 1) % n })
            {
                var sea = ring[neighbourIndex];
                if (eligible[neighbourIndex] || land.ContainsKey(sea))
                {
                    continue;
                }

                if (PalisadeRules.WallNeighbourCount(sea, landWalls) == 1)
                {
                    shoreCandidates.Add((r, neighbourIndex));
                }
            }
        }

        // A sea end hangs off exactly one wall hex: two candidates next to each other (or one between two runs) would branch, so
        // neither is placed and those run ends stay plain ends.
        var candidateHexes = new HashSet<HexCoord>(landWalls);
        candidateHexes.UnionWith(shoreCandidates.Select(c => ring[c.Index]));
        foreach (var (run, index) in shoreCandidates)
        {
            if (PalisadeRules.WallNeighbourCount(ring[index], candidateHexes) == 1)
            {
                shoreOfRun[run].Add(index);
            }
        }

        // Drop every run the palisade rules would refuse (an isolated single hex, a branch), then re-check: dropping a run changes
        // its shore ends' neighbours.
        var alive = Enumerable.Range(0, runs.Count).ToHashSet();
        bool changed;
        do
        {
            changed = false;
            var set = new HashSet<HexCoord>();
            foreach (var r in alive)
            {
                set.UnionWith(runs[r].Select(i => ring[i]));
                set.UnionWith(shoreOfRun[r].Select(i => ring[i]));
            }

            var wallSet = new WallSet(set, new HashSet<HexCoord>());
            foreach (var r in alive.ToList())
            {
                var hexes = runs[r].Concat(shoreOfRun[r]).Select(i => ring[i]);
                if (hexes.Any(h => PalisadeRules.TileOfWallHex(h, wallSet, terrainAt).IsRefusal))
                {
                    alive.Remove(r);
                    changed = true;
                }
            }
        }
        while (changed);

        var indices = new SortedSet<int>();
        foreach (var r in alive)
        {
            indices.UnionWith(runs[r]);
            indices.UnionWith(shoreOfRun[r]);
        }

        var hexSet = indices.Select(i => ring[i]).ToHashSet();

        // Gates: two straights as far apart along the ring as possible.
        var plain = new WallSet(hexSet, new HashSet<HexCoord>());
        var straights = indices
            .Where(i => terrainAt(ring[i]) != Terrain.Sea
                && PalisadeRules.TileOfWallHex(ring[i], plain, terrainAt).Tile is { Piece: PalisadePiece.Straight180 })
            .ToList();
        var gates = ChooseGates(straights, ring, n, seed);
        var gateSet = new WallSet(hexSet, gates.Select(i => ring[i]).ToHashSet());

        var level = EndgameRules.RingLevel(ringKind);
        var walls = new List<UtgardWall>(indices.Count);
        foreach (var i in indices)
        {
            var tile = PalisadeRules.TileOfWallHex(ring[i], gateSet, terrainAt).Tile
                ?? throw new InvalidOperationException($"Utgard wall hex {ring[i]} lost its piece.");
            walls.Add(new UtgardWall(ring[i], ringKind, tile.Piece, tile.Dir, gateSet.Gates.Contains(ring[i]), level));
        }

        return walls;
    }

    /// <summary>
    /// Up to <see cref="EndgameRules.GatesPerRing"/> gates (two): the pair of straights with the greatest cyclic ring-index distance;
    /// ties broken by the higher summed seed hash, then the lower (Q, R) of the first and second hex. One straight gets one gate.
    /// </summary>
    private static List<int> ChooseGates(List<int> straights, List<HexCoord> ring, int n, int seed)
    {
        if (straights.Count <= 1)
        {
            return [.. straights];
        }

        double HashOf(int i) => ValueNoise.Hash2(ring[i].Q, ring[i].R, seed + 503);
        int Cyclic(int a, int b)
        {
            var d = Math.Abs(a - b);
            return Math.Min(d, n - d);
        }

        (int A, int B)? best = null;
        var bestDistance = -1;
        var bestHash = -1.0;
        for (var x = 0; x < straights.Count; x++)
        {
            for (var y = x + 1; y < straights.Count; y++)
            {
                int a = straights[x], b = straights[y];
                if (ring[b].Q < ring[a].Q || (ring[b].Q == ring[a].Q && ring[b].R < ring[a].R))
                {
                    (a, b) = (b, a);
                }

                var distance = Cyclic(a, b);
                var hash = HashOf(a) + HashOf(b);
                var better = best is null
                    || distance > bestDistance
                    || (distance == bestDistance && hash > bestHash)
                    || (distance == bestDistance && hash == bestHash && LowerKey(ring, a, b, best.Value));
                if (better)
                {
                    best = (a, b);
                    bestDistance = distance;
                    bestHash = hash;
                }
            }
        }

        return [best!.Value.A, best.Value.B];
    }

    private static bool LowerKey(List<HexCoord> ring, int a, int b, (int A, int B) other)
    {
        var mine = (ring[a].Q, ring[a].R, ring[b].Q, ring[b].R);
        var theirs = (ring[other.A].Q, ring[other.A].R, ring[other.B].Q, ring[other.B].R);
        return mine.CompareTo(theirs) < 0;
    }

    private static List<HexCoord> PlaceTowers(
        IReadOnlyList<HexCoord> islandTiles,
        HexCoord anchor,
        IReadOnlyDictionary<HexCoord, Terrain> land,
        IReadOnlySet<HexCoord> riverTiles,
        IReadOnlySet<HexCoord> giantHexes,
        IReadOnlySet<HexCoord> campHexes,
        IReadOnlySet<HexCoord> wallHexes,
        int seed)
    {
        var count = EndgameRules.TowerCountFor(islandTiles.Count);
        // Towers stand outside the inner wall line - between the two lines when there is room, or beyond the outer one.
        var minDistanceFromAnchor = EndgameRules.RingBand(UtgardRing.Inner).Max + 1;

        var candidates = new List<(HexCoord Coord, double Hash)>();
        foreach (var hex in islandTiles.OrderBy(c => c.Q).ThenBy(c => c.R))
        {
            if (!land.TryGetValue(hex, out var terrain) || (terrain != Terrain.Grass && terrain != Terrain.Forest))
            {
                continue;
            }

            if (riverTiles.Contains(hex) || giantHexes.Contains(hex) || campHexes.Contains(hex) || wallHexes.Contains(hex))
            {
                continue;
            }

            if (hex.DistanceTo(anchor) <= minDistanceFromAnchor)
            {
                continue;
            }

            if (hex.Neighbours().Any(wallHexes.Contains))
            {
                continue;
            }

            candidates.Add((hex, ValueNoise.Hash2(hex.Q, hex.R, seed + 401)));
        }

        // Utgard's footprint is the anchor and its neighbours; a tower keeps MinTowerSpacing from every one of them.
        var footprint = Giant.Footprint(anchor);
        candidates.RemoveAll(c => footprint.Any(f => f.DistanceTo(c.Coord) < EndgameRules.MinTowerSpacing));

        var towers = new List<HexCoord>();
        while (towers.Count < count)
        {
            (HexCoord Coord, double Hash)? best = null;
            var bestSpread = -1;
            foreach (var candidate in candidates)
            {
                if (towers.Any(t => t.DistanceTo(candidate.Coord) < EndgameRules.MinTowerSpacing))
                {
                    continue;
                }

                // The first tower is the highest hash; every later one the farthest from Utgard and the towers so far.
                var spread = towers.Count == 0 ? 0 : MinDistance(candidate.Coord, anchor, towers);
                if (best is null
                    || spread > bestSpread
                    || (spread == bestSpread && candidate.Hash > best.Value.Hash)
                    || (spread == bestSpread && candidate.Hash == best.Value.Hash && IsLowerQr(candidate.Coord, best.Value.Coord)))
                {
                    best = candidate;
                    bestSpread = spread;
                }
            }

            if (best is null)
            {
                break;
            }

            towers.Add(best.Value.Coord);
        }

        return towers;
    }

    private static int MinDistance(HexCoord c, HexCoord anchor, List<HexCoord> towers)
    {
        var min = c.DistanceTo(anchor);
        foreach (var t in towers)
        {
            min = Math.Min(min, c.DistanceTo(t));
        }

        return min;
    }

    private static bool IsLowerQr(HexCoord a, HexCoord b) => a.Q != b.Q ? a.Q < b.Q : a.R < b.R;
}
