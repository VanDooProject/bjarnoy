using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

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

    /// <summary>Dispatches an army: charges the settlement for the units and provisions, and computes its route.</summary>
    public async Task<ArmyDispatchResult> DispatchAsync(
        Guid settlementId,
        IReadOnlyList<UnitStack> unitCounts,
        IReadOnlyList<HexCoord> waypoints,
        HexCoord destination,
        double provisions,
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

        var sampler = new TerrainSampler(settlement.World.ToGenerationOptions());
        var armyId = Guid.CreateVersion7();

        var decision = Army.PlanDispatch(
            settled, unitCounts, provisions, waypoints, destination, now, armyId, sampler.TerrainAt);

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
            settlementId, armyId, decision.Army!.Stacks.Count, destination,
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

        var outcome = SettleAndFold(army, now);
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

        var outcome = SettleAndFold(army, now);
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
    /// brings it all the way home, folds its stacks into the settlement's
    /// garrison and removes the army row from the context (SaveChanges is
    /// still the caller's job either way).
    /// </summary>
    private ArmySettleOutcome SettleAndFold(ArmyEntity army, DateTimeOffset now)
    {
        var result = army.ToDomain().SettleTo(now);
        if (!result.Changed)
        {
            return ArmySettleOutcome.NoChange;
        }

        if (result.ArrivedHome)
        {
            var settlementEntity = army.Settlement!;
            var settlementDomain = settlementEntity.ToDomain()
                .SettleTo(now, settlementEntity.World!.SpeedFactor).Settlement;
            settlementEntity.ApplyDomain(MergeIntoGarrison(settlementDomain, result.Army.Stacks));
            _dbContext.Armies.Remove(army);

            _logger.LogInformation(
                "Army {ArmyId} arrived home at settlement {SettlementId}; folded into garrison.",
                army.Id, army.SettlementId);

            return ArmySettleOutcome.FoldedHome;
        }

        army.ApplyDomain(result.Army);
        return ArmySettleOutcome.Updated;
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
