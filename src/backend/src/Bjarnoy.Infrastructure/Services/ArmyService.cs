using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Movement = Bjarnoy.Domain.Movement.Movement;

namespace Bjarnoy.Infrastructure.Services;

public sealed record ArmyDispatchResult(DispatchRejection Rejection, ArmyEntity? Army = null, bool WorldPaused = false)
{
    public bool Accepted => Rejection == DispatchRejection.None && Army is not null;
}

/// <summary>Outcome of asking an army to turn around and head home.</summary>
public enum RecallOutcome
{
    ArmyNotFound,

    /// <summary>Already home (including "arrived home during this very settle") or already returning.</summary>
    NothingToRecall,

    /// <summary>
    /// The army could be recalled (it is mid-journey or supporting) but no
    /// land/sea route home exists for it — distinct from
    /// <see cref="NothingToRecall"/>, which means there was nothing to
    /// recall in the first place (issue #159 part A). A crossing-cost river
    /// never causes this on its own; it remains possible in principle (e.g.
    /// a fleet with no adjacent open sea, or a guest's host settlement gone).
    /// </summary>
    NoRouteHome,

    Recalled,
}

public sealed record RecallResult(RecallOutcome Outcome, ArmyEntity? Army = null)
{
    public bool Accepted => Outcome == RecallOutcome.Recalled && Army is not null;
}

/// <summary>Why an admin's direct army edit was refused.</summary>
public enum AdminArmyEditOutcome
{
    Applied,
    ArmyNotFound,

    /// <summary>An empty stack list, or one that would leave the army with no units at all.</summary>
    NoUnitsLeft,

    /// <summary>The army is at home or a guest, so it has no journey whose arrival could be moved.</summary>
    NotTravelling,

    /// <summary>No route home exists from the requested hex for this army's unit class (or the hex itself is the wrong terrain for it).</summary>
    UnreachableHex,
}

public sealed record AdminArmyEditResult(
    AdminArmyEditOutcome Outcome, ArmyEntity? Army = null, GameClock? Clock = null)
{
    public bool Accepted => Outcome == AdminArmyEditOutcome.Applied && Army is not null;
}

