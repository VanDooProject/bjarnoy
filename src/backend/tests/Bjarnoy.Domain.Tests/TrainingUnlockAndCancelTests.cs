using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The training building's level unlocks units (checked against the building the order goes to, <c>docs/design/units-and-ships.md</c>
/// section 1) and any order of a building's queue can be cancelled for a 50 % refund of the units not trained yet.
/// </summary>
public class TrainingUnlockAndCancelTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);
    private static readonly HexCoord A = new(1, 0);
    private static readonly HexCoord B = new(2, 0);

    private static Settlement Found(int longhouse, params PlacedBuilding[] buildings)
    {
        var all = new List<PlacedBuilding> { new(Centre, BuildingType.Longhouse, longhouse) };
        all.AddRange(buildings);
        var (production, _) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = all,
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(2_000), production, ResourceAmounts.Uniform(100_000_000), T0),
        };
    }

    private static PlacedBuilding Barracks(HexCoord at, int level) => new(at, BuildingType.Barracks, level);

    private static TrainDecision Plan(
        Settlement s, UnitType type, int count, HexCoord at, TrainingSplit split = TrainingSplit.Here, DateTimeOffset? now = null) =>
        s.PlanTrain(type, count, now ?? T0, Guid.CreateVersion7, at, split);

    private static Settlement Train(Settlement s, UnitType type, int count, HexCoord at, DateTimeOffset? now = null)
    {
        var decision = Plan(s, type, count, at, now: now);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        return s.EnqueueTraining(decision.Orders, now ?? T0);
    }

    // --- building level unlocks --------------------------------------------------------------------------------------------------

    [Theory]
    [InlineData(UnitType.Thrall, 1)]
    [InlineData(UnitType.Spearman, 3)]
    [InlineData(UnitType.Axeman, 6)]
    [InlineData(UnitType.Berserker, 10)]
    [InlineData(UnitType.Bowman, 1)]
    [InlineData(UnitType.Provisioner, 1)]
    [InlineData(UnitType.Settler, 5)]
    [InlineData(UnitType.CampBuilder, 10)]
    [InlineData(UnitType.Ram, 10)]
    [InlineData(UnitType.Catapult, 10)]
    public void The_land_roster_has_the_building_levels_of_the_design_table(UnitType type, int level) =>
        Assert.Equal(level, UnitCatalogue.Get(type).RequiredBuildingLevel);

    [Fact]
    public void Berserker_no_longer_needs_the_axeman_and_the_siege_engines_only_need_the_berserker()
    {
        Assert.Null(UnitCatalogue.Get(UnitType.Berserker).RequiredUnitType);
        Assert.Equal(UnitType.Berserker, UnitCatalogue.Get(UnitType.Ram).RequiredUnitType);
        Assert.Equal(UnitType.Berserker, UnitCatalogue.Get(UnitType.Catapult).RequiredUnitType);
        Assert.Equal(1, UnitCatalogue.Get(UnitType.Ram).RequiredLonghouseLevel);
        Assert.Equal(1, UnitCatalogue.Get(UnitType.Catapult).RequiredLonghouseLevel);
    }

    [Fact]
    public void A_unit_is_refused_in_a_building_below_its_level_and_accepted_at_it()
    {
        var s = Found(10, Barracks(A, 2), Barracks(B, 3));

        Assert.Equal(TrainRejection.BuildingLevelTooLow, Plan(s, UnitType.Spearman, 1, A).Rejection);
        Assert.True(Plan(s, UnitType.Spearman, 1, B).Accepted);
    }

    [Fact]
    public void The_level_is_the_ordering_buildings_own_not_the_best_of_the_type()
    {
        // A level-20 Barracks stands, but the order goes to the level-2 one.
        var s = Found(10, Barracks(A, 2), Barracks(B, 20));

        var decision = Plan(s, UnitType.Spearman, 1, A);

        Assert.Equal(TrainRejection.BuildingLevelTooLow, decision.Rejection);
    }

    [Fact]
    public void A_unit_no_building_of_the_type_has_the_level_for_is_still_refused()
    {
        var s = Found(10, Barracks(A, 2));

        Assert.False(Plan(s, UnitType.Spearman, 1, A).Accepted);
    }

    [Fact]
    public void A_distributed_order_only_goes_to_buildings_that_have_the_level()
    {
        var s = Found(10, Barracks(A, 5), Barracks(B, 2), Barracks(new HexCoord(3, 0), 4));

        var decision = Plan(s, UnitType.Spearman, 6, A, TrainingSplit.Evenly);

        Assert.True(decision.Accepted);
        Assert.DoesNotContain(decision.Orders, o => o.BuildingCoord == B);
        Assert.Equal(6, decision.Orders.Sum(o => o.Count));
        Assert.Equal(2, decision.Orders.Count);
    }

    [Fact]
    public void A_distributed_order_started_from_a_building_below_the_level_is_refused()
    {
        var s = Found(10, Barracks(A, 5), Barracks(B, 2));

        Assert.Equal(TrainRejection.BuildingLevelTooLow, Plan(s, UnitType.Spearman, 4, B, TrainingSplit.Evenly).Rejection);
    }

    [Fact]
    public void The_units_own_longhouse_gate_still_applies_on_top_of_the_building_level()
    {
        // Axeman: Barracks 6 and its own Longhouse 6.
        var s = Found(5, Barracks(A, 8));

        Assert.Equal(TrainRejection.UnitNotAvailable, Plan(s, UnitType.Axeman, 1, A).Rejection);
        Assert.True(Plan(Found(6, Barracks(A, 8)), UnitType.Axeman, 1, A).Accepted);
    }

    // --- cancel ------------------------------------------------------------------------------------------------------------------

    private static ResourceAmounts Stock(Settlement s, DateTimeOffset at) => s.Resources.At(at);

    [Fact]
    public void Cancelling_a_waiting_order_refunds_half_of_the_whole_order()
    {
        var s = Train(Train(Found(10, Barracks(A, 3)), UnitType.Spearman, 2, A), UnitType.Spearman, 4, A);
        var waiting = s.TrainingQueue.Last();
        var before = Stock(s, T0);

        var result = s.CancelTraining(waiting.Id, T0);

        Assert.True(result.Accepted);
        var cost = UnitCatalogue.Get(UnitType.Spearman).TrainingCost;
        Assert.Equal(before.Wood + cost.Wood * 4 * 0.5, Stock(result.Settlement!, T0).Wood, 6);
        Assert.Equal(before.Iron + cost.Iron * 4 * 0.5, Stock(result.Settlement!, T0).Iron, 6);
        Assert.Single(result.Settlement!.TrainingQueue);
    }

    [Fact]
    public void Cancelling_a_running_order_keeps_the_trained_units_and_refunds_half_of_the_rest()
    {
        var s = Train(Found(10, Barracks(A, 3)), UnitType.Spearman, 5, A);
        var order = s.TrainingQueue.Single();
        var now = order.StartedAt + order.PerUnitDuration * 2 + TimeSpan.FromSeconds(1); // two units done
        var settled = s.SettleTo(now).Settlement;
        var before = Stock(settled, now);

        var result = settled.CancelTraining(order.Id, now);

        Assert.True(result.Accepted);
        var after = result.Settlement!;
        Assert.Empty(after.TrainingQueue);
        Assert.Equal(2, after.Garrison.Single(g => g.Type == UnitType.Spearman).Count);
        var cost = UnitCatalogue.Get(UnitType.Spearman).TrainingCost;
        Assert.Equal(before.Wood + cost.Wood * 3 * 0.5, Stock(after, now).Wood, 6);
    }

    [Fact]
    public void Cancelling_the_running_order_moves_the_orders_behind_it_up()
    {
        var s = Train(Train(Found(10, Barracks(A, 3)), UnitType.Spearman, 4, A), UnitType.Spearman, 2, A);
        var running = s.TrainingQueue[0];
        var next = s.TrainingQueue[1];
        var now = T0 + running.PerUnitDuration * 1.5;

        var after = s.CancelTraining(running.Id, now).Settlement!;

        var moved = Assert.Single(after.TrainingQueue);
        Assert.Equal(next.Id, moved.Id);
        Assert.Equal(now, moved.StartedAt);
        Assert.Equal(next.PerUnitDuration, moved.PerUnitDuration);
    }

    [Fact]
    public void Cancelling_a_waiting_order_in_the_middle_closes_the_gap_in_that_building_only()
    {
        var s = Found(10, Barracks(A, 3), Barracks(B, 3));
        s = Train(s, UnitType.Spearman, 2, A);
        s = Train(s, UnitType.Spearman, 3, A);
        s = Train(s, UnitType.Spearman, 1, A);
        s = Train(s, UnitType.Spearman, 2, B);
        var middle = s.TrainingQueue[1];
        var last = s.TrainingQueue[2];
        var otherBuilding = s.TrainingQueue[3];

        var after = s.CancelTraining(middle.Id, T0).Settlement!;

        Assert.Equal(middle.StartedAt, after.TrainingQueue.Single(o => o.Id == last.Id).StartedAt);
        Assert.Equal(otherBuilding.StartedAt, after.TrainingQueue.Single(o => o.Id == otherBuilding.Id).StartedAt);
    }

    [Fact]
    public void Cancelling_an_order_that_is_not_in_the_queue_or_already_done_is_refused()
    {
        var s = Train(Found(10, Barracks(A, 3)), UnitType.Spearman, 1, A);
        var order = s.TrainingQueue.Single();

        Assert.Equal(CancelTrainingRejection.OrderNotFound, s.CancelTraining(Guid.NewGuid(), T0).Rejection);
        Assert.Equal(CancelTrainingRejection.OrderNotFound, s.CancelTraining(order.Id, order.CompletesAt).Rejection);
    }

    [Fact]
    public void The_refund_of_an_order_is_half_of_the_cost_of_its_untrained_units()
    {
        var order = new TrainingOrder
        {
            Id = Guid.NewGuid(),
            BuildingCoord = A,
            UnitType = UnitType.Spearman,
            Count = 4,
            StartedAt = T0,
            PerUnitDuration = TimeSpan.FromMinutes(10),
        };
        var cost = UnitCatalogue.Get(UnitType.Spearman).TrainingCost;

        Assert.Equal(cost * 2.0, Settlement.TrainingCancelRefund(order, T0));
        Assert.Equal(cost * 1.5, Settlement.TrainingCancelRefund(order, T0 + TimeSpan.FromMinutes(10)));
        Assert.Equal(cost * 0.0, Settlement.TrainingCancelRefund(order, T0 + TimeSpan.FromMinutes(40)));
    }
}
