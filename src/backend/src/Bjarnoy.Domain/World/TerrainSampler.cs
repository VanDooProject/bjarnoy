using System.Collections.Concurrent;

namespace Bjarnoy.Domain.World;

/// <summary>
/// Classifies a single hex from nothing but its coordinate and the world's
/// generation options — no neighbours, no map, no state.
/// </summary>
/// <remarks>
/// <para>
/// Islands are seeded on a coarse grid of cells in odd-q offset space (roughly
/// square, so islands read as evenly rather than axially spread). Each cell
/// independently hashes whether it holds an island, its size class (small A,
/// medium B, large C), its jittered centre and its shape: a bent spine of
/// vertices with a width each plus a few satellite islets (see
/// <see cref="IslandShape"/>). A hex only has to look at its own cell and the
/// eight around it, which is why classification is O(1) and needs no
/// precomputed map. An island that could cross the world radius is never
/// generated, so the world edge does not clip islands either.
/// </para>
/// <para>
/// Every number is computed with + - * / and <see cref="Math.Sqrt(double)"/>
/// only — no trigonometry, no pow — in a fixed evaluation order, so the
/// frontend mirror agrees to the last bit.
/// </para>
/// <para>
/// The legacy <c>IslandFactoryOrganic</c> instead filled a square grid with
/// noise, pushed the edges down with a falloff, flood-filled, and kept the
/// largest blob — producing exactly one island per world, which
/// <c>MapCreatorHelper</c> then had to shuffle around to stop islands
/// overlapping. Seeding per cell removes the collision loop entirely.
/// </para>
/// <para>
/// This mirrors <c>terrainAt</c> in
/// <c>src/frontend/src/lib/map/worldGenerator.ts</c> exactly, so the client can
/// render terrain it has not been sent. The server remains authoritative: it
/// owns islands, their names and start positions (see <see cref="WorldGenerator"/>),
/// none of which the client can derive.
/// </para>
/// </remarks>
public sealed class TerrainSampler
{
    private readonly WorldGenerationOptions _options;

    public TerrainSampler(WorldGenerationOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        options.Validate();
        _options = options;
    }

    public WorldGenerationOptions Options => _options;

    /// <summary>
    /// How far into the nearest island a hex sits, in units of that island's local
    /// half-width plus shoreline noise: 0 on the spine, about 1 at the shoreline,
    /// <see langword="null"/> at sea.
    /// </summary>
    public double? IslandDepthAt(HexCoord coord) => DepthAt(coord, wasted: false);

    /// <summary>
    /// Extra seed offset added on top of the world seed for every wasted-island
    /// hash, so wasted islands are seeded from a noise field entirely
    /// independent of the green islands drawn from the same world seed.
    /// </summary>
    public const int WastedSeedOffset = 1_000_003;

    /// <summary>
    /// Fraction of <see cref="WorldGenerationOptions.IslandChance"/> a wasted
    /// island cell rolls against — wasted islands are rarer than green ones.
    /// </summary>
    public const double WastedIslandChanceFactor = 0.1;

    /// <summary>
    /// Same shape as <see cref="IslandDepthAt(HexCoord)"/> but seeded with
    /// <see cref="WastedSeedOffset"/> and gated by <see cref="WastedIslandChanceFactor"/>
    /// — the wasted-island equivalent of the green island grid. Returns the
    /// depth into the nearest *wasted* island cell, independent of whether the
    /// hex also happens to sit in a green island (that exclusion is applied by
    /// <see cref="WastedTerrainAt"/>, not here).
    /// </summary>
    public double? WastedDepthAt(HexCoord coord) => DepthAt(coord, wasted: true);

    private readonly record struct CellKey(int Col, int Row, bool Wasted);

    // Per-cell shapes are pure functions of (cell, seed kind, options), so caching
    // them changes no result. A null value is a cell without an island.
    private readonly ConcurrentDictionary<CellKey, IslandShape?> _shapes = new();

    /// <summary>
    /// The island (if any) seeded in grid cell <paramref name="cellCol"/>/<paramref name="cellRow"/>:
    /// <see langword="null"/> when the cell rolls no island, when a large neighbour
    /// suppresses it, or when the island could cross the world radius (an island
    /// is never clipped by the world edge — it is not generated at all).
    /// </summary>
    /// <param name="wasted">The wasted-island grid instead of the green one.</param>
    public IslandShape? IslandShapeAt(int cellCol, int cellRow, bool wasted = false)
    {
        var key = new CellKey(cellCol, cellRow, wasted);
        if (_shapes.TryGetValue(key, out var cached))
        {
            return cached;
        }

        // Two threads racing here both compute the same value; either may win.
        var shape = BuildCell(cellCol, cellRow, wasted);
        _shapes.TryAdd(key, shape);
        return shape;
    }

