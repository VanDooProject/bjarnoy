using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Construction slots tied to longhouse level, multi-slot buildings, and the
/// premium build queue (issue #158).
/// </summary>
public sealed class ConstructionSlotTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);

    private static Settlement Found(int longhouseLevel = 1)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);

        // Fully stocked (ResourcePool.Create clamps to capacity), so these
        // tests are about slots and reservations, not affordability edges —
        // note that capacity is a real function of what stands (recomputed on
        // every WithRate call), so it cannot be inflated past the catalogue's
        // own numbers no matter what is requested here.
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, longhouseLevel)],
            Resources = ResourcePool.Create(
                ResourceAmounts.Uniform(1_000_000), production, capacity, T0),
        };
    }

    [Theory]
    [InlineData(1, 2)]
    [InlineData(5, 2)]
    [InlineData(9, 2)]
    [InlineData(10, 3)]
    [InlineData(14, 3)]
    [InlineData(15, 4)]
    [InlineData(20, 5)]
    public void Construction_slots_follow_the_longhouse_level_formula(int longhouseLevel, int expectedSlots)
    {
        var settlement = Found(longhouseLevel);

        Assert.Equal(expectedSlots, settlement.ConstructionSlots);
    }

    [Fact]
    public void A_razed_settlement_still_reports_the_level_1_floor()
    {
        var settlement = Found(1) with { Buildings = [] };

        Assert.Equal(2, settlement.ConstructionSlots);
    }

    [Fact]
    public void A_longhouse_upgrade_needs_every_slot_free_and_blocks_the_rest()
    {
        // Longhouse level 1 has 2 slots (per the formula). A Farm build
        // already occupies one of them.
        var settlement = Found();
        var farmOrder = settlement.PlanBuild(
            BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 1);
        Assert.True(farmOrder.Accepted);
        var withFarm = settlement.Enqueue(farmOrder.Order!, T0);

        Assert.Equal(1, withFarm.FreeSlots);

        // A longhouse upgrade needs *every* slot, not just one — it cannot
        // start (and has nowhere to wait since maxWaitingOrders is 0 here),
        // even though one slot is free.
        var upgrade = withFarm.PlanBuild(
            BuildingType.Longhouse, Centre, Terrain.Grass, T0, Guid.CreateVersion7());
        Assert.Equal(BuildRejection.NoFreeSlot, upgrade.Rejection);

        // With premium queueing it goes to the waiting tail instead, and it
        // occupies zero slots while waiting — the farm keeps building.
        var upgradeWaiting = withFarm.PlanBuild(
            BuildingType.Longhouse, Centre, Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 3);
        Assert.True(upgradeWaiting.Accepted);
        Assert.True(upgradeWaiting.Order!.IsWaiting);

        var queued = withFarm.Enqueue(upgradeWaiting.Order!, T0);
        Assert.Equal(1, queued.UsedSlots);

        // Once the farm frees its slot, the longhouse upgrade (OccupiesAllSlots)
        // must claim every slot the settlement has — not just the one that
        // freed up — the instant it is promoted.
        var afterFarm = queued.SettleTo(farmOrder.Order!.CompletesAt!.Value).Settlement;
        var promotedLonghouse = Assert.Single(afterFarm.ActiveOrders, o => o.Type == BuildingType.Longhouse);
        Assert.False(promotedLonghouse.IsWaiting);
        Assert.Equal(afterFarm.ConstructionSlots, afterFarm.UsedSlots);
    }

    [Fact]
    public void Past_slot_count_with_no_waiting_room_is_refused_with_NoFreeSlot()
    {
        var settlement = Found();
        var first = settlement.PlanBuild(
            BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());
        var withFirst = settlement.Enqueue(first.Order!, T0);
        var second = withFirst.PlanBuild(
            BuildingType.Farm, new HexCoord(0, 1), Terrain.Grass, T0, Guid.CreateVersion7());
        var withSecond = withFirst.Enqueue(second.Order!, T0);

        Assert.Equal(0, withSecond.FreeSlots);

        var third = withSecond.PlanBuild(
            BuildingType.Farm, new HexCoord(-1, 1), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 0);

        Assert.Equal(BuildRejection.NoFreeSlot, third.Rejection);
    }

    [Fact]
    public void A_waiting_order_spends_nothing_stakes_no_stub_and_shows_in_reserved_resources()
    {
        var settlement = Found();
        var first = settlement.PlanBuild(
            BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());
        var withFirst = settlement.Enqueue(first.Order!, T0);
        var second = withFirst.PlanBuild(
            BuildingType.Farm, new HexCoord(0, 1), Terrain.Grass, T0, Guid.CreateVersion7());
        var withSecond = withFirst.Enqueue(second.Order!, T0);

        var coord = new HexCoord(-1, 1);
        var third = withSecond.PlanBuild(
            BuildingType.Farm, coord, Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 3);
        Assert.True(third.Accepted);
        Assert.True(third.Order!.IsWaiting);

        var stockBefore = withSecond.Resources.At(T0);
        var queued = withSecond.Enqueue(third.Order!, T0);
        var stockAfter = queued.Resources.At(T0);

        Assert.Equal(stockBefore.Wood, stockAfter.Wood, 6);
        Assert.DoesNotContain(queued.Buildings, b => b.Coord == coord);

        var cost = BuildingCatalogue.Get(BuildingType.Farm, 1).Cost;
        Assert.Equal(cost.Wood, queued.ReservedResources.Wood, 6);
    }

    [Fact]
    public void Building_payment_frees_storage_headroom_while_a_reservation_does_not()
    {
        var settlement = Found();
        var cost = BuildingCatalogue.Get(BuildingType.Farm, 1).Cost;

        // A building order pays immediately — the stock actually drops.
        var buildOrder = settlement.PlanBuild(
            BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());
        var afterBuild = settlement.Enqueue(buildOrder.Order!, T0);
        Assert.Equal(settlement.Resources.At(T0).Wood - cost.Wood, afterBuild.Resources.At(T0).Wood, 6);

        // A waiting order's cost still sits in Stock — only ReservedResources
        // (and hence AvailableResources) reflects it.
        var withFirst = settlement.Enqueue(
            settlement.PlanBuild(BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);
        var withSecond = withFirst.Enqueue(
            withFirst.PlanBuild(BuildingType.Farm, new HexCoord(0, 1), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);
        var waitingOrder = withSecond.PlanBuild(
            BuildingType.Farm, new HexCoord(-1, 1), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 1);
        var withWaiting = withSecond.Enqueue(waitingOrder.Order!, T0);

        Assert.Equal(withSecond.Resources.At(T0).Wood, withWaiting.Resources.At(T0).Wood, 6);
        Assert.Equal(withSecond.Resources.At(T0).Wood - cost.Wood, withWaiting.AvailableResources(T0).Wood, 6);
    }

    [Fact]
    public void Promotion_on_completion_spends_at_the_completion_instant()
    {
        var settlement = Found();
        var first = settlement.Enqueue(
            settlement.PlanBuild(BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);
        var withSecond = first.Enqueue(
            first.PlanBuild(BuildingType.Farm, new HexCoord(0, 1), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);

        var waitingDecision = withSecond.PlanBuild(
            BuildingType.Farm, new HexCoord(-1, 1), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 1);
        var withWaiting = withSecond.Enqueue(waitingDecision.Order!, T0);

        var stockAtCompletion = withWaiting.Resources.At(withWaiting.Queue[0].CompletesAt!.Value);
        var settled = withWaiting.SettleTo(withWaiting.Queue[0].CompletesAt!.Value);

        Assert.True(settled.Changed);
        var promoted = settled.Settlement.ActiveOrders.Single(o => o.Coord == new HexCoord(-1, 1));
        Assert.NotNull(promoted.StartedAt);
        Assert.Equal(withWaiting.Queue[0].CompletesAt!.Value, promoted.StartedAt);

        var cost = BuildingCatalogue.Get(BuildingType.Farm, 1).Cost;
        Assert.Equal(stockAtCompletion.Wood - cost.Wood, settled.Settlement.Resources.At(promoted.StartedAt!.Value).Wood, 6);
    }

    [Fact]
    public void Cancelling_a_building_order_promotes_a_waiting_one_immediately()
    {
        var settlement = Found();
        var first = settlement.Enqueue(
            settlement.PlanBuild(BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);
        var withSecond = first.Enqueue(
            first.PlanBuild(BuildingType.Farm, new HexCoord(0, 1), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);

        var waitingDecision = withSecond.PlanBuild(
            BuildingType.Farm, new HexCoord(-1, 1), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 1);
        var withWaiting = withSecond.Enqueue(waitingDecision.Order!, T0);

        var toCancel = withWaiting.ActiveOrders.First().Id;
        var result = withWaiting.CancelBuild(toCancel, T0);

        Assert.True(result.Accepted);
        Assert.Equal(2, result.Settlement!.Queue.Count);
        Assert.All(result.Settlement.Queue, o => Assert.False(o.IsWaiting));
    }

    [Fact]
    public void A_settle_whose_only_change_is_promotion_reports_changed_true()
    {
        var settlement = Found();
        var first = settlement.Enqueue(
            settlement.PlanBuild(BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);
        var withSecond = first.Enqueue(
            first.PlanBuild(BuildingType.Farm, new HexCoord(0, 1), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);

        var waitingDecision = withSecond.PlanBuild(
            BuildingType.Farm, new HexCoord(-1, 1), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 1);
        var withWaiting = withSecond.Enqueue(waitingDecision.Order!, T0);

        // Cancel one building order out-of-band (simulating something else
        // freeing a slot without a completion), then settle right at that
        // same instant: nothing "completes" in this settle, but the
        // already-freed slot still needs a promotion pass — no, instead:
        // directly assert on SettleTo after a completion, since Changed must
        // be true due to promotion even if we only check that flag.
        var result = withWaiting.SettleTo(withWaiting.Queue.First(o => !o.IsWaiting).CompletesAt!.Value);

        Assert.True(result.Changed);
    }

    [Fact]
    public void A_waiting_order_queued_before_a_speed_change_runs_at_the_new_speed()
    {
        var settlement = Found();
        var first = settlement.Enqueue(
            settlement.PlanBuild(BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);
        var withSecond = first.Enqueue(
            first.PlanBuild(BuildingType.Farm, new HexCoord(0, 1), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);

        var waitingDecision = withSecond.PlanBuild(
            BuildingType.Farm, new HexCoord(-1, 1), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 1);
        var withWaiting = withSecond.Enqueue(waitingDecision.Order!, T0);

        var firstOrder = withWaiting.ActiveOrders.OrderBy(o => o.Coord.Q).First();
        var completesAt = withWaiting.Queue.Where(o => !o.IsWaiting).Min(o => o.CompletesAt!.Value);

        // The already-started orders' own CompletesAt must be untouched by
        // the speed change; only the waiting order, which starts *at* the
        // speed change, runs at the new (2x) factor.
        var settled = withWaiting.SettleTo(completesAt, speedFactor: 2.0);

        Assert.True(settled.Changed);
        var stillBuilding = settled.Settlement.ActiveOrders.Where(o => o.Coord != new HexCoord(-1, 1)).ToList();
        foreach (var order in stillBuilding)
        {
            var original = withWaiting.Queue.Single(o => o.Id == order.Id);
            Assert.Equal(original.CompletesAt, order.CompletesAt);
        }

        var promoted = settled.Settlement.ActiveOrders.Single(o => o.Coord == new HexCoord(-1, 1));
        var baseDuration = BuildingCatalogue.Get(BuildingType.Farm, 1).BuildDuration;
        Assert.Equal(
            completesAt + TimeSpan.FromTicks(baseDuration.Ticks / 2), promoted.CompletesAt);
    }

    [Fact]
    public void Cancelling_a_waiting_order_refunds_nothing()
    {
        var settlement = Found();
        var first = settlement.Enqueue(
            settlement.PlanBuild(BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);
        var withSecond = first.Enqueue(
            first.PlanBuild(BuildingType.Farm, new HexCoord(0, 1), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);

        var waitingDecision = withSecond.PlanBuild(
            BuildingType.Farm, new HexCoord(-1, 1), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 1);
        var withWaiting = withSecond.Enqueue(waitingDecision.Order!, T0);

        var stockBefore = withWaiting.Resources.At(T0);
        var result = withWaiting.CancelBuild(waitingDecision.Order!.Id, T0);

        Assert.True(result.Accepted);
        Assert.Equal(stockBefore.Wood, result.Settlement!.Resources.At(T0).Wood, 6);
        Assert.Equal(2, result.Settlement.Queue.Count);
    }

    [Fact]
    public void One_jump_and_step_by_step_settling_agree_across_a_promotion()
    {
        var settlement = Found();
        var first = settlement.Enqueue(
            settlement.PlanBuild(BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);
        var withSecond = first.Enqueue(
            first.PlanBuild(BuildingType.Farm, new HexCoord(0, 1), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);
        var waitingDecision = withSecond.PlanBuild(
            BuildingType.Farm, new HexCoord(-1, 1), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 1);
        var withWaiting = withSecond.Enqueue(waitingDecision.Order!, T0);

        var firstCompletion = withWaiting.Queue.Where(o => !o.IsWaiting).Min(o => o.CompletesAt!.Value);
        var farAhead = firstCompletion.AddDays(30);

        var oneJump = withWaiting.SettleTo(farAhead).Settlement;

        var stepped = withWaiting.SettleTo(firstCompletion).Settlement;
        stepped = stepped.SettleTo(farAhead).Settlement;

        Assert.Equal(oneJump.Queue.Count, stepped.Queue.Count);
        Assert.Equal(oneJump.Buildings.Count, stepped.Buildings.Count);
        Assert.Equal(oneJump.Resources.At(farAhead).Wood, stepped.Resources.At(farAhead).Wood, 3);
        Assert.Equal(oneJump.Resources.At(farAhead).Food, stepped.Resources.At(farAhead).Food, 3);
    }

    [Fact]
    public void With_max_orders_per_hex_one_a_second_order_on_a_hex_is_refused()
    {
        var settlement = Found();
        var coord = new HexCoord(1, 0);
        var first = settlement.PlanBuild(
            BuildingType.Farm, coord, Terrain.Grass, T0, Guid.CreateVersion7(), maxOrdersPerHex: 1);
        var queued = settlement.Enqueue(first.Order!, T0);

        var second = queued.PlanBuild(
            BuildingType.Farm, coord, Terrain.Grass, T0, Guid.CreateVersion7(), maxOrdersPerHex: 1);

        Assert.Equal(BuildRejection.AlreadyQueuedOnHex, second.Rejection);
    }

    [Fact]
    public void With_max_orders_per_hex_three_a_level_chain_queues_completes_in_order_and_refuses_skipped_levels()
    {
        // Longhouse level 2: a level-3 Farm needs RequiredLonghouseLevel 2.
        var settlement = Found(longhouseLevel: 2);
        var coord = new HexCoord(1, 0);

        var first = settlement.PlanBuild(
            BuildingType.Farm, coord, Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 3, maxOrdersPerHex: 3);
        Assert.True(first.Accepted);
        Assert.Equal(1, first.Order!.TargetLevel);
        var withFirst = settlement.Enqueue(first.Order!, T0);

        var second = withFirst.PlanBuild(
            BuildingType.Farm, coord, Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 3, maxOrdersPerHex: 3);
        Assert.True(second.Accepted);
        Assert.Equal(2, second.Order!.TargetLevel);
        var withSecond = withFirst.Enqueue(second.Order!, T0);

        var third = withSecond.PlanBuild(
            BuildingType.Farm, coord, Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 3, maxOrdersPerHex: 3);
        Assert.True(third.Accepted);
        Assert.Equal(3, third.Order!.TargetLevel);
        var withThird = withSecond.Enqueue(third.Order!, T0);

        // A 4th order is refused — maxOrdersPerHex caps it at 3, regardless
        // of level contiguity.
        var fourth = withThird.PlanBuild(
            BuildingType.Farm, coord, Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 3, maxOrdersPerHex: 3);
        Assert.Equal(BuildRejection.AlreadyQueuedOnHex, fourth.Rejection);

        // Only the first order fits a slot now (2 slots, one already used by
        // nothing else here so both fit — but the second and third are still
        // waiting on the same-hex contiguity rule, not slot count).
        Assert.Single(withThird.ActiveOrders, o => o.Coord == coord);
        Assert.Equal(2, withThird.WaitingOrders.Count(o => o.Coord == coord));

        // Complete the first: the second promotes (contiguity satisfied), not
        // the third, even though slots would allow it.
        var afterFirst = withThird.SettleTo(first.Order!.CompletesAt!.Value).Settlement;
        Assert.Contains(afterFirst.ActiveOrders, o => o.Coord == coord && o.TargetLevel == 2);
        Assert.DoesNotContain(afterFirst.ActiveOrders, o => o.Coord == coord && o.TargetLevel == 3);
        Assert.Contains(afterFirst.Buildings, b => b.Coord == coord && b.Level == 1);

        // Complete the second: the third promotes; buildings finish in level order.
        var secondOrder = afterFirst.ActiveOrders.Single(o => o.Coord == coord);
        var afterSecond = afterFirst.SettleTo(secondOrder.CompletesAt!.Value).Settlement;
        Assert.Contains(afterSecond.ActiveOrders, o => o.Coord == coord && o.TargetLevel == 3);
        Assert.Contains(afterSecond.Buildings, b => b.Coord == coord && b.Level == 2);

        var thirdOrder = afterSecond.ActiveOrders.Single(o => o.Coord == coord);
        var afterThird = afterSecond.SettleTo(thirdOrder.CompletesAt!.Value).Settlement;
        Assert.Contains(afterThird.Buildings, b => b.Coord == coord && b.Level == 3);
        Assert.DoesNotContain(afterThird.Queue, o => o.Coord == coord);
    }

    [Fact]
    public void A_raid_dropping_the_stock_below_reservations_prunes_the_waiting_tail()
    {
        var settlement = Found();
        var withFirst = settlement.Enqueue(
            settlement.PlanBuild(BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);
        var withSecond = withFirst.Enqueue(
            withFirst.PlanBuild(BuildingType.Farm, new HexCoord(0, 1), Terrain.Grass, T0, Guid.CreateVersion7()).Order!, T0);

        var waitingA = withSecond.PlanBuild(
            BuildingType.Farm, new HexCoord(-1, 1), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 3);
        var withWaitingA = withSecond.Enqueue(waitingA.Order!, T0);
        var waitingB = withWaitingA.PlanBuild(
            BuildingType.Farm, new HexCoord(1, -1), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 3);
        var withWaitingB = withWaitingA.Enqueue(waitingB.Order!, T0);

        Assert.Equal(2, withWaitingB.WaitingOrders.Count());

        // Simulate a raid that leaves the stock unable to cover even the
        // first waiting order's cost.
        var raided = withWaitingB.Resources.Adjust(
            new ResourceAmounts(Wood: -1_000_000, Stone: 0, Food: 0, Iron: 0), T0);
        var afterRaid = (withWaitingB with { Resources = raided }).DropUnfundedOrders(T0);

        Assert.Empty(afterRaid.WaitingOrders);
        Assert.Equal(2, afterRaid.ActiveOrders.Count());
    }
}
