namespace Bjarnoy.Domain.World;

/// <summary>
/// Turns a seed into a world: classifies every hex in the sea, groups the land
/// into islands, names them and picks the plots a new player can be dropped on.
/// </summary>
/// <remarks>
/// <para>
/// Only the results a client cannot recompute — the island list, their names and
/// their start positions — are worth persisting. Terrain itself is never stored:
/// <see cref="TerrainSampler"/> derives it from the seed on both sides.
/// </para>
/// <para>
/// Everything here is pure and takes its seed as a parameter, so two worlds can
/// be generated concurrently. The legacy equivalent could not: it set a static
/// <c>Noise.Seed</c>, flood-filled recursively (one stack frame per land hex),
/// and wrote six debug PNGs to the working directory on every call.
/// </para>
/// </remarks>
public sealed class WorldGenerator
{
    private readonly WorldGenerationOptions _options;
    private readonly TerrainSampler _sampler;

    public WorldGenerator(WorldGenerationOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        options.Validate();
        _options = options;
        _sampler = new TerrainSampler(options);
    }

    public TerrainSampler Sampler => _sampler;

    /// <summary>
    /// Generates the whole world. Cost is one terrain sample per hex in the sea,
    /// i.e. <c>3r(r+1)+1</c> samples for radius <c>r</c>.
    /// </summary>
    public GeneratedWorld Generate(CancellationToken cancellationToken = default)
    {
        var land = ClassifyLand(cancellationToken);
        var islands = new List<GeneratedIsland>();
        var visited = new HashSet<HexCoord>();

        // Scanning in sorted order (rather than in hash-set order) is what makes
        // island indices stable for a given seed.
        foreach (var coord in land.Keys.OrderBy(c => c.Q).ThenBy(c => c.R))
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (!visited.Add(coord))
            {
                continue;
            }

            var tiles = FloodFill(coord, land, visited);
            if (tiles.Count < _options.MinimumIslandTiles)
            {
                continue;
            }

            var index = islands.Count;
            islands.Add(new GeneratedIsland
            {
                Index = index,
                Name = IslandNames.For(_options.Seed, index),
                Tiles = tiles,
                Centre = CentreOf(tiles),
                StartPositions = FindStartPositions(tiles, land),
            });
        }

        return new GeneratedWorld
        {
            Options = _options,
            Islands = islands,
            LandTileCount = land.Count,
        };
    }

    private Dictionary<HexCoord, Terrain> ClassifyLand(CancellationToken cancellationToken)
    {
        var land = new Dictionary<HexCoord, Terrain>();

        foreach (var coord in HexCoord.Origin.WithinRadius(_options.Radius))
        {
            cancellationToken.ThrowIfCancellationRequested();

            var terrain = _sampler.TerrainAt(coord);
            if (terrain.IsLand())
            {
                land[coord] = terrain;
            }
        }

        return land;
    }

    /// <summary>
    /// Collects the landmass reachable from <paramref name="start"/>. Iterative
    /// with an explicit stack: the legacy version recursed once per land hex,
    /// which overflows on any island worth playing on.
    /// </summary>
    private static List<HexCoord> FloodFill(
        HexCoord start,
        Dictionary<HexCoord, Terrain> land,
        HashSet<HexCoord> visited)
    {
        var tiles = new List<HexCoord>();
        var pending = new Stack<HexCoord>();
        pending.Push(start);

        while (pending.TryPop(out var coord))
        {
            tiles.Add(coord);

            foreach (var neighbour in coord.Neighbours())
            {
                if (land.ContainsKey(neighbour) && visited.Add(neighbour))
                {
                    pending.Push(neighbour);
                }
            }
        }

        return tiles;
    }

    /// <summary>
    /// The land hex closest to the island's average position. Averaging in axial
    /// space then snapping to the nearest actual tile keeps the centre on land
    /// even for a crescent-shaped island.
    /// </summary>
    private static HexCoord CentreOf(IReadOnlyList<HexCoord> tiles)
    {
        double sumQ = 0;
        double sumR = 0;
        foreach (var tile in tiles)
        {
            sumQ += tile.Q;
            sumR += tile.R;
        }

        var meanQ = sumQ / tiles.Count;
        var meanR = sumR / tiles.Count;

        var best = tiles[0];
        var bestDistance = double.MaxValue;
        foreach (var tile in tiles)
        {
            var dq = tile.Q - meanQ;
            var dr = tile.R - meanR;
            var distance = (dq * dq) + (dr * dr);
            if (distance < bestDistance)
            {
                bestDistance = distance;
                best = tile;
            }
        }

        return best;
    }

    /// <summary>
    /// Finds plots a starting settlement can be founded on, best first.
    /// </summary>
    /// <remarks>
    /// The rules are the legacy <c>StartPositionHelper</c>'s, restated: a grass
    /// hex, with at least one forest and two more grass hexes adjacent, and no
    /// water within two hexes so the plot is genuinely inland. Legacy applied
    /// them one settlement at a time against live ownership; here they are
    /// evaluated once at world creation and the resulting plots are stored, so
    /// founding a settlement is a lookup rather than a scan of the whole island.
    /// Spacing between players is enforced when a plot is claimed, not here.
    /// </remarks>
    private static List<HexCoord> FindStartPositions(
        IReadOnlyList<HexCoord> tiles,
        Dictionary<HexCoord, Terrain> land)
    {
        var candidates = new List<(HexCoord Coord, int Score)>();

        foreach (var tile in tiles)
        {
            if (land[tile] != Terrain.Grass)
            {
                continue;
            }

            var forest = 0;
            var grass = 0;
            foreach (var neighbour in tile.Neighbours())
            {
                if (!land.TryGetValue(neighbour, out var terrain))
                {
                    continue;
                }

                if (terrain == Terrain.Forest)
                {
                    forest++;
                }
                else if (terrain == Terrain.Grass)
                {
                    grass++;
                }
            }

            if (forest < 1 || grass < 2)
            {
                continue;
            }

            // No water within two hexes. `land` holds only land, so an absent
            // key inside the world radius is sea.
            var coastal = false;
            foreach (var nearby in tile.WithinRadius(2))
            {
                if (!land.ContainsKey(nearby))
                {
                    coastal = true;
                    break;
                }
            }

            if (coastal)
            {
                continue;
            }

            candidates.Add((tile, (forest * 2) + grass));
        }

        return candidates
            .OrderByDescending(c => c.Score)
            .ThenBy(c => c.Coord.Q)
            .ThenBy(c => c.Coord.R)
            .Select(c => c.Coord)
            .ToList();
    }
}