    /// <summary>
    /// Every island of the world, in cell order (column, then row): the cells that
    /// hold an island whose whole footprint is inside the world radius.
    /// </summary>
    public IEnumerable<IslandShape> EnumerateIslandShapes(bool wasted = false)
    {
        var cellSize = _options.IslandCellSize;
        var span = (_options.Radius / cellSize) + 2;
        for (var cellCol = -span; cellCol <= span; cellCol++)
        {
            for (var cellRow = -span; cellRow <= span; cellRow++)
            {
                var shape = IslandShapeAt(cellCol, cellRow, wasted);
                if (shape is not null)
                {
                    yield return shape;
                }
            }
        }
    }

    private int SeedFor(bool wasted) => wasted ? _options.Seed + WastedSeedOffset : _options.Seed;

    private double ChanceFor(bool wasted) =>
        wasted ? _options.IslandChance * WastedIslandChanceFactor : _options.IslandChance;

    // Whether the cell rolls an island at all. The wasted grid additionally skips every
    // cell that is a green island cell (world seed, full chance), so a wasted island's
    // own cell grid never overlaps a green island's.
    private bool CellPresent(int cellCol, int cellRow, bool wasted)
    {
        if (ValueNoise.Hash2(cellCol, cellRow, SeedFor(wasted)) > ChanceFor(wasted))
        {
            return false;
        }

        return !wasted || ValueNoise.Hash2(cellCol, cellRow, _options.Seed) > _options.IslandChance;
    }

    private IslandSizeClass ClassOf(int cellCol, int cellRow, bool wasted)
    {
        var h = ValueNoise.Hash2(cellCol, cellRow, SeedFor(wasted) + 301);
        return h < _options.IslandSmallShare
            ? IslandSizeClass.Small
            : h > 1.0 - _options.IslandLargeShare ? IslandSizeClass.Large : IslandSizeClass.Medium;
    }

    private IslandShape? BuildCell(int cellCol, int cellRow, bool wasted)
    {
        if (!CellPresent(cellCol, cellRow, wasted))
        {
            return null;
        }

        var seed = SeedFor(wasted);
        var cls = ClassOf(cellCol, cellRow, wasted);

        // A large island clears its neighbours; of two neighbouring large ones the
        // higher roll wins. (Evaluated exactly like the frontend: `cls` is read as it
        // stands after earlier neighbours may already have demoted it.)
        var suppressed = false;
        for (var dc = -1; dc <= 1; dc++)
        {
            for (var dr = -1; dr <= 1; dr++)
            {
                if (dc == 0 && dr == 0)
                {
                    continue;
                }

                var nc = cellCol + dc;
                var nr = cellRow + dr;
                if (!CellPresent(nc, nr, wasted) || ClassOf(nc, nr, wasted) != IslandSizeClass.Large)
                {
                    continue;
                }

                if (cls != IslandSizeClass.Large)
                {
                    suppressed = true;
                }
                else if (ValueNoise.Hash2(nc, nr, seed + 307) > ValueNoise.Hash2(cellCol, cellRow, seed + 307))
                {
                    cls = IslandSizeClass.Medium;
                }
            }
        }

        return suppressed ? null : BuildShape(cellCol, cellRow, seed, cls);
    }

