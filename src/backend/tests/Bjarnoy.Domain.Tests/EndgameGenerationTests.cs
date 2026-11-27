using Bjarnoy.Domain.Palisades;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Endgame map rules (<c>docs/design/endgame.md</c>): Utgard wall rings and Jötun watchtowers of a wasted island.</summary>
public class EndgameGenerationTests
{
    // Radius-1000 worlds with wasted islands that have an Utgard (found by scanning seeds 1-40): a world takes seconds to generate, so
    // the suite sticks to these. Seeds 3 and 8 have two-ring islands (3 with shore ends), 32 a one-ring island.
    private static readonly int[] Seeds = [3, 8, 20, 32, 34];

    private static IEnumerable<(int Seed, GeneratedIsland Island)> UtgardIslands() =>
        Seeds.SelectMany(seed => TestWorlds.Default(seed).Islands
            .Where(i => i.IsWasted && i.Giants.Any(g => g.Family == GiantGenerator.UtgardFamily))
            .Select(i => (seed, i)));

    private static List<(int Seed, GeneratedIsland Island)> All { get; } = [.. UtgardIslands()];

    private static HexCoord AnchorOf(GeneratedIsland island) =>
        island.Giants.First(g => g.Family == GiantGenerator.UtgardFamily).Anchor;

    [Fact]
    public void Only_wasted_islands_with_utgard_get_endgame_sites()
    {
        Assert.NotEmpty(All);
        foreach (var seed in Seeds)
        {
            foreach (var island in TestWorlds.Default(seed).Islands)
            {
                var hasUtgard = island.Giants.Any(g => g.Family == GiantGenerator.UtgardFamily);
                if (!island.IsWasted || !hasUtgard)
                {
                    Assert.Empty(island.UtgardWalls);
                    Assert.Empty(island.JotunTowers);
                }
            }
        }
    }

    [Fact]
    public void Ring_walls_stay_in_their_band_and_carry_the_ring_level()
    {
        foreach (var (_, island) in All)
        {
            var anchor = AnchorOf(island);
            foreach (var wall in island.UtgardWalls)
            {
                var (min, max) = EndgameRules.RingBand(wall.Ring);
                Assert.InRange(wall.Coord.DistanceTo(anchor), min, max);
                Assert.Equal(wall.Ring == UtgardRing.Inner ? 2 : 1, wall.Level);
            }
        }
    }

    [Fact]
    public void Inner_and_outer_walls_never_touch_and_no_wall_branches()
    {
        foreach (var (_, island) in All)
        {
            var inner = island.UtgardWalls.Where(w => w.Ring == UtgardRing.Inner).Select(w => w.Coord).ToList();
            var outer = island.UtgardWalls.Where(w => w.Ring == UtgardRing.Outer).Select(w => w.Coord).ToList();
            Assert.DoesNotContain(outer, o => inner.Any(i => i.DistanceTo(o) <= 1));

            foreach (var ring in new[] { inner, outer })
            {
                var set = ring.ToHashSet();
                Assert.All(ring, h => Assert.InRange(PalisadeRules.WallNeighbourCount(h, set), 0, 2));
            }
        }
    }

    [Fact]
    public void Islands_get_zero_one_or_two_rings_and_both_counts_occur()
    {
        var ringCounts = All.Select(x => x.Island.UtgardWalls.Select(w => w.Ring).Distinct().Count()).ToList();
        Assert.All(ringCounts, c => Assert.InRange(c, 0, 2));
        Assert.Contains(2, ringCounts);
        Assert.Contains(1, ringCounts);
    }

    [Fact]
    public void A_built_ring_had_at_least_the_minimum_land_share()
    {
        foreach (var (seed, island) in All)
        {
            var sampler = new TerrainSampler(TestWorlds.Options(seed));
            var land = island.Tiles.ToDictionary(t => t, sampler.WastedTerrainAt);
            var giantHexes = island.Giants.SelectMany(g => Giant.Footprint(g.Anchor)).ToHashSet();
            var rivers = island.RiverTiles.Select(r => r.Coord).ToHashSet();
            var loops = Loops(AnchorOf(island), land, rivers, giantHexes, seed + (island.Index * 400_009));
            foreach (var ring in island.UtgardWalls.Select(w => w.Ring).Distinct())
            {
                var hexes = loops[ring];
                var eligible = hexes.Count(h =>
                    land.TryGetValue(h, out var t) && t is Terrain.Grass or Terrain.Forest or Terrain.Sand
                    && !giantHexes.Contains(h) && !rivers.Contains(h));
                Assert.True(eligible >= EndgameRules.MinRingLandShare * hexes.Count, $"seed {seed} island {island.Index} ring {ring}");
            }
        }
    }

