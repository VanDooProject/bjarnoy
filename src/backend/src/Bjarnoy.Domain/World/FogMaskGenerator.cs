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
    public int UnknownMarginHexes { get; init; } = DefaultUnknownMarginHexes;

    /// <summary>
    /// The default <see cref="UnknownMarginHexes"/>, and the one number <see cref="FogVisionRadii.SourceMistOpaqueMargin"/> (how far
    /// past a source the fog is fully opaque, which decides what rival data a read delivers) derives from.
    /// </summary>
    public const int DefaultUnknownMarginHexes = 14;

    /// <summary>
    /// Ramp width, in hexes, of the G (out-of-sight) channel: the dark tier's own budget. Must stay equal to the frontend's
    /// <c>OUT_OF_SIGHT_RAMP_MARGIN_HEXES</c> (<c>fogRamp.ts</c>, which the demo mask and the troop's
    /// <c>ARMY_FOG_BLACK_MARGIN</c> use): the shader's dark edge window is in ramp units of this width.
    /// </summary>
    public int OutOfSightMarginHexes { get; init; } = DefaultOutOfSightMarginHexes;

    /// <summary>The default <see cref="OutOfSightMarginHexes"/>.</summary>
    public const int DefaultOutOfSightMarginHexes = 4;
}

/// <summary>
/// One doubled-row texel's baked channel values, per §2.2's RGBA8 layout. <paramref name="Lump"/> (B) is the smooth,
/// deterministic value-noise "lump" of the texel's own position (<see cref="FogMaskGenerator.TexelLump"/>): the shader
/// pushes the fog edge in or out by it, so the edge is irregular at the scale of a hex or two.
/// </summary>
public readonly record struct FogMaskCell(byte Unknown, byte OutOfSight, byte Lump)
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
    /// Version of the baked output. Bump it whenever the mask changes for the
    /// same inputs (a new ramp, fringe or noise rule): it is part of the chunk
    /// version the API serves as ETag, so browsers revalidating after a deploy
    /// do not get a 304 for pixels the old generator baked.
    /// </summary>
    public const int Version = 3;

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
    private const double StepsPerEuclideanUnit = HexOffsets.StepsPerEuclideanUnit;

    /// <summary>
    /// Start of the fringe ramp baked around explored ground, in hexes from
    /// the nearest explored hex: the troop's own live white ramp
    /// (<see cref="FogVisionRadii.ArmyFogWhiteOffsetHexes"/>), so a stored trail reads like the live clearing.
    /// </summary>
    public const double TrailFringeOffsetHexes = FogVisionRadii.ArmyFogWhiteOffsetHexes;

    /// <summary>
    /// Width of the fringe ramp, in hexes: the troop's
    /// <see cref="FogVisionRadii.ArmyFogWhiteMarginHexes"/>.
    /// </summary>
    public const double TrailFringeMarginHexes = FogVisionRadii.ArmyFogWhiteMarginHexes;

    /// <summary>
    /// Steps (<see cref="HexCoord.WithinRadius"/> radius) from an explored hex
    /// to the farthest hex its fringe can change. A hex at that step distance
    /// is at most this many texels away in u and twice as many in v, so with
    /// <see cref="FogChunkLayout.ChunkSize"/> = 64 the reach stays inside the
    /// one-chunk history ring <c>FogChunkService</c> loads.
    /// </summary>
    public static readonly int TrailFringeReachSteps =
        HexOffsets.ReachSteps(TrailFringeOffsetHexes + TrailFringeMarginHexes);

    public static FogMaskBuffer Generate(
        MaskBounds bounds,
        IReadOnlyList<FogVisionSource> sources,
        IReadOnlySet<HexCoord> persistedExplored,
        FogMaskOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(persistedExplored);
        return Generate(bounds, sources, persistedExplored.Contains, options);
    }

    /// <summary>
    /// The chunk-friendly form of <see cref="Generate(MaskBounds, IReadOnlyList{FogVisionSource}, IReadOnlySet{HexCoord}, FogMaskOptions?)"/>:
    /// explored history is a lookup, not a materialised set, so a caller
    /// with a chunked store never has to build a hash set of the world.
    /// </summary>
    public static FogMaskBuffer Generate(
        MaskBounds bounds,
        IReadOnlyList<FogVisionSource> sources,
        Func<HexCoord, bool> isExplored,
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

        var trail = TrailFringe.Compute(bounds, isExplored);

        var cells = new FogMaskCell[bounds.Width * bounds.Height];

        // Pass 1: real hexes, from the distance transforms + persisted history.
        foreach (var texel in hexTexels)
        {
            var explored = trail.IsExplored(texel);

            // Explored ground is 0. Beside it, the source ramp (255 far from any
            // settlement) is capped by the troop's own ramp around explored
            // ground, so a trail has a soft fringe instead of a 0 -> 255 step.
            var unknown = explored
                ? (byte)0
                : Math.Min(
                    Ramp(GetOrMax(unknownDistance, texel), options.UnknownMarginHexes),
                    TrailRamp(trail.DistanceAt(texel)));
            var outOfSight = Ramp(GetOrMax(outOfSightDistance, texel), options.OutOfSightMarginHexes);

            SetCell(cells, bounds, texel, new FogMaskCell(unknown, outOfSight, TexelLump(texel.U, texel.V)));
        }

        // Pass 2: interpolation-only texels, R/G averaged from their four
        // diagonal hex neighbours now that every hex texel is filled (B is the
        // texel's own lump, never averaged: it is smooth by construction). A
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

                int unknownSum = 0, outOfSightSum = 0, count = 0;
                foreach (var neighbour in FogMaskLayout.DiagonalNeighboursForInterpolation(texel))
                {
                    var cell = bounds.Contains(neighbour)
                        ? GetCell(cells, bounds, neighbour)
                        : FogMaskCell.FullyUnknown;
                    unknownSum += cell.Unknown;
                    outOfSightSum += cell.OutOfSight;
                    count++;
                }

                SetCell(
                    cells,
                    bounds,
                    texel,
                    new FogMaskCell(
                        (byte)(unknownSum / count),
                        (byte)(outOfSightSum / count),
                        TexelLump(u, v)));
            }
        }

        return new FogMaskBuffer { Bounds = bounds, Cells = cells };
    }

    /// <summary>
    /// Generates the mask for <paramref name="window"/> such that every texel
    /// equals what <see cref="Generate(MaskBounds, IReadOnlyList{FogVisionSource}, Func{HexCoord, bool}, FogMaskOptions?)"/>
    /// would put there over any larger region — i.e. a chunk edge has no
    /// seam. An odd-parity interpolation texel on the window's edge averages
    /// diagonal neighbours that live in the next window, so the bake runs
    /// over the window grown by one texel per side (where those neighbours
    /// are real hexes) and is cropped back. <paramref name="sources"/> must
    /// include the halo (see <see cref="SourcesAffecting"/>).
    /// </summary>
    public static FogMaskBuffer GenerateWindow(
        MaskBounds window,
        IReadOnlyList<FogVisionSource> sources,
        Func<HexCoord, bool> isExplored,
        FogMaskOptions? options = null)
    {
        var padded = new MaskBounds(window.MinU - 1, window.MinV - 1, window.MaxU + 1, window.MaxV + 1);
        var full = Generate(padded, sources, isExplored, options);

        var cells = new FogMaskCell[window.Width * window.Height];
        for (var v = window.MinV; v < window.MaxV; v++)
        {
            Array.Copy(
                full.Cells,
                ((v - padded.MinV) * padded.Width) + (window.MinU - padded.MinU),
                cells,
                (v - window.MinV) * window.Width,
                window.Width);
        }

        return new FogMaskBuffer { Bounds = window, Cells = cells };
    }

    /// <summary>
    /// The sources that can influence any texel of <paramref name="window"/>
    /// (§3's "source halo"): those within their own ring-plus-ramp reach of
    /// it, not only those whose own hex falls inside. Conservative — a source
    /// is dropped only when it provably cannot reach: a hex at step distance
    /// d is at most d texels away in u and 2d in v (<c>v = 2r + q</c>), and
    /// the euclidean reach is widened to steps by 2/√3 exactly like
    /// <see cref="MultiSourceDistance"/> does. The window itself is grown by
    /// the one-texel border <see cref="GenerateWindow"/> bakes.
    /// </summary>
    public static List<FogVisionSource> SourcesAffecting(
        MaskBounds window, IEnumerable<FogVisionSource> sources, FogMaskOptions? options = null)
    {
        options ??= new FogMaskOptions();
        var result = new List<FogVisionSource>();
        foreach (var source in sources)
        {
            var steps = ReachSteps(source, options);
            var texel = FogMaskLayout.ToTexel(source.Coord);
            if (texel.U >= window.MinU - 1 - steps && texel.U < window.MaxU + 1 + steps
                && texel.V >= window.MinV - 1 - (2 * steps) && texel.V < window.MaxV + 1 + (2 * steps))
            {
                result.Add(source);
            }
        }

        return result;
    }

    /// <summary>
    /// The farthest step count from <paramref name="source"/> at which it can
    /// still change a baked value (either ramp).
    /// </summary>
    public static int ReachSteps(FogVisionSource source, FogMaskOptions? options = null)
    {
        options ??= new FogMaskOptions();
        var reach = Math.Max(
            Math.Max(0, source.ExploredRadius) + Math.Max(0, options.UnknownMarginHexes),
            Math.Max(0, source.VisibleRadius) + Math.Max(0, options.OutOfSightMarginHexes));
        return (int)Math.Ceiling(reach * StepsPerEuclideanUnit);
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

    private static byte TrailRamp(double distance)
    {
        if (double.IsPositiveInfinity(distance))
        {
            return 255;
        }

        var t = Math.Clamp((distance - TrailFringeOffsetHexes) / TrailFringeMarginHexes, 0, 1);
        return (byte)Math.Round(255.0 * t);
    }

    /// <summary>
    /// Hex offsets with their euclidean length d &lt;= the fringe reach
    /// (<see cref="TrailFringeOffsetHexes"/> + <see cref="TrailFringeMarginHexes"/>),
    /// computed once and kept as texel deltas: <see cref="FogMaskLayout.ToTexel"/>
    /// is the exact affine map <c>u = q</c>, <c>v = 2r + q</c> for every hex
    /// (see <see cref="FogMaskLayout.WorldBounds"/>), so an axial offset
    /// (dq, dr) is the constant texel delta (dq, 2dr + dq) whatever the
    /// parity. A boundary hex stamps exactly these around itself: no radius
    /// walk, no hex conversion and no square root per target.
    /// </summary>
    private static readonly (int Du, int Dv, double D)[] TrailFringeOffsets = BuildTrailFringeOffsets();

    /// <summary>The six hex neighbours as texel deltas (same map as <see cref="TrailFringeOffsets"/>).</summary>
    private static readonly (int Du, int Dv)[] NeighbourTexelDeltas = [(1, 1), (1, -1), (0, -2), (-1, -1), (-1, 1), (0, 2)];

    private static (int Du, int Dv, double D)[] BuildTrailFringeOffsets()
    {
        return [.. HexOffsets.Within(TrailFringeOffsetHexes + TrailFringeMarginHexes)
            .Select(o => (o.Offset.Q, (2 * o.Offset.R) + o.Offset.Q, o.Distance))];
    }

    /// <summary>
    /// Explored-ground lookup and fringe distances over flat arrays. Explored
    /// hexes with an unexplored neighbour are the only ones that can be the
    /// nearest explored hex of an unexplored one, so only those are stamped.
    /// They may lie outside the bounds (up to the fringe reach), so the
    /// explored lookup covers the bounds grown by the reach, plus the border
    /// the neighbour check reads (a hex neighbour is at most 1 texel away in
    /// u and 2 in v).
    /// </summary>
    private sealed class TrailFringe
    {
        private readonly MaskBounds _bounds;
        private readonly MaskBounds _lookup;
        private readonly bool[] _explored;
        private readonly double[] _distance;

        private TrailFringe(MaskBounds bounds, MaskBounds lookup, bool[] explored, double[] distance)
        {
            _bounds = bounds;
            _lookup = lookup;
            _explored = explored;
            _distance = distance;
        }

        /// <summary>Whether the hex at <paramref name="texel"/> (inside the bounds) is explored.</summary>
        public bool IsExplored(MaskTexel texel) =>
            _explored[((texel.V - _lookup.MinV) * _lookup.Width) + (texel.U - _lookup.MinU)];

        /// <summary>Euclidean distance to the nearest stamped explored hex, or +infinity beyond the reach.</summary>
        public double DistanceAt(MaskTexel texel) =>
            _distance[((texel.V - _bounds.MinV) * _bounds.Width) + (texel.U - _bounds.MinU)];

        public static TrailFringe Compute(MaskBounds bounds, Func<HexCoord, bool> isExplored)
        {
            var steps = TrailFringeReachSteps;
            var lookup = new MaskBounds(
                bounds.MinU - steps - 1,
                bounds.MinV - (2 * steps) - 2,
                bounds.MaxU + steps + 1,
                bounds.MaxV + (2 * steps) + 2);

            var explored = new bool[lookup.Width * lookup.Height];
            for (var v = lookup.MinV; v < lookup.MaxV; v++)
            {
                var row = (v - lookup.MinV) * lookup.Width;
                for (var u = lookup.MinU; u < lookup.MaxU; u++)
                {
                    var texel = new MaskTexel(u, v);
                    if (FogMaskLayout.IsHexTexel(texel))
                    {
                        explored[row + (u - lookup.MinU)] = isExplored(FogMaskLayout.ToHex(texel));
                    }
                }
            }

            var distance = new double[bounds.Width * bounds.Height];
            Array.Fill(distance, double.PositiveInfinity);

            var offsets = TrailFringeOffsets;
            var neighbours = NeighbourTexelDeltas;
            for (var v = bounds.MinV - (2 * steps); v < bounds.MaxV + (2 * steps); v++)
            {
                for (var u = bounds.MinU - steps; u < bounds.MaxU + steps; u++)
                {
                    if (!FogMaskLayout.IsHexTexel(new MaskTexel(u, v)) || !explored[((v - lookup.MinV) * lookup.Width) + (u - lookup.MinU)])
                    {
                        continue;
                    }

                    var boundary = false;
                    foreach (var (nu, nv) in neighbours)
                    {
                        if (!explored[((v + nv - lookup.MinV) * lookup.Width) + (u + nu - lookup.MinU)])
                        {
                            boundary = true;
                            break;
                        }
                    }

                    if (!boundary)
                    {
                        continue;
                    }

                    foreach (var (du, dv, d) in offsets)
                    {
                        var tu = u + du;
                        var tv = v + dv;
                        if (tu < bounds.MinU || tu >= bounds.MaxU || tv < bounds.MinV || tv >= bounds.MaxV)
                        {
                            continue;
                        }

                        var index = ((tv - bounds.MinV) * bounds.Width) + (tu - bounds.MinU);
                        if (d < distance[index] && !explored[((tv - lookup.MinV) * lookup.Width) + (tu - lookup.MinU)])
                        {
                            distance[index] = d;
                        }
                    }
                }
            }

            return new TrailFringe(bounds, lookup, explored, distance);
        }
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
    /// The B channel: a smooth, deterministic pseudo-random "lump" value (0..255) of a texel's own position — value noise at
    /// about two hexes (60%) plus about one hex (40%). Computed for every texel, hex or interpolation, straight from (u, v),
    /// never averaged. The frontend's <c>fogLump.ts</c> is the same maths; both are pinned by a golden table of texels so the
    /// two ports cannot drift. All integer maths is 32-bit wrapping (JS <c>Math.imul</c> / <c>&gt;&gt;&gt;</c> semantics).
    /// </summary>
    public static byte TexelLump(int u, int v)
    {
        double q = u;
        var r = (v - u) / 2.0;
        var x = q + (r / 2);
        var y = r * Math.Sqrt(3) / 2;
        var coarse = ValueNoise(x / 2, y / 2, 11);
        var fine = ValueNoise(x + 31.7, y + 5.3, 7);
        return (byte)Math.Floor((255 * ((0.6 * coarse) + (0.4 * fine))) + 0.5);
    }

    private static double Hash01(int x, int y, int salt)
    {
        unchecked
        {
            var h = ((uint)x * 0x27d4eb2du) ^ ((uint)y * 0x165667b1u) ^ ((uint)salt * 0x9e3779b1u);
            h = (h ^ (h >> 15)) * 0x85ebca6bu;
            h ^= h >> 13;
            h *= 0xc2b2ae35u;
            h ^= h >> 16;
            return h / 4294967296.0;
        }
    }

    private static double ValueNoise(double x, double y, int salt)
    {
        var fx0 = Math.Floor(x);
        var fy0 = Math.Floor(y);
        var ix = (int)fx0;
        var iy = (int)fy0;
        var fx = x - fx0;
        var fy = y - fy0;
        var sx = fx * fx * (3 - (2 * fx));
        var sy = fy * fy * (3 - (2 * fy));
        var a = Hash01(ix, iy, salt);
        var b = Hash01(ix + 1, iy, salt);
        var c = Hash01(ix, iy + 1, salt);
        var d = Hash01(ix + 1, iy + 1, salt);
        return a + ((b - a) * sx) + ((c - a) * sy) + ((a - b - c + d) * sx * sy);
    }

    private static void SetCell(FogMaskCell[] cells, MaskBounds bounds, MaskTexel texel, FogMaskCell cell) =>
        cells[((texel.V - bounds.MinV) * bounds.Width) + (texel.U - bounds.MinU)] = cell;

    private static FogMaskCell GetCell(FogMaskCell[] cells, MaskBounds bounds, MaskTexel texel) =>
        cells[((texel.V - bounds.MinV) * bounds.Width) + (texel.U - bounds.MinU)];
}
