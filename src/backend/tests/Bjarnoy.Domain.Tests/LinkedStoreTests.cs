using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Linked realms share their stores: the group settle of <see cref="LinkedStore"/>.</summary>
public sealed class LinkedStoreTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord CentreA = new(0, 0);

    // Two level-1 longhouses (claim radius 2) four hexes apart share the ring at x = 2 and so are linked.
    private static readonly HexCoord CentreB = new(4, 0);

    // Six apart they do not touch (x = 2 and x = 4 are not neighbours).
    private static readonly HexCoord CentreFar = new(6, 0);

    private static Settlement Member(
        HexCoord centre,
        ResourceAmounts stock,
        DateTimeOffset? settledAt = null,
        IReadOnlyList<PlacedBuilding>? extra = null,
        IReadOnlyList<BuildOrder>? queue = null,
        IReadOnlyList<UnitStack>? garrison = null,
        IReadOnlyList<UnitStack>? guests = null,
        int longhouse = 1)
    {
        var bare = new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = centre,
            Buildings = [new PlacedBuilding(centre, BuildingType.Longhouse, longhouse), .. extra ?? []],
            Queue = queue ?? [],
            Garrison = garrison ?? [],
            Resources = ResourcePool.Create(ResourceAmounts.Zero, ResourceAmounts.Zero, ResourceAmounts.Zero, T0),
        };
        var (production, capacity) = bare.CurrentTotals(1.0, guests);
        return bare with { Resources = ResourcePool.Create(stock, production, capacity, settledAt ?? T0) };
    }

    private static BuildOrder Order(
        BuildingType type, HexCoord coord, int level = 1, bool waiting = false, int queuedSeconds = 0, int minutes = 10) => new()
    {
        Id = Guid.CreateVersion7(),
        Type = type,
        TargetLevel = level,
        Coord = coord,
        QueuedAt = T0.AddSeconds(queuedSeconds),
        BaseDuration = TimeSpan.FromMinutes(minutes),
        StartedAt = waiting ? null : T0,
        CompletesAt = waiting ? null : T0.AddMinutes(minutes),
    };

    private static LinkedStore Store(params Settlement[] oldestFirst) =>
        Store(null, oldestFirst);

    private static LinkedStore Store(IReadOnlyList<UnitStack>?[]? guests, params Settlement[] oldestFirst) =>
        LinkedStore.Create(
            [.. oldestFirst.Select((s, i) => new LinkedMember(s, T0.AddDays(i), guests?[i] ?? []))],
            1.0,
            null,
            GiantIndex.Empty);

    private static ResourceAmounts Pooled(LinkedStore store, DateTimeOffset at, params Settlement[] members) =>
        members.Aggregate(ResourceAmounts.Zero, (sum, m) => sum + store.Outcome(m.Id).Settlement.Resources.At(at));

    private static double[] V(ResourceAmounts a) => [a.Wood, a.Stone, a.Food, a.Iron];

    private static void AssertNear(ResourceAmounts expected, ResourceAmounts actual, double tolerance = 1e-6)
    {
        var (e, a) = (V(expected), V(actual));
        for (var i = 0; i < 4; i++)
        {
            Assert.True(Math.Abs(e[i] - a[i]) <= tolerance, $"resource {i}: expected {e[i]}, got {a[i]}");
        }
    }

    private static ResourceAmounts Rate(Settlement s, IReadOnlyList<UnitStack>? guests = null) => s.CurrentTotals(1.0, guests).ProductionPerHour;

    private static Settlement With(Settlement s, params PlacedBuilding[] more) =>
        s with { Buildings = [.. s.Buildings, .. more] };

    // ------------------------------------------------------------------ shares

    [Fact]
    public void Shares_follow_capacity_and_all_hit_the_cap_together()
    {
        var a = Member(CentreA, ResourceAmounts.Zero);
        var b = Member(CentreB, ResourceAmounts.Zero, extra: [new PlacedBuilding(new HexCoord(5, 1), BuildingType.StorageHouse, 1)]);
        var store = Store(a, b);

        Assert.Equal(2, store.ComponentOf(a.Id).Count);
        var capA = V(store.Outcome(a.Id).Settlement.Resources.Capacity);
        var capB = V(store.Outcome(b.Id).Settlement.Resources.Capacity);
        Assert.NotEqual(capA[0], capB[0]);

        // Halfway through filling, every share sits at the same fraction of its own cap.
        store.SettleTo(T0.AddHours(3));
        var (poolRate, poolCap) = (V(Rate(a) + Rate(b)), V(store.Outcome(a.Id).Settlement.Resources.Capacity + store.Outcome(b.Id).Settlement.Resources.Capacity));
        var stockA = V(store.Outcome(a.Id).Settlement.Resources.At(T0.AddHours(3)));
        var stockB = V(store.Outcome(b.Id).Settlement.Resources.At(T0.AddHours(3)));
        for (var r = 0; r < 4; r++)
        {
            var fraction = poolRate[r] * 3 / poolCap[r];
            Assert.True(fraction < 1, "test needs a half-full pool");
            Assert.Equal(fraction, stockA[r] / capA[r], 9);
            Assert.Equal(fraction, stockB[r] / capB[r], 9);
        }

        // Far later both are exactly full.
        store.SettleTo(T0.AddDays(30));
        AssertNear(store.Outcome(a.Id).Settlement.Resources.Capacity, store.Outcome(a.Id).Settlement.Resources.At(T0.AddDays(30)));
        AssertNear(store.Outcome(b.Id).Settlement.Resources.Capacity, store.Outcome(b.Id).Settlement.Resources.At(T0.AddDays(30)));
    }

    [Fact]
    public void A_broken_link_leaves_each_member_with_its_share()
    {
        var tower = new PlacedBuilding(new HexCoord(2, 0), BuildingType.Tower, 1);
        var a = Member(CentreA, ResourceAmounts.Uniform(100), extra: [tower]);
        var b = Member(CentreFar, ResourceAmounts.Uniform(60));
        var store = Store(a, b);
        Assert.Equal([a.Id, b.Id], store.ComponentOf(b.Id));
        var before = Pooled(store, T0, a, b);
        var shareA = store.Outcome(a.Id).Settlement.Resources.At(T0);
        var shareB = store.Outcome(b.Id).Settlement.Resources.At(T0);

        var view = store.PooledView(a.Id);
        store.Apply(a.Id, view with { Buildings = [.. view.Buildings.Where(x => x.Type != BuildingType.Tower)] });

        Assert.Equal([a.Id], store.ComponentOf(a.Id));
        Assert.Equal([b.Id], store.ComponentOf(b.Id));
        Assert.Equal(b.Id, store.RealmIdOf(b.Id));
        AssertNear(before, Pooled(store, T0, a, b));
        AssertNear(shareA, store.Outcome(a.Id).Settlement.Resources.At(T0));
        AssertNear(shareB, store.Outcome(b.Id).Settlement.Resources.At(T0));
        Assert.Equal(Rate(a with { Buildings = [a.Buildings[0]] }), store.Outcome(a.Id).Settlement.Resources.RatePerHour);
        Assert.Null(store.Outcome(a.Id).Settlement.Linked);
    }

    // ------------------------------------------------------------------ timeline

    [Fact]
    public void A_build_completing_in_one_member_changes_the_pooled_rate_from_its_instant()
    {
        var lumberA = Order(BuildingType.Lumberjack, new HexCoord(-1, 0), minutes: 30);
        var lumberB = Order(BuildingType.Lumberjack, new HexCoord(5, 0), minutes: 20);
        var a = Member(CentreA, ResourceAmounts.Zero, queue: [lumberA]);
        var b = Member(CentreB, ResourceAmounts.Zero, queue: [lumberB]);
        var store = Store(a, b);

        var r0 = Rate(a) + Rate(b);
        var gainA = Rate(With(a, new PlacedBuilding(lumberA.Coord, BuildingType.Lumberjack, 1))) - Rate(a);
        var gainB = Rate(With(b, new PlacedBuilding(lumberB.Coord, BuildingType.Lumberjack, 1))) - Rate(b);
        Assert.True(gainA.Wood > 0 && gainB.Wood > 0);

        store.SettleTo(T0.AddHours(1));

        // 0-20 min: r0; 20-30 min: B's lumberjack; 30-60 min: both.
        var expected = (r0 * (20.0 / 60)) + ((r0 + gainB) * (10.0 / 60)) + ((r0 + gainB + gainA) * (30.0 / 60));
        var pooled = Pooled(store, T0.AddHours(1), a, b);
        AssertNear(expected, pooled);
        Assert.Single(store.Outcome(a.Id).Completed);
        Assert.Single(store.Outcome(b.Id).Completed);
        Assert.Equal(store.Outcome(a.Id).Settlement.Resources.RatePerHour + store.Outcome(b.Id).Settlement.Resources.RatePerHour, r0 + gainA + gainB);
    }

    [Fact]
    public void A_tower_completing_forms_the_link_at_its_completion_time()
    {
        var towerOrder = Order(BuildingType.Tower, new HexCoord(2, 0), minutes: 30);
        var a = Member(CentreA, ResourceAmounts.Uniform(200), queue: [towerOrder]);
        var b = Member(CentreFar, ResourceAmounts.Uniform(20));
        var store = Store(a, b);

        store.SettleTo(T0.AddMinutes(29));
        Assert.Equal([a.Id], store.ComponentOf(a.Id));
        Assert.Equal(Rate(a), store.Outcome(a.Id).Settlement.Resources.RatePerHour);

        store.SettleTo(T0.AddMinutes(31));
        Assert.Equal([a.Id, b.Id], store.ComponentOf(b.Id));
        Assert.Equal(a.Id, store.RealmIdOf(b.Id));

        // Apart until minute 30, then pooled: the sum matches stock at minute 30 plus the pooled rate for the last minute.
        var apartAt30 = a.Resources.At(T0.AddMinutes(30)) + b.Resources.At(T0.AddMinutes(30));
        var aWithTower = With(a, new PlacedBuilding(towerOrder.Coord, BuildingType.Tower, 1));
        var expected = apartAt30 + ((Rate(aWithTower) + Rate(b)) * (1.0 / 60));
        AssertNear(expected, Pooled(store, T0.AddMinutes(31), a, b));

        // Shares are proportional to capacity again.
        var capA = V(store.Outcome(a.Id).Settlement.Resources.Capacity);
        var capB = V(store.Outcome(b.Id).Settlement.Resources.Capacity);
        var stockA = V(store.Outcome(a.Id).Settlement.Resources.At(T0.AddMinutes(31)));
        var stockB = V(store.Outcome(b.Id).Settlement.Resources.At(T0.AddMinutes(31)));
        for (var r = 0; r < 4; r++)
        {
            Assert.Equal(stockA[r] / capA[r], stockB[r] / capB[r], 9);
        }
    }

    // ------------------------------------------------------------------ queue

    [Fact]
    public void Promotion_across_members_is_fifo_with_the_summed_slots()
    {
        // 2 + 2 slots; A already builds three, so one is free and the older waiting order (in B) takes it.
        var busy = Enumerable.Range(0, 3).Select(i => Order(BuildingType.Farm, new HexCoord(-1, i))).ToList();
        var waitingB = Order(BuildingType.Farm, new HexCoord(5, 0), waiting: true, queuedSeconds: 1);
        var waitingA = Order(BuildingType.Farm, new HexCoord(-1, -1), waiting: true, queuedSeconds: 2);
        var a = Member(CentreA, ResourceAmounts.Uniform(10_000), queue: [.. busy, waitingA]);
        var b = Member(CentreB, ResourceAmounts.Uniform(10_000), queue: [waitingB]);
        var store = Store(a, b);

        Assert.Equal(b.Id, store.MemberOwningOrder(waitingB.Id));
        var startedB = store.Outcome(b.Id).Settlement.Queue.Single(o => o.Id == waitingB.Id);
        Assert.False(startedB.IsWaiting);
        Assert.Equal(T0, startedB.StartedAt);
        Assert.True(store.Outcome(a.Id).Settlement.Queue.Single(o => o.Id == waitingA.Id).IsWaiting);

        // The farm's cost left the pool, and B stakes the foundation.
        var cost = BuildingCatalogue.Get(BuildingType.Farm, 1).Cost;
        AssertNear((a.Resources.At(T0) + b.Resources.At(T0)).ClampToZero() - cost, Pooled(store, T0, a, b));
        Assert.Contains(store.Outcome(b.Id).Settlement.Buildings, x => x.Coord == waitingB.Coord && x.Level == 0);

        // When one of A's orders completes, the next waiting order follows at exactly that instant.
        store.SettleTo(T0.AddMinutes(11));
        var startedA = store.Outcome(a.Id).Settlement.Queue.Single(o => o.Id == waitingA.Id);
        Assert.Equal(T0.AddMinutes(10), startedA.StartedAt);
    }

    [Fact]
    public void A_longhouse_upgrade_occupies_every_slot_of_the_group()
    {
        var busyB = Order(BuildingType.Farm, new HexCoord(5, 0));
        var upgrade = Order(BuildingType.Longhouse, CentreA, level: 2, waiting: true, queuedSeconds: 1);
        var behind = Order(BuildingType.Farm, new HexCoord(-1, 0), waiting: true, queuedSeconds: 2);
        var a = Member(CentreA, ResourceAmounts.Uniform(10_000), queue: [upgrade, behind]);
        var b = Member(CentreB, ResourceAmounts.Uniform(10_000), queue: [busyB]);
        var store = Store(a, b);

        // B's order holds a slot, so the upgrade (all 4) and the order behind it wait.
        Assert.True(store.Outcome(a.Id).Settlement.Queue.All(o => o.IsWaiting));

        store.SettleTo(T0.AddMinutes(11));
        var queueA = store.Outcome(a.Id).Settlement.Queue;
        Assert.Equal(T0.AddMinutes(10), queueA.Single(o => o.Id == upgrade.Id).StartedAt);
        Assert.True(queueA.Single(o => o.Id == behind.Id).IsWaiting, "the upgrade holds every slot of the group");
    }

    [Fact]
    public void Unfunded_waiting_orders_are_dropped_from_their_owners_against_the_pool()
    {
        var cost = BuildingCatalogue.Get(BuildingType.Farm, 1).Cost;
        var busyA = Enumerable.Range(0, 2).Select(i => Order(BuildingType.Farm, new HexCoord(-1, i))).ToList();
        var busyB = Enumerable.Range(0, 2).Select(i => Order(BuildingType.Farm, new HexCoord(5, i))).ToList();
        var first = Order(BuildingType.Farm, new HexCoord(5, -1), waiting: true, queuedSeconds: 1);
        var second = Order(BuildingType.Farm, new HexCoord(-1, -1), waiting: true, queuedSeconds: 2);

        // Neither share covers one farm, the pool covers exactly one.
        var half = (cost * 0.5) + ResourceAmounts.Uniform(0.01);
        var a = Member(CentreA, half, queue: [.. busyA, second]);
        var b = Member(CentreB, half, queue: [.. busyB, first]);
        var store = Store(a, b);

        Assert.Contains(store.Outcome(b.Id).Settlement.Queue, o => o.Id == first.Id);
        Assert.DoesNotContain(store.Outcome(a.Id).Settlement.Queue, o => o.Id == second.Id);
        Assert.True(store.Outcome(a.Id).Changed);
    }

    // ------------------------------------------------------------------ pooled spend

    [Fact]
    public void A_spend_larger_than_one_share_but_within_the_pool_succeeds()
    {
        var a = Member(CentreA, ResourceAmounts.Uniform(100));
        var b = Member(CentreB, ResourceAmounts.Uniform(100));
        var store = Store(a, b);
        var cost = ResourceAmounts.Uniform(150);

        Assert.False(a.Resources.TrySpend(cost, T0, out _));

        var view = store.PooledView(a.Id);
        Assert.True(view.Resources.TrySpend(cost, T0, out var paid));
        store.Apply(a.Id, view with { Resources = paid });

        AssertNear(ResourceAmounts.Uniform(50), Pooled(store, T0, a, b));
        Assert.True(store.Outcome(a.Id).Changed);
        Assert.True(store.Outcome(b.Id).Changed);

        // A spend beyond the whole pool is still refused.
        Assert.False(store.PooledView(b.Id).Resources.TrySpend(ResourceAmounts.Uniform(51), T0, out _));
    }

    [Fact]
    public void A_deposit_clamps_at_the_total_capacity()
    {
        var a = Member(CentreA, ResourceAmounts.Zero);
        var b = Member(CentreB, ResourceAmounts.Zero, extra: [new PlacedBuilding(new HexCoord(5, 1), BuildingType.StorageHouse, 1)]);
        var store = Store(a, b);
        var totalCapacity = store.Outcome(a.Id).Settlement.Resources.Capacity + store.Outcome(b.Id).Settlement.Resources.Capacity;

        var view = store.PooledView(a.Id);
        store.Apply(a.Id, view with { Resources = view.Resources.Deposit(ResourceAmounts.Uniform(1_000_000), T0) });

        AssertNear(totalCapacity, Pooled(store, T0, a, b));
        AssertNear(store.Outcome(a.Id).Settlement.Resources.Capacity, store.Outcome(a.Id).Settlement.Resources.At(T0));
        AssertNear(store.Outcome(b.Id).Settlement.Resources.Capacity, store.Outcome(b.Id).Settlement.Resources.At(T0));
    }

    // ------------------------------------------------------------------ starvation

    [Fact]
    public void Pooled_starvation_kills_the_highest_upkeep_units_across_members()
    {
        var thrallUpkeep = UnitCatalogue.Get(UnitType.Thrall).UpkeepPerHour;
        var catapultUpkeep = UnitCatalogue.Get(UnitType.Catapult).UpkeepPerHour;
        Assert.True(catapultUpkeep > thrallUpkeep);

        IReadOnlyList<UnitStack> guestsA = [new UnitStack(UnitType.Catapult, 5)];
        var a = Member(CentreA, new ResourceAmounts(0, 0, 10, 0), garrison: [new UnitStack(UnitType.Thrall, 20)], guests: guestsA);
        var b = Member(CentreB, new ResourceAmounts(0, 0, 10, 0), garrison: [new UnitStack(UnitType.Catapult, 10)]);
        var store = Store([guestsA, []], a, b);

        var gross = Rate(a with { Garrison = [] }).Food + Rate(b with { Garrison = [] }).Food;
        var upkeep = (20 * thrallUpkeep) + (15 * catapultUpkeep);
        Assert.True(upkeep > gross);
        var kills = (int)Math.Ceiling((upkeep - gross) / catapultUpkeep);

        store.SettleTo(T0.AddHours(2));

        var split = ProportionalAllocator.Allocate(kills, [0, 5, 10, 0]);
        var outcomeA = store.Outcome(a.Id);
        var outcomeB = store.Outcome(b.Id);
        Assert.Empty(outcomeA.Deaths);
        Assert.Equal(split[2], outcomeB.Deaths.Single(d => d.Type == UnitType.Catapult).Count);
        Assert.Equal(split[1], outcomeA.GuestDeaths.Single(d => d.Type == UnitType.Catapult).Count);
        Assert.Empty(outcomeB.GuestDeaths);
        Assert.Equal(kills, split.Sum());

        // The cheap units are all still there, and the pooled food rate is no longer negative.
        Assert.Equal(20, outcomeA.Settlement.Garrison.Single(g => g.Type == UnitType.Thrall).Count);
        var foodRate = outcomeA.Settlement.Resources.RatePerHour.Food + outcomeB.Settlement.Resources.RatePerHour.Food;
        Assert.True(foodRate >= -1e-9, $"food rate {foodRate}");
        Assert.True(outcomeB.Changed);
    }

    // ------------------------------------------------------------------ joining

    [Fact]
    public void A_member_written_later_joins_from_its_own_settled_instant()
    {
        var a = Member(CentreA, ResourceAmounts.Uniform(100));
        var b = Member(CentreB, ResourceAmounts.Uniform(200), settledAt: T0.AddHours(1));
        var store = Store(a, b);

        Assert.Equal(T0, store.Cursor);
        store.SettleTo(T0.AddMinutes(30));
        Assert.False(store.Outcome(b.Id).Changed);
        Assert.Equal(b.Resources, store.Outcome(b.Id).Settlement.Resources);

        store.SettleTo(T0.AddHours(2));

        // A alone for the first hour, then both pooled: B's 200 counts once.
        var expected = ResourceAmounts.Uniform(300) + (Rate(a) * 2) + (Rate(b) * 1);
        AssertNear(expected, Pooled(store, T0.AddHours(2), a, b));
        Assert.Equal([a.Id, b.Id], store.ComponentOf(b.Id));
    }

    // ------------------------------------------------------------------ singleton

    [Fact]
    public void A_lone_member_settles_exactly_like_a_plain_settlement()
    {
        var order = Order(BuildingType.Lumberjack, new HexCoord(-1, 0), minutes: 30);
        var second = Order(BuildingType.Lumberjack, new HexCoord(-1, 1), waiting: true, queuedSeconds: 1, minutes: 30);
        var lone = Member(CentreA, ResourceAmounts.Uniform(50), queue: [order, second], garrison: [new UnitStack(UnitType.Thrall, 3)]);
        var store = Store(lone);
        var target = T0.AddHours(3);

        store.SettleTo(target);
        var plain = lone.SettleTo(target);
        var outcome = store.Outcome(lone.Id);

        Assert.Equal(plain.Changed, outcome.Changed);
        Assert.Equal(plain.Settlement.Buildings, outcome.Settlement.Buildings);
        Assert.Equal(plain.Settlement.Queue, outcome.Settlement.Queue);
        Assert.Equal(plain.Settlement.Resources.RatePerHour, outcome.Settlement.Resources.RatePerHour);
        Assert.Equal(plain.Settlement.Resources.Capacity, outcome.Settlement.Resources.Capacity);
        AssertNear(plain.Settlement.Resources.At(target), outcome.Settlement.Resources.At(target));
        Assert.Equal(plain.Completed.Count, outcome.Completed.Count);
    }

    // ------------------------------------------------------------------ booking

    [Fact]
    public void Booking_goes_to_the_member_that_has_or_claims_the_hex()
    {
        var a = Member(CentreA, ResourceAmounts.Zero);
        var shared = new HexCoord(2, 0);
        var b = Member(CentreB, ResourceAmounts.Zero, extra: [new PlacedBuilding(shared, BuildingType.Farm, 1)]);
        var store = Store(a, b);
        Assert.Equal([a.Id, b.Id], store.ComponentOf(a.Id));

        // Only A's realm reaches x = -1, only B's reaches x = 5; whoever asks, the claiming member books it.
        Assert.Equal(a.Id, store.BookingMemberFor(b.Id, new HexCoord(-1, 0)));
        Assert.Equal(b.Id, store.BookingMemberFor(a.Id, new HexCoord(5, 0)));

        // Both claim x = 2 (the oldest would win), but B already has a building there.
        Assert.Equal(b.Id, store.BookingMemberFor(a.Id, shared));
        Assert.Equal(a.Id, store.BookingMemberFor(b.Id, new HexCoord(1, 1)));

        // Nobody claims it: the requester keeps it.
        Assert.Equal(b.Id, store.BookingMemberFor(b.Id, new HexCoord(30, 30)));
    }

    [Fact]
    public void Rerating_uses_the_new_speed_from_then_on_without_touching_the_stock()
    {
        var a = Member(CentreA, ResourceAmounts.Uniform(100));
        var b = Member(CentreB, ResourceAmounts.Uniform(100));
        var store = Store(a, b);
        store.SettleTo(T0.AddHours(1));
        var before = Pooled(store, T0.AddHours(1), a, b);

        store.Rerate(2.0);

        AssertNear(before, Pooled(store, T0.AddHours(1), a, b));
        var rate = store.Outcome(a.Id).Settlement.Resources.RatePerHour + store.Outcome(b.Id).Settlement.Resources.RatePerHour;
        AssertNear((Rate(a) + Rate(b)) * 2, rate);
    }
}
