using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The design invariants of <c>docs/design/economy.md</c>: the curves, the
/// unlock ladder and the shape of the tech tree that the numbers were tuned
/// against. A change that breaks one of these needs the design (and the
/// economy lab) revisited, not just the test edited.
/// </summary>
public class EconomyDesignTests
{
    private static readonly (BuildingType Type, int Unlock)[] Ladder =
    [
        (BuildingType.Lumberjack, 1), (BuildingType.Quarry, 1), (BuildingType.ClayBrickworks, 1),
        (BuildingType.StorageHouse, 1), (BuildingType.Farm, 1),
        (BuildingType.FishingHut, 2), (BuildingType.FisherHut, 2),
        (BuildingType.Tower, 3),
        (BuildingType.PumpkinFarm, 4),
        (BuildingType.Barracks, 5),
        (BuildingType.TownSquare, 6),
        (BuildingType.Dockyard, 8),
        (BuildingType.ArcheryRange, 9),
        (BuildingType.CartWorkshop, 10),
        (BuildingType.Meadery, 11),
        (BuildingType.DruidHut, 12),
        (BuildingType.Smithy, 15), (BuildingType.GreatStorehouse, 15),
        (BuildingType.Sawmill, 20), (BuildingType.CropMill, 20),
        (BuildingType.ShrineOfUllr, 25), (BuildingType.ShrineOfFreyja, 25),
        (BuildingType.ShrineOfNjord, 25), (BuildingType.ShrineOfThor, 25),
    ];

    private static readonly BuildingType[] Producers =
    [
        BuildingType.Lumberjack, BuildingType.Quarry, BuildingType.ClayBrickworks, BuildingType.Farm,
        BuildingType.PumpkinFarm, BuildingType.FishingHut, BuildingType.FisherHut,
    ];

    private static double Sum(ResourceAmounts a) => a.Wood + a.Stone + a.Food + a.Iron;

    [Fact]
    public void The_ladder_table_covers_every_non_longhouse_type()
    {
        var covered = Ladder.Select(l => l.Type).ToHashSet();

        Assert.Equal(
            BuildingCatalogue.AllTypes.Where(t => t != BuildingType.Longhouse).ToHashSet(),
            covered);
    }

    [Fact]
    public void Every_building_unlocks_at_its_ladder_level_and_its_level_1_gate_is_that_level()
    {
        foreach (var (type, unlock) in Ladder)
        {
            Assert.Equal(unlock, BuildingCatalogue.UnlockLevel(type));
            Assert.Equal(unlock, BuildingCatalogue.Get(type, 1).RequiredLonghouseLevel);
        }
    }

    [Fact]
    public void At_most_two_new_buildings_unlock_at_any_longhouse_level_except_1_and_25()
    {
        foreach (var group in Ladder.GroupBy(l => l.Unlock))
        {
            if (group.Key is 1 or 25)
            {
                continue;
            }

            Assert.True(group.Count() <= 2, $"LH {group.Key} unlocks {group.Count()} buildings");
        }
    }

    [Fact]
    public void A_buildings_level_can_never_exceed_the_longhouse_level_it_needs()
    {
        foreach (var type in BuildingCatalogue.AllTypes.Where(t => t != BuildingType.Longhouse))
        {
            var unlock = BuildingCatalogue.UnlockLevel(type);
            for (var level = 1; level <= BuildingCatalogue.MaxLevelFor(type); level++)
            {
                Assert.Equal(
                    Math.Max(unlock, level),
                    BuildingCatalogue.Get(type, level).RequiredLonghouseLevel);
            }
        }
    }

    [Fact]
    public void The_longhouse_itself_only_ever_needs_a_level_1_longhouse()
    {
        for (var level = 1; level <= BuildingCatalogue.MaxLevelFor(BuildingType.Longhouse); level++)
        {
            Assert.Equal(1, BuildingCatalogue.Get(BuildingType.Longhouse, level).RequiredLonghouseLevel);
        }
    }

    [Fact]
    public void Every_prerequisite_can_be_met_before_the_building_that_needs_it_unlocks()
    {
        // A feeder that unlocks later than the building it feeds could never be built first.
        foreach (var (type, unlock) in Ladder)
        {
            foreach (var prerequisite in BuildingCatalogue.Get(type, 1).Prerequisites)
            {
                Assert.True(
                    BuildingCatalogue.UnlockLevel(prerequisite.Type) <= unlock,
                    $"{type} (LH {unlock}) needs {prerequisite.Type} (LH {BuildingCatalogue.UnlockLevel(prerequisite.Type)})");
            }
        }
    }

    [Fact]
    public void No_building_costs_iron()
    {
        foreach (var type in BuildingCatalogue.AllTypes)
        {
            for (var level = 1; level <= BuildingCatalogue.MaxLevelFor(type); level++)
            {
                Assert.Equal(0, BuildingCatalogue.Get(type, level).Cost.Iron);
            }
        }
    }

