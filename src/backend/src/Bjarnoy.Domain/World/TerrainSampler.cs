namespace Bjarnoy.Domain.World;

/// <summary>
/// Classifies a single hex from nothing but its coordinate and the world's
/// generation options — no neighbours, no map, no state.
/// </summary>
/// <remarks>
/// <para>
/// Islands are seeded on a coarse grid of cells in odd-q offset space (roughly
/// square, so islands read as evenly rather than axially spread). Each cell
/// independently hashes whether it holds an island, where its jittered centre
/// sits and how big it is. A hex only has to look at its own cell and the eight
/// around it, which is why classification is O(1) and needs no precomputed map.
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
    /// How far into the nearest island a hex sits, as a fraction of that island's
    /// radius: 0 at the centre, 1 at the shoreline, <see langword="null"/> at sea.
    /// </summary>
    public double? IslandDepthAt(HexCoord coord)
    {
        var (col, row) = coord.ToOddQ();
        var seed = _options.Seed;
        var cellSize = _options.IslandCellSize;
        var jitter = cellSize * 0.55;

        var baseCol = (int)Math.Floor((double)col / cellSize);
        var baseRow = (int)Math.Floor((double)row / cellSize);

        // A cheap domain warp applied once per hex, before distance is measured
        // against any island's lobes, so coastlines wobble instead of tracing
        // perfect arcs. Zero when IslandCoastWarp is 0 (the legacy default),
        // which keeps this identical to the un-warped sample point.
        var px = (double)col;
        var py = (double)row;
        if (_options.IslandCoastWarp > 0)
        {
            var warpScale = _options.IslandCoastWarpScale;
            px += (ValueNoise.Sample(col, row, seed + 53, warpScale) - 0.5) * 2.0 * _options.IslandCoastWarp;
            py += (ValueNoise.Sample(col, row, seed + 71, warpScale) - 0.5) * 2.0 * _options.IslandCoastWarp;
        }

        double? best = null;

        for (var dCol = -1; dCol <= 1; dCol++)
        {
            for (var dRow = -1; dRow <= 1; dRow++)
            {
                var cellCol = baseCol + dCol;
                var cellRow = baseRow + dRow;

                if (ValueNoise.Hash2(cellCol, cellRow, seed) > _options.IslandChance)
                {
                    continue;
                }

                var centreCol = (cellCol * cellSize) + (cellSize / 2.0)
                    + ((ValueNoise.Hash2(cellCol, cellRow, seed + 11) - 0.5) * jitter);
                var centreRow = (cellRow * cellSize) + (cellSize / 2.0)
                    + ((ValueNoise.Hash2(cellCol, cellRow, seed + 13) - 0.5) * jitter);
                var radius = _options.IslandMinRadius
                    + (ValueNoise.Hash2(cellCol, cellRow, seed + 17)
                        * (_options.IslandMaxRadius - _options.IslandMinRadius));

                var depth = IslandCellDepth(cellCol, cellRow, seed, centreCol, centreRow, radius, px, py);

                if (depth <= 1.0 && (best is null || depth < best))
                {
                    best = depth;
                }
            }
        }

        return best;
    }

    /// <summary>
    /// The shortest depth a single island cell's shape gives the warped sample
    /// point <paramref name="px"/>/<paramref name="py"/>: a chain of 1-5 lobes
    /// (offset discs) walked out from the jittered centre along a spine that
    /// bends by a per-island amount, smooth-blended where lobes meet so the
    /// waist between them fills in rather than pinching to a hairline.
    /// </summary>
    /// <remarks>
    /// With <see cref="WorldGenerationOptions.IslandMinLobes"/> and
    /// <see cref="WorldGenerationOptions.IslandMaxLobes"/> both 1 this reduces
    /// to exactly the single-disc circle the original algorithm produced
    /// (existing worlds are migrated to those values so their shape never
    /// changes under them — see <c>docs/design/river-generation.md</c>).
    /// No trigonometry is used anywhere in this method: every direction is
    /// built and rotated with plain vector arithmetic so the frontend mirror
    /// in <c>worldGenerator.ts</c> can stay bit-for-bit identical.
    /// </remarks>
    private double IslandCellDepth(
        int cellCol, int cellRow, int seed, double centreCol, double centreRow, double radius, double px, double py)
    {
        var dx0 = px - centreCol;
        var dy0 = py - centreRow;
        var best = Math.Sqrt((dx0 * dx0) + (dy0 * dy0)) / radius;

        var minLobes = _options.IslandMinLobes;
        var maxLobes = _options.IslandMaxLobes;
        var lobeCount = minLobes
            + (int)Math.Floor(ValueNoise.Hash2(cellCol, cellRow, seed + 19) * ((maxLobes - minLobes) + 1));

        if (lobeCount <= 1)
        {
            return best;
        }

        var ax = ValueNoise.Hash2(cellCol, cellRow, seed + 23) - 0.5;
        var ay = ValueNoise.Hash2(cellCol, cellRow, seed + 47) - 0.5;
        var len = Math.Sqrt((ax * ax) + (ay * ay));
        double ux, uy;
        if (len < 1e-9)
        {
            ux = 1.0;
            uy = 0.0;
        }
        else
        {
            ux = ax / len;
            uy = ay / len;
        }

        var curl = (ValueNoise.Hash2(cellCol, cellRow, seed + 59) - 0.5) * 2.0;
        var turn = curl * _options.IslandBendiness;
        var elongFraction = ValueNoise.Hash2(cellCol, cellRow, seed + 61);
        var spineLength = radius * _options.IslandMaxElongation * elongFraction;
        var step = spineLength / (lobeCount - 1);

        var lx = centreCol;
        var ly = centreRow;
        var blend = _options.IslandLobeBlend;

        for (var lobe = 1; lobe < lobeCount; lobe++)
        {
            lx += ux * step;
            ly += uy * step;

            var lobeScale = _options.IslandLobeMinScale
                + (ValueNoise.Hash2(cellCol, cellRow, seed + 200 + lobe)
                    * (_options.IslandLobeMaxScale - _options.IslandLobeMinScale));
            var lobeRadius = radius * lobeScale;

            var ddx = px - lx;
            var ddy = py - ly;
            var lobeDepth = Math.Sqrt((ddx * ddx) + (ddy * ddy)) / lobeRadius;

            best = SmoothMin(best, lobeDepth, blend);

            // Rotate (ux, uy) by turn radians' worth of curl for the next
            // segment, without trigonometry: u + turn * perp(u), renormalised.
            var tx = ux - (turn * uy);
            var ty = uy + (turn * ux);
            var tl = Math.Sqrt((tx * tx) + (ty * ty));
            if (tl > 1e-9)
            {
                ux = tx / tl;
                uy = ty / tl;
            }
        }

        return best;
    }

    /// <summary>Polynomial smooth minimum: a hard <see cref="Math.Min"/> at <paramref name="k"/> = 0.</summary>
    private static double SmoothMin(double a, double b, double k)
    {
        if (k <= 0.0)
        {
            return Math.Min(a, b);
        }

        var h = Math.Max(k - Math.Abs(a - b), 0.0) / k;
        return Math.Min(a, b) - (h * h * k * 0.25);
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
}
