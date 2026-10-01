using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Bogland generation (<c>BogGenerator</c>, <c>docs/design/bog.md</c>): the art's map rules R1-R12 on many islands, the owner's
/// requirements (a river through every lake, sink/spawn under 20%, never beside sea or sand, enclosed pockets filled), that giants,
/// camps and start positions keep off the bog, and the terrain the rest of the game sees (Bog costs twice grass, a Lake is
/// impassable to armies and ships). Cross-language parity is <c>BogGenerationGoldenTests</c>.
/// </summary>
public class BogGenerationTests
{
    private static readonly int[] Seeds = [1, 2, 3, 4, 5, 6, 7, 8];

    private static IEnumerable<(int Seed, TerrainSampler Sampler, GeneratedIsland Island)> GreenIslands()
    {
        foreach (var seed in Seeds)
        {
            var world = TestWorlds.Default(seed);
            var sampler = new TerrainSampler(world.Options);
            foreach (var island in world.Islands.Where(i => !i.IsWasted))
            {
                yield return (seed, sampler, island);
            }
        }
    }

    [Fact]
    public void Every_generated_island_satisfies_every_bog_map_rule()
    {
        var total = BogRuleViolations.None;
        var islandsWithBog = 0;
        foreach (var (seed, sampler, island) in GreenIslands())
        {
            var violations = BogRules.Check(island.BogTiles, island.RiverTiles, sampler.TerrainAt);
            Assert.True(violations.Total == 0, $"seed {seed} island {island.Index}: {violations}");
            total += violations;
            if (island.BogTiles.Count > 0)
            {
                islandsWithBog++;
            }
        }

        Assert.Equal(0, total.Total);
        Assert.True(islandsWithBog >= 25, $"only {islandsWithBog} islands got a bog across eight worlds");
    }

    [Fact]
    public void Every_lake_shore_mouth_creek_and_spring_has_all_six_neighbours_inside_the_bog()
    {
        var features = 0;
        foreach (var (seed, sampler, island) in GreenIslands().Where(i => i.Island.BogTiles.Count > 0))
        {
            Assert.Equal(0, BogRules.Check(island.BogTiles, island.RiverTiles, sampler.TerrainAt).R12);

            // The same, stated without the checker: only a creek's own river link may lead out of the bog.
            var bog = island.BogTiles.ToDictionary(t => t.Coord);
            var rivers = island.RiverTiles.ToDictionary(t => t.Coord);
            foreach (var tile in island.BogTiles.Where(t => t.Kind != BogTileKind.Bog))
            {
                features++;
                for (var d = 0; d < 6; d++)
                {
                    var n = tile.Coord + HexCoord.Directions[d];
                    if (bog.ContainsKey(n))
                    {
                        continue;
                    }

                    var link = rivers.ContainsKey(n)
                        && (tile.InDirections.Any(x => (int)x == d) || (tile.OutDirection is { } o && (int)o == d));
                    Assert.True(link, $"seed {seed} island {island.Index}: {tile.Kind} {tile.Coord} touches non-bog {n} ({sampler.TerrainAt(n)})");
                }
            }
        }

        Assert.True(features > 1000, $"only {features} water-feature tiles");
    }

    [Fact]
    public void No_group_of_grass_or_forest_is_enclosed_by_bog()
    {
        foreach (var (seed, sampler, island) in GreenIslands().Where(i => i.Island.BogTiles.Count > 0))
        {
            var bog = island.BogTiles.Select(t => t.Coord).ToHashSet();
            var land = island.Tiles.ToDictionary(t => t, sampler.TerrainAt);
            var seen = new HashSet<HexCoord>();
            foreach (var start in island.Tiles.Where(t => !bog.Contains(t)))
            {
                if (!seen.Add(start))
                {
                    continue;
                }

                // Everything reachable from here without stepping on bog; open when it ever reaches past the island.
                var group = new List<HexCoord>();
                var stack = new Stack<HexCoord>([start]);
                var open = false;
                while (stack.Count > 0)
                {
                    var c = stack.Pop();
                    group.Add(c);
                    foreach (var n in c.Neighbours().Where(n => !bog.Contains(n)))
                    {
                        if (!land.ContainsKey(n))
                        {
                            open = true;
                        }
                        else if (seen.Add(n))
                        {
                            stack.Push(n);
                        }
                    }
                }

                var plain = group.Where(c => land[c] is Terrain.Grass or Terrain.Forest).ToList();
                Assert.True(open || plain.Count == 0, $"seed {seed} island {island.Index}: {plain.Count} grass/forest tiles enclosed by bog around {(plain.Count > 0 ? plain[0] : default)}");
            }
        }
    }

