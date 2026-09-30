using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Wildlife camp generation rules — see <c>CampGenerator</c> and
/// <c>docs/design/wildlife-camps.md</c>: count, spacing, ground match, level roll and guard
/// range, start positions keeping away from strong camps, determinism, and wasted islands.
/// Cross-language parity is <c>CampPlacementGoldenTests</c>.
/// </summary>
public class CampGenerationTests
{
    private static readonly int[] Seeds = [1, 2, 3, 4, 5, 6, 7, 8];

    private static IEnumerable<(int Seed, TerrainSampler Sampler, GeneratedIsland Island)> Islands(bool? wasted = null)
    {
        foreach (var seed in Seeds)
        {
            var world = TestWorlds.Default(seed);
            var sampler = new TerrainSampler(world.Options);
            foreach (var island in world.Islands.Where(i => wasted is null || i.IsWasted == wasted))
            {
                yield return (seed, sampler, island);
            }
        }
    }

    private static Terrain TerrainOf(TerrainSampler sampler, GeneratedIsland island, HexCoord coord) =>
        island.IsWasted ? sampler.WastedTerrainAt(coord) : sampler.TerrainAt(coord);

    [Fact]
    public void The_family_table_has_the_nine_families_with_the_owner_decided_strengths()
    {
        var strong = CampFamilies.All.Where(f => f.Strength == CampStrength.Strong).Select(f => f.Family).Order();
        var weak = CampFamilies.All.Where(f => f.Strength == CampStrength.Weak).Select(f => f.Family).Order();

        Assert.Equal(["bearrapids", "boarwallow", "fenrirbrood", "wolfden"], strong);
        Assert.Equal(["beaverlodge", "cranedance", "eagleeyrie", "moosemire", "sealhaulout"], weak);
        Assert.All(CampFamilies.All.Where(f => f.Strength == CampStrength.Strong), f => Assert.Equal(CampLevelSkew.High, f.LevelSkew));
        Assert.All(CampFamilies.All.Where(f => f.Strength == CampStrength.Weak), f => Assert.Equal(CampLevelSkew.Low, f.LevelSkew));
    }

    [Theory]
    [InlineData(1, 1, 3)]
    [InlineData(2, 2, 4)]
    [InlineData(3, 2, 5)]
    [InlineData(4, 3, 6)]
    [InlineData(5, 3, 7)]
    public void Guard_range_follows_the_tuning_formula(int level, int weak, int strong)
    {
        Assert.Equal(weak, CampGenerator.GuardRange(level, CampStrength.Weak));
        Assert.Equal(strong, CampGenerator.GuardRange(level, CampStrength.Strong));
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(6, 0)]
    [InlineData(59, 0)]
    [InlineData(60, 1)]
    [InlineData(349, 1)]
    [InlineData(1_049, 1)]
    [InlineData(1_050, 2)]
    [InlineData(7_000, 10)]
    [InlineData(16_800, 24)]
    [InlineData(40_000, 24)]
    public void Camp_count_is_the_island_land_over_the_tiles_per_camp_clamped(int landTiles, int expected) =>
        Assert.Equal(expected, CampGenerator.CampCountFor(landTiles));

    [Fact]
    public void Camps_keep_the_minimum_spacing_and_the_count_cap()
    {
        var checkedIslands = 0;
        foreach (var (seed, _, island) in Islands())
        {
            Assert.True(island.Camps.Count <= CampGenerator.CampCountFor(island.TileCount), $"seed {seed} island {island.Index}");
            for (var i = 0; i < island.Camps.Count; i++)
            {
                for (var j = i + 1; j < island.Camps.Count; j++)
                {
                    Assert.True(
                        island.Camps[i].Coord.DistanceTo(island.Camps[j].Coord) >= CampGenerator.MinCampSpacing,
                        $"seed {seed} island {island.Index}: camps {i} and {j} are closer than {CampGenerator.MinCampSpacing}");
                }
            }

            checkedIslands++;
        }

        Assert.True(checkedIslands > 10);
    }