    [Fact]
    public void Walls_never_stand_on_mountain_river_camp_or_giant_hexes()
    {
        foreach (var (seed, island) in All)
        {
            var sampler = new TerrainSampler(TestWorlds.Options(seed));
            var giantHexes = island.Giants.SelectMany(g => Giant.Footprint(g.Anchor)).ToHashSet();
            var camps = island.Camps.Select(c => c.Coord).ToHashSet();
            var rivers = island.RiverTiles.Select(r => r.Coord).ToHashSet();
            foreach (var wall in island.UtgardWalls)
            {
                Assert.DoesNotContain(wall.Coord, giantHexes);
                Assert.DoesNotContain(wall.Coord, camps);
                Assert.DoesNotContain(wall.Coord, rivers);
                Assert.NotEqual(Terrain.Mountain, sampler.WastedTerrainAt(wall.Coord));
            }
        }
    }

    [Fact]
    public void Every_piece_is_what_the_palisade_rules_resolve_for_the_final_wall()
    {
        foreach (var (seed, island) in All.Where(x => x.Island.UtgardWalls.Count > 0))
        {
            var sampler = new TerrainSampler(TestWorlds.Options(seed));
            var set = new WallSet(
                island.UtgardWalls.Select(w => w.Coord).ToHashSet(),
                island.UtgardWalls.Where(w => w.IsGate).Select(w => w.Coord).ToHashSet());
            foreach (var wall in island.UtgardWalls)
            {
                var tile = PalisadeRules.TileOfWallHex(wall.Coord, set, sampler.WastedTerrainAt).Tile;
                Assert.NotNull(tile);
                Assert.Equal(tile!.Piece, wall.Piece);
                Assert.Equal(tile.Dir, wall.Dir);
            }
        }
    }

    [Fact]
    public void Shore_ends_are_sea_hexes_on_the_ring_with_one_wall_neighbour()
    {
        var shoreEnds = 0;
        foreach (var (_, island) in All)
        {
            var walls = island.UtgardWalls.Select(w => w.Coord).ToHashSet();
            foreach (var wall in island.UtgardWalls.Where(w => w.Piece == PalisadePiece.EndCoast))
            {
                shoreEnds++;
                Assert.DoesNotContain(wall.Coord, island.Tiles);
                Assert.Equal(1, PalisadeRules.WallNeighbourCount(wall.Coord, walls));
                Assert.False(wall.IsGate);
            }
        }

        Assert.True(shoreEnds > 0, "no ring reaches the sea");
    }

    [Fact]
    public void Gates_stand_only_on_straights_at_most_two_per_ring_and_both_occur()
    {
        var anyTwo = false;
        foreach (var (_, island) in All)
        {
            foreach (var ring in island.UtgardWalls.GroupBy(w => w.Ring))
            {
                var gates = ring.Where(w => w.IsGate).ToList();
                Assert.InRange(gates.Count, 0, EndgameRules.GatesPerRing);
                Assert.All(gates, g => Assert.Equal(PalisadePiece.Gate180, g.Piece));
                Assert.DoesNotContain(ring, w => !w.IsGate && w.Piece == PalisadePiece.Gate180);
                anyTwo |= gates.Count == 2;
            }
        }

        Assert.True(anyTwo);
    }

