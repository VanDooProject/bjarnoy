using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// One player's settlements on one island, loaded tracked together and settled as one (<see cref="LinkedStore"/>): the unit
/// every resource or queue write works on (<c>docs/design/economy.md</c> section 5, "Linked realms share their stores").
/// </summary>
/// <remarks>
/// All members are tracked in the same <see cref="GameDbContext"/>, so one <c>SaveChangesAsync</c> after <see cref="WriteBack"/>
/// covers every member's concurrency token (<see cref="SettlementEntity.Version"/>) and a retry re-runs the whole body.
/// </remarks>
public sealed class LinkedGroupSession
{
    private readonly GameDbContext _dbContext;
    private readonly Dictionary<Guid, SettlementEntity> _entities;
    private readonly ILookup<Guid, ArmyEntity> _guestArmies;
    private readonly Dictionary<Guid, Dictionary<UnitType, int>> _appliedGuestDeaths = [];
    private IGiantIndex? _giants;

    internal LinkedGroupSession(
        GameDbContext dbContext,
        SettlementEntity anchor,
        IReadOnlyList<SettlementEntity> members,
        IReadOnlyList<ArmyEntity> guestArmies,
        LinkedStore store,
        TerrainSampler sampler,
        GameClock clock,
        DateTimeOffset now,
        IGiantIndex? giants)
    {
        _dbContext = dbContext;
        Anchor = anchor;
        Members = members;
        _entities = members.ToDictionary(m => m.Id);
        _guestArmies = guestArmies.ToLookup(a => a.TargetSettlementId!.Value);
        Store = store;
        Sampler = sampler;
        Clock = clock;
        Now = now;
        _giants = giants;
    }

    /// <summary>The settlement the session was loaded for (tracked, with its world and owner).</summary>
    public SettlementEntity Anchor { get; }

    /// <summary>Every settlement of the player's island set, oldest first (tracked, full includes).</summary>
    public IReadOnlyList<SettlementEntity> Members { get; }

    public LinkedStore Store { get; }

    public GameClock Clock { get; }

    /// <summary>The game time the group was settled to.</summary>
    public DateTimeOffset Now { get; }

    public WorldEntity World => Anchor.World!;

    public double SpeedFactor => World.SpeedFactor;

    public TerrainSampler Sampler { get; }

    public Func<HexCoord, Terrain> TerrainAt => Sampler.TerrainAt;

    /// <summary>The members whose rows <see cref="WriteBack"/> wrote.</summary>
    public IReadOnlyList<Guid> ChangedMembers { get; private set; } = [];

    /// <summary>The giants of the world (loaded on first use; already loaded when the group has several members).</summary>
    public async Task<IGiantIndex> GiantsAsync(CancellationToken cancellationToken = default) =>
        _giants ??= await WorldGiants.IndexAsync(_dbContext, Anchor.WorldId, cancellationToken).ConfigureAwait(false);

    internal void SetGiants(IGiantIndex giants) => _giants = giants;

    public SettlementEntity EntityOf(Guid id) => _entities[id];

    /// <summary><paramref name="id"/> as one realm sees it: the component's pooled stock over the member's own state.</summary>
    public Settlement View(Guid id) => Store.PooledView(id);

    public void Apply(Guid id, Settlement updated) => Store.Apply(id, updated);

    /// <summary>The guest armies hosted by <paramref name="id"/> that still hold units.</summary>
    public IReadOnlyList<ArmyEntity> GuestArmiesOf(Guid id) => [.. _guestArmies[id].Where(a => a.Stacks.Count > 0)];

    /// <summary>The units hosted by <paramref name="id"/>, pooled by type.</summary>
    public List<UnitStack> GuestStacksOf(Guid id) => AggregateStacks(
        _guestArmies[id].SelectMany(a => a.Stacks.Select(s => new UnitStack(s.UnitType, s.Count))));

    internal static List<UnitStack> AggregateStacks(IEnumerable<UnitStack> stacks) =>
        [.. stacks.GroupBy(s => s.Type).Select(g => new UnitStack(g.Key, g.Sum(s => s.Count))).Where(s => s.Count > 0)];

    /// <summary>
    /// Writes every member that changed back onto its tracked entity (<see cref="SettlementEntity.ApplyDomain"/>) and takes the
    /// guest deaths of the settle off the hosted armies. Does not save.
    /// </summary>
    /// <returns>Whether anything changed (the caller then saves).</returns>
    public bool WriteBack()
    {
        var changed = new List<Guid>();
        foreach (var member in Members)
        {
            var outcome = Store.Outcome(member.Id);
            if (!outcome.Changed)
            {
                continue;
            }

            member.ApplyDomain(outcome.Settlement);
            changed.Add(member.Id);
        }

        ApplyGuestDeaths();
        ChangedMembers = changed;
        return changed.Count > 0;
    }

