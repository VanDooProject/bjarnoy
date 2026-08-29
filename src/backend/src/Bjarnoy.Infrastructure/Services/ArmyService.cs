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

    Recalled,
}

public sealed record RecallResult(RecallOutcome Outcome, ArmyEntity? Army = null)
{
    public bool Accepted => Outcome == RecallOutcome.Recalled && Army is not null;
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
    /// <see cref="ArmyMission.Attack"/>, whose destination is always the
    /// target settlement's own hex — resolved here rather than trusted from
    /// the caller.
    /// </param>
    /// <param name="targetSettlementId">
    /// Required for <see cref="ArmyMission.Attack"/> — the settlement to
    /// fight on arrival (issue #40 phase 3). Attacking an army standing in
    /// the open field, rather than a settlement, is not supported this phase.
    /// </param>
    public async Task<ArmyDispatchResult> DispatchAsync(
        Guid settlementId,
        IReadOnlyList<UnitStack> unitCounts,
        IReadOnlyList<HexCoord> waypoints,
        HexCoord? destination,
        double provisions,
        ArmyMission mission = ArmyMission.Move,
        Guid? targetSettlementId = null,
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
        if (mission == ArmyMission.Attack)
        {
            if (targetSettlementId is not { } targetId)
            {
                await PersistIfSettledAsync(settlement, settled, cancellationToken).ConfigureAwait(false);
                return new ArmyDispatchResult(DispatchRejection.TargetSettlementRequired);
            }

            if (targetId == settlementId)
            {
                await PersistIfSettledAsync(settlement, settled, cancellationToken).ConfigureAwait(false);
                return new ArmyDispatchResult(DispatchRejection.CannotAttackOwnSettlement);
            }

            // Same world only — an army cannot reach a settlement in another
            // world's map, so a cross-world id is indistinguishable from one
            // that does not exist.
            var target = await _dbContext.Settlements
                .AsNoTracking()
                .Where(s => s.Id == targetId && s.WorldId == settlement.WorldId)
                .Select(s => new { s.CentreQ, s.CentreR })
                .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

            if (target is null)
            {
                await PersistIfSettledAsync(settlement, settled, cancellationToken).ConfigureAwait(false);
                return new ArmyDispatchResult(DispatchRejection.TargetSettlementNotFound);
            }

            effectiveDestination = new HexCoord(target.CentreQ, target.CentreR);
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
        var armyId = Guid.CreateVersion7();

        var decision = Army.PlanDispatch(
            settled, unitCounts, provisions, waypoints, effectiveDestination, now, armyId, sampler.TerrainAt,
            mission, mission == ArmyMission.Attack ? targetSettlementId : null);

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

    /// <summary>Armies belonging to a settlement — home and in transit. Not settled on read; see <see cref="SettlementService.GetForWorldAsync"/> for the same reasoning.</summary>
    public Task<List<ArmyEntity>> GetForSettlementAsync(Guid settlementId, CancellationToken cancellationToken = default) =>
        _dbContext.Armies
            .AsNoTracking()
            .Include(a => a.Stacks)
            .Where(a => a.SettlementId == settlementId)
            .OrderBy(a => a.Id)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Turns an army around mid-journey. Refused (as <see cref="RecallOutcome.NothingToRecall"/>)
    /// when it is already returning, or arrived home during this very settle.
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
        var home = new HexCoord(army.Settlement.CentreQ, army.Settlement.CentreR);
        var recalled = army.ToDomain().Recall(now, home, sampler.TerrainAt);

        if (recalled is null)
        {
            if (outcome == ArmySettleOutcome.Updated)
            {
                await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            }

            return new RecallResult(RecallOutcome.NothingToRecall, army);
        }

        army.ApplyDomain(recalled);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Army {ArmyId} recalled at {Now}, now heading home.", armyId, now);

        return new RecallResult(RecallOutcome.Recalled, army);
    }

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
    /// An <see cref="ArmyMission.Attack"/> army whose outbound
    /// <c>Movement.ArrivesAt</c> has passed and has not yet turned around is
    /// routed to <see cref="ResolveBattleAsync"/> instead of the plain
    /// <c>Army.SettleTo</c> path: it fights right there rather than standing
    /// and later auto-returning the way <see cref="ArmyMission.Move"/> does —
    /// see <see cref="Army.SettleArrival"/>.
    /// </remarks>
    private async Task<ArmySettleOutcome> SettleAndFoldAsync(
        ArmyEntity army, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var domain = army.ToDomain();

        if (domain.Mission == ArmyMission.Attack
            && domain.Location is ArmyLocation.InTransit { Movement.IsReturning: false } inTransit
            && now >= inTransit.Movement.ArrivesAt)
        {
            return await ResolveBattleAsync(army, domain, now, cancellationToken).ConfigureAwait(false);
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
    /// target settlement, runs <see cref="Army.SettleArrival"/> against it,
    /// persists the resulting <see cref="BattleReportEntity"/> and the
    /// defender's post-battle state, and either removes the army row (a
    /// wiped-out attacker, or one that folds straight home within this same
    /// settle) or writes its post-battle return-leg state back.
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

        var seed = Random.Shared.Next();
        var arrival = Army.SettleArrival(
            domain, defenderEntity.ToDomain(), defenderEntity.World.SpeedFactor, now, seed);

        // Guaranteed true: the caller only reaches this method when the
        // outbound leg's ArrivesAt has already passed for a not-yet-returning
        // Attack army — exactly SettleArrival's own fire condition.
        var battle = arrival.Battle!;

        defenderEntity.ApplyDomain(arrival.DefenderSettlement);

        var report = BattleReport.From(
            Guid.CreateVersion7(), movement.ArrivesAt, armyEntity.Id, armyEntity.SettlementId, targetId,
            domain.Stacks, battle, seed);
        _dbContext.BattleReports.Add(BattleReportEntity.FromDomain(report));

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
            .FirstOrDefaultAsync(s => s.Id == settlementId, cancellationToken);

    private Task<ArmyEntity?> LoadArmyAsync(Guid armyId, CancellationToken cancellationToken) =>
        _dbContext.Armies
            .Include(a => a.Stacks)
            .Include(a => a.Settlement!).ThenInclude(s => s.World)
            .Include(a => a.Settlement!).ThenInclude(s => s.Buildings)
            .Include(a => a.Settlement!).ThenInclude(s => s.Queue)
            .Include(a => a.Settlement!).ThenInclude(s => s.Garrison)
            .Include(a => a.Settlement!).ThenInclude(s => s.TrainingQueue)
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
