using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class BuildingCatalogueTests
{
    [Fact]
    public void Every_type_has_a_definition_at_every_level()
    {
        foreach (var type in BuildingCatalogue.AllTypes)
        {
            for (var level = 1; level <= BuildingCatalogue.MaxLevel; level++)
            {
                var definition = BuildingCatalogue.TryGet(type, level);

                Assert.NotNull(definition);
                Assert.Equal(type, definition.Type);
                Assert.Equal(level, definition.Level);
                Assert.True(definition.Cost.IsNonNegative);
                Assert.True(definition.BuildDuration > TimeSpan.Zero);
            }
        }
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(BuildingCatalogue.MaxLevel + 1)]
    public void Levels_outside_the_range_have_no_definition(int level)
    {
        Assert.Null(BuildingCatalogue.TryGet(BuildingType.Farm, level));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => BuildingCatalogue.Get(BuildingType.Farm, level));
    }

    [Theory]
    [InlineData(BuildingType.Lumberjack, Terrain.Forest, true)]
    [InlineData(BuildingType.Lumberjack, Terrain.Grass, false)]
    [InlineData(BuildingType.Quarry, Terrain.Mountain, true)]
    [InlineData(BuildingType.Quarry, Terrain.Forest, false)]
    [InlineData(BuildingType.Farm, Terrain.Grass, true)]
    [InlineData(BuildingType.Farm, Terrain.Mountain, false)]
    [InlineData(BuildingType.MagicTower, Terrain.Grass, true)]
    [InlineData(BuildingType.MagicTower, Terrain.Sand, false)]
    [InlineData(BuildingType.PumpkinFarm, Terrain.Grass, true)]
    [InlineData(BuildingType.PumpkinFarm, Terrain.Mountain, false)]
    [InlineData(BuildingType.Tower, Terrain.Sand, true)]
    [InlineData(BuildingType.Tower, Terrain.Grass, true)]
    [InlineData(BuildingType.Tower, Terrain.Mountain, false)]
    public void Producers_are_gated_to_their_terrain(BuildingType type, Terrain terrain, bool allowed)
    {
        // This is the rule the legacy AllowedTiles list encoded by holding a
        // throwaway `new ForestTile()` and comparing reflected type names.
        Assert.Equal(allowed, BuildingCatalogue.Get(type, 1).AllowsTerrain(terrain));
    }

    [Theory]
    [InlineData(BuildingType.Longhouse)]
    [InlineData(BuildingType.StorageHouse)]
    public void Anchor_and_support_buildings_are_gated_to_grass(BuildingType type)
    {
        var definition = BuildingCatalogue.Get(type, 1);

        Assert.True(definition.AllowsTerrain(Terrain.Grass));
        Assert.False(definition.AllowsTerrain(Terrain.Sand));
        Assert.False(definition.AllowsTerrain(Terrain.Mountain));
        Assert.False(definition.AllowsTerrain(Terrain.Forest));
        Assert.False(definition.AllowsTerrain(Terrain.Sea));
    }

    [Fact]
    public void The_tower_is_gated_to_grass_or_sand()
    {
        var definition = BuildingCatalogue.Get(BuildingType.Tower, 1);

        Assert.True(definition.AllowsTerrain(Terrain.Grass));
        Assert.True(definition.AllowsTerrain(Terrain.Sand));
        Assert.False(definition.AllowsTerrain(Terrain.Mountain));
        Assert.False(definition.AllowsTerrain(Terrain.Forest));
        Assert.False(definition.AllowsTerrain(Terrain.Sea));
    }

    [Fact]
    public void The_fishing_hut_requires_coastal_water_instead_of_a_land_terrain()
    {
        var definition = BuildingCatalogue.Get(BuildingType.FishingHut, 1);

        Assert.True(definition.RequiresCoastalWater);
    }

    [Fact]
    public void No_building_may_stand_on_open_sea()
    {
        foreach (var type in BuildingCatalogue.AllTypes)
        {
            Assert.False(BuildingCatalogue.Get(type, 1).AllowsTerrain(Terrain.Sea));
        }
    }

    [Fact]
    public void Cost_grows_with_level()
    {
        for (var level = 2; level <= BuildingCatalogue.MaxLevel; level++)
        {
            var previous = BuildingCatalogue.Get(BuildingType.Farm, level - 1);
            var current = BuildingCatalogue.Get(BuildingType.Farm, level);

            Assert.True(current.Cost.Wood > previous.Cost.Wood);
            Assert.True(current.BuildDuration > previous.BuildDuration);
        }
    }

    [Fact]
    public void Production_grows_with_level()
    {
        var one = BuildingCatalogue.Get(BuildingType.Lumberjack, 1);
        var three = BuildingCatalogue.Get(BuildingType.Lumberjack, 3);

        Assert.Equal(one.ProductionPerHour.Wood * 3, three.ProductionPerHour.Wood, 6);
    }

    [Fact]
    public void Totals_start_at_the_base_capacity_with_nothing_built()
    {
        var (production, capacity) = BuildingCatalogue.Totals([]);

        Assert.True(production.IsZero);
        Assert.Equal(BuildingCatalogue.BaseStorageCapacity, capacity);
    }

    [Fact]
    public void Totals_sum_production_and_capacity_over_what_stands()
    {
        var (production, capacity) = BuildingCatalogue.Totals(
        [
            (BuildingType.Longhouse, 1),
            (BuildingType.Lumberjack, 2),
            (BuildingType.StorageHouse, 1),
        ]);

        var expectedWood =
            BuildingCatalogue.Get(BuildingType.Longhouse, 1).ProductionPerHour.Wood
            + BuildingCatalogue.Get(BuildingType.Lumberjack, 2).ProductionPerHour.Wood;

        Assert.Equal(expectedWood, production.Wood, 6);
        Assert.True(capacity.Wood > BuildingCatalogue.BaseStorageCapacity.Wood);
    }

    private static readonly HexCoord Origin = new(0, 0);

    /// <summary>A terrain lookup returning <paramref name="matching"/> for the first <paramref name="count"/> of Origin's six neighbours, and Grass for the rest and everywhere else.</summary>
    private static Func<HexCoord, Terrain> TerrainWithMatchingNeighbours(Terrain matching, int count)
    {
        var boosted = Origin.Neighbours().Take(count).ToHashSet();
        return coord => boosted.Contains(coord) ? matching : Terrain.Grass;
    }

    [Fact]
    public void BoostMultiplier_is_neutral_when_terrainAt_is_null()
    {
        Assert.Equal(1.0, BuildingCatalogue.BoostMultiplier(BuildingType.Lumberjack, Origin, terrainAt: null));
    }

    [Fact]
    public void BoostMultiplier_is_neutral_for_a_building_with_no_boost_entry()
    {
        var allForest = TerrainWithMatchingNeighbours(Terrain.Forest, 6);

        Assert.Equal(1.0, BuildingCatalogue.BoostMultiplier(BuildingType.Farm, Origin, allForest));
    }

    [Theory]
    [InlineData(0, 1.0)]
    [InlineData(1, 1.10)]
    [InlineData(3, 1.30)]
    [InlineData(5, 1.50)]
    [InlineData(6, 1.50)] // capped at 5 matching neighbours' worth
    public void BoostMultiplier_scales_10_percent_per_matching_neighbour_up_to_the_cap(
        int matchingNeighbours, double expected)
    {
        var terrainAt = TerrainWithMatchingNeighbours(Terrain.Forest, matchingNeighbours);

        Assert.Equal(expected, BuildingCatalogue.BoostMultiplier(BuildingType.Lumberjack, Origin, terrainAt), 6);
    }

    [Theory]
    [InlineData(BuildingType.Lumberjack, Terrain.Forest)]
    [InlineData(BuildingType.Quarry, Terrain.Mountain)]
    [InlineData(BuildingType.FishingHut, Terrain.Sea)]
    public void BoostMultiplier_only_counts_each_buildings_own_matching_terrain(BuildingType type, Terrain matching)
    {
        var terrainAt = TerrainWithMatchingNeighbours(matching, 6);

        Assert.Equal(1.50, BuildingCatalogue.BoostMultiplier(type, Origin, terrainAt), 6);

        // A different terrain than the one this building matches gives no boost at all.
        var wrongTerrain = matching == Terrain.Forest ? Terrain.Mountain : Terrain.Forest;
        var noMatch = TerrainWithMatchingNeighbours(wrongTerrain, 6);
        Assert.Equal(1.0, BuildingCatalogue.BoostMultiplier(type, Origin, noMatch), 6);
    }

    [Fact]
    public void Totals_with_terrain_applies_the_boost_to_the_matching_producer_only()
    {
        var allForest = TerrainWithMatchingNeighbours(Terrain.Forest, 6);
        var lumberjack = new PlacedBuilding(Origin, BuildingType.Lumberjack, 2);
        var farm = new PlacedBuilding(new HexCoord(5, 5), BuildingType.Farm, 2);

        var (production, _) = BuildingCatalogue.Totals([lumberjack, farm], allForest);

        var expectedWood = BuildingCatalogue.Get(BuildingType.Lumberjack, 2).ProductionPerHour.Wood * 1.50;
        var expectedFood = BuildingCatalogue.Get(BuildingType.Farm, 2).ProductionPerHour.Food; // unboosted

        Assert.Equal(expectedWood, production.Wood, 6);
        Assert.Equal(expectedFood, production.Food, 6);
    }
}

