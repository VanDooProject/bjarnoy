using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>One settlement of a <see cref="LinkedStore"/>: the settlement as stored, when it was founded, and the guest stacks it hosts.</summary>
public sealed record LinkedMember(Settlement Settlement, DateTimeOffset FoundedAt, IReadOnlyList<UnitStack> GuestStacks);

/// <summary>What happened to one member while the <see cref="LinkedStore"/> settled; <see cref="Changed"/> says whether it has to be written.</summary>
public sealed record LinkedMemberOutcome(
    Settlement Settlement,
    bool Changed,
    IReadOnlyList<BuildOrder> Completed,
    IReadOnlyList<TrainingOrder> CompletedTraining,
    IReadOnlyList<UnitStack> Deaths,
    IReadOnlyList<UnitStack> GuestDeaths);

/// <summary>
/// The settlements of one player on one island, settled together (<c>docs/design/economy.md</c> section 5, "Linked realms share
/// their stores"). Settlements whose realms touch form a component; a component shares one pool of stock, production and
/// capacity, one construction queue (slots add up, FIFO) and one food upkeep.
/// </summary>
/// <remarks>
/// <para>
/// Mutable and not thread-safe. Each member keeps persisting its own <see cref="ResourcePool"/>: the pool is split between the
/// members of a component in proportion to their own capacity, stock and rate alike, so every share reaches its cap (or zero)
/// at the same instant and the sum of the shares behaves exactly like one pool. The split is redone (<c>Normalize</c>) at every
/// instant something changes the pool's shape: a build or training completing, a link forming or breaking, starvation, a
/// promotion, a spend.
/// </para>
/// <para>
/// A member of a multi-member component carries <see cref="Settlement.Linked"/> while it is settled, so it neither starves nor
/// promotes on its own; the store does both for the whole component. A lone member is settled by plain
/// <see cref="Settlement.SettleTo"/>. A member only takes part in a re-split from its own stored <c>SettledAt</c> on (it may
/// have been written later than the others), so a link forming against it never counts its stock twice.
/// </para>
/// </remarks>
public sealed class LinkedStore
{
    private const double Epsilon = 1e-4;
    private const int MaxIterations = 10_000;

    private readonly List<Slot> _slots;
    private readonly IGiantIndex _giants;
    private readonly Func<HexCoord, Terrain>? _terrainAt;
    private double _speedFactor;

    // Latest relink: the structural components (every member) and the mechanical groups (members already in force).
    private IReadOnlyList<IReadOnlyList<Guid>> _components = [];
    private List<List<Slot>> _groups = [];
    private Dictionary<Guid, List<Slot>> _groupOf = [];

    private LinkedStore(List<Slot> slots, double speedFactor, Func<HexCoord, Terrain>? terrainAt, IGiantIndex giants)
    {
        _slots = slots;
        _speedFactor = speedFactor;
        _terrainAt = terrainAt;
        _giants = giants;
        Realm = ConnectedRealm.Resolve([]);
    }

    /// <summary>The instant every member has been settled to.</summary>
    public DateTimeOffset Cursor { get; private set; }

    /// <summary>The chain rule resolved over all members' current buildings.</summary>
    public ConnectedRealm Realm { get; private set; }

    /// <summary>All member ids, oldest first (<c>FoundedAt</c>, then <c>Id</c>).</summary>
    public IReadOnlyList<Guid> MemberIds => [.. _slots.Select(s => s.Id)];

    public static LinkedStore Create(
        IReadOnlyList<LinkedMember> members, double speedFactor, Func<HexCoord, Terrain>? terrainAt, IGiantIndex giants)
    {
        ArgumentNullException.ThrowIfNull(members);
        ArgumentNullException.ThrowIfNull(giants);
        if (members.Count == 0)
        {
            throw new ArgumentException("A linked store needs at least one member.", nameof(members));
        }

        var slots = members
            .OrderBy(m => m.FoundedAt)
            .ThenBy(m => m.Settlement.Id)
            .Select(m => new Slot(m.Settlement with { Linked = null }, m.GuestStacks.ToList()))
            .ToList();
        var store = new LinkedStore(slots, speedFactor, terrainAt, giants)
        {
            Cursor = slots.Min(s => s.JoinedAt),
        };
        store.Normalize(store.Cursor);
        return store;
    }

