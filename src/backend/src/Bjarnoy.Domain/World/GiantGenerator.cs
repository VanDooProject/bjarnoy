namespace Bjarnoy.Domain.World;

/// <summary>
/// Places 7-hex giant features on an island: scans every land hex as a
/// candidate anchor, filters to the ones whose whole footprint qualifies,
/// scores the survivors and keeps the best non-overlapping handful, then
/// rolls a single shrine anchor for the island. Follows
/// <see cref="RiverGenerator"/>'s pattern end to end — pure, seed-derived,
/// called once per island from <see cref="WorldGenerator.Generate"/>.
/// </summary>
/// <remarks>
/// Placement no longer avoids the island's start positions — since v2, it is
/// the other way round: <see cref="WorldGenerator"/> generates giants first,
/// then <c>FindStartPositions</c> drops any candidate too close to a giant's
/// footprint (<see cref="StartPositionExclusionRadius"/>). This keeps giants
/// anchored to the terrain that actually qualifies them (mountain clusters,
/// a quiet inland clearing) instead of having their placement nudged around
/// by wherever a start position happened to land first.
/// </remarks>
internal static class GiantGenerator
{
    /// <summary>A candidate mountain anchor's footprint must contain at least this many Mountain hexes.</summary>
    public const int MinimumMountainHexes = 3;

    /// <summary>
    /// No island start position may fall within this many hex-distance steps
    /// short of a giant's footprint — i.e. a start position is dropped when
    /// its distance to a giant's anchor is less than
    /// <c>StartPositionExclusionRadius + 1</c> (a giant's footprint already
    /// reaches 1 step from its own anchor, so this is "no founding spot
    /// within 4 of any footprint hex"). Enforced by
    /// <see cref="WorldGenerator"/>'s <c>FindStartPositions</c>, not here —
    /// giants are placed first and start positions steer clear of them.
    /// </summary>
    public const int StartPositionExclusionRadius = 4;

    /// <summary>
    /// Two placed giants' anchors must be at least this many hex-distance
    /// steps apart, which keeps their 7-hex footprints from touching (each
    /// footprint reaches at most 1 step from its own anchor).
    /// </summary>
    public const int MinimumGiantSpacing = 4;

    /// <summary>An island needs at least this many land tiles to be offered a single giant.</summary>
    public const int SmallIslandGiantThreshold = 150;

    /// <summary>An island needs at least this many land tiles to be offered a second giant.</summary>
    public const int LargeIslandGiantThreshold = 450;

    /// <summary>The tile-art family a mountain-cluster giant uses on a green island.</summary>
    public const string MountainFamily = "giantmountain";

    /// <summary>The tile-art family a mountain-cluster giant uses on a wasted island.</summary>
    public const string VolcanoFamily = "giantvolcano";

    /// <summary>The tile-art family a shrine giant uses.</summary>
    public const string ShrineFamily = "giantshrine";

    /// <summary>
    /// The tile-art family a wasted island's own giant uses — placed instead
    /// of a shrine, one per wasted island with a valid spot, no chance roll
    /// or size threshold beyond <see cref="SmallIslandGiantThreshold"/>.
    /// </summary>
    public const string UtgardFamily = "giantutgard";

    /// <summary>
    /// Per-island odds (rolled with the world seed and the island index, so
    /// it is deterministic without depending on scan order) that a
    /// qualifying island is offered a shrine, independent of the mountain
    /// giant count/cap.
    /// </summary>
    public const double ShrineChance = 1.0 / 12.0;

    /// <summary>
    /// A placement before orientation is attached — the pure core this class
    /// builds, shared by the backend (which attaches orientation via
    /// <see cref="TerrainSampler.OrientationAt"/>) and mirrored bit-for-bit
    /// by the frontend's own <c>giantPlacement.ts</c>.
    /// </summary>
    public readonly record struct Placement(HexCoord Anchor, string Family);