    [Theory]
    [InlineData(BuildingType.Longhouse, 30)]
    [InlineData(BuildingType.Lumberjack, 25)]
    [InlineData(BuildingType.Quarry, 25)]
    [InlineData(BuildingType.ClayBrickworks, 25)]
    [InlineData(BuildingType.Farm, 25)]
    [InlineData(BuildingType.PumpkinFarm, 25)]
    [InlineData(BuildingType.FishingHut, 25)]
    [InlineData(BuildingType.FisherHut, 25)]
    [InlineData(BuildingType.StorageHouse, 25)]
    [InlineData(BuildingType.Barracks, 20)]
    [InlineData(BuildingType.ArcheryRange, 20)]
    [InlineData(BuildingType.Dockyard, 20)]
    [InlineData(BuildingType.TownSquare, 20)]
    [InlineData(BuildingType.CartWorkshop, 20)]
    [InlineData(BuildingType.DruidHut, 20)]
    [InlineData(BuildingType.Smithy, 20)]
    [InlineData(BuildingType.Meadery, 20)]
    [InlineData(BuildingType.Sawmill, 20)]
    [InlineData(BuildingType.CropMill, 20)]
    [InlineData(BuildingType.Tower, 10)]
    [InlineData(BuildingType.GreatStorehouse, 10)]
    [InlineData(BuildingType.ShrineOfThor, 5)]
    [InlineData(BuildingType.ShrineOfFreyja, 5)]
    [InlineData(BuildingType.ShrineOfUllr, 5)]
    [InlineData(BuildingType.ShrineOfNjord, 5)]
    public void Each_building_has_its_own_max_level_and_no_definition_above_it(BuildingType type, int max)
    {
        Assert.Equal(max, BuildingCatalogue.MaxLevelFor(type));
        Assert.NotNull(BuildingCatalogue.TryGet(type, max));
        Assert.Null(BuildingCatalogue.TryGet(type, max + 1));
    }

    [Fact]
    public void Producer_cost_output_and_time_follow_the_design_formulas()
    {
        var one = BuildingCatalogue.Get(BuildingType.Lumberjack, 1);
        var ten = BuildingCatalogue.Get(BuildingType.Lumberjack, 10);

        Assert.Equal(new ResourceAmounts(50, 40, 15, 0), one.Cost);
        Assert.Equal(40, one.ProductionPerHour.Wood, 6);
        Assert.Equal(TimeSpan.FromMinutes(3), one.BuildDuration);

        Assert.Equal(50 * Math.Pow(1.30, 9), ten.Cost.Wood, 6);
        Assert.Equal(40 * Math.Pow(1.20, 9), ten.ProductionPerHour.Wood, 6);
        Assert.Equal(TimeSpan.FromSeconds(Math.Round(180 * Math.Pow(1.33, 9))), ten.BuildDuration);
    }

    [Fact]
    public void The_longhouse_costs_grow_faster_and_its_output_is_linear()
    {
        var one = BuildingCatalogue.Get(BuildingType.Longhouse, 1);
        var five = BuildingCatalogue.Get(BuildingType.Longhouse, 5);

        Assert.Equal(new ResourceAmounts(120, 100, 60, 0), one.Cost);
        Assert.Equal(120 * Math.Pow(1.34, 4), five.Cost.Wood, 6);
        Assert.Equal(TimeSpan.FromSeconds(Math.Round(180 * Math.Pow(1.30, 4))), five.BuildDuration);
        Assert.Equal(new ResourceAmounts(15 * 5, 12 * 5, 15 * 5, 2 * 5), five.ProductionPerHour);
        Assert.Equal(ResourceAmounts.Uniform(250 * 5), five.StorageCapacity);
    }

    [Fact]
    public void Storage_capacity_curves_are_the_geometric_series_totals()
    {
        Assert.Equal(600, BuildingCatalogue.Get(BuildingType.StorageHouse, 1).StorageCapacity.Wood, 6);
        Assert.Equal(
            600 * (Math.Pow(1.22, 7) - 1) / 0.22,
            BuildingCatalogue.Get(BuildingType.StorageHouse, 7).StorageCapacity.Stone,
            6);
        Assert.Equal(2500, BuildingCatalogue.Get(BuildingType.GreatStorehouse, 1).StorageCapacity.Food, 6);
        Assert.Equal(
            2500 * (Math.Pow(1.30, 10) - 1) / 0.30,
            BuildingCatalogue.Get(BuildingType.GreatStorehouse, 10).StorageCapacity.Iron,
            6);
    }

    [Fact]
    public void Producer_payback_time_strictly_increases_with_level()
    {
        foreach (var type in Producers)
        {
            var previous = double.MinValue;
            for (var level = 2; level <= BuildingCatalogue.MaxLevelFor(type); level++)
            {
                var now = BuildingCatalogue.Get(type, level);
                var before = BuildingCatalogue.Get(type, level - 1);
                var payback = Sum(now.Cost) / (Sum(now.ProductionPerHour) - Sum(before.ProductionPerHour));

                Assert.True(payback > previous, $"{type} level {level}: payback {payback} <= {previous}");
                previous = payback;
            }
        }
    }

    [Fact]
    public void Every_longhouse_level_can_be_afforded_from_the_storage_the_previous_level_gives_plus_two_max_storage_houses()
    {
        var longhouseMax = BuildingCatalogue.MaxLevelFor(BuildingType.Longhouse);
        var storageMax = BuildingCatalogue.MaxLevelFor(BuildingType.StorageHouse);

        for (var level = 2; level <= longhouseMax; level++)
        {
            var cost = BuildingCatalogue.Get(BuildingType.Longhouse, level).Cost;
            var (_, capacity) = BuildingCatalogue.Totals(
            [
                (BuildingType.Longhouse, level - 1),
                (BuildingType.StorageHouse, storageMax),
                (BuildingType.StorageHouse, storageMax),
            ]);

            Assert.True(capacity.Covers(cost), $"Longhouse {level} ({cost}) does not fit in {capacity}");
        }
    }

    [Theory]
    [InlineData(1, 5.0, 1)]
    [InlineData(20, 100.0, 5)]
    public void The_mills_boost_runs_from_5_percent_and_one_ring_at_level_1_to_100_percent_and_five_rings_at_20(
        int level, double percent, int range)
    {
        Assert.Equal(percent, BuildingCatalogue.RadiusBoostPercent(level), 6);
        Assert.Equal(range, BuildingCatalogue.RadiusBoostRange(level));
    }
}
