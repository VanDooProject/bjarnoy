namespace Bjarnoy.Domain.World;

/// <summary>
/// One player/guild's vision source, per <c>docs/design/map-fog-v2.md</c>
/// §1a/§2.3 — a settlement's (or, once §1c ships, an army's) explored/visible
/// rings. <see cref="ExploredRadius"/> is always &gt;= <see cref="VisibleRadius"/>:
/// the black "scouted but out of sight" ring extends further than the fully
/// visible one.
/// </summary>
public readonly record struct FogVisionSource(HexCoord Coord, int ExploredRadius, int VisibleRadius);

/// <summary>
/// Tunables mirroring the frontend's <c>FOG_MARGIN_HEXES</c> /
/// <c>FOG_VISIBLE_MARGIN_HEXES</c> constants (<c>HexMapRenderer.ts</c>) — how
/// many hexes each ramp takes to go from fully revealed to fully fogged.
/// Kept as generator inputs, not hardcoded, so client and server can be
/// tuned from the same values without redeploying both (see
/// <c>map-fog-rendering.md</c>).
/// </summary>
public sealed record FogMaskOptions
{
    /// <summary>
    /// Ramp width, in hexes, of the R (unknown) channel — and therefore the
    /// whole budget the client's edge shading has to work with, since past
    /// it the channel is saturated and nothing downstream can tell one
    /// distance from another. Must stay equal to the frontend's
    /// <c>FOG_RAMP_MARGIN_HEXES</c> (<c>HexMapRenderer.ts</c>) and
    /// <c>UNKNOWN_MARGIN_HEXES</c> (<c>demoFogMask.ts</c>): the mask PNG
    /// carries no metadata beyond its pixel dimensions, so a mismatch does
    /// not fail anywhere, it just quietly puts the live and demo fog edges
    /// at different distances from the realm.
    /// </summary>
    public int UnknownMarginHexes { get; init; } = 14;

    /// <summary>Ramp width, in hexes, of the G (out-of-sight) channel.</summary>
    public int OutOfSightMarginHexes { get; init; } = 2;
}

/// <summary>One doubled-row texel's baked channel values, per §2.2's RGBA8 layout.</summary>
public readonly record struct FogMaskCell(byte Unknown, byte OutOfSight, byte NoiseSeed)
{
    public static readonly FogMaskCell FullyUnknown = new(255, 0, 0);
}

/// <summary>
/// A generated mask over a <see cref="MaskBounds"/> region, row-major over
/// <c>[MinV, MaxV) x [MinU, MaxU)</c> — i.e. <c>Cells[(v - MinV) * Width + (u - MinU)]</c>.
/// </summary>
public sealed class FogMaskBuffer
{
    public required MaskBounds Bounds { get; init; }

    public required FogMaskCell[] Cells { get; init; }

    public FogMaskCell this[MaskTexel texel]
    {
        get
        {
            if (!Bounds.Contains(texel))
            {
                throw new ArgumentOutOfRangeException(nameof(texel), texel, "Texel outside mask bounds.");
            }

            return Cells[((texel.V - Bounds.MinV) * Bounds.Width) + (texel.U - Bounds.MinU)];
        }
    }
}

/// <summary>
/// Pure, deterministic fog mask generator: sources + persisted explored
/// history in, a doubled-row RGBA mask out. No I/O, no caching — those are
/// <c>FogMaskService</c>/<c>FogChunkService</c> concerns (see
/// <c>docs/design/map-fog-v2.md</c> §2.3, §3). Kept pure and hex-only (no
/// texel-space knowledge beyond writing into it) so the same logic can be
/// golden-fixture-tested against a TS port for demo mode, per §1a's
/// duplication concern.
/// </summary>
public static class FogMaskGenerator
{
    /// <summary>
    /// Generates the mask for <paramref name="bounds"/>. <paramref name="sources"/>
    /// should already include a source halo (§3's "Mechanics": every source
    /// within <c>max(ExploredRadius)</c> of the bounds, not just those whose
    /// own hex falls inside it) — this method does not expand the query
    /// itself, it only bakes whatever sources it's given.
    /// </summary>
    /// <summary>
    /// Upper bound on step count per unit of euclidean hex distance (2/√3) —
    /// see <see cref="MultiSourceDistance"/>'s remarks on why the enumeration
    /// ring is widened by it.
    /// </summary>
    private const double StepsPerEuclideanUnit = 1.1547005383792517;