    [Fact]
    public void Gates_are_as_far_apart_along_the_ring_as_the_straights_allow()
    {
        foreach (var (seed, island) in All)
        {
            var sampler = new TerrainSampler(TestWorlds.Options(seed));
            var land = island.Tiles.ToDictionary(t => t, sampler.WastedTerrainAt);
            var loops = Loops(
                AnchorOf(island),
                land,
                island.RiverTiles.Select(r => r.Coord).ToHashSet(),
                island.Giants.SelectMany(g => Giant.Footprint(g.Anchor)).ToHashSet(),
                seed + (island.Index * 400_009));
            foreach (var ring in island.UtgardWalls.GroupBy(w => w.Ring))
            {
                var order = loops[ring.Key];
                var n = order.Count;
                var index = ring.Select(w => (Wall: w, Index: order.IndexOf(w.Coord))).ToList();
                var gates = index.Where(x => x.Wall.IsGate).ToList();
                if (gates.Count < 2)
                {
                    continue;
                }

                int Cyclic(int a, int b) => Math.Min(Math.Abs(a - b), n - Math.Abs(a - b));
                var chosen = Cyclic(gates[0].Index, gates[1].Index);
                var straights = index.Where(x => x.Wall.IsGate || x.Wall.Piece == PalisadePiece.Straight180).ToList();
                var best = straights.SelectMany(a => straights.Where(b => b.Index > a.Index).Select(b => Cyclic(a.Index, b.Index))).Max();
                Assert.Equal(best, chosen);
            }
        }
    }

    [Fact]
    public void Tower_count_is_the_clamped_rounded_land_share()
    {
        Assert.Equal(3, EndgameRules.TowerCountFor(150));
        Assert.Equal(3, EndgameRules.TowerCountFor(419));
        Assert.Equal(4, EndgameRules.TowerCountFor(420)); // 3.5 rounds up, not to even
        Assert.Equal(5, EndgameRules.TowerCountFor(540)); // 4.5 rounds up
        Assert.Equal(6, EndgameRules.TowerCountFor(660));
        Assert.Equal(6, EndgameRules.TowerCountFor(5000));

        foreach (var (_, island) in All)
        {
            Assert.True(island.JotunTowers.Count <= EndgameRules.TowerCountFor(island.TileCount));
        }
    }

    [Fact]
    public void Towers_stand_on_free_buildable_land_away_from_utgard_and_each_other()
    {
        foreach (var (seed, island) in All)
        {
            var sampler = new TerrainSampler(TestWorlds.Options(seed));
            var anchor = AnchorOf(island);
            var giantHexes = island.Giants.SelectMany(g => Giant.Footprint(g.Anchor)).ToHashSet();
            var camps = island.Camps.Select(c => c.Coord).ToHashSet();
            var rivers = island.RiverTiles.Select(r => r.Coord).ToHashSet();
            var walls = island.UtgardWalls.Select(w => w.Coord).ToHashSet();
            var towers = island.JotunTowers;

            foreach (var tower in towers)
            {
                Assert.Contains(tower.Coord, island.Tiles);
                Assert.True(sampler.WastedTerrainAt(tower.Coord) is Terrain.Grass or Terrain.Forest);
                Assert.DoesNotContain(tower.Coord, giantHexes);
                Assert.DoesNotContain(tower.Coord, camps);
                Assert.DoesNotContain(tower.Coord, rivers);
                Assert.DoesNotContain(tower.Coord, walls);
                Assert.True(tower.Coord.DistanceTo(anchor) > EndgameRules.RingBand(UtgardRing.Inner).Max + 1);
                Assert.DoesNotContain(tower.Coord.Neighbours(), walls.Contains);
                Assert.Equal(sampler.OrientationAt(tower.Coord), tower.Orientation);
            }

            for (var a = 0; a < towers.Count; a++)
            {
                for (var b = a + 1; b < towers.Count; b++)
                {
                    Assert.True(towers[a].Coord.DistanceTo(towers[b].Coord) >= EndgameRules.MinTowerSpacing);
                }
            }
        }
    }