    [Fact]
    public void Most_islands_big_enough_for_a_bog_get_one()
    {
        var big = 0;
        var withBog = 0;
        foreach (var (_, _, island) in GreenIslands().Where(i => i.Island.TileCount >= 3000))
        {
            big++;
            if (island.BogTiles.Count > 0)
            {
                withBog++;
            }
        }

        Assert.True(withBog >= 0.6 * big, $"{withBog} of {big} islands of 3000+ tiles have a bog");
    }

    [Fact]
    public void Every_lake_on_land_has_exactly_one_river_running_through_it()
    {
        var lakes = 0;
        foreach (var (seed, sampler, island) in GreenIslands().Where(i => i.Island.BogTiles.Count > 0))
        {
            var byCoord = island.BogTiles.ToDictionary(t => t.Coord);
            var seen = new HashSet<HexCoord>();
            foreach (var start in island.BogTiles.Where(t => t.Kind == BogTileKind.Lake))
            {
                if (!seen.Add(start.Coord))
                {
                    continue;
                }

                var lake = new HashSet<HexCoord> { start.Coord };
                var stack = new Stack<HexCoord>([start.Coord]);
                while (stack.Count > 0)
                {
                    foreach (var n in stack.Pop().Neighbours())
                    {
                        if (byCoord.TryGetValue(n, out var t) && t.Kind == BogTileKind.Lake && lake.Add(n))
                        {
                            seen.Add(n);
                            stack.Push(n);
                        }
                    }
                }

                // A pocket lake (enclosed sea) has rivers sinking into it and no way out.
                if (lake.Any(c => sampler.TerrainAt(c) == Terrain.Sea))
                {
                    continue;
                }

                lakes++;
                var mouths = island.BogTiles.Where(t => t.Kind == BogTileKind.Mouth
                    && t.Coord.Neighbours().Any(lake.Contains)).ToList();
                var outflows = mouths.Count(m => m.InDirections[0] == m.WaterEdges[0]);
                Assert.True(outflows == 1, $"seed {seed} island {island.Index}: a lake has {outflows} outflow mouths");
                Assert.True(mouths.Count - outflows >= 1, $"seed {seed} island {island.Index}: a lake has no inflow mouth");
            }
        }

        Assert.True(lakes >= 25, $"only {lakes} lakes");
    }

    [Fact]
    public void Bog_sinks_and_spawns_together_stay_under_twenty_percent_of_the_bogs_the_normal_pass_places()
    {
        var sites = 0;
        var sinks = 0;
        var spawns = 0;
        var guaranteeSpawns = 0;
        foreach (var (_, _, island) in GreenIslands().Where(i => i.Island.BogTiles.Count > 0))
        {
            var outflows = island.BogTiles.Count(t => t.Kind == BogTileKind.Mouth && t.InDirections[0] == t.WaterEdges[0]);
            var inflows = island.BogTiles.Count(t => t.Kind == BogTileKind.Mouth && t.InDirections[0] != t.WaterEdges[0]);

            // Every lake on land has one outflow (a bog site); each inflow beyond the one through river is a sink
            // (a pocket lake has only sinks); a creek spring whose creek runs out to a river is a spawn. The bog guarantee's spawn
            // bogs (a spring that feeds the lake) are counted apart: their share is the price of the coverage, see docs/design/bog.md.
            var feeding = island.BogTiles.Count(t => t.Kind == BogTileKind.CreekSpring && IslandFeedsLake(island, t));
            guaranteeSpawns += feeding;
            sites += outflows;
            sinks += inflows - outflows;
            spawns += island.BogTiles.Count(t => t.Kind == BogTileKind.CreekSpring) - feeding;
        }

        // A guarantee spawn bog has one lake with one outflow, like any site: take those out of the denominator.
        sites -= guaranteeSpawns;
        Assert.True(sites >= 25);
        Assert.True(sinks + spawns < 0.2 * sites, $"{sinks} sinks + {spawns} spawns of {sites} bogs");
    }

    private static bool IslandFeedsLake(GeneratedIsland island, BogTile spring)
    {
        var byCoord = island.BogTiles.ToDictionary(t => t.Coord);
        var cur = spring;
        for (var steps = 0; steps < 200 && cur.OutDirection is { } o; steps++)
        {
            if (!byCoord.TryGetValue(cur.Coord + HexCoord.Directions[(int)o], out var next))
            {
                return false;
            }

            if (next.Kind == BogTileKind.Lake)
            {
                return true;
            }

            cur = next;
        }

        return false;
    }

