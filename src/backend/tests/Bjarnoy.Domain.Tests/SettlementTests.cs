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
    [InlineData(BuildingType.LumberCamp, Terrain.Forest, true)]
    [InlineData(BuildingType.LumberCamp, Terrain.Grass, false)]
    [InlineData(BuildingType.Quarry, Terrain.Mountain, true)]
    [InlineData(BuildingType.Quarry, Terrain.Forest, false)]
    [InlineData(BuildingType.Farm, Terrain.Grass, true)]
    [InlineData(BuildingType.Farm, Terrain.Mountain, false)]
    public void Producers_are_gated_to_their_terrain(BuildingType type, Terrain terrain, bool allowed)
    {
        // This is the rule the legacy AllowedTiles list encoded by holding a
        // throwaway `new ForestTile()` and comparing reflected type names.
        Assert.Equal(allowed, BuildingCatalogue.Get(type, 1).AllowsTerrain(terrain));
    }

    [Fact]
    public void Unrestricted_buildings_go_on_any_land_but_never_on_water()
    {
        var warehouse = BuildingCatalogue.Get(BuildingType.Warehouse, 1);

        Assert.True(warehouse.AllowsTerrain(Terrain.Grass));
        Assert.True(warehouse.AllowsTerrain(Terrain.Sand));
        Assert.True(warehouse.AllowsTerrain(Terrain.Mountain));
        Assert.False(warehouse.AllowsTerrain(Terrain.Sea));
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
        var one = BuildingCatalogue.Get(BuildingType.LumberCamp, 1);
        var three = BuildingCatalogue.Get(BuildingType.LumberCamp, 3);

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
            (BuildingType.LumberCamp, 2),
            (BuildingType.Warehouse, 1),
        ]);

        var expectedWood =
            BuildingCatalogue.Get(BuildingType.Longhouse, 1).ProductionPerHour.Wood
            + BuildingCatalogue.Get(BuildingType.LumberCamp, 2).ProductionPerHour.Wood;

        Assert.Equal(expectedWood, production.Wood, 6);
        Assert.True(capacity.Wood > BuildingCatalogue.BaseStorageCapacity.Wood);
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
            BuildingType.LumberCamp, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.TerrainNotAllowed, decision.Rejection);
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
                new ResourceAmounts(Wood: 100_000, Stone: 0, Grain: 0, Silver: 0),
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

        var grainAtCompletion = settled.Resources.Stock.Grain;
        var rate = settled.Resources.RatePerHour.Grain;

        // Five hours of output at the post-completion rate must be there even
        // though nobody looked during them, and the farm has to be part of that
        // rate rather than the longhouse alone.
        Assert.Equal(
            grainAtCompletion + (rate * 5), settled.Resources.At(readLate).Grain, 6);
        Assert.True(rate > BuildingCatalogue.Get(BuildingType.Longhouse, 1).ProductionPerHour.Grain);
        Assert.True(settled.Resources.At(readLate).Grain < settled.Resources.Capacity.Grain);
    }

    [Fact]
    public void Several_orders_complete_in_time_order_in_one_settle()
    {
        var settlement = Found();
        var first = Plan(settlement, BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0);
        var withFirst = settlement.Enqueue(first, T0);
        var second = Plan(withFirst, BuildingType.LumberCamp, new HexCoord(0, 1), Terrain.Forest, T0);
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
            BuildingType.Warehouse, coord, Terrain.Grass, order.CompletesAt, Guid.CreateVersion7());

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

        // Watchtower level 1 needs a level-2 longhouse; a new settlement has 1.
        var decision = settlement.PlanBuild(
            BuildingType.Watchtower, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.LonghouseTooLow, decision.Rejection);
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
}

internal static class SettlementTestExtensions
{
    /// <summary>Buildings other than the founding longhouse.</summary>
    public static IReadOnlyList<PlacedBuilding> Completed(this Settlement settlement) =>
        [.. settlement.Buildings.Where(b => b.Type != BuildingType.Longhouse)];
}
