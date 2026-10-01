using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Camps;

/// <summary>
/// The whale road, the first water camp (<c>docs/design/wildlife-camps.md</c>, "Water camps"): its sea placement pass
/// (<see cref="CampGenerator.PlaceWhaleRoads"/>), its family row, no guard range, food-only loot and regrowth.
/// Cross-language parity is <c>WhalePlacementGoldenTests</c>.
/// </summary>
public class WhaleRoadTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    /// <summary>A hexagonal blob of land of the given radius around <paramref name="centre"/>.</summary>
    private static List<HexCoord> Blob(HexCoord centre, int radius) => [.. centre.WithinRadius(radius).OrderBy(c => c.Q).ThenBy(c => c.R)];

    private static List<HexCoord> BigIsland(int landTiles)
    {
        var radius = 1;
        while (Blob(new HexCoord(0, 0), radius).Count < landTiles)
        {
            radius++;
        }

        return Blob(new HexCoord(0, 0), radius);
    }

    private static Camp Whale(int level = 1) => new(new HexCoord(10, 0), CampFamilies.Whaleroad, level, TileOrientation.SE);

    // ---- family row ---------------------------------------------------------------------------------------------

    [Fact]
    public void The_whale_road_is_the_last_family_a_strong_cubic_one_on_the_sea()
    {
        var last = CampFamilies.All[^1];
        Assert.Equal(CampFamilies.Whaleroad, last.Family);
        Assert.Equal(CampGround.Sea, last.Ground);
        Assert.Equal(CampStrength.Strong, last.Strength);
        Assert.Equal(CampLevelSkew.Cubic, last.LevelSkew);
        Assert.Equal(CampGround.Sea, Enum.GetValues<CampGround>().Max());
        Assert.True(CampFamilies.IsWater(CampFamilies.Whaleroad));
        Assert.False(CampFamilies.IsWater(CampFamilies.Wolfden));
        Assert.All(CampFamilies.All.Take(CampFamilies.All.Count - 1), f => Assert.NotEqual(CampGround.Sea, f.Ground));
    }

    [Fact]
    public void The_land_placement_never_places_a_whale_road()
    {
        var tiles = BigIsland(4_000);
        var land = tiles.ToDictionary(t => t, _ => Terrain.Grass);

        Assert.DoesNotContain(CampGenerator.PlaceCore(tiles, land, [], [], 5, 1), p => p.Family == CampFamilies.Whaleroad);
    }

    [Fact]
    public void A_water_camp_has_no_guard_range_and_land_camps_keep_theirs()
    {
        Assert.True(Whale().Strong);
        Assert.True(Whale().IsWater);
        Assert.All(Enumerable.Range(1, CampGenerator.MaxCampLevel), level => Assert.Equal(0, Whale(level).GuardRange));
        Assert.Equal(3, new Camp(new HexCoord(0, 0), CampFamilies.Wolfden, 1, TileOrientation.E).GuardRange);
        Assert.False(new Camp(new HexCoord(0, 0), CampFamilies.Wolfden, 1, TileOrientation.E).IsWater);
    }

    [Fact]
    public void A_water_camp_never_threatens_a_tower()
    {
        var camp = Whale();
        var tower = new CampTowerTarget(Guid.NewGuid(), camp.Coord, CampTowerKind.Standing, null);

        // Even a tower on the camp's own hex (impossible on open sea, but the rule must not depend on that).
        var attacks = CampTowerThreat.Due([(camp, CampState.Pristine(camp, T0))], _ => false, [tower], T0.AddDays(1));

        Assert.Empty(attacks);
    }

    // ---- loot and regrowth ---------------------------------------------------------------------------------------

    [Fact]
    public void The_whale_road_pays_food_only_though_it_is_strong()
    {
        var kinds = CampRules.LootKinds(CampFamilies.Whaleroad);

        Assert.Equal([new CampLootKind("food", 1)], kinds);
        // A strong camp elsewhere adds iron.
        Assert.Contains(CampRules.LootKinds(CampFamilies.Walrushaulout), k => k.Kind == "iron");

        var pool = CampRules.LootPool(Whale(), 5);
        Assert.Equal(Math.Floor(CampRules.StrongLootBase * Math.Pow(5, CampRules.LootLevelExponent)), pool.Food);
        Assert.Equal(0, pool.Wood);
        Assert.Equal(0, pool.Stone);
        Assert.Equal(0, pool.Iron);
    }

    [Fact]
    public void A_cleared_whale_road_always_regrows_even_if_a_realm_claims_its_hex()
    {
        var camp = Whale(level: 2);
        var cleared = CampState.Pristine(camp, T0).AfterFight(camp, T0, CampGarrison.Empty);
        Assert.False(cleared.IsEmptyAt(camp, T0.AddHours(2), insideRealm: true));

        var later = T0.AddHours(CampRules.RegrowStrong.TotalHours);
        Assert.Equal(CampGarrison.Full(CampStrength.Strong, 2), cleared.GarrisonAt(camp, later, insideRealm: true));
        Assert.Equal(CampGarrison.Full(CampStrength.Strong, 2), cleared.GarrisonAt(camp, later, insideRealm: false));

        // A land camp inside a realm stays empty (the rule the whale road is exempt from).
        var wolves = new Camp(new HexCoord(10, 0), CampFamilies.Wolfden, 2, TileOrientation.E);
        var clearedWolves = CampState.Pristine(wolves, T0).AfterFight(wolves, T0, CampGarrison.Empty);
        Assert.True(clearedWolves.GarrisonAt(wolves, later, insideRealm: true).IsEmpty);
    }

    // ---- count formula -------------------------------------------------------------------------------------------

    [Theory]
    [InlineData(60, 1)]
    [InlineData(1_499, 1)]
    [InlineData(4_499, 1)]
    [InlineData(4_500, 2)]
    [InlineData(7_499, 2)]
    [InlineData(7_500, 3)]
    [InlineData(24_000, 3)]
    [InlineData(100_000, 3)]
    public void The_budget_is_the_land_over_three_thousand_rounded_between_one_and_three(int landTiles, int expected) =>
        Assert.Equal(expected, CampGenerator.WhaleCountFor(landTiles));

    [Fact]
    public void An_island_under_the_camp_minimum_gets_no_whale_road()
    {
        var sixtyOne = Blob(new HexCoord(0, 0), 4);
        Assert.Equal(61, sixtyOne.Count);
        var small = sixtyOne.Take(CampGenerator.MinCampIslandTiles - 1).ToList();

        Assert.Empty(CampGenerator.PlaceWhaleRoads(small, small.ToHashSet().Contains, 1, 1));
        Assert.NotEmpty(CampGenerator.PlaceWhaleRoads(sixtyOne, sixtyOne.ToHashSet().Contains, 1, 1));
    }

    // ---- placement rules (synthetic islands) -----------------------------------------------------------------------

    [Fact]
    public void A_road_lies_six_to_ten_hexes_off_the_coast_with_no_land_within_five()
    {
        var island = BigIsland(300);
        var own = island.ToHashSet();

        for (var seed = 1; seed <= 25; seed++)
        {
            foreach (var p in CampGenerator.PlaceWhaleRoads(island, own.Contains, seed, 3))
            {
                var shore = island.Min(t => t.DistanceTo(p.Coord));
                Assert.InRange(shore, CampGenerator.WhaleMinShoreDistance, CampGenerator.WhaleMaxShoreDistance);
                Assert.Equal(CampFamilies.Whaleroad, p.Family);
                Assert.InRange(p.Level, 1, CampGenerator.MaxCampLevel);
                Assert.Null(p.Orientation);
            }
        }
    }

    [Fact]
    public void Another_islands_land_within_five_or_as_near_as_the_own_coast_rules_a_hex_out()
    {
        var island = BigIsland(300);
        var own = island.ToHashSet();

        // A neighbour blob on the island's east side, 3 hexes of sea between them: every sea hex east of the
        // island is within five of it or nearer to it than to the island's own coast.
        var maxQ = island.Max(t => t.Q);
        var neighbour = Blob(new HexCoord(maxQ + 3 + 6, 0), 6);
        var land = own.Concat(neighbour).ToHashSet();

        for (var seed = 1; seed <= 25; seed++)
        {
            foreach (var p in CampGenerator.PlaceWhaleRoads(island, land.Contains, seed, 3))
            {
                var shore = island.Min(t => t.DistanceTo(p.Coord));
                var other = neighbour.Min(t => t.DistanceTo(p.Coord));
                Assert.True(other > 5, $"seed {seed}: road {p.Coord} is {other} from the neighbour");
                Assert.True(other > shore, $"seed {seed}: road {p.Coord} is nearer the neighbour ({other}) than its own island ({shore})");
            }
        }

        // The same hex is never offered by two islands: the neighbour's own pass avoids this island's land too.
        foreach (var seed in new[] { 1, 2, 3 })
        {
            var a = CampGenerator.PlaceWhaleRoads(island, land.Contains, seed, 1).Select(p => p.Coord).ToHashSet();
            var b = CampGenerator.PlaceWhaleRoads(neighbour.Concat(Blob(new HexCoord(maxQ + 3 + 6, 0), 6)).Distinct().ToList(), land.Contains, seed, 2)
                .Select(p => p.Coord).ToHashSet();
            Assert.Empty(a.Intersect(b));
        }
    }

    [Fact]
    public void A_tie_between_two_islands_is_skipped()
    {
        // Two 91-tile blobs, 14 hexes of sea apart: the middle hexes are equally far from both, so neither island
        // may take a hex on the bisector.
        var a = Blob(new HexCoord(0, 0), 5);
        var b = Blob(new HexCoord(5 + 14 + 5 + 1 - 1, 0), 5);
        var land = a.Concat(b).ToHashSet();

        foreach (var seed in Enumerable.Range(1, 30))
        {
            foreach (var p in CampGenerator.PlaceWhaleRoads(a, land.Contains, seed, 1))
            {
                Assert.True(b.Min(t => t.DistanceTo(p.Coord)) > a.Min(t => t.DistanceTo(p.Coord)));
            }

            foreach (var p in CampGenerator.PlaceWhaleRoads(b, land.Contains, seed, 2))
            {
                Assert.True(a.Min(t => t.DistanceTo(p.Coord)) > b.Min(t => t.DistanceTo(p.Coord)));
            }
        }
    }

    [Fact]
    public void Roads_of_one_island_keep_the_spacing_and_the_budget()
    {
        var island = BigIsland(8_000);
        var own = island.ToHashSet();
        Assert.Equal(3, CampGenerator.WhaleCountFor(island.Count));

        for (var seed = 1; seed <= 5; seed++)
        {
            var roads = CampGenerator.PlaceWhaleRoads(island, own.Contains, seed, 4);
            Assert.Equal(3, roads.Count);
            for (var i = 0; i < roads.Count; i++)
            {
                for (var j = i + 1; j < roads.Count; j++)
                {
                    Assert.True(roads[i].Coord.DistanceTo(roads[j].Coord) >= CampGenerator.MinWhaleSpacing);
                }
            }
        }
    }

    [Fact]
    public void The_sea_pass_is_deterministic_and_independent_of_tile_order_and_the_land_camps()
    {
        var island = BigIsland(2_000);
        var own = island.ToHashSet();
        var shuffled = island.OrderBy(t => (t.Q * 31) ^ t.R).ToList();

        var first = CampGenerator.PlaceWhaleRoads(island, own.Contains, 7, 2);
        var again = CampGenerator.PlaceWhaleRoads(island, own.Contains, 7, 2);
        var reordered = CampGenerator.PlaceWhaleRoads(shuffled, own.Contains, 7, 2);
        var otherSeed = CampGenerator.PlaceWhaleRoads(island, own.Contains, 8, 2);

        Assert.Equal(first, again);
        Assert.Equal(first, reordered);
        Assert.NotEqual(first.Select(p => p.Coord), otherSeed.Select(p => p.Coord));

        // The land camps of the same island are unaffected by the sea pass.
        var land = island.ToDictionary(t => t, _ => Terrain.Grass);
        Assert.Equal(CampGenerator.PlaceCore(island, land, [], [], 7, 2), CampGenerator.PlaceCore(island, land, [], [], 7, 2));
    }

    // ---- real worlds -----------------------------------------------------------------------------------------------

    [Fact]
    public void Generated_worlds_put_whale_roads_off_green_islands_of_sixty_tiles_or_more_only()
    {
        var whales = 0;
        foreach (var seed in new[] { 1, 2, 3, 4 })
        {
            var world = TestWorlds.Default(seed);
            var sampler = new TerrainSampler(world.Options);
            foreach (var island in world.Islands)
            {
                var roads = island.Camps.Where(c => c.IsWater).ToList();
                if (island.IsWasted || island.TileCount < CampGenerator.MinCampIslandTiles)
                {
                    Assert.Empty(roads);
                    continue;
                }

                Assert.InRange(roads.Count, 0, CampGenerator.WhaleCountFor(island.TileCount));
                var own = island.Tiles.ToHashSet();
                foreach (var road in roads)
                {
                    whales++;
                    Assert.Equal(Terrain.Sea, sampler.TerrainAt(road.Coord));
                    Assert.Equal(Terrain.Sea, sampler.WastedTerrainAt(road.Coord));
                    var shore = island.Tiles.Min(t => t.DistanceTo(road.Coord));
                    Assert.InRange(shore, CampGenerator.WhaleMinShoreDistance, CampGenerator.WhaleMaxShoreDistance);
                    // No land of any island within the own shore distance except this island's.
                    Assert.DoesNotContain(
                        road.Coord.WithinRadius(shore),
                        h => !own.Contains(h) && (sampler.TerrainAt(h).IsLand() || sampler.WastedTerrainAt(h).IsLand()));
                }

                for (var i = 0; i < roads.Count; i++)
                {
                    for (var j = i + 1; j < roads.Count; j++)
                    {
                        Assert.True(roads[i].Coord.DistanceTo(roads[j].Coord) >= CampGenerator.MinWhaleSpacing);
                    }
                }
            }
        }

        Assert.True(whales > 5, $"only {whales} whale roads across four worlds");
    }

    [Fact]
    public void No_start_position_is_dropped_by_a_whale_road()
    {
        // The water camps sit 6+ hexes off the coast with a guard range of 0: the start-position margin
        // (range + 2) can never reach a land tile, so they never cost a spot.
        foreach (var seed in new[] { 1, 2 })
        {
            foreach (var island in TestWorlds.Default(seed).Islands.Where(i => !i.IsWasted))
            {
                foreach (var road in island.Camps.Where(c => c.IsWater))
                {
                    Assert.All(island.StartPositions, spot =>
                        Assert.True(spot.DistanceTo(road.Coord) > road.GuardRange + CampGenerator.StartPositionMargin));
                }
            }
        }
    }
}
