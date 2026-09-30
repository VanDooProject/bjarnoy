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
    /// Land tiles per seal colony: an island's sand rim is always the farthest ground from its
    /// interior camps, so without a cap farthest-point sampling hands most picks to seals.
    /// </summary>
    public const int SandTilesPerSealCamp = 2000;

    /// <summary>At most this many seal colonies on an island of <paramref name="landTileCount"/> tiles (rounded, at least 1).</summary>
    public static int MaxSealCampsFor(int landTileCount) =>
        Math.Max(1, ((2 * landTileCount) + SandTilesPerSealCamp) / (2 * SandTilesPerSealCamp));

    /// <summary>
    /// Land tiles per eagle eyrie: mountains are big and often the farthest ground from the
    /// other camps, so without a cap they take a large share of the weak budget.
    /// </summary>
    public const int MountainTilesPerEyrieCamp = 2000;

    /// <summary>At most this many eagle eyries on an island of <paramref name="landTileCount"/> tiles (rounded, at least 1).</summary>
    public static int MaxEyrieCampsFor(int landTileCount) =>
        Math.Max(1, ((2 * landTileCount) + MountainTilesPerEyrieCamp) / (2 * MountainTilesPerEyrieCamp));

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
            CampFamilyInfo? info;
            if (riverByHex.TryGetValue(coord, out var river))
            {
                // Only a plain Straight river-width tile may hold bearrapids (a stream or a
                // widening tile has no bearrapids art); every other river tile (and every wasted
                // lava tile) is out.
                if (wasted || river.Shape != RiverTileShape.Straight || river.Width != RiverWidth.River)
                {
                    continue;
                }

                info = FamilyFor(CampGround.RiverStraight);
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
                    // Only plain bog moss (not a lake, shore, mouth or creek) holds a camp: moosemire, beaverlodge or
                    // cranedance, by hash.
                    info = plainBog is not null && plainBog.Contains(coord) ? BogFamilyFor(coord, seed) : null;
                }
                else
                {
                    info = GroundOf(terrain, wasted) is { } ground ? FamilyFor(ground) : null;
                }
            }

            if (info is null)
            {
                continue;
            }

            candidates.Add(new Candidate(
                coord,
                info,
                orientation,
                ValueNoise.Hash2(coord.Q, coord.R, seed + 131)));
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

    /// <summary>The family placed on a (non-bog) ground.</summary>
    private static CampFamilyInfo FamilyFor(CampGround ground) => CampFamilies.All.First(f => f.Ground == ground);

    /// <summary>One of the three bog camp families, by a hash of the hex (they share the bog ground).</summary>
    private static CampFamilyInfo BogFamilyFor(HexCoord coord, int seed)
    {
        var bogFamilies = CampFamilies.All.Where(f => f.Ground == CampGround.Bog).ToList();
        var index = (int)Math.Floor(ValueNoise.Hash2(coord.Q, coord.R, seed + 137) * bogFamilies.Count);
        return bogFamilies[Math.Min(index, bogFamilies.Count - 1)];
    }

    /// <summary>
    /// The art rotation of a straight river tile flowing through <paramref name="direction"/> —
    /// the same file the plain river tile uses (<c>straightOrientationOf</c> in the frontend).
    /// </summary>
    public static TileOrientation StraightOrientationOf(TileOrientation direction) =>
        (TileOrientation)(((2 - (int)direction) + 6) % 6);

    private sealed record Candidate(HexCoord Coord, CampFamilyInfo Info, TileOrientation? Orientation, double Hash);
}
