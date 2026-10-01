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
    /// Generates the whole world. Terrain is never sampled hex by hex over the
    /// sea: the island cells that hold an island are enumerated
    /// (<see cref="TerrainSampler.EnumerateIslandShapes"/>), each island's
    /// footprint box is scanned at stride 2 for land, and every landmass found is
    /// flood-filled on demand. Cost scales with the land, not with the radius.
    /// </summary>
    public GeneratedWorld Generate(CancellationToken cancellationToken = default)
    {
        var usedNames = new HashSet<string>(StringComparer.Ordinal);

        var greenMasses = FindLandmasses(wasted: false, cancellationToken);
        var green = BuildIslands(greenMasses, firstIndex: 0, wasted: false, cancellationToken);

        // Wasted islands: found and flood-filled the same way as green
        // islands, over the wasted island cells, using WastedTerrainAt instead
        // of TerrainAt. Appended after every green island so indices/names
        // continue from where the green scan left off. No start positions
        // (wasted islands can never be founded on) and no shrine — a wasted
        // island's rivers are lava streams (RiverGenerator's allowConfluence:
        // false mode) and its "shrine" giant is a single Utgard.
        var wastedMasses = FindLandmasses(wasted: true, cancellationToken);
        var wasted = BuildIslands(wastedMasses, firstIndex: green.Count, wasted: true, cancellationToken);

        // Names are handed out in index order, sequentially, because a name can
        // depend on the ones already taken.
        var islands = new List<GeneratedIsland>(green.Count + wasted.Count);
        foreach (var island in green.Concat(wasted))
        {
            islands.Add(island with { Name = NextUniqueName(island.Index, usedNames) });
        }

        return new GeneratedWorld
        {
            Options = _options,
            Islands = islands,
            LandTileCount = greenMasses.Sum(m => m.Land.Count),
        };
    }

    /// <summary>
    /// Turns landmasses (already in index order) into islands, dropping specks below
    /// <see cref="WorldGenerationOptions.MinimumIslandTiles"/>. The per-island work
    /// (rivers, giants, start positions) is independent between islands, so it runs in
    /// parallel; results land in an array slot per island, so the output order is the
    /// index order whatever the scheduling.
    /// </summary>
    private List<GeneratedIsland> BuildIslands(
        List<Landmass> masses, int firstIndex, bool wasted, CancellationToken cancellationToken)
    {
        var kept = masses.Where(m => m.Land.Count >= _options.MinimumIslandTiles).ToList();
        var built = new GeneratedIsland[kept.Count];

        Parallel.For(
            0,
            kept.Count,
            new ParallelOptions { CancellationToken = cancellationToken },
            i =>
            {
                var index = firstIndex + i;
                var land = kept[i].Land;
                var tiles = kept[i].SortedTiles();
                IReadOnlyList<RiverTile> riverTiles;
                IReadOnlyList<BogTile> bogTiles = [];
                IReadOnlyList<Giant> giants;
                IReadOnlyList<Camp> camps;
                IReadOnlyList<HexCoord> startPositions;
                if (wasted)
                {
                    riverTiles = RiverGenerator.Generate(
                        tiles, land, _sampler, _options, index, wasted: true, allowConfluence: false);
                    giants = GiantGenerator.Generate(
                        tiles, land, _sampler, _options, index, riverTiles.Select(t => t.Coord).ToHashSet(), wasted: true);
                    camps = CampGenerator.Generate(tiles, land, _sampler, _options, index, riverTiles, giants, wasted: true);
                    startPositions = [];
                }
                else
                {
                    var generated = RiverGenerator.GenerateWithBogs(tiles, land, _sampler, _options, index);
                    riverTiles = generated.Rivers;
                    bogTiles = generated.Bogs;

                    // Giants, camps and start positions see the bogland as terrain: they never stand on a bog or a
                    // lake, and only plain bog moss can hold a (bog) camp.
                    var terrainLand = BogTerrain.Overlay(land, bogTiles);
                    giants = GiantGenerator.Generate(
                        tiles, terrainLand, _sampler, _options, index, riverTiles.Select(t => t.Coord).ToHashSet());
                    // Camps are placed before start positions; start positions keep away
                    // from the strong ones (weak camps are fine next to a spot).
                    camps = CampGenerator.Generate(
                        tiles, terrainLand, _sampler, _options, index, riverTiles, giants,
                        plainBog: BogTerrain.PlainBog(bogTiles));
                    startPositions = FindStartPositions(tiles, terrainLand, giants, camps, BogTerrain.PlainBog(bogTiles), _options.BogReach);
                }

                built[i] = new GeneratedIsland
                {
                    Index = index,
                    Name = string.Empty,
                    Tiles = tiles,
                    Centre = CentreOf(tiles),
                    StartPositions = startPositions,
                    RiverTiles = riverTiles,
                    BogTiles = bogTiles,
                    Giants = giants,
                    Camps = camps,
                    IsWasted = wasted,
                };
            });

        return [.. built];
    }

    /// <summary>One connected landmass: its land hexes (with terrain) and its lowest (Q, R) hex.</summary>
    internal sealed class Landmass
    {
        public Landmass(Dictionary<HexCoord, Terrain> land, HexCoord lowest)
        {
            Land = land;
            Lowest = lowest;
        }

        public Dictionary<HexCoord, Terrain> Land { get; }

        public HexCoord Lowest { get; }

        /// <summary>The land hexes in (Q, R) order, so island tile lists never depend on discovery order.</summary>
        public List<HexCoord> SortedTiles()
        {
            var tiles = new List<HexCoord>(Land.Keys);
            tiles.Sort(static (a, b) => a.Q != b.Q ? a.Q.CompareTo(b.Q) : a.R.CompareTo(b.R));
            return tiles;
        }
    }

    /// <summary>
    /// Every landmass of the green (or wasted) islands, ordered by the lowest
    /// (Q, R) hex each contains, so island indices are stable for a seed.
    /// </summary>
    /// <remarks>
    /// Each island's land-possible box is scanned on the even-column/even-row
    /// lattice (stride 2 in offset space) and a flood fill starts at every land
    /// sample not already inside a found landmass. A landmass shared by
    /// overlapping cells is found once (each box is scanned in parallel; identical landmasses
    /// found from two boxes are merged by their lowest hex). Only a
    /// landmass narrower than the stride in both directions (a speck a few hexes
    /// across, below <see cref="WorldGenerationOptions.MinimumIslandTiles"/> for
    /// practical purposes) can slip between samples.
    /// </remarks>
    internal List<Landmass> FindLandmasses(bool wasted, CancellationToken cancellationToken)
    {
        Func<HexCoord, Terrain> terrainOf = wasted ? _sampler.WastedTerrainAt : _sampler.TerrainAt;
        var shapes = _sampler.EnumerateIslandShapes(wasted).ToList();
        var perShape = new List<Landmass>[shapes.Count];

        // Each island's box is scanned on its own thread with its own visited set. A flood
        // fill always returns the whole connected landmass, so a landmass reached from two
        // boxes (touching islands) comes back identical from both; the merge below keeps one
        // per lowest hex, which makes the result equal to a sequential scan.
        Parallel.For(
            0,
            shapes.Count,
            new ParallelOptions { CancellationToken = cancellationToken },
            i =>
            {
                var shape = shapes[i];
                var visited = new HashSet<HexCoord>();
                var found = new List<Landmass>();
                var firstCol = shape.MinCol + (shape.MinCol & 1);
                var firstRow = shape.MinRow + (shape.MinRow & 1);
                for (var col = firstCol; col <= shape.MaxCol; col += 2)
                {
                    for (var row = firstRow; row <= shape.MaxRow; row += 2)
                    {
                        var coord = HexCoord.FromOddQ(new OffsetCoord(col, row));
                        if (visited.Contains(coord))
                        {
                            continue;
                        }

                        var terrain = terrainOf(coord);
                        if (terrain.IsLand())
                        {
                            found.Add(FloodFill(coord, terrain, terrainOf, visited));
                        }
                    }
                }

                perShape[i] = found;
            });

        var byLowest = new Dictionary<HexCoord, Landmass>();
        foreach (var found in perShape)
        {
            foreach (var mass in found)
            {
                byLowest.TryAdd(mass.Lowest, mass);
            }
        }

        var masses = byLowest.Values.ToList();
        masses.Sort(static (a, b) => a.Lowest.Q != b.Lowest.Q
            ? a.Lowest.Q.CompareTo(b.Lowest.Q)
            : a.Lowest.R.CompareTo(b.Lowest.R));
        return masses;
    }

    /// <summary>
    /// Collects the landmass reachable from <paramref name="start"/>, sampling
    /// terrain on demand. Iterative with an explicit stack: the legacy version
    /// recursed once per land hex, which overflows on any island worth playing on.
    /// </summary>
    private static Landmass FloodFill(
        HexCoord start,
        Terrain startTerrain,
        Func<HexCoord, Terrain> terrainOf,
        HashSet<HexCoord> visited)
    {
        var land = new Dictionary<HexCoord, Terrain> { [start] = startTerrain };
        var sea = new HashSet<HexCoord>();
        var lowest = start;
        var pending = new Stack<HexCoord>();
        visited.Add(start);
        pending.Push(start);

        while (pending.TryPop(out var coord))
        {
            foreach (var neighbour in coord.Neighbours())
            {
                if (visited.Contains(neighbour) || sea.Contains(neighbour))
                {
                    continue;
                }

                var terrain = terrainOf(neighbour);
                if (!terrain.IsLand())
                {
                    sea.Add(neighbour);
                    continue;
                }

                visited.Add(neighbour);
                land[neighbour] = terrain;
                if (neighbour.Q < lowest.Q || (neighbour.Q == lowest.Q && neighbour.R < lowest.R))
                {
                    lowest = neighbour;
                }

                pending.Push(neighbour);
            }
        }

        return new Landmass(land, lowest);
    }

    /// <summary>
    /// Picks a name for the island at <paramref name="index"/> that no earlier
    /// island in this world already has, trying successive candidates from
    /// <see cref="IslandNames"/> until one is free.
    /// </summary>
    private string NextUniqueName(int index, HashSet<string> usedNames)
    {
        for (var attempt = 0; attempt < IslandNames.CombinationsPerIsland; attempt++)
        {
            var candidate = IslandNames.For(_options.Seed, index, attempt);
            if (usedNames.Add(candidate))
            {
                return candidate;
            }
        }

        // Every stem/ending combination is already spoken for (a world with more
        // islands than the name list has room for): fall back to a numbered
        // variant of the first candidate rather than looping forever.
        var fallback = IslandNames.For(_options.Seed, index);
        var suffix = 2;
        string numbered;
        do
        {
            numbered = $"{fallback} {suffix++}";
        }
        while (!usedNames.Add(numbered));

        return numbered;
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
    /// <remarks>
    /// Giant placement v2: giants are generated first (<see cref="GiantGenerator"/>),
    /// and this drops any otherwise-qualifying candidate that sits within
    /// <see cref="GiantGenerator.StartPositionExclusionRadius"/> + 1 hex-steps
    /// of any placed giant's anchor — i.e. within 4 of the giant's 7-hex
    /// footprint itself, since the footprint already reaches 1 step from the
    /// anchor. This also rules out a start position ever landing on a
    /// footprint hex outright, since that distance would be 0 or 1.
    /// </remarks>
    /// <remarks>
    /// Wildlife camps are placed before this runs (<see cref="CampGenerator"/>), and a spot
    /// within <c>GuardRange + StartPositionMargin</c> hex steps of a <em>strong</em> camp is
    /// dropped.
    /// </remarks>
    /// <remarks>
    /// Bog in reach (<c>docs/design/bog.md</c>, "Decisions"): a spot with no <em>plain</em> bog tile within
    /// <paramref name="bogReach"/> hexes is dropped, so an island without bog offers no landing spots at all. The Clay
    /// Brickworks (the start's stone) and the bog-ore works (its iron) stand on plain bog only. <c>bogReach</c> 0 turns the rule off.
    /// </remarks>
    internal static List<HexCoord> FindStartPositions(
        IReadOnlyList<HexCoord> tiles,
        Dictionary<HexCoord, Terrain> land,
        IReadOnlyList<Giant> giants,
        IReadOnlyList<Camp> camps,
        IReadOnlySet<HexCoord> plainBog,
        int bogReach)
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
            // key inside the world radius is sea; a bog lake is water too
            // (mirrors WorldModel.isLand on the client, which excludes 'lake').
            var coastal = false;
            foreach (var nearby in tile.WithinRadius(2))
            {
                if (!land.TryGetValue(nearby, out var near) || near == Terrain.Lake)
                {
                    coastal = true;
                    break;
                }
            }

            if (coastal)
            {
                continue;
            }

            var tooCloseToGiant = false;
            foreach (var giant in giants)
            {
                if (tile.DistanceTo(giant.Anchor) < GiantGenerator.StartPositionExclusionRadius + 1)
                {
                    tooCloseToGiant = true;
                    break;
                }
            }

            if (tooCloseToGiant)
            {
                continue;
            }

            // Strong camps hold a stretch of land around them: no spot within their guard
            // range plus a margin. Weak camps do not matter.
            var tooCloseToCamp = false;
            foreach (var camp in camps)
            {
                if (camp.Strong && tile.DistanceTo(camp.Coord) <= camp.GuardRange + CampGenerator.StartPositionMargin)
                {
                    tooCloseToCamp = true;
                    break;
                }
            }

            if (tooCloseToCamp)
            {
                continue;
            }

            // Bog in reach: the start's stone and iron come from plain bog.
            if (bogReach > 0 && !BogWithin(tile, plainBog, bogReach))
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

    /// <summary>Whether any hex of <paramref name="plainBog"/> lies within <paramref name="reach"/> hex steps of <paramref name="from"/>.</summary>
    private static bool BogWithin(HexCoord from, IReadOnlySet<HexCoord> plainBog, int reach)
    {
        if (plainBog.Count == 0)
        {
            return false;
        }

        foreach (var nearby in from.WithinRadius(reach))
        {
            if (plainBog.Contains(nearby))
            {
                return true;
            }
        }

        return false;
    }
}