    [Fact]
    public void Placement_is_deterministic()
    {
        var (seed, island) = All.OrderByDescending(x => x.Island.UtgardWalls.Count).First();
        var sampler = new TerrainSampler(TestWorlds.Options(seed));
        var land = island.Tiles.ToDictionary(t => t, sampler.WastedTerrainAt);
        var args = (
            island.Tiles,
            (IReadOnlyDictionary<HexCoord, Terrain>)land,
            (IReadOnlySet<HexCoord>)island.RiverTiles.Select(r => r.Coord).ToHashSet(),
            (IReadOnlyList<GiantGenerator.Placement>)[.. island.Giants.Select(g => new GiantGenerator.Placement(g.Anchor, g.Family))],
            (IReadOnlySet<HexCoord>)island.Camps.Where(c => c.Family != CampFamilies.Naglfar).Select(c => c.Coord).ToHashSet());
        bool IsLand(HexCoord c) => sampler.TerrainAt(c).IsLand() || sampler.WastedTerrainAt(c).IsLand();

        var a = EndgameGenerator.PlaceCore(args.Tiles, args.Item2, args.Item3, args.Item4, args.Item5, IsLand, seed, island.Index);
        var b = EndgameGenerator.PlaceCore(args.Tiles, args.Item2, args.Item3, args.Item4, args.Item5, IsLand, seed, island.Index);

        Assert.Equal(a.Walls, b.Walls);
        Assert.Equal(a.Towers, b.Towers);
        Assert.Equal(island.UtgardWalls, a.Walls);
        Assert.Equal(island.JotunTowers.Select(t => t.Coord), a.Towers);
        Assert.Equal(a.Naglfar, b.Naglfar);
        Assert.Equal(
            island.Camps.Where(c => c.Family == CampFamilies.Naglfar).Select(c => (HexCoord?)c.Coord).FirstOrDefault(),
            a.Naglfar);
    }

    [Fact]
    public void An_island_without_utgard_gets_nothing_from_the_core()
    {
        var island = TestWorlds.Default(6).Islands.First(i => !i.IsWasted);
        var land = island.Tiles.ToDictionary(t => t, _ => Terrain.Grass);

        var sites = EndgameGenerator.PlaceCore(island.Tiles, land, new HashSet<HexCoord>(), [], new HashSet<HexCoord>(), _ => false, 6, island.Index);

        Assert.Empty(sites.Walls);
        Assert.Empty(sites.Towers);
    }


    // ---- Naglfar ---------------------------------------------------------------------------------------------------------------

    private static Func<HexCoord, bool> LandOf(IReadOnlyDictionary<HexCoord, Terrain> land, params HexCoord[] foreign) =>
        c => (land.TryGetValue(c, out var t) && t != Terrain.Sea) || foreign.Contains(c);

    private static HexCoord? NaglfarOf(IReadOnlyDictionary<HexCoord, Terrain> land, Func<HexCoord, bool> isLand, IReadOnlySet<HexCoord>? rivers = null)
    {
        var tiles = land.Where(kv => kv.Value != Terrain.Sea).Select(kv => kv.Key).ToList();
        return EndgameGenerator.PlaceCore(
            tiles, land, rivers ?? new HashSet<HexCoord>(), [new GiantGenerator.Placement(Origin, GiantGenerator.UtgardFamily)],
            new HashSet<HexCoord>(), isLand, 11, 0).Naglfar;
    }

    [Fact]
    public void Naglfar_anchors_three_hexes_off_a_round_island_at_the_lowest_q_then_r()
    {
        var land = Disc(10);

        // Closest to Utgard = the nearest ring that leaves the footprint 2 hexes off the coast (anchor 13 from the origin); of its hexes
        // the lowest q, then the lowest r.
        Assert.Equal(new HexCoord(-13, 0), NaglfarOf(land, LandOf(land)));
    }

    [Fact]
    public void Naglfars_footprint_is_open_sea_two_to_four_hexes_off_the_coast()
    {
        foreach (var radius in new[] { 4, 7, 10 })
        {
            var land = Disc(radius);
            var anchor = NaglfarOf(land, LandOf(land));

            Assert.NotNull(anchor);
            var footprint = Giant.Footprint(anchor.Value);
            Assert.Equal(7, footprint.Count);
            Assert.All(footprint, h => Assert.True(h.DistanceTo(Origin) > radius, "a footprint hex stands on land"));
            // Distance to the nearest land hex of a disc is the distance to the centre minus its radius.
            var nearest = footprint.Min(h => h.DistanceTo(Origin) - radius);
            Assert.InRange(nearest, EndgameRules.NaglfarMinCoastDistance, EndgameRules.NaglfarMaxCoastDistance);
        }
    }

