using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.World;
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
    /// recall in the first place (issue #159 part A). It is possible when the
    /// army stands where mountains or wide rivers close it in (a land army
    /// cannot cross either), a fleet has no adjacent open sea, or a guest's
    /// host settlement is gone.
    /// </summary>
    NoRouteHome,

    Recalled,
}

public sealed record RecallResult(RecallOutcome Outcome, ArmyEntity? Army = null)
{
    public bool Accepted => Outcome == RecallOutcome.Recalled && Army is not null;
}

/// <summary>The outcome of asking to redirect an in-transit founding convoy — mirrors <see cref="RecallResult"/>.</summary>
public sealed record RetargetFoundingApiResult(RetargetFoundingRejection Rejection, ArmyEntity? Army = null, bool ArmyNotFound = false)
{
    public bool Accepted => Rejection == RetargetFoundingRejection.None && Army is not null;
}

/// <summary>The outcome of asking to send an already-fielded army onward (issue #156) — mirrors <see cref="RetargetFoundingApiResult"/>. <c>Army</c> is the army that left (the new one for a split).</summary>
public sealed record FieldOrderApiResult(FieldOrderRejection Rejection, ArmyEntity? Army = null, bool ArmyNotFound = false)
{
    public bool Accepted => Rejection == FieldOrderRejection.None && Army is not null;
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
/// recalling one mid-flight (issue #40 phase 2). Also settlement-founding
/// convoys (issue #55): a <see cref="ArmyMission.Found"/> army is dispatched,
/// read, and recalled through these exact same methods — only its dispatch-
/// time validation and arrival resolution differ, both handled inline below.
/// </summary>
/// <remarks>
/// Mirrors <see cref="SettlementService"/>'s shape: every method converts
/// wall time to game time through the owning world's <c>GameClock</c> before
/// touching the domain, and a read that finds nothing due writes nothing.
/// </remarks>
public sealed class ArmyService(
    GameDbContext dbContext,
    TimeProvider timeProvider,
    SettlementService settlementService,
    RenownService renownService,
    AuthService authService,
    FieldBattleService fieldBattleService,
    CampService campService,
    CampAmbushService campAmbushService,
    ExploredAreaService exploredAreaService,
    ArmyReportService armyReportService,
    ILogger<ArmyService> logger)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly SettlementService _settlementService = settlementService;

    /// <summary>Settlements a siege changed during the settle in progress; <see cref="SettleAndFoldAsync"/> reconciles their realm once the settle is saved.</summary>
    private readonly HashSet<Guid> _realmDirty = [];
    private readonly RenownService _renownService = renownService;
    private readonly AuthService _authService = authService;
    private readonly FieldBattleService _fieldBattleService = fieldBattleService;
    private readonly CampService _campService = campService;
    private readonly CampAmbushService _campAmbushService = campAmbushService;
    private readonly ExploredAreaService _exploredAreaService = exploredAreaService;
    private readonly ArmyReportService _armyReportService = armyReportService;
    private readonly ILogger<ArmyService> _logger = logger;

    /// <summary>
    /// Saves the context, first staging the ground every tracked army walked on the legs it finished as explored
    /// (<see cref="ExploredAreaService.StageWalkedLegsAsync"/>) so it commits with the same save and unit of work. Every
    /// save in this service goes through here, including ones that change an army this request did not start from
    /// (the other side of a field battle).
    /// </summary>
    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        var armies = _dbContext.ChangeTracker.Entries<ArmyEntity>().Select(e => e.Entity).ToList();
        await _exploredAreaService.StageWalkedLegsAsync(armies, cancellationToken).ConfigureAwait(false);
        await RemoveEmptyGatheringsAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Deletes every gathering this save leaves with no group: the last group left it (recalled, new order, split off, lost a fight,
    /// destroyed) so nothing is left to meet and nothing continues. A boarding gathering feeding a sea meeting keeps that meeting alive,
    /// and one that was deleted here may leave its meeting empty in turn.
    /// </summary>
    private async Task RemoveEmptyGatheringsAsync(CancellationToken cancellationToken)
    {
        var tracked = _dbContext.ChangeTracker.Entries<ArmyEntity>().ToList();
        var candidates = new Queue<Guid>(tracked
            .Where(e => e.State is EntityState.Modified or EntityState.Deleted)
            .Select(e => e.OriginalValues.GetValue<Guid?>(nameof(ArmyEntity.GatheringId)))
            .OfType<Guid>()
            .Distinct());
        if (candidates.Count == 0)
        {
            return;
        }

        var trackedIds = tracked.Select(e => e.Entity.Id).ToHashSet();
        var removed = new HashSet<Guid>();
        while (candidates.TryDequeue(out var id))
        {
            if (removed.Contains(id))
            {
                continue;
            }

            var hasTrackedGroup = tracked.Any(e => e.State != EntityState.Deleted && e.Entity.GatheringId == id);
            var hasStoredGroup = await _dbContext.Armies.AnyAsync(a => a.GatheringId == id && !trackedIds.Contains(a.Id), cancellationToken).ConfigureAwait(false);
            var hasFeeder = await _dbContext.Gatherings.AnyAsync(g => g.ParentGatheringId == id && !removed.Contains(g.Id), cancellationToken).ConfigureAwait(false);
            if (hasTrackedGroup || hasStoredGroup || hasFeeder)
            {
                // A group left (recalled, new order, split off, lost a fight): the gathering row is written too, so a merge of the same
                // gathering that raced this request raises a concurrency exception and the request runs again on fresh state.
                if (_dbContext.Gatherings.Local.FirstOrDefault(g => g.Id == id) is { } kept
                    && _dbContext.Entry(kept).State is not (EntityState.Deleted or EntityState.Detached))
                {
                    kept.Version = Guid.NewGuid();
                }

                continue;
            }

            if (await _dbContext.Gatherings.FirstOrDefaultAsync(g => g.Id == id, cancellationToken).ConfigureAwait(false) is { } empty)
            {
                removed.Add(id);
                _dbContext.Gatherings.Remove(empty);
                if (empty.ParentGatheringId is { } parent)
                {
                    candidates.Enqueue(parent);
                }
            }
        }
    }

    /// <summary>
    /// Dispatches an army: charges the settlement for the units and
    /// provisions, and computes its route.
    /// </summary>
    /// <param name="destination">
    /// Required for <see cref="ArmyMission.Move"/> and, as the camp's own hex, for <see cref="ArmyMission.Hunt"/>
    /// (the route then ends on the camp's hex, or on its nearest walkable neighbour when that hex is not walkable); ignored for
    /// <see cref="ArmyMission.Attack"/>/<see cref="ArmyMission.Support"/>,
    /// whose destination is always the target settlement's own hex (a support army walks to the garrison spot it names) —
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
    /// Optional for <see cref="ArmyMission.Attack"/> — the
    /// building coordinate to hit with any surviving catapults (issue #40
    /// phase 5); required for <see cref="ArmyMission.Support"/>: the host's garrison spot the guest joins.
    /// See <see cref="Army.TargetBuildingCoord"/>.
    /// </param>
    /// <param name="fromSpot">
    /// The garrison spot (longhouse, tower or dock hex) of the settlement the units leave from; it becomes the army's home spot.
    /// </param>
    public Task<ArmyDispatchResult> DispatchAsync(
        Guid settlementId,
        HexCoord fromSpot,
        IReadOnlyList<UnitStack> unitCounts,
        IReadOnlyList<HexCoord> waypoints,
        HexCoord? destination,
        double provisions,
        ArmyMission mission = ArmyMission.Move,
        Guid? targetSettlementId = null,
        HexCoord? targetBuildingCoord = null,
        CancellationToken cancellationToken = default) =>
        DispatchAsync(
            settlementId, [(fromSpot, unitCounts)], waypoints, destination, provisions, mission, targetSettlementId, targetBuildingCoord,
            cancellationToken);

    /// <summary>
    /// <see cref="DispatchAsync(Guid, HexCoord, IReadOnlyList{UnitStack}, IReadOnlyList{HexCoord}, HexCoord?, double, ArmyMission, Guid?, HexCoord?, CancellationToken)"/>
    /// for units standing at one or several garrison spots. With one group the army leaves its spot, which becomes its home spot; with
    /// several, each group leaves its own spot as an army of its own and they meet on the way
    /// (<see cref="Army.PlanGatheredDispatch"/>). Answers with the one army the caller reports: the group that reaches the meeting first.
    /// </summary>
    /// <param name="groups">The units of each garrison spot they leave from.</param>
    public async Task<ArmyDispatchResult> DispatchAsync(
        Guid settlementId,
        IReadOnlyList<(HexCoord Spot, IReadOnlyList<UnitStack> Units)> groups,
        IReadOnlyList<HexCoord> waypoints,
        HexCoord? destination,
        double provisions,
        ArmyMission mission = ArmyMission.Move,
        Guid? targetSettlementId = null,
        HexCoord? targetBuildingCoord = null,
        CancellationToken cancellationToken = default)
    {
        // The units leave this settlement's garrison, but the provisions come out of the linked realm's shared stock
        // (docs/design/economy.md section 5), so the dispatch is decided on the pooled view of the group.
        var session = await _settlementService.LoadGroupAsync(settlementId, cancellationToken: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new ArmyDispatchResult(DispatchRejection.SettlementNotFound);
        }

        var settlement = session.Anchor;
        if (!session.Clock.AllowsCommands)
        {
            return new ArmyDispatchResult(DispatchRejection.None, null, WorldPaused: true);
        }

        var now = session.Now;

        // Settled first (by the group load) so the decision sees the garrison and stock as of now: same reasoning as
        // SettlementService.QueueBuildAsync.
        var settled = session.View(settlementId);

        HexCoord effectiveDestination;
        IReadOnlyList<(HexCoord Centre, int Radius)> targetClaimDiscs = [];
        IReadOnlyList<GarrisonSpot> targetSpots = [];
        if (mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid)
        {
            var resolved = await ResolveTargetSettlementAsync(settlement.WorldId, targetSettlementId, session.Sampler.TerrainAt, cancellationToken).ConfigureAwait(false);
            if (resolved.Rejection != DispatchRejection.None)
            {
                await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
                return new ArmyDispatchResult(resolved.Rejection);
            }

            effectiveDestination = resolved.Centre;
            targetClaimDiscs = resolved.ClaimDiscs;
            targetSpots = resolved.Spots;
        }
        else
        {
            if (destination is not { } move)
            {
                await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
                return new ArmyDispatchResult(DispatchRejection.DestinationRequired);
            }

            effectiveDestination = move;
        }

        var sampler = session.Sampler;
        var rivers = await WorldRivers.IndexAsync(_dbContext, settlement.WorldId, cancellationToken).ConfigureAwait(false);
        var walls = (await WorldBridges.RouteIndexAsync(_dbContext, settlement.WorldId, sampler.TerrainAt, rivers.IsWide, now, cancellationToken).ConfigureAwait(false))
            .ForOwner(WorldPalisades.OwnerKeyOf(settlement.UserId, settlement.Id));
        var dispatchGiantIndex = await LoadGiantIndexAsync(settlement.WorldId, cancellationToken).ConfigureAwait(false);
        var armyId = Guid.CreateVersion7();

        // Hunt-specific: the destination names the camp's hex. With no camp there the dispatch is refused by
        // Army.PlanDispatch (targetCampCoord stays null); otherwise the route may end beside a camp whose own
        // hex is not walkable.
        HexCoord? targetCampCoord = null;
        var targetCampIsWater = false;
        var targetCampIsSand = false;
        if (mission == ArmyMission.Hunt)
        {
            (effectiveDestination, targetCampCoord, targetCampIsWater, targetCampIsSand) = await ResolveHuntCampAsync(
                settlement.WorldId, effectiveDestination, groups[0].Spot,
                now, sampler.TerrainAt, cancellationToken).ConfigureAwait(false);
        }

        // Founding-specific, dispatch-time-only checks (issue #55 §6): renown/
        // slot and target-hex spacing both need database access the pure
        // Army.PlanDispatch cannot reach on its own, so they are resolved
        // here, once, and threaded in as already-decided booleans/callbacks.
        // A convoy already travelling is never re-checked against either rule
        // later — only the target-still-foundable check is re-run, at
        // arrival (Army.PlanFoundingArrival).
        Func<HexCoord, bool>? isHexFoundable = null;
        var renownAndSlotAllowed = true;
        if (mission == ArmyMission.Found)
        {
            if (settlement.UserId == SystemUserIds.Abandoned)
            {
                await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
                return new ArmyDispatchResult(DispatchRejection.RenownOrSettlementSlotRequirementNotMet);
            }

            var existingSettlementCount = await _settlementService
                .GetSettlementCountAsync(settlement.UserId, settlement.WorldId, cancellationToken)
                .ConfigureAwait(false);
            // Accrue first, against this world's own game time, rather than
            // trusting whatever RenownTotal happens to already be sitting in
            // the row — same "settle before deciding" discipline
            // QueueBuildAsync/TrainUnitsAsync apply to a settlement's own
            // resource pool before every decision.
            var renownTotal = await _renownService
                .AccrueAsync(settlement.UserId, settlement.WorldId, now, cancellationToken)
                .ConfigureAwait(false);
            renownAndSlotAllowed = RenownThresholds.AllowsAnotherSettlement(existingSettlementCount, renownTotal);
            // Not a race workaround, and the concurrency token cannot replace
            // it: AccrueAsync zeroes PendingFeastRenown on the *same tracked
            // entity* in this same DbContext, while `settled` is a domain
            // snapshot taken before that. ApplyDomain would write the old
            // value straight back within this one request, crediting the
            // feast a second time on the next accrual. There is no second
            // writer here for a version check to catch.
            settled = settled with { PendingFeastRenown = 0 };

            var claimedSettlements = await _settlementService
                .GetClaimedSettlementsAsync(settlement.WorldId, cancellationToken)
                .ConfigureAwait(false);
            isHexFoundable = target =>
                Founding.IsHexFoundable(target, claimedSettlements, SettlementService.MinimumSpacing, dispatchGiantIndex);
        }

        // SetUpCamp-specific: what stands on the camp hex is database state Army.PlanDispatch cannot see.
        Func<HexCoord, bool>? isCampSiteOccupied = null;
        if (mission == ArmyMission.SetUpCamp)
        {
            var campSiteOccupied = await IsCampSiteOccupiedAsync(settlement.WorldId, effectiveDestination, now, cancellationToken).ConfigureAwait(false);
            var campSite = effectiveDestination;
            isCampSiteOccupied = hex => campSiteOccupied && hex == campSite;
        }

        var targetSettlement = mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid ? targetSettlementId : null;
        var targetBuilding = mission is ArmyMission.Attack or ArmyMission.Raid or ArmyMission.Support ? targetBuildingCoord : null;

        // One spot: the army leaves it at once. Several: each group leaves its own spot and they meet on the way. Everything
        // above and below is the same for both; only the planner differs.
        Settlement dispatchedFrom;
        List<Army> newArmies;
        List<Gathering> newGatherings = [];
        Army reported;
        if (groups.Count == 1)
        {
            var decision = Army.PlanDispatch(
                settled, groups[0].Spot, groups[0].Units, provisions, waypoints, effectiveDestination, now, armyId, sampler.TerrainAt,
                mission, targetSettlement, targetBuilding, targetClaimDiscs,
                isHexFoundable, renownAndSlotAllowed, session.SpeedFactor, rivers.IsRiver, rivers.IsWide,
                dispatchGiantIndex, walls: walls, targetCampCoord: targetCampCoord, targetCampIsWater: targetCampIsWater,
                targetCampIsSand: targetCampIsSand, targetSpots: targetSpots, isCampSiteOccupied: isCampSiteOccupied);
            if (!decision.Accepted)
            {
                // Even a refused dispatch may have completed queued work while
                // settling, which is a real change worth keeping.
                await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
                return new ArmyDispatchResult(decision.Rejection);
            }

            dispatchedFrom = decision.Settlement!;
            reported = decision.Army!;
            newArmies = [reported];
        }
        else
        {
            var decision = Army.PlanGatheredDispatch(
                settled, groups, provisions, waypoints, effectiveDestination, now, Guid.CreateVersion7, sampler.TerrainAt,
                mission, targetSettlement, targetBuilding, targetClaimDiscs,
                isHexFoundable, renownAndSlotAllowed, session.SpeedFactor, rivers.IsRiver, rivers.IsWide,
                dispatchGiantIndex, walls: walls, targetCampCoord: targetCampCoord, targetCampIsWater: targetCampIsWater,
                targetCampIsSand: targetCampIsSand, targetSpots: targetSpots, isCampSiteOccupied: isCampSiteOccupied);
            if (!decision.Accepted)
            {
                await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
                return new ArmyDispatchResult(decision.Rejection);
            }

            dispatchedFrom = decision.Settlement!;
            reported = decision.Reported!;
            newArmies = [.. decision.Armies!];
            newGatherings = [.. decision.Gatherings!];
        }

        session.Apply(settlementId, dispatchedFrom);
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        if (mission == ArmyMission.Hunt && settled.TroopsTrained)
        {
            // Onboarding quest hunt1 (locked until the troops were trained; claims never
            // gate it): starting a hunt counts, winning is not required. `settled` is the
            // pre-dispatch settlement, so units leaving on this very hunt still count.
            settlement.HuntStarted = true;
        }

        foreach (var gathering in newGatherings)
        {
            _dbContext.Gatherings.Add(GatheringEntity.From(gathering));
        }

        ArmyEntity? reportedEntity = null;
        foreach (var army in newArmies)
        {
            var entity = new ArmyEntity { Id = army.Id, SettlementId = settlementId };
            entity.ApplyDomain(army);
            _dbContext.Armies.Add(entity);
            if (army.Id == reported.Id)
            {
                reportedEntity = entity;
            }
        }

        await SaveAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Settlement {SettlementId} dispatched {Count} army group(s) ({ReportedId} first) to {Destination}, arriving {ArrivesAt}.",
            settlementId, newArmies.Count, reported.Id, effectiveDestination,
            ((ArmyLocation.InTransit)reported.Location).Movement.ArrivesAt);

        return new ArmyDispatchResult(DispatchRejection.None, reportedEntity);
    }

