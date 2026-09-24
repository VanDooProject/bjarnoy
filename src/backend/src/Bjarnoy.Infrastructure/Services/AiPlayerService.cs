using Bjarnoy.Domain.Ai;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Drives every AI player whose turn is due: builds an <see cref="AiSnapshot"/>,
/// runs the pure <see cref="AiPlanner"/>, and carries out each resulting
/// intent through the same service methods a real player uses — see
/// <c>docs/design/ai-players.md</c>'s "Execution" section.
/// </summary>
/// <remarks>
/// The actual work is here, not on <c>AiPlayersHostedService</c>, for the same
/// reason as <c>LeaderboardService.RunDueAggregationsAsync</c>: it needs to be
/// callable (and testable) directly, without waiting on a timer.
/// </remarks>
public sealed class AiPlayerService(
    GameDbContext dbContext,
    TimeProvider timeProvider,
    SettlementService settlementService,
    ArmyService armyService,
    AiTargetPolicy targetPolicy,
    IOptions<AiPlayersOptions> options,
    ILogger<AiPlayerService> logger)
{
    /// <summary>Jitter range applied on top of <see cref="AiPlayersOptions.ActInterval"/> — see <see cref="ScheduleNextActAsync"/>.</summary>
    private const double MaxJitterFraction = 0.2;

    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly SettlementService _settlementService = settlementService;
    private readonly ArmyService _armyService = armyService;
    private readonly AiTargetPolicy _targetPolicy = targetPolicy;
    private readonly AiPlayersOptions _options = options.Value;
    private readonly ILogger<AiPlayerService> _logger = logger;

    /// <summary>
    /// Plans and acts for every AI player whose <see cref="AiPlayerEntity.NextActAt"/>
    /// has passed. Returns how many settlements actually had at least one
    /// action carried out. A failure for one AI (or one of its settlements) is
    /// logged and skipped — it never stops the rest of the sweep.
    /// </summary>
    public async Task<int> RunDueAsync(CancellationToken cancellationToken = default)
    {
        if (!_options.Enabled)
        {
            return 0;
        }

        var now = _timeProvider.GetUtcNow();

        // EF Core's SQLite provider cannot translate a relational comparison
        // on a DateTimeOffset column (see UserActivityRetentionService's own
        // remarks) — load every AI player and filter NextActAt in memory,
        // same "load-and-compare" shape used throughout this codebase's
        // SQLite-targeting queries.
        var due = await _dbContext.AiPlayers
            .AsNoTracking()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var acted = 0;
        foreach (var ai in due.Where(a => a.NextActAt <= now))
        {
            try
            {
                if (await RunOneAsync(ai, now, cancellationToken).ConfigureAwait(false))
                {
                    acted++;
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "AI turn for user {UserId} failed; skipping.", ai.UserId);
            }
        }

        return acted;
    }

    private async Task<bool> RunOneAsync(AiPlayerEntity ai, DateTimeOffset wallNow, CancellationToken cancellationToken)
    {
        var world = await _dbContext.Worlds
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.Id == ai.WorldId, cancellationToken)
            .ConfigureAwait(false);

        if (world is null)
        {
            // The world is gone — nothing sensible to schedule; leave
            // NextActAt as-is rather than spinning on every sweep.
            return false;
        }

        var clock = world.ToClock();
        if (!clock.AllowsCommands)
        {
            // Paused/locked/maintenance: reschedule without acting, so this AI
            // is retried on the next sweep instead of being read as "stuck"
            // forever, but does nothing while the world cannot accept commands.
            await ScheduleNextActAsync(ai.UserId, wallNow, world.SpeedFactor, cancellationToken).ConfigureAwait(false);
            return false;
        }

        var settlementIds = await _dbContext.Settlements
            .AsNoTracking()
            .Where(s => s.UserId == ai.UserId && s.WorldId == ai.WorldId)
            .Select(s => s.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var riverTiles = await LoadRiverTilesAsync(ai.WorldId, cancellationToken).ConfigureAwait(false);
        var sampler = new TerrainSampler(world.ToGenerationOptions());
        var profile = AiProfiles.For(ai.Personality);

        var acted = false;
        foreach (var settlementId in settlementIds)
        {
            try
            {
                if (await ActForSettlementAsync(ai, world, clock, sampler, riverTiles, profile, settlementId, cancellationToken)
                    .ConfigureAwait(false))
                {
                    acted = true;
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(
                    ex, "AI turn for settlement {SettlementId} (user {UserId}) failed; skipping.",
                    settlementId, ai.UserId);
            }
        }

        await ScheduleNextActAsync(ai.UserId, wallNow, world.SpeedFactor, cancellationToken).ConfigureAwait(false);
        return acted;
    }

    private async Task<bool> ActForSettlementAsync(
        AiPlayerEntity ai,
        WorldEntity world,
        GameClock clock,
        TerrainSampler sampler,
        IReadOnlyDictionary<(int Q, int R), RiverTileShape> riverTiles,
        AiProfile profile,
        Guid settlementId,
        CancellationToken cancellationToken)
    {
        var planning = await _settlementService.GetSettledForPlanningAsync(settlementId, cancellationToken)
            .ConfigureAwait(false);
        if (planning is null)
        {
            return false;
        }

        var (settled, _, _) = planning.Value;
        var gameNow = clock.ToGameTime(_timeProvider.GetUtcNow());

        var claimedCoords = settled.ClaimDiscs
            .SelectMany(disc => disc.Centre.WithinRadius(disc.Radius))
            .Distinct()
            .ToList();

        var claimedHexes = claimedCoords
            .Select(coord => new AiHex(
                coord,
                sampler.TerrainAt(coord),
                sampler.IsCoastalWater(coord),
                riverTiles.TryGetValue((coord.Q, coord.R), out var shape) ? shape : null))
            .ToList();

        var hasShoreline = claimedCoords.Any(sampler.IsShoreline);
        var hasArmyAway = (await _armyService.GetForSettlementAsync(settlementId, cancellationToken).ConfigureAwait(false))
            .Any(a => !a.AtHome);

        var neighbours = await _targetPolicy
            .GetNeighboursAsync(ai.WorldId, ai.UserId, settled.Centre, cancellationToken)
            .ConfigureAwait(false);

        // Deterministic for a given (AI, tick): the same NextActAt value
        // never plans twice (it is always advanced before the next run), so
        // this needs no extra state of its own to stay reproducible.
        var seed = HashCode.Combine(ai.UserId, ai.NextActAt.UtcTicks);

        var snapshot = new AiSnapshot(
            settled,
            gameNow,
            world.SpeedFactor,
            claimedHexes,
            profile,
            ai.Objectives,
            neighbours,
            hasArmyAway,
            hasShoreline,
            seed);

        var actions = AiPlanner.Plan(snapshot);
        var actedOnAny = false;

        foreach (var action in actions)
        {
            var accepted = action switch
            {
                AiBuild build => await ExecuteBuildAsync(settlementId, build, cancellationToken).ConfigureAwait(false),
                AiTrain train => await ExecuteTrainAsync(settlementId, train, cancellationToken).ConfigureAwait(false),
                AiRaid raid => await ExecuteRaidAsync(settlementId, raid, cancellationToken).ConfigureAwait(false),
                _ => false,
            };

            actedOnAny |= accepted;
        }

        return actedOnAny;
    }

    private async Task<bool> ExecuteBuildAsync(Guid settlementId, AiBuild build, CancellationToken cancellationToken)
    {
        var result = await _settlementService.QueueBuildAsync(settlementId, build.Type, build.Coord, cancellationToken)
            .ConfigureAwait(false);

        if (!result.Accepted)
        {
            // The world changed between planning and execution (a race with a
            // human action, a resource drop from another AI's tick landing
            // first, etc.) — logged and skipped, never retried within this
            // tick; see AiAction's own remarks.
            _logger.LogInformation(
                "AI build of {Type} at {Coord} in settlement {SettlementId} was rejected: {Rejection}.",
                build.Type, build.Coord, settlementId, result.Rejection);
        }

        return result.Accepted;
    }

    private async Task<bool> ExecuteTrainAsync(Guid settlementId, AiTrain train, CancellationToken cancellationToken)
    {
        var result = await _settlementService.TrainUnitsAsync(settlementId, train.Unit, train.Count, cancellationToken)
            .ConfigureAwait(false);

        if (!result.Accepted)
        {
            _logger.LogInformation(
                "AI training of {Count}x {Unit} in settlement {SettlementId} was rejected: {Rejection}.",
                train.Count, train.Unit, settlementId, result.Rejection);
        }

        return result.Accepted;
    }

    private async Task<bool> ExecuteRaidAsync(Guid settlementId, AiRaid raid, CancellationToken cancellationToken)
    {
        // Provisions are voluntary and spent from food stock (Settlement.
        // PlanDispatch) — the raiding stack's full carry capacity is the
        // sensible amount to offer: enough for the whole round trip whenever
        // the settlement can afford it, and a plain InsufficientProvisionsForRoundTrip
        // rejection (logged and skipped, like any other) when it cannot.
        var provisions = raid.Units.Sum(s => UnitCatalogue.Get(s.Type).FoodCarryCapacity * s.Count);

        var result = await _armyService.DispatchAsync(
            settlementId,
            raid.Units,
            waypoints: [],
            destination: null,
            provisions,
            ArmyMission.Raid,
            targetSettlementId: raid.TargetSettlementId,
            cancellationToken: cancellationToken).ConfigureAwait(false);

        if (!result.Accepted)
        {
            _logger.LogInformation(
                "AI raid from settlement {SettlementId} against {TargetSettlementId} was rejected: {Rejection}.",
                settlementId, raid.TargetSettlementId, result.Rejection);
        }

        return result.Accepted;
    }

    /// <summary>
    /// Pushes <see cref="AiPlayerEntity.NextActAt"/> forward by
    /// <see cref="AiPlayersOptions.ActInterval"/>, scaled by the world's speed
    /// factor and a deterministic 0-20% jitter — see the design doc's
    /// "Execution" section. A plain <c>ExecuteUpdateAsync</c> keyed by id
    /// (equality, which translates on both providers) rather than a tracked
    /// write, so this never collides with any tracked entity the settlement
    /// actions above may have touched on this same scoped context.
    /// </summary>
    private async Task ScheduleNextActAsync(
        Guid aiUserId, DateTimeOffset wallNow, double speedFactor, CancellationToken cancellationToken)
    {
        var effectiveSpeed = speedFactor > 0 ? speedFactor : 1.0;
        var baseInterval = TimeSpan.FromTicks((long)(_options.ActInterval.Ticks / effectiveSpeed));

        var jitterSeed = HashCode.Combine(aiUserId, wallNow.UtcTicks);
        var jitterFraction = new Random(jitterSeed).NextDouble() * MaxJitterFraction;
        var jitter = TimeSpan.FromTicks((long)(baseInterval.Ticks * jitterFraction));

        var nextActAt = wallNow + baseInterval + jitter;

        await _dbContext.AiPlayers
            .Where(a => a.UserId == aiUserId)
            .ExecuteUpdateAsync(a => a.SetProperty(x => x.NextActAt, nextActAt), cancellationToken)
            .ConfigureAwait(false);
    }

    /// <summary>
    /// Every river tile in <paramref name="worldId"/>, keyed by coordinate —
    /// loaded once per AI turn rather than per claimed hex the way
    /// <c>SettlementService.RiverShapeAtAsync</c> does for a single build
    /// decision, since a settlement's claimed territory can run to dozens of
    /// hexes.
    /// </summary>
    private async Task<Dictionary<(int Q, int R), RiverTileShape>> LoadRiverTilesAsync(
        Guid worldId, CancellationToken cancellationToken)
    {
        var riverTileLists = await _dbContext.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId)
            .Select(i => i.RiverTiles)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var byCoord = new Dictionary<(int Q, int R), RiverTileShape>();
        foreach (var tile in riverTileLists.SelectMany(tiles => tiles))
        {
            byCoord[(tile.Q, tile.R)] = (RiverTileShape)tile.Shape;
        }

        return byCoord;
    }
}