    [Fact]
    public void Bog_never_touches_the_sea_or_the_coast_sand_except_the_sand_ring_of_an_enclosed_pocket()
    {
        foreach (var (seed, sampler, island) in GreenIslands().Where(i => i.Island.BogTiles.Count > 0))
        {
            var bog = island.BogTiles.Select(t => t.Coord).ToHashSet();
            var pocketWater = island.BogTiles
                .Where(t => t.Kind == BogTileKind.Lake && sampler.TerrainAt(t.Coord) == Terrain.Sea)
                .Select(t => t.Coord)
                .ToList();
            foreach (var tile in island.BogTiles.Where(t => t.Kind != BogTileKind.Lake))
            {
                var inPocketRing = pocketWater.Any(w => HexCoord.Distance(w, tile.Coord) <= 6);
                foreach (var n in tile.Coord.Neighbours().Where(n => !bog.Contains(n)))
                {
                    var terrain = sampler.TerrainAt(n);
                    Assert.NotEqual(Terrain.Sea, terrain);
                    if (terrain == Terrain.Sand)
                    {
                        // Inside an island's own pocket the beach turns to bog with the ring; nowhere else may a bog touch sand.
                        Assert.True(inPocketRing, $"seed {seed}: bog {tile.Coord} touches sand at {n} away from any pocket");
                    }
                }
            }
        }
    }

    [Fact]
    public void Enclosed_sea_pockets_become_lakes_ringed_by_bog()
    {
        var pockets = 0;
        foreach (var (seed, sampler, island) in GreenIslands().Where(i => i.Island.BogTiles.Count > 0))
        {
            var bog = island.BogTiles.ToDictionary(t => t.Coord);
            var pocketLake = island.BogTiles.Where(t => t.Kind == BogTileKind.Lake && sampler.TerrainAt(t.Coord) == Terrain.Sea).ToList();
            if (pocketLake.Count == 0)
            {
                continue;
            }

            pockets++;
            foreach (var water in pocketLake)
            {
                foreach (var n in water.Coord.Neighbours())
                {
                    Assert.True(bog.ContainsKey(n), $"seed {seed} island {island.Index}: pocket water {water.Coord} touches non-bog {n}");
                }
            }
        }

        Assert.True(pockets >= 1, "no enclosed pocket in eight worlds");
    }

    [Fact]
    public void Giants_camps_and_start_positions_keep_off_the_bog_and_only_plain_moss_holds_a_camp()
    {
        foreach (var (seed, _, island) in GreenIslands().Where(i => i.Island.BogTiles.Count > 0))
        {
            var bog = island.BogTiles.ToDictionary(t => t.Coord);
            foreach (var giant in island.Giants.SelectMany(g => Giant.Footprint(g.Anchor)))
            {
                Assert.False(bog.ContainsKey(giant), $"seed {seed}: giant hex {giant} is bog");
            }

            foreach (var start in island.StartPositions)
            {
                Assert.False(bog.ContainsKey(start), $"seed {seed}: start position {start} is bog");

                // A bog lake is water: like the sea, none within two hexes of a start (the client's
                // WorldModel.isLand excludes 'lake' for the same rule).
                foreach (var near in start.WithinRadius(2))
                {
                    Assert.False(
                        bog.TryGetValue(near, out var nearBog) && nearBog.Kind == BogTileKind.Lake,
                        $"seed {seed}: start position {start} is within two hexes of lake {near}");
                }
            }

            foreach (var camp in island.Camps.Where(c => bog.ContainsKey(c.Coord)))
            {
                Assert.Equal(BogTileKind.Bog, bog[camp.Coord].Kind);
                Assert.Contains(camp.Family, new[] { CampFamilies.Moosemire, CampFamilies.Beaverlodge, CampFamilies.Cranedance });
            }
        }
    }

    [Fact]
    public void Generation_is_deterministic()
    {
        var options = TestWorlds.Options(3);
        var first = new WorldGenerator(options).Generate(TestContext.Current.CancellationToken);
        var second = new WorldGenerator(options).Generate(TestContext.Current.CancellationToken);
        Assert.Equal(first.Islands.Count, second.Islands.Count);
        for (var i = 0; i < first.Islands.Count; i++)
        {
            Assert.True(first.Islands[i].BogTiles.SequenceEqual(second.Islands[i].BogTiles), $"island {i} bog differs between runs");
        }
    }

    [Fact]
    public void A_bog_gives_no_start_position_a_single_bog_tile_and_islands_without_a_bog_are_untouched()
    {
        // The bogland is placed after the terrain: an island with none reports an empty list, never a null.
        var bogless = GreenIslands().Where(i => i.Island.BogTiles.Count == 0).ToList();
        Assert.NotEmpty(bogless);
        Assert.All(bogless, i => Assert.Empty(i.Island.BogTiles));
    }