    [Fact]
    public void Every_camp_stands_on_the_ground_its_family_needs()
    {
        var families = new HashSet<string>();
        foreach (var (seed, sampler, island) in Islands())
        {
            var rivers = island.RiverTiles.ToDictionary(t => t.Coord);
            var giantHexes = island.Giants.SelectMany(g => Giant.Footprint(g.Anchor)).ToHashSet();
            var tiles = island.Tiles.ToHashSet();
            foreach (var camp in island.Camps)
            {
                var where = $"seed {seed} island {island.Index} camp {camp.Family} at {camp.Coord}";
                families.Add(camp.Family);
                Assert.Contains(camp.Coord, tiles);
                Assert.DoesNotContain(camp.Coord, giantHexes);
                Assert.InRange(camp.Level, 1, CampGenerator.MaxCampLevel);

                var terrain = TerrainOf(sampler, island, camp.Coord);
                if (camp.Family == CampFamilies.Bearrapids)
                {
                    Assert.False(island.IsWasted, where);
                    Assert.True(rivers.TryGetValue(camp.Coord, out var river), where);
                    Assert.Equal(RiverTileShape.Straight, river.Shape);
                    continue;
                }

                Assert.False(rivers.ContainsKey(camp.Coord), where);
                var expected = camp.Family switch
                {
                    CampFamilies.Wolfden => Terrain.Grass,
                    CampFamilies.Boarwallow => Terrain.Forest,
                    CampFamilies.Sealhaulout => Terrain.Sand,
                    CampFamilies.Eagleeyrie => Terrain.Mountain,
                    CampFamilies.Fenrirbrood => Terrain.Grass,
                    _ => throw new Xunit.Sdk.XunitException($"{where}: family is not placed yet"),
                };
                Assert.Equal(expected, terrain);
            }
        }

        // Across eight worlds every family that has ground today shows up.
        foreach (var family in new[] { "wolfden", "boarwallow", "bearrapids", "sealhaulout", "eagleeyrie", "fenrirbrood" })
        {
            Assert.Contains(family, families);
        }
    }

    [Fact]
    public void Bog_camps_are_defined_but_not_placed_yet()
    {
        var bog = new[] { CampFamilies.Moosemire, CampFamilies.Beaverlodge, CampFamilies.Cranedance };
        Assert.All(bog, f => Assert.Equal(CampGround.Bog, CampFamilies.Find(f)!.Ground));
        Assert.DoesNotContain(Islands().SelectMany(i => i.Island.Camps), c => bog.Contains(c.Family));
    }

    [Fact]
    public void A_bearrapids_camp_follows_its_river_and_every_other_camp_takes_the_tile_orientation()
    {
        foreach (var (seed, sampler, island) in Islands(wasted: false))
        {
            var rivers = island.RiverTiles.ToDictionary(t => t.Coord);
            foreach (var camp in island.Camps)
            {
                if (camp.Family == CampFamilies.Bearrapids)
                {
                    var river = rivers[camp.Coord];
                    var direction = river.InDirections.Count > 0 ? river.InDirections[0] : river.OutDirection!.Value;
                    Assert.Equal(CampGenerator.StraightOrientationOf(direction), camp.Orientation);
                }
                else
                {
                    Assert.Equal(sampler.OrientationAt(camp.Coord), camp.Orientation);
                }
            }
        }
    }

    [Fact]
    public void Start_positions_keep_away_from_strong_camps_by_guard_range_plus_margin()
    {
        var checkedSpots = 0;
        var nearWeak = 0;
        foreach (var (seed, _, island) in Islands(wasted: false))
        {
            foreach (var spot in island.StartPositions)
            {
                foreach (var camp in island.Camps)
                {
                    if (camp.Strong)
                    {
                        Assert.True(
                            spot.DistanceTo(camp.Coord) > camp.GuardRange + CampGenerator.StartPositionMargin,
                            $"seed {seed} island {island.Index}: start {spot} is inside strong camp {camp.Family} at {camp.Coord} (range {camp.GuardRange})");
                    }
                    else if (spot.DistanceTo(camp.Coord) <= camp.GuardRange + CampGenerator.StartPositionMargin)
                    {
                        nearWeak++;
                    }
                }

                checkedSpots++;
            }
        }

        Assert.True(checkedSpots > 50, "expected plenty of start positions to check");
        _ = nearWeak; // weak camps are allowed near a spot (no assertion on the count)
    }