    private IslandShape? BuildShape(int cc, int cr, int seed, IslandSizeClass cls)
    {
        var o = _options;
        double cs = o.IslandCellSize;
        var jit = cs * IslandShapeConstants.Jitter;
        var cx = (cc * cs) + (cs / 2) + ((ValueNoise.Hash2(cc, cr, seed + 11) - 0.5) * jit);
        var cy = (cr * cs) + (cs / 2) + ((ValueNoise.Hash2(cc, cr, seed + 13) - 0.5) * jit);
        var scale = cls == IslandSizeClass.Small
            ? IslandShapeConstants.SmallScale
            : cls == IslandSizeClass.Large ? IslandShapeConstants.LargeScale : 1.0;
        var radius = scale * (o.IslandMinWidth + (ValueNoise.Hash2(cc, cr, seed + 17) * (o.IslandMaxWidth - o.IslandMinWidth)));
        var n = o.IslandMinSegments
            + (int)Math.Floor(ValueNoise.Hash2(cc, cr, seed + 19) * ((o.IslandMaxSegments - o.IslandMinSegments) + 1));

        var ax = ValueNoise.Hash2(cc, cr, seed + 23) - 0.5;
        var ay = ValueNoise.Hash2(cc, cr, seed + 47) - 0.5;
        var len = Math.Sqrt((ax * ax) + (ay * ay));
        var ux = len < 1e-9 ? 1.0 : ax / len;
        var uy = len < 1e-9 ? 0.0 : ay / len;
        var hb = ValueNoise.Hash2(cc, cr, seed + 59);
        var t0 = (hb < 0.5 ? -1.0 : 1.0)
            * (o.IslandMinBend + ((o.IslandMaxBend - o.IslandMinBend) * ((hb < 0.5 ? hb : hb - 0.5) * 2)));
        var elong = o.IslandMinElongation + ((o.IslandMaxElongation - o.IslandMinElongation) * ValueNoise.Hash2(cc, cr, seed + 61));
        var step = radius * elong / Math.Max(1, n - 1);

        var px = new double[n];
        var py = new double[n];
        double lx = 0;
        double ly = 0;
        for (var k = 1; k < n; k++)
        {
            var t = t0 * (0.5 + ValueNoise.Hash2(cc, cr, seed + 400 + k));
            var c = (1 - (t * t)) / (1 + (t * t));
            var s = (2 * t) / (1 + (t * t));
            var nx = (ux * c) - (uy * s);
            var ny = (uy * c) + (ux * s);
            ux = nx;
            uy = ny;
            lx += ux * step;
            ly += uy * step;
            px[k] = lx;
            py[k] = ly;
        }

        double mx = 0;
        double my = 0;
        for (var k = 0; k < n; k++)
        {
            mx += px[k];
            my += py[k];
        }

        mx /= n;
        my /= n;
        for (var k = 0; k < n; k++)
        {
            px[k] -= mx;
            py[k] -= my;
        }

        var w = new double[n];
        for (var k = 0; k < n; k++)
        {
            var f = n == 1 ? 0.0 : Math.Abs(((2.0 * k) / (n - 1)) - 1);
            w[k] = radius * (1 - (IslandShapeConstants.Taper * f * f))
                * (IslandShapeConstants.WidthMinScale
                    + (ValueNoise.Hash2(cc, cr, seed + 200 + k)
                        * (IslandShapeConstants.WidthMaxScale - IslandShapeConstants.WidthMinScale)));
        }

        var ni = (int)Math.Floor(ValueNoise.Hash2(cc, cr, seed + 300) * (IslandShapeConstants.IsletMax + 1));
        var ix = new double[ni];
        var iy = new double[ni];
        var ir = new double[ni];
        for (var i = 0; i < ni; i++)
        {
            var k = (int)Math.Floor(ValueNoise.Hash2(cc, cr, seed + 310 + i) * n);
            var ox = ValueNoise.Hash2(cc, cr, seed + 320 + i) - 0.5;
            var oy = ValueNoise.Hash2(cc, cr, seed + 330 + i) - 0.5;
            var ol = Math.Sqrt((ox * ox) + (oy * oy));
            if (ol == 0.0 || double.IsNaN(ol))
            {
                ol = 1.0;
            }

            ox /= ol;
            oy /= ol;
            var dist = w[k] * (IslandShapeConstants.IsletDistanceMin
                + ((IslandShapeConstants.IsletDistanceMax - IslandShapeConstants.IsletDistanceMin)
                    * ValueNoise.Hash2(cc, cr, seed + 340 + i)));
            ix[i] = px[k] + (ox * dist);
            iy[i] = py[k] + (oy * dist);
            ir[i] = w[k] * (IslandShapeConstants.IsletRadiusMin
                + ((IslandShapeConstants.IsletRadiusMax - IslandShapeConstants.IsletRadiusMin)
                    * ValueNoise.Hash2(cc, cr, seed + 350 + i)));
        }

        // Reach clamp: the farthest land can get from the centre must fit the 3x3 cell scan.
        var nm = IslandShapeConstants.NoiseReachFactor(o.IslandCoastNoise);
        double reach = 0;
        for (var k = 0; k < n; k++)
        {
            reach = Math.Max(reach, Math.Sqrt((px[k] * px[k]) + (py[k] * py[k])) + (w[k] * nm));
        }

        for (var i = 0; i < ni; i++)
        {
            reach = Math.Max(reach, Math.Sqrt((ix[i] * ix[i]) + (iy[i] * iy[i])) + (ir[i] * nm));
        }

        var budget = IslandShapeConstants.ReachBudget(cs, o.IslandCoastWarp);
        var factor = 1.0;
        if (reach > budget)
        {
            factor = budget / reach;
            for (var k = 0; k < n; k++)
            {
                px[k] *= factor;
                py[k] *= factor;
                w[k] *= factor;
            }

            for (var i = 0; i < ni; i++)
            {
                ix[i] *= factor;
                iy[i] *= factor;
                ir[i] *= factor;
            }

            reach = budget;
        }

        // World edge: drop the island if any of it could cross the world radius.
        var warpSum = o.IslandCoastWarp + IslandShapeConstants.Warp2;
        var col = (int)Math.Floor(cx + 0.5);
        var row = (int)Math.Floor(cy + 0.5);
        var q = col;
        var r = row - ((col - (col & 1)) / 2);
        var d = (Math.Abs(q) + Math.Abs(r) + Math.Abs(-q - r)) / 2;
        if (d + (1.42 * (reach + warpSum)) > o.Radius)
        {
            return null;
        }

        return new IslandShape(
            cc, cr, cx, cy, px, py, w, ix, iy, ir, reach + warpSum, cls, factor, nm, warpSum);
    }