    /// <summary>
    /// Whether anything but bare ground stands on <paramref name="hex"/>: a building of any player (a level-0 foundation
    /// included), a settlement centre or a wildlife camp. Giants are the map's, checked by <see cref="BeachCamp.CheckSite"/>
    /// through the giant index. The one fact a beach camp site needs from the database, at dispatch and again when the camp is due.
    /// </summary>
    private async Task<bool> IsCampSiteOccupiedAsync(Guid worldId, HexCoord hex, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (await _dbContext.PlacedBuildings.AsNoTracking()
                .AnyAsync(b => b.Settlement!.WorldId == worldId && b.Q == hex.Q && b.R == hex.R, cancellationToken).ConfigureAwait(false)
            || await _dbContext.Settlements.AsNoTracking()
                .AnyAsync(s => s.WorldId == worldId && s.CentreQ == hex.Q && s.CentreR == hex.R, cancellationToken).ConfigureAwait(false))
        {
            return true;
        }

        return await _campService.FindCampAsync(worldId, hex, now, cancellationToken).ConfigureAwait(false) is not null;
    }

    /// <summary>
    /// Resolves an Attack/Support/Raid target for a dispatch or a field order, the one way both do it: the target
    /// settlement must be named and exist in the army's own world (an army cannot reach another world's map, so a cross-world id
    /// is indistinguishable from one that does not exist). Its centre is the destination, and its connected claim discs
    /// (the centre disc plus the discs of the towers chained to a longhouse of the target's player on that island) come
    /// along so a fleet Attack/Raid can check the target's whole claimed territory. Whether the target is the army's own
    /// settlement is <see cref="Army"/>'s rule, not decided here.
    /// </summary>
    private async Task<(DispatchRejection Rejection, HexCoord Centre, IReadOnlyList<(HexCoord Centre, int Radius)> ClaimDiscs, IReadOnlyList<GarrisonSpot> Spots)>
        ResolveTargetSettlementAsync(Guid worldId, Guid? targetSettlementId, Func<HexCoord, Terrain> terrainAt, CancellationToken cancellationToken)
    {
        if (targetSettlementId is not { } targetId)
        {
            return (DispatchRejection.TargetSettlementRequired, default, [], []);
        }

        var target = await _dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.Buildings)
            .Where(s => s.Id == targetId && s.WorldId == worldId)
            .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
        if (target is null)
        {
            return (DispatchRejection.TargetSettlementNotFound, default, [], []);
        }