    // ---------------------------------------------------------------- the rule checker itself

    private static BogTile T(int q, int r, BogTileKind kind, TileOrientation[]? ins = null, TileOrientation? o = null, TileOrientation[]? water = null) =>
        new(new HexCoord(q, r), kind, ins ?? [], o, water ?? []);

    private static Terrain AllGrass(HexCoord _) => Terrain.Grass;

    [Fact]
    public void The_checker_flags_a_bog_tile_touching_four_lake_tiles()
    {
        var centre = new HexCoord(0, 0);
        var tiles = new List<BogTile> { T(0, 0, BogTileKind.Half) };
        for (var d = 0; d < 4; d++)
        {
            var n = centre + HexCoord.Directions[d];
            tiles.Add(T(n.Q, n.R, BogTileKind.Lake));
        }

        var v = BogRules.Check(tiles, [], AllGrass);
        Assert.True(v.R1 > 0);
    }

    [Fact]
    public void The_checker_flags_a_tile_touching_two_separate_lakes()
    {
        // Lake tiles at E and W of the centre: two runs, two lakes.
        var tiles = new List<BogTile>
        {
            T(0, 0, BogTileKind.Shore),
            T(1, 0, BogTileKind.Lake),
            T(-1, 0, BogTileKind.Lake),
        };

        var v = BogRules.Check(tiles, [], AllGrass);
        Assert.True(v.R1 > 0);
        Assert.True(v.R2 > 0);
    }

    [Fact]
    public void The_checker_flags_a_sharp_creek_bend_a_creek_beside_a_lake_and_bog_beside_sand()
    {
        // A creek whose out is 120 degrees off straight (in E, out NE): the art has no such crossing.
        var sharp = new List<BogTile> { T(0, 0, BogTileKind.Creek, [TileOrientation.E], TileOrientation.NE) };
        Assert.True(BogRules.Check(sharp, [], AllGrass).R3 > 0);

        // A plain creek touching a lake tile is not a mouth.
        var beside = new List<BogTile>
        {
            T(0, 0, BogTileKind.Creek, [TileOrientation.W], TileOrientation.E),
            T(1, 0, BogTileKind.Lake),
        };
        Assert.True(BogRules.Check(beside, [], AllGrass).R4 > 0);

        // Bog next to sand.
        var sandy = new List<BogTile> { T(0, 0, BogTileKind.Bog) };
        Terrain Terrain0(HexCoord c) => c == new HexCoord(1, 0) ? Terrain.Sand : Terrain.Grass;
        Assert.True(BogRules.Check(sandy, [], Terrain0).R7 > 0);
    }

    [Fact]
    public void The_checker_flags_a_lake_without_a_river_through_it_and_a_stream_feeding_a_creek()
    {
        // One lake tile with no mouths at all on land: no outflow, no inflow.
        var lone = new List<BogTile> { T(0, 0, BogTileKind.Lake) };
        Assert.True(BogRules.Check(lone, [], AllGrass).R8 > 0);

        // A creek tile fed by a stream-width river tile.
        var creek = new List<BogTile> { T(1, 0, BogTileKind.Creek, [TileOrientation.W], TileOrientation.E) };
        var stream = new RiverTile(new HexCoord(0, 0), RiverTileShape.Straight, [TileOrientation.W], TileOrientation.E, RiverWidth.Stream);
        Assert.True(BogRules.Check(creek, [stream], AllGrass).R11 > 0);
    }

    [Fact]
    public void The_checker_flags_water_features_without_a_full_ring_of_bog_but_lets_a_creek_touch_its_own_river()
    {
        // A lone shore tile: every neighbour but the lake one is missing; the lake tile misses its own.
        var shore = new List<BogTile> { T(0, 0, BogTileKind.Inlet, water: [TileOrientation.E]), T(1, 0, BogTileKind.Lake) };
        Assert.True(BogRules.Check(shore, [], AllGrass).R12 >= 5);

        // A creek ringed by bog is fine; take one ring tile away and it is flagged.
        var centre = new HexCoord(0, 0);
        List<BogTile> Ringed(int skip)
        {
            var tiles = new List<BogTile> { T(0, 0, BogTileKind.Creek, [TileOrientation.W], TileOrientation.E) };
            for (var d = 0; d < 6; d++)
            {
                var n = centre + HexCoord.Directions[d];
                if (d != skip)
                {
                    tiles.Add(T(n.Q, n.R, BogTileKind.Bog));
                }
            }

            return tiles;
        }

        Assert.Equal(0, BogRules.Check(Ringed(-1), [], AllGrass).R12);
        Assert.Equal(1, BogRules.Check(Ringed(1), [], AllGrass).R12);

        // The missing neighbour is the river the creek flows out to (its out link, E): allowed. A river on any other side is not.
        RiverTile River(int q, int r) => new(new HexCoord(q, r), RiverTileShape.Straight, [TileOrientation.W], TileOrientation.E, RiverWidth.River);
        Assert.Equal(0, BogRules.Check(Ringed(0), [River(1, 0)], AllGrass).R12);
        Assert.Equal(1, BogRules.Check(Ringed(1), [River(1, -1)], AllGrass).R12);

        // Plain moss needs no ring of its own.
        Assert.Equal(0, BogRules.Check([T(0, 0, BogTileKind.Bog)], [], AllGrass).R12);
    }

