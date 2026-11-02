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

        foreach (var ringKind in new[] { UtgardRing.Inner, UtgardRing.Outer })
        {
            var ring = Ring(anchor, EndgameRules.RingRadius(ringKind));
            var eligible = new bool[ring.Count];
            var eligibleCount = 0;
            for (var i = 0; i < ring.Count; i++)
            {
                var hex = ring[i];
                eligible[i] = land.ContainsKey(hex)
                    && !riverTiles.Contains(hex)
                    && !giantHexes.Contains(hex)
                    && !campHexes.Contains(hex)
                    && PalisadeRules.CanPlace(hex, WallSet.Empty, ctx) is null;
                if (eligible[i])
                {
                    eligibleCount++;
                }
            }

            if (eligibleCount < EndgameRules.MinRingLandShare * ring.Count)
            {
                continue;
            }

            var ringWalls = ResolveRing(ring, eligible, land, seed, ringKind);
            result.AddRange(ringWalls);
        }

        return result;
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
        var minDistanceFromAnchor = EndgameRules.OuterRingRadius + 1;

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
