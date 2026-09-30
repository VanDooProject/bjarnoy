using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The bog buildings (<c>docs/design/bog.md</c> "Buildings"): the bog-ore works, the Clay Brickworks on plain bog, the Fishing
/// Hut on a lake's half shore and the Hammerschmiede on a bog creek. Where each may stand, what it produces, what boosts it.
/// </summary>
public class BogBuildingTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Origin = new(0, 0);

    private static readonly BogTileKind[] AllBogKinds = Enum.GetValues<BogTileKind>();

    /// <summary>A rich settlement with the Longhouse at <paramref name="level"/> and the given other buildings behind the centre.</summary>
    private static Settlement Rich(int level, params (BuildingType Type, int Level)[] standing)
    {
        var buildings = new List<PlacedBuilding> { new(Origin, BuildingType.Longhouse, level) };
        buildings.AddRange(standing.Select((b, i) => new PlacedBuilding(new HexCoord(-2 - i, 0), b.Type, b.Level)));
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, level)]);

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Origin,
            Buildings = buildings,
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(1_000_000), production, capacity, T0),
        };
    }

    private static BuildRejection? Try(
        Settlement settlement, BuildingType type, Terrain terrain, BogTileKind? kind, bool coastal = false)
    {
        var decision = settlement.PlanBuild(
            type, new HexCoord(1, 0), terrain, T0, Guid.CreateVersion7(), isCoastalWater: coastal, bogKindAt: kind);
        return decision.Accepted ? null : decision.Rejection;
    }

    [Theory]
    [InlineData(BuildingType.ClayBrickworks)]
    [InlineData(BuildingType.BogOreWorks)]
    public void Plain_bog_buildings_stand_on_moss_only_never_on_a_shore_creek_mouth_spring_or_lake(BuildingType type)
    {
        var definition = BuildingCatalogue.Get(type, 1);

        Assert.True(definition.AllowsHex(Terrain.Bog, false, BogTileKind.Bog));
        foreach (var kind in AllBogKinds.Where(k => k is not (BogTileKind.Bog or BogTileKind.Lake)))
        {
            Assert.False(definition.AllowsHex(Terrain.Bog, false, kind), $"{type} on {kind}");
        }

        Assert.False(definition.AllowsHex(Terrain.Lake, false, BogTileKind.Lake));
        Assert.False(definition.AllowsHex(Terrain.Bog, false, null), "an unknown bog kind is refused");
        foreach (var terrain in Enum.GetValues<Terrain>().Where(t => t != Terrain.Bog))
        {
            Assert.False(definition.AllowsHex(terrain, false, null), $"{type} on {terrain}");
        }
    }

    [Fact]
    public void Clay_brickworks_moved_from_grass_to_bog()
    {
        var definition = BuildingCatalogue.Get(BuildingType.ClayBrickworks, 1);

        Assert.Equal(new HashSet<Terrain> { Terrain.Bog }, definition.AllowedTerrain);
        Assert.False(definition.AllowsTerrain(Terrain.Grass));
        Assert.Equal(1, definition.RequiredLonghouseLevel);
    }

    [Theory]
    [InlineData(BogTileKind.Creek, true)]
    [InlineData(BogTileKind.Bog, false)]
    [InlineData(BogTileKind.Mouth, false)]
    [InlineData(BogTileKind.CreekSpring, false)]
    [InlineData(BogTileKind.Inlet, false)]
    [InlineData(BogTileKind.Shore, false)]
    [InlineData(BogTileKind.Half, false)]
    public void The_hammerschmiede_stands_on_a_bog_creek_and_nothing_else(BogTileKind kind, bool allowed)
    {
        var definition = BuildingCatalogue.Get(BuildingType.Hammerschmiede, 1);

        Assert.Equal(allowed, definition.AllowsHex(Terrain.Bog, false, kind));
        Assert.False(definition.AllowsHex(Terrain.Lake, false, BogTileKind.Lake));
        Assert.False(definition.AllowsHex(Terrain.Grass, false, null));
        Assert.False(definition.AllowsHex(Terrain.Bog, false, null));
    }

    [Theory]
    [InlineData(BogTileKind.Half, true)]
    [InlineData(BogTileKind.Shore, false)]
    [InlineData(BogTileKind.Inlet, false)]
    [InlineData(BogTileKind.Mouth, false)]
    [InlineData(BogTileKind.Bog, false)]
    [InlineData(BogTileKind.Creek, false)]
    public void The_fishing_hut_also_stands_on_a_lake_half_shore_but_on_no_other_bog_hex(BogTileKind kind, bool allowed)
    {
        var definition = BuildingCatalogue.Get(BuildingType.FishingHut, 1);

        Assert.Equal(allowed, definition.AllowsHex(Terrain.Bog, isCoastalWater: false, kind));
    }

    [Fact]
    public void The_fishing_hut_keeps_its_coastal_behaviour_and_never_stands_on_a_lake_or_on_grass()
    {
        var definition = BuildingCatalogue.Get(BuildingType.FishingHut, 1);

        Assert.True(definition.AllowsHex(Terrain.Sea, isCoastalWater: true, null));
        Assert.False(definition.AllowsHex(Terrain.Sea, isCoastalWater: false, null));
        Assert.False(definition.AllowsHex(Terrain.Grass, isCoastalWater: false, null));
        Assert.False(definition.AllowsHex(Terrain.Lake, isCoastalWater: false, BogTileKind.Lake));
        // A half shore is bog land: the terrain must really be Bog, not merely a hex someone labelled Half.
        Assert.False(definition.AllowsHex(Terrain.Grass, isCoastalWater: false, BogTileKind.Half));
    }

    [Fact]
    public void Nothing_at_any_level_stands_on_a_lake_hex()
    {
        foreach (var type in BuildingCatalogue.AllTypes)
        {
            for (var level = 1; level <= BuildingCatalogue.MaxLevelFor(type); level++)
            {
                var definition = BuildingCatalogue.Get(type, level);
                Assert.False(definition.AllowsHex(Terrain.Lake, false, BogTileKind.Lake), $"{type} {level} on a lake");
                Assert.False(definition.AllowsHex(Terrain.Lake, false, null), $"{type} {level} on a lake");
            }
        }
    }

    /// <summary>The PR3 open point: a building with an empty <c>AllowedTerrain</c> means "any land" - none may slip onto bog that way.</summary>
    [Fact]
    public void A_building_with_an_empty_allowed_terrain_set_is_water_only_and_never_stands_on_land()
    {
        foreach (var type in BuildingCatalogue.AllTypes)
        {
            var definition = BuildingCatalogue.Get(type, 1);
            if (definition.AllowedTerrain.Count > 0)
            {
                continue;
            }

            Assert.True(definition.RequiresCoastalWater, $"{type} has an empty allowed-terrain set but is not a coastal-water building");
            foreach (var terrain in Enum.GetValues<Terrain>().Where(t => t.IsLand() && t != Terrain.Bog))
            {
                Assert.False(definition.AllowsHex(terrain, false, null), $"{type} on {terrain}");
            }

            foreach (var kind in AllBogKinds.Where(k => k != BogTileKind.Half))
            {
                Assert.False(definition.AllowsHex(Terrain.Bog, false, kind), $"{type} on bog {kind}");
            }
        }
    }

    [Fact]
    public void Only_the_bog_buildings_and_the_lake_fishing_hut_stand_on_bog_ground()
    {
        var bogTypes = new HashSet<BuildingType>
        {
            BuildingType.ClayBrickworks, BuildingType.BogOreWorks, BuildingType.Hammerschmiede, BuildingType.FishingHut,
        };

        foreach (var type in BuildingCatalogue.AllTypes)
        {
            var definition = BuildingCatalogue.Get(type, 1);
            var onSomeBog = AllBogKinds.Any(kind => definition.AllowsHex(Terrain.Bog, false, kind));
            Assert.Equal(bogTypes.Contains(type), onSomeBog);
        }
    }

    [Fact]
    public void The_bog_ore_works_is_the_iron_producer_unlocking_at_longhouse_6_with_no_feeder()
    {
        for (var level = 1; level <= BuildingCatalogue.MaxLevelFor(BuildingType.BogOreWorks); level++)
        {
            var definition = BuildingCatalogue.Get(BuildingType.BogOreWorks, level);
            var production = definition.ProductionPerHour;

            Assert.Equal(0, production.Wood);
            Assert.Equal(0, production.Stone);
            Assert.Equal(0, production.Food);
            Assert.Equal(BuildingCatalogue.BogOreWorksIronAtLevelOne * Math.Pow(1.20, level - 1), production.Iron, 6);
            Assert.Equal(0, definition.Cost.Iron);
            Assert.Equal(6, definition.RequiredLonghouseLevel);
            Assert.Empty(definition.Prerequisites);
        }

        Assert.Contains(BuildingType.BogOreWorks, BuildingCatalogue.StorageCappedProducers);
    }

    [Fact]
    public void The_hammerschmiede_unlocks_at_longhouse_20_behind_a_level_10_bog_ore_works()
    {
        var one = BuildingCatalogue.Get(BuildingType.Hammerschmiede, 1);

        Assert.Equal(20, one.RequiredLonghouseLevel);
        Assert.Equal([new BuildingPrerequisite(BuildingType.BogOreWorks, 10)], one.Prerequisites);
        Assert.Equal(20, BuildingCatalogue.MaxLevelFor(BuildingType.Hammerschmiede));
    }

    [Fact]
    public void The_bog_ore_works_is_refused_below_longhouse_6_and_placed_on_plain_bog_from_6()
    {
        Assert.Equal(BuildRejection.LonghouseTooLow, Try(Rich(5), BuildingType.BogOreWorks, Terrain.Bog, BogTileKind.Bog));
        Assert.Null(Try(Rich(6), BuildingType.BogOreWorks, Terrain.Bog, BogTileKind.Bog));
        Assert.Equal(BuildRejection.TerrainNotAllowed, Try(Rich(6), BuildingType.BogOreWorks, Terrain.Bog, BogTileKind.Creek));
        Assert.Equal(BuildRejection.TerrainNotAllowed, Try(Rich(6), BuildingType.BogOreWorks, Terrain.Grass, null));
        Assert.Equal(BuildRejection.TerrainNotAllowed, Try(Rich(6), BuildingType.BogOreWorks, Terrain.Lake, BogTileKind.Lake));
    }

    [Fact]
    public void The_clay_brickworks_is_placed_on_plain_bog_and_no_longer_on_grass()
    {
        Assert.Null(Try(Rich(1), BuildingType.ClayBrickworks, Terrain.Bog, BogTileKind.Bog));
        Assert.Equal(BuildRejection.TerrainNotAllowed, Try(Rich(1), BuildingType.ClayBrickworks, Terrain.Grass, null));
        Assert.Equal(BuildRejection.TerrainNotAllowed, Try(Rich(1), BuildingType.ClayBrickworks, Terrain.Bog, BogTileKind.Shore));
        Assert.Equal(BuildRejection.TerrainNotAllowed, Try(Rich(1), BuildingType.ClayBrickworks, Terrain.Bog, BogTileKind.Creek));
    }

    [Fact]
    public void The_fishing_hut_is_placed_on_a_half_shore_from_longhouse_2()
    {
        Assert.Null(Try(Rich(2), BuildingType.FishingHut, Terrain.Bog, BogTileKind.Half));
        Assert.Equal(BuildRejection.TerrainNotAllowed, Try(Rich(2), BuildingType.FishingHut, Terrain.Bog, BogTileKind.Shore));
        Assert.Null(Try(Rich(2), BuildingType.FishingHut, Terrain.Sea, null, coastal: true));
        Assert.Equal(BuildRejection.LonghouseTooLow, Try(Rich(1), BuildingType.FishingHut, Terrain.Bog, BogTileKind.Half));
    }

    [Fact]
    public void The_hammerschmiede_needs_the_bog_ore_works_at_level_10_and_a_creek()
    {
        Assert.Equal(
            BuildRejection.RequiredBuildingTooLow,
            Try(Rich(20, (BuildingType.BogOreWorks, 9)), BuildingType.Hammerschmiede, Terrain.Bog, BogTileKind.Creek));
        Assert.Null(Try(Rich(20, (BuildingType.BogOreWorks, 10)), BuildingType.Hammerschmiede, Terrain.Bog, BogTileKind.Creek));
        Assert.Equal(
            BuildRejection.TerrainNotAllowed,
            Try(Rich(20, (BuildingType.BogOreWorks, 10)), BuildingType.Hammerschmiede, Terrain.Bog, BogTileKind.Mouth));
        Assert.Equal(
            BuildRejection.TerrainNotAllowed,
            Try(Rich(20, (BuildingType.BogOreWorks, 10)), BuildingType.Hammerschmiede, Terrain.Grass, null));
        Assert.Equal(BuildRejection.LonghouseTooLow, Try(Rich(19, (BuildingType.BogOreWorks, 10)), BuildingType.Hammerschmiede, Terrain.Bog, BogTileKind.Creek));
    }

    [Fact]
    public void The_admin_editor_follows_the_same_bog_rules()
    {
        var settlement = Rich(1);

        var onMoss = settlement.PlaceBuilding(new HexCoord(1, 0), BuildingType.BogOreWorks, 3, Terrain.Bog, false, T0, bogKindAt: BogTileKind.Bog);
        var onShore = settlement.PlaceBuilding(new HexCoord(1, 0), BuildingType.BogOreWorks, 3, Terrain.Bog, false, T0, bogKindAt: BogTileKind.Shore);
        var kindUnknown = settlement.PlaceBuilding(new HexCoord(1, 0), BuildingType.BogOreWorks, 3, Terrain.Bog, false, T0);

        Assert.True(onMoss.Accepted);
        Assert.Equal(AdminBuildingEditRejection.TerrainNotAllowed, onShore.Rejection);
        Assert.Equal(AdminBuildingEditRejection.TerrainNotAllowed, kindUnknown.Rejection);
    }

    private static Func<HexCoord, Terrain> Neighbourhood(HexCoord centre, int bog, int lake)
    {
        var overlay = new Dictionary<HexCoord, Terrain>();
        var neighbours = centre.Neighbours();
        for (var i = 0; i < neighbours.Length; i++)
        {
            overlay[neighbours[i]] = i < bog ? Terrain.Bog : i < bog + lake ? Terrain.Lake : Terrain.Grass;
        }

        return coord => overlay.TryGetValue(coord, out var terrain) ? terrain : Terrain.Grass;
    }

    [Theory]
    [InlineData(0, 0, 1.0)]
    [InlineData(2, 0, 1.2)]
    [InlineData(0, 3, 1.3)]
    [InlineData(2, 2, 1.4)]
    [InlineData(4, 2, 1.5)] // capped at +50%, like the other producers
    public void A_bog_ore_works_gains_10_percent_per_bog_creek_or_lake_neighbour_capped_at_50(int bog, int lake, double expected)
    {
        var works = new PlacedBuilding(Origin, BuildingType.BogOreWorks, 2);

        var (production, _) = BuildingCatalogue.Totals([works], Neighbourhood(Origin, bog, lake));

        var baseIron = BuildingCatalogue.Get(BuildingType.BogOreWorks, 2).ProductionPerHour.Iron;
        Assert.Equal(baseIron * expected, production.Iron, 6);
    }

    [Fact]
    public void A_lake_fishing_hut_counts_the_lake_hexes_around_it_the_way_the_coastal_hut_counts_sea()
    {
        var hut = new PlacedBuilding(Origin, BuildingType.FishingHut, 1);
        var baseFood = BuildingCatalogue.Get(BuildingType.FishingHut, 1).ProductionPerHour.Food;

        var (lake, _) = BuildingCatalogue.Totals([hut], Neighbourhood(Origin, bog: 3, lake: 3));
        var (bogOnly, _) = BuildingCatalogue.Totals([hut], Neighbourhood(Origin, bog: 3, lake: 0));
        var (sea, _) = BuildingCatalogue.Totals(
            [hut], coord => coord.DistanceTo(Origin) == 1 && coord.Q >= 0 ? Terrain.Sea : Terrain.Grass);

        Assert.Equal(baseFood * 1.30, lake.Food, 6);
        Assert.Equal(baseFood, bogOnly.Food, 6); // bog is not water
        Assert.True(sea.Food > baseFood);
    }

    [Fact]
    public void A_hammerschmiede_boosts_a_bog_ore_works_within_its_range_with_the_mills_curve_and_no_other_producer()
    {
        var mill = new PlacedBuilding(Origin, BuildingType.Hammerschmiede, 11);
        var ring2 = Origin.Neighbours()[0].Neighbours().First(c => c.DistanceTo(Origin) == 2);
        var inRange = new PlacedBuilding(ring2, BuildingType.BogOreWorks, 1);
        var beyond = new PlacedBuilding(new HexCoord(10, 10), BuildingType.BogOreWorks, 1);
        var lumberjack = new PlacedBuilding(Origin.Neighbours()[1], BuildingType.Lumberjack, 1);

        var (production, _) = BuildingCatalogue.Totals([mill, inRange, beyond, lumberjack], terrainAt: null);

        // Level 11: +55% within 3 rings (the Sawmill's / Crop Mill's percent and range curve).
        var baseIron = BuildingCatalogue.Get(BuildingType.BogOreWorks, 1).ProductionPerHour.Iron;
        Assert.Equal(baseIron * 1.55 + baseIron, production.Iron, 6);
        Assert.Equal(BuildingCatalogue.Get(BuildingType.Lumberjack, 1).ProductionPerHour.Wood, production.Wood, 6);
    }

    [Fact]
    public void The_terrain_boost_and_the_hammerschmiede_boost_multiply()
    {
        var mill = new PlacedBuilding(Origin.Neighbours()[0], BuildingType.Hammerschmiede, 20);
        var works = new PlacedBuilding(Origin, BuildingType.BogOreWorks, 1);

        var (production, _) = BuildingCatalogue.Totals([mill, works], Neighbourhood(Origin, bog: 2, lake: 0));

        var baseIron = BuildingCatalogue.Get(BuildingType.BogOreWorks, 1).ProductionPerHour.Iron;
        Assert.Equal(baseIron * 1.2 * 2.0, production.Iron, 6);
    }
}