    [Fact]
    public void Another_islands_land_in_the_footprint_moves_naglfar_and_land_everywhere_leaves_none()
    {
        var land = Disc(10);
        var free = NaglfarOf(land, LandOf(land))!.Value;

        // Land beside the free anchor spoils its footprint, so another one is chosen.
        var blocked = NaglfarOf(land, LandOf(land, free + HexCoord.Directions[0]));
        Assert.NotNull(blocked);
        Assert.NotEqual(free, blocked);
        Assert.DoesNotContain(free + HexCoord.Directions[0], Giant.Footprint(blocked.Value));

        // No open sea within reach: no Naglfar.
        Assert.Null(NaglfarOf(land, c => c.DistanceTo(Origin) <= 40));
    }

    [Fact]
    public void Enclosed_water_never_holds_naglfar()
    {
        // An O-shaped island: a ring of land with a big lake inside (the lake is 3+ hexes from the coast on the inside, as the outer sea is).
        var land = Disc(14);
        foreach (var hex in Origin.WithinRadius(8))
        {
            land[hex] = Terrain.Sea; // the lake, enclosed by a land ring of width 6
        }

        land[Origin] = Terrain.Grass; // Utgard on a speck of land in the middle keeps the lake an island's own water
        foreach (var n in Origin.Neighbours())
        {
            land[n] = Terrain.Grass;
        }

        var anchor = NaglfarOf(land, LandOf(land));

        Assert.NotNull(anchor);
        Assert.True(anchor.Value.DistanceTo(Origin) > 14, "Naglfar anchored in the lake");
    }

    [Fact]
    public void Every_generated_wasted_island_with_utgard_stores_at_most_one_naglfar_camp_on_open_sea_off_its_coast()
    {
        var anyNaglfar = false;
        foreach (var (seed, island) in All)
        {
            var sampler = new TerrainSampler(TestWorlds.Options(seed));
            var ships = island.Camps.Where(c => c.Family == CampFamilies.Naglfar).ToList();
            Assert.True(ships.Count <= 1);
            if (ships.Count == 0)
            {
                continue;
            }

            anyNaglfar = true;
            var ship = ships[0];
            Assert.Equal(1, ship.Level);
            Assert.All(Giant.Footprint(ship.Coord), h => Assert.False(sampler.TerrainAt(h).IsLand() || sampler.WastedTerrainAt(h).IsLand()));
            var coast = Giant.Footprint(ship.Coord).Min(h => island.Tiles.Min(t => t.DistanceTo(h)));
            Assert.InRange(coast, EndgameRules.NaglfarMinCoastDistance, EndgameRules.NaglfarMaxCoastDistance);
        }

        Assert.True(anyNaglfar, "none of the sampled islands got a Naglfar");

        // Green islands and wasted islands without Utgard have none.
        foreach (var seed in Seeds)
        {
            foreach (var island in TestWorlds.Default(seed).Islands.Where(i => !i.IsWasted || !i.Giants.Any(g => g.Family == GiantGenerator.UtgardFamily)))
            {
                Assert.DoesNotContain(island.Camps, c => c.Family == CampFamilies.Naglfar);
            }
        }
    }

    /// <summary>The two ring loops exactly as <c>PlaceWalls</c> computes them (the outer one keeps clear of the inner one).</summary>
    private static Dictionary<UtgardRing, List<HexCoord>> Loops(
        HexCoord anchor, IReadOnlyDictionary<HexCoord, Terrain> land, IReadOnlySet<HexCoord> rivers, IReadOnlySet<HexCoord> giantHexes, int seed)
    {
        var inner = EndgameGenerator.NaturalLoop(anchor, UtgardRing.Inner, land, rivers, giantHexes, seed, new HashSet<HexCoord>());
        var near = inner.SelectMany(h => h.Neighbours().Append(h)).ToHashSet();
        var outer = EndgameGenerator.NaturalLoop(anchor, UtgardRing.Outer, land, rivers, giantHexes, seed, near);
        return new() { [UtgardRing.Inner] = inner, [UtgardRing.Outer] = outer };
    }

    private static readonly HexCoord Origin = new(0, 0);

    private static Dictionary<HexCoord, Terrain> Disc(int radius, Terrain terrain = Terrain.Grass) =>
        Origin.WithinRadius(radius).ToDictionary(h => h, _ => terrain);