    /// <summary>The ids of the component <paramref name="id"/> belongs to, oldest first (just itself when it stands alone).</summary>
    public IReadOnlyList<Guid> ComponentOf(Guid id) =>
        _components.FirstOrDefault(c => c.Contains(id)) ?? throw new ArgumentException("Unknown member.", nameof(id));

    /// <summary>The id of the oldest member of the component — what the world lists show as the realm.</summary>
    public Guid RealmIdOf(Guid id) => ComponentOf(id)[0];

    /// <summary>Settles every member to <paramref name="target"/> as one event-ordered timeline.</summary>
    public void SettleTo(DateTimeOffset target)
    {
        var iterations = 0;
        do
        {
            var next = target;
            if (++iterations <= MaxIterations)
            {
                foreach (var slot in _slots)
                {
                    if (slot.Settlement.NextCompletionAt is { } at && at < next)
                    {
                        next = at;
                    }

                    if (!slot.Active && slot.JoinedAt > Cursor && slot.JoinedAt < next)
                    {
                        next = slot.JoinedAt;
                    }
                }

                foreach (var group in _groups.Where(g => g.Count > 1))
                {
                    if (FoodCrossing(group) is { } crossing && crossing < next)
                    {
                        next = crossing;
                    }
                }
            }

            if (next < Cursor)
            {
                next = Cursor;
            }

            foreach (var slot in _slots)
            {
                if (!slot.Active)
                {
                    continue;
                }

                var result = slot.Settlement.SettleTo(next, _speedFactor, slot.Guests, _terrainAt);
                slot.Settlement = result.Settlement;
                slot.Changed |= result.Changed;
                slot.Completed.AddRange(result.Completed);
                slot.CompletedTraining.AddRange(result.TrainingCompleted);
                slot.Deaths.AddRange(result.Deaths);
                slot.GuestDeaths.AddRange(result.GuestDeaths);
            }

            Cursor = next;
            Normalize(next);
        }
        while (Cursor < target);
    }

    /// <summary>
    /// <paramref name="id"/> as one realm sees it: a member of a linked component with the component's pooled stock, rate and
    /// capacity, so every check and spend runs against the pool. A lone member is returned as it is.
    /// </summary>
    public Settlement PooledView(Guid id) => PooledViewAt(SlotOf(id), Cursor);

    /// <summary>
    /// Takes back a view from <see cref="PooledView"/> after the caller changed it (a build planned, a spend, a deposit): its
    /// buildings, queue, garrison, training, feast, quests and runes replace the member's, its pooled stock replaces the
    /// component's total, and the pool is re-split. Its rate and capacity are ignored.
    /// </summary>
    public void Apply(Guid id, Settlement updatedView)
    {
        ArgumentNullException.ThrowIfNull(updatedView);

        ApplyCore(SlotOf(id), updatedView, Cursor);
        Normalize(Cursor);
    }

    /// <summary>
    /// The member a build on <paramref name="coord"/> is booked on: the member of <paramref name="requestedId"/>'s component
    /// that already has a building or queued order there; otherwise the oldest member whose own realm claims the hex; otherwise
    /// the requested member.
    /// </summary>
    public Guid BookingMemberFor(Guid requestedId, HexCoord coord)
    {
        var component = ComponentOf(requestedId).Select(SlotOf).ToList();

        var holder = component.FirstOrDefault(s =>
            s.Settlement.Buildings.Any(b => b.Coord == coord) || s.Settlement.Queue.Any(o => o.Coord == coord));
        if (holder is not null)
        {
            return holder.Id;
        }

        var claimant = component.FirstOrDefault(s => Territory.Claims(Realm.DiscsOf(s.Id), coord, _giants));
        return claimant?.Id ?? requestedId;
    }

