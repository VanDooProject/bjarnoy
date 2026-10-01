using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>What <see cref="CampAmbushService.TryResolveAsync"/> did to the army.</summary>
public enum CampAmbushOutcome
{
    /// <summary>No ambush happened; the army is untouched.</summary>
    None,

    /// <summary>An ambush was fought and the army survived (marching on or retreating home); its row is kept.</summary>
    Fought,

    /// <summary>An ambush wiped the army out; its row is removed.</summary>
    ArmyDestroyed,
}

/// <summary>
/// Strong camps ambushing marching armies (<c>docs/design/wildlife-camps.md</c>, "Strong camps attack"). Lazy like the
/// field battle: run from <c>ArmyService.SettleAndFoldAsync</c> when an army is settled, it asks
/// <see cref="CampAmbush.FindEarliest"/> whether the route entered an aggressive strong camp's guard range since the
/// army set out, and resolves that one fight at the instant of entry. Land armies are only ever checked against land
/// camps and fleets only against water camps (the whale road, guard range 0: the fleet is attacked when its route
/// enters the camp's own hex).
/// </summary>
public sealed class CampAmbushService(
    GameDbContext dbContext, CampService campService, ILogger<CampAmbushService> logger)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly CampService _campService = campService;
    private readonly ILogger<CampAmbushService> _logger = logger;

    /// <summary>
    /// Resolves the earliest ambush on <paramref name="armyEntity"/>'s route up to <paramref name="now"/>, if any.
    /// The camp's new state, the report and the army's new state (survivors; a retreat home when it lost, or removed
    /// when nobody survived) are added to the context; the caller saves.
    /// </summary>
    /// <returns>Whether an ambush was fought (the army then settles again on its next read) and whether it destroyed the army.</returns>
    public async Task<CampAmbushOutcome> TryResolveAsync(
        ArmyEntity armyEntity, Army domain, DateTimeOffset now, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(armyEntity);
        ArgumentNullException.ThrowIfNull(domain);

        if (domain.Location is not ArmyLocation.InTransit { Movement: var movement }
            || movement.RetreatImmune)
        {
            return CampAmbushOutcome.None;
        }

        var settlement = armyEntity.Settlement!;
        var world = settlement.World!;
        var worldId = settlement.WorldId;

        var camps = await _campService.LoadCampsAsync(worldId, now, cancellationToken: cancellationToken).ConfigureAwait(false);
        // Land armies are only met by land camps, fleets only by water camps (the whale road): a fleet is
        // attacked when its route enters the camp's own hex (guard range 0).
        var near = camps.Where(c => c.Camp.Strong && c.Camp.IsWater == domain.IsFleet && IsNearRoute(c.Camp, movement)).ToList();
        if (near.Count == 0)
        {
            return CampAmbushOutcome.None;
        }

        var realm = await _campService.LoadRealmAsync(worldId, cancellationToken).ConfigureAwait(false);

        // A camp a building stands on is off the map and attacks nobody.
        var candidates = near.Where(c => !realm.HasBuilding(c.Camp.Coord)).Select(c => (c.Camp, c.State)).ToList();
        HexCoord? exempt = domain.Mission == ArmyMission.Hunt ? domain.TargetCampCoord : null;

        // One tick before DepartedAt: an army that sets out from inside a guard range is entering it at the start.
        var hit = CampAmbush.FindEarliest(
            movement, candidates, realm.InsideRealm, exempt, movement.DepartedAt.AddTicks(-1), now);
        if (hit is not { } ambush)
        {
            return CampAmbushOutcome.None;
        }

        var camp = ambush.Camp;
        var state = candidates.First(c => c.Camp.Coord == camp.Coord).State;
        var garrison = state.GarrisonAt(camp, ambush.At, realm.InsideRealm(camp.Coord));
        var effectiveLevel = state.EffectiveLevel(camp);

        var seed = Random.Shared.Next();
        var plan = CampBattleResolver.CampAttack(garrison, camp, domain.Stacks, seed);

        await _campService.UpsertStateAsync(
            worldId, camp.Coord, state.AfterFight(camp, ambush.At, plan.BeastSurvivors), cancellationToken).ConfigureAwait(false);

        var report = CampReport.From(
            Guid.CreateVersion7(), worldId, CampReportKind.Ambush, ambush.At, camp, effectiveLevel,
            armyEntity.SettlementId, armyEntity.Id, domain.Stacks, garrison, plan, seed);
        _dbContext.CampReports.Add(CampReportEntity.FromDomain(report));

        _logger.LogInformation(
            "{Family} camp at {Camp} ambushed army {ArmyId} at {Hex}: {Winner} won ({ArmyPower} vs {CampPower}); "
                + "{Survivors} unit(s) survived.",
            camp.Family, camp.Coord, armyEntity.Id, ambush.Hex, plan.Winner, plan.ArmyPower, plan.CampPower,
            plan.ArmySurvivors.Sum(s => s.Count));

        if (plan.ArmySurvivors.Sum(s => s.Count) <= 0)
        {
            _dbContext.Armies.Remove(armyEntity);
            return CampAmbushOutcome.ArmyDestroyed;
        }

        var survivors = domain with { Stacks = plan.ArmySurvivors };
        if (plan.Winner == CampFightWinner.Army)
        {
            armyEntity.ApplyDomain(survivors);
            return CampAmbushOutcome.Fought;
        }

        var sampler = await WorldTerrain.SamplerAsync(_dbContext, world, cancellationToken).ConfigureAwait(false);
        var home = new HexCoord(settlement.CentreQ, settlement.CentreR);
        armyEntity.ApplyDomain(survivors.ForceFieldRetreat(ambush.At, ambush.Hex, home, sampler.TerrainAt, world.SpeedFactor));
        return CampAmbushOutcome.Fought;
    }

    /// <summary>
    /// Cheap prefilter: a camp can only reach a route hex within its guard range when it lies in the route's
    /// bounding box grown by that range (hex distance is at least |dq| and |dr|).
    /// </summary>
    private static bool IsNearRoute(Camp camp, Bjarnoy.Domain.Movement.Movement movement)
    {
        var hexes = movement.Path.Concat(movement.ReturnPath).ToList();
        if (hexes.Count == 0)
        {
            return false;
        }

        var range = camp.GuardRange;
        return camp.Coord.Q >= hexes.Min(h => h.Q) - range && camp.Coord.Q <= hexes.Max(h => h.Q) + range
            && camp.Coord.R >= hexes.Min(h => h.R) - range && camp.Coord.R <= hexes.Max(h => h.R) + range;
    }
}