        var targetRealm = await PlayerRealms.ForStoredSettlementAsync(_dbContext, targetId, cancellationToken).ConfigureAwait(false);
        return (
            DispatchRejection.None, new HexCoord(target.CentreQ, target.CentreR), targetRealm?.DiscsOf(targetId) ?? [],
            target.ToDomain(terrainAt).GarrisonSpots);
    }

    /// <summary>
    /// Looks up the wildlife camp a Hunt names by its hex, for a dispatch or a field order alike. With a camp there, returns the
    /// hex the route ends on (<see cref="Army.HuntRouteDestination"/> from <paramref name="from"/>: the camp's own hex, or
    /// its nearest walkable neighbour; a water camp, the whale road, is reached on its own sea hex), the camp's hex and
    /// whether it stands on the sea or on sand. With none, returns <paramref name="campHex"/> and no camp, which
    /// <see cref="Army"/> refuses as <see cref="DispatchRejection.NoCampAtDestination"/>.
    /// </summary>
    private async Task<(HexCoord Destination, HexCoord? CampCoord, bool CampIsWater, bool CampIsSand)> ResolveHuntCampAsync(
        Guid worldId, HexCoord campHex, HexCoord from, DateTimeOffset now, Func<HexCoord, Terrain> terrainAt, CancellationToken cancellationToken)
    {
        var camp = await _campService.FindCampAsync(worldId, campHex, now, cancellationToken).ConfigureAwait(false);
        if (camp is not { } found)
        {
            return (campHex, null, false, false);
        }

        return (Army.HuntRouteDestination(found.Camp.Coord, from, terrainAt, isFleet: found.Camp.IsWater), found.Camp.Coord, found.Camp.IsWater, found.Camp.IsSand);
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
            await SaveAsync(cancellationToken).ConfigureAwait(false);
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
            .Include(a => a.Gathering)
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
            .Include(a => a.Gathering)
            .Where(a => a.IsSupporting && a.TargetSettlementId == hostSettlementId)
            .OrderBy(a => a.Id)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// The host's way to send a guest home: recalls the guest army
    /// <paramref name="armyId"/> from <paramref name="hostSettlementId"/>
    /// through exactly the path <see cref="RecallAsync"/> takes. Refused as
    /// <see cref="RecallOutcome.ArmyNotFound"/> unless the army exists and is
    /// currently a guest at that host — the host has no say over any other
    /// army.
    /// </summary>
    public async Task<RecallResult> SendGuestHomeAsync(Guid hostSettlementId, Guid armyId, CancellationToken cancellationToken = default)
    {
        var isGuestHere = await _dbContext.Armies
            .AsNoTracking()
            .AnyAsync(a => a.Id == armyId && a.IsSupporting && a.TargetSettlementId == hostSettlementId, cancellationToken)
            .ConfigureAwait(false);

        return isGuestHere
            ? await RecallAsync(armyId, cancellationToken).ConfigureAwait(false)
            : new RecallResult(RecallOutcome.ArmyNotFound);
    }

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
            await SaveAsync(cancellationToken).ConfigureAwait(false);
            return new RecallResult(RecallOutcome.NothingToRecall);
        }

        var domain = army.ToDomain();
        HexCoord? currentHex = null;
        if (domain.Location is ArmyLocation.Supporting supporting)
        {
            // A guest army has no active Movement to derive its position from: it stands at the host's garrison spot it joined.
            currentHex = supporting.Spot;
        }

        // Mirrors Army.Recall's own switch: only these two locations (with a
        // resolved host hex for a guest) are recallable at all. Checked
        // separately here so a null Recall result can be told apart as
        // RecallOutcome.NoRouteHome rather than folded into NothingToRecall.
        var isRecallable = domain.Location is ArmyLocation.InTransit { Movement.IsReturning: false }
            || (domain.Location is ArmyLocation.Supporting && currentHex is not null);

        var recalled = await PlanRecallAsync(army, domain, now, currentHex, cancellationToken).ConfigureAwait(false);

        if (recalled is null)
        {
            if (outcome == ArmySettleOutcome.Updated)
            {
                await SaveAsync(cancellationToken).ConfigureAwait(false);
            }

            return new RecallResult(isRecallable ? RecallOutcome.NoRouteHome : RecallOutcome.NothingToRecall, army);
        }

        army.ApplyDomain(recalled);
        await SaveAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Army {ArmyId} recalled at {Now}, now heading home.", armyId, now);

        return new RecallResult(RecallOutcome.Recalled, army);
    }

    /// <summary>
    /// <see cref="Army.Recall"/> for <paramref name="domain"/> (the domain view of <paramref name="army"/>) as of <paramref name="at"/>,
    /// with the inputs every recall uses: the home hex, the world's terrain, speed factor, rivers and the owner's walls. Null when the
    /// army is not recallable or no route home exists. The one place those inputs are gathered.
    /// </summary>
    private async Task<Army?> PlanRecallAsync(
        ArmyEntity army, Army domain, DateTimeOffset at, HexCoord? currentHex, CancellationToken cancellationToken)
    {
        var world = army.Settlement!.World!;
        var sampler = await WorldTerrain.SamplerAsync(_dbContext, world, cancellationToken).ConfigureAwait(false);
        var rivers = await WorldRivers.IndexAsync(_dbContext, army.Settlement.WorldId, cancellationToken).ConfigureAwait(false);
        var walls = (await WorldBridges.RouteIndexAsync(_dbContext, army.Settlement.WorldId, sampler.TerrainAt, rivers.IsWide, at, cancellationToken).ConfigureAwait(false))
            .ForOwner(WorldPalisades.OwnerKeyOf(army.Settlement.UserId, army.Settlement.Id));
        var home = army.Settlement.HomeHexFor(domain);

        return domain.Recall(at, home, sampler.TerrainAt, currentHex, world.SpeedFactor, rivers.IsRiver, rivers.IsWide, walls);
    }

    /// <summary>
    /// Redirects an in-transit or parked <see cref="ArmyMission.Found"/>
    /// convoy to a different target hex (issue #55 §6) — the "retargetable"
    /// half of the mid-transit-claim edge case; <see cref="RecallAsync"/>
    /// already covers "recallable" for any mission, Found included.
    /// </summary>
    public async Task<RetargetFoundingApiResult> RetargetFoundingAsync(
        Guid armyId, HexCoord newTarget, CancellationToken cancellationToken = default)
    {
        var army = await LoadArmyAsync(armyId, cancellationToken).ConfigureAwait(false);
        if (army?.Settlement?.World is null)
        {
            return new RetargetFoundingApiResult(RetargetFoundingRejection.NotAFoundingMission, ArmyNotFound: true);
        }

        var clock = army.Settlement.World.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        var outcome = await SettleAndFoldAsync(army, now, cancellationToken).ConfigureAwait(false);
        if (outcome == ArmySettleOutcome.FoldedHome)
        {
            await SaveAsync(cancellationToken).ConfigureAwait(false);
            return new RetargetFoundingApiResult(RetargetFoundingRejection.NothingToRetarget);
        }

        var sampler = await WorldTerrain.SamplerAsync(_dbContext, army.Settlement.World, cancellationToken).ConfigureAwait(false);
        var rivers = await WorldRivers.IndexAsync(_dbContext, army.Settlement.WorldId, cancellationToken).ConfigureAwait(false);
        var walls = (await WorldBridges.RouteIndexAsync(_dbContext, army.Settlement.WorldId, sampler.TerrainAt, rivers.IsWide, now, cancellationToken).ConfigureAwait(false))
            .ForOwner(WorldPalisades.OwnerKeyOf(army.Settlement.UserId, army.Settlement.Id));
        var domain = army.ToDomain();
        var home = army.Settlement.HomeHexFor(domain);

        var result = Army.RetargetFounding(
            domain, newTarget, now, home, sampler.TerrainAt, army.Settlement.World.SpeedFactor,
            rivers.IsRiver, rivers.IsWide, walls);
        if (!result.Accepted)
        {
            if (outcome == ArmySettleOutcome.Updated)
            {
                await SaveAsync(cancellationToken).ConfigureAwait(false);
            }

            return new RetargetFoundingApiResult(result.Rejection);
        }

        army.ApplyDomain(result.Army!);
        await SaveAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Founding convoy (army {ArmyId}) retargeted to {NewTarget} at {Now}.", armyId, newTarget, now);

        return new RetargetFoundingApiResult(RetargetFoundingRejection.None, army);
    }

    /// <summary>
    /// Sends an army already out in the field onward (issue #156) — "move on" once it has arrived and is standing, "append
    /// goal" while it is still travelling — on a Move, Attack, Support, Hunt or Raid, optionally taking only part of a
    /// standing army along. See <see cref="Army.PlanFieldOrder"/> for the domain rule this wraps.
    /// </summary>
    /// <remarks>
    /// Restricted here, not in the pure domain method, to armies whose current mission is
    /// <see cref="ArmyMission.Move"/>/<see cref="ArmyMission.Found"/>: an army already attacking, hunting, supporting or
    /// raiding finishes that (or is recalled). The new mission and its targets are resolved exactly as
    /// <see cref="DispatchAsync"/> resolves them (same helpers, same <see cref="Army"/> validation); once the order is
    /// accepted the army is settled on arrival by its new mission like any dispatched one. A split leaves the remainder
    /// standing where it is and creates the leaving part as a new army row of the same home settlement.
    /// </remarks>
    /// <param name="destination">
    /// Required for <see cref="ArmyMission.Move"/> and, as the camp's own hex, for <see cref="ArmyMission.Hunt"/>; ignored for
    /// <see cref="ArmyMission.Attack"/>/<see cref="ArmyMission.Support"/>/<see cref="ArmyMission.Raid"/>, whose destination is
    /// the target settlement's own hex, resolved here rather than trusted from the caller.
    /// </param>
    /// <param name="callerUserId">
    /// The authenticated caller's id, if any — resolved to a live premium
    /// flag via <see cref="AuthService.GetIsPremiumAsync"/>, same as
    /// <see cref="Bjarnoy.Api.Auth.PremiumUserEndpointFilter"/>. An anonymous
    /// caller (<see langword="null"/>) is never premium — ordinary game
    /// actions (a free "move on" with no waypoints) still work for them, only
    /// the premium half of the rule table is unavailable.
    /// </param>
    /// <param name="units">What leaves; <see langword="null"/> means the whole army.</param>
    /// <returns>The result's <see cref="FieldOrderApiResult.Army"/> is the army that left: the new army when split.</returns>
    public async Task<FieldOrderApiResult> FieldOrderAsync(
        Guid armyId,
        IReadOnlyList<HexCoord> waypoints,
        HexCoord? destination,
        Guid? callerUserId,
        ArmyMission mission = ArmyMission.Move,
        Guid? targetSettlementId = null,
        HexCoord? targetBuildingCoord = null,
        IReadOnlyList<UnitStack>? units = null,
        CancellationToken cancellationToken = default)
    {
        var army = await LoadArmyAsync(armyId, cancellationToken).ConfigureAwait(false);
        if (army?.Settlement?.World is null)
        {
            return new FieldOrderApiResult(FieldOrderRejection.NoActiveJourney, ArmyNotFound: true);
        }

        var clock = army.Settlement.World.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        var outcome = await SettleAndFoldAsync(army, now, cancellationToken).ConfigureAwait(false);
        if (outcome == ArmySettleOutcome.FoldedHome)
        {
            await SaveAsync(cancellationToken).ConfigureAwait(false);
            return new FieldOrderApiResult(FieldOrderRejection.NoActiveJourney);
        }

        // A refused order may still have advanced the army's own journey while settling above, which is a real change worth keeping.
        async Task<FieldOrderApiResult> RejectAsync(FieldOrderRejection reason)
        {
            if (outcome == ArmySettleOutcome.Updated)
            {
                await SaveAsync(cancellationToken).ConfigureAwait(false);
            }

            return new FieldOrderApiResult(reason, army);
        }

        var domain = army.ToDomain();

        // A fleeing or stranded army's mission is over: it takes orders like any army in the field (docs/design/troop-movement-range.md §2a).
        var missionOver = domain.Location is ArmyLocation.InTransit { Movement: { IsFleeing: true } or { IsStranded: true } };
        if (!missionOver && domain.Mission is not (ArmyMission.Move or ArmyMission.Found))
        {
            return await RejectAsync(FieldOrderRejection.MissionNotFieldOrderable).ConfigureAwait(false);
        }

        var isPremium = callerUserId is { } userId
            && await _authService.GetIsPremiumAsync(userId, cancellationToken).ConfigureAwait(false) == true;

        var worldId = army.Settlement.WorldId;
        var sampler = await WorldTerrain.SamplerAsync(_dbContext, army.Settlement.World, cancellationToken).ConfigureAwait(false);
        var rivers = await WorldRivers.IndexAsync(_dbContext, worldId, cancellationToken).ConfigureAwait(false);
        var walls = (await WorldBridges.RouteIndexAsync(_dbContext, worldId, sampler.TerrainAt, rivers.IsWide, now, cancellationToken).ConfigureAwait(false))
            .ForOwner(WorldPalisades.OwnerKeyOf(army.Settlement.UserId, army.Settlement.Id));
        var home = army.Settlement.HomeHexFor(domain);
        var giants = await LoadGiantIndexAsync(worldId, cancellationToken).ConfigureAwait(false);

        HexCoord effectiveDestination;
        IReadOnlyList<(HexCoord Centre, int Radius)> targetClaimDiscs = [];
        IReadOnlyList<GarrisonSpot> targetSpots = [];
        if (mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid)
        {
            var resolved = await ResolveTargetSettlementAsync(worldId, targetSettlementId, sampler.TerrainAt, cancellationToken).ConfigureAwait(false);
            if (resolved.Rejection != DispatchRejection.None)
            {
                return await RejectAsync(resolved.Rejection == DispatchRejection.TargetSettlementNotFound
                    ? FieldOrderRejection.TargetSettlementNotFound
                    : FieldOrderRejection.TargetSettlementRequired).ConfigureAwait(false);
            }

            effectiveDestination = resolved.Centre;
            targetClaimDiscs = resolved.ClaimDiscs;
            targetSpots = resolved.Spots;
        }
        else
        {
            if (destination is not { } move)
            {
                return await RejectAsync(FieldOrderRejection.DestinationRequired).ConfigureAwait(false);
            }

            effectiveDestination = move;
        }

        // A hunt's route is planned from where the army stands now.
        HexCoord? targetCampCoord = null;
        var targetCampIsWater = false;
        var targetCampIsSand = false;
        if (mission == ArmyMission.Hunt)
        {
            var standingHex = ((ArmyLocation.InTransit)domain.Location).Movement.PositionAt(now);
            (effectiveDestination, targetCampCoord, targetCampIsWater, targetCampIsSand) = await ResolveHuntCampAsync(
                worldId, effectiveDestination, standingHex, now, sampler.TerrainAt, cancellationToken).ConfigureAwait(false);
        }

        var result = Army.PlanFieldOrder(
            domain, waypoints, effectiveDestination, home, now, sampler.TerrainAt, isPremium,
            army.Settlement.World.SpeedFactor, rivers.IsRiver, rivers.IsWide, walls,
            mission, targetSettlementId, targetBuildingCoord, targetClaimDiscs, targetCampCoord, targetCampIsWater, targetCampIsSand,
            giants, units, Guid.CreateVersion7(), targetSpots);

        if (!result.Accepted)
        {
            return await RejectAsync(result.Rejection).ConfigureAwait(false);
        }

        var left = army;
        if (result.Remainder is { } remainder)
        {
            // A split: the entity that was ordered keeps standing with what stayed, the units that left are a new army.
            army.ApplyDomain(remainder);
            left = new ArmyEntity { Id = result.Army!.Id, SettlementId = army.SettlementId };
            left.ApplyDomain(result.Army);
            _dbContext.Armies.Add(left);
        }
        else
        {
            army.ApplyDomain(result.Army!);
        }

        if (mission == ArmyMission.Hunt && army.Settlement.TroopsTrained)
        {
            // Onboarding quest hunt1, same rule as a hunt dispatched from home: starting a hunt counts.
            army.Settlement.HuntStarted = true;
        }

        await SaveAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Army {ArmyId} given a {Mission} field order at {Now}, army {LeavingArmyId} now heading to {Destination}.",
            armyId, mission, now, left.Id, effectiveDestination);

        return new FieldOrderApiResult(FieldOrderRejection.None, left);
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
            await SaveAsync(cancellationToken).ConfigureAwait(false);
            return new AdminArmyEditResult(AdminArmyEditOutcome.ArmyNotFound);
        }

        // A refused edit may still have advanced the army's own journey while
        // settling above, and that is a real change worth keeping — the same
        // rule every rejected write path in SettlementService follows.
        async Task<AdminArmyEditResult> RejectAsync(AdminArmyEditOutcome reason)
        {
            if (outcome == ArmySettleOutcome.Updated)
            {
                await SaveAsync(cancellationToken).ConfigureAwait(false);
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
            var sampler = await WorldTerrain.SamplerAsync(_dbContext, army.Settlement.World, cancellationToken).ConfigureAwait(false);
            var rivers = await WorldRivers.IndexAsync(_dbContext, army.Settlement.WorldId, cancellationToken).ConfigureAwait(false);
            var walls = (await WorldBridges.RouteIndexAsync(_dbContext, army.Settlement.WorldId, sampler.TerrainAt, rivers.IsWide, now, cancellationToken).ConfigureAwait(false))
            .ForOwner(WorldPalisades.OwnerKeyOf(army.Settlement.UserId, army.Settlement.Id));
            var home = army.Settlement.HomeHexFor(domain);

            // An explicit provisions value is the admin's final word, so it is
            // carried into the new leg rather than being re-burned against the
            // leg this teleport is throwing away.
            var teleported = domain.TeleportTo(
                destination, home, now, sampler.TerrainAt,
                provisions is { } given ? Math.Max(0, given) : null, army.Settlement.World.SpeedFactor,
                rivers.IsRiver, rivers.IsWide, walls);
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
        await SaveAsync(cancellationToken).ConfigureAwait(false);

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
            .Include(a => a.Settlement!).ThenInclude(s => s.Buildings)
            .Include(a => a.Stacks)
            .Include(a => a.TargetSettlement)
            .Include(a => a.Gathering)
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
        // Every gathering of the world whose departure has passed is resolved first, in departure order, whichever army is being settled:
        // a hostile army must meet the merged army on its way on, not stale groups still standing on the join hex.
        var (resolvedDue, callerGone) = await ResolveDueGatheringsAsync(army.Settlement!.WorldId, now, army, cancellationToken).ConfigureAwait(false);
        var outcome = callerGone
            ? ArmySettleOutcome.FoldedHome
            : await SettleAndFoldCoreAsync(army, now, cancellationToken).ConfigureAwait(false);
        if (resolvedDue && outcome == ArmySettleOutcome.NoChange)
        {
            outcome = ArmySettleOutcome.Updated;
        }

        // A siege that cut down a tower moved the defender's realm: save what the settle did, then bring the realm state of every
        // settlement of that player up to date, so buildings the tower chained in stop working at once.
        if (_realmDirty.Count > 0)
        {
            var dirty = _realmDirty.ToList();
            _realmDirty.Clear();
            await SaveAsync(cancellationToken).ConfigureAwait(false);
            foreach (var settlementId in dirty)
            {
                await _settlementService.ReconcileRealmAsync(settlementId, cancellationToken).ConfigureAwait(false);
            }
        }

        return outcome;
    }

    /// <summary>At most this many walls are dealt with in one settle; each re-route starts at its wall's instant, the next only later.</summary>
    private const int MaxWallEncountersPerSettle = 16;

    /// <summary>At most this many events (a field battle, an arrival, a turn-around) settled before one wall encounter.</summary>
    private const int MaxStepsBeforeWall = 8;

    /// <summary>
    /// Settles <paramref name="army"/> to <paramref name="now"/>, dealing first with every wall built after it set out that blocks its way
    /// (<c>docs/design/troop-movement-range.md</c> §5): everything due before the instant the army finds the wall is settled first, then it
    /// re-routes from where it is then (<see cref="Army.RerouteAroundWall"/>), and the settle goes on. A world without a wall on the
    /// army's way, or only walls that cannot block it (<see cref="WallTimeline.MayBlock"/>), costs one small read
    /// (<see cref="WorldPalisades.TimelineAsync"/>, once per request and world); a route is only searched when a wall actually blocks it.
    /// </summary>
    /// <summary>Gatherings being resolved right now: their members are settled to the departure without resolving the gathering again.</summary>
    private readonly HashSet<Guid> _resolvingGatherings = [];

    private bool _resolvingDue;

    /// <summary>
    /// Resolves every gathering of <paramref name="worldId"/> whose departure is <paramref name="now"/> or earlier, oldest first
    /// (<see cref="ResolveGatheringAsync"/>). Not re-entered by the settles a resolve itself does.
    /// </summary>
    /// <returns>Whether any gathering was resolved, and whether <paramref name="caller"/> no longer exists afterwards.</returns>
    private async Task<(bool Resolved, bool CallerGone)> ResolveDueGatheringsAsync(
        Guid worldId, DateTimeOffset now, ArmyEntity? caller, CancellationToken cancellationToken)
    {
        if (_resolvingDue)
        {
            return (false, false);
        }

        _resolvingDue = true;
        try
        {
            var due = await _dbContext.Gatherings
                .Where(g => g.Settlement!.WorldId == worldId)
                .ToListAsync(cancellationToken).ConfigureAwait(false);

            // The due ones, oldest departure first: compared and sorted here because SQLite can neither compare nor ORDER BY a
            // DateTimeOffset in SQL, and a world has few gatherings at a time.
            due = [.. due.Where(g => g.DepartAt <= now).OrderBy(g => g.DepartAt).ThenBy(g => g.Id)];
            var resolved = false;
            foreach (var gathering in due)
            {
                // A boarding gathering is resolved in front of the sea meeting it feeds, so it may be gone by now.
                if (_dbContext.Entry(gathering).State is EntityState.Deleted or EntityState.Detached)
                {
                    continue;
                }

                resolved = true;
                await ResolveGatheringAsync(gathering, caller, cancellationToken).ConfigureAwait(false);
            }

            return (resolved, caller is not null && IsGone(caller));
        }
        finally
        {
            _resolvingDue = false;
        }
    }

    /// <summary>
    /// Resolves <paramref name="gathering"/> at its departure instant (<c>docs/design/garrison.md</c>, "Training, sending out, losing a spot"):
    /// every group is settled to <see cref="GatheringEntity.DepartAt"/> first (interception up to then still applies), the groups still
    /// standing on the join hex merge into one army (the one that arrived first; the others are removed), which leaves on the gathering's
    /// order with the units that actually arrived and the food they have left. A group that is not standing there any more leaves the
    /// gathering and is not touched otherwise. A meeting of ships with no ship group on the join hex does not merge: every group goes home to
    /// its own spot. A boarding gathering is resolved in front of the sea meeting it feeds. Saves what it changed.
    /// </summary>
    private async Task ResolveGatheringAsync(GatheringEntity gathering, ArmyEntity? caller, CancellationToken cancellationToken)
    {
        _resolvingGatherings.Add(gathering.Id);
        try
        {
            var departAt = gathering.DepartAt;

            // The boarding that feeds this gathering is resolved in front of it: its merged ships are a group of this one.
            var feeders = await _dbContext.Gatherings
                .Where(g => g.ParentGatheringId == gathering.Id && !_resolvingGatherings.Contains(g.Id))
                .ToListAsync(cancellationToken).ConfigureAwait(false);
            foreach (var feeder in feeders)
            {
                if (feeder.DepartAt <= departAt)
                {
                    await ResolveGatheringAsync(feeder, caller, cancellationToken).ConfigureAwait(false);
                }
            }

            var members = await ArmiesForSettle().Where(a => a.GatheringId == gathering.Id).OrderBy(a => a.Id)
                .ToListAsync(cancellationToken).ConfigureAwait(false);
            if (caller is not null && caller.GatheringId == gathering.Id && !members.Contains(caller) && !IsGone(caller))
            {
                members.Add(caller);
            }

            // Each group is settled to the departure: every event due until then (a fight on the way, an arrival), one step at a time.
            foreach (var member in members)
            {
                for (var step = 0; step < MaxStepsBeforeWall && !IsGone(member); step++)
                {
                    if (await SettleAndFoldCoreAsync(member, departAt, cancellationToken).ConfigureAwait(false) == ArmySettleOutcome.NoChange)
                    {
                        break;
                    }
                }
            }

            var domainGathering = gathering.ToDomain();
            var standing = new List<ArmyEntity>();
            var elsewhere = new List<ArmyEntity>();
            foreach (var member in members.Where(m => !IsGone(m) && m.GatheringId == gathering.Id))
            {
                if (member.ToDomain().Location is ArmyLocation.InTransit { Movement: { IsReturning: false, IsStranded: false } leg }
                    && domainGathering.Stands(leg.Path[^1]) && departAt >= leg.ArrivesAt)
                {
                    standing.Add(member);
                }
                else
                {
                    elsewhere.Add(member);
                }
            }

            if (domainGathering.IsFleet && !standing.Any(a => a.ToDomain().IsFleet))
            {
                // No ship stands on the join hex: there is nothing for the passengers to board. Every group goes home to its own spot.
                foreach (var member in standing.Concat(elsewhere))
                {
                    await SendGroupHomeAsync(member, departAt, cancellationToken).ConfigureAwait(false);
                }
            }
            else
            {
                // Not on the join hex when the army leaves (held up on the way, turned home): it goes on alone.
                foreach (var member in elsewhere)
                {
                    member.GatheringId = null;
                    member.GatherDepartAt = null;
                }

                if (standing.Count > 0)
                {
                    await DepartGatheringAsync(gathering, standing, departAt, cancellationToken).ConfigureAwait(false);
                }
            }

            _dbContext.Gatherings.Remove(gathering);
            await SaveAsync(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _resolvingGatherings.Remove(gathering.Id);
        }
    }

    private bool IsGone(ArmyEntity army) => _dbContext.Entry(army).State is EntityState.Deleted or EntityState.Detached;

    /// <summary>The terrain, rivers and walls of the owner's routes at <paramref name="at"/>, as every route planned from a settle uses them.</summary>
    private async Task<(WorldEntity World, TerrainSampler Sampler, RiverIndex Rivers, WallRules? Walls)> RoutingAsync(
        SettlementEntity settlement, DateTimeOffset at, CancellationToken cancellationToken)
    {
        var world = settlement.World!;
        var sampler = await WorldTerrain.SamplerAsync(_dbContext, world, cancellationToken).ConfigureAwait(false);
        var rivers = await WorldRivers.IndexAsync(_dbContext, settlement.WorldId, cancellationToken).ConfigureAwait(false);
        var walls = (await WorldBridges.RouteIndexAsync(_dbContext, settlement.WorldId, sampler.TerrainAt, rivers.IsWide, at, cancellationToken).ConfigureAwait(false))
            .ForOwner(WorldPalisades.OwnerKeyOf(settlement.UserId, settlement.Id));
        return (world, sampler, rivers, walls);
    }

    /// <summary>A group that will not merge leaves its gathering and walks home to its own spot from wherever it stands at <paramref name="at"/>.</summary>
    private async Task SendGroupHomeAsync(ArmyEntity member, DateTimeOffset at, CancellationToken cancellationToken)
    {
        var domain = member.ToDomain();
        var (world, sampler, rivers, walls) = await RoutingAsync(member.Settlement!, at, cancellationToken).ConfigureAwait(false);
        var home = domain.Recall(at, domain.HomeSpot, sampler.TerrainAt, null, world.SpeedFactor, rivers.IsRiver, rivers.IsWide, walls);
        member.ApplyDomain(home ?? domain.LeaveGathering());
    }

    /// <summary>Merges the groups standing on the join hex into one army and puts it on the way of <paramref name="gathering"/>'s order.</summary>
    private async Task DepartGatheringAsync(
        GatheringEntity gathering, List<ArmyEntity> standing, DateTimeOffset departAt, CancellationToken cancellationToken)
    {
        // The survivor is the group that got there first (the one the dispatch answered with, when it stands there).
        var group = standing
            .OrderBy(a => ((ArmyLocation.InTransit)a.ToDomain().Location).Movement.ArrivesAt).ThenBy(a => a.Id).ToList();
        var survivor = group[0];

        var merged = Army.MergeGatheringMembers([.. group.Select(a => a.ToDomain())], departAt);
        foreach (var other in group.Skip(1))
        {
            other.RecordWalkedToEnd();
            survivor.WalkedLegs.AddRange(other.WalkedLegs);
            other.WalkedLegs.Clear();
            _dbContext.Armies.Remove(other);
        }

        var (world, sampler, rivers, walls) = await RoutingAsync(survivor.Settlement!, departAt, cancellationToken).ConfigureAwait(false);

        // A boarded fleet that sails to the sea meeting stands there until that meeting leaves.
        DateTimeOffset? parentDepartAt = null;
        if (gathering.ParentGatheringId is { } parentId)
        {
            parentDepartAt = (await _dbContext.Gatherings.AsNoTracking().FirstOrDefaultAsync(g => g.Id == parentId, cancellationToken).ConfigureAwait(false))?.DepartAt;
        }

        var domainGathering = gathering.ToDomain();
        var departed = Army.PlanGatheringDeparture(
            merged, domainGathering, departAt, sampler.TerrainAt, world.SpeedFactor, rivers.IsRiver, rivers.IsWide, walls, parentDepartAt);
        if (departed is null)
        {
            // No way on (a wall closed every way since the order was given, or the settlers or camp builders it needs did not all
            // arrive): the merged army goes home from the join hex (or, with no way home either, stays there and starves like any
            // army that cannot get home).
            var atJoin = (merged with
            {
                HomeSpot = domainGathering.HomeSpot,
                Location = new ArmyLocation.InTransit(Movement.Stranded(departAt, domainGathering.Hex)),
            }).LeaveGathering();
            departed = atJoin.Recall(departAt, domainGathering.HomeSpot, sampler.TerrainAt, null, world.SpeedFactor, rivers.IsRiver, rivers.IsWide, walls)
                ?? atJoin.Strand(departAt, domainGathering.Hex);
            _logger.LogWarning(
                "Gathering {GatheringId} cannot go on from {Hex}; the merged army {ArmyId} goes home.", gathering.Id, domainGathering.Hex, survivor.Id);
        }

        survivor.ApplyDomain(departed);
        _logger.LogInformation(
            "Gathering {GatheringId} left {Hex} at {At}: {Groups} group(s) merged into army {ArmyId}.",
            gathering.Id, domainGathering.Hex, departAt, group.Count, survivor.Id);
    }

    private async Task<ArmySettleOutcome> SettleAndFoldCoreAsync(
        ArmyEntity army, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var changed = false;
        for (var round = 0; round < MaxWallEncountersPerSettle; round++)
        {
            if (await FindWallEncounterAsync(army, now, cancellationToken).ConfigureAwait(false) is not { } encounter)
            {
                var step = await SettleStepAsync(army, now, cancellationToken).ConfigureAwait(false);

                // The step may have started a new leg (a battle's or an arrival's way home, a turn-around): a wall in its way is dealt with
                // in this settle too, not left to walk through.
                if (step != ArmySettleOutcome.Updated
                    || await FindWallEncounterAsync(army, now, cancellationToken).ConfigureAwait(false) is null)
                {
                    return step == ArmySettleOutcome.NoChange && changed ? ArmySettleOutcome.Updated : step;
                }

                changed = true;
                continue;
            }

            for (var step = 0; step < MaxStepsBeforeWall; step++)
            {
                var before = await SettleStepAsync(army, encounter.At, cancellationToken).ConfigureAwait(false);
                if (before == ArmySettleOutcome.FoldedHome)
                {
                    return ArmySettleOutcome.FoldedHome;
                }

                if (before == ArmySettleOutcome.NoChange)
                {
                    break;
                }

                changed = true;
            }

            // What happened before the wall (a fight, a turn-around, an arrival) may have changed the route: look again.
            if (await FindWallEncounterAsync(army, now, cancellationToken).ConfigureAwait(false) is not { } current)
            {
                break;
            }

            if (current.At > encounter.At)
            {
                continue;
            }

            // The safety net: a re-route that leaves the same route at the same instant would only find the same wall again.
            if (!await RerouteAroundWallAsync(army, current, cancellationToken).ConfigureAwait(false))
            {
                break;
            }

            changed = true;
        }

        var outcome = await SettleStepAsync(army, now, cancellationToken).ConfigureAwait(false);
        return outcome == ArmySettleOutcome.NoChange && changed ? ArmySettleOutcome.Updated : outcome;
    }

    private readonly Dictionary<Guid, WallTimeline> _wallTimelines = [];

    private readonly Dictionary<Guid, WallBlocking> _wallBlocking = [];

    /// <summary>The world's wall timeline, read once per request (this service is scoped).</summary>
    private async Task<WallTimeline> WallTimelineAsync(Guid worldId, CancellationToken cancellationToken)
    {
        if (!_wallTimelines.TryGetValue(worldId, out var timeline))
        {
            timeline = new WallTimeline(await WorldPalisades.TimelineAsync(_dbContext, worldId, cancellationToken).ConfigureAwait(false));
            _wallTimelines[worldId] = timeline;
        }

        return timeline;
    }

    /// <summary>
    /// The route rules of the world's wall timeline at any instant (<see cref="WallBlocking"/>), built once per request and world: the one
    /// rule set both <see cref="FindWallEncounterAsync"/> and <see cref="RerouteAroundWallAsync"/> use.
    /// </summary>
    private async Task<WallBlocking> WallBlockingAsync(SettlementEntity settlement, CancellationToken cancellationToken)
    {
        if (!_wallBlocking.TryGetValue(settlement.WorldId, out var blocking))
        {
            var timeline = await WallTimelineAsync(settlement.WorldId, cancellationToken).ConfigureAwait(false);
            var sampler = await WorldTerrain.SamplerAsync(_dbContext, settlement.World!, cancellationToken).ConfigureAwait(false);
            var rivers = await WorldRivers.IndexAsync(_dbContext, settlement.WorldId, cancellationToken).ConfigureAwait(false);

            // Only a gate cares who the friends are, so a world without one skips the guild queries.
            var areFriends = timeline.Walls.Any(w => w.Wall.IsGate)
                ? await WorldPalisades.FriendsAsync(_dbContext, settlement.WorldId, cancellationToken).ConfigureAwait(false)
                : null;
            blocking = new WallBlocking(timeline, sampler.TerrainAt, rivers.IsWide, areFriends);
            _wallBlocking[settlement.WorldId] = blocking;
        }

        return blocking;
    }

    /// <summary>
    /// The first wall that blocks <paramref name="army"/>'s way by <paramref name="now"/> (<see cref="WallEncounters.FindEarliest"/>), found at
    /// the instant the hex began to block this army (<see cref="WallBlocking.FirstBlockingIn"/>): a plain wall that is no half-open end, a gate
    /// that does not open for its owner. A rule change without an instant (a friendship ended, a gate left or rejoined its realm) counts from
    /// <paramref name="now"/>. Land armies in transit only (a stranded one on the rest of its walk to the hex it stops on); a fleet is never
    /// blocked.
    /// </summary>
    private async Task<WallEncounter?> FindWallEncounterAsync(ArmyEntity army, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var domain = army.ToDomain();
        if (domain.IsFleet || domain.Location is not ArmyLocation.InTransit { Movement: var movement })
        {
            return null;
        }

        var settlement = army.Settlement!;
        var timeline = await WallTimelineAsync(settlement.WorldId, cancellationToken).ConfigureAwait(false);
        var ownerKey = WorldPalisades.OwnerKeyOf(settlement.UserId, settlement.Id);

        // The timeline alone rules out what cannot block (an own gate, a half-open end nobody built beside since the route was planned),
        // so a route through such hexes only costs the one timeline read: terrain, rivers and guilds are read for a candidate only.
        var route = movement.IsReturning ? movement.Path : movement.Path.Concat(movement.ReturnPath);
        if (timeline.IsEmpty || !route.Any(hex => timeline.MayBlock(hex, ownerKey, movement.PlannedAt, now)))
        {
            return null;
        }

        var blocking = await WallBlockingAsync(settlement, cancellationToken).ConfigureAwait(false);
        return WallEncounters.FindEarliest(
            movement, (hex, from, before) => blocking.FirstBlockingIn(hex, ownerKey, from, before, movement.PlannedAt, now), now);
    }

    /// <summary>
    /// <see cref="Army.RerouteAroundWall"/> for <paramref name="army"/> (settled to <c>encounter.At</c>) with the routes as they stand at that
    /// instant, under the same rules that found the wall; an army that found no way past the wall gets its owner an "army stuck" report.
    /// Does not save. Returns whether the army's movement changed.
    /// </summary>
    private async Task<bool> RerouteAroundWallAsync(ArmyEntity army, WallEncounter encounter, CancellationToken cancellationToken)
    {
        var settlement = army.Settlement!;
        var world = settlement.World!;
        var domain = army.ToDomain();
        var sampler = await WorldTerrain.SamplerAsync(_dbContext, world, cancellationToken).ConfigureAwait(false);
        var rivers = await WorldRivers.IndexAsync(_dbContext, settlement.WorldId, cancellationToken).ConfigureAwait(false);
        var walls = (await WallBlockingAsync(settlement, cancellationToken).ConfigureAwait(false)).IndexAt(encounter.At);
        var bridges = await WorldBridges.IndexAsync(_dbContext, settlement.WorldId, sampler.TerrainAt, encounter.At, cancellationToken).ConfigureAwait(false);
        var rules = new LandRouteIndex(walls, bridges).ForOwner(WorldPalisades.OwnerKeyOf(settlement.UserId, settlement.Id));

        var result = domain.RerouteAroundWall(
            encounter, settlement.HomeHexFor(domain), sampler.TerrainAt, world.SpeedFactor, rivers.IsRiver, rivers.IsWide, rules);
        if (SameMovement(domain, result.Army))
        {
            _logger.LogWarning(
                "Army {ArmyId} found the wall at {Wall} in its way at {At}, but the re-route kept its route; the wall is left to the next settle.",
                army.Id, encounter.Hex, encounter.At);
            return false;
        }

        army.ApplyDomain(result.Army);

        if (result.StuckAt is { } stuck)
        {
            _armyReportService.Add(settlement, ArmyReportKind.Stuck, encounter.At, army.Id, stuck, domain.Mission, domain.Stacks);
            _logger.LogInformation(
                "Army {ArmyId} found the wall at {Wall} in its way at {At} and no way past it: it stops at {Hex}{Stranded}.",
                army.Id, encounter.Hex, encounter.At, stuck, result.Army.CannotGetHome ? " and cannot get home" : string.Empty);
        }
        else
        {
            _logger.LogInformation(
                "Army {ArmyId} found the wall at {Wall} in its way at {At} and takes another route.", army.Id, encounter.Hex, encounter.At);
        }

        return true;
    }

    /// <summary>Whether a re-route left the army on the same route from the same instant (the settle loop's safety net).</summary>
    private static bool SameMovement(Army before, Army after) =>
        before.Location is ArmyLocation.InTransit { Movement: var a }
        && after.Location is ArmyLocation.InTransit { Movement: var b }
        && a.DepartedAt == b.DepartedAt && a.IsReturning == b.IsReturning && a.IsStranded == b.IsStranded
        && a.Path.SequenceEqual(b.Path) && a.ReturnPath.SequenceEqual(b.ReturnPath);

    /// <summary>One settle step: the first due event of <paramref name="army"/> up to <paramref name="now"/> (see <see cref="SettleAndFoldAsync"/>).</summary>
    private async Task<ArmySettleOutcome> SettleStepAsync(
        ArmyEntity army, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var domain = army.ToDomain();

        // In-flight interception (issue #206) is checked before any
        // mission-specific arrival handling below: a march that has already
        // met a hostile army mid-route never gets to finish that leg as
        // planned, whatever its mission was. When a battle is found and
        // resolved here, the army's post-battle state (winner continuing on
        // its original movement, or a loser's forced retreat) is applied
        // immediately and any further arrival-specific processing is left
        // for this army's next settle call.
        if (await _fieldBattleService.TryResolveAsync(army, domain, now, cancellationToken).ConfigureAwait(false))
        {
            return ArmySettleOutcome.Updated;
        }

        // An army that cannot get home stands where it is until its food runs out (docs/design/troop-movement-range.md §2a). It
        // has no outbound leg left to arrive on, so none of the mission arrivals below apply to it.
        if (domain.CannotGetHome)
        {
            // Still walking to the hex it stops on: a strong camp it passes on the way ambushes it like any marching army, up to the
            // instant it gets there (or starves on the way).
            if (domain.Location is ArmyLocation.InTransit { Movement: { Path.Count: > 1 } walk })
            {
                var walkEnds = domain.StarvesAt is { } starves && starves < walk.ArrivesAt ? starves : walk.ArrivesAt;
                switch (await _campAmbushService.TryResolveAsync(army, domain, now < walkEnds ? now : walkEnds, cancellationToken).ConfigureAwait(false))
                {
                    case CampAmbushOutcome.Fought:
                        return ArmySettleOutcome.Updated;
                    case CampAmbushOutcome.ArmyDestroyed:
                        return ArmySettleOutcome.FoldedHome;
                }
            }

            var strandedResult = domain.SettleTo(now);
            return strandedResult.Starved ? Starve(army, domain, strandedResult) : ArmySettleOutcome.NoChange;
        }

        // A strong camp's ambush (docs/design/wildlife-camps.md) is likewise checked before any arrival handling and
        // likewise leaves the rest of the settle to this army's next call.
        switch (await _campAmbushService.TryResolveAsync(army, domain, now, cancellationToken).ConfigureAwait(false))
        {
            case CampAmbushOutcome.Fought:
                return ArmySettleOutcome.Updated;
            case CampAmbushOutcome.ArmyDestroyed:
                return ArmySettleOutcome.FoldedHome;
        }

        if (domain.Mission is ArmyMission.Attack or ArmyMission.Raid
            && domain.Location is ArmyLocation.InTransit { Movement.IsReturning: false } inTransit
            && now >= inTransit.Movement.ArrivesAt)
        {
            return await ResolveBattleAsync(army, domain, now, cancellationToken).ConfigureAwait(false);
        }

        if (domain.Mission == ArmyMission.Hunt
            && domain.Location is ArmyLocation.InTransit { Movement.IsReturning: false } huntTransit
            && now >= huntTransit.Movement.ArrivesAt)
        {
            return await ResolveHuntAsync(army, domain, now, cancellationToken).ConfigureAwait(false);
        }

        // A camp army stands on its site while the camp is built: nothing is due before arrival plus the build time (then it
        // falls through to the ordinary settle below, which only turns it around once its provisions demand it).
        if (domain.Mission == ArmyMission.SetUpCamp
            && domain.Location is ArmyLocation.InTransit { Movement.IsReturning: false } campTransit
            && now >= campTransit.Movement.ArrivesAt + BeachCamp.ScaledBuildDuration(army.Settlement!.World!.SpeedFactor))
        {
            return await ResolveCampAsync(army, domain, now, cancellationToken).ConfigureAwait(false);
        }

        if (domain.Mission == ArmyMission.Found
            && domain.Location is ArmyLocation.InTransit { Movement.IsReturning: false } foundTransit
            && now >= foundTransit.Movement.ArrivesAt)
        {
            return await ResolveFoundingAsync(army, domain, now, cancellationToken).ConfigureAwait(false);
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

        // docs/design/ship-movement.md §2: a fleet's home is the last owned
        // Dockyard settlement it docked at. A plain Move whose destination
        // hex turns out to be a *different* settlement the same player owns
        // (with a Dockyard) folds into that settlement's garrison right away
        // — same "arrival, then fold" treatment as coming home, just pointed
        // at wherever it actually landed. Checked before the generic
        // domain.SettleTo(now) below, same as every other mission's own
        // arrival-specific branch above: SettleTo has no notion of "standing
        // at a destination that happens to be a dock", only "outbound" vs.
        // "returning".
        //
        // §2's last paragraph closes the matching gap: a Move dispatch names
        // only a hex, not a target settlement, so nothing above stops one
        // from landing on a *foreign* Dockyard settlement's centre — and
        // ordinary Move arrival (the domain.SettleTo(now) fallback below)
        // would otherwise let a fleet stand there peacefully forever, a free
        // scouting/blockade stop no Attack/Support dispatch gets. A fleet
        // reaching a Dockyard settlement it doesn't own is redirected into
        // the same battle resolution an explicit Attack dispatch gets
        // instead (never Support — nothing here establishes host consent).
        if (domain.Mission == ArmyMission.Move
            && domain.IsFleet
            && domain.GatheringId is null
            && domain.Location is ArmyLocation.InTransit { Movement.IsReturning: false } moveTransit
            && now >= moveTransit.Movement.ArrivesAt)
        {
            var destination = moveTransit.Movement.Path[^1];
            var found = await FindDockyardSettlementAtAsync(
                army.Settlement!.WorldId, army.SettlementId, destination, cancellationToken)
                .ConfigureAwait(false);

            if (found is { Settlement: var dockyardSettlement, ByCentre: var byCentre })
            {
                if (dockyardSettlement.OwnerId == army.Settlement.OwnerId)
                {
                    // The fleet folds into the harbour spot it reached (a dock hex), or the settlement's own harbour spot
                    // when it landed on the centre; that spot is its new home.
                    var sampler = await WorldTerrain.SamplerAsync(_dbContext, army.Settlement.World!, cancellationToken).ConfigureAwait(false);
                    var spot = byCentre ? Army.FleetAnchor(dockyardSettlement.ToDomain(sampler.TerrainAt), sampler.TerrainAt) : destination;
                    await FoldIntoDockAsync(army, dockyardSettlement, spot, domain, moveTransit.Movement.ArrivesAt, now, cancellationToken).ConfigureAwait(false);
                    return ArmySettleOutcome.FoldedHome;
                }

                if (byCentre)
                {
                    var asAttack = domain with { Mission = ArmyMission.Attack, TargetSettlementId = dockyardSettlement.Id };
                    return await ResolveBattleAsync(army, asAttack, now, cancellationToken).ConfigureAwait(false);
                }
            }
        }

        var result = domain.SettleTo(now);
        if (!result.Changed)
        {
            return ArmySettleOutcome.NoChange;
        }

        if (result.Starved)
        {
            return Starve(army, domain, result);
        }

        army.WalkedLegs.AddRange(result.Walked);

        if (result.ArrivedHome)
        {
            await FoldHomeAsync(army, result.Army, now, cancellationToken).ConfigureAwait(false);
            return ArmySettleOutcome.FoldedHome;
        }

        army.ApplyDomain(result.Army);
        return ArmySettleOutcome.Updated;
    }

    /// <summary>
    /// A stranded army whose food ran out: the whole army dies where it stood. Records the ground it walked, removes the row and
    /// writes the starvation report (army, where, troops lost) for its owner. Not folded home: its stacks are gone, not garrisoned.
    /// </summary>
    private ArmySettleOutcome Starve(ArmyEntity army, Army domain, ArmySettleResult result)
    {
        var movement = ((ArmyLocation.InTransit)domain.Location).Movement;
        var starvesAt = result.Walked[^1].Until;

        // A stranded army may still be walking to the hex it stops on (a wall closed its way), so it dies where it is then.
        var where = movement.PositionAt(starvesAt);

        army.WalkedLegs.AddRange(result.Walked);
        _armyReportService.Add(
            army.Settlement!, ArmyReportKind.Starved, starvesAt, army.Id, where, domain.Mission, domain.Stacks);
        _dbContext.Armies.Remove(army);

        _logger.LogInformation(
            "Army {ArmyId} starved at {Hex} with {Troops} troop(s): it could not get home and its provisions ran out.",
            army.Id, where, domain.Stacks.Sum(s => s.Count));

        return ArmySettleOutcome.FoldedHome;
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
        var movement = ((ArmyLocation.InTransit)domain.Location).Movement;

        // The battle happens at the instant the attacker lands, not at "now": the defender's whole linked realm is settled
        // to that instant, so the stock a raid can loot (all of the group's pooled stock, docs/design/economy.md section 5)
        // is the one that was actually there.
        var battleInstant = movement.ArrivesAt;
        var session = await _settlementService.LoadGroupAsync(targetId, battleInstant, cancellationToken: cancellationToken)
            .ConfigureAwait(false);

        if (session is null)
        {
            // The target settlement no longer exists — settlements are never
            // deleted today, so this is defensive rather than an expected
            // case. Nothing to fight: send the army straight home rather than
            // leaving it stuck forever waiting to attack a place that is gone.
            _logger.LogWarning(
                "Army {ArmyId}'s attack target {TargetId} no longer exists; recalling home without a battle.",
                armyEntity.Id, targetId);

            return await ApplyArmyOutcomeAsync(armyEntity, TurnHomeWithoutBattle(domain, movement), now, cancellationToken).ConfigureAwait(false);
        }

        var guestArmies = session.GuestArmiesOf(targetId).ToList();
        var guestDefenderStacks = session.GuestStacksOf(targetId);

        // The attacker's own settlement's shrine favour (Thor/Njörd) boosts
        // its army's attack power — read-only here, so no write tracking is
        // needed even when the origin settlement is also the target of a
        // simultaneous attack from elsewhere.
        var attackerEntity = await LoadSettlementAsync(armyEntity.SettlementId, cancellationToken).ConfigureAwait(false);
        var attackerSettlement = attackerEntity?.ToDomain();
        var landAttackBonusPercent = attackerSettlement?.AttackBonusPercent(UnitClass.Infantry) ?? 0;
        var shipAttackBonusPercent = attackerSettlement?.AttackBonusPercent(UnitClass.Ship) ?? 0;

        var sampler = await WorldTerrain.SamplerAsync(_dbContext, attackerEntity!.World!, cancellationToken).ConfigureAwait(false);

        var seed = Random.Shared.Next();
        var arrival = Army.SettleArrival(
            domain, session.Store.PooledView(targetId), session.SpeedFactor, battleInstant, seed, guestDefenderStacks,
            landAttackBonusPercent, shipAttackBonusPercent, session.Store.Realm, sampler.TerrainAt);

        // Guaranteed true: the caller only reaches this method when the
        // outbound leg's ArrivesAt has already passed for a not-yet-returning
        // Attack army — exactly SettleArrival's own fire condition.
        var battle = arrival.Battle!;

        // The building damage of either step (the Fire Ships' fire, the siege engines) changes the realm.
        var fireSiege = arrival.Attack!.FireSiege;
        if (arrival.Siege is { Applied: true } || fireSiege.Applied)
        {
            _realmDirty.Add(targetId);
        }

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

        // The settle that follows eats with the guests the battle left, not the ones it started with.
        session.Store.SetGuests(targetId, session.GuestStacksOf(targetId));

        // The loot left the pool at the battle instant; settle the group on from there to now and write every member back.
        session.Apply(targetId, arrival.DefenderSettlement);
        if (now > battleInstant)
        {
            session.Store.SettleTo(now);
        }

        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);

        var report = BattleReport.From(
            Guid.CreateVersion7(), movement.ArrivesAt, armyEntity.Id, armyEntity.SettlementId, targetId,
            domain.Stacks, arrival.Attack!, seed, wasRaid: domain.Mission == ArmyMission.Raid);
        var battleEntity = BattleReportEntity.FromDomain(report);
        var attackerOwner = await ReportOwners.OfAsync(_dbContext, armyEntity.SettlementId, cancellationToken).ConfigureAwait(false);
        var defenderOwner = await ReportOwners.OfAsync(_dbContext, targetId, cancellationToken).ConfigureAwait(false);
        battleEntity.WorldId = attackerOwner.WorldId;
        battleEntity.AttackerOwnerId = attackerOwner.OwnerId;
        battleEntity.DefenderOwnerId = defenderOwner.OwnerId;
        _dbContext.BattleReports.Add(battleEntity);

        if (fireSiege.Applied)
        {
            _logger.LogInformation(
                "Army {ArmyId}'s fire ships burned {Burned} ship(s) and reduced {TargetType} at ({Q},{R}) in settlement {TargetId} "
                    + "from level {Before} to {After}.",
                armyEntity.Id, arrival.Attack!.FireShipsBurned, fireSiege.TargetType, fireSiege.TargetCoord!.Value.Q,
                fireSiege.TargetCoord.Value.R, targetId, fireSiege.LevelBefore, fireSiege.LevelAfter);
        }

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
            armyEntity.RecordWalkedToEnd();
            _dbContext.Armies.Remove(armyEntity);
            return ArmySettleOutcome.FoldedHome;
        }

        return await ApplyArmyOutcomeAsync(armyEntity, arrival.Army, now, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Settles an <see cref="ArmyMission.Hunt"/> army's arrival at its camp: the camp's garrison is settled to the
    /// arrival instant (<see cref="CampState.GarrisonAt"/> with the realm test), the fight is resolved by
    /// <see cref="CampBattleResolver.Hunt"/>, the camp's state row and a <see cref="CampReportEntity"/> are written,
    /// and the army either vanishes (wiped out) or walks home with its loot (<see cref="Army.SettleHuntArrival"/>).
    /// A camp that no longer exists, or that a building now stands on, is no fight: the army turns home.
    /// </summary>
    private async Task<ArmySettleOutcome> ResolveHuntAsync(
        ArmyEntity armyEntity, Army domain, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var movement = ((ArmyLocation.InTransit)domain.Location).Movement;
        var arrivesAt = movement.ArrivesAt;
        var worldId = armyEntity.Settlement!.WorldId;

        var found = domain.TargetCampCoord is { } coord
            ? await _campService.FindCampAsync(worldId, coord, arrivesAt, cancellationToken).ConfigureAwait(false)
            : null;
        var realm = await _campService.LoadRealmAsync(worldId, cancellationToken).ConfigureAwait(false);

        if (found is not { } worldCamp || realm.HasBuilding(worldCamp.Camp.Coord))
        {
            _logger.LogWarning(
                "Army {ArmyId}'s hunt target {Target} is gone; recalling home without a fight.",
                armyEntity.Id, domain.TargetCampCoord);

            return await ApplyArmyOutcomeAsync(armyEntity, TurnHomeWithoutBattle(domain, movement), now, cancellationToken).ConfigureAwait(false);
        }

        var camp = worldCamp.Camp;
        var state = worldCamp.State;
        var garrison = state.GarrisonAt(camp, arrivesAt, realm.InsideRealm(camp.Coord));
        var effectiveLevel = state.EffectiveLevel(camp);

        var attackerEntity = await LoadSettlementAsync(armyEntity.SettlementId, cancellationToken).ConfigureAwait(false);
        // Fleets hunting a water camp fight with the ship attack bonus; land armies, and the land troops a fleet puts ashore at a
        // sand camp, with the land one.
        var attackBonusPercent = attackerEntity?.ToDomain().AttackBonusPercent(domain.IsFleet && camp.IsWater ? UnitClass.Ship : UnitClass.Infantry) ?? 0;

        var seed = Random.Shared.Next();
        var plan = CampBattleResolver.Hunt(
            domain.Stacks, garrison, camp, effectiveLevel, seed, domain.ProvisionsAt(arrivesAt), attackBonusPercent, state.Leftover);

        // An already empty camp is a pickup, not a clear: clears, calm and snapshot stay as they were.
        var nextState = garrison.IsEmpty
            ? state.AfterPickup(plan.Taken)
            : state.AfterHunt(camp, arrivesAt, plan);
        await _campService.UpsertStateAsync(worldId, camp.Coord, nextState, cancellationToken).ConfigureAwait(false);

        var report = CampReport.From(
            Guid.CreateVersion7(), worldId, CampReportKind.Hunt, arrivesAt, camp, effectiveLevel,
            armyEntity.SettlementId, armyEntity.Id, domain.Stacks, garrison, plan, seed);
        var huntEntity = CampReportEntity.FromDomain(report);
        huntEntity.OwnerId = (await ReportOwners.OfAsync(_dbContext, armyEntity.SettlementId, cancellationToken).ConfigureAwait(false)).OwnerId;
        _dbContext.CampReports.Add(huntEntity);

        _logger.LogInformation(
            "Army {ArmyId} hunted {Family} camp at {Camp}: {Winner} won ({ArmyPower} vs {CampPower}); "
                + "{Survivors} unit(s) survived, loot {Loot}.",
            armyEntity.Id, camp.Family, camp.Coord, plan.Winner, plan.ArmyPower, plan.CampPower,
            plan.ArmySurvivors.Sum(s => s.Count), plan.Loot);

        var returning = domain.SettleHuntArrival(plan, arrivesAt);
        if (returning is null)
        {
            armyEntity.RecordWalkedToEnd();
            _dbContext.Armies.Remove(armyEntity);
            return ArmySettleOutcome.FoldedHome;
        }

        return await ApplyArmyOutcomeAsync(armyEntity, returning, now, cancellationToken).ConfigureAwait(false);
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
            EdgeHours = movement.ReturnEdgeHours,
            ReturnPath = movement.ReturnPath,
            ReturnCumulativeHours = movement.ReturnCumulativeHours,
            ReturnEdgeHours = movement.ReturnEdgeHours,
            TurnAroundAt = movement.ArrivesAt,
            IsReturning = true,
            RoutePlannedAt = movement.RoutePlannedAt,
        }),
    };

    /// <summary>
    /// Continues settling a just-turned-around army onward to <paramref name="now"/>
    /// (it may already be home) and writes back whichever outcome results.
    /// </summary>
    /// <summary>
    /// Settles an <see cref="ArmyMission.Found"/> convoy's arrival (issue #55
    /// §5/§6): re-checks the target hex's spacing rule as of <paramref name="now"/>
    /// (not trusted from dispatch time — see
    /// <see cref="Army.PlanFoundingArrival"/>'s remarks) and either founds the
    /// new settlement, consuming the convoy, or — when the hex is no longer
    /// foundable — falls back to plain <c>Army.SettleTo</c>, exactly the same
    /// standing/auto-return/recall/retarget behaviour a <see cref="ArmyMission.Move"/>
    /// army gets. That fallback is this issue's entire answer to "target hex
    /// claimed mid-transit": nothing here ever discards the mission.
    /// </summary>
    private async Task<ArmySettleOutcome> ResolveFoundingAsync(
        ArmyEntity armyEntity, Army domain, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var movement = ((ArmyLocation.InTransit)domain.Location).Movement;
        var targetHex = movement.Path[^1];
        var originSettlement = armyEntity.Settlement!;

        var claimedSettlements = await _settlementService
            .GetClaimedSettlementsAsync(originSettlement.WorldId, cancellationToken)
            .ConfigureAwait(false);
        var arrivalGiants = await LoadGiantIndexAsync(originSettlement.WorldId, cancellationToken).ConfigureAwait(false);
        var targetStillFoundable =
            Founding.IsHexFoundable(targetHex, claimedSettlements, SettlementService.MinimumSpacing, arrivalGiants);

        var arrival = Army.PlanFoundingArrival(domain, now, targetStillFoundable);

        if (!arrival.ShouldFound)
        {
            // Either not yet arrived (unreachable here — the caller only
            // routes to this method once ArrivesAt has passed) or the hex is
            // no longer foundable: fall through to the ordinary Move-shaped
            // settle so the convoy stands, auto-returns by its own precomputed
            // TurnAroundAt, or awaits a Recall/RetargetFounding — never lost.
            return await ApplyArmyOutcomeAsync(armyEntity, domain, now, cancellationToken).ConfigureAwait(false);
        }

        var newSettlement = await _settlementService.FoundFromConvoyAsync(
            originSettlement.WorldId,
            targetHex,
            originSettlement.UserId,
            originSettlement.OwnerName,
            originSettlement.OwnerId,
            $"{originSettlement.OwnerName}'s Settlement",
            arrival.GarrisonForNewSettlement,
            now,
            originSettlement.World!.SpeedFactor,
            cancellationToken).ConfigureAwait(false);

        armyEntity.RecordWalkedToEnd();
        _dbContext.Armies.Remove(armyEntity);

        _logger.LogInformation(
            "Settler convoy (army {ArmyId}) founded settlement {NewSettlementId} at {Coord} for user {UserId}.",
            armyEntity.Id, newSettlement.Id, targetHex, originSettlement.UserId);

        return ArmySettleOutcome.FoldedHome;
    }

    /// <summary>
    /// Settles an <see cref="ArmyMission.SetUpCamp"/> army once it has stood on its site for the whole build time: re-checks the
    /// site as of now (<see cref="BeachCamp.CheckSite"/>, the same facts as at dispatch) and either sets the camp up
    /// (<see cref="SettlementService.FoundCampFromConvoyAsync"/>, consuming the army: the builders are used up, the cost in its
    /// <see cref="Army.Loot"/> is spent, the rest garrisons the camp and the leftover provisions fill its food pile) or — when the
    /// site was taken in the meantime — recalls it as of the completion instant, so the builders and the cost (its loot) come home.
    /// </summary>
    private async Task<ArmySettleOutcome> ResolveCampAsync(
        ArmyEntity armyEntity, Army domain, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var originSettlement = armyEntity.Settlement!;
        var world = originSettlement.World!;
        var site = ((ArmyLocation.InTransit)domain.Location).Movement.Path[^1];

        var sampler = await WorldTerrain.SamplerAsync(_dbContext, world, cancellationToken).ConfigureAwait(false);
        var giants = await LoadGiantIndexAsync(world.Id, cancellationToken).ConfigureAwait(false);
        var occupied = await IsCampSiteOccupiedAsync(world.Id, site, now, cancellationToken).ConfigureAwait(false);
        var siteStillFree = BeachCamp.CheckSite(site, sampler.TerrainAt, giants, hex => occupied && hex == site) == DispatchRejection.None;

        var plan = Army.PlanCampBuild(domain, now, world.SpeedFactor, siteStillFree);
        if (!plan.ShouldBuild)
        {
            // The shore is no longer free: the builders and the camp's cost (the loot) come home. The army is recalled as of the
            // completion instant, so it is returning afterwards and this branch can never fire for it again.
            var recalled = await PlanRecallAsync(armyEntity, domain, plan.CompletesAt, null, cancellationToken).ConfigureAwait(false);
            if (recalled is not null)
            {
                return await ApplyArmyOutcomeAsync(armyEntity, recalled, now, cancellationToken).ConfigureAwait(false);
            }

            _logger.LogWarning(
                "Camp army {ArmyId} found its site {Site} taken but has no route home; it stands there like a Move army.",
                armyEntity.Id, site);
            return await ApplyArmyOutcomeAsync(armyEntity, domain, now, cancellationToken).ConfigureAwait(false);
        }

        var camp = await _settlementService.FoundCampFromConvoyAsync(
            world.Id,
            plan.Site,
            originSettlement.UserId,
            originSettlement.OwnerName,
            originSettlement.OwnerId,
            $"{originSettlement.OwnerName}'s Camp",
            plan.GarrisonForCamp,
            plan.FoodForCamp,
            plan.CompletesAt,
            cancellationToken).ConfigureAwait(false);

        armyEntity.RecordWalkedToEnd();
        _dbContext.Armies.Remove(armyEntity);

        _logger.LogInformation(
            "Camp builders (army {ArmyId}) set up beach camp {CampId} at {Coord} for user {UserId}.",
            armyEntity.Id, camp.Id, plan.Site, originSettlement.UserId);

        return ArmySettleOutcome.FoldedHome;
    }

    private async Task<ArmySettleOutcome> ApplyArmyOutcomeAsync(
        ArmyEntity armyEntity, Army turnedArmy, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var result = turnedArmy.SettleTo(now);
        if (result.Starved)
        {
            return Starve(armyEntity, turnedArmy, result);
        }

        var finalArmy = result.Changed ? result.Army : turnedArmy;
        armyEntity.WalkedLegs.AddRange(result.Walked);

        if (result.ArrivedHome)
        {
            await FoldHomeAsync(armyEntity, finalArmy, now, cancellationToken).ConfigureAwait(false);
            return ArmySettleOutcome.FoldedHome;
        }

        armyEntity.ApplyDomain(finalArmy);
        return ArmySettleOutcome.Updated;
    }

    /// <summary>
    /// Folds a returned army's stacks — and any <see cref="Army.Loot"/> and leftover provisions — into
    /// its home spot and its home settlement's stock, then removes the army row.
    /// </summary>
    private async Task FoldHomeAsync(ArmyEntity armyEntity, Army returnedArmy, DateTimeOffset now, CancellationToken cancellationToken)
    {
        await FoldStacksIntoAsync(armyEntity.Settlement!, returnedArmy.HomeSpot, armyEntity, returnedArmy, now, now, cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Army {ArmyId} arrived home at settlement {SettlementId}; folded into garrison.",
            armyEntity.Id, armyEntity.SettlementId);
    }

    /// <summary>
    /// docs/design/garrison.md: a fleet reaching a *different*
    /// settlement it owns (with a Dockyard) folds into that settlement's
    /// harbour spot exactly like <see cref="FoldHomeAsync"/> does for a return to
    /// origin — that spot becomes the fleet's new home, with no separate "home" field to track. Kept as its own method
    /// so the two call sites' log messages stay distinct: one is "came home", the other
    /// is "made a new home".
    /// </summary>
    private async Task FoldIntoDockAsync(
        ArmyEntity armyEntity, SettlementEntity dockyardSettlement, HexCoord spot, Army dockedFleet, DateTimeOffset arrivedAt, DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await FoldStacksIntoAsync(dockyardSettlement, spot, armyEntity, dockedFleet, arrivedAt, now, cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Fleet {ArmyId} docked at settlement {SettlementId}, which it owns but did not depart from ({OriginId}); folded into its garrison.",
            armyEntity.Id, dockyardSettlement.Id, armyEntity.SettlementId);
    }

    /// <summary>
    /// Shared body of <see cref="FoldHomeAsync"/>/<see cref="FoldIntoDockAsync"/>: puts an arrived army's stacks into the
    /// garrison spot <paramref name="spot"/> of <paramref name="destinationEntity"/>, its loot and leftover provisions
    /// (<see cref="Army.ProvisionsAt"/> at <paramref name="arrivedAt"/>) into the settlement's stock (what does not fit is
    /// wasted), then removes the army row. Land units never stand at a dock: they come off the ships as a new army and
    /// walk from the land hex next to the dock to the nearest tower or longhouse, on food from the stock
    /// (<see cref="GarrisonRelocation.LandingMarch"/>).
    /// </summary>
    private async Task FoldStacksIntoAsync(
        SettlementEntity destinationEntity, HexCoord spot, ArmyEntity armyEntity, Army arrivedArmy, DateTimeOffset arrivedAt, DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var session = await _settlementService.LoadGroupAsync(destinationEntity.Id, now, cancellationToken: cancellationToken)
            .ConfigureAwait(false) ?? throw new InvalidOperationException($"Settlement {destinationEntity.Id} disappeared while an army folded into it.");

        var view = session.View(destinationEntity.Id);
        var isDock = view.SpotAt(spot) is { Kind: GarrisonSpotKind.Dock };
        bool IsShip(UnitStack s) => UnitCatalogue.Get(s.Type).Class == UnitClass.Ship;
        var staying = isDock ? arrivedArmy.Stacks.Where(IsShip).ToList() : [.. arrivedArmy.Stacks];
        var landing = isDock ? arrivedArmy.Stacks.Where(s => !IsShip(s)).ToList() : [];

        var merged = view.AddToGarrisonAt(spot, staying).WithQuestLatches();
        var deposit = arrivedArmy.Loot + new ResourceAmounts(0, 0, arrivedArmy.ProvisionsAt(arrivedAt), 0);
        if (!deposit.IsZero)
        {
            merged = merged with { Resources = merged.Resources.Deposit(deposit, now) };
        }

        if (landing.Count > 0)
        {
            var relocation = new GarrisonRelocation(_dbContext);
            var routing = await relocation.LoadRoutingAsync(
                destinationEntity.WorldId, session.SpeedFactor, session.TerrainAt, destinationEntity.UserId, destinationEntity.Id, now, cancellationToken)
                .ConfigureAwait(false);
            if (GarrisonRelocation.LandingMarch(merged, spot, landing, now, routing, Guid.CreateVersion7()) is { } found)
            {
                var (walkers, resources) = GarrisonRelocation.WithWalkFood(found.March, merged.Resources, now);
                merged = merged with { Resources = resources };
                relocation.AddArmy(walkers);
            }
            else
            {
                // Nowhere to walk to: they stay aboard at the dock.
                merged = merged.AddToGarrisonAt(spot, landing);
            }
        }

        session.Apply(destinationEntity.Id, merged);
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        armyEntity.RecordWalkedToEnd();
        _dbContext.Armies.Remove(armyEntity);
    }

    /// <summary>
    /// The settlement in <paramref name="worldId"/> a fleet that reached <paramref name="hex"/> docks at: one whose centre is
    /// there and that has a functioning Dockyard (<c>ByCentre</c>), or one with a Dockyard standing on that hex. Never
    /// <paramref name="excludeSettlementId"/> itself — the arriving fleet's own settlement of origin is not a docking target.
    /// Ownership is left to the caller: a fleet reaching an *owned* one folds into it, while reaching a *foreign* one by its centre
    /// resolves through battle instead — both need this same lookup first. <see langword="null"/> when there is none.
    /// </summary>
    private async Task<(SettlementEntity Settlement, bool ByCentre)?> FindDockyardSettlementAtAsync(
        Guid worldId, Guid excludeSettlementId, HexCoord hex, CancellationToken cancellationToken)
    {
        var candidates = await _dbContext.Settlements
            .Include(s => s.World)
            .Include(s => s.Buildings)
            .Include(s => s.Queue)
            .Include(s => s.Garrison)
            .Include(s => s.TrainingQueue)
            .Include(s => s.Runes)
            .Where(s => s.WorldId == worldId && s.Id != excludeSettlementId
                && ((s.CentreQ == hex.Q && s.CentreR == hex.R)
                    || s.Buildings.Any(b => b.Type == BuildingType.Dockyard && b.Q == hex.Q && b.R == hex.R)))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        foreach (var candidate in candidates)
        {
            var functioning = candidate.Buildings.Any(b => b.Type == BuildingType.Dockyard && b.OutsideRealmSince == null);
            var byCentre = candidate.CentreQ == hex.Q && candidate.CentreR == hex.R;
            if (functioning && (byCentre || candidate.Buildings.Any(b => b.Type == BuildingType.Dockyard && b.Q == hex.Q && b.R == hex.R && b.OutsideRealmSince == null)))
            {
                return (candidate, byCentre);
            }
        }

        return null;
    }

    /// <summary>
    /// Gives every army out of home whose home is <paramref name="settlementId"/> (and, when given, the garrison spot
    /// <paramref name="spot"/>; <see langword="null"/> means the whole settlement) a new home: the nearest garrison spot of its
    /// owner, by route, that it can reach on its current provisions and that can hold it, with its return route rebuilt to it.
    /// For when the home is given up (a destroyed tower or dock, a beach camp about to be deleted). An army that can reach none
    /// is left as it is; field armies do not starve today, so nothing further happens to it. Does not save.
    /// </summary>
    public async Task RehomeArmiesAsync(Guid settlementId, HexCoord? spot, DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var entity = await LoadSettlementAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (entity?.World is not { } world)
        {
            return;
        }

        var sampler = await WorldTerrain.SamplerAsync(_dbContext, world, cancellationToken).ConfigureAwait(false);
        var relocation = new GarrisonRelocation(_dbContext);
        var routing = await relocation.LoadRoutingAsync(world.Id, world.SpeedFactor, sampler.TerrainAt, entity.UserId, entity.Id, now, cancellationToken).ConfigureAwait(false);
        var candidates = await relocation.OwnerSpotsAsync(world.Id, entity.OwnerId, sampler.TerrainAt, new Dictionary<Guid, Settlement>(), cancellationToken).ConfigureAwait(false);
        await relocation.RehomeAsync(settlementId, spot, candidates, now, routing, cancellationToken).ConfigureAwait(false);
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
    /// Every giant across every island of <paramref name="worldId"/>
    /// (the territory rule), built into one lookup — mirrors
    /// <see cref="WorldRivers.IndexAsync"/> for the same reason.
    /// </summary>
    private async Task<IGiantIndex> LoadGiantIndexAsync(Guid worldId, CancellationToken cancellationToken)
    {
        var islands = await _dbContext.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId)
            .Select(i => i.Giants)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var giants = islands
            .SelectMany(g => g)
            .Select(g => new Giant(new HexCoord(g.Q, g.R), g.Family, (TileOrientation)g.Orientation))
            .ToList();

        return new GiantIndex(giants);
    }

    private Task<ArmyEntity?> LoadArmyAsync(Guid armyId, CancellationToken cancellationToken) =>
        ArmiesForSettle().FirstOrDefaultAsync(a => a.Id == armyId, cancellationToken);

    /// <summary>Armies with everything a settle needs loaded: its stacks, target, gathering and home settlement with its world, owner and garrison.</summary>
    private IQueryable<ArmyEntity> ArmiesForSettle() =>
        _dbContext.Armies
            .Include(a => a.Stacks)
            .Include(a => a.TargetSettlement)
            .Include(a => a.Gathering)
            .Include(a => a.Settlement!).ThenInclude(s => s.World)
            .Include(a => a.Settlement!).ThenInclude(s => s.Owner)
            .Include(a => a.Settlement!).ThenInclude(s => s.Buildings)
            .Include(a => a.Settlement!).ThenInclude(s => s.Queue)
            .Include(a => a.Settlement!).ThenInclude(s => s.Garrison)
            .Include(a => a.Settlement!).ThenInclude(s => s.TrainingQueue)
            .Include(a => a.Settlement!).ThenInclude(s => s.Runes);

    /// <summary>Writes the session back and saves when settling changed anything: a real change worth keeping even if the request was refused.</summary>
    private async Task SaveIfChangedAsync(LinkedGroupSession session, CancellationToken cancellationToken)
    {
        if (await session.WriteBackAsync(cancellationToken).ConfigureAwait(false))
        {
            await SaveAsync(cancellationToken).ConfigureAwait(false);
        }
    }
}