    /// <summary>The member whose build queue holds <paramref name="orderId"/>, or <see langword="null"/>.</summary>
    public Guid? MemberOwningOrder(Guid orderId) =>
        _slots.FirstOrDefault(s => s.Settlement.Queue.Any(o => o.Id == orderId))?.Id;

    /// <summary>
    /// Replaces the guest stacks <paramref name="id"/> hosts (after a battle took some of them) and re-splits the pool, so the
    /// following settle eats with the guests that are left.
    /// </summary>
    public void SetGuests(Guid id, IReadOnlyList<UnitStack> guests)
    {
        ArgumentNullException.ThrowIfNull(guests);

        var slot = SlotOf(id);
        slot.Guests.Clear();
        slot.Guests.AddRange(guests);
        Normalize(Cursor);
    }

    /// <summary>Changes the world speed: what was settled stays as it is, and the pool is re-split with the new rates.</summary>
    public void Rerate(double newSpeedFactor)
    {
        SettleTo(Cursor);
        _speedFactor = newSpeedFactor;
        Normalize(Cursor);
    }

    /// <summary>What happened to <paramref name="id"/> since the store was created.</summary>
    public LinkedMemberOutcome Outcome(Guid id)
    {
        var slot = SlotOf(id);
        return new LinkedMemberOutcome(
            slot.Settlement with { Linked = null },
            slot.Changed,
            [.. slot.Completed],
            [.. slot.CompletedTraining],
            SumByType(slot.Deaths),
            SumByType(slot.GuestDeaths));
    }

    // ------------------------------------------------------------------ normalize

    private void Normalize(DateTimeOffset t)
    {
        Relink(t);

        foreach (var group in _groups)
        {
            if (group[0].Active)
            {
                Resplit(group, t, null);
            }
        }

        foreach (var group in _groups.Where(g => g.Count > 1))
        {
            Starve(group, t);
        }

        foreach (var group in _groups.Where(g => g.Count > 1))
        {
            Promote(group, t);
        }

        foreach (var group in _groups.Where(g => g.Count > 1))
        {
            Drop(group, t);
        }
    }

    private void Relink(DateTimeOffset t)
    {
        foreach (var slot in _slots)
        {
            slot.Active = t >= slot.JoinedAt;
        }

        Realm = ConnectedRealm.Resolve(_slots.Select(s => s.Settlement.AsRealmSettlement()));
        var ids = _slots.Select(s => s.Id).ToList();
        _components = LinkedGroups.Components(Realm, ids, _giants);

        var activeIds = _slots.Where(s => s.Active).Select(s => s.Id).ToList();
        var activeComponents = LinkedGroups.Components(Realm, activeIds, _giants);

        var bySlot = _slots.ToDictionary(s => s.Id);
        _groups = [];
        _groupOf = [];
        foreach (var component in activeComponents)
        {
            AddGroup(component.Select(id => bySlot[id]).ToList());
        }

        foreach (var slot in _slots.Where(s => !s.Active))
        {
            AddGroup([slot]);
        }

        void AddGroup(List<Slot> group)
        {
            _groups.Add(group);
            foreach (var member in group)
            {
                _groupOf[member.Id] = group;
            }
        }
    }