    /// <summary>Takes the guest deaths not yet taken off the hosted armies (starvation) and drops armies left empty.</summary>
    internal void ApplyGuestDeaths()
    {
        foreach (var member in Members)
        {
            var deaths = Store.Outcome(member.Id).GuestDeaths;
            if (deaths.Count == 0)
            {
                continue;
            }

            var applied = _appliedGuestDeaths.TryGetValue(member.Id, out var a) ? a : _appliedGuestDeaths[member.Id] = [];
            var pending = new List<UnitStack>();
            foreach (var death in deaths)
            {
                var delta = death.Count - applied.GetValueOrDefault(death.Type);
                if (delta > 0)
                {
                    pending.Add(new UnitStack(death.Type, delta));
                    applied[death.Type] = death.Count;
                }
            }

            GuestArmyAllocation.ApplyLossesAndRemoveEmpty(_dbContext, [.. _guestArmies[member.Id]], pending);
        }
    }
}

/// <summary>Loads a <see cref="LinkedGroupSession"/>.</summary>
public sealed class LinkedGroupLoader(GameDbContext dbContext, TimeProvider timeProvider)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;

    /// <summary>
    /// Loads the player's settlements on <paramref name="settlementId"/>'s island tracked with their full state, settles them
    /// together to <paramref name="settleTo"/> (default: the game clock now), and brings the realm state
    /// (<see cref="Settlement.ApplyRealmState"/>) of every member up to date when that can have something to do:
    /// <paramref name="forceRealm"/>, a building still marked as outside the realm (levels to lose, or the realm may have reached
    /// it again), or a tower or longhouse that just completed (the realm moved). Null when the settlement does not exist.
    /// </summary>
    public async Task<LinkedGroupSession?> LoadAsync(
        Guid settlementId,
        DateTimeOffset? settleTo = null,
        bool forceRealm = false,
        CancellationToken ct = default)
    {
        var anchor = await Full(_dbContext.Settlements)
            .Include(s => s.World)
            // Gates the premium waiting queue (issue #158) from the owning user's IsPremium.
            .Include(s => s.Owner)
            .FirstOrDefaultAsync(s => s.Id == settlementId, ct).ConfigureAwait(false);
        if (anchor?.World is null)
        {
            return null;
        }

        var members = await Full(PlayerRealms.PlayerIslandSet(_dbContext, anchor, tracked: true)).ToListAsync(ct).ConfigureAwait(false);
        members = [.. members.OrderBy(m => m.FoundedAt).ThenBy(m => m.Id)];

        var ids = members.Select(m => m.Id).ToList();
        var guestArmies = await _dbContext.Armies
            .Include(a => a.Stacks)
            .Where(a => a.IsSupporting && ids.Contains(a.TargetSettlementId!.Value))
            .ToListAsync(ct).ConfigureAwait(false);
        var guestsByHost = guestArmies.ToLookup(a => a.TargetSettlementId!.Value);

        var world = anchor.World;
        var clock = world.ToClock();
        var now = settleTo ?? clock.ToGameTime(_timeProvider.GetUtcNow());
        var sampler = await WorldTerrain.SamplerAsync(_dbContext, world, ct).ConfigureAwait(false);

        // Giants only matter for linking, which needs two settlements; a lone settlement loads them on first use.
        var giants = members.Count > 1 ? await WorldGiants.IndexAsync(_dbContext, world.Id, ct).ConfigureAwait(false) : null;

        var store = LinkedStore.Create(
            [.. members.Select(m => new LinkedMember(
                m.ToDomain(), m.FoundedAt, LinkedGroupSession.AggregateStacks(guestsByHost[m.Id].SelectMany(a => a.Stacks.Select(s => new UnitStack(s.UnitType, s.Count)))))) ],
            world.SpeedFactor, sampler.TerrainAt, giants ?? GiantIndex.Empty);
        store.SettleTo(now);

        var session = new LinkedGroupSession(_dbContext, anchor, members, guestArmies, store, sampler, clock, now, giants);
        session.ApplyGuestDeaths();

        if (forceRealm
            || members.Any(m => store.Outcome(m.Id).Settlement.Buildings.Any(b => b.OutsideRealmSince is not null))
            || members.Any(m => store.Outcome(m.Id).Completed.Any(o => o.Type is BuildingType.Tower or BuildingType.Longhouse)))
        {
            var realmGiants = await session.GiantsAsync(ct).ConfigureAwait(false);
            foreach (var member in members)
            {
                var (applied, changed) = store.PooledView(member.Id).ApplyRealmState(
                    store.Realm, now, world.SpeedFactor, session.GuestStacksOf(member.Id), sampler.TerrainAt, realmGiants);
                if (changed)
                {
                    store.Apply(member.Id, applied);
                }
            }
        }

        return session;
    }

    private static IQueryable<SettlementEntity> Full(IQueryable<SettlementEntity> query) => query
        .Include(s => s.Buildings)
        .Include(s => s.Queue)
        .Include(s => s.Garrison)
        .Include(s => s.TrainingQueue)
        .Include(s => s.Runes);
}
