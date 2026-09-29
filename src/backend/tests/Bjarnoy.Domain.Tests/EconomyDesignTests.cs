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
    public void A_buildings_level_can_never_exceed_the_longhouse_level_it_needs_except_for_storage_capped_producers()
    {
        foreach (var type in BuildingCatalogue.AllTypes.Where(t => t != BuildingType.Longhouse))
        {
            var unlock = BuildingCatalogue.UnlockLevel(type);
            var producer = BuildingCatalogue.StorageCappedProducers.Contains(type);
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
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(1_000_000), production, capacity, T0),
        };
    }

    private static BuildDecision PlanTower(Settlement settlement, HexCoord coord) =>
        settlement.PlanBuild(BuildingType.Tower, coord, Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 5);

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
    public void The_first_storage_house_is_never_refused_by_the_level_10_rule()
    {
        Assert.True(PlanStorage(SettlementWith(1), new HexCoord(1, 0)).Accepted);
    }

    [Fact]
    public void A_second_storage_house_is_refused_while_the_first_is_below_level_10()
    {
        var settlement = SettlementWith(12, (BuildingType.StorageHouse, 9));

        Assert.Equal(BuildingCatalogue.AdditionalStorageHouseLevel, 10);
        Assert.Equal(BuildRejection.StorageHouseTooLow, PlanStorage(settlement, new HexCoord(1, 0)).Rejection);
    }

    [Fact]
    public void A_queued_first_storage_house_already_blocks_a_second()
    {
        var settlement = SettlementWith(1);
        var first = PlanStorage(settlement, new HexCoord(1, 0));
        Assert.True(first.Accepted);
        var queued = settlement.Enqueue(first.Order!, T0);

        Assert.Equal(BuildRejection.StorageHouseTooLow, PlanStorage(queued, new HexCoord(1, 1)).Rejection);
    }

    [Fact]
    public void A_second_storage_house_is_allowed_once_one_stands_at_level_10()
    {
        var settlement = SettlementWith(12, (BuildingType.StorageHouse, 10));

        Assert.True(PlanStorage(settlement, new HexCoord(1, 0)).Accepted);
    }

    [Fact]
    public void Upgrading_a_storage_house_is_never_refused_by_the_level_10_rule()
    {
        var settlement = SettlementWith(5, (BuildingType.StorageHouse, 1), (BuildingType.StorageHouse, 2));

        var decision = PlanStorage(settlement, new HexCoord(-1, 0));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
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
