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
    public void The_family_table_has_the_thirteen_families_with_the_owner_decided_strengths()
    {
        var strong = CampFamilies.All.Where(f => f.Strength == CampStrength.Strong).Select(f => f.Family).Order();
        var weak = CampFamilies.All.Where(f => f.Strength == CampStrength.Weak).Select(f => f.Family).Order();

        Assert.Equal(["bearrapids", "boarwallow", "eagleeyrie", "fenrirbrood", "moosemire", "walrushaulout", "wolfden"], strong);
        Assert.Equal(["beaverlodge", "cranedance", "deerglade", "harewarren", "otterslide", "sealhaulout"], weak);
        Assert.All(CampFamilies.All.Where(f => f.Strength == CampStrength.Strong), f => Assert.Equal(CampLevelSkew.Cubic, f.LevelSkew));
        Assert.All(CampFamilies.All.Where(f => f.Strength == CampStrength.Weak), f => Assert.Equal(CampLevelSkew.Quadratic, f.LevelSkew));
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
    [InlineData(0, 0, 0, 0)]
    [InlineData(59, 0, 0, 0)]
    [InlineData(60, 0, 0, 1)]
    [InlineData(224, 0, 0, 1)]
    [InlineData(300, 0, 1, 1)]
    [InlineData(900, 1, 2, 3)]
    [InlineData(4_500, 3, 8, 11)]
    [InlineData(24_000, 16, 24, 40)]
    [InlineData(40_000, 16, 24, 40)]
    public void Camp_budgets_are_the_island_land_over_the_tiles_per_camp_clamped_per_kind(int landTiles, int strong, int weak, int total)
    {
        Assert.Equal(strong, CampGenerator.StrongCountFor(landTiles));
        Assert.Equal(weak, CampGenerator.WeakCountFor(landTiles));
        Assert.Equal(total, CampGenerator.CampCountFor(landTiles));
    }

    [Theory]
    [InlineData(60, 1)]
    [InlineData(2_999, 1)]
    [InlineData(3_000, 2)]
    [InlineData(14_000, 7)]
    public void Seal_colonies_are_capped_per_island_land(int landTiles, int expected) =>
        Assert.Equal(expected, CampGenerator.MaxSealCampsFor(landTiles));

    [Theory]
    [InlineData(60, 1)]
    [InlineData(2_999, 1)]
    [InlineData(3_000, 2)]
    [InlineData(14_000, 7)]
    public void Eagle_eyries_are_capped_per_island_land(int landTiles, int expected) =>
        Assert.Equal(expected, CampGenerator.MaxEyrieCampsFor(landTiles));

    [Fact]
    public void No_island_holds_more_eagle_eyries_than_its_cap()
    {
        foreach (var (seed, _, island) in Islands())
        {
            var eyries = island.Camps.Count(c => c.Family == "eagleeyrie");
            Assert.True(eyries <= CampGenerator.MaxEyrieCampsFor(island.TileCount), $"seed {seed} island {island.Index}: {eyries} eyries");
        }
    }

    [Fact]
    public void No_island_holds_more_seal_colonies_than_its_cap()
    {
        foreach (var (seed, _, island) in Islands())
        {
            var seals = island.Camps.Count(c => c.Family == "sealhaulout");
            Assert.True(seals <= CampGenerator.MaxSealCampsFor(island.TileCount), $"seed {seed} island {island.Index}: {seals} seal colonies");
        }
    }

    [Fact]
    public void Camps_keep_the_minimum_spacing_and_the_count_cap()
    {
        var checkedIslands = 0;
        foreach (var (seed, _, island) in Islands())
        {
            Assert.True(island.Camps.Count <= CampGenerator.CampCountFor(island.TileCount), $"seed {seed} island {island.Index}");
            Assert.True(island.Camps.Count(c => c.Strong) <= Math.Max(1, CampGenerator.StrongCountFor(island.TileCount)), $"seed {seed} island {island.Index}: strong budget");
            Assert.True(island.Camps.Count(c => !c.Strong) <= Math.Max(1, CampGenerator.WeakCountFor(island.TileCount)), $"seed {seed} island {island.Index}: weak budget");
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
                if (camp.Family is CampFamilies.Bearrapids or CampFamilies.Otterslide)
                {
                    Assert.False(island.IsWasted, where);
                    Assert.True(rivers.TryGetValue(camp.Coord, out var river), where);
                    Assert.Equal(RiverTileShape.Straight, river.Shape);
                    continue;
                }

                Assert.False(rivers.ContainsKey(camp.Coord), where);
                if (camp.Family is CampFamilies.Moosemire or CampFamilies.Beaverlodge or CampFamilies.Cranedance)
                {
                    // Bog camps stand on plain bog moss only: not a lake, shore, mouth, creek or spring.
                    Assert.False(island.IsWasted, where);
                    Assert.Contains(island.BogTiles, t => t.Coord == camp.Coord && t.Kind == BogTileKind.Bog);
                    continue;
                }

                var expected = camp.Family switch
                {
                    CampFamilies.Wolfden or CampFamilies.Harewarren => Terrain.Grass,
                    CampFamilies.Boarwallow or CampFamilies.Deerglade => Terrain.Forest,
                    CampFamilies.Sealhaulout or CampFamilies.Walrushaulout => Terrain.Sand,
                    CampFamilies.Eagleeyrie => Terrain.Mountain,
                    CampFamilies.Fenrirbrood => Terrain.Grass,
                    _ => throw new Xunit.Sdk.XunitException($"{where}: family is not placed yet"),
                };
                Assert.Equal(expected, terrain);
            }
        }

        // Across eight worlds every family that has ground today shows up.
        foreach (var family in new[] { "wolfden", "harewarren", "boarwallow", "deerglade", "bearrapids", "otterslide", "sealhaulout", "walrushaulout", "eagleeyrie", "fenrirbrood" })
        {
            Assert.Contains(family, families);
        }
    }

    [Fact]
    public void Bog_camps_stand_only_on_plain_bog_moss_the_moose_strong_the_beavers_and_cranes_weak()
    {
        var bog = new[] { CampFamilies.Moosemire, CampFamilies.Beaverlodge, CampFamilies.Cranedance };
        Assert.All(bog, f => Assert.Equal(CampGround.Bog, CampFamilies.Find(f)!.Ground));
        Assert.Equal(CampStrength.Strong, CampFamilies.Find(CampFamilies.Moosemire)!.Strength);
        Assert.Equal(CampStrength.Weak, CampFamilies.Find(CampFamilies.Beaverlodge)!.Strength);
        Assert.Equal(CampStrength.Weak, CampFamilies.Find(CampFamilies.Cranedance)!.Strength);

        var placed = Islands(wasted: false).SelectMany(i => i.Island.Camps.Select(c => (i.Island, Camp: c))).Where(x => bog.Contains(x.Camp.Family)).ToList();
        Assert.True(placed.Count >= 5, $"only {placed.Count} bog camps across eight worlds");
        Assert.All(placed, x => Assert.Contains(x.Island.BogTiles, t => t.Coord == x.Camp.Coord && t.Kind == BogTileKind.Bog));
        Assert.Equal(bog.Length, placed.Select(x => x.Camp.Family).Distinct().Count());
    }

    [Fact]
    public void A_bearrapids_camp_follows_its_river_and_every_other_camp_takes_the_tile_orientation()
    {
        foreach (var (seed, sampler, island) in Islands(wasted: false))
        {
            var rivers = island.RiverTiles.ToDictionary(t => t.Coord);
            foreach (var camp in island.Camps)
            {
                if (camp.Family is CampFamilies.Bearrapids or CampFamilies.Otterslide)
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
    public void Levels_skew_low_for_every_family_and_strong_camps_sit_on_levels_one_to_three()
    {
        var camps = Islands(wasted: false).SelectMany(i => i.Island.Camps).ToList();
        var strong = camps.Where(c => c.Strong).Select(c => c.Level).ToList();
        var weak = camps.Where(c => !c.Strong).Select(c => c.Level).ToList();

        Assert.True(strong.Count > 200 && weak.Count > 100, $"strong {strong.Count}, weak {weak.Count}");
        // Expected: strong ~85% on levels 1-3 (guard 3-5), weak ~63% on levels 1-2 (guard 1-2).
        Assert.True(strong.Count(l => l <= 3) > 0.78 * strong.Count, $"strong on 1-3: {strong.Count(l => l <= 3)} of {strong.Count}");
        Assert.True(weak.Count(l => l <= 2) > 0.52 * weak.Count, $"weak on 1-2: {weak.Count(l => l <= 2)} of {weak.Count}");
        Assert.True(strong.Average() < 2.4, $"strong mean {strong.Average():F2}");
        Assert.True(weak.Average() < 2.6, $"weak mean {weak.Average():F2}");
        // Higher levels stay possible but rare.
        Assert.Contains(5, strong);
        Assert.Contains(5, weak);
        Assert.True(strong.Count(l => l >= 4) < 0.25 * strong.Count);
    }

    [Fact]
    public void The_level_roll_follows_the_documented_distribution_on_many_seeds()
    {
        // A synthetic 100 x 100 grass block over many seeds: the strong camps (wolfden) only.
        var tiles = new List<HexCoord>();
        for (var q = 0; q < 100; q++)
        {
            for (var r = 0; r < 100; r++)
            {
                tiles.Add(new HexCoord(q, r));
            }
        }

        var land = tiles.ToDictionary(t => t, _ => Terrain.Grass);
        var counts = new int[CampGenerator.MaxCampLevel + 1];
        for (var seed = 0; seed < 200; seed++)
        {
            foreach (var p in CampGenerator.PlaceCore(tiles, land, [], [], seed, 1).Where(p => p.Family == CampFamilies.Wolfden))
            {
                counts[p.Level]++;
            }
        }

        var total = counts.Sum();
        Assert.True(total > 1_000, $"total {total}");
        // Strong is u^3: P(level k) = (k/5)^(1/3) - ((k-1)/5)^(1/3) = 58.5, 15.2, 10.6, 8.5, 7.2 percent.
        double[] expected = [0.585, 0.152, 0.106, 0.085, 0.072];
        for (var level = 1; level <= CampGenerator.MaxCampLevel; level++)
        {
            Assert.InRange((double)counts[level] / total, expected[level - 1] - 0.04, expected[level - 1] + 0.04);
        }
    }

    [Fact]
    public void Weak_camps_roll_u_squared_levels_on_many_seeds()
    {
        // A synthetic 100 x 100 sand block: the weak seal colonies only (capped per island, so
        // many islands of a fixed index would repeat; vary the seed and take the pooled levels).
        var tiles = new List<HexCoord>();
        for (var q = 0; q < 100; q++)
        {
            for (var r = 0; r < 100; r++)
            {
                tiles.Add(new HexCoord(q, r));
            }
        }

        var land = tiles.ToDictionary(t => t, _ => Terrain.Sand);
        var counts = new int[CampGenerator.MaxCampLevel + 1];
        for (var seed = 0; seed < 400; seed++)
        {
            foreach (var p in CampGenerator.PlaceCore(tiles, land, [], [], seed, 1).Where(p => p.Family == CampFamilies.Sealhaulout))
            {
                counts[p.Level]++;
            }
        }

        var total = counts.Sum();
        Assert.True(total > 200, $"total {total}");
        // Weak is u^2: P(level k) = sqrt(k/5) - sqrt((k-1)/5) = 44.7, 18.5, 14.3, 11.9, 10.6 percent.
        double[] expected = [0.447, 0.185, 0.143, 0.119, 0.106];
        for (var level = 1; level <= CampGenerator.MaxCampLevel; level++)
        {
            Assert.InRange((double)counts[level] / total, expected[level - 1] - 0.07, expected[level - 1] + 0.07);
        }
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

        // All grass: wolf dens fill the strong budget, hare warrens the weak one.
        Assert.Equal(CampGenerator.CampCountFor(tiles.Count), placed.Count);
        Assert.All(placed, p => Assert.DoesNotContain(p.Coord, blocked));
        Assert.All(placed, p => Assert.Contains(p.Family, new[] { CampFamilies.Wolfden, CampFamilies.Harewarren }));

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
                Assert.Contains(camp.Family, new[] { CampFamilies.Bearrapids, CampFamilies.Otterslide });
                Assert.Equal(CampGenerator.StraightOrientationOf(TileOrientation.W), camp.Orientation);
            }
            else
            {
                Assert.Contains(camp.Family, new[] { CampFamilies.Sealhaulout, CampFamilies.Walrushaulout });
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

        // Grass and forest hold a strong and a weak camp each, so both budgets fill; the first four
        // camps take the four grounds.
        Assert.Equal(CampGenerator.CampCountFor(tiles.Count), placed.Count);
        Assert.Equal(4, placed.Take(4).Select(p => CampFamilies.Find(p.Family)!.Ground).Distinct().Count());
    }

    [Fact]
    public void Strong_and_weak_camps_fill_their_own_budgets_and_an_unused_weak_budget_is_not_turned_strong()
    {
        // 60 x 60: grass and forest (strong ground) above, sand and mountain (weak ground) below.
        var tiles = new List<HexCoord>();
        var land = new Dictionary<HexCoord, Terrain>();
        for (var q = 0; q < 60; q++)
        {
            for (var r = 0; r < 60; r++)
            {
                var coord = new HexCoord(q, r);
                tiles.Add(coord);
                land[coord] = (r / 15) switch { 0 => Terrain.Grass, 1 => Terrain.Forest, 2 => Terrain.Sand, _ => Terrain.Mountain };
            }
        }

        var placed = CampGenerator.PlaceCore(tiles, land, [], [], 11, 4);
        Assert.Equal(CampGenerator.StrongCountFor(tiles.Count), placed.Count(p => CampFamilies.IsStrong(p.Family)));
        Assert.Equal(CampGenerator.WeakCountFor(tiles.Count), placed.Count(p => !CampFamilies.IsStrong(p.Family)));
        // The sand cap counts seals and walruses together, the mountain cap eyries.
        Assert.InRange(placed.Count(p => CampFamilies.Find(p.Family)!.Ground == CampGround.Sand), 0, CampGenerator.MaxSealCampsFor(tiles.Count));
        Assert.InRange(placed.Count(p => p.Family == CampFamilies.Eagleeyrie), 0, CampGenerator.MaxEyrieCampsFor(tiles.Count));

        // An island whose only ground holds a strong camp alone (mountain): the weak budget stays
        // unfilled and is never turned into more strong camps.
        var mountain = tiles.ToDictionary(t => t, _ => Terrain.Mountain);
        var onlyStrong = CampGenerator.PlaceCore(tiles, mountain, [], [], 11, 4);
        Assert.Equal(CampGenerator.MaxEyrieCampsFor(tiles.Count), onlyStrong.Count);
        Assert.All(onlyStrong, p => Assert.True(CampFamilies.IsStrong(p.Family)));

        // And a 60-tile island whose budgets both round to zero still gets one camp, of either kind its ground holds.
        var small = Enumerable.Range(0, CampGenerator.MinCampIslandTiles).Select(q => new HexCoord(q, 0)).ToList();
        Assert.Contains(
            Assert.Single(CampGenerator.PlaceCore(small, small.ToDictionary(t => t, _ => Terrain.Sand), [], [], 3, 0)).Family,
            new[] { CampFamilies.Sealhaulout, CampFamilies.Walrushaulout });
        Assert.Contains(
            Assert.Single(CampGenerator.PlaceCore(small, small.ToDictionary(t => t, _ => Terrain.Forest), [], [], 3, 0)).Family,
            new[] { CampFamilies.Boarwallow, CampFamilies.Deerglade });
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