    [Fact]
    public void Wasted_islands_only_get_fenrirbrood_on_wasteland()
    {
        var wasted = Islands(wasted: true).ToList();
        Assert.NotEmpty(wasted);
        var camps = wasted.SelectMany(w => w.Island.Camps.Select(c => (w.Sampler, w.Island, Camp: c))).ToList();
        Assert.NotEmpty(camps);
        Assert.All(camps, c =>
        {
            Assert.Equal(CampFamilies.Fenrirbrood, c.Camp.Family);
            Assert.Equal(Terrain.Grass, c.Sampler.WastedTerrainAt(c.Camp.Coord));
            Assert.True(c.Camp.Strong);
        });
    }

    [Fact]
    public void The_same_seed_produces_the_same_camps()
    {
        var options = TestWorlds.Options(3);
        var first = new WorldGenerator(options).Generate(TestContext.Current.CancellationToken);
        var second = new WorldGenerator(options).Generate(TestContext.Current.CancellationToken);

        Assert.Equal(first.Islands.Select(i => i.Camps), second.Islands.Select(i => i.Camps));
        Assert.Equal(first.Islands.Select(i => i.StartPositions), second.Islands.Select(i => i.StartPositions));
    }

    [Fact]
    public void Levels_skew_high_for_strong_camps_and_low_for_weak_ones()
    {
        var camps = Islands(wasted: false).SelectMany(i => i.Island.Camps).ToList();
        var strong = camps.Where(c => c.Strong).Select(c => c.Level).ToList();
        var weak = camps.Where(c => !c.Strong).Select(c => c.Level).ToList();

        Assert.True(strong.Count > 20 && weak.Count > 5, $"strong {strong.Count}, weak {weak.Count}");
        Assert.True(strong.Average() > weak.Average() + 0.8, $"strong {strong.Average():F2} vs weak {weak.Average():F2}");
        Assert.True(strong.Average() > 3.0);
        Assert.True(weak.Average() < 3.0);
    }

    [Fact]
    public void A_camp_can_never_stand_on_a_giant_footprint_or_a_non_straight_river_tile()
    {
        // Synthetic island: a 20 x 20 grass block, a giant at its middle, a river of every
        // shape but straight along one column - only the giant footprint and the river
        // columns must stay clear of camps even with the whole island as candidates.
        var tiles = new List<HexCoord>();
        for (var q = 0; q < 40; q++)
        {
            for (var r = 0; r < 40; r++)
            {
                tiles.Add(new HexCoord(q, r));
            }
        }

        var land = tiles.ToDictionary(t => t, _ => Terrain.Grass);
        var giantAnchor = new HexCoord(20, 20);
        var rivers = new List<RiverTile>
        {
            new(new HexCoord(5, 5), RiverTileShape.Bend, [TileOrientation.E], TileOrientation.NE),
            new(new HexCoord(6, 5), RiverTileShape.Mouth, [TileOrientation.E], null),
            new(new HexCoord(7, 5), RiverTileShape.Spring, [], TileOrientation.E),
            new(new HexCoord(8, 5), RiverTileShape.Confluence, [TileOrientation.E, TileOrientation.NE], TileOrientation.SE),
            new(new HexCoord(9, 5), RiverTileShape.Bend60, [TileOrientation.E], TileOrientation.NW),
        };

        var placed = CampGenerator.PlaceCore(tiles, land, rivers, [giantAnchor], seed(), 3);
        var blocked = Giant.Footprint(giantAnchor).Concat(rivers.Select(r => r.Coord)).ToHashSet();

        Assert.Equal(CampGenerator.CampCountFor(tiles.Count), placed.Count);
        Assert.All(placed, p => Assert.DoesNotContain(p.Coord, blocked));
        Assert.All(placed, p => Assert.Equal(CampFamilies.Wolfden, p.Family));

        static int seed() => 77;
    }