    /// <summary>
    /// Re-splits the component's stock, rate and capacity over its members in proportion to their own capacity and hands each
    /// member its <see cref="Settlement.Linked"/> view. <paramref name="totalStock"/> replaces the pool total when given.
    /// </summary>
    private void Resplit(List<Slot> group, DateTimeOffset t, ResourceAmounts? totalStock)
    {
        var totals = group.Select(m => m.Settlement.CurrentTotals(_speedFactor, m.Guests, _terrainAt)).ToArray();

        if (group.Count == 1)
        {
            var only = group[0];
            var stock = totalStock ?? only.Settlement.Resources.At(t);
            only.Settlement = only.Settlement with { Linked = null };
            SetPool(only, ResourcePool.Create(stock, totals[0].ProductionPerHour, totals[0].Capacity, t), t);
            return;
        }

        var sum = group.Aggregate(ResourceAmounts.Zero, (a, m) => a + m.Settlement.Resources.At(t));
        var pooledStock = Vector(totalStock ?? sum);
        var pooledRate = Vector(totals.Aggregate(ResourceAmounts.Zero, (a, x) => a + x.ProductionPerHour));
        var pooledCapacity = Vector(totals.Aggregate(ResourceAmounts.Zero, (a, x) => a + x.Capacity));

        var pools = new ResourcePool[group.Count];
        for (var i = 0; i < group.Count; i++)
        {
            var capacity = Vector(totals[i].Capacity);
            var stock = new double[4];
            var rate = new double[4];
            for (var r = 0; r < 4; r++)
            {
                if (pooledCapacity[r] > 0)
                {
                    var share = capacity[r] / pooledCapacity[r];
                    stock[r] = Math.Min(pooledStock[r], pooledCapacity[r]) * share;
                    rate[r] = pooledRate[r] * share;
                }
                else
                {
                    stock[r] = 0;
                    rate[r] = i == 0 ? pooledRate[r] : 0;
                }
            }

            pools[i] = ResourcePool.Create(Amounts(stock), Amounts(rate), totals[i].Capacity, t);
        }

        var merged = MergedQueue(group);
        var owner = new Dictionary<Guid, int>();
        for (var i = 0; i < group.Count; i++)
        {
            foreach (var order in group[i].Settlement.Queue)
            {
                owner[order.Id] = i;
            }
        }

        var ownSlots = group.Select(m => m.Settlement.OwnConstructionSlots).ToArray();
        var towerLimits = group.Select(m => BuildingCatalogue.MaxTowers(m.Settlement.LonghouseLevel)).ToArray();
        var towerCounts = group.Select(m => Realm.CountConnected(
            m.Settlement.Buildings.Where(b => b.Type == BuildingType.Tower).Select(b => b.Coord)
                .Concat(m.Settlement.Queue.Where(o => o.Type == BuildingType.Tower).Select(o => o.Coord)))).ToArray();
        var groupLonghouse = group.Max(m => m.Settlement.LonghouseLevel);

        for (var i = 0; i < group.Count; i++)
        {
            var self = i;
            var linked = new LinkedQueueContext(
                ownSlots.Where((_, j) => j != self).Sum(),
                [.. merged.Where(o => owner[o.Id] != self)],
                groupLonghouse,
                towerLimits.Where((_, j) => j != self).Sum(),
                towerCounts.Where((_, j) => j != self).Sum(),
                [.. group.Where((_, j) => j != self).SelectMany(m => m.Settlement.Buildings)]);
            group[i].Settlement = group[i].Settlement with { Linked = linked };
            SetPool(group[i], pools[i], t);
        }
    }

    /// <summary>Replaces the member's pool when the new one is not the same stock, rate and capacity at <paramref name="t"/>.</summary>
    private static void SetPool(Slot slot, ResourcePool pool, DateTimeOffset t)
    {
        var old = slot.Settlement.Resources;
        if (Same(old.At(t), pool.Stock) && Same(old.RatePerHour, pool.RatePerHour) && Same(old.Capacity, pool.Capacity))
        {
            return;
        }

        slot.Settlement = slot.Settlement with { Resources = pool };
        slot.Changed = true;
    }

    /// <summary>When the pooled food of a component runs out at the current pooled rate, or <see langword="null"/> when it does not.</summary>
    private DateTimeOffset? FoodCrossing(List<Slot> group)
    {
        if (!group[0].Active)
        {
            return null;
        }

        var rate = group.Sum(m => m.Settlement.Resources.RatePerHour.Food);
        var stock = group.Sum(m => m.Settlement.Resources.At(Cursor).Food);
        if (rate >= 0 || stock <= Epsilon)
        {
            return null;
        }

        var ticks = (long)Math.Ceiling(stock / -rate * TimeSpan.TicksPerHour);
        return Cursor.AddTicks(Math.Max(1, ticks));
    }

