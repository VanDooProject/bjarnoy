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
    public void Rings_are_at_their_radius_and_carry_the_ring_level()
    {
        foreach (var (_, island) in All)
        {
            var anchor = AnchorOf(island);
            foreach (var wall in island.UtgardWalls)
            {
                Assert.Equal(EndgameRules.RingRadius(wall.Ring), wall.Coord.DistanceTo(anchor));
                Assert.Equal(wall.Ring == UtgardRing.Inner ? 2 : 1, wall.Level);
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
            var giantHexes = island.Giants.SelectMany(g => Giant.Footprint(g.Anchor)).ToHashSet();
            var camps = island.Camps.Select(c => c.Coord).ToHashSet();
            var rivers = island.RiverTiles.Select(r => r.Coord).ToHashSet();
            foreach (var ring in island.UtgardWalls.Select(w => w.Ring).Distinct())
            {
                var hexes = EndgameGenerator.Ring(AnchorOf(island), EndgameRules.RingRadius(ring));
                var eligible = hexes.Count(h =>
                    sampler.WastedTerrainAt(h) is Terrain.Grass or Terrain.Forest or Terrain.Sand
                    && island.Tiles.Contains(h) && !giantHexes.Contains(h) && !camps.Contains(h) && !rivers.Contains(h));
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
        foreach (var (_, island) in All)
        {
            foreach (var ring in island.UtgardWalls.GroupBy(w => w.Ring))
            {
                var order = EndgameGenerator.Ring(AnchorOf(island), EndgameRules.RingRadius(ring.Key));
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
                Assert.True(tower.Coord.DistanceTo(anchor) > EndgameRules.OuterRingRadius + 1);
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
            (IReadOnlySet<HexCoord>)island.Camps.Select(c => c.Coord).ToHashSet());

        var a = EndgameGenerator.PlaceCore(args.Tiles, args.Item2, args.Item3, args.Item4, args.Item5, seed, island.Index);
        var b = EndgameGenerator.PlaceCore(args.Tiles, args.Item2, args.Item3, args.Item4, args.Item5, seed, island.Index);

        Assert.Equal(a.Walls, b.Walls);
        Assert.Equal(a.Towers, b.Towers);
        Assert.Equal(island.UtgardWalls, a.Walls);
        Assert.Equal(island.JotunTowers.Select(t => t.Coord), a.Towers);
    }

    [Fact]
    public void An_island_without_utgard_gets_nothing_from_the_core()
    {
        var island = TestWorlds.Default(6).Islands.First(i => !i.IsWasted);
        var land = island.Tiles.ToDictionary(t => t, _ => Terrain.Grass);

        var sites = EndgameGenerator.PlaceCore(island.Tiles, land, new HashSet<HexCoord>(), [], new HashSet<HexCoord>(), 6, island.Index);

        Assert.Empty(sites.Walls);
        Assert.Empty(sites.Towers);
    }
}
