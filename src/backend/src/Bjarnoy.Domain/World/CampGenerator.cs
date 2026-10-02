namespace Bjarnoy.Domain.World;

/// <summary>
/// Places wildlife camps on an island: candidate tiles by ground, then farthest-point
/// sampling (like the river springs) with a minimum spacing, weighted so every ground the
/// island has gets a camp before any ground gets a second, and a pick only from a kind (strong / weak)
/// whose budget is not used up. Pure and seed-derived, called
/// once per island from <see cref="WorldGenerator.Generate"/> after giants and before
/// start positions. Mirrored bit for bit by <c>src/frontend/src/lib/map/campPlacement.ts</c>.
/// See <c>docs/design/wildlife-camps.md</c>.
/// </summary>
internal static class CampGenerator
{
    /// <summary>One strong camp per this many land tiles (rounded), tuning default.</summary>
    public const int StrongCampTilesPer = 1500;

    /// <summary>One weak camp per this many land tiles (rounded), tuning default. Weak camps have no start-position distance rule.</summary>
    public const int WeakCampTilesPer = 600;

    /// <summary>No island gets more strong camps than this, tuning default.</summary>
    public const int MaxStrongCampsPerIsland = 16;

    /// <summary>No island gets more weak camps than this, tuning default.</summary>
    public const int MaxWeakCampsPerIsland = 24;

    /// <summary>An island with fewer land tiles than this gets no camp at all (islets stay camp-free), tuning default.</summary>
    public const int MinCampIslandTiles = 60;

    /// <summary>Two camps are never closer than this many hex steps, tuning default.</summary>
    public const int MinCampSpacing = 6;

    /// <summary>
    /// Land tiles per sand camp (seal or walrus): an island's sand rim is always the farthest ground
    /// from its interior camps, so without a cap farthest-point sampling hands most picks to it.
    /// </summary>
    public const int SandTilesPerSealCamp = 2000;

    /// <summary>At most this many sand camps (seal and walrus together) on an island of <paramref name="landTileCount"/> tiles (rounded, at least 1).</summary>
    public static int MaxSealCampsFor(int landTileCount) =>
        Math.Max(1, ((2 * landTileCount) + SandTilesPerSealCamp) / (2 * SandTilesPerSealCamp));

    /// <summary>
    /// Land tiles per eagle eyrie: mountains are big and often the farthest ground from the
    /// other camps, so without a cap they take a large share of the strong budget.
    /// </summary>
    public const int MountainTilesPerEyrieCamp = 2000;

    /// <summary>At most this many eagle eyries on an island of <paramref name="landTileCount"/> tiles (rounded, at least 1).</summary>
    public static int MaxEyrieCampsFor(int landTileCount) =>
        Math.Max(1, ((2 * landTileCount) + MountainTilesPerEyrieCamp) / (2 * MountainTilesPerEyrieCamp));

    /// <summary>One whale road per this many land tiles (rounded, at least 1, see <see cref="WhaleCountFor"/>), tuning default.</summary>
    public const int WhaleTilesPer = 3000;

    /// <summary>No island gets more whale roads than this, tuning default.</summary>
    public const int MaxWhaleCampsPerIsland = 3;

    /// <summary>A whale road lies at least this many hexes from its island's nearest land tile, tuning default.</summary>
    public const int WhaleMinShoreDistance = 6;

    /// <summary>A whale road lies at most this many hexes from its island's nearest land tile, tuning default.</summary>
    public const int WhaleMaxShoreDistance = 10;

    /// <summary>No land of any island lies within this many hexes of a whale road (so the nearest land overall is further than this).</summary>
    public const int WhaleClearRadius = 5;

    /// <summary>Two whale roads of one island are never closer than this many hex steps, tuning default.</summary>
    public const int MinWhaleSpacing = 12;

    /// <summary>Hash salts of the sea pass: independent of the land camps' (<c>seed + 131</c> candidates, <c>seed + 313</c> levels).</summary>
    private const int WhaleHashSalt = 4_093;

    private const int WhaleLevelSalt = 5_419;