    // ------------------------------------------------------------------ group rules

    private void Starve(List<Slot> group, DateTimeOffset t)
    {
        if (!group[0].Active)
        {
            return;
        }

        var rateFood = group.Sum(m => m.Settlement.Resources.RatePerHour.Food);
        var stockFood = group.Sum(m => m.Settlement.Resources.At(t).Food);
        if (rateFood >= 0 || stockFood > Epsilon)
        {
            return;
        }

        var grossFood = group.Sum(m => m.Settlement.GrossTotals(_speedFactor, _terrainAt).GrossProduction.Food);
        var pooled = group
            .SelectMany(m => m.Settlement.Garrison.Concat(m.Guests))
            .GroupBy(s => s.Type)
            .Select(g => new UnitStack(g.Key, g.Sum(s => s.Count)))
            .ToList();
        var kills = Settlement.StarvationKills(grossFood, pooled);
        if (kills.Count == 0)
        {
            return;
        }

        var homeDeaths = group.Select(_ => new List<UnitStack>()).ToArray();
        foreach (var death in kills.GroupBy(k => k.Type).Select(g => new UnitStack(g.Key, g.Sum(k => k.Count))))
        {
            // Weights: (home, guest) of member 0, (home, guest) of member 1, ...
            var weights = group
                .SelectMany(m => new[] { CountOf(m.Settlement.Garrison, death.Type), CountOf(m.Guests, death.Type) })
                .ToList();
            var split = ProportionalAllocator.Allocate(death.Count, weights);
            for (var i = 0; i < group.Count; i++)
            {
                if (split[2 * i] > 0)
                {
                    homeDeaths[i].Add(new UnitStack(death.Type, split[2 * i]));
                }

                if (split[(2 * i) + 1] > 0)
                {
                    var lost = new UnitStack(death.Type, split[(2 * i) + 1]);
                    ReduceGuests(group[i].Guests, lost);
                    group[i].GuestDeaths.Add(lost);
                }
            }
        }

        for (var i = 0; i < group.Count; i++)
        {
            if (homeDeaths[i].Count > 0)
            {
                group[i].Settlement = group[i].Settlement.WithHomeDeaths(homeDeaths[i]);
                group[i].Deaths.AddRange(homeDeaths[i]);
                group[i].Changed = true;
            }
        }

        Resplit(group, t, null);
    }

    private void Promote(List<Slot> group, DateTimeOffset t)
    {
        if (!group[0].Active)
        {
            return;
        }

        while (true)
        {
            var slots = group.Sum(m => m.Settlement.OwnConstructionSlots);
            if (Settlement.NextPromotable(MergedQueue(group), slots) is not { } next)
            {
                return;
            }

            var owner = group.First(m => m.Settlement.Queue.Any(o => o.Id == next.Id));
            if (PooledViewAt(owner, t).StartWaitingOrder(next.Id, t, _speedFactor) is not { } started)
            {
                return;
            }

            ApplyCore(owner, started, t);
        }
    }

    private void Drop(List<Slot> group, DateTimeOffset t)
    {
        if (!group[0].Active)
        {
            return;
        }

        var waiting = MergedQueue(group).Where(o => o.IsWaiting).ToList();
        if (waiting.Count == 0)
        {
            return;
        }

        var stock = group.Aggregate(ResourceAmounts.Zero, (a, m) => a + m.Settlement.Resources.At(t));
        var keep = Settlement.FundedWaitingOrderIds(waiting, stock);
        if (keep.Count == waiting.Count)
        {
            return;
        }

        foreach (var member in group)
        {
            if (member.Settlement.Queue.Any(o => o.IsWaiting && !keep.Contains(o.Id)))
            {
                member.Settlement = member.Settlement with
                {
                    Queue = [.. member.Settlement.Queue.Where(o => !o.IsWaiting || keep.Contains(o.Id))],
                };
                member.Changed = true;
            }
        }

        Resplit(group, t, null);
    }