    private static EndgameGenerator.Sites Place(IReadOnlyDictionary<HexCoord, Terrain> land, int seed = 11, IReadOnlySet<HexCoord>? rivers = null, int islandIndex = 0)
    {
        var tiles = land.Where(kv => kv.Value != Terrain.Sea).Select(kv => kv.Key).ToList();
        return EndgameGenerator.PlaceCore(
            tiles, land, rivers ?? new HashSet<HexCoord>(), [new GiantGenerator.Placement(Origin, GiantGenerator.UtgardFamily)],
            new HashSet<HexCoord>(), c => land.TryGetValue(c, out var t) && t != Terrain.Sea, seed, islandIndex);
    }

    /// <summary>True when the hexes form one simple cycle: each adjacent to the next (cyclically), no two others adjacent or equal.</summary>
    private static bool IsSimpleCycle(IReadOnlyList<HexCoord> c)
    {
        var n = c.Count;
        for (var i = 0; i < n; i++)
        {
            for (var j = i + 1; j < n; j++)
            {
                var consecutive = j == i + 1 || (i == 0 && j == n - 1);
                var d = c[i].DistanceTo(c[j]);
                if (consecutive ? d != 1 : d <= 1)
                {
                    return false;
                }
            }
        }

        return true;
    }

    [Fact]
    public void On_open_flat_ground_both_rings_close_with_two_gates_and_stay_apart()
    {
        foreach (var seed in new[] { 1, 11, 23 })
        {
            var land = Disc(16);
            var sites = Place(land, seed);
            var loops = Loops(Origin, land, new HashSet<HexCoord>(), Giant.Footprint(Origin).ToHashSet(), seed);
            foreach (var ring in new[] { UtgardRing.Inner, UtgardRing.Outer })
            {
                var walls = sites.Walls.Where(w => w.Ring == ring).ToList();
                var loop = loops[ring];
                Assert.True(IsSimpleCycle(loop), $"{ring} loop is a simple cycle");
                Assert.Equal(loop.Count, walls.Count);
                Assert.Equal(loop.ToHashSet(), walls.Select(w => w.Coord).ToHashSet());
                Assert.Equal(2, walls.Count(w => w.IsGate));
                Assert.DoesNotContain(walls, w => w.Piece is PalisadePiece.End or PalisadePiece.EndCoast);
            }

            var inner = sites.Walls.Where(w => w.Ring == UtgardRing.Inner).Select(w => w.Coord).ToList();
            Assert.DoesNotContain(sites.Walls.Where(w => w.Ring == UtgardRing.Outer), o => inner.Any(i => i.DistanceTo(o.Coord) <= 1));
        }
    }

    [Fact]
    public void A_mountain_cluster_in_the_band_is_part_of_the_line_and_gets_no_walls()
    {
        var plain = Disc(16);
        var baseline = EndgameGenerator.NaturalLoop(
            Origin, UtgardRing.Inner, plain, new HashSet<HexCoord>(), Giant.Footprint(Origin).ToHashSet(), 11, new HashSet<HexCoord>());
        var centre = baseline[baseline.Count / 3];

        var land = Disc(16);
        var cluster = centre.WithinRadius(1).ToHashSet();
        foreach (var h in cluster)
        {
            land[h] = Terrain.Mountain;
        }

        var loop = EndgameGenerator.NaturalLoop(
            Origin, UtgardRing.Inner, land, new HashSet<HexCoord>(), Giant.Footprint(Origin).ToHashSet(), 11, new HashSet<HexCoord>());
        Assert.True(loop.Count(cluster.Contains) >= 3, "the line runs through the mountains");

        var sites = Place(land);
        Assert.DoesNotContain(sites.Walls, w => land[w.Coord] == Terrain.Mountain);
        Assert.Contains(sites.Walls, w => w.Ring == UtgardRing.Inner);
    }

    [Fact]
    public void A_small_island_whose_band_is_mostly_sea_still_gets_its_ring_along_the_coast()
    {
        var land = Disc(5);
        var sites = Place(land);

        var inner = sites.Walls.Where(w => w.Ring == UtgardRing.Inner).ToList();
        Assert.NotEmpty(inner);
        Assert.All(inner, w => Assert.True(land.ContainsKey(w.Coord) || w.Piece == PalisadePiece.EndCoast));
        Assert.True(inner.Count(w => land.ContainsKey(w.Coord)) >= 12);
        Assert.DoesNotContain(sites.Walls, w => w.Ring == UtgardRing.Outer);
    }