    /// <summary>
    /// Depth of an offset-space hex into the nearest island of the green (or
    /// wasted) grid, or <see langword="null"/> at sea. Distance to each island in
    /// reach is the minimum over its spine segments of distance / interpolated
    /// half-width (islets: distance / radius), plus three octaves of shoreline noise.
    /// </summary>
    // Two-octave domain warp, applied once per hex before any distance is measured, so
    // coastlines wobble (fjords, bays) instead of tracing arcs.
    private (double X, double Y) Warp(int col, int row, int seed)
    {
        var o = _options;
        double px = col;
        double py = row;
        px += ((ValueNoise.Sample(col, row, seed + 53, o.IslandCoastWarpScale) - 0.5) * 2 * o.IslandCoastWarp)
            + ((ValueNoise.Sample(col, row, seed + 83, IslandShapeConstants.WarpScale2) - 0.5) * 2 * IslandShapeConstants.Warp2);
        py += ((ValueNoise.Sample(col, row, seed + 71, o.IslandCoastWarpScale) - 0.5) * 2 * o.IslandCoastWarp)
            + ((ValueNoise.Sample(col, row, seed + 89, IslandShapeConstants.WarpScale2) - 0.5) * 2 * IslandShapeConstants.Warp2);
        return (px, py);
    }

    private double? DepthAt(HexCoord coord, bool wasted)
    {
        var (col, row) = coord.ToOddQ();
        var o = _options;
        var seed = SeedFor(wasted);

        var (px, py) = Warp(col, row, seed);

        double cs = o.IslandCellSize;
        var baseCol = (int)Math.Floor(col / cs);
        var baseRow = (int)Math.Floor(row / cs);
        double? best = null;
        for (var dc = -1; dc <= 1; dc++)
        {
            for (var dr = -1; dr <= 1; dr++)
            {
                var island = IslandShapeAt(baseCol + dc, baseRow + dr, wasted);
                if (island is null)
                {
                    continue;
                }

                var qx = px - island.CentreX;
                var qy = py - island.CentreY;
                if ((qx * qx) + (qy * qy) > island.Reach * island.Reach)
                {
                    continue;
                }

                var d = NoisyDistance(island, qx, qy, col, row, seed);
                if (d <= 1 && (best is null || d < best))
                {
                    best = d;
                }
            }
        }

        return best;
    }

    // Distance to the island plus three octaves of shoreline noise: what a hex's depth into
    // this one island is (land when <= 1). `qx`/`qy` are the warped sample point relative to
    // the island's centre.
    private double NoisyDistance(IslandShape island, double qx, double qy, int col, int row, int seed)
    {
        var o = _options;
        var d = ShapeDistance(island, qx, qy);
        var n1 = ValueNoise.Sample(col, row, seed + 97, o.IslandCoastNoiseScale) - 0.5;
        var n2 = ValueNoise.Sample(col, row, seed + 101, o.IslandCoastNoiseScale / 2.5) - 0.5;
        var n3 = ValueNoise.Sample(col, row, seed + 103, o.IslandCoastNoiseScale / 6.25) - 0.5;
        d += o.IslandCoastNoise * (n1 + (IslandShapeConstants.Octave2 * n2) + (IslandShapeConstants.Octave3 * n3));
        return d;
    }

    /// <summary>
    /// The depth <paramref name="island"/> alone gives <paramref name="coord"/> — no other cell's
    /// island considered, no reach cull — or <see langword="null"/> where it is not land. Test
    /// hook: which hexes an island claims regardless of which cells a hex scans.
    /// </summary>
    internal double? DepthOfShape(IslandShape island, HexCoord coord, bool wasted)
    {
        var (col, row) = coord.ToOddQ();
        var (px, py) = Warp(col, row, SeedFor(wasted));
        var d = NoisyDistance(island, px - island.CentreX, py - island.CentreY, col, row, SeedFor(wasted));
        return d <= 1 ? d : null;
    }

