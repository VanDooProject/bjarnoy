using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Player razing of buildings, one level per order (<c>docs/design/construction-slots.md</c>, "Razing").</summary>
public sealed class RazeTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);
    private static readonly HexCoord FarmHex = new(1, 0);
    private static readonly HexCoord SecondHex = new(0, 1);
    private static readonly HexCoord ThirdHex = new(-1, 1);

    private static Settlement Found(double stock, params PlacedBuilding[] standing) => Found(stock, 1, standing);

    private static Settlement Found(double stock, int longhouseLevel, params PlacedBuilding[] standing)
    {
        var buildings = new List<PlacedBuilding> { new(Centre, BuildingType.Longhouse, longhouseLevel) };
        buildings.AddRange(standing);
        var (production, capacity) = BuildingCatalogue.Totals([.. buildings.Select(b => (b.Type, b.Level))]);

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = buildings,
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(stock), production, capacity, T0),
        };
    }

    private static BuildOrder PlanRaze(Settlement s, HexCoord coord, double speed = 1.0, int maxWaiting = 0)
    {
        var decision = s.PlanRaze(coord, T0, Guid.CreateVersion7(), speed, maxWaiting);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        return decision.Order!;
    }

    private static ResourceAmounts FloorThird(ResourceAmounts cost) =>
        new(Math.Floor(cost.Wood / 3), Math.Floor(cost.Stone / 3), Math.Floor(cost.Food / 3), Math.Floor(cost.Iron / 3));

    [Fact]
    public void A_raze_takes_75_percent_of_the_razed_levels_build_time_scaled_by_the_world_speed()
    {
        var s = Found(1_000, new PlacedBuilding(FarmHex, BuildingType.Farm, 3));
        var level3 = BuildingCatalogue.Get(BuildingType.Farm, 3);

        var order = PlanRaze(s, FarmHex, speed: 2.0);

        Assert.True(order.IsRaze);
        Assert.Equal(2, order.TargetLevel);
        Assert.Equal(3, order.LevelInWork);
        Assert.Equal(0.75, BuildingCatalogue.RazeTimeFactor);
        Assert.Equal(level3.BuildDuration * 0.75, order.BaseDuration);
        Assert.Equal(T0 + (level3.BuildDuration * 0.75 / 2.0), order.CompletesAt);
    }

    [Fact]
    public void A_raze_costs_nothing_and_the_building_keeps_working_at_its_level_until_it_finishes()
    {
        var s = Found(1_000, new PlacedBuilding(FarmHex, BuildingType.Farm, 3));
        var order = PlanRaze(s, FarmHex);
        var queued = s.Enqueue(order, T0);

        Assert.Equal(s.Resources.At(T0), queued.Resources.At(T0));

        var rateBefore = queued.Resources.RatePerHour;
        var justBefore = queued.SettleTo(order.CompletesAt!.Value - TimeSpan.FromSeconds(1));
        Assert.Empty(justBefore.Completed);
        Assert.Equal(3, justBefore.Settlement.Buildings.Single(b => b.Coord == FarmHex).Level);
        Assert.Equal(rateBefore, justBefore.Settlement.Resources.RatePerHour);

        var done = queued.SettleTo(order.CompletesAt!.Value);
        Assert.Equal(order.Id, Assert.Single(done.Completed).Id);
        Assert.Equal(2, done.Settlement.Buildings.Single(b => b.Coord == FarmHex).Level);
        Assert.Empty(done.Settlement.Queue);
        Assert.True(done.Settlement.Resources.RatePerHour.Food < rateBefore.Food);
    }

    [Fact]
    public void A_finished_raze_pays_back_a_third_of_the_razed_levels_cost_rounded_down_per_resource()
    {
        var s = Found(100, new PlacedBuilding(FarmHex, BuildingType.Farm, 3));
        var order = PlanRaze(s, FarmHex);
        var queued = s.Enqueue(order, T0);

        var stockBefore = queued.Resources.At(T0);
        var done = queued.SettleTo(order.CompletesAt!.Value).Settlement;

        var cost = BuildingCatalogue.Get(BuildingType.Farm, 3).Cost;
        var expected = FloorThird(cost);
        Assert.True(expected.Wood > 0 || expected.Stone > 0);

        // The old rate accrued until the completion instant; the refund lands on top of exactly that.
        var accrued = queued.Resources.RatePerHour * (order.CompletesAt!.Value - T0).TotalHours;
        var paid = done.Resources.At(order.CompletesAt!.Value) - stockBefore - accrued;
        Assert.Equal(expected.Wood, paid.Wood, 6);
        Assert.Equal(expected.Stone, paid.Stone, 6);
        Assert.Equal(expected.Food, paid.Food, 6);
        Assert.Equal(expected.Iron, paid.Iron, 6);
    }

    [Fact]
    public void The_refund_is_capped_by_the_storage_left_after_the_level_dropped()
    {
        // Stock sits right below the cap: the refund cannot push it past the capacity of the level that is left.
        var s = Found(1_000_000, new PlacedBuilding(FarmHex, BuildingType.StorageHouse, 5));
        var order = PlanRaze(s, FarmHex);
        var queued = s.Enqueue(order, T0);

        var done = queued.SettleTo(order.CompletesAt!.Value).Settlement;

        var capacityAfter = BuildingCatalogue.Totals(
            [(BuildingType.Longhouse, 1), (BuildingType.StorageHouse, 4)]).Capacity;
        Assert.Equal(capacityAfter, done.Resources.Capacity);
        Assert.True(done.Resources.At(order.CompletesAt!.Value).Covers(capacityAfter));
        Assert.Equal(capacityAfter.Wood, done.Resources.At(order.CompletesAt!.Value).Wood, 6);
    }

    [Fact]
    public void Razing_level_1_removes_the_building_and_refunds_its_queued_training_in_full()
    {
        var barracks = new PlacedBuilding(FarmHex, BuildingType.Barracks, 1);
        var s = Found(100, barracks) with
        {
            TrainingQueue =
            [
                new TrainingOrder
                {
                    Id = Guid.CreateVersion7(),
                    BuildingCoord = FarmHex,
                    UnitType = UnitType.Thrall,
                    Count = 4,
                    StartedAt = T0,
                    PerUnitDuration = TimeSpan.FromDays(1),
                },
            ],
        };
        var order = PlanRaze(s, FarmHex);
        Assert.Equal(0, order.TargetLevel);

        var queued = s.Enqueue(order, T0);
        var done = queued.SettleTo(order.CompletesAt!.Value).Settlement;

        Assert.DoesNotContain(done.Buildings, b => b.Coord == FarmHex);
        Assert.Empty(done.TrainingQueue);

        var trainingRefund = UnitCatalogue.Get(UnitType.Thrall).TrainingCost * 4;
        var buildRefund = FloorThird(BuildingCatalogue.Get(BuildingType.Barracks, 1).Cost);
        var accrued = queued.Resources.RatePerHour * (order.CompletesAt!.Value - T0).TotalHours;
        var gained = done.Resources.At(order.CompletesAt!.Value) - queued.Resources.At(T0) - accrued;
        Assert.Equal(trainingRefund.Wood + buildRefund.Wood, gained.Wood, 6);
        Assert.Equal(trainingRefund.Food + buildRefund.Food, gained.Food, 6);
    }

    [Fact]
    public void The_longhouse_cannot_be_razed()
    {
        var s = Found(1_000) with { Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 5)] };

        var decision = s.PlanRaze(Centre, T0, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.LonghouseCannotBeRazed, decision.Rejection);
    }

    [Fact]
    public void An_empty_hex_or_a_level_0_foundation_cannot_be_razed()
    {
        var s = Found(1_000, new PlacedBuilding(FarmHex, BuildingType.Farm, 0));

        Assert.Equal(BuildRejection.NoBuildingOnHex, s.PlanRaze(SecondHex, T0, Guid.CreateVersion7()).Rejection);
        Assert.Equal(BuildRejection.NoBuildingOnHex, s.PlanRaze(FarmHex, T0, Guid.CreateVersion7()).Rejection);
    }

    [Fact]
    public void A_hex_with_a_queued_order_takes_no_raze_and_a_hex_with_a_raze_takes_no_build()
    {
        var s = Found(1_000, 10, new PlacedBuilding(FarmHex, BuildingType.Farm, 1), new PlacedBuilding(SecondHex, BuildingType.Farm, 1));
        var razing = s.Enqueue(PlanRaze(s, FarmHex), T0);

        Assert.Equal(BuildRejection.AlreadyQueuedOnHex, razing.PlanRaze(FarmHex, T0, Guid.CreateVersion7()).Rejection);
        Assert.Equal(
            BuildRejection.AlreadyQueuedOnHex,
            razing.PlanBuild(BuildingType.Farm, FarmHex, Terrain.Grass, T0, Guid.CreateVersion7()).Rejection);

        var upgrade = s.PlanBuild(BuildingType.Farm, SecondHex, Terrain.Grass, T0, Guid.CreateVersion7());
        Assert.True(upgrade.Accepted, upgrade.Rejection.ToString());
        var building = s.Enqueue(upgrade.Order!, T0);
        Assert.Equal(BuildRejection.AlreadyQueuedOnHex, building.PlanRaze(SecondHex, T0, Guid.CreateVersion7()).Rejection);
    }

    [Fact]
    public void A_raze_occupies_the_slot_cost_of_the_level_it_razes()
    {
        var s = Found(1_000, new PlacedBuilding(FarmHex, BuildingType.Farm, 3));
        var order = PlanRaze(s, FarmHex);

        var queued = s.Enqueue(order, T0);

        Assert.Equal(BuildingCatalogue.Get(BuildingType.Farm, 3).SlotCost, queued.UsedSlots);
        Assert.Equal(s.ConstructionSlots - queued.UsedSlots, queued.FreeSlots);
    }

    private static Settlement WithAllSlotsBusy(out BuildOrder first, out BuildOrder second)
    {
        var s = Found(1_000_000, new PlacedBuilding(FarmHex, BuildingType.Farm, 3));
        first = s.PlanBuild(BuildingType.ReindeerHerder, SecondHex, Terrain.Grass, T0, Guid.CreateVersion7()).Order!;
        s = s.Enqueue(first, T0);
        second = s.PlanBuild(BuildingType.ReindeerHerder, ThirdHex, Terrain.Grass, T0, Guid.CreateVersion7()).Order!;
        s = s.Enqueue(second, T0);
        Assert.Equal(0, s.FreeSlots);
        return s;
    }

    [Fact]
    public void A_raze_with_no_free_slot_is_refused_without_waiting_room_and_waits_with_it_reserving_nothing()
    {
        var busy = WithAllSlotsBusy(out _, out _);

        Assert.Equal(BuildRejection.NoFreeSlot, busy.PlanRaze(FarmHex, T0, Guid.CreateVersion7(), maxWaitingOrders: 0).Rejection);

        var waiting = PlanRaze(busy, FarmHex, maxWaiting: 3);
        Assert.True(waiting.IsWaiting);

        var stockBefore = busy.Resources.At(T0);
        var queued = busy.Enqueue(waiting, T0);
        Assert.Equal(stockBefore, queued.Resources.At(T0));
        Assert.Equal(ResourceAmounts.Zero, queued.ReservedResources);
        Assert.Equal(busy.AvailableResources(T0), queued.AvailableResources(T0));
    }

    [Fact]
    public void A_waiting_raze_is_promoted_when_a_slot_frees_and_spends_and_stakes_nothing()
    {
        var busy = WithAllSlotsBusy(out var first, out _);
        var waiting = PlanRaze(busy, FarmHex, maxWaiting: 3);
        var queued = busy.Enqueue(waiting, T0);

        var at = first.CompletesAt!.Value;
        var after = queued.SettleTo(at).Settlement;

        var started = Assert.Single(after.ActiveOrders, o => o.Id == waiting.Id);
        Assert.True(started.IsRaze);
        Assert.Equal(at, started.StartedAt);
        Assert.Equal(at + started.BaseDuration, started.CompletesAt);
        Assert.Equal(3, after.Buildings.Single(b => b.Coord == FarmHex).Level);
    }

    [Fact]
    public void Cancelling_a_raze_is_free_and_leaves_the_building_as_it_is()
    {
        var s = Found(1_000, new PlacedBuilding(FarmHex, BuildingType.Farm, 3), new PlacedBuilding(SecondHex, BuildingType.Farm, 1));
        var queuedDeep = s.Enqueue(PlanRaze(s, FarmHex), T0);
        var queuedLast = s.Enqueue(PlanRaze(s, SecondHex), T0);

        var cancelledDeep = queuedDeep.CancelBuild(queuedDeep.Queue.Single().Id, T0).Settlement!;
        var cancelledLast = queuedLast.CancelBuild(queuedLast.Queue.Single().Id, T0).Settlement!;

        Assert.Empty(cancelledDeep.Queue);
        Assert.Equal(3, cancelledDeep.Buildings.Single(b => b.Coord == FarmHex).Level);
        Assert.Equal(s.Resources.At(T0), cancelledDeep.Resources.At(T0));

        // Cancelling the raze of a level-1 building must not remove it the way cancelling a level-1 build does.
        Assert.Empty(cancelledLast.Queue);
        Assert.Equal(1, cancelledLast.Buildings.Single(b => b.Coord == SecondHex).Level);
        Assert.Equal(s.Resources.At(T0), cancelledLast.Resources.At(T0));
    }
}