    // ------------------------------------------------------------------ views

    private Settlement PooledViewAt(Slot slot, DateTimeOffset t)
    {
        var group = _groupOf[slot.Id];
        if (group.Count == 1)
        {
            return slot.Settlement;
        }

        var stock = group.Aggregate(ResourceAmounts.Zero, (a, m) => a + m.Settlement.Resources.At(t));
        var rate = group.Aggregate(ResourceAmounts.Zero, (a, m) => a + m.Settlement.Resources.RatePerHour);
        var capacity = group.Aggregate(ResourceAmounts.Zero, (a, m) => a + m.Settlement.Resources.Capacity);
        return slot.Settlement with { Resources = ResourcePool.Create(stock, rate, capacity, t) };
    }

    private void ApplyCore(Slot slot, Settlement view, DateTimeOffset t)
    {
        var group = _groupOf[slot.Id];
        var total = view.Resources.At(t);

        slot.Settlement = view with { Resources = slot.Settlement.Resources, Linked = slot.Settlement.Linked };
        foreach (var member in group)
        {
            member.Changed = true;
        }

        Resplit(group, t, total);
    }

    // ------------------------------------------------------------------ helpers

    private Slot SlotOf(Guid id) =>
        _slots.FirstOrDefault(s => s.Id == id) ?? throw new ArgumentException("Unknown member.", nameof(id));

    /// <summary>The members' build queues in one FIFO order: by <see cref="BuildOrder.QueuedAt"/>, older member first on a tie.</summary>
    private static List<BuildOrder> MergedQueue(List<Slot> group) =>
        [.. group.SelectMany(m => m.Settlement.Queue).OrderBy(o => o.QueuedAt)];

    private static int CountOf(IReadOnlyList<UnitStack> stacks, UnitType type) =>
        stacks.Where(s => s.Type == type).Sum(s => s.Count);

    private static void ReduceGuests(List<UnitStack> guests, UnitStack lost)
    {
        var index = guests.FindIndex(s => s.Type == lost.Type);
        if (index < 0)
        {
            return;
        }

        var left = guests[index].Count - lost.Count;
        if (left <= 0)
        {
            guests.RemoveAt(index);
        }
        else
        {
            guests[index] = guests[index] with { Count = left };
        }
    }

    private static IReadOnlyList<UnitStack> SumByType(List<UnitStack> stacks) =>
        [.. stacks.GroupBy(s => s.Type).Select(g => new UnitStack(g.Key, g.Sum(s => s.Count)))];

    private static double[] Vector(ResourceAmounts a) => [a.Wood, a.Stone, a.Food, a.Iron];

    private static ResourceAmounts Amounts(double[] v) => new(v[0], v[1], v[2], v[3]);

    private static bool Same(ResourceAmounts a, ResourceAmounts b) =>
        Near(a.Wood, b.Wood) && Near(a.Stone, b.Stone) && Near(a.Food, b.Food) && Near(a.Iron, b.Iron);

    private static bool Near(double a, double b) => Math.Abs(a - b) <= 1e-6 * Math.Max(1, Math.Max(Math.Abs(a), Math.Abs(b)));

    private sealed class Slot(Settlement settlement, List<UnitStack> guests)
    {
        public Settlement Settlement { get; set; } = settlement;

        public Guid Id => Settlement.Id;

        public List<UnitStack> Guests { get; } = guests;

        /// <summary>The instant the stored pool was true: the member takes part in a re-split from then on.</summary>
        public DateTimeOffset JoinedAt { get; } = settlement.Resources.SettledAt;

        public bool Active { get; set; }

        public bool Changed { get; set; }

        public List<BuildOrder> Completed { get; } = [];

        public List<TrainingOrder> CompletedTraining { get; } = [];

        public List<UnitStack> Deaths { get; } = [];

        public List<UnitStack> GuestDeaths { get; } = [];
    }
}