    public static FogMaskBuffer Generate(
        MaskBounds bounds,
        IReadOnlyList<FogVisionSource> sources,
        IReadOnlySet<HexCoord> persistedExplored,
        FogMaskOptions? options = null)
    {
        options ??= new FogMaskOptions();

        var hexTexels = new List<MaskTexel>();
        for (var v = bounds.MinV; v < bounds.MaxV; v++)
        {
            for (var u = bounds.MinU; u < bounds.MaxU; u++)
            {
                var texel = new MaskTexel(u, v);
                if (FogMaskLayout.IsHexTexel(texel))
                {
                    hexTexels.Add(texel);
                }
            }
        }

        var hexTexelSet = hexTexels.ToHashSet();
        var unknownDistance = MultiSourceDistance(
            hexTexelSet, sources, s => s.ExploredRadius, options.UnknownMarginHexes);
        var outOfSightDistance = MultiSourceDistance(
            hexTexelSet, sources, s => s.VisibleRadius, options.OutOfSightMarginHexes);

        var cells = new FogMaskCell[bounds.Width * bounds.Height];

        // Pass 1: real hexes, from the distance transforms + persisted history.
        foreach (var texel in hexTexels)
        {
            var hex = FogMaskLayout.ToHex(texel);
            var explored = persistedExplored.Contains(hex);

            var unknown = explored
                ? (byte)0
                : Ramp(GetOrMax(unknownDistance, texel), options.UnknownMarginHexes);
            var outOfSight = Ramp(GetOrMax(outOfSightDistance, texel), options.OutOfSightMarginHexes);
            var noise = NoiseSeed(hex);

            SetCell(cells, bounds, texel, new FogMaskCell(unknown, outOfSight, noise));
        }

        // Pass 2: interpolation-only texels, averaged from their four
        // diagonal hex neighbours now that every hex texel is filled. A
        // neighbour outside the generated bounds (edge of the world/chunk)
        // is treated as fully unknown/out-of-sight rather than skipped, so
        // an edge texel doesn't read as more-explored than its neighbours
        // actually justify.
        for (var v = bounds.MinV; v < bounds.MaxV; v++)
        {
            for (var u = bounds.MinU; u < bounds.MaxU; u++)
            {
                var texel = new MaskTexel(u, v);
                if (FogMaskLayout.IsHexTexel(texel))
                {
                    continue;
                }

                int unknownSum = 0, outOfSightSum = 0, noiseSum = 0, count = 0;
                foreach (var neighbour in FogMaskLayout.DiagonalNeighboursForInterpolation(texel))
                {
                    var cell = bounds.Contains(neighbour)
                        ? GetCell(cells, bounds, neighbour)
                        : FogMaskCell.FullyUnknown;
                    unknownSum += cell.Unknown;
                    outOfSightSum += cell.OutOfSight;
                    noiseSum += cell.NoiseSeed;
                    count++;
                }

                SetCell(
                    cells,
                    bounds,
                    texel,
                    new FogMaskCell(
                        (byte)(unknownSum / count),
                        (byte)(outOfSightSum / count),
                        (byte)(noiseSum / count)));
            }
        }

        return new FogMaskBuffer { Bounds = bounds, Cells = cells };
    }

