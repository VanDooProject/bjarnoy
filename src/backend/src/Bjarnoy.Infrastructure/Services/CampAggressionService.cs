using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Strong camps attacking towers (<c>docs/design/wildlife-camps.md</c>, "Strong camps attack"). Nothing else reads a
/// tower unprompted, so <c>CampAggressionHostedService</c> scans every running world once a minute: an aggressive
/// strong camp attacks one tower within its guard range, a standing one at once and one under construction 30 min
/// after its construction started. Only the owner's armies standing on the tower hex defend it; if there are none, or
/// they lose, the tower burns (an unfinished one is lost with its cost) and the camp is calm for 24 h either way.
/// </summary>
public sealed class CampAggressionService(
    GameDbContext dbContext,
    CampService campService,
    SettlementService settlementService,
    TimeProvider timeProvider,
    ILogger<CampAggressionService> logger)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly CampService _campService = campService;
    private readonly SettlementService _settlementService = settlementService;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<CampAggressionService> _logger = logger;

    /// <summary>
    /// Runs <see cref="ProcessWorldAsync"/> for every world that currently accepts commands (a paused world's game
    /// clock stands still, so its camps do not act), at that world's game time. One world failing never stops the
    /// others; a concurrent write (<see cref="DbUpdateConcurrencyException"/>) just retries on the next scan.
    /// </summary>
    /// <returns>How many camp attacks were fought.</returns>
    public async Task<int> ProcessDueWorldsAsync(CancellationToken cancellationToken = default)
    {
        var worlds = await _dbContext.Worlds.AsNoTracking().ToListAsync(cancellationToken).ConfigureAwait(false);
        var wall = _timeProvider.GetUtcNow();
        var fought = 0;

        foreach (var world in worlds)
        {
            var clock = world.ToClock();
            if (!clock.AllowsCommands)
            {
                continue;
            }

            try
            {
                fought += await ProcessWorldAsync(world.Id, clock.ToGameTime(wall), cancellationToken).ConfigureAwait(false);
            }
            catch (DbUpdateConcurrencyException ex)
            {
                _dbContext.ChangeTracker.Clear();
                _logger.LogInformation(ex, "Camp aggression in world {WorldId} lost a write race; will retry next scan.", world.Id);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _dbContext.ChangeTracker.Clear();
                _logger.LogError(ex, "Camp aggression in world {WorldId} failed; will retry next scan.", world.Id);
            }
        }

        return fought;
    }

    /// <summary>Fights every tower attack due in <paramref name="worldId"/> at game instant <paramref name="now"/>.</summary>
    /// <returns>How many attacks were fought.</returns>
    public async Task<int> ProcessWorldAsync(Guid worldId, DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var towers = await LoadTowersAsync(worldId, cancellationToken).ConfigureAwait(false);
        if (towers.Count == 0)
        {
            return 0;
        }

        var camps = await _campService.LoadCampsAsync(worldId, now, cancellationToken: cancellationToken).ConfigureAwait(false);
        var strong = camps.Where(c => c.Camp.Strong).ToList();
        if (strong.Count == 0)
        {
            return 0;
        }

        var realm = await _campService.LoadRealmAsync(worldId, cancellationToken).ConfigureAwait(false);

        // A camp a building stands on is off the map and attacks nobody.
        var active = strong.Where(c => !realm.HasBuilding(c.Camp.Coord)).Select(c => (c.Camp, c.State)).ToList();
        var attacks = CampTowerThreat.Due(active, realm.InsideRealm, towers, now);

        foreach (var attack in attacks)
        {
            var state = active.First(c => c.Camp.Coord == attack.Camp.Coord).State;
            await FightAsync(worldId, attack, state, realm, now, cancellationToken).ConfigureAwait(false);
            _dbContext.ChangeTracker.Clear();
        }

        return attacks.Count;
    }

    /// <summary>
    /// Every tower of the world as a camp target: a finished tower (level 1 or more) is standing, even with an
    /// upgrade order on it; a level-0 stub with a started order is under construction since that start. A waiting
    /// order (not started) is not attacked.
    /// </summary>
    private async Task<List<CampTowerTarget>> LoadTowersAsync(Guid worldId, CancellationToken cancellationToken)
    {
        var settlements = await _dbContext.Settlements
            .AsNoTracking()
            .Where(s => s.WorldId == worldId)
            .Select(s => new
            {
                s.Id,
                Standing = s.Buildings
                    .Where(b => b.Type == BuildingType.Tower && b.Level >= 1)
                    .Select(b => new { b.Q, b.R })
                    .ToList(),
                Started = s.Queue
                    .Where(o => o.Type == BuildingType.Tower && o.StartedAt != null)
                    .Select(o => new { o.Q, o.R, o.StartedAt })
                    .ToList(),
            })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var targets = new List<CampTowerTarget>();
        foreach (var settlement in settlements)
        {
            var standing = settlement.Standing.Select(b => new HexCoord(b.Q, b.R)).ToHashSet();
            targets.AddRange(standing.Select(h => new CampTowerTarget(settlement.Id, h, CampTowerKind.Standing, null)));

            targets.AddRange(settlement.Started
                .GroupBy(o => new HexCoord(o.Q, o.R))
                .Where(g => !standing.Contains(g.Key))
                .Select(g => new CampTowerTarget(
                    settlement.Id, g.Key, CampTowerKind.UnderConstruction, g.Min(o => o.StartedAt))));
        }

        return targets;
    }

    private async Task FightAsync(
        Guid worldId, CampTowerAttack attack, CampState state, RealmIndex realm, DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var camp = attack.Camp;
        var tower = attack.Tower;

        var ownerId = await _dbContext.Settlements
            .Where(s => s.Id == tower.SettlementId)
            .Select(s => (Guid?)s.UserId)
            .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
        if (ownerId is null)
        {
            return;
        }

        var defenders = await LoadDefendersAsync(worldId, ownerId.Value, tower.Hex, now, cancellationToken).ConfigureAwait(false);
        var pooled = defenders
            .SelectMany(d => d.Stacks.Select(s => new UnitStack(s.UnitType, s.Count)))
            .GroupBy(s => s.Type)
            .Select(g => new UnitStack(g.Key, g.Sum(s => s.Count)))
            .OrderBy(s => s.Type)
            .ToList();

        var garrison = state.GarrisonAt(camp, now, realm.InsideRealm(camp.Coord));
        var effectiveLevel = state.EffectiveLevel(camp);
        var seed = Random.Shared.Next();
        var plan = CampBattleResolver.CampAttack(garrison, camp, pooled, seed);

        // The pooled losses go back to the armies in proportion to what each holds; an army left empty is gone.
        GuestArmyAllocation.ApplyLosses(defenders, plan.ArmyLosses);
        foreach (var army in defenders.Where(a => a.Stacks.Count == 0))
        {
            _dbContext.Armies.Remove(army);
        }

        var burned = false;
        if (plan.Winner == CampFightWinner.Camp)
        {
            burned = await _settlementService.BurnTowerAsync(tower.SettlementId, tower.Hex, now, cancellationToken).ConfigureAwait(false);
        }

        await _campService.UpsertStateAsync(
            worldId, camp.Coord, state.AfterFight(camp, now, plan.BeastSurvivors), cancellationToken).ConfigureAwait(false);

        var report = CampReport.From(
            Guid.CreateVersion7(), worldId, CampReportKind.Tower, now, camp, effectiveLevel,
            tower.SettlementId, defenders.FirstOrDefault()?.Id, pooled, garrison, plan, seed,
            towerCoord: tower.Hex, towerBurned: burned);
        _dbContext.CampReports.Add(CampReportEntity.FromDomain(report));

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "{Family} camp at {Camp} attacked the {Kind} tower at {Tower} of settlement {SettlementId}: {Winner} won "
                + "({DefensePower} vs {CampPower}), {Defenders} defending army(ies), tower burned: {Burned}.",
            camp.Family, camp.Coord, tower.Kind, tower.Hex, tower.SettlementId, plan.Winner,
            plan.ArmyPower, plan.CampPower, defenders.Count, burned);
    }

    /// <summary>
    /// The owner's armies standing on <paramref name="hex"/> at <paramref name="now"/>: arrived on an outbound leg
    /// whose destination is the hex and not yet turned around, land units only. Tracked, ordered by id.
    /// </summary>
    private async Task<List<ArmyEntity>> LoadDefendersAsync(
        Guid worldId, Guid ownerId, HexCoord hex, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var candidates = await _dbContext.Armies
            .Include(a => a.Stacks)
            .Where(a => a.Settlement!.WorldId == worldId
                && a.Settlement.UserId == ownerId
                && !a.AtHome
                && !a.IsSupporting
                && !a.IsReturning)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return
        [
            .. candidates
                .Where(a => IsStandingOn(a.ToDomain(), hex, now))
                .OrderBy(a => a.Id),
        ];
    }

    private static bool IsStandingOn(Army army, HexCoord hex, DateTimeOffset now) =>
        !army.IsFleet
        && army.Location is ArmyLocation.InTransit { Movement: { IsReturning: false } movement }
        && movement.ArrivesAt <= now
        && now < movement.TurnAroundAt
        && movement.Path[^1] == hex;
}