    /// <summary>Camp levels are rolled in <c>1..MaxCampLevel</c>, tuning default.</summary>
    public const int MaxCampLevel = 5;

    /// <summary>
    /// A start position keeps away from a strong camp by its guard range plus this margin:
    /// it is dropped when its distance to the camp is at most <c>GuardRange + StartPositionMargin</c>.
    /// </summary>
    public const int StartPositionMargin = 2;

    /// <summary>
    /// A placement before orientation is attached: the pure core, shared with the frontend
    /// port. <paramref name="Orientation"/> is set only for a bearrapids camp, which follows
    /// its river; every other camp takes the tile's own orientation from the sampler.
    /// </summary>
    public readonly record struct Placement(HexCoord Coord, string Family, int Level, TileOrientation? Orientation);

    /// <summary>
    /// The range of land a camp of <paramref name="level"/> guards, in hex steps. Tuning
    /// default: weak <c>1 + floor(level / 2)</c> (1..3), strong <c>2 + level</c> (3..7).
    /// </summary>
    public static int GuardRange(int level, CampStrength strength) =>
        strength == CampStrength.Strong ? 2 + level : 1 + (level / 2);

    public static IReadOnlyList<Camp> Generate(
        IReadOnlyList<HexCoord> islandTiles,
        Dictionary<HexCoord, Terrain> land,
        TerrainSampler sampler,
        WorldGenerationOptions options,
        int islandIndex,
        IReadOnlyList<RiverTile> riverTiles,
        IReadOnlyList<Giant> giants,
        bool wasted = false,
        IReadOnlySet<HexCoord>? plainBog = null)
    {
        var placements = PlaceCore(
            islandTiles, land, riverTiles, giants.Select(g => g.Anchor).ToList(), options.Seed, islandIndex, wasted, plainBog);

        var camps = new List<Camp>(placements.Count);
        foreach (var placement in placements)
        {
            var orientation = placement.Orientation ?? sampler.OrientationAt(placement.Coord);
            camps.Add(new Camp(placement.Coord, placement.Family, placement.Level, orientation));
        }

        return camps;
    }

    /// <summary>
    /// The whale roads of a green island: <see cref="PlaceWhaleRoads"/> over the world's whole terrain (green or wasted
    /// land of any island blocks), with the sampler's orientation attached. Run after the island's land camps.
    /// </summary>
    public static IReadOnlyList<Camp> GenerateWhaleRoads(
        IReadOnlyList<HexCoord> islandTiles, TerrainSampler sampler, WorldGenerationOptions options, int islandIndex)
    {
        var placements = PlaceWhaleRoads(
            islandTiles,
            c => sampler.TerrainAt(c).IsLand() || sampler.WastedTerrainAt(c).IsLand(),
            options.Seed,
            islandIndex);
        return [.. placements.Select(p => new Camp(p.Coord, p.Family, p.Level, p.Orientation ?? sampler.OrientationAt(p.Coord)))];
    }

    /// <summary>The whale-road budget of an island: <c>clamp(round(land / WhaleTilesPer), 1, MaxWhaleCampsPerIsland)</c>.</summary>
    public static int WhaleCountFor(int landTileCount) =>
        Math.Clamp(((2 * landTileCount) + WhaleTilesPer) / (2 * WhaleTilesPer), 1, MaxWhaleCampsPerIsland);