    [Fact]
    public void Towers_keep_outside_the_inner_band_and_off_the_walls()
    {
        var sites = Place(Disc(24));
        var walls = sites.Walls.Select(w => w.Coord).ToHashSet();
        Assert.NotEmpty(sites.Towers);
        Assert.All(sites.Towers, t =>
        {
            Assert.True(t.DistanceTo(Origin) > EndgameRules.RingBand(UtgardRing.Inner).Max + 1);
            Assert.DoesNotContain(t, walls);
            Assert.DoesNotContain(t.Neighbours(), walls.Contains);
        });
    }

    [Fact]
    public void A_tower_may_stand_between_the_two_wall_lines_on_a_small_island()
    {
        // A disc and seeds where the sampling happens to pick one tower inside the outer line (found by scanning; nothing forces it).
        var sites = Place(Disc(12), seed: 32, islandIndex: 4);
        var nearestOuterWall = sites.Walls.Where(w => w.Ring == UtgardRing.Outer).Min(w => w.Coord.DistanceTo(Origin));
        Assert.Contains(sites.Towers, t => t.DistanceTo(Origin) < nearestOuterWall);
    }

    [Fact]
    public void The_first_tower_stands_between_the_lines_when_there_is_room_and_outside_when_there_is_none()
    {
        var withRoom = Place(Disc(24), seed: 5, islandIndex: 8);
        // On open ground the outer line is all wall, so its wall hexes alone fence in the ground between the lines.
        var outerWalls = withRoom.Walls.Where(w => w.Ring == UtgardRing.Outer).Select(w => w.Coord).ToList();
        Assert.Contains(withRoom.Towers[0], EndgameGenerator.InsideLoop(Origin, outerWalls));

        // Sand carries no tower: with the band between the lines made of it, the first tower goes by the plain rule.
        var land = Disc(24);
        foreach (var hex in land.Keys.Where(h => h.DistanceTo(Origin) <= EndgameRules.RingBand(UtgardRing.Outer).Max).ToList())
        {
            land[hex] = Terrain.Sand;
        }

        var noRoom = Place(land, seed: 5, islandIndex: 8);
        Assert.NotEmpty(noRoom.Towers);
        Assert.All(noRoom.Towers, t => Assert.True(t.DistanceTo(Origin) > EndgameRules.RingBand(UtgardRing.Outer).Max));
    }

    private static HexCoord H(int q, int r) => new(q, r);

    [Fact]
    public void WithoutChords_leaves_a_simple_cycle_untouched()
    {
        var ring = EndgameGenerator.Ring(Origin, 3);
        Assert.Equal(ring, EndgameGenerator.WithoutChords(ring));
    }

    [Fact]
    public void WithoutChords_cuts_a_bump_that_touches_the_line_again()
    {
        var ring = EndgameGenerator.Ring(Origin, 3);
        // Two extra hexes outside the ring between hexes 4 and 5; the first is adjacent to both, so it is a chord.
        var outward = ring[4].Neighbours().Where(h => h.DistanceTo(Origin) == 4 && h.DistanceTo(ring[5]) == 1).ToList();
        Assert.NotEmpty(outward);
        List<HexCoord> bumped = [.. ring.Take(5), outward[0], .. ring.Skip(5)];

        var result = EndgameGenerator.WithoutChords(bumped);

        Assert.True(IsSimpleCycle(result));
        Assert.True(result.Count < bumped.Count);
        Assert.All(result, h => Assert.Contains(h, bumped));
    }

    [Fact]
    public void WithoutChords_removes_a_spur_that_walks_out_and_back()
    {
        var ring = EndgameGenerator.Ring(Origin, 3);
        var spur = ring[5].Neighbours().First(h => h.DistanceTo(Origin) == 4);
        List<HexCoord> cycle = [.. ring.Take(6), spur, ring[5], .. ring.Skip(6)];

        var result = EndgameGenerator.WithoutChords(cycle);

        Assert.True(IsSimpleCycle(result));
        Assert.Equal(ring.Count, result.Count);
        Assert.Equal(ring.ToHashSet(), result.ToHashSet());
    }
}
