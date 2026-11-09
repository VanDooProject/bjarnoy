using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>The optional, never-persisted linked-realm view on <see cref="Settlement"/> and the helpers the group settle builds on.</summary>
public sealed class LinkedSettlementContextTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);

    private static Settlement Found(int longhouseLevel = 1, double stock = 1_000_000)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, longhouseLevel)],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(stock), production, capacity, T0),
        };
    }

    private static BuildOrder Order(BuildingType type, HexCoord coord, int level = 1, bool waiting = false, int queuedSeconds = 0) => new()
    {
        Id = Guid.CreateVersion7(),
        Type = type,
        TargetLevel = level,
        Coord = coord,
        QueuedAt = T0.AddSeconds(queuedSeconds),
        BaseDuration = TimeSpan.FromMinutes(10),
        StartedAt = waiting ? null : T0,
        CompletesAt = waiting ? null : T0.AddMinutes(10),
    };

    private static LinkedQueueContext Context(
        int slots = 0, IReadOnlyList<BuildOrder>? queue = null, int lh = 0, int towerLimit = 0, int towers = 0,
        IReadOnlyList<PlacedBuilding>? buildings = null) =>
        new(slots, queue ?? [], lh, towerLimit, towers, buildings ?? []);

    [Fact]
    public void Without_a_linked_context_slots_are_the_own_slots()
    {
        var s = Found(10);

        Assert.Equal(3, s.OwnConstructionSlots);
        Assert.Equal(3, s.ConstructionSlots);
    }

    [Fact]
    public void Linked_slots_are_summed_and_the_other_queue_uses_them()
    {
        var s = Found() with { Linked = Context(slots: 3, queue: [Order(BuildingType.Farm, new HexCoord(5, 5))]) };

        Assert.Equal(2, s.OwnConstructionSlots);
        Assert.Equal(5, s.ConstructionSlots);
        Assert.Equal(1, s.UsedSlots);
        Assert.Equal(4, s.FreeSlots);
    }

    [Fact]
    public void A_longhouse_upgrade_occupies_every_slot_of_the_group()
    {
        var upgrade = Order(BuildingType.Longhouse, Centre, level: 2);
        var s = Found() with { Linked = Context(slots: 2, queue: [upgrade]) };

        Assert.Equal(4, s.ConstructionSlots);
        Assert.Equal(4, s.UsedSlots);
        Assert.Equal(0, s.FreeSlots);
    }

    [Fact]
    public void Group_reservation_lowers_the_available_resources()
    {
        var def = BuildingCatalogue.Get(BuildingType.Farm, 1);
        var other = Order(BuildingType.Farm, new HexCoord(5, 5), waiting: true);
        var alone = Found();
        var linked = alone with { Linked = Context(queue: [other]) };

        Assert.Equal(ResourceAmounts.Zero, alone.ReservedResources);
        Assert.Equal(def.Cost, linked.ReservedResources);
        Assert.Equal((alone.Resources.At(T0) - def.Cost).ClampToZero(), linked.AvailableResources(T0));
        Assert.Single(linked.GroupWaitingOrders);
    }

    [Fact]
    public void PlanBuild_counts_group_waiting_orders_against_the_waiting_limit()
    {
        var waiting = Enumerable.Range(0, Settlement.MaxWaitingOrders)
            .Select(i => Order(BuildingType.Farm, new HexCoord(5 + i, 5), waiting: true, queuedSeconds: i)).ToList();
        var full = Enumerable.Range(0, 4).Select(i => Order(BuildingType.Farm, new HexCoord(5 + i, 9))).ToList();
        var s = Found() with { Linked = Context(slots: 0, queue: [.. full, .. waiting]) };

        var decision = s.PlanBuild(
            BuildingType.ReindeerHerder, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7(),
            maxWaitingOrders: Settlement.MaxWaitingOrders);

        Assert.Equal(BuildRejection.QueueFull, decision.Rejection);
    }

    [Fact]
    public void PlanBuild_uses_the_group_longhouse_level_for_the_required_level()
    {
        var required = BuildingCatalogue.Get(BuildingType.Tower, 1).RequiredLonghouseLevel;
        var own = Found(1);
        var linked = own with { Linked = Context(lh: required) };

        var alone = own.PlanBuild(BuildingType.Tower, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());
        Assert.Equal(BuildRejection.LonghouseTooLow, alone.Rejection);

        var together = linked.PlanBuild(BuildingType.Tower, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());
        Assert.NotEqual(BuildRejection.LonghouseTooLow, together.Rejection);
    }

    [Fact]
    public void PlanBuild_counts_a_prerequisite_standing_in_another_member()
    {
        var own = Found(4);
        var herder = new PlacedBuilding(new HexCoord(3, 0), BuildingType.ReindeerHerder, 3);
        var low = new PlacedBuilding(new HexCoord(3, 0), BuildingType.ReindeerHerder, 2);

        var alone = own.PlanBuild(BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 5);
        var tooLow = (own with { Linked = Context(buildings: [low]) })
            .PlanBuild(BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 5);
        var together = (own with { Linked = Context(buildings: [herder]) })
            .PlanBuild(BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 5);

        Assert.Equal(BuildRejection.RequiredBuildingTooLow, alone.Rejection);
        Assert.Equal(BuildRejection.RequiredBuildingTooLow, tooLow.Rejection);
        Assert.True(together.Accepted, $"expected accept, got {together.Rejection}");
    }

    [Fact]
    public void PlanBuild_sums_the_tower_limit_of_the_group()
    {
        var level = 3;
        Assert.Equal(1, BuildingCatalogue.MaxTowers(level));
        var s = Found(level);

        // The other member's tower uses the only slot of the own limit: refused alone-in-group, allowed once their limit is added.
        var full = s with { Linked = Context(lh: level, towerLimit: 0, towers: 1) };
        var roomy = s with { Linked = Context(lh: level, towerLimit: 1, towers: 1) };

        var refused = full.PlanBuild(BuildingType.Tower, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());
        var allowed = roomy.PlanBuild(BuildingType.Tower, new HexCoord(1, 0), Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.TowerLimitReached, refused.Rejection);
        Assert.NotEqual(BuildRejection.TowerLimitReached, allowed.Rejection);
    }

    [Fact]
    public void PlanBuild_refuses_a_shrine_when_another_member_stands_or_queues_one()
    {
        var own = Found(10);
        var coord = new HexCoord(1, 0);
        var standing = new PlacedBuilding(new HexCoord(4, 0), BuildingType.ShrineOfThor, 1);
        var queued = Order(BuildingType.OdinStatue, new HexCoord(4, 1));

        var alone = own.PlanBuild(BuildingType.ShrineOfFreyja, coord, Terrain.Grass, T0, Guid.CreateVersion7());
        var otherStands = (own with { Linked = Context(lh: 10, buildings: [standing]) })
            .PlanBuild(BuildingType.ShrineOfFreyja, coord, Terrain.Grass, T0, Guid.CreateVersion7());
        var otherQueues = (own with { Linked = Context(lh: 10, queue: [queued]) })
            .PlanBuild(BuildingType.ShrineOfFreyja, coord, Terrain.Grass, T0, Guid.CreateVersion7());
        var noShrineElsewhere = (own with { Linked = Context(lh: 10, buildings: [new PlacedBuilding(new HexCoord(4, 0), BuildingType.Farm, 1)]) })
            .PlanBuild(BuildingType.ShrineOfFreyja, coord, Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.NotEqual(BuildRejection.SettlementAlreadyHasShrine, alone.Rejection);
        Assert.Equal(BuildRejection.SettlementAlreadyHasShrine, otherStands.Rejection);
        Assert.Equal(BuildRejection.SettlementAlreadyHasShrine, otherQueues.Rejection);
        Assert.NotEqual(BuildRejection.SettlementAlreadyHasShrine, noShrineElsewhere.Rejection);
    }

    [Fact]
    public void Shrines_raised_before_linking_all_stay_and_keep_their_favour()
    {
        var thor = new PlacedBuilding(new HexCoord(1, 0), BuildingType.ShrineOfThor, 3);
        var freyja = new PlacedBuilding(new HexCoord(4, 0), BuildingType.ShrineOfFreyja, 3);
        var s = Found(10) with { Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 10), thor] };
        var linked = s with { Linked = Context(lh: 10, buildings: [freyja]) };

        Assert.Contains(thor, linked.Buildings);
        Assert.Equal(s.AttackBonusPercent(UnitClass.Infantry), linked.AttackBonusPercent(UnitClass.Infantry));
        Assert.True(linked.AttackBonusPercent(UnitClass.Infantry) > 0);
    }

    [Fact]
    public void PlanBuild_counts_the_maxed_storage_houses_and_great_storehouses_of_the_whole_group()
    {
        var coord = new HexCoord(1, 0);
        var ownHouse = new PlacedBuilding(new HexCoord(3, 0), BuildingType.StorageHouse, 25);
        var own = Found(25) with { Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 25), ownHouse] };
        var otherHouse = new PlacedBuilding(new HexCoord(4, 0), BuildingType.StorageHouse, 25);
        var otherGreat = new PlacedBuilding(new HexCoord(4, 1), BuildingType.GreatStorehouse, 1);

        BuildDecision Plan(Settlement s) => s.PlanBuild(BuildingType.GreatStorehouse, coord, Terrain.Grass, T0, Guid.CreateVersion7());

        // Alone, one maxed house is enough for the first one. A great storehouse standing in the group makes the next need a second maxed house.
        var alone = Plan(own);
        var withGreat = Plan(own with { Linked = Context(lh: 25, buildings: [otherGreat]) });
        var withGreatAndHouse = Plan(own with { Linked = Context(lh: 25, buildings: [otherGreat, otherHouse]) });
        var withQueued = Plan(own with { Linked = Context(lh: 25, queue: [Order(BuildingType.GreatStorehouse, new HexCoord(4, 1))]) });

        Assert.NotEqual(BuildRejection.GreatStorehouseNeedsStorageHouses, alone.Rejection);
        Assert.Equal(BuildRejection.GreatStorehouseNeedsStorageHouses, withGreat.Rejection);
        Assert.NotEqual(BuildRejection.GreatStorehouseNeedsStorageHouses, withGreatAndHouse.Rejection);
        Assert.Equal(BuildRejection.GreatStorehouseNeedsStorageHouses, withQueued.Rejection);
    }

    [Fact]
    public void Promote_and_drop_are_no_ops_when_linked()
    {
        var waiting = Order(BuildingType.Farm, new HexCoord(1, 0), waiting: true);
        var s = Found(stock: 0) with { Queue = [waiting], Linked = Context(slots: 2) };

        var (after, changed) = s.PromoteWaitingOrders(T0);
        Assert.False(changed);
        Assert.Same(s, after);
        Assert.Same(s, s.DropUnfundedOrders(T0));

        // Standing alone, the same unfunded waiting order is dropped.
        Assert.Empty((s with { Linked = null }).DropUnfundedOrders(T0).Queue);
    }

    [Fact]
    public void SettleTo_keeps_the_stored_rate_and_does_not_starve_when_linked()
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        var pool = ResourcePool.Create(ResourceAmounts.Zero, production, capacity, T0).WithRate(new ResourceAmounts { Food = -50 }, capacity, T0);
        var s = Found() with
        {
            Resources = pool,
            Garrison = [new UnitStack(UnitType.Spearman, 1000)],
        };

        var alone = s.SettleTo(T0.AddHours(10));
        Assert.NotEmpty(alone.Deaths);

        var linked = (s with { Linked = Context() }).SettleTo(T0.AddHours(10));
        Assert.Empty(linked.Deaths);
        Assert.Empty(linked.GuestDeaths);
        Assert.Equal(1000, linked.Settlement.Garrison.Single().Count);
        Assert.Equal(-50, linked.Settlement.Resources.RatePerHour.Food);
    }

    [Fact]
    public void NextCompletionAt_is_the_earliest_active_build_or_training_completion()
    {
        var s = Found();
        Assert.Null(s.NextCompletionAt);

        var active = Order(BuildingType.Farm, new HexCoord(1, 0));
        var waiting = Order(BuildingType.Farm, new HexCoord(2, 0), waiting: true);
        var withBuild = s with { Queue = [waiting, active] };
        Assert.Equal(active.CompletesAt, withBuild.NextCompletionAt);

        var training = new TrainingOrder { Id = Guid.CreateVersion7(), UnitType = UnitType.Spearman, Count = 1, StartedAt = T0, PerUnitDuration = TimeSpan.FromMinutes(1), BuildingCoord = new HexCoord(1, 1) };
        var both = withBuild with { TrainingQueue = [training] };
        Assert.Equal(training.CompletesAt, both.NextCompletionAt);
    }

    [Fact]
    public void StartWaitingOrder_spends_stamps_and_stakes_the_stub()
    {
        var order = Order(BuildingType.Farm, new HexCoord(1, 0), waiting: true);
        var s = Found() with { Queue = [order] };
        var cost = BuildingCatalogue.Get(BuildingType.Farm, 1).Cost;

        var started = s.StartWaitingOrder(order.Id, T0.AddMinutes(1), speedFactor: 2.0);

        Assert.NotNull(started);
        var running = Assert.Single(started!.Queue);
        Assert.Equal(T0.AddMinutes(1), running.StartedAt);
        Assert.Equal(T0.AddMinutes(1) + order.BaseDuration / 2, running.CompletesAt);
        Assert.Contains(started.Buildings, b => b.Coord == order.Coord && b.Level == 0);
        Assert.Equal(s.Resources.At(T0.AddMinutes(1)) - cost, started.Resources.At(T0.AddMinutes(1)));
    }

    [Fact]
    public void StartWaitingOrder_is_null_when_unaffordable_or_not_waiting()
    {
        var waiting = Order(BuildingType.Farm, new HexCoord(1, 0), waiting: true);
        var broke = Found(stock: 0) with { Queue = [waiting] };
        Assert.Null(broke.StartWaitingOrder(waiting.Id, T0));
        Assert.Null(Found().StartWaitingOrder(Guid.CreateVersion7(), T0));
    }

    [Fact]
    public void NextPromotable_respects_hex_contiguity_head_of_line_and_free_slots()
    {
        var first = Order(BuildingType.Farm, new HexCoord(1, 0), waiting: true);
        var sameHex = Order(BuildingType.Farm, new HexCoord(1, 0), level: 2, waiting: true);
        var other = Order(BuildingType.Farm, new HexCoord(2, 0), waiting: true);

        Assert.Equal(first.Id, Settlement.NextPromotable([first, sameHex, other], 2)!.Id);
        var activeOnHex = Order(BuildingType.Farm, new HexCoord(1, 0));
        Assert.Equal(other.Id, Settlement.NextPromotable([activeOnHex, sameHex, other], 3)!.Id);

        var busy = new[] { Order(BuildingType.Farm, new HexCoord(8, 0)), Order(BuildingType.Farm, new HexCoord(9, 0)) };
        Assert.Null(Settlement.NextPromotable([.. busy, first], 2));

        var upgrade = Order(BuildingType.Longhouse, Centre, level: 2, waiting: true);
        var oneBusy = Order(BuildingType.Farm, new HexCoord(8, 0));
        Assert.Null(Settlement.NextPromotable([oneBusy, upgrade, other], 2));
    }

    [Fact]
    public void FundedWaitingOrderIds_keeps_the_affordable_prefix_only()
    {
        var a = Order(BuildingType.Farm, new HexCoord(1, 0), waiting: true);
        var b = Order(BuildingType.Farm, new HexCoord(2, 0), waiting: true);
        var c = Order(BuildingType.Farm, new HexCoord(3, 0), waiting: true);
        var cost = BuildingCatalogue.Get(BuildingType.Farm, 1).Cost;

        var keep = Settlement.FundedWaitingOrderIds([a, b, c], cost + cost);

        Assert.Equal([a.Id, b.Id], keep.OrderBy(x => x == a.Id ? 0 : 1));
        Assert.Empty(Settlement.FundedWaitingOrderIds([a], ResourceAmounts.Zero));
    }

    [Fact]
    public void StarvationKills_removes_units_until_food_covers_upkeep()
    {
        var pooled = new List<UnitStack> { new(UnitType.Spearman, 10) };
        var upkeep = UnitCatalogue.Get(UnitType.Spearman).UpkeepPerHour;

        var deaths = Settlement.StarvationKills(grossFoodPerHour: upkeep * 4, pooled);

        Assert.Equal(6, deaths.Sum(d => d.Count));
        Assert.Equal(4, pooled.Single().Count);
        Assert.Empty(Settlement.StarvationKills(1000, [new(UnitType.Spearman, 1)]));
    }

    [Fact]
    public void GrossTotals_are_the_boosted_totals_times_speed_and_WithHomeDeaths_reduces_the_garrison()
    {
        var s = Found() with { Garrison = [new UnitStack(UnitType.Spearman, 5)] };

        var (prod1, cap1) = s.GrossTotals(1.0, null);
        var (prod2, cap2) = s.GrossTotals(3.0, null);
        Assert.Equal(prod1 * 3.0, prod2);
        Assert.Equal(cap1, cap2);

        var (net, capacity) = s.CurrentTotals(3.0);
        Assert.Equal(prod2.Wood, net.Wood);
        Assert.Equal(cap2, capacity);

        var after = s.WithHomeDeaths([new UnitStack(UnitType.Spearman, 2)]);
        Assert.Equal(3, after.Garrison.Single().Count);
    }
}