    /// <summary>
    /// The pure sea pass (the first water camp, <see cref="CampFamilies.Whaleroad"/>), mirrored bit for bit by
    /// <c>placeWhaleRoads</c> in <c>campPlacement.ts</c>. For a green island of at least <see cref="MinCampIslandTiles"/>
    /// land tiles: candidates are the hexes whose distance to the island's nearest land tile is
    /// <see cref="WhaleMinShoreDistance"/>..<see cref="WhaleMaxShoreDistance"/> and whose nearest land of any island is
    /// that island's (no land of another island at the same or a shorter distance, so no land within
    /// <see cref="WhaleClearRadius"/> and two islands never offer the same hex). <see cref="WhaleCountFor"/> picks by
    /// farthest-point sampling at least <see cref="MinWhaleSpacing"/> apart (first pick: best hash; ties: hash, then q, r).
    /// </summary>
    /// <param name="isLand">Whether a hex of the whole world is land, of any island (wasted ones too).</param>
    public static IReadOnlyList<Placement> PlaceWhaleRoads(
        IReadOnlyList<HexCoord> islandTiles,
        Func<HexCoord, bool> isLand,
        int worldSeed,
        int islandIndex)
    {
        ArgumentNullException.ThrowIfNull(islandTiles);
        ArgumentNullException.ThrowIfNull(isLand);

        if (islandTiles.Count < MinCampIslandTiles)
        {
            return [];
        }

        var seed = worldSeed + (islandIndex * 300_007);
        var count = WhaleCountFor(islandTiles.Count);
        var own = new HashSet<HexCoord>(islandTiles);

        // Distance to the nearest island tile of every hex out to WhaleMaxShoreDistance, by expanding rings
        // from the coast (a tile with a neighbour outside the island): no scan of the world.
        var shore = new Dictionary<HexCoord, int>();
        var frontier = new List<HexCoord>();
        foreach (var tile in islandTiles)
        {
            foreach (var n in tile.Neighbours())
            {
                if (!own.Contains(n) && shore.TryAdd(n, 1))
                {
                    frontier.Add(n);
                }
            }
        }

        for (var d = 2; d <= WhaleMaxShoreDistance; d++)
        {
            var next = new List<HexCoord>();
            foreach (var hex in frontier)
            {
                foreach (var n in hex.Neighbours())
                {
                    if (!own.Contains(n) && shore.TryAdd(n, d))
                    {
                        next.Add(n);
                    }
                }
            }

            frontier = next;
        }

        var candidates = shore
            .Where(e => e.Value >= WhaleMinShoreDistance)
            .Select(e => (Coord: e.Key, Shore: e.Value))
            .OrderBy(c => c.Coord.Q)
            .ThenBy(c => c.Coord.R)
            .Select(c => new WhaleCandidate(c.Coord, c.Shore, ValueNoise.Hash2(c.Coord.Q, c.Coord.R, seed + WhaleHashSalt)))
            .ToList();
        if (candidates.Count == 0)
        {
            return [];
        }

        // Open-sea validity is checked lazily, only for candidates that would win a pick (rejecting a winner is the
        // same as never having offered it): no land of another island within the candidate's own shore distance.
        var validity = new sbyte[candidates.Count];
        bool IsOpenSea(int i)
        {
            if (validity[i] == 0)
            {
                var candidate = candidates[i];
                validity[i] = 1;
                foreach (var hex in candidate.Coord.WithinRadius(candidate.Shore))
                {
                    if (!own.Contains(hex) && isLand(hex))
                    {
                        validity[i] = 2;
                        break;
                    }
                }
            }

            return validity[i] == 1;
        }

        var minDistance = new int[candidates.Count];
        Array.Fill(minDistance, int.MaxValue);
        var chosen = new List<WhaleCandidate>();
        var picked = new bool[candidates.Count];

        while (chosen.Count < count)
        {
            // Farthest from every road so far, at least MinWhaleSpacing from all; ties by hash, then (Q, R).
            var order = Enumerable.Range(0, candidates.Count)
                .Where(i => !picked[i] && minDistance[i] >= MinWhaleSpacing && validity[i] != 2)
                .OrderByDescending(i => minDistance[i])
                .ThenByDescending(i => candidates[i].Hash)
                .ThenBy(i => i);

            var index = -1;
            foreach (var i in order)
            {
                if (IsOpenSea(i))
                {
                    index = i;
                    break;
                }
            }

            if (index < 0)
            {
                break;
            }

            picked[index] = true;
            chosen.Add(candidates[index]);
            for (var i = 0; i < candidates.Count; i++)
            {
                var distance = candidates[i].Coord.DistanceTo(candidates[index].Coord);
                if (distance < minDistance[i])
                {
                    minDistance[i] = distance;
                }
            }
        }

        return [.. chosen.Select(c => new Placement(c.Coord, CampFamilies.Whaleroad, RollWhaleLevel(c, seed), null))];
    }

