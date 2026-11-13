using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

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
        (BuildingType.StorageHouse, 1), (BuildingType.ReindeerHerder, 1),
        (BuildingType.FishingHut, 2),
        (BuildingType.Tower, 3), (BuildingType.BogOreWorks, 3),
        (BuildingType.Farm, 4), (BuildingType.PumpkinFarm, 4),
        (BuildingType.Barracks, 5),
        (BuildingType.TownSquare, 6),
        (BuildingType.Palisade, 7), (BuildingType.PalisadeGate, 7), (BuildingType.Bridge, 7),
        (BuildingType.Harbour, 5),
        (BuildingType.Shipyard, 10),
        (BuildingType.ArcheryRange, 9),
        (BuildingType.CartWorkshop, 10),
        (BuildingType.Meadery, 11),
        (BuildingType.DruidHut, 12),
        (BuildingType.Smithy, 15), (BuildingType.GreatStorehouse, 15),
        (BuildingType.SiegeWorkshop, 18),
        (BuildingType.Sawmill, 20), (BuildingType.CropMill, 20), (BuildingType.Hammerschmiede, 20),
        (BuildingType.ShrineOfUllr, 25), (BuildingType.ShrineOfFreyja, 25),
        (BuildingType.ShrineOfNjord, 25), (BuildingType.ShrineOfThor, 25),
        (BuildingType.OdinStatue, 25),
    ];

    private static readonly BuildingType[] Producers =
    [
        BuildingType.Lumberjack, BuildingType.Quarry, BuildingType.ClayBrickworks, BuildingType.ReindeerHerder,
        BuildingType.Farm, BuildingType.PumpkinFarm, BuildingType.FishingHut, BuildingType.BogOreWorks,
    ];

    private static double Sum(ResourceAmounts a) => a.Wood + a.Stone + a.Food + a.Iron;

    [Fact]
    public void A_new_settlement_starts_with_its_storage_nearly_full_and_no_iron()
    {
        // Starting capacity is the base plus the level-1 Longhouse's own
        // storage (500 + 250); the founding stock sits 50 below it.
        var capacity = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]).Capacity;
        var stock = BuildingCatalogue.FoundingStock;

        Assert.Equal(new ResourceAmounts(Wood: 700, Stone: 700, Food: 700, Iron: 0), stock);
        Assert.Equal(capacity.Wood - BuildingCatalogue.FoundingHeadroom, stock.Wood);
        Assert.True(capacity.Covers(stock));
    }

    [Fact]
    public void The_ladder_table_covers_every_non_longhouse_type()
    {
        var covered = Ladder.Select(l => l.Type).ToHashSet();

        Assert.Equal(
            BuildingCatalogue.AllTypes.Where(t => t is not (BuildingType.Longhouse or BuildingType.BeachCamp)).ToHashSet(),
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
    public void At_most_two_new_buildings_unlock_at_any_longhouse_level_except_1_20_and_25()
    {
        foreach (var group in Ladder.GroupBy(l => l.Unlock))
        {
            // LH 20 is the mills tier: Sawmill, Crop Mill and the Hammerschmiede.
            if (group.Key is 1 or 20 or 25)
            {
                continue;
            }

            // The Palisade Gate shares the Palisade's tech-tree card, so the pair counts once.
            var cards = group.Count(l => l.Type != BuildingType.PalisadeGate);
            Assert.True(cards <= 2, $"LH {group.Key} unlocks {cards} buildings");
        }
    }

    [Fact]
    public void A_buildings_level_can_never_exceed_the_longhouse_level_it_needs_except_for_storage_capped_producers_and_the_storage_house()
    {
        foreach (var type in BuildingCatalogue.AllTypes.Where(t => t != BuildingType.Longhouse))
        {
            var unlock = BuildingCatalogue.UnlockLevel(type);
            var producer = BuildingCatalogue.LonghouseUncappedTypes.Contains(type);
            for (var level = 1; level <= BuildingCatalogue.MaxLevelFor(type); level++)
            {
                Assert.Equal(
                    producer ? unlock : Math.Max(unlock, level),
                    BuildingCatalogue.Get(type, level).RequiredLonghouseLevel);
            }
        }
    }

    [Fact]
    public void Every_producer_level_fits_in_what_a_settlement_can_store()
    {
        // Storage is what caps a producer now: base capacity + a maxed Longhouse + three maxed storage houses.
        var storageHouse = BuildingCatalogue.Get(BuildingType.StorageHouse, BuildingCatalogue.MaxLevelFor(BuildingType.StorageHouse));
        var longhouse = BuildingCatalogue.Get(BuildingType.Longhouse, BuildingCatalogue.MaxLevelFor(BuildingType.Longhouse));
        var capacity = BuildingCatalogue.BaseStorageCapacity + longhouse.StorageCapacity + 3 * storageHouse.StorageCapacity;

        foreach (var type in BuildingCatalogue.StorageCappedProducers.Where(t => BuildingCatalogue.MaxLevelFor(t) > 0))
        {
            for (var level = 1; level <= BuildingCatalogue.MaxLevelFor(type); level++)
            {
                Assert.True(capacity.Covers(BuildingCatalogue.Get(type, level).Cost), $"{type} level {level} cannot be stored");
            }
        }
    }

    [Fact]
    public void The_top_great_storehouse_level_fits_in_base_plus_a_maxed_longhouse_three_maxed_storage_houses_and_a_level_9_great_storehouse()
    {
        var storageHouse = BuildingCatalogue.Get(BuildingType.StorageHouse, BuildingCatalogue.MaxLevelFor(BuildingType.StorageHouse));
        var longhouse = BuildingCatalogue.Get(BuildingType.Longhouse, BuildingCatalogue.MaxLevelFor(BuildingType.Longhouse));
        var top = BuildingCatalogue.MaxLevelFor(BuildingType.GreatStorehouse);
        var capacity = BuildingCatalogue.BaseStorageCapacity + longhouse.StorageCapacity + 3 * storageHouse.StorageCapacity
            + BuildingCatalogue.Get(BuildingType.GreatStorehouse, top - 1).StorageCapacity;

        Assert.True(capacity.Covers(BuildingCatalogue.Get(BuildingType.GreatStorehouse, top).Cost), "the top Great Storehouse level cannot be stored");
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
    [InlineData(BuildingType.ReindeerHerder, 25)]
    [InlineData(BuildingType.Farm, 25)]
    [InlineData(BuildingType.PumpkinFarm, 25)]
    [InlineData(BuildingType.FishingHut, 25)]
    [InlineData(BuildingType.BogOreWorks, 25)]
    [InlineData(BuildingType.StorageHouse, 25)]
    [InlineData(BuildingType.Barracks, 20)]
    [InlineData(BuildingType.ArcheryRange, 20)]
    [InlineData(BuildingType.SiegeWorkshop, 20)]
    [InlineData(BuildingType.Harbour, 20)]
    [InlineData(BuildingType.Shipyard, 20)]
    [InlineData(BuildingType.TownSquare, 20)]
    [InlineData(BuildingType.CartWorkshop, 20)]
    [InlineData(BuildingType.DruidHut, 20)]
    [InlineData(BuildingType.Smithy, 20)]
    [InlineData(BuildingType.Meadery, 20)]
    [InlineData(BuildingType.Sawmill, 20)]
    [InlineData(BuildingType.CropMill, 20)]
    [InlineData(BuildingType.Hammerschmiede, 20)]
    [InlineData(BuildingType.Tower, 5)]
    [InlineData(BuildingType.GreatStorehouse, 10)]
    [InlineData(BuildingType.ShrineOfThor, 5)]
    [InlineData(BuildingType.ShrineOfFreyja, 5)]
    [InlineData(BuildingType.ShrineOfUllr, 5)]
    [InlineData(BuildingType.ShrineOfNjord, 5)]
    [InlineData(BuildingType.Palisade, 3)]
    [InlineData(BuildingType.PalisadeGate, 3)]
    [InlineData(BuildingType.Bridge, 4)]
    public void Each_building_has_its_own_max_level_and_no_definition_above_it(BuildingType type, int max)
    {
        Assert.Equal(max, BuildingCatalogue.MaxLevelFor(type));
        Assert.NotNull(BuildingCatalogue.TryGet(type, max));
        Assert.Null(BuildingCatalogue.TryGet(type, max + 1));
    }

    [Fact]
    public void Producer_cost_output_and_time_follow_the_design_formulas()
    {
        // The Lumberjack is a start building (no brick before level 6); the Farm shows the plain producer cost from level 4 on
        // (levels 1 to 3 are discounted, see The_first_three_producer_levels_cost_a_discounted_share_of_the_formula).
        var one = BuildingCatalogue.Get(BuildingType.Farm, 1);
        var ten = BuildingCatalogue.Get(BuildingType.Farm, 10);

        Assert.Equal(new ResourceAmounts(34, 17, 5, 0), one.Cost);
        Assert.Equal(12, one.ProductionPerHour.Food, 6);
        Assert.Equal(TimeSpan.FromMinutes(1), one.BuildDuration);

        Assert.Equal(BuildingCatalogue.NiceRound(57 * Math.Pow(1.30, 9)), ten.Cost.Wood, 6);
        Assert.Equal(BuildingCatalogue.NiceRound(29 * Math.Pow(1.30, 9)), ten.Cost.Stone, 6);
        Assert.Equal(BuildingCatalogue.BuildTime(BuildingType.Farm, 10), ten.BuildDuration);
    }

    [Fact]
    public void Producer_output_is_increment_geometric_each_level_adds_1_point_2_times_the_last_increment()
    {
        var wood = Enumerable.Range(1, 10).Select(l => BuildingCatalogue.Get(BuildingType.Lumberjack, l).ProductionPerHour.Wood).ToArray();

        Assert.Equal(8, wood[0], 6);
        for (var level = 2; level <= 10; level++)
        {
            Assert.Equal(8 * Math.Pow(1.20, level - 1), wood[level - 1] - wood[level - 2], 6);
            Assert.Equal(8 * (Math.Pow(1.20, level) - 1) / 0.20, wood[level - 1], 6);
        }
    }

    [Theory]
    [InlineData(BuildingType.Lumberjack, 8)]
    [InlineData(BuildingType.Quarry, 8)]
    [InlineData(BuildingType.ClayBrickworks, 8)]
    [InlineData(BuildingType.ReindeerHerder, 8)]
    [InlineData(BuildingType.Farm, 12)]
    [InlineData(BuildingType.PumpkinFarm, 13)]
    [InlineData(BuildingType.FishingHut, 16)]
    [InlineData(BuildingType.BogOreWorks, 4)]
    public void Each_producers_level_1_output_is_its_increment(BuildingType type, double increment)
    {
        Assert.Equal(increment, Sum(BuildingCatalogue.Get(type, 1).ProductionPerHour), 6);
        Assert.Equal(increment * (Math.Pow(1.20, 6) - 1) / 0.20, Sum(BuildingCatalogue.Get(type, 6).ProductionPerHour), 6);
    }

    [Theory]
    [InlineData(BuildingType.Longhouse)]
    [InlineData(BuildingType.Tower)]
    [InlineData(BuildingType.Lumberjack)]
    [InlineData(BuildingType.ReindeerHerder)]
    public void The_start_buildings_cost_no_brick_at_levels_1_to_5_and_the_normal_brick_from_level_6(BuildingType type)
    {
        for (var level = 1; level <= 5; level++)
        {
            var cost = BuildingCatalogue.Get(type, level).Cost;
            Assert.Equal(0, cost.Stone);
            Assert.True(cost.Wood > 0 || cost.Food > 0, $"{type} level {level} costs nothing at all");
        }

        // The Tower tops out at level 5, so it never pays brick at all.
        if (BuildingCatalogue.MaxLevelFor(type) >= 6)
        {
            Assert.True(BuildingCatalogue.Get(type, 6).Cost.Stone > 0);
        }
    }

    [Fact]
    public void The_clay_brickworks_costs_no_brick_at_level_1_only()
    {
        Assert.Equal(0, BuildingCatalogue.Get(BuildingType.ClayBrickworks, 1).Cost.Stone);
        Assert.Equal(BuildingCatalogue.NiceRound(10 * 1.30 * 0.75), BuildingCatalogue.Get(BuildingType.ClayBrickworks, 2).Cost.Stone);
    }

    [Fact]
    public void The_start_buildings_keep_their_other_resources_at_the_brick_free_levels()
    {
        Assert.Equal(new ResourceAmounts(10, 0, 18, 0), BuildingCatalogue.Get(BuildingType.Lumberjack, 1).Cost);
        Assert.Equal(new ResourceAmounts(120, 0, 60, 0), BuildingCatalogue.Get(BuildingType.Longhouse, 1).Cost);
        Assert.Equal(new ResourceAmounts(140, 0, 30, 0), BuildingCatalogue.Get(BuildingType.Tower, 1).Cost);
    }

    [Fact]
    public void The_longhouse_costs_grow_faster_and_its_output_is_linear_wood_and_food_only()
    {
        var one = BuildingCatalogue.Get(BuildingType.Longhouse, 1);
        var five = BuildingCatalogue.Get(BuildingType.Longhouse, 5);
        var six = BuildingCatalogue.Get(BuildingType.Longhouse, 6);

        Assert.Equal(new ResourceAmounts(120, 0, 60, 0), one.Cost);
        Assert.Equal(BuildingCatalogue.NiceRound(120 * Math.Pow(1.34, 4)), five.Cost.Wood, 6);
        Assert.Equal(BuildingCatalogue.NiceRound(100 * Math.Pow(1.34, 5)), six.Cost.Stone, 6);
        Assert.Equal(TimeSpan.FromMinutes(32), five.BuildDuration);
        Assert.Equal(new ResourceAmounts(15 * 5, 0, 15 * 5, 0), five.ProductionPerHour);
        Assert.Equal(ResourceAmounts.Uniform(250 * 5), five.StorageCapacity);
    }

    [Fact]
    public void The_longhouse_makes_no_brick_and_no_iron_at_any_level()
    {
        for (var level = 1; level <= BuildingCatalogue.MaxLevelFor(BuildingType.Longhouse); level++)
        {
            var production = BuildingCatalogue.Get(BuildingType.Longhouse, level).ProductionPerHour;
            Assert.Equal(0, production.Stone);
            Assert.Equal(0, production.Iron);
        }
    }

    [Fact]
    public void A_new_settlement_has_no_iron_income_before_a_bog_ore_works_stands()
    {
        Assert.Equal(0, BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]).ProductionPerHour.Iron);
    }

    [Fact]
    public void The_tower_tops_out_at_level_5()
    {
        Assert.Equal(5, BuildingCatalogue.MaxLevelFor(BuildingType.Tower));
        Assert.Null(BuildingCatalogue.TryGet(BuildingType.Tower, 6));
    }

    [Fact]
    public void The_great_storehouse_costs_4500_wood_and_3000_brick_and_holds_a_geometric_50000()
    {
        Assert.Equal(new ResourceAmounts(4500, 3000, 0, 0), BuildingCatalogue.Get(BuildingType.GreatStorehouse, 1).Cost);
        Assert.Equal(ResourceAmounts.Uniform(50000), BuildingCatalogue.Get(BuildingType.GreatStorehouse, 1).StorageCapacity);
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(48, 48)]
    [InlineData(47.6, 48)]
    [InlineData(99.4, 99)]
    [InlineData(148, 150)]
    [InlineData(144, 140)]
    [InlineData(999, 1000)]
    [InlineData(1458, 1450)]
    [InlineData(1476, 1500)]
    [InlineData(9990, 10000)]
    [InlineData(12345, 12500)]
    [InlineData(27140, 27000)]
    [InlineData(123456, 125000)]
    public void Nice_rounding_steps_by_the_number_of_digits(double value, double expected)
    {
        Assert.Equal(expected, BuildingCatalogue.NiceRound(value));
    }

    [Fact]
    public void Every_building_cost_is_nice_rounded()
    {
        foreach (var type in BuildingCatalogue.AllTypes)
        {
            for (var level = 1; level <= BuildingCatalogue.MaxLevelFor(type); level++)
            {
                var cost = BuildingCatalogue.Get(type, level).Cost;
                foreach (var amount in new[] { cost.Wood, cost.Stone, cost.Food, cost.Iron })
                {
                    Assert.Equal(BuildingCatalogue.NiceRound(amount), amount);
                }
            }
        }
    }

    [Fact]
    public void Longhouse_2_builds_in_under_three_minutes_so_the_tutorial_upgrade_is_quick()
    {
        var two = BuildingCatalogue.Get(BuildingType.Longhouse, 2).BuildDuration;

        Assert.Equal(TimeSpan.FromSeconds(170), two);
    }

    [Theory]
    [InlineData(BuildingType.Longhouse, 26)]
    [InlineData(BuildingType.Lumberjack, 20)]
    [InlineData(BuildingType.ReindeerHerder, 20)]
    [InlineData(BuildingType.Farm, 22)]
    [InlineData(BuildingType.Quarry, 22)]
    [InlineData(BuildingType.BogOreWorks, 24)]
    [InlineData(BuildingType.StorageHouse, 20)]
    public void Early_curve_is_1_then_2_83_then_8_minutes_doubles_to_level_6_and_ends_at_the_top_hours(BuildingType type, double topHours)
    {
        Assert.Equal(TimeSpan.FromMinutes(1), BuildingCatalogue.Get(type, 1).BuildDuration);
        Assert.Equal(TimeSpan.FromSeconds(170), BuildingCatalogue.Get(type, 2).BuildDuration);
        Assert.Equal(TimeSpan.FromMinutes(8), BuildingCatalogue.Get(type, 3).BuildDuration);
        Assert.Equal(TimeSpan.FromMinutes(16), BuildingCatalogue.Get(type, 4).BuildDuration);
        Assert.Equal(TimeSpan.FromMinutes(32), BuildingCatalogue.Get(type, 5).BuildDuration);
        Assert.Equal(TimeSpan.FromMinutes(64), BuildingCatalogue.Get(type, 6).BuildDuration);
        Assert.Equal(TimeSpan.FromHours(topHours), BuildingCatalogue.Get(type, BuildingCatalogue.MaxLevelFor(type)).BuildDuration);
    }

    [Fact]
    public void Early_curve_tail_is_log_like_each_step_adds_less_than_the_one_before()
    {
        foreach (var type in new[] { BuildingType.Longhouse, BuildingType.Farm, BuildingType.StorageHouse })
        {
            var max = BuildingCatalogue.MaxLevelFor(type);
            var times = Enumerable.Range(6, max - 5).Select(l => BuildingCatalogue.Get(type, l).BuildDuration.TotalSeconds).ToArray();
            for (var i = 2; i < times.Length; i++)
            {
                // Whole-second rounding can blur a step by a second at most.
                Assert.True(times[i] - times[i - 1] < times[i - 1] - times[i - 2] + 1, $"{type} level {6 + i}");
            }
        }

        var farm = (int)Math.Round(BuildingCatalogue.Get(BuildingType.Farm, 12).BuildDuration.TotalMinutes);
        var expected = 64 + (22 * 60 - 64) * BuildingCatalogue.Bend(6 / 19.0, 3);
        Assert.Equal((int)Math.Round(expected), farm);
    }

    [Fact]
    public void Tech_curve_runs_straight_from_the_level_1_time_to_the_top_time()
    {
        Assert.Equal(TimeSpan.FromMinutes(10), BuildingCatalogue.Get(BuildingType.Tower, 1).BuildDuration);
        Assert.Equal(TimeSpan.FromHours(12), BuildingCatalogue.Get(BuildingType.Tower, 5).BuildDuration);
        Assert.Equal(TimeSpan.FromMinutes((10 + 12 * 60) / 2.0), BuildingCatalogue.Get(BuildingType.Tower, 3).BuildDuration);
        Assert.Equal(TimeSpan.FromMinutes(30), BuildingCatalogue.Get(BuildingType.Bridge, 1).BuildDuration);
        Assert.Equal(TimeSpan.FromHours(3), BuildingCatalogue.Get(BuildingType.Bridge, 4).BuildDuration);
        Assert.Equal(TimeSpan.FromHours(2), BuildingCatalogue.Get(BuildingType.GreatStorehouse, 1).BuildDuration);
        Assert.Equal(TimeSpan.FromHours(30), BuildingCatalogue.Get(BuildingType.GreatStorehouse, 10).BuildDuration);
        Assert.Equal(TimeSpan.FromHours(6), BuildingCatalogue.Get(BuildingType.ShrineOfThor, 1).BuildDuration);
        Assert.Equal(TimeSpan.FromHours(24), BuildingCatalogue.Get(BuildingType.OdinStatue, 5).BuildDuration);
        var mid = BuildingCatalogue.Get(BuildingType.Barracks, 10).BuildDuration.TotalMinutes;
        Assert.Equal(15 + (22 * 60 - 15) * 9 / 19.0, mid, 0);
    }

    [Fact]
    public void Every_building_has_a_build_time_curve_that_rises_with_the_level()
    {
        // The Beach Camp a sea landing sets up is never built: it has one level and stands at once.
        foreach (var type in BuildingCatalogue.AllTypes.Where(t => t != BuildingType.BeachCamp))
        {
            var previous = TimeSpan.Zero;
            for (var level = 1; level <= BuildingCatalogue.MaxLevelFor(type); level++)
            {
                var duration = BuildingCatalogue.Get(type, level).BuildDuration;
                Assert.True(duration > previous, $"{type} level {level}");
                previous = duration;
            }
        }
    }

    [Fact]
    public void Storage_capacity_curves_are_the_geometric_series_totals()
    {
        Assert.Equal(300, BuildingCatalogue.Get(BuildingType.StorageHouse, 1).StorageCapacity.Wood, 6);
        Assert.Equal(
            300 * (Math.Pow(1.22, 7) - 1) / 0.22,
            BuildingCatalogue.Get(BuildingType.StorageHouse, 7).StorageCapacity.Stone,
            6);
        Assert.Equal(50000, BuildingCatalogue.Get(BuildingType.GreatStorehouse, 1).StorageCapacity.Food, 6);
        Assert.Equal(
            50000 * (Math.Pow(1.25, 10) - 1) / 0.25,
            BuildingCatalogue.Get(BuildingType.GreatStorehouse, 10).StorageCapacity.Iron,
            6);
    }

    [Fact]
    public void A_late_buildings_level_1_costs_between_10_and_40_percent_of_the_longhouse_upgrade_at_its_unlock_level()
    {
        // Excluded: Storage House, Tower, Palisade and Gate are cheap infrastructure that unlock early and is built in numbers,
        // the Bridge has its own per-level cost table, the Great Storehouse is priced by its storage, not by this share, and the
        // Beach Camp a sea landing sets up is never built and costs nothing. The Harbour and the Shipyard keep the Dockyard's
        // price (economy.md §3 table) although the Harbour now unlocks at Longhouse 5 (units-and-ships.md §1), so the Harbour
        // costs 93% of that Longhouse upgrade; the share rule is open for them until the design says otherwise.
        BuildingType[] excluded =
        [
            BuildingType.StorageHouse, BuildingType.Tower, BuildingType.Palisade, BuildingType.PalisadeGate,
            BuildingType.Bridge, BuildingType.GreatStorehouse, BuildingType.BeachCamp, BuildingType.Harbour, BuildingType.Shipyard,
        ];
        var outside = new List<string>();
        foreach (var type in BuildingCatalogue.AllTypes.Except(excluded).Except(Producers).Where(t => t != BuildingType.Longhouse))
        {
            var unlock = BuildingCatalogue.UnlockLevel(type);
            var share = Sum(BuildingCatalogue.Get(type, 1).Cost) / Sum(BuildingCatalogue.Get(BuildingType.Longhouse, unlock).Cost);
            if (share is < 0.10 or > 0.40)
            {
                outside.Add($"{type}: level 1 is {share:P0} of Longhouse {unlock}");
            }
        }

        Assert.True(outside.Count == 0, string.Join("; ", outside));
    }

    [Fact]
    public void Each_producers_own_resource_is_the_smallest_share_of_its_level_1_cost()
    {
        // The Bog-ore works produce iron, which no building costs, so there is no share to compare. Read at level 6: the start
        // buildings and the Clay Brickworks hide their stone at level 1, and every level grows by the same factor.
        foreach (var type in Producers.Where(t => t != BuildingType.BogOreWorks))
        {
            var produced = BuildingCatalogue.Get(type, 1).ProductionPerHour;
            var cost = BuildingCatalogue.Get(type, 6).Cost;
            var own = produced.Wood > 0 ? cost.Wood : produced.Stone > 0 ? cost.Stone : cost.Food;

            Assert.True(own <= Math.Min(cost.Wood, Math.Min(cost.Stone, cost.Food)), $"{type}: own resource {own} is not the cheapest of {cost}");
        }
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
    public void Every_longhouse_level_can_be_stored_with_at_most_15_maxed_storage_houses_and_as_many_maxed_great_storehouses()
    {
        // The n-th Great Storehouse needs n maxed Storage Houses, so storage grows in pairs of the two.
        var longhouseMax = BuildingCatalogue.MaxLevelFor(BuildingType.Longhouse);
        var storageMax = BuildingCatalogue.MaxLevelFor(BuildingType.StorageHouse);
        var greatMax = BuildingCatalogue.MaxLevelFor(BuildingType.GreatStorehouse);

        for (var level = 2; level <= longhouseMax; level++)
        {
            var cost = BuildingCatalogue.Get(BuildingType.Longhouse, level).Cost;
            var pairs = 0;
            while (pairs <= 15)
            {
                var standing = new List<(BuildingType, int)> { (BuildingType.Longhouse, level - 1) };
                for (var i = 0; i < pairs; i++)
                {
                    standing.Add((BuildingType.StorageHouse, storageMax));
                    standing.Add((BuildingType.GreatStorehouse, greatMax));
                }

                if (BuildingCatalogue.Totals(standing).Capacity.Covers(cost))
                {
                    break;
                }

                pairs++;
            }

            Assert.True(pairs <= 15, $"Longhouse {level} ({cost}) needs more than 15 pairs of maxed storage buildings");
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

    [Theory]
    [InlineData(1, 2)]
    [InlineData(2, 3)]
    [InlineData(3, 3)]
    [InlineData(30, 3)]
    public void The_longhouse_claim_radius_is_2_at_level_1_and_stops_at_3(int level, int radius)
    {
        Assert.Equal(radius, Settlement.ClaimRadiusForLonghouseLevel(level));
        Assert.Equal(3, Settlement.MaxClaimRadius);
    }

    [Theory]
    [InlineData(1, 0)]
    [InlineData(2, 0)]
    [InlineData(3, 1)]
    [InlineData(5, 1)]
    [InlineData(6, 1)]
    [InlineData(7, 2)]
    [InlineData(8, 2)]
    [InlineData(9, 3)]
    [InlineData(15, 6)]
    [InlineData(29, 13)]
    [InlineData(30, 13)]
    public void MaxTowers_follows_one_tower_from_LH3_then_one_per_two_levels_after_LH5(int longhouseLevel, int expected)
    {
        Assert.Equal(expected, BuildingCatalogue.MaxTowers(longhouseLevel));
    }

    private static readonly HexCoord Centre = new(0, 0);
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    /// <summary>A rich settlement at the given Longhouse level with the given other buildings on the ring behind the centre.</summary>
    private static Settlement SettlementWith(int longhouseLevel, params (BuildingType Type, int Level)[] standing)
    {
        var buildings = new List<PlacedBuilding> { new(Centre, BuildingType.Longhouse, longhouseLevel) };
        buildings.AddRange(standing.Select((b, i) => new PlacedBuilding(new HexCoord(-1, -i), b.Type, b.Level)));
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = buildings,
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(1_000_000), production, capacity + ResourceAmounts.Uniform(1_000_000), T0),
        };
    }

    private static BuildDecision PlanTower(Settlement settlement, HexCoord coord) =>
        settlement.PlanBuild(BuildingType.Tower, coord, Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 5);

    private static BuildDecision PlanQuarry(Settlement settlement, HexCoord coord) =>
        settlement.PlanBuild(BuildingType.Quarry, coord, Terrain.Mountain, T0, Guid.CreateVersion7(), maxWaitingOrders: 5);

    [Fact]
    public void A_new_quarry_is_refused_because_new_placement_is_switched_off()
    {
        var decision = PlanQuarry(SettlementWith(10), new HexCoord(1, 0));

        Assert.Equal(BuildRejection.NewPlacementDisabled, decision.Rejection);
        Assert.Null(decision.Order);
        Assert.Equal([BuildingType.Quarry, BuildingType.BeachCamp], BuildingCatalogue.NewPlacementDisabled.OrderBy(t => t == BuildingType.BeachCamp));
    }

    [Fact]
    public void An_existing_quarry_can_still_be_upgraded()
    {
        var coord = new HexCoord(1, 0);
        var settlement = SettlementWith(10);
        settlement = settlement with { Buildings = [.. settlement.Buildings, new PlacedBuilding(coord, BuildingType.Quarry, 2)] };

        var decision = PlanQuarry(settlement, coord);

        Assert.True(decision.Accepted);
        Assert.Equal(3, decision.Order!.TargetLevel);
    }

    [Fact]
    public void A_new_tower_is_refused_once_the_standing_towers_reach_the_limit()
    {
        // LH 3 allows exactly one tower.
        var settlement = SettlementWith(3, (BuildingType.Tower, 1));

        var decision = PlanTower(settlement, new HexCoord(1, 0));

        Assert.Equal(BuildRejection.TowerLimitReached, decision.Rejection);
    }

    [Fact]
    public void A_new_tower_is_accepted_below_the_limit_and_the_first_tower_at_LH3()
    {
        Assert.True(PlanTower(SettlementWith(3), new HexCoord(1, 0)).Accepted);
        Assert.True(PlanTower(SettlementWith(7, (BuildingType.Tower, 1)), new HexCoord(1, 0)).Accepted);
    }

    [Fact]
    public void A_queued_new_tower_counts_against_the_limit_before_it_stands()
    {
        var settlement = SettlementWith(3);
        var first = PlanTower(settlement, new HexCoord(1, 0));
        Assert.True(first.Accepted);
        var queued = settlement.Enqueue(first.Order!, T0);

        var second = PlanTower(queued, new HexCoord(1, 1));

        Assert.Equal(BuildRejection.TowerLimitReached, second.Rejection);
    }

    [Fact]
    public void A_waiting_new_tower_order_counts_against_the_limit_too()
    {
        // Fill both construction slots so the tower waits; waiting orders stake no stub.
        var settlement = SettlementWith(3);
        var waiting = settlement.PlanBuild(
            BuildingType.Tower, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7(),
            maxWaitingOrders: 5) with { };
        Assert.True(waiting.Accepted);
        var queued = settlement.Enqueue(waiting.Order! with { StartedAt = null, CompletesAt = null }, T0);

        Assert.Equal(BuildRejection.TowerLimitReached, PlanTower(queued, new HexCoord(1, 1)).Rejection);
    }

    [Fact]
    public void Upgrading_an_existing_tower_is_allowed_even_at_the_limit()
    {
        var settlement = SettlementWith(3, (BuildingType.Tower, 1));
        var towerCoord = new HexCoord(-1, 0);

        var decision = PlanTower(settlement, towerCoord);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(2, decision.Order!.TargetLevel);
    }

    [Fact]
    public void The_limit_does_not_stop_other_buildings()
    {
        var settlement = SettlementWith(3, (BuildingType.Tower, 1));

        var decision = settlement.PlanBuild(
            BuildingType.Lumberjack, new HexCoord(1, 0), Terrain.Forest, T0, Guid.CreateVersion7());

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
    }

    private static BuildDecision PlanStorage(Settlement settlement, HexCoord coord) =>
        settlement.PlanBuild(BuildingType.StorageHouse, coord, Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 5);

    [Fact]
    public void A_farm_is_refused_until_a_level_3_reindeer_herder_stands()
    {
        var without = SettlementWith(4, (BuildingType.ReindeerHerder, 2));
        var with = SettlementWith(4, (BuildingType.ReindeerHerder, 3));

        var refused = without.PlanBuild(BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 5);
        var accepted = with.PlanBuild(BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 5);

        Assert.Equal(BuildRejection.RequiredBuildingTooLow, refused.Rejection);
        Assert.True(accepted.Accepted, $"expected accept, got {accepted.Rejection}");
    }

    [Fact]
    public void The_odin_statue_is_a_five_level_shrine_behind_a_level_10_druid_hut_and_no_other_shrine()
    {
        var definition = BuildingCatalogue.Get(BuildingType.OdinStatue, 1);

        Assert.Equal(5, BuildingCatalogue.MaxLevelFor(BuildingType.OdinStatue));
        Assert.Equal(25, definition.RequiredLonghouseLevel);
        Assert.Equal(new BuildingPrerequisite(BuildingType.DruidHut, 10), Assert.Single(definition.Prerequisites));
        Assert.Equal(Bjarnoy.Domain.Shrines.GodType.Odin, BuildingCatalogue.GodOf(BuildingType.OdinStatue));
        Assert.Equal("odinstatue", BuildingType.OdinStatue.ToWireName());
        Assert.Equal(29, (int)BuildingType.OdinStatue); // persisted ints must not shift
        // Costs and times follow the other shrines.
        var thor = BuildingCatalogue.Get(BuildingType.ShrineOfThor, 1);
        Assert.Equal(thor.Cost, definition.Cost);
        Assert.Equal(thor.BuildDuration, definition.BuildDuration);
    }

    [Fact]
    public void The_odin_statue_is_refused_until_a_level_10_druid_hut_stands()
    {
        var low = SettlementWith(25, (BuildingType.DruidHut, 9));
        var ready = SettlementWith(25, (BuildingType.DruidHut, 10));

        Assert.Equal(
            BuildRejection.RequiredBuildingTooLow,
            low.PlanBuild(BuildingType.OdinStatue, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7()).Rejection);
        Assert.True(
            ready.PlanBuild(BuildingType.OdinStatue, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7()).Accepted);
    }

    [Fact]
    public void The_odin_statue_counts_as_the_settlements_one_shrine()
    {
        var withThor = SettlementWith(25, (BuildingType.DruidHut, 10), (BuildingType.ShrineOfThor, 1));
        var withOdin = SettlementWith(25, (BuildingType.Smithy, 5), (BuildingType.OdinStatue, 1));

        Assert.Equal(
            BuildRejection.SettlementAlreadyHasShrine,
            withThor.PlanBuild(BuildingType.OdinStatue, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7()).Rejection);
        Assert.Equal(
            BuildRejection.SettlementAlreadyHasShrine,
            withOdin.PlanBuild(BuildingType.ShrineOfThor, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7()).Rejection);
    }

    [Fact]
    public void Wisdom_takes_two_percent_off_builds_per_odin_level()
    {
        Assert.Equal(1.0, SettlementWith(25).BuildTimeFactor, 9);
        foreach (var level in new[] { 1, 2, 3, 4, 5 })
        {
            Assert.Equal(1.0 - (0.02 * level), SettlementWith(25, (BuildingType.OdinStatue, level)).BuildTimeFactor, 9);
        }

        // An unfinished statue (level-0 foundation stub) grants nothing yet.
        Assert.Equal(1.0, SettlementWith(25, (BuildingType.OdinStatue, 0)).BuildTimeFactor, 9);
    }

    [Fact]
    public void An_order_that_starts_at_once_runs_for_the_wisdom_scaled_duration()
    {
        var plain = SettlementWith(25);
        var wise = SettlementWith(25, (BuildingType.OdinStatue, 5));
        var at = new HexCoord(1, 0);

        var plainOrder = plain.PlanBuild(BuildingType.Lumberjack, at, Terrain.Forest, T0, Guid.CreateVersion7(), speedFactor: 2.0).Order!;
        var wiseOrder = wise.PlanBuild(BuildingType.Lumberjack, at, Terrain.Forest, T0, Guid.CreateVersion7(), speedFactor: 2.0).Order!;

        var plainSeconds = (plainOrder.CompletesAt!.Value - plainOrder.StartedAt!.Value).TotalSeconds;
        var wiseSeconds = (wiseOrder.CompletesAt!.Value - wiseOrder.StartedAt!.Value).TotalSeconds;
        Assert.Equal(plainSeconds * 0.90, wiseSeconds, 3);
        // The catalogue's own base duration is untouched, so a later change of Odin's level still scales from it.
        Assert.Equal(plainOrder.BaseDuration, wiseOrder.BaseDuration);
    }

    [Fact]
    public void A_waiting_order_is_timed_by_the_odin_level_standing_when_it_starts()
    {
        var plainStart = SettlementWith(25).PlanBuild(BuildingType.Lumberjack, new HexCoord(1, 0), Terrain.Forest, T0, Guid.CreateVersion7()).Order!;
        var waiting = new BuildOrder
        {
            Id = Guid.CreateVersion7(),
            Type = BuildingType.Lumberjack,
            TargetLevel = 1,
            Coord = new HexCoord(1, 0),
            QueuedAt = T0,
            BaseDuration = plainStart.BaseDuration,
        };
        var wise = SettlementWith(25, (BuildingType.OdinStatue, 3));
        wise = wise with { Queue = [waiting] };

        var (promoted, changed) = wise.PromoteWaitingOrders(T0.AddMinutes(1));

        Assert.True(changed);
        var started = Assert.Single(promoted.Queue);
        Assert.False(started.IsWaiting);
        Assert.Equal(plainStart.BaseDuration.TotalSeconds * 0.94, (started.CompletesAt!.Value - started.StartedAt!.Value).TotalSeconds, 3);
    }

    [Fact]
    public void The_ravens_are_two_rings_per_odin_level_and_zero_without_a_finished_statue()
    {
        Assert.Equal(0, SettlementWith(25).VisionBonusRings);
        Assert.Equal(0, SettlementWith(25, (BuildingType.OdinStatue, 0)).VisionBonusRings);
        Assert.Equal(2, SettlementWith(25, (BuildingType.OdinStatue, 1)).VisionBonusRings);
        Assert.Equal(10, SettlementWith(25, (BuildingType.OdinStatue, 5)).VisionBonusRings);
    }

    /// <summary>Equal within the rounding of a displayed cost (3%).</summary>
    private static void AssertClose(double expected, double actual) => Assert.InRange(actual, expected * 0.97, expected * 1.03);

    private static BuildDecision PlanGreat(Settlement settlement, HexCoord coord) =>
        settlement.PlanBuild(BuildingType.GreatStorehouse, coord, Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 5);

    [Fact]
    public void Any_number_of_storage_houses_can_be_placed_whatever_their_levels()
    {
        var settlement = SettlementWith(1,
            (BuildingType.StorageHouse, 1), (BuildingType.StorageHouse, 1), (BuildingType.StorageHouse, 1),
            (BuildingType.StorageHouse, 1), (BuildingType.StorageHouse, 1), (BuildingType.StorageHouse, 1));

        var decision = PlanStorage(settlement, new HexCoord(1, 0));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
    }

    [Fact]
    public void A_storage_house_level_is_not_capped_by_the_longhouse()
    {
        Assert.Equal(1, BuildingCatalogue.RequiredLonghouseLevelFor(BuildingType.StorageHouse, 25));
        Assert.Equal(1, BuildingCatalogue.Get(BuildingType.StorageHouse, 25).RequiredLonghouseLevel);

        var settlement = SettlementWith(1, (BuildingType.StorageHouse, 24));
        var decision = PlanStorage(settlement, new HexCoord(2, 0));
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        // Non-uncapped buildings still follow the Longhouse level.
        Assert.Equal(5, BuildingCatalogue.RequiredLonghouseLevelFor(BuildingType.Barracks, 5));
        Assert.Equal(10, BuildingCatalogue.RequiredLonghouseLevelFor(BuildingType.Barracks, 10));
        Assert.Equal(15, BuildingCatalogue.RequiredLonghouseLevelFor(BuildingType.GreatStorehouse, 3));
    }

    [Fact]
    public void The_first_great_storehouse_needs_a_level_25_storage_house()
    {
        Assert.Equal(25, Assert.Single(BuildingCatalogue.Get(BuildingType.GreatStorehouse, 1).Prerequisites).Level);

        var low = SettlementWith(15, (BuildingType.StorageHouse, 24));
        var high = SettlementWith(15, (BuildingType.StorageHouse, 25));

        Assert.Equal(BuildRejection.RequiredBuildingTooLow, PlanGreat(low, new HexCoord(1, 0)).Rejection);
        Assert.True(PlanGreat(high, new HexCoord(1, 0)).Accepted);
    }

    [Fact]
    public void The_nth_great_storehouse_needs_n_storage_houses_at_level_25()
    {
        var oneMaxed = SettlementWith(15, (BuildingType.StorageHouse, 25), (BuildingType.StorageHouse, 24), (BuildingType.GreatStorehouse, 1));
        var twoMaxed = SettlementWith(15, (BuildingType.StorageHouse, 25), (BuildingType.StorageHouse, 25), (BuildingType.GreatStorehouse, 1));
        var twoGreat = SettlementWith(15, (BuildingType.StorageHouse, 25), (BuildingType.StorageHouse, 25), (BuildingType.GreatStorehouse, 1), (BuildingType.GreatStorehouse, 1));

        Assert.Equal(BuildRejection.GreatStorehouseNeedsStorageHouses, PlanGreat(oneMaxed, new HexCoord(1, 0)).Rejection);
        Assert.True(PlanGreat(twoMaxed, new HexCoord(1, 0)).Accepted);
        Assert.Equal(BuildRejection.GreatStorehouseNeedsStorageHouses, PlanGreat(twoGreat, new HexCoord(1, 0)).Rejection);
    }

    [Fact]
    public void A_queued_great_storehouse_counts_toward_the_great_storehouses_held()
    {
        var settlement = SettlementWith(15, (BuildingType.StorageHouse, 25));
        var first = PlanGreat(settlement, new HexCoord(1, 0));
        Assert.True(first.Accepted);
        var queued = settlement.Enqueue(first.Order!, T0);

        Assert.Equal(BuildRejection.GreatStorehouseNeedsStorageHouses, PlanGreat(queued, new HexCoord(1, 1)).Rejection);
    }

    [Fact]
    public void Upgrading_a_great_storehouse_is_never_refused_by_the_count_rule()
    {
        var settlement = SettlementWith(15, (BuildingType.StorageHouse, 25), (BuildingType.GreatStorehouse, 1), (BuildingType.GreatStorehouse, 1));

        var decision = PlanGreat(settlement, new HexCoord(-1, 0));

        Assert.NotEqual(BuildRejection.GreatStorehouseNeedsStorageHouses, decision.Rejection);
    }

    [Theory]
    [InlineData(BuildingType.Lumberjack, 16, 1, 0.6)]
    [InlineData(BuildingType.Lumberjack, 16, 2, 0.75)]
    [InlineData(BuildingType.Lumberjack, 16, 3, 0.9)]
    [InlineData(BuildingType.ReindeerHerder, 52, 2, 0.75)]
    [InlineData(BuildingType.Farm, 57, 1, 0.6)]
    public void The_first_three_producer_levels_cost_a_discounted_share_of_the_formula(BuildingType type, double baseWood, int level, double factor)
    {
        Assert.Equal(BuildingCatalogue.NiceRound(baseWood * Math.Pow(1.30, level - 1) * factor), BuildingCatalogue.Get(type, level).Cost.Wood);
        // From level 4 on the full formula applies.
        Assert.Equal(BuildingCatalogue.NiceRound(baseWood * Math.Pow(1.30, 3)), BuildingCatalogue.Get(type, 4).Cost.Wood);
    }

    [Fact]
    public void The_longhouse_cost_grows_1_34_to_level_10_and_1_60_from_level_11()
    {
        double Wood(int l) => BuildingCatalogue.Get(BuildingType.Longhouse, l).Cost.Wood;
        AssertClose(Wood(9) * 1.34, Wood(10));
        AssertClose(Wood(10) * 1.60, Wood(11));
        AssertClose(Wood(20) * 1.60, Wood(21));
    }

    [Fact]
    public void Storage_house_costs_grow_by_1_20_and_hold_300_at_level_1()
    {
        Assert.Equal(new ResourceAmounts(90, 50, 0, 0), BuildingCatalogue.Get(BuildingType.StorageHouse, 1).Cost);
        AssertClose(90 * Math.Pow(1.20, 9), BuildingCatalogue.Get(BuildingType.StorageHouse, 10).Cost.Wood);
        Assert.Equal(300, BuildingCatalogue.Get(BuildingType.StorageHouse, 1).StorageCapacity.Wood, 6);
    }

    [Fact]
    public void Great_storehouse_costs_grow_by_1_23()
    {
        AssertClose(4500 * Math.Pow(1.23, 4), BuildingCatalogue.Get(BuildingType.GreatStorehouse, 5).Cost.Wood);
    }

    [Fact]
    public void The_magic_tower_is_removed_from_the_catalogue_but_keeps_its_persisted_value()
    {
        Assert.DoesNotContain(BuildingType.MagicTower, BuildingCatalogue.AllTypes);
        Assert.Equal(0, BuildingCatalogue.MaxLevelFor(BuildingType.MagicTower));
        Assert.Null(BuildingCatalogue.TryGet(BuildingType.MagicTower, 1));
        Assert.Equal(7, (int)BuildingType.MagicTower); // persisted ints must not shift
        Assert.Equal(8, (int)BuildingType.PumpkinFarm);
    }

    [Fact]
    public void The_fisher_hut_is_merged_into_the_fishing_hut_but_keeps_its_persisted_value()
    {
        Assert.DoesNotContain(BuildingType.FisherHut, BuildingCatalogue.AllTypes);
        Assert.Equal(0, BuildingCatalogue.MaxLevelFor(BuildingType.FisherHut));
        Assert.Null(BuildingCatalogue.TryGet(BuildingType.FisherHut, 1));
        Assert.DoesNotContain(BuildingType.FisherHut, BuildingCatalogue.StorageCappedProducers);
        Assert.Equal(15, (int)BuildingType.FisherHut); // persisted ints must not shift
    }

    [Fact]
    public void The_fisher_hut_can_no_longer_be_built()
    {
        var settlement = SettlementWith(10);

        var decision = settlement.PlanBuild(
            BuildingType.FisherHut, new HexCoord(1, 0), Terrain.Sea, T0, Guid.CreateVersion7(),
            speedFactor: 1.0, isCoastalWater: true);

        Assert.False(decision.Accepted);
        Assert.Equal(BuildRejection.UnknownBuildingLevel, decision.Rejection);
    }

    [Fact]
    public void The_magic_tower_can_no_longer_be_built()
    {
        var settlement = SettlementWith(10);

        var decision = settlement.PlanBuild(
            BuildingType.MagicTower, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.False(decision.Accepted);
        Assert.Equal(BuildRejection.UnknownBuildingLevel, decision.Rejection);
    }

    [Fact]
    public void Totals_ignore_a_stray_magic_tower_instead_of_throwing()
    {
        var (production, _) = BuildingCatalogue.Totals(
            [new PlacedBuilding(new HexCoord(1, 0), BuildingType.MagicTower, 3)], terrainAt: null);

        Assert.True(production.IsZero);
    }
}