    private static double ShapeDistance(IslandShape island, double qx, double qy)
    {
        var sx = island.SpineXArray;
        var sy = island.SpineYArray;
        var w = island.WidthArray;
        var d = double.PositiveInfinity;
        if (sx.Length == 1)
        {
            d = Math.Sqrt((qx * qx) + (qy * qy)) / w[0];
        }

        for (var k = 0; k < sx.Length - 1; k++)
        {
            var x0 = sx[k];
            var y0 = sy[k];
            var dx = sx[k + 1] - x0;
            var dy = sy[k + 1] - y0;
            var l2 = (dx * dx) + (dy * dy);
            var t = l2 > 0 ? (((qx - x0) * dx) + ((qy - y0) * dy)) / l2 : 0.0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            var ex = qx - (x0 + (t * dx));
            var ey = qy - (y0 + (t * dy));
            var v = Math.Sqrt((ex * ex) + (ey * ey)) / (w[k] + ((w[k + 1] - w[k]) * t));
            if (v < d)
            {
                d = v;
            }
        }

        var ix = island.IsletXArray;
        var iy = island.IsletYArray;
        var ir = island.IsletRadiusArray;
        for (var i = 0; i < ix.Length; i++)
        {
            var ex = qx - ix[i];
            var ey = qy - iy[i];
            var v = Math.Sqrt((ex * ex) + (ey * ey)) / ir[i];
            if (v < d)
            {
                d = v;
            }
        }

        return d;
    }

    /// <summary>The terrain of a single hex.</summary>
    public Terrain TerrainAt(HexCoord coord)
    {
        var depth = IslandDepthAt(coord);
        if (depth is null)
        {
            return Terrain.Sea;
        }

        if (depth > _options.BeachThreshold)
        {
            return Terrain.Sand;
        }

        if (depth < _options.MountainThreshold && MountainField(coord.Q, coord.R) > _options.MountainRockiness)
        {
            return Terrain.Mountain;
        }

        return ValueNoise.Sample(coord.Q, coord.R, _options.Seed + 2, ForestPatchScale) > _options.ForestRockiness
            ? Terrain.Forest
            : Terrain.Grass;
    }

    /// <summary>Wavelength (hexes) of the forest/grass patch noise — mirrors the frontend's <c>FOREST_PATCH_SCALE</c>.</summary>
    public const double ForestPatchScale = 6;

    /// <summary>Wavelength of the coarse ridge field that shapes mountain ranges.</summary>
    public const double RangeScale = 10;

    /// <summary>Wavelength of the fine term that roughens a range's edge.</summary>
    public const double RangeDetailScale = 2.5;

    /// <summary>Weight of the fine term in <see cref="MountainField"/>.</summary>
    public const double RangeDetailWeight = 0.12;

    /// <summary>
    /// The field a hex inside an island's core must beat <c>MountainRockiness</c> in to be a
    /// mountain: ridged (1 - |2n - 1|) coarse value noise puts high values along long winding
    /// lines - the range crests - and a small fine term keeps a range's edge from being a
    /// smooth blob. Mirrors the frontend's <c>mountainField</c>.
    /// </summary>
    public double MountainField(int q, int r)
    {
        var n = ValueNoise.Sample(q, r, _options.Seed + 5, RangeScale);
        var ridge = 1 - Math.Abs((2 * n) - 1);
        var fine = ValueNoise.Sample(q, r, _options.Seed + 7, RangeDetailScale);
        return ((1 - RangeDetailWeight) * ridge) + (RangeDetailWeight * fine);
    }