    /// <summary>Cubic level roll of a whale road, <c>1 + floor(u^3 * 5)</c>, on the sea pass's own salt.</summary>
    private static int RollWhaleLevel(WhaleCandidate candidate, int seed)
    {
        var u = ValueNoise.Hash2(candidate.Coord.Q, candidate.Coord.R, seed + WhaleLevelSalt);
        return 1 + Math.Min(MaxCampLevel - 1, (int)Math.Floor(u * u * u * MaxCampLevel));
    }

    private sealed record WhaleCandidate(HexCoord Coord, int Shore, double Hash);

    /// <summary>The strong-camp budget of an island: none below <see cref="MinCampIslandTiles"/>, else <c>clamp(round(land / StrongCampTilesPer), 0, MaxStrongCampsPerIsland)</c>.</summary>
    public static int StrongCountFor(int landTileCount) =>
        landTileCount < MinCampIslandTiles ? 0 : Math.Clamp(((2 * landTileCount) + StrongCampTilesPer) / (2 * StrongCampTilesPer), 0, MaxStrongCampsPerIsland);

    /// <summary>The weak-camp budget of an island: none below <see cref="MinCampIslandTiles"/>, else <c>clamp(round(land / WeakCampTilesPer), 0, MaxWeakCampsPerIsland)</c>.</summary>
    public static int WeakCountFor(int landTileCount) =>
        landTileCount < MinCampIslandTiles ? 0 : Math.Clamp(((2 * landTileCount) + WeakCampTilesPer) / (2 * WeakCampTilesPer), 0, MaxWeakCampsPerIsland);

    /// <summary>
    /// The most camps an island of this many land tiles is offered (before ground and spacing cut it
    /// down): the two budgets added, and at least one once the island has <see cref="MinCampIslandTiles"/>
    /// (that one is strong or weak, whichever ground the island offers).
    /// </summary>
    public static int CampCountFor(int landTileCount) =>
        landTileCount < MinCampIslandTiles ? 0 : Math.Max(1, StrongCountFor(landTileCount) + WeakCountFor(landTileCount));