    [Fact]
    public void A_straight_river_tile_offers_bearrapids_with_the_river_orientation()
    {
        // 60 tiles (the smallest island that gets a camp), only the first three of them offer a camp.
        var tiles = Enumerable.Range(0, CampGenerator.MinCampIslandTiles).Select(q => new HexCoord(q, 0)).ToList();
        var land = tiles.Take(3).ToDictionary(t => t, _ => Terrain.Sand);
        var straight = new RiverTile(new HexCoord(1, 0), RiverTileShape.Straight, [TileOrientation.W], TileOrientation.E);

        // One camp; with the river tile the only non-sand candidate it must still
        // be reachable: the first pick is hash-best, so run several seeds and check the family
        // always matches the ground it stands on.
        for (var seed = 0; seed < 30; seed++)
        {
            var placed = CampGenerator.PlaceCore(tiles, land, [straight], [], seed, 0);
            var camp = Assert.Single(placed);
            if (camp.Coord == straight.Coord)
            {
                Assert.Equal(CampFamilies.Bearrapids, camp.Family);
                Assert.Equal(CampGenerator.StraightOrientationOf(TileOrientation.W), camp.Orientation);
            }
            else
            {
                Assert.Equal(CampFamilies.Sealhaulout, camp.Family);
                Assert.Null(camp.Orientation);
            }
        }
    }

    [Fact]
    public void Every_ground_the_island_has_gets_a_camp_before_any_ground_gets_a_second()
    {
        // 30 x 30 with four equal grounds in horizontal bands and room for many camps: the
        // first four camps take four different families.
        var tiles = new List<HexCoord>();
        var land = new Dictionary<HexCoord, Terrain>();
        for (var q = 0; q < 60; q++)
        {
            for (var r = 0; r < 60; r++)
            {
                var coord = new HexCoord(q, r);
                tiles.Add(coord);
                land[coord] = (r / 15) switch
                {
                    0 => Terrain.Grass,
                    1 => Terrain.Forest,
                    2 => Terrain.Sand,
                    _ => Terrain.Mountain,
                };
            }
        }

        var placed = CampGenerator.PlaceCore(tiles, land, [], [], 5, 2);

        Assert.Equal(CampGenerator.CampCountFor(tiles.Count), placed.Count);
        Assert.Equal(4, placed.Take(4).Select(p => p.Family).Distinct().Count());
    }

    [Fact]
    public void An_island_with_no_qualifying_tile_gets_no_camp()
    {
        var tiles = Enumerable.Range(0, CampGenerator.MinCampIslandTiles).Select(q => new HexCoord(q, 0)).ToList();
        var land = tiles.ToDictionary(t => t, _ => Terrain.Forest);

        // A wasted island whose only land is dead forest offers no wasteland.
        Assert.Empty(CampGenerator.PlaceCore(tiles, land, [], [], 1, 0, wasted: true));
    }

    [Fact]
    public void An_islet_below_the_minimum_size_gets_no_camp_and_one_at_the_minimum_gets_one()
    {
        HexCoord[] Line(int n) => [.. Enumerable.Range(0, n).Select(q => new HexCoord(q, 0))];

        var islet = Line(CampGenerator.MinCampIslandTiles - 1);
        Assert.Empty(CampGenerator.PlaceCore(islet, islet.ToDictionary(t => t, _ => Terrain.Sand), [], [], 3, 0));

        var minimum = Line(CampGenerator.MinCampIslandTiles);
        Assert.Single(CampGenerator.PlaceCore(minimum, minimum.ToDictionary(t => t, _ => Terrain.Sand), [], [], 3, 0));
    }
}