    /// <summary>
    /// The terrain of a single hex if it belongs to a wasted island — sea
    /// (i.e. hidden) everywhere else, including on every green island. See
    /// <see cref="WastedDepthAt"/> and the class remarks. Unlike
    /// <see cref="TerrainAt"/>, this is not what game logic queries: wasted
    /// land stays sea to every existing caller until the world's endboss is
    /// triggered, at which point callers that know about the reveal switch to
    /// this method instead.
    /// </summary>
    public Terrain WastedTerrainAt(HexCoord coord)
    {
        // Never on a green island: this guarantees wasted land can never fuse
        // with (or hide inside) a green island's own footprint.
        if (IslandDepthAt(coord) is not null)
        {
            return Terrain.Sea;
        }

        var depth = WastedDepthAt(coord);
        if (depth is null || depth > 1.0)
        {
            return Terrain.Sea;
        }

        // Nor may it touch green land through any of its six neighbours —
        // this is what stops a wasted island from growing a land bridge onto
        // a green island's coast.
        foreach (var neighbour in coord.Neighbours())
        {
            if (TerrainAt(neighbour).IsLand())
            {
                return Terrain.Sea;
            }
        }

        if (depth > _options.BeachThreshold)
        {
            return Terrain.Sand;
        }

        var rockiness = ValueNoise.Sample(coord.Q, coord.R, _options.Seed + 2, 2.5);

        if (depth < _options.MountainThreshold && rockiness > _options.MountainRockiness)
        {
            return Terrain.Mountain;
        }

        return rockiness > _options.ForestRockiness ? Terrain.Forest : Terrain.Grass;
    }

    public bool IsLand(HexCoord coord) => TerrainAt(coord).IsLand();

    /// <summary>
    /// A land hex bordering at least one sea neighbour — see
    /// <see cref="Shoreline.IsShoreline"/>, which this just applies against
    /// this sampler's own <see cref="TerrainAt"/>.
    /// </summary>
    public bool IsShoreline(HexCoord coord) => Shoreline.IsShoreline(coord, TerrainAt);