    /// <summary>
    /// The pure placement core. Takes only what the rules need, so a test or the golden
    /// fixture can call it without a whole <see cref="WorldGenerator"/> run.
    /// </summary>
    public static IReadOnlyList<Placement> PlaceCore(
        IReadOnlyList<HexCoord> islandTiles,
        IReadOnlyDictionary<HexCoord, Terrain> land,
        IReadOnlyList<RiverTile> riverTiles,
        IReadOnlyList<HexCoord> giantAnchors,
        int worldSeed,
        int islandIndex,
        bool wasted = false,
        IReadOnlySet<HexCoord>? plainBog = null)
    {
        if (islandTiles.Count < MinCampIslandTiles)
        {
            return [];
        }

        // Large prime spacing so this draws from a noise field independent of the island's
        // rivers/giants/names, the same trick the other generators use.
        var seed = worldSeed + (islandIndex * 300_007);

        var blocked = new HashSet<HexCoord>();
        foreach (var anchor in giantAnchors)
        {
            foreach (var hex in Giant.Footprint(anchor))
            {
                blocked.Add(hex);
            }
        }

        var riverByHex = new Dictionary<HexCoord, RiverTile>(riverTiles.Count);
        foreach (var tile in riverTiles)
        {
            riverByHex[tile.Coord] = tile;
        }

        var candidates = new List<Candidate>();
        foreach (var coord in islandTiles.OrderBy(c => c.Q).ThenBy(c => c.R))
        {
            if (blocked.Contains(coord) || !land.TryGetValue(coord, out var terrain))
            {
                continue;
            }

            TileOrientation? orientation = null;
            IReadOnlyList<CampFamilyInfo> families;
            if (riverByHex.TryGetValue(coord, out var river))
            {
                // Only a plain Straight river-width tile may hold bearrapids (a stream or a
                // widening tile has no bearrapids art); every other river tile (and every wasted
                // lava tile) is out.
                if (wasted || river.Shape != RiverTileShape.Straight || river.Width != RiverWidth.River)
                {
                    continue;
                }

                families = FamiliesFor(CampGround.RiverStraight);
                var direction = river.InDirections.Count > 0 ? river.InDirections[0] : river.OutDirection;
                if (direction is null)
                {
                    continue;
                }

                orientation = StraightOrientationOf(direction.Value);
            }
            else
            {
                if (terrain == Terrain.Bog)
                {
                    // Only plain bog moss (not a lake, shore, mouth or creek) holds a camp: the moose mire
                    // (strong) or the beaver lodge / crane dance (weak), one candidate each (below).
                    families = plainBog is not null && plainBog.Contains(coord) ? FamiliesFor(CampGround.Bog) : [];
                }
                else
                {
                    families = GroundOf(terrain, wasted) is { } ground ? FamiliesFor(ground) : [];
                }
            }

            // One candidate per family the ground holds (sand: the walrus, strong, and the
            // seals, weak), so the two budgets decide which one a tile gets. The first family
            // keeps the plain hash; each further one draws its own. Once a tile is picked, its
            // other candidates sit at distance 0 and can never be picked (MinCampSpacing).
            for (var k = 0; k < families.Count; k++)
            {
                candidates.Add(new Candidate(
                    coord,
                    families[k],
                    orientation,
                    ValueNoise.Hash2(coord.Q, coord.R, seed + 131 + (k * FamilyHashSalt))));
            }
        }

        // Two budgets, one shared farthest-point sampling. An island whose budgets both round to
        // zero still gets one camp, of either kind.
        var strongBudget = StrongCountFor(islandTiles.Count);
        var weakBudget = WeakCountFor(islandTiles.Count);
        var count = CampCountFor(islandTiles.Count);
        if (strongBudget + weakBudget == 0)
        {
            strongBudget = 1;
            weakBudget = 1;
        }

        var strongUsed = 0;
        var weakUsed = 0;
        var chosen = new List<Candidate>();
        if (candidates.Count == 0)
        {
            return [];
        }

        var minDistance = new int[candidates.Count];
        Array.Fill(minDistance, int.MaxValue);
        var picked = new bool[candidates.Count];
        var represented = new HashSet<CampGround>();
        var maxSeals = MaxSealCampsFor(islandTiles.Count);
        var maxEyries = MaxEyrieCampsFor(islandTiles.Count);
        var seals = 0;
        var eyries = 0;

        while (chosen.Count < count)
        {
            // Grounds without a camp first; once none of them has an eligible tile left,
            // any ground. (The first pick: nothing is placed, so all distances tie and the
            // hash decides.)
            var sandFull = seals >= maxSeals;
            var mountainFull = eyries >= maxEyries;
            var strongOpen = strongUsed < strongBudget;
            var weakOpen = weakUsed < weakBudget;
            var index = PickBest(candidates, minDistance, picked, represented, restrictToUnrepresented: true, sandFull, mountainFull, strongOpen, weakOpen);
            if (index < 0)
            {
                index = PickBest(candidates, minDistance, picked, represented, restrictToUnrepresented: false, sandFull, mountainFull, strongOpen, weakOpen);
            }

            if (index < 0)
            {
                break;
            }

            var pick = candidates[index];
            picked[index] = true;
            chosen.Add(pick);
            represented.Add(pick.Info.Ground);
            if (pick.Info.Strength == CampStrength.Strong)
            {
                strongUsed++;
            }
            else
            {
                weakUsed++;
            }

            if (pick.Info.Ground == CampGround.Sand)
            {
                seals++;
            }

            if (pick.Info.Ground == CampGround.Mountain)
            {
                eyries++;
            }

            for (var i = 0; i < candidates.Count; i++)
            {
                var distance = candidates[i].Coord.DistanceTo(pick.Coord);
                if (distance < minDistance[i])
                {
                    minDistance[i] = distance;
                }
            }
        }

        return chosen
            .Select(c => new Placement(c.Coord, c.Info.Family, RollLevel(c, seed), c.Orientation))
            .ToList();
    }

