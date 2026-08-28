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

                var dx = col - centreCol;
                var dy = row - centreRow;
                var depth = Math.Sqrt((dx * dx) + (dy * dy)) / radius;

                if (depth <= 1.0 && (best is null || depth < best))
                {
                    best = depth;
                }
            }
        }

        return best;
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
    /// <c>variant001</c> (3); mountain isn't base/top split and the pack has no
    /// <c>mountaintile*variant*</c> files at all, so it never gets more than its
    /// one composited image.
    /// </summary>
    private static readonly IReadOnlyDictionary<Terrain, int> VariantCounts = new Dictionary<Terrain, int>
    {
        [Terrain.Grass] = 4,
        [Terrain.Forest] = 3,
    };

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