    /// <summary>A sea hex with at least one land neighbour — the coastal-water ring around every island.</summary>
    public bool IsCoastalWater(HexCoord coord)
    {
        if (TerrainAt(coord) != Terrain.Sea)
        {
            return false;
        }

        foreach (var neighbour in coord.Neighbours())
        {
            if (IsLand(neighbour))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Which of the six art-pack rotations a hex renders with. Coastal water
    /// faces the land it borders; everything else gets a cosmetic, seed-stable
    /// rotation so the map doesn't read as one repeated tile stamped everywhere.
    /// </summary>
    /// <param name="overrideOrientation">
    /// Forces the result regardless of terrain — the hook a river (which needs
    /// its own rotation to keep its flow direction visually continuous between
    /// tiles) overrides through, once rivers are generated.
    /// </param>
    public TileOrientation OrientationAt(HexCoord coord, TileOrientation? overrideOrientation = null)
    {
        if (overrideOrientation is { } forced)
        {
            return forced;
        }

        return IsCoastalWater(coord) ? CoastalOrientation(coord) : DefaultOrientation(coord);
    }

    /// <summary>
    /// The orientation a fishing hut on <paramref name="coord"/> should
    /// render with — the <see cref="OrientationAt"/> override hook, fed a
    /// building-specific answer instead of a river's.
    /// </summary>
    /// <remarks>
    /// <see cref="CoastalOrientation"/> alone isn't good enough here: it
    /// averages every land neighbour a coastal-water hex has, which is fine
    /// for plain water with no owner, but a fishing hut belongs to one
    /// settlement and its art has a dock, a single fixed connection to land —
    /// it must face the hex's land neighbour actually closest to that
    /// settlement's own centre (its own shore), not a blend that could point
    /// at someone else's coastline or a gap between two.
    /// </remarks>
    public TileOrientation FishingHutOrientation(HexCoord coord, HexCoord settlementCentre)
    {
        var neighbours = coord.Neighbours();
        var bestIndex = 0;
        var bestDistance = int.MaxValue;

        for (var i = 0; i < neighbours.Length; i++)
        {
            if (!IsLand(neighbours[i]))
            {
                continue;
            }

            var distance = neighbours[i].DistanceTo(settlementCentre);
            if (distance < bestDistance)
            {
                bestDistance = distance;
                bestIndex = i;
            }
        }

        return (TileOrientation)bestIndex;
    }

    /// <summary>
    /// The direction a coastal-water hex's land neighbours sit in, as a compass
    /// point on the hex's own six-direction wheel: each land neighbour
    /// contributes a unit vector at its direction's angle (60° apart, matching
    /// <see cref="HexCoord.Directions"/>'s order), and the summed vector is
    /// snapped to the nearest of those six directions.
    /// </summary>
    private TileOrientation CoastalOrientation(HexCoord coord)
    {
        var neighbours = coord.Neighbours();
        var sumX = 0.0;
        var sumY = 0.0;
        var firstLandIndex = -1;

        for (var i = 0; i < neighbours.Length; i++)
        {
            if (!IsLand(neighbours[i]))
            {
                continue;
            }

            if (firstLandIndex < 0)
            {
                firstLandIndex = i;
            }

            var angle = i * (Math.PI / 3.0);
            sumX += Math.Cos(angle);
            sumY += Math.Sin(angle);
        }

        // Opposite land neighbours (e.g. a one-hex-wide strait) can cancel the
        // vector to (near) zero — a small epsilon rather than an exact `==
        // 0.0` check, because two land neighbours 180 degrees apart don't
        // reliably sum their sin/cos terms to bit-exact zero (this is where
        // the .NET and JS Math libraries' cos/sin/atan2 diverge at the ULP
        // level, and atan2 near the origin is extremely sensitive to that —
        // the frontend mirror uses the same epsilon so both land on the same
        // orientation for these hexes). Falling back to the first land
        // direction found keeps the pick deterministic instead of an
        // arbitrary default.
        const double zeroEpsilon = 1e-9;
        if (Math.Abs(sumX) < zeroEpsilon && Math.Abs(sumY) < zeroEpsilon)
        {
            return (TileOrientation)firstLandIndex;
        }

        var resultAngle = Math.Atan2(sumY, sumX);
        if (resultAngle < 0)
        {
            resultAngle += 2.0 * Math.PI;
        }

        // AwayFromZero, not the .NET default (ToEven/banker's rounding): the
        // frontend mirror (worldGenerator.ts) uses JS's Math.round, which
        // always rounds an exact .5 up rather than to the nearest even
        // integer. resultAngle/(pi/3) is always >= 0 here, so "away from
        // zero" and "round half up" agree — this only changes the handful of
        // hexes whose land-neighbour vector lands exactly on a 30° boundary,
        // but without it those hexes silently pick a different orientation
        // than the client renders, breaking the frontend/backend parity this
        // whole function exists for.
        var index = (int)Math.Round(resultAngle / (Math.PI / 3.0), MidpointRounding.AwayFromZero) % 6;
        return (TileOrientation)index;
    }

    /// <summary>Seed-stable cosmetic rotation for tiles that don't face anything in particular.</summary>
    private TileOrientation DefaultOrientation(HexCoord coord)
    {
        var hash = ValueNoise.Hash2(coord.Q, coord.R, _options.Seed + 29);
        var index = (int)(hash * 6.0);
        if (index > 5)
        {
            index = 5;
        }

        return (TileOrientation)index;
    }

    /// <summary>
    /// Per-terrain variant count the tile art pack actually has, everything else
    /// falling back to 1. Grass has a plain top image plus <c>variant000</c>-
    /// <c>variant002</c> (4); forest has a plain image plus <c>variant000</c>-
    /// <c>variant001</c> (3); mountain has four distinct shapes — Cone, Table,
    /// Saddleback, Corrie (<see cref="MountainShape"/>) — each its own
    /// composited (not base/top split) render, so <see cref="VariantAt"/>'s
    /// index doubles as that enum's numeric value; see <see cref="MountainShapeAt"/>.
    /// </summary>
    private static readonly IReadOnlyDictionary<Terrain, int> VariantCounts = new Dictionary<Terrain, int>
    {
        [Terrain.Grass] = 4,
        [Terrain.Forest] = 3,
        [Terrain.Mountain] = 4,
    };

    /// <summary>
    /// Which of the four mountain shapes (<see cref="MountainShape"/>) a hex
    /// renders with — <see cref="VariantAt"/>'s own index for
    /// <see cref="Terrain.Mountain"/>, just typed. Meaningless for a hex that
    /// isn't a mountain, same as <see cref="VariantAt"/> itself.
    /// </summary>
    public MountainShape MountainShapeAt(HexCoord coord) => (MountainShape)VariantAt(coord);

    /// <summary>
    /// Which spring-capable mountain shape (<see cref="MountainShape.Saddleback"/>
    /// or <see cref="MountainShape.Corrie"/>) a hex should render as once it's
    /// known to carry a river's <see cref="RiverTileShape.Spring"/> tile —
    /// only those two shapes shipped a <c>_spring</c> art cut (see
    /// <see cref="MountainShapeExtensions.IsSpringCapable"/>), so a spring
    /// always renders as one of them regardless of what <see cref="MountainShapeAt"/>
    /// would otherwise have picked for the same coordinate. Pure and
    /// independent of whether the coordinate actually ends up being a spring
    /// — the caller (river rendering) is what knows that, the same way
    /// <see cref="FishingHutOrientation"/> is a pure answer fed to an
    /// external override hook rather than state stored anywhere.
    /// </summary>
    public MountainShape SpringMountainShapeAt(HexCoord coord)
    {
        var hash = ValueNoise.Hash2(coord.Q, coord.R, _options.Seed + 37);
        return hash < 0.5 ? MountainShape.Saddleback : MountainShape.Corrie;
    }

    /// <summary>
    /// Which crop <paramref name="islandCentre"/>'s island grows — every Grass
    /// hex on that island shares this one answer (see <see cref="SoilType"/>),
    /// so the caller hashes by the island's centre once rather than per hex.
    /// Same pattern as <see cref="SpringMountainShapeAt"/>, a different salt.
    /// </summary>
    public SoilType SoilAt(HexCoord islandCentre)
    {
        var hash = ValueNoise.Hash2(islandCentre.Q, islandCentre.R, _options.Seed + 41);
        return hash < 0.5 ? SoilType.Wheat : SoilType.Pumpkin;
    }

    /// <summary>
    /// Seed-stable variant index for a hex, in <c>[0, N)</c> where <c>N</c> is
    /// however many variants <see cref="VariantCounts"/> knows the art pack has
    /// for that terrain (1 — i.e. always variant 0 — for anything not listed).
    /// Capping the range this way *is* the fallback: a terrain with fewer
    /// variants than the pack's richest one never gets asked for a variant it
    /// doesn't have.
    /// </summary>
    public int VariantAt(HexCoord coord)
    {
        var terrain = TerrainAt(coord);
        var count = VariantCounts.TryGetValue(terrain, out var known) ? known : 1;
        if (count <= 1)
        {
            return 0;
        }

        var hash = ValueNoise.Hash2(coord.Q, coord.R, _options.Seed + 31);
        var index = (int)(hash * count);
        return index >= count ? count - 1 : index;
    }

    /// <summary>
    /// Salt for <see cref="RiverVariantAt"/> — the next unused prime
    /// continuing the per-hex-property sequence this class already uses
    /// (<see cref="DefaultOrientation"/> +29, <see cref="VariantAt"/> +31,
    /// <see cref="SpringMountainShapeAt"/> +37, <see cref="SoilAt"/> +41):
    /// far enough past that cluster, and past <c>RiverGenerator</c>'s own
    /// per-island noise salts, that <see cref="ValueNoise.Hash2"/>'s weak
    /// seed-mixing (see <c>WASTED_VARIANT_SALT</c>'s doc comment on the
    /// frontend, <c>worldGenerator.ts</c>) can't correlate this pick with a
    /// neighbouring one.
    /// </summary>
    private const int RiverVariantSalt = 67;

    private static readonly double[] River180Weights = { 0.4, 0.4, 0.2 };
    private static readonly double[] River120Weights = { 0.4, 0.4, 0.2 };
    private static readonly double[] River60Weights = { 0.85, 0.15 };

    /// <summary>
    /// Picks an index from <paramref name="weights"/> (assumed to sum to
    /// ~1) using a <c>[0, 1)</c> roll <paramref name="hash"/> — mirrors the
    /// frontend's <c>weightedIndex</c> exactly.
    /// </summary>
    private static int WeightedIndex(double hash, double[] weights)
    {
        double acc = 0;
        for (var i = 0; i < weights.Length; i++)
        {
            acc += weights[i];
            if (hash < acc)
            {
                return i;
            }
        }

        return weights.Length - 1;
    }

    /// <summary>
    /// Which river-art variant a <see cref="RiverTileShape.Straight"/>/
    /// <see cref="RiverTileShape.Bend"/>/<see cref="RiverTileShape.Bend60"/>
    /// hex renders with — <see cref="RiverVariant.Plain"/> for every other
    /// shape, since Spring/Confluence/Mouth have no variant art. Mirrors the
    /// frontend's <c>riverVariantAt</c> exactly (same salt, same weights):
    /// Straight and Bend each roll plain/meander/island at 40/40/20, Bend60
    /// rolls plain/loop at 85/15.
    /// </summary>
    public RiverVariant RiverVariantAt(HexCoord coord, RiverTileShape shape)
    {
        if (shape != RiverTileShape.Straight && shape != RiverTileShape.Bend && shape != RiverTileShape.Bend60)
        {
            return RiverVariant.Plain;
        }

        var hash = ValueNoise.Hash2(coord.Q, coord.R, _options.Seed + RiverVariantSalt);
        if (shape == RiverTileShape.Bend60)
        {
            return WeightedIndex(hash, River60Weights) == 0 ? RiverVariant.Plain : RiverVariant.Loop;
        }

        var weights = shape == RiverTileShape.Straight ? River180Weights : River120Weights;
        return WeightedIndex(hash, weights) switch
        {
            0 => RiverVariant.Plain,
            1 => RiverVariant.Meander,
            _ => RiverVariant.Island,
        };
    }
}