    public static IReadOnlyList<Giant> Generate(
        IReadOnlyList<HexCoord> islandTiles,
        Dictionary<HexCoord, Terrain> land,
        TerrainSampler sampler,
        WorldGenerationOptions options,
        int islandIndex,
        IReadOnlySet<HexCoord> riverTiles,
        bool wasted = false)
    {
        var placements = PlaceCore(islandTiles, land, riverTiles, options.Seed, islandIndex, wasted);

        var chosen = new List<Giant>(placements.Count);
        foreach (var placement in placements)
        {
            var orientation = sampler.OrientationAt(placement.Anchor);
            chosen.Add(new Giant(placement.Anchor, placement.Family, orientation));
        }

        return chosen;
    }

    /// <summary>
    /// The pure placement core: which anchors get a giant and which family,
    /// with no orientation attached (the caller's job — see <see cref="Giant"/>'s
    /// own doc comment on why orientation is derived separately). Takes only
    /// what the placement rules actually need — island tiles, a terrain
    /// lookup, river tiles, the world seed and the island's index — so it is
    /// easy to call from a test or a golden-fixture generator without
    /// standing up a whole <see cref="WorldGenerator"/> run, and easy to
    /// mirror in TypeScript.
    /// </summary>
    public static IReadOnlyList<Placement> PlaceCore(
        IReadOnlyList<HexCoord> islandTiles,
        IReadOnlyDictionary<HexCoord, Terrain> land,
        IReadOnlySet<HexCoord> riverTiles,
        int worldSeed,
        int islandIndex,
        bool wasted = false)
    {
        var islandLand = new HashSet<HexCoord>(islandTiles);
        var placements = new List<Placement>();

        // Large prime spacing so this draws from a noise field independent
        // of the island's rivers/names — the same trick RiverGenerator and
        // IslandNames use for their own per-index offsets.
        var seed = worldSeed + (islandIndex * 200_003);

        var maxGiants = MaxGiantsFor(islandTiles.Count);
        var mountainAnchors = new List<HexCoord>();

        if (maxGiants > 0)
        {
            var candidates = new List<(HexCoord Anchor, int MountainCount, double TieBreak)>();
            foreach (var anchor in islandTiles.OrderBy(c => c.Q).ThenBy(c => c.R))
            {
                if (!TryScoreMountainCandidate(anchor, islandLand, land, riverTiles, seed, out var mountainCount, out var tieBreak))
                {
                    continue;
                }

                candidates.Add((anchor, mountainCount, tieBreak));
            }

            // Best first: more Mountain hexes in the footprint wins; ties
            // broken by the seed-derived hash of the anchor, so placement is
            // deterministic for a given seed without depending on scan order.
            candidates.Sort((a, b) =>
            {
                var byMountain = b.MountainCount.CompareTo(a.MountainCount);
                return byMountain != 0 ? byMountain : b.TieBreak.CompareTo(a.TieBreak);
            });

            foreach (var candidate in candidates)
            {
                if (mountainAnchors.Count >= maxGiants)
                {
                    break;
                }

                if (mountainAnchors.Any(a => a.DistanceTo(candidate.Anchor) < MinimumGiantSpacing))
                {
                    continue;
                }

                mountainAnchors.Add(candidate.Anchor);
                placements.Add(new Placement(candidate.Anchor, wasted ? VolcanoFamily : MountainFamily));
            }
        }

        if (wasted)
        {
            // Wasted islands get no shrine and no chance roll: instead, one
            // Utgard giant per wasted island with a valid spot — same
            // candidate rules as a shrine (footprint Grass/Forest only, no
            // river/lava tile, non-coastal, spaced from every volcano
            // anchor), same tie-break, but unconditional above the same size
            // threshold a mountain giant needs.
            if (islandTiles.Count >= SmallIslandGiantThreshold)
            {
                var utgardAnchor = PickShrineAnchor(islandTiles, islandLand, land, riverTiles, mountainAnchors, seed);
                if (utgardAnchor is { } anchor)
                {
                    placements.Add(new Placement(anchor, UtgardFamily));
                }
            }

            return placements;
        }

        // Shrines are additional — rolled independently of the mountain
        // count/cap, so even an island that got no mountain giant (or maxed
        // out its two) can still offer a shrine.
        if (islandTiles.Count >= SmallIslandGiantThreshold &&
            ValueNoise.Hash2(islandIndex, 0, worldSeed + 211) < ShrineChance)
        {
            var shrineAnchor = PickShrineAnchor(islandTiles, islandLand, land, riverTiles, mountainAnchors, seed);
            if (shrineAnchor is { } anchor)
            {
                placements.Add(new Placement(anchor, ShrineFamily));
            }
        }

        return placements;
    }