public class SettlementTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);

    /// <summary>
    /// A just-founded settlement: one longhouse, and a stock and capacity that
    /// are consistent with it. Capacity has to come from the catalogue rather
    /// than be invented, or the first completed building would recompute it
    /// downward and clamp the stock.
    /// </summary>
    private static Settlement Found(double stock = 400)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 1)],
            Resources = ResourcePool.Create(
                ResourceAmounts.Uniform(stock), production, capacity, T0),
        };
    }

    private static BuildOrder Plan(
        Settlement settlement, BuildingType type, HexCoord coord, Terrain terrain, DateTimeOffset now)
    {
        var decision = settlement.PlanBuild(type, coord, terrain, now, Guid.CreateVersion7());
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        return decision.Order!;
    }

    [Fact]
    public void A_new_settlement_claims_a_radius_around_its_longhouse()
    {
        var settlement = Found();

        Assert.True(settlement.Claims(Centre));
        Assert.True(settlement.Claims(new HexCoord(1, 0)));
        Assert.False(settlement.Claims(new HexCoord(9, 0)));
    }

    [Fact]
    public void The_claim_radius_grows_with_the_longhouse()
    {
        var small = Found();
        var large = small with
        {
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 6)],
        };

        Assert.True(large.ClaimRadius > small.ClaimRadius);
    }

    [Fact]
    public void Building_outside_the_claim_is_refused()
    {
        var settlement = Found();

        var decision = settlement.PlanBuild(
            BuildingType.Farm, new HexCoord(20, 0), Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.HexNotInSettlement, decision.Rejection);
    }

    [Fact]
    public void Building_on_the_wrong_terrain_is_refused()
    {
        var settlement = Found();

        var decision = settlement.PlanBuild(
            BuildingType.Lumberjack, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.TerrainNotAllowed, decision.Rejection);
    }

    [Fact]
    public void A_fishing_hut_is_refused_on_land_even_when_affordable()
    {
        var settlement = Found();

        var decision = settlement.PlanBuild(
            BuildingType.FishingHut, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.TerrainNotAllowed, decision.Rejection);
    }

    [Fact]
    public void A_fishing_hut_is_refused_on_open_sea_that_is_not_coastal()
    {
        var settlement = Found();

        // Terrain.Sea alone can't distinguish coastal water from open
        // sea — isCoastalWater is what actually gates a fishing hut.
        var decision = settlement.PlanBuild(
            BuildingType.FishingHut, new HexCoord(1, 0), Terrain.Sea, T0, Guid.CreateVersion7(),
            speedFactor: 1.0, isCoastalWater: false);

        Assert.Equal(BuildRejection.TerrainNotAllowed, decision.Rejection);
    }

    [Fact]
    public void A_fishing_hut_may_be_built_on_coastal_water()
    {
        var settlement = Found();

        var decision = settlement.PlanBuild(
            BuildingType.FishingHut, new HexCoord(1, 0), Terrain.Sea, T0, Guid.CreateVersion7(),
            speedFactor: 1.0, isCoastalWater: true);

        Assert.True(decision.Accepted);
    }

    [Fact]
    public void Building_that_cannot_be_afforded_is_refused()
    {
        var poor = Found(stock: 0);

        var decision = poor.PlanBuild(
            BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.NotEnoughResources, decision.Rejection);
    }

    [Fact]
    public void Being_rich_in_one_resource_does_not_pay_for_another()
    {
        var settlement = Found() with
        {
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 100_000, Stone: 0, Food: 0, Iron: 0),
                ResourceAmounts.Zero,
                ResourceAmounts.Uniform(100_000),
                T0),
        };

        // The farm needs stone as well as wood. The legacy affordability check
        // would have let this through.
        var decision = settlement.PlanBuild(
            BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.NotEnoughResources, decision.Rejection);
    }

    [Fact]
    public void Enqueueing_charges_for_the_build_immediately()
    {
        var settlement = Found();
        var before = settlement.Resources.At(T0);
        var order = Plan(settlement, BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0);

        var queued = settlement.Enqueue(order, T0);

        var cost = BuildingCatalogue.Get(BuildingType.Farm, 1).Cost;
        Assert.Equal(before.Wood - cost.Wood, queued.Resources.At(T0).Wood, 6);
        Assert.Single(queued.Queue);
    }

    [Fact]
    public void A_queued_build_does_not_produce_until_it_completes()
    {
        var settlement = Found();
        var order = Plan(settlement, BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0);
        var queued = settlement.Enqueue(order, T0);

        var justBefore = queued.SettleTo(order.CompletesAt.AddSeconds(-1));

        Assert.False(justBefore.Changed);
        Assert.Empty(justBefore.Settlement.Completed());
        Assert.Single(justBefore.Settlement.Queue);
    }

    [Fact]
    public void A_build_completes_by_clock_with_nothing_having_ticked()
    {
        var settlement = Found();
        var order = Plan(settlement, BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0);
        var queued = settlement.Enqueue(order, T0);

        var result = queued.SettleTo(order.CompletesAt);

        Assert.True(result.Changed);
        Assert.Empty(result.Settlement.Queue);
        Assert.Contains(result.Settlement.Buildings, b => b.Type == BuildingType.Farm && b.Level == 1);
        Assert.Equal(order.Id, Assert.Single(result.Completed).Id);
    }

    [Fact]
    public void Settling_before_anything_is_due_reports_no_change_so_nothing_is_written()
    {
        var settlement = Found();
        var order = Plan(settlement, BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0);
        var queued = settlement.Enqueue(order, T0);

        var result = queued.SettleTo(T0.AddMinutes(1));

        // The stock is only written when it changes: an idle read must leave
        // the pool's timestamp exactly where it was.
        Assert.False(result.Changed);
        Assert.Equal(queued.Resources, result.Settlement.Resources);
        Assert.Equal(queued, result.Settlement);
    }

    [Fact]
    public void A_completed_building_produces_from_its_completion_time_not_from_the_read()
    {
        var settlement = Found();
        var order = Plan(settlement, BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0);
        var queued = settlement.Enqueue(order, T0);

        var readLate = order.CompletesAt.AddHours(5);
        var settled = queued.SettleTo(readLate).Settlement;

        var foodAtCompletion = settled.Resources.Stock.Food;
        var rate = settled.Resources.RatePerHour.Food;

        // Five hours of output at the post-completion rate must be there even
        // though nobody looked during them, and the farm has to be part of that
        // rate rather than the longhouse alone.
        Assert.Equal(
            foodAtCompletion + (rate * 5), settled.Resources.At(readLate).Food, 6);
        Assert.True(rate > BuildingCatalogue.Get(BuildingType.Longhouse, 1).ProductionPerHour.Food);
        Assert.True(settled.Resources.At(readLate).Food < settled.Resources.Capacity.Food);
    }

    [Fact]
    public void SettleTo_applies_a_lumberjacks_forest_adjacency_boost_when_a_terrain_lookup_is_given()
    {
        var settlement = Found();
        var coord = new HexCoord(1, 0);
        var order = Plan(settlement, BuildingType.Lumberjack, coord, Terrain.Forest, T0);
        var queued = settlement.Enqueue(order, T0);

        // Every neighbour of the lumberjack's hex is Forest, so the boost caps at +50%.
        Func<HexCoord, Terrain> allForest = _ => Terrain.Forest;

        var boosted = queued.SettleTo(order.CompletesAt, terrainAt: allForest).Settlement;
        var unboosted = queued.SettleTo(order.CompletesAt).Settlement;

        // Only the lumberjack's own share of the wood rate is boosted; the
        // longhouse's flat contribution is unaffected — so the two rates
        // don't simply differ by a flat 1.5x.
        var longhouseWood = BuildingCatalogue.Get(BuildingType.Longhouse, 1).ProductionPerHour.Wood;
        var lumberjackWood = BuildingCatalogue.Get(BuildingType.Lumberjack, 1).ProductionPerHour.Wood;

        Assert.Equal(longhouseWood + lumberjackWood, unboosted.Resources.RatePerHour.Wood, 6);
        Assert.Equal(longhouseWood + (lumberjackWood * 1.50), boosted.Resources.RatePerHour.Wood, 6);
    }

    [Fact]
    public void SetBuildingLevel_applies_the_same_terrain_boost_as_SettleTo()
    {
        var settlement = Found();
        var coord = new HexCoord(1, 0);
        var order = Plan(settlement, BuildingType.Lumberjack, coord, Terrain.Forest, T0);
        var built = settlement.Enqueue(order, T0).SettleTo(order.CompletesAt).Settlement;

        Func<HexCoord, Terrain> allForest = _ => Terrain.Forest;
        var result = built.SetBuildingLevel(coord, level: 2, order.CompletesAt, terrainAt: allForest);

        Assert.True(result.Accepted);
        var expectedWood = BuildingCatalogue.Get(BuildingType.Lumberjack, 2).ProductionPerHour.Wood * 1.50
            + BuildingCatalogue.Get(BuildingType.Longhouse, 1).ProductionPerHour.Wood;
        Assert.Equal(expectedWood, result.Settlement!.Resources.RatePerHour.Wood, 6);
    }

    [Fact]
    public void Several_orders_complete_in_time_order_in_one_settle()
    {
        var settlement = Found();
        var first = Plan(settlement, BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0);
        var withFirst = settlement.Enqueue(first, T0);
        var second = Plan(withFirst, BuildingType.Lumberjack, new HexCoord(0, 1), Terrain.Forest, T0);
        var queued = withFirst.Enqueue(second, T0);

        var result = queued.SettleTo(T0.AddDays(1));

        Assert.True(result.Changed);
        Assert.Equal(2, result.Completed.Count);
        Assert.Empty(result.Settlement.Queue);
        Assert.Equal(3, result.Settlement.Buildings.Count);
    }

    [Fact]
    public void The_queue_is_capped()
    {
        var settlement = Found();
        var coords = new[] { new HexCoord(1, 0), new HexCoord(0, 1), new HexCoord(-1, 1) };

        foreach (var coord in coords)
        {
            var order = Plan(settlement, BuildingType.Farm, coord, Terrain.Grass, T0);
            settlement = settlement.Enqueue(order, T0);
        }

        Assert.Equal(Settlement.MaxQueueLength, settlement.Queue.Count);

        var overflow = settlement.PlanBuild(
            BuildingType.Farm, new HexCoord(1, -1), Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.QueueFull, overflow.Rejection);
    }

    [Fact]
    public void Two_orders_cannot_target_the_same_hex()
    {
        var settlement = Found();
        var coord = new HexCoord(1, 0);
        var order = Plan(settlement, BuildingType.Farm, coord, Terrain.Grass, T0);
        var queued = settlement.Enqueue(order, T0);

        var again = queued.PlanBuild(
            BuildingType.Farm, coord, Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.AlreadyQueuedOnHex, again.Rejection);
    }

    [Fact]
    public void A_different_building_cannot_replace_one_already_on_a_hex()
    {
        var settlement = Found();
        var coord = new HexCoord(1, 0);
        var order = Plan(settlement, BuildingType.Farm, coord, Terrain.Grass, T0);
        var built = settlement.Enqueue(order, T0).SettleTo(order.CompletesAt).Settlement;

        var decision = built.PlanBuild(
            BuildingType.StorageHouse, coord, Terrain.Grass, order.CompletesAt, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.HexOccupied, decision.Rejection);
    }

    [Fact]
    public void Building_the_same_type_on_an_occupied_hex_upgrades_it()
    {
        var settlement = Found();
        var coord = new HexCoord(1, 0);
        var first = Plan(settlement, BuildingType.Farm, coord, Terrain.Grass, T0);
        var built = settlement.Enqueue(first, T0).SettleTo(first.CompletesAt).Settlement;

        var upgrade = built.PlanBuild(
            BuildingType.Farm, coord, Terrain.Grass, first.CompletesAt, Guid.CreateVersion7());

        Assert.True(upgrade.Accepted);
        Assert.Equal(2, upgrade.Order!.TargetLevel);
    }

    [Fact]
    public void A_building_beyond_the_longhouses_level_is_refused()
    {
        var settlement = Found();

        // Tower level 1 needs a level-2 longhouse; a new settlement has 1.
        var decision = settlement.PlanBuild(
            BuildingType.Tower, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.LonghouseTooLow, decision.Rejection);
    }

    [Fact]
    public void A_second_longhouse_cannot_be_queued_through_the_build_menu()
    {
        // Founding (SettlementService.FoundAsync) is the only place a
        // longhouse comes from today; the build queue must refuse one on an
        // empty hex even though it is otherwise a perfectly buildable plot.
        var settlement = Found();

        var decision = settlement.PlanBuild(
            BuildingType.Longhouse, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.LonghousePlacementNotAllowed, decision.Rejection);
    }

    [Fact]
    public void The_existing_longhouse_can_still_be_levelled_up_through_the_build_menu()
    {
        var settlement = Found();

        var decision = settlement.PlanBuild(
            BuildingType.Longhouse, Centre, Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.True(decision.Accepted);
        Assert.Equal(2, decision.Order!.TargetLevel);
    }

    [Fact]
    public void Enqueueing_an_unaffordable_order_throws_rather_than_going_into_debt()
    {
        var settlement = Found();
        var order = Plan(settlement, BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0);
        var broke = settlement with
        {
            Resources = ResourcePool.Create(
                ResourceAmounts.Zero, ResourceAmounts.Zero, ResourceAmounts.Uniform(1000), T0),
        };

        Assert.Throws<InvalidOperationException>(() => broke.Enqueue(order, T0));
    }

    [Fact]
    public void Admin_setting_a_buildings_level_recomputes_rates_like_a_normal_completion()
    {
        var settlement = Found();
        var order = Plan(settlement, BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0);
        var built = settlement.Enqueue(order, T0).SettleTo(order.CompletesAt).Settlement;

        var result = built.SetBuildingLevel(new HexCoord(1, 0), level: 3, order.CompletesAt);

        Assert.True(result.Accepted);
        var farm = result.Settlement!.Buildings.Single(b => b.Type == BuildingType.Farm);
        Assert.Equal(3, farm.Level);

        var (expectedProduction, expectedCapacity) = BuildingCatalogue.Totals(
            result.Settlement.Buildings.Select(b => (b.Type, b.Level)));
        Assert.Equal(expectedProduction.Food, result.Settlement.Resources.RatePerHour.Food, 6);
        Assert.Equal(expectedCapacity.Wood, result.Settlement.Resources.Capacity.Wood, 6);
    }

    [Fact]
    public void Admin_setting_a_buildings_level_settles_first_so_no_production_is_lost()
    {
        var settlement = Found();
        var order = Plan(settlement, BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0);
        var built = settlement.Enqueue(order, T0).SettleTo(order.CompletesAt).Settlement;

        // Two hours of accrued production at the level-1 rate must survive the
        // level-set, exactly like a normal SettleTo would preserve it.
        var now = order.CompletesAt.AddHours(2);
        var stockJustBefore = built.Resources.At(now);

        var result = built.SetBuildingLevel(new HexCoord(1, 0), level: 2, now);

        Assert.True(result.Accepted);
        Assert.Equal(stockJustBefore.Food, result.Settlement!.Resources.At(now).Food, 6);
        Assert.Equal(now, result.Settlement.Resources.SettledAt);
    }

    [Fact]
    public void Setting_the_level_of_a_hex_with_no_building_is_refused()
    {
        var settlement = Found();

        var result = settlement.SetBuildingLevel(new HexCoord(5, 5), level: 1, T0);

        Assert.Equal(SetBuildingLevelRejection.BuildingNotFound, result.Rejection);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(BuildingCatalogue.MaxLevel + 1)]
    public void Setting_a_level_outside_the_catalogues_range_is_refused(int level)
    {
        var settlement = Found();

        var result = settlement.SetBuildingLevel(Centre, level, T0);

        Assert.Equal(SetBuildingLevelRejection.InvalidLevel, result.Rejection);
    }

    [Fact]
    public void A_speed_factor_of_two_halves_the_build_duration()
    {
        var settlement = Found();

        var normal = settlement.PlanBuild(
            BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());
        var doubled = settlement.PlanBuild(
            BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7(), speedFactor: 2.0);

        var baseDuration = normal.Order!.CompletesAt - T0;
        var doubledDuration = doubled.Order!.CompletesAt - T0;

        Assert.Equal((double)(baseDuration.Ticks / 2), doubledDuration.Ticks, 1);
    }

    [Fact]
    public void A_speed_factor_of_two_doubles_the_production_rate_a_completed_building_adds()
    {
        var settlement = Found();
        var order = Plan(settlement, BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0);
        var queued = settlement.Enqueue(order, T0);

        var normal = queued.SettleTo(order.CompletesAt).Settlement;
        var doubled = queued.SettleTo(order.CompletesAt, speedFactor: 2.0).Settlement;

        Assert.Equal(normal.Resources.RatePerHour.Food * 2, doubled.Resources.RatePerHour.Food, 6);
    }

    [Fact]
    public void A_speed_change_never_rescales_output_already_accrued()
    {
        var settlement = Found();
        var order = Plan(settlement, BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0);
        var queued = settlement.Enqueue(order, T0);

        // Two hours pass at 1x, the farm produces normally, then the admin
        // doubles the speed and the settlement is re-rated from "now" (this is
        // what SettlementService.RetuneSpeedAsync does): the stock already
        // earned at 1x must be untouched, only the rate going forward changes.
        var now = order.CompletesAt.AddHours(2);
        var settledAtOldSpeed = queued.SettleTo(now, speedFactor: 1.0).Settlement;
        var stockBeforeRetune = settledAtOldSpeed.Resources.At(now);

        var (production, capacity) = settledAtOldSpeed.CurrentTotals(speedFactor: 2.0);
        var retuned = settledAtOldSpeed with
        {
            Resources = settledAtOldSpeed.Resources.WithRate(production, capacity, now),
        };

        Assert.Equal(stockBeforeRetune.Food, retuned.Resources.At(now).Food, 6);
        Assert.Equal(settledAtOldSpeed.Resources.RatePerHour.Food * 2, retuned.Resources.RatePerHour.Food, 6);
    }
}

internal static class SettlementTestExtensions
{
    /// <summary>Buildings other than the founding longhouse.</summary>
    public static IReadOnlyList<PlacedBuilding> Completed(this Settlement settlement) =>
        [.. settlement.Buildings.Where(b => b.Type != BuildingType.Longhouse)];
}