/// <summary>
/// Armies: dispatching them from a settlement's garrison, reading them
/// (settling to now, folding a finished journey back into the garrison), and
/// recalling one mid-flight (issue #40 phase 2).
/// </summary>
/// <remarks>
/// Mirrors <see cref="SettlementService"/>'s shape: every method converts
/// wall time to game time through the owning world's <c>GameClock</c> before
/// touching the domain, and a read that finds nothing due writes nothing.
/// </remarks>
public sealed class ArmyService(
    GameDbContext dbContext,
    TimeProvider timeProvider,
    ILogger<ArmyService> logger)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<ArmyService> _logger = logger;

    /// <summary>
    /// Dispatches an army: charges the settlement for the units and
    /// provisions, and computes its route.
    /// </summary>
    /// <param name="destination">
    /// Required for <see cref="ArmyMission.Move"/>; ignored for
    /// <see cref="ArmyMission.Attack"/>/<see cref="ArmyMission.Support"/>,
    /// whose destination is always the target settlement's own hex —
    /// resolved here rather than trusted from the caller.
    /// </param>
    /// <param name="targetSettlementId">
    /// Required for <see cref="ArmyMission.Attack"/> (the settlement to fight
    /// on arrival — issue #40 phase 3) and <see cref="ArmyMission.Support"/>
    /// (the settlement to garrison as a guest on arrival — issue #40 phase 4).
    /// Targeting an army standing in the open field, rather than a
    /// settlement, is not supported.
    /// </param>
    /// <param name="targetBuildingCoord">
    /// Optional; only meaningful for <see cref="ArmyMission.Attack"/> — the
    /// building coordinate to hit with any surviving catapults (issue #40
    /// phase 5). See <see cref="Army.TargetBuildingCoord"/>.
    /// </param>
    public async Task<ArmyDispatchResult> DispatchAsync(
        Guid settlementId,
        IReadOnlyList<UnitStack> unitCounts,
        IReadOnlyList<HexCoord> waypoints,
        HexCoord? destination,
        double provisions,
        ArmyMission mission = ArmyMission.Move,
        Guid? targetSettlementId = null,
        HexCoord? targetBuildingCoord = null,
        CancellationToken cancellationToken = default)
    {
        var settlement = await LoadSettlementAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (settlement?.World is null)
        {
            return new ArmyDispatchResult(DispatchRejection.SettlementNotFound);
        }

        var clock = settlement.World.ToClock();
        if (!clock.AllowsCommands)
        {
            return new ArmyDispatchResult(DispatchRejection.None, null, WorldPaused: true);
        }

        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        // Settle first so the decision sees the garrison and stock as of now
        // — same reasoning as SettlementService.QueueBuildAsync.
        var settled = settlement.ToDomain().SettleTo(now, settlement.World.SpeedFactor).Settlement;

        HexCoord effectiveDestination;
        IReadOnlyList<(HexCoord Centre, int Radius)> targetClaimDiscs = [];
        if (mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid)
        {
            if (targetSettlementId is not { } targetId)
            {
                await PersistIfSettledAsync(settlement, settled, cancellationToken).ConfigureAwait(false);
                return new ArmyDispatchResult(DispatchRejection.TargetSettlementRequired);
            }

            if (targetId == settlementId)
            {
                await PersistIfSettledAsync(settlement, settled, cancellationToken).ConfigureAwait(false);
                return new ArmyDispatchResult(mission == ArmyMission.Support
                    ? DispatchRejection.CannotSupportOwnSettlement
                    : DispatchRejection.CannotAttackOwnSettlement);
            }

            // Same world only — an army cannot reach a settlement in another
            // world's map, so a cross-world id is indistinguishable from one
            // that does not exist. LonghouseLevel and the target's own Towers
            // come along so a fleet Attack/Raid dispatch can check the
            // target's *full* claimed territory (issue #40 phase 6 §4,
            // extended for tower satellite discs) without a second round
            // trip.
            var target = await _dbContext.Settlements
                .AsNoTracking()
                .Where(s => s.Id == targetId && s.WorldId == settlement.WorldId)
                .Select(s => new
                {
                    s.CentreQ,
                    s.CentreR,
                    LonghouseLevel = s.Buildings
                        .Where(b => b.Type == BuildingType.Longhouse)
                        .Select(b => (int?)b.Level)
                        .Max() ?? 0,
                    Towers = s.Buildings
                        .Where(b => b.Type == BuildingType.Tower)
                        .Select(b => new { b.Q, b.R, b.Level })
                        .ToList(),
                })
                .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

            if (target is null)
            {
                await PersistIfSettledAsync(settlement, settled, cancellationToken).ConfigureAwait(false);
                return new ArmyDispatchResult(DispatchRejection.TargetSettlementNotFound);
            }

            effectiveDestination = new HexCoord(target.CentreQ, target.CentreR);

            // Mirrors Settlement.ClaimDiscs: the centre disc (Settlement.ClaimRadius)
            // plus one satellite disc per Tower, centred on that tower's own
            // hex, not the settlement's centre.
            var centreClaimRadius = 1 + (target.LonghouseLevel / 2);
            targetClaimDiscs =
            [
                (effectiveDestination, centreClaimRadius),
                .. target.Towers.Select(t =>
                    (new HexCoord(t.Q, t.R), Settlement.TowerClaimRadius(t.Level))),
            ];
        }
        else
        {
            if (destination is not { } move)
            {
                await PersistIfSettledAsync(settlement, settled, cancellationToken).ConfigureAwait(false);
                return new ArmyDispatchResult(DispatchRejection.DestinationRequired);
            }

            effectiveDestination = move;
        }

        var sampler = new TerrainSampler(settlement.World.ToGenerationOptions());
        var riverTiles = await LoadRiverTilesAsync(settlement.WorldId, cancellationToken).ConfigureAwait(false);
        var armyId = Guid.CreateVersion7();

        var decision = Army.PlanDispatch(
            settled, unitCounts, provisions, waypoints, effectiveDestination, now, armyId, sampler.TerrainAt,
            mission, mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid ? targetSettlementId : null,
            mission is ArmyMission.Attack or ArmyMission.Raid ? targetBuildingCoord : null, targetClaimDiscs,
            settlement.World.SpeedFactor, riverTiles.Contains);

        if (!decision.Accepted)
        {
            // Even a refused dispatch may have completed queued work while
            // settling, which is a real change worth keeping.
            await PersistIfSettledAsync(settlement, settled, cancellationToken).ConfigureAwait(false);
            return new ArmyDispatchResult(decision.Rejection);
        }

        settlement.ApplyDomain(decision.Settlement!);

        var armyEntity = new ArmyEntity { Id = armyId, SettlementId = settlementId };
        armyEntity.ApplyDomain(decision.Army!);
        _dbContext.Armies.Add(armyEntity);

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Settlement {SettlementId} dispatched army {ArmyId} ({Count} stack(s)) to {Destination}, arriving {ArrivesAt}.",
            settlementId, armyId, decision.Army!.Stacks.Count, effectiveDestination,
            ((ArmyLocation.InTransit)decision.Army.Location).Movement.ArrivesAt);

        return new ArmyDispatchResult(DispatchRejection.None, armyEntity);
    }

    /// <summary>
    /// An army's home settlement id (<see cref="ArmyEntity.SettlementId"/>) —
    /// unlike <see cref="GetAsync"/>, this is a bare id lookup with no
    /// settling, for the ownership-authorization endpoint filter
    /// (<c>Bjarnoy.Api.Auth.ArmyOwnershipEndpointFilter</c>): an army has no
    /// owner of its own, only the settlement it was dispatched from, which
    /// stays the same for its whole life regardless of where it currently is
    /// or whether it has already folded home. Null if no such army row
    /// exists (including one already folded back and deleted).
    /// </summary>
    public async Task<Guid?> GetOwningSettlementIdAsync(
        Guid armyId, CancellationToken cancellationToken = default)
    {
        // SettlementId is never Guid.Empty (ArmyEntity.Id/SettlementId are
        // both real generated ids), so a plain FirstOrDefaultAsync default
        // (Guid?)null unambiguously means "no such army row".
        return await _dbContext.Armies
            .Where(a => a.Id == armyId)
            .Select(a => (Guid?)a.SettlementId)
            .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Loads an army as of now: past its turn-around it is put onto its
    /// return leg, and past that it is folded back into its home
    /// settlement's garrison and its row deleted — in which case this
    /// returns <see langword="null"/> for the army (nothing left to read).
    /// </summary>
    public async Task<(ArmyEntity? Army, GameClock Clock)?> GetAsync(
        Guid armyId, CancellationToken cancellationToken = default)
    {
        var army = await LoadArmyAsync(armyId, cancellationToken).ConfigureAwait(false);
        if (army?.Settlement?.World is null)
        {
            return null;
        }

        var clock = army.Settlement.World.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        var outcome = await SettleAndFoldAsync(army, now, cancellationToken).ConfigureAwait(false);
        if (outcome != ArmySettleOutcome.NoChange)
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }

        return outcome == ArmySettleOutcome.FoldedHome ? (null, clock) : (army, clock);
    }

    /// <summary>Armies belonging to a settlement — home, in transit, and currently supporting elsewhere. Not settled on read; see <see cref="SettlementService.GetForWorldAsync"/> for the same reasoning.</summary>
    public Task<List<ArmyEntity>> GetForSettlementAsync(Guid settlementId, CancellationToken cancellationToken = default) =>
        _dbContext.Armies
            .AsNoTracking()
            .Include(a => a.Settlement)
            .Include(a => a.Stacks)
            .Include(a => a.TargetSettlement)
            .Where(a => a.SettlementId == settlementId)
            .OrderBy(a => a.Id)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Guest (<see cref="ArmyMission.Support"/>) armies currently stationed at
    /// <paramref name="hostSettlementId"/> (issue #40 phase 4 §5) — the
    /// host's view of who is defending it, distinct from
    /// <see cref="GetForSettlementAsync"/>, which lists a settlement's own
    /// armies by where they came <em>from</em>.
    /// </summary>
    public Task<List<ArmyEntity>> GetGuestArmiesAsync(Guid hostSettlementId, CancellationToken cancellationToken = default) =>
        _dbContext.Armies
            .AsNoTracking()
            .Include(a => a.Stacks)
            .Where(a => a.IsSupporting && a.TargetSettlementId == hostSettlementId)
            .OrderBy(a => a.Id)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Turns an army around mid-journey — or, for a <see cref="ArmyLocation.Supporting"/>
    /// guest, calls it home from its host (issue #40 phase 4 §4). Refused (as
    /// <see cref="RecallOutcome.NothingToRecall"/>) when it is already
    /// returning, or arrived home during this very settle; refused instead as
    /// <see cref="RecallOutcome.NoRouteHome"/> when the army was actually
    /// recallable but no route home exists (issue #159 part A).
    /// </summary>
    public async Task<RecallResult> RecallAsync(Guid armyId, CancellationToken cancellationToken = default)
    {
        var army = await LoadArmyAsync(armyId, cancellationToken).ConfigureAwait(false);
        if (army?.Settlement?.World is null)
        {
            return new RecallResult(RecallOutcome.ArmyNotFound);
        }

        var clock = army.Settlement.World.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        var outcome = await SettleAndFoldAsync(army, now, cancellationToken).ConfigureAwait(false);
        if (outcome == ArmySettleOutcome.FoldedHome)
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return new RecallResult(RecallOutcome.NothingToRecall);
        }

        var sampler = new TerrainSampler(army.Settlement.World.ToGenerationOptions());
        var riverTiles = await LoadRiverTilesAsync(army.Settlement.WorldId, cancellationToken).ConfigureAwait(false);
        var home = new HexCoord(army.Settlement.CentreQ, army.Settlement.CentreR);

        var domain = army.ToDomain();
        HexCoord? currentHex = null;
        if (domain.Location is ArmyLocation.Supporting supporting)
        {
            // A guest army has no active Movement to derive its position
            // from — look up the host settlement's hex directly.
            var host = await _dbContext.Settlements
                .AsNoTracking()
                .Where(s => s.Id == supporting.HostSettlementId)
                .Select(s => new { s.CentreQ, s.CentreR })
                .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

            if (host is not null)
            {
                currentHex = new HexCoord(host.CentreQ, host.CentreR);
            }
        }

        // Mirrors Army.Recall's own switch: only these two locations (with a
        // resolved host hex for a guest) are recallable at all. Checked
        // separately here so a null Recall result can be told apart as
        // RecallOutcome.NoRouteHome rather than folded into NothingToRecall.
        var isRecallable = domain.Location is ArmyLocation.InTransit { Movement.IsReturning: false }
            || (domain.Location is ArmyLocation.Supporting && currentHex is not null);

        var recalled = domain.Recall(
            now, home, sampler.TerrainAt, currentHex, army.Settlement.World.SpeedFactor, riverTiles.Contains);

        if (recalled is null)
        {
            if (outcome == ArmySettleOutcome.Updated)
            {
                await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            }

            return new RecallResult(isRecallable ? RecallOutcome.NoRouteHome : RecallOutcome.NothingToRecall, army);
        }

        army.ApplyDomain(recalled);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Army {ArmyId} recalled at {Now}, now heading home.", armyId, now);

        return new RecallResult(RecallOutcome.Recalled, army);
    }

    /// <summary>
    /// Admin god-mode: edits a live army in place — its unit stacks, its
    /// provisions, when its current journey arrives, and where on the map it
    /// stands. Every part is optional; whatever is supplied is applied in that
    /// order, on an army first settled to now like every other read path.
    /// </summary>
    /// <param name="stacks">
    /// Full replacement for the army's unit stacks (entries with a count of
    /// zero are dropped). The army's movement is <em>not</em> re-pathed: a
    /// stack change alters speed and upkeep from now on, but the leg it is
    /// already flying keeps the timing it was dispatched with — use
    /// <paramref name="arriveIn"/> to retime it deliberately rather than
    /// having it shift as a side effect.
    /// </param>
    /// <param name="provisions">Absolute food load, not a delta.</param>
    /// <param name="arriveIn">
    /// How far from game-now this army's active leg should arrive — the "speed
    /// up" control; pass <see cref="TimeSpan.Zero"/> to land it immediately.
    /// Refused with <see cref="AdminArmyEditOutcome.NotTravelling"/> for an
    /// army at home or standing as a guest. Relative rather than absolute so
    /// the caller need not resolve the world's <see cref="GameClock"/> itself.
    /// </param>
    /// <param name="teleportTo">
    /// Hex to drop the army onto, standing there as of now with a fresh route
    /// home — see <see cref="Army.TeleportTo"/>.
    /// </param>
    public async Task<AdminArmyEditResult> AdminEditAsync(
        Guid armyId,
        IReadOnlyList<UnitStack>? stacks = null,
        double? provisions = null,
        TimeSpan? arriveIn = null,
        HexCoord? teleportTo = null,
        CancellationToken cancellationToken = default)
    {
        var army = await LoadArmyAsync(armyId, cancellationToken).ConfigureAwait(false);
        if (army?.Settlement?.World is null)
        {
            return new AdminArmyEditResult(AdminArmyEditOutcome.ArmyNotFound);
        }

        var clock = army.Settlement.World.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        // Settle first, exactly as GetAsync does: an army that has already
        // arrived home is gone, and there is nothing left to edit.
        var outcome = await SettleAndFoldAsync(army, now, cancellationToken).ConfigureAwait(false);
        if (outcome == ArmySettleOutcome.FoldedHome)
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return new AdminArmyEditResult(AdminArmyEditOutcome.ArmyNotFound);
        }

        // A refused edit may still have advanced the army's own journey while
        // settling above, and that is a real change worth keeping — the same
        // rule every rejected write path in SettlementService follows.
        async Task<AdminArmyEditResult> RejectAsync(AdminArmyEditOutcome reason)
        {
            if (outcome == ArmySettleOutcome.Updated)
            {
                await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            }

            return new AdminArmyEditResult(reason);
        }

        var domain = army.ToDomain();

        if (stacks is not null)
        {
            var kept = stacks.Where(s => s.Count > 0).ToList();
            if (kept.Count == 0)
            {
                return await RejectAsync(AdminArmyEditOutcome.NoUnitsLeft).ConfigureAwait(false);
            }

            domain = domain with { Stacks = kept };
        }

        if (provisions is { } food)
        {
            domain = domain with { Provisions = Math.Max(0, food) };
        }

        if (teleportTo is { } destination)
        {
            var sampler = new TerrainSampler(army.Settlement.World.ToGenerationOptions());
            var riverTiles = await LoadRiverTilesAsync(army.Settlement.WorldId, cancellationToken).ConfigureAwait(false);
            var home = new HexCoord(army.Settlement.CentreQ, army.Settlement.CentreR);

            // An explicit provisions value is the admin's final word, so it is
            // carried into the new leg rather than being re-burned against the
            // leg this teleport is throwing away.
            var teleported = domain.TeleportTo(
                destination, home, now, sampler.TerrainAt,
                provisions is { } given ? Math.Max(0, given) : null, army.Settlement.World.SpeedFactor,
                riverTiles.Contains);
            if (teleported is null)
            {
                return await RejectAsync(AdminArmyEditOutcome.UnreachableHex).ConfigureAwait(false);
            }

            domain = teleported;
        }

        if (arriveIn is { } arrival)
        {
            var shifted = domain.ShiftArrivalTo(now + arrival);
            if (shifted is null)
            {
                return await RejectAsync(AdminArmyEditOutcome.NotTravelling).ConfigureAwait(false);
            }

            domain = shifted;
        }

        army.ApplyDomain(domain);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Admin edited army {ArmyId} (stacks: {Stacks}, provisions: {Provisions}, arrival in: {Arrival}, hex: {Hex}).",
            armyId, stacks is not null, provisions is not null, arriveIn, teleportTo);

        return new AdminArmyEditResult(AdminArmyEditOutcome.Applied, army, clock);
    }

    /// <summary>
    /// Every army whose home settlement is in <paramref name="worldId"/> —
    /// the admin troop browser's listing. Not settled on read, for the same
    /// reason <see cref="GetForSettlementAsync"/> is not.
    /// </summary>
    public Task<List<ArmyEntity>> GetForWorldAsync(Guid worldId, CancellationToken cancellationToken = default) =>
        _dbContext.Armies
            .AsNoTracking()
            .Include(a => a.Settlement)
            .Include(a => a.Stacks)
            .Include(a => a.TargetSettlement)
            .Where(a => a.Settlement!.WorldId == worldId)
            .OrderBy(a => a.Id)
            .ToListAsync(cancellationToken);

    private enum ArmySettleOutcome
    {
        NoChange,
        Updated,
        FoldedHome,
    }

    /// <summary>
    /// Settles <paramref name="army"/> to <paramref name="now"/>; when that
    /// brings it all the way home, folds its stacks (and any loot) into the
    /// settlement's garrison and removes the army row from the context
    /// (SaveChanges is still the caller's job either way).
    /// </summary>
    /// <remarks>
    /// An <see cref="ArmyMission.Attack"/> or <see cref="ArmyMission.Raid"/>
    /// (issue #40 phase 7) army whose outbound <c>Movement.ArrivesAt</c> has
    /// passed and has not yet turned around is routed to
    /// <see cref="ResolveBattleAsync"/> instead of the plain
    /// <c>Army.SettleTo</c> path: it fights right there rather than standing
    /// and later auto-returning the way <see cref="ArmyMission.Move"/> does —
    /// see <see cref="Army.SettleArrival"/>. An <see cref="ArmyMission.Support"/>
    /// army in the same "outbound leg's arrival has passed" situation is
    /// similarly special-cased (issue #40 phase 4): it becomes a guest at its
    /// host and the row is kept (<see cref="ArmySettleOutcome.Updated"/>), not
    /// folded home — see <see cref="Army.SettleSupportArrival"/>. Once a
    /// support army is actually <see cref="ArmyLocation.Supporting"/>, plain
    /// <c>Army.SettleTo</c> already treats that as "nothing to settle" (it
    /// only handles <see cref="ArmyLocation.InTransit"/>), so it falls
    /// straight through to the no-op branch below until the owner recalls it.
    /// </remarks>
    private async Task<ArmySettleOutcome> SettleAndFoldAsync(
        ArmyEntity army, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var domain = army.ToDomain();

        if (domain.Mission is ArmyMission.Attack or ArmyMission.Raid
            && domain.Location is ArmyLocation.InTransit { Movement.IsReturning: false } inTransit
            && now >= inTransit.Movement.ArrivesAt)
        {
            return await ResolveBattleAsync(army, domain, now, cancellationToken).ConfigureAwait(false);
        }

        if (domain.Mission == ArmyMission.Support
            && domain.Location is ArmyLocation.InTransit { Movement.IsReturning: false } supportTransit
            && now >= supportTransit.Movement.ArrivesAt)
        {
            var supportArrival = Army.SettleSupportArrival(domain, now);
            army.ApplyDomain(supportArrival.Army);

            _logger.LogInformation(
                "Army {ArmyId} arrived at settlement {HostId} to support it as a guest.",
                army.Id, supportArrival.Army.TargetSettlementId);

            return ArmySettleOutcome.Updated;
        }

        var result = domain.SettleTo(now);
        if (!result.Changed)
        {
            return ArmySettleOutcome.NoChange;
        }

        if (result.ArrivedHome)
        {
            FoldHome(army, result.Army, now);
            return ArmySettleOutcome.FoldedHome;
        }

        army.ApplyDomain(result.Army);
        return ArmySettleOutcome.Updated;
    }

    /// <summary>
    /// Settles an <see cref="ArmyMission.Attack"/> army's arrival: loads the
    /// target settlement (and every guest army currently supporting it — see
    /// <see cref="Army.SettleArrival"/>'s <c>guestDefenderStacks</c> parameter,
    /// issue #40 phase 4 §3), runs <see cref="Army.SettleArrival"/> against
    /// it, persists the resulting <see cref="BattleReportEntity"/>, the
    /// defender's post-battle state, and each guest army's post-battle
    /// stacks, and either removes the army row (a wiped-out attacker, or one
    /// that folds straight home within this same settle) or writes its
    /// post-battle return-leg state back.
    /// </summary>
    private async Task<ArmySettleOutcome> ResolveBattleAsync(
        ArmyEntity armyEntity, Army domain, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var targetId = domain.TargetSettlementId!.Value;
        var defenderEntity = await LoadSettlementAsync(targetId, cancellationToken).ConfigureAwait(false);
        var movement = ((ArmyLocation.InTransit)domain.Location).Movement;

        if (defenderEntity?.World is null)
        {
            // The target settlement no longer exists — settlements are never
            // deleted today, so this is defensive rather than an expected
            // case. Nothing to fight: send the army straight home rather than
            // leaving it stuck forever waiting to attack a place that is gone.
            _logger.LogWarning(
                "Army {ArmyId}'s attack target {TargetId} no longer exists; recalling home without a battle.",
                armyEntity.Id, targetId);

            return ApplyArmyOutcome(armyEntity, TurnHomeWithoutBattle(domain, movement), now);
        }

        var guestArmies = await GetGuestArmyEntitiesForWriteAsync(targetId, cancellationToken).ConfigureAwait(false);
        var guestDefenderStacks = guestArmies
            .SelectMany(a => a.Stacks.Select(s => new UnitStack(s.UnitType, s.Count)))
            .GroupBy(s => s.Type)
            .Select(g => new UnitStack(g.Key, g.Sum(s => s.Count)))
            .ToList();

        var seed = Random.Shared.Next();
        var arrival = Army.SettleArrival(
            domain, defenderEntity.ToDomain(), defenderEntity.World.SpeedFactor, now, seed, guestDefenderStacks);

        // Guaranteed true: the caller only reaches this method when the
        // outbound leg's ArrivesAt has already passed for a not-yet-returning
        // Attack army — exactly SettleArrival's own fire condition.
        var battle = arrival.Battle!;

        defenderEntity.ApplyDomain(arrival.DefenderSettlement);

        // Attribute the guest side's pooled share of the battle back onto
        // the actual guest Army records — the second half of the same
        // cross-aggregate split Settlement's starvation pass uses (see
        // GuestArmyAllocation's remarks). A guest fully wiped out here is
        // removed exactly like a wiped-out attacker; a partial survivor keeps
        // supporting with what is left.
        GuestArmyAllocation.ApplyLosses(guestArmies, arrival.GuestLosses);
        foreach (var guest in guestArmies.Where(a => a.Stacks.Count == 0))
        {
            _dbContext.Armies.Remove(guest);
        }

        var report = BattleReport.From(
            Guid.CreateVersion7(), movement.ArrivesAt, armyEntity.Id, armyEntity.SettlementId, targetId,
            domain.Stacks, battle, seed, arrival.Siege, wasRaid: domain.Mission == ArmyMission.Raid);
        _dbContext.BattleReports.Add(BattleReportEntity.FromDomain(report));

        if (arrival.Siege is { Applied: true } siege)
        {
            _logger.LogInformation(
                "Army {ArmyId}'s catapults reduced {TargetType} at ({Q},{R}) in settlement {TargetId} from "
                    + "level {Before} to {After}{RazedNote}.",
                armyEntity.Id, siege.TargetType, siege.TargetCoord!.Value.Q, siege.TargetCoord.Value.R, targetId,
                siege.LevelBefore, siege.LevelAfter, siege.SettlementRazed ? " — the settlement is razed" : string.Empty);
        }

        _logger.LogInformation(
            "Army {ArmyId} attacked settlement {TargetId}: {Winner} won ({AttackPower} vs {DefensePower}); "
                + "{AttackerSurvivors} attacker unit(s) survived.",
            armyEntity.Id, targetId, battle.Winner, battle.AttackPower, battle.DefensePower,
            battle.AttackerSurvivors.Sum(s => s.Count));

        if (arrival.Army is null)
        {
            // Wiped out — no return trip for zero units.
            _dbContext.Armies.Remove(armyEntity);
            return ArmySettleOutcome.FoldedHome;
        }

        return ApplyArmyOutcome(armyEntity, arrival.Army, now);
    }

    /// <summary>
    /// Builds the "no battle happened, just go home" return leg for
    /// <see cref="ResolveBattleAsync"/>'s defensive missing-target-settlement
    /// path — otherwise identical to how <c>Army.SettleTo</c>'s turn-around
    /// branch (and <c>Army.SettleArrival</c>'s own post-battle branch) build a
    /// return leg from the precomputed <c>ReturnPath</c>.
    /// </summary>
    private static Army TurnHomeWithoutBattle(Army domain, Movement movement) => domain with
    {
        Location = new ArmyLocation.InTransit(new Movement
        {
            DepartedAt = movement.ArrivesAt,
            Path = movement.ReturnPath,
            CumulativeHours = movement.ReturnCumulativeHours,
            ReturnPath = movement.ReturnPath,
            ReturnCumulativeHours = movement.ReturnCumulativeHours,
            TurnAroundAt = movement.ArrivesAt,
            IsReturning = true,
        }),
    };

    /// <summary>
    /// Continues settling a just-turned-around army onward to <paramref name="now"/>
    /// (it may already be home) and writes back whichever outcome results.
    /// </summary>
    private ArmySettleOutcome ApplyArmyOutcome(ArmyEntity armyEntity, Army turnedArmy, DateTimeOffset now)
    {
        var result = turnedArmy.SettleTo(now);
        var finalArmy = result.Changed ? result.Army : turnedArmy;

        if (result.ArrivedHome)
        {
            FoldHome(armyEntity, finalArmy, now);
            return ArmySettleOutcome.FoldedHome;
        }

        armyEntity.ApplyDomain(finalArmy);
        return ArmySettleOutcome.Updated;
    }

    /// <summary>
    /// Folds a returned army's stacks — and any <see cref="Army.Loot"/> — into
    /// its home settlement's garrison and stock, then removes the army row.
    /// </summary>
    private void FoldHome(ArmyEntity armyEntity, Army returnedArmy, DateTimeOffset now)
    {
        var settlementEntity = armyEntity.Settlement!;
        var settled = settlementEntity.ToDomain()
            .SettleTo(now, settlementEntity.World!.SpeedFactor).Settlement;

        var merged = MergeIntoGarrison(settled, returnedArmy.Stacks);
        if (!returnedArmy.Loot.IsZero)
        {
            merged = merged with { Resources = merged.Resources.Deposit(returnedArmy.Loot, now) };
        }

        settlementEntity.ApplyDomain(merged);
        _dbContext.Armies.Remove(armyEntity);

        _logger.LogInformation(
            "Army {ArmyId} arrived home at settlement {SettlementId}; folded into garrison.",
            armyEntity.Id, armyEntity.SettlementId);
    }

    /// <summary>
    /// Guest armies at <paramref name="hostSettlementId"/>, tracked (not
    /// <c>AsNoTracking</c>) so <see cref="GuestArmyAllocation.ApplyLosses"/>
    /// can write battle losses straight onto them — the write-path
    /// counterpart to the public, read-only <see cref="GetGuestArmiesAsync"/>.
    /// </summary>
    private Task<List<ArmyEntity>> GetGuestArmyEntitiesForWriteAsync(Guid hostSettlementId, CancellationToken cancellationToken) =>
        _dbContext.Armies
            .Include(a => a.Stacks)
            .Where(a => a.IsSupporting && a.TargetSettlementId == hostSettlementId)
            .ToListAsync(cancellationToken);

    private static Settlement MergeIntoGarrison(Settlement settlement, IReadOnlyList<UnitStack> stacks)
    {
        var garrison = settlement.Garrison.ToList();
        foreach (var stack in stacks)
        {
            var index = garrison.FindIndex(g => g.Type == stack.Type);
            if (index >= 0)
            {
                garrison[index] = garrison[index] with { Count = garrison[index].Count + stack.Count };
            }
            else
            {
                garrison.Add(stack);
            }
        }

        return settlement with { Garrison = garrison };
    }

    private Task<SettlementEntity?> LoadSettlementAsync(Guid settlementId, CancellationToken cancellationToken) =>
        _dbContext.Settlements
            .Include(s => s.World)
            .Include(s => s.Buildings)
            .Include(s => s.Queue)
            .Include(s => s.Garrison)
            .Include(s => s.TrainingQueue)
            .Include(s => s.Runes)
            .FirstOrDefaultAsync(s => s.Id == settlementId, cancellationToken);

    /// <summary>
    /// Every river tile across every island of <paramref name="worldId"/>, as
    /// a flat set of hexes (issue #159 part A) — one query per request at
    /// each of the three call sites that already build a
    /// <see cref="TerrainSampler"/>, mirroring how terrain itself is sampled
    /// once per request rather than per hex. <c>RiverTiles</c> is an
    /// EF-converted column (<see cref="Persistence.RiverTileListConverter"/>),
    /// so it can only be flattened client-side once each island's row is
    /// materialized, not projected further in SQL.
    /// </summary>
    private async Task<HashSet<HexCoord>> LoadRiverTilesAsync(Guid worldId, CancellationToken cancellationToken)
    {
        var islands = await _dbContext.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId)
            .Select(i => i.RiverTiles)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return islands
            .SelectMany(tiles => tiles)
            .Select(t => new HexCoord(t.Q, t.R))
            .ToHashSet();
    }

    private Task<ArmyEntity?> LoadArmyAsync(Guid armyId, CancellationToken cancellationToken) =>
        _dbContext.Armies
            .Include(a => a.Stacks)
            .Include(a => a.TargetSettlement)
            .Include(a => a.Settlement!).ThenInclude(s => s.World)
            .Include(a => a.Settlement!).ThenInclude(s => s.Buildings)
            .Include(a => a.Settlement!).ThenInclude(s => s.Queue)
            .Include(a => a.Settlement!).ThenInclude(s => s.Garrison)
            .Include(a => a.Settlement!).ThenInclude(s => s.TrainingQueue)
            .Include(a => a.Settlement!).ThenInclude(s => s.Runes)
            .FirstOrDefaultAsync(a => a.Id == armyId, cancellationToken);

    private async Task PersistIfSettledAsync(
        SettlementEntity entity, Settlement settled, CancellationToken cancellationToken)
    {
        if (settled.Resources.SettledAt == entity.SettledAt
            && settled.Queue.Count == entity.Queue.Count
            && settled.TrainingQueue.Count == entity.TrainingQueue.Count)
        {
            return;
        }

        entity.ApplyDomain(settled);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }
}