    /// <summary>How many giants an island of this size may be offered.</summary>
    private static int MaxGiantsFor(int landTileCount)
    {
        if (landTileCount >= LargeIslandGiantThreshold)
        {
            return 2;
        }

        if (landTileCount >= SmallIslandGiantThreshold)
        {
            return 1;
        }

        return 0;
    }

    private static bool TryScoreMountainCandidate(
        HexCoord anchor,
        HashSet<HexCoord> islandLand,
        IReadOnlyDictionary<HexCoord, Terrain> land,
        IReadOnlySet<HexCoord> riverTiles,
        int seed,
        out int mountainCount,
        out double tieBreak)
    {
        mountainCount = 0;
        tieBreak = 0;

        var footprint = Giant.Footprint(anchor);
        foreach (var hex in footprint)
        {
            if (!islandLand.Contains(hex) || riverTiles.Contains(hex))
            {
                return false;
            }

            var terrain = land[hex];
            if (terrain != Terrain.Grass && terrain != Terrain.Forest && terrain != Terrain.Mountain)
            {
                return false;
            }

            if (terrain == Terrain.Mountain)
            {
                mountainCount++;
            }
        }

        if (mountainCount < MinimumMountainHexes)
        {
            return false;
        }

        tieBreak = ValueNoise.Hash2(anchor.Q, anchor.R, seed + 97);
        return true;
    }

    /// <summary>
    /// Picks the single best shrine anchor: a footprint entirely on the
    /// island, Grass/Forest only (no Mountain), clear of any river, not
    /// coastal (every hex within 2 steps of the anchor is island land) and
    /// far enough from every chosen mountain anchor. The candidate with the
    /// highest seed-derived hash wins; ties broken by (Q, R) ascending so the
    /// pick is deterministic without depending on scan order.
    /// </summary>
    private static HexCoord? PickShrineAnchor(
        IReadOnlyList<HexCoord> islandTiles,
        HashSet<HexCoord> islandLand,
        IReadOnlyDictionary<HexCoord, Terrain> land,
        IReadOnlySet<HexCoord> riverTiles,
        IReadOnlyList<HexCoord> mountainAnchors,
        int seed)
    {
        HexCoord? best = null;
        var bestHash = -1.0;

        foreach (var anchor in islandTiles.OrderBy(c => c.Q).ThenBy(c => c.R))
        {
            if (!IsShrineCandidate(anchor, islandLand, land, riverTiles, mountainAnchors))
            {
                continue;
            }

            var hash = ValueNoise.Hash2(anchor.Q, anchor.R, seed + 101);
            if (best is null || hash > bestHash ||
                (hash == bestHash && (anchor.Q, anchor.R).CompareTo((best.Value.Q, best.Value.R)) < 0))
            {
                best = anchor;
                bestHash = hash;
            }
        }

        return best;
    }

    private static bool IsShrineCandidate(
        HexCoord anchor,
        HashSet<HexCoord> islandLand,
        IReadOnlyDictionary<HexCoord, Terrain> land,
        IReadOnlySet<HexCoord> riverTiles,
        IReadOnlyList<HexCoord> mountainAnchors)
    {
        var footprint = Giant.Footprint(anchor);
        foreach (var hex in footprint)
        {
            if (!islandLand.Contains(hex) || riverTiles.Contains(hex))
            {
                return false;
            }

            var terrain = land[hex];
            if (terrain != Terrain.Grass && terrain != Terrain.Forest)
            {
                return false;
            }
        }

        foreach (var nearby in anchor.WithinRadius(2))
        {
            if (!islandLand.Contains(nearby))
            {
                return false;
            }
        }

        foreach (var mountain in mountainAnchors)
        {
            if (anchor.DistanceTo(mountain) < MinimumGiantSpacing)
            {
                return false;
            }
        }

        return true;
    }
}
