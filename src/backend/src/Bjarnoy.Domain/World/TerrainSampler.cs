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
}