    /// <summary>
    /// The candidate to add next: farthest from every camp placed so far, among candidates
    /// at least <see cref="MinCampSpacing"/> from all of them; ties by the seed hash, then
    /// (Q, R). The first pick (no camp placed yet) is simply the hash-best candidate. With
    /// <paramref name="restrictToUnrepresented"/>, only candidates on a ground that has no
    /// camp yet are considered. Returns -1 when nothing qualifies.
    /// </summary>
    private static int PickBest(
        List<Candidate> candidates,
        int[] minDistance,
        bool[] picked,
        HashSet<CampGround> represented,
        bool restrictToUnrepresented,
        bool sandFull,
        bool mountainFull,
        bool strongOpen,
        bool weakOpen)
    {
        var best = -1;
        for (var i = 0; i < candidates.Count; i++)
        {
            if (picked[i] || minDistance[i] < MinCampSpacing)
            {
                continue;
            }

            if (restrictToUnrepresented && represented.Contains(candidates[i].Info.Ground))
            {
                continue;
            }

            if (candidates[i].Info.Strength == CampStrength.Strong ? !strongOpen : !weakOpen)
            {
                continue;
            }

            if (mountainFull && candidates[i].Info.Ground == CampGround.Mountain)
            {
                continue;
            }

            if (sandFull && candidates[i].Info.Ground == CampGround.Sand)
            {
                continue;
            }

            if (best < 0)
            {
                best = i;
                continue;
            }

            var byDistance = minDistance[i].CompareTo(minDistance[best]);
            if (byDistance > 0 || (byDistance == 0 && candidates[i].Hash > candidates[best].Hash))
            {
                best = i;
            }
            // Equal distance and equal hash: candidates are in (Q, R) order, so the earlier one stays.
        }

        return best;
    }

    /// <summary>
    /// A level in <c>1..MaxCampLevel</c>, skewed low for every family so few start positions are lost:
    /// weak <c>1 + floor(u^2 * 5)</c> (about 45/19/14/12/11 percent on levels 1..5), strong
    /// <c>1 + floor(u^3 * 5)</c> (about 59/15/11/9/7 percent), capped at <see cref="MaxCampLevel"/>.
    /// Only multiplications and <c>floor</c>, so C# and TS agree bit for bit.
    /// </summary>
    private static int RollLevel(Candidate candidate, int seed)
    {
        var u = ValueNoise.Hash2(candidate.Coord.Q, candidate.Coord.R, seed + 313);
        var f = candidate.Info.LevelSkew == CampLevelSkew.Quadratic ? u * u : u * u * u;
        return 1 + Math.Min(MaxCampLevel - 1, (int)Math.Floor(f * MaxCampLevel));
    }

    /// <summary>The ground a plain land tile offers a camp, or null when it offers none.</summary>
    private static CampGround? GroundOf(Terrain terrain, bool wasted)
    {
        if (wasted)
        {
            // Only wasteland (wasted grass) holds a camp on a wasted island; the rest is
            // dead forest, black sand and ashen mountain.
            return terrain == Terrain.Grass ? CampGround.Wasteland : null;
        }

        return terrain switch
        {
            Terrain.Grass => CampGround.Grass,
            Terrain.Forest => CampGround.Forest,
            Terrain.Sand => CampGround.Sand,
            Terrain.Mountain => CampGround.Mountain,
            _ => null,
        };
    }

    /// <summary>Hash salt between a ground's families (see the candidate loop in <see cref="PlaceCore"/>).</summary>
    private const int FamilyHashSalt = 7919;

    /// <summary>The families placed on a ground, in table order.</summary>
    private static IReadOnlyList<CampFamilyInfo> FamiliesFor(CampGround ground) =>
        CampFamilies.All.Where(f => f.Ground == ground).ToList();

    /// <summary>
    /// The art rotation of a straight river tile flowing through <paramref name="direction"/> —
    /// the same file the plain river tile uses (<c>straightOrientationOf</c> in the frontend).
    /// </summary>
    public static TileOrientation StraightOrientationOf(TileOrientation direction) =>
        (TileOrientation)(((2 - (int)direction) + 6) % 6);

    private sealed record Candidate(HexCoord Coord, CampFamilyInfo Info, TileOrientation? Orientation, double Hash);
}