    /// <summary>
    /// For every hex texel in <paramref name="hexTexels"/>, the minimum over
    /// all sources of <c>euclideanDistance(hex, source) - radius(source)</c> —
    /// i.e. distance measured from each source's own ring boundary (a negative
    /// value inside the ring), not from the source hex itself. A hex with no
    /// source within <paramref name="cap"/> of its ring boundary has no
    /// entry in the result, which <see cref="GetOrMax"/>/<see cref="Ramp"/>
    /// treat as fully-fogged — distance past <paramref name="cap"/> never
    /// changes the baked ramp value, so it isn't computed.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The measure is <see cref="HexCoord.EuclideanDistance"/>, not
    /// <see cref="HexCoord.Distance"/>: this ramp is rendered, not counted,
    /// and a step-count field's contours are hexagons — see that method's
    /// remarks. Radii stay whole hexes, which is not a unit mismatch: every
    /// hex within a ring of radius r sits at euclidean distance &lt;= r, so
    /// the 0 contour still encloses the whole ring and only the ramp beyond
    /// it becomes round.
    /// </para>
    /// <para>
    /// Walks a bounded ring around each source directly (<see
    /// cref="HexCoord.WithinRadius"/>) rather than a true multi-source
    /// flood-fill: on an obstacle-free hex grid the two give identical
    /// results, and this is simpler to keep correct. The walk is widened by
    /// 2/√3 because it enumerates by step count while the measure is
    /// euclidean, and a hex at euclidean distance d can be up to 2/√3·d
    /// steps away — without that, the far corners of the ramp would be
    /// silently clipped. Cost is <c>O(sources × (radius + cap)²)</c>, not
    /// <c>O(hexes)</c> — fine at today's settlement counts and radii; swap in
    /// a real flood-fill later if profiling ever shows this matters (the
    /// public API doesn't change).
    /// </para>
    /// </remarks>
    private static Dictionary<MaskTexel, double> MultiSourceDistance(
        HashSet<MaskTexel> hexTexels,
        IReadOnlyList<FogVisionSource> sources,
        Func<FogVisionSource, int> radiusOf,
        int cap)
    {
        var distance = new Dictionary<MaskTexel, double>();

        foreach (var source in sources)
        {
            var radius = radiusOf(source);
            var reach = Math.Max(0, radius) + Math.Max(0, cap);
            var explore = (int)Math.Ceiling(reach * StepsPerEuclideanUnit);

            foreach (var hex in source.Coord.WithinRadius(explore))
            {
                var texel = FogMaskLayout.ToTexel(hex);
                if (!hexTexels.Contains(texel))
                {
                    continue;
                }

                var dist = HexCoord.EuclideanDistance(hex, source.Coord) - radius;
                if (dist > cap)
                {
                    continue;
                }

                if (!distance.TryGetValue(texel, out var existing) || dist < existing)
                {
                    distance[texel] = dist;
                }
            }
        }

        return distance;
    }

    private static double GetOrMax(Dictionary<MaskTexel, double> distance, MaskTexel texel) =>
        distance.TryGetValue(texel, out var value) ? value : double.PositiveInfinity;

    /// <summary>
    /// Converts a signed ring distance into a <c>0..255</c> ramp value:
    /// <c>0</c> at or inside the ring boundary, <c>255</c> at
    /// <paramref name="marginHexes"/> beyond it, linear in between. This is
    /// what §2.4's shader samples directly with no further distance math.
    /// </summary>
    private static byte Ramp(double distance, int marginHexes)
    {
        if (double.IsPositiveInfinity(distance))
        {
            return 255;
        }

        if (distance <= 0)
        {
            return 0;
        }

        if (marginHexes <= 0 || distance >= marginHexes)
        {
            return 255;
        }

        return (byte)Math.Round(255.0 * distance / marginHexes);
    }

    /// <summary>
    /// Deterministic per-hex pseudo-random seed for the shader's UV warp
    /// (§2.4), so the same world always warps the same way.
    /// </summary>
    private static byte NoiseSeed(HexCoord hex)
    {
        var hash = HashCode.Combine(hex.Q, hex.R);
        return (byte)(hash & 0xFF);
    }

    private static void SetCell(FogMaskCell[] cells, MaskBounds bounds, MaskTexel texel, FogMaskCell cell) =>
        cells[((texel.V - bounds.MinV) * bounds.Width) + (texel.U - bounds.MinU)] = cell;

    private static FogMaskCell GetCell(FogMaskCell[] cells, MaskBounds bounds, MaskTexel texel) =>
        cells[((texel.V - bounds.MinV) * bounds.Width) + (texel.U - bounds.MinU)];
}