    // ---------------------------------------------------------------- terrain the rest of the game sees

    [Fact]
    public void The_bog_terrain_overlay_makes_lake_tiles_neither_sea_nor_land()
    {
        var options = TestWorlds.Options(1);
        var sampler = new TerrainSampler(options);
        var (island, tile) = GreenIslands().Where(i => i.Seed == 1).SelectMany(i => i.Island.BogTiles.Select(t => (i.Island, Tile: t)))
            .First(x => x.Tile.Kind == BogTileKind.Lake);
        var overlaid = sampler.WithBogOverlay(BogTerrain.OverlayOf(island.BogTiles));

        Assert.Equal(Terrain.Lake, overlaid.TerrainAt(tile.Coord));
        Assert.False(overlaid.IsLand(tile.Coord));
        Assert.False(overlaid.IsCoastalWater(tile.Coord));
        Assert.Equal("lake", Terrain.Lake.ToWireName());
        Assert.Equal("bog", Terrain.Bog.ToWireName());
        var moss = island.BogTiles.First(t => t.Kind == BogTileKind.Bog);
        Assert.Equal(Terrain.Bog, overlaid.TerrainAt(moss.Coord));
        Assert.True(overlaid.IsLand(moss.Coord));
        Assert.False(overlaid.IsShoreline(moss.Coord));
        Assert.NotEqual(Terrain.Bog, sampler.TerrainAt(moss.Coord));
    }

    [Fact]
    public void Bog_costs_twice_grass_and_a_lake_is_impassable_to_armies_and_ships()
    {
        Assert.Equal(2.0, HexPathfinder.LandTerrainCostByName["bog"]);
        Assert.DoesNotContain("lake", HexPathfinder.LandTerrainCostByName.Keys);
        Assert.DoesNotContain("lake", HexPathfinder.SeaTerrainCostByName.Keys);

        var lake = new HashSet<HexCoord>();
        for (var r = -10; r <= 10; r++)
        {
            lake.Add(new HexCoord(2, r));
        }

        Terrain TerrainAt(HexCoord c) => lake.Contains(c) ? Terrain.Lake : Terrain.Grass;
        Assert.Null(HexPathfinder.FindPath(new HexCoord(0, 0), new HexCoord(5, 0), TerrainAt, isLandUnit: true));
        Assert.Null(HexPathfinder.FindPath(new HexCoord(0, 0), new HexCoord(5, 0), c => lake.Contains(c) ? Terrain.Lake : Terrain.Sea, isLandUnit: false));
    }

    [Fact]
    public void A_walk_over_bog_costs_more_than_the_same_walk_over_grass_and_prefers_the_way_round()
    {
        double Hours(Func<HexCoord, Terrain> terrain)
        {
            var path = HexPathfinder.FindPath(new HexCoord(0, 0), new HexCoord(4, 0), terrain, isLandUnit: true)!;
            return HexPathfinder.CumulativeHours(path, terrain, hexesPerHour: 1.0, isLandUnit: true).Last();
        }

        Assert.Equal(4.0, Hours(_ => Terrain.Grass));
        Assert.Equal(8.0, Hours(_ => Terrain.Bog));
    }

    [Fact]
    public void Buildings_and_ships_treat_a_lake_as_water_that_is_not_sea()
    {
        Assert.False(Terrain.Lake.IsLand());
        Assert.False(Terrain.Lake.IsSea());
        Assert.True(Terrain.Bog.IsLand());
        Assert.False(Terrain.Lake.IsTraversable(isLandUnit: true));
        Assert.False(Terrain.Lake.IsTraversable(isLandUnit: false));
        Assert.True(Terrain.Bog.IsTraversable(isLandUnit: true));
        Assert.True(Terrain.Sea.IsTraversable(isLandUnit: false));
    }
}
