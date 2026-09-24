namespace Bjarnoy.Domain.World;

/// <summary>
/// Places 7-hex giant features on an island: scans every land hex as a
/// candidate anchor, filters to the ones whose whole footprint qualifies,
/// scores the survivors and keeps the best non-overlapping handful. Follows
/// <see cref="RiverGenerator"/>'s pattern end to end — pure, seed-derived,
/// called once per island from <see cref="WorldGenerator.Generate"/>.
/// </summary>
internal static class GiantGenerator
{
    /// <summary>A candidate anchor's footprint must contain at least this many Mountain hexes.</summary>
    public const int MinimumMountainHexes = 3;

    /// <summary>
    /// No footprint hex may fall within this many hex-distance steps of any
    /// of the island's <see cref="GeneratedIsland.StartPositions"/>, so a
    /// giant never crowds out a founding spot.
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

    /// <summary>The tile-art family every generated giant uses today — matches the frontend's demo-mode giant mountain.</summary>
    public const string MountainFamily = "giantmountain";

    public static IReadOnlyList<Giant> Generate(
        IReadOnlyList<HexCoord> islandTiles,
        Dictionary<HexCoord, Terrain> land,
        TerrainSampler sampler,
        WorldGenerationOptions options,
        int islandIndex,
        IReadOnlySet<HexCoord> riverTiles,
        IReadOnlyList<HexCoord> startPositions)
    {
        var maxGiants = MaxGiantsFor(islandTiles.Count);
        if (maxGiants == 0)
        {
            return [];
        }

        // Large prime spacing so this draws from a noise field independent
        // of the island's rivers/names — the same trick RiverGenerator and
        // IslandNames use for their own per-index offsets.
        var seed = options.Seed + (islandIndex * 200_003);

        var islandLand = new HashSet<HexCoord>(islandTiles);

        var candidates = new List<(HexCoord Anchor, int MountainCount, double TieBreak)>();
        foreach (var anchor in islandTiles.OrderBy(c => c.Q).ThenBy(c => c.R))
        {
            if (!TryScoreCandidate(anchor, islandLand, land, riverTiles, startPositions, seed, out var mountainCount, out var tieBreak))
            {
                continue;
            }

            candidates.Add((anchor, mountainCount, tieBreak));
        }

        // Best first: more Mountain hexes in the footprint wins; ties broken
        // by the seed-derived hash of the anchor, so placement is
        // deterministic for a given seed without depending on scan order.
        candidates.Sort((a, b) =>
        {
            var byMountain = b.MountainCount.CompareTo(a.MountainCount);
            return byMountain != 0 ? byMountain : b.TieBreak.CompareTo(a.TieBreak);
        });

        var chosen = new List<Giant>();
        foreach (var candidate in candidates)
        {
            if (chosen.Count >= maxGiants)
            {
                break;
            }

            if (chosen.Any(g => g.Anchor.DistanceTo(candidate.Anchor) < MinimumGiantSpacing))
            {
                continue;
            }

            var orientation = sampler.OrientationAt(candidate.Anchor);
            chosen.Add(new Giant(candidate.Anchor, MountainFamily, orientation));
        }

        return chosen;
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

    private static bool TryScoreCandidate(
        HexCoord anchor,
        HashSet<HexCoord> islandLand,
        Dictionary<HexCoord, Terrain> land,
        IReadOnlySet<HexCoord> riverTiles,
        IReadOnlyList<HexCoord> startPositions,
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

            foreach (var start in startPositions)
            {
                if (hex.DistanceTo(start) < StartPositionExclusionRadius)
                {
                    return false;
                }
            }
        }

        if (mountainCount < MinimumMountainHexes)
        {
            return false;
        }

        tieBreak = ValueNoise.Hash2(anchor.Q, anchor.R, seed + 97);
        return true;
    }
}
