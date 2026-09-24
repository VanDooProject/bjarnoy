using Bjarnoy.Domain.Ai;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
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
        var profile = ApplyBuildingBias(AiProfiles.For(ai.Personality), ai.Personality);

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

    /// <summary>
    /// Folds <see cref="AiPlayersOptions.BuildingBias"/>'s entry for
    /// <paramref name="personality"/> (if any) onto <paramref name="profile"/>
    /// as its <see cref="AiProfile.BuildingBias"/> — see that property's
    /// remarks for what the planner does with it. Leaves the profile
    /// unchanged (empty/<see langword="null"/> bias) when the personality has
    /// no override configured, so this is a no-op for every deployment that
    /// never sets the section.
    /// </summary>
    private AiProfile ApplyBuildingBias(AiProfile profile, AiPersonality personality) =>
        _options.BuildingBias.TryGetValue(personality, out var bias) && bias.Count > 0
            ? profile with { BuildingBias = bias }
            : profile;

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

    /// <summary>One AI player plus the settlements it currently holds — the admin listing's row shape.</summary>
    public sealed record AiPlayerListItem(AiPlayerEntity AiPlayer, IReadOnlyList<SettlementEntity> Settlements);

    /// <summary>
    /// Every AI player in the database, with its user (for the display name)
    /// and its settlements, for the admin listing endpoint. Two extra queries
    /// total — one for the settlements, keyed by the AI user ids already
    /// loaded — rather than one query per AI player.
    /// </summary>
    public async Task<IReadOnlyList<AiPlayerListItem>> ListAsync(CancellationToken cancellationToken = default)
    {
        // Ordered in memory, not via the query (OrderBy(CreatedAt)): EF Core's
        // SQLite provider cannot translate an ORDER BY over a DateTimeOffset
        // column — same restriction as the load-and-compare queries elsewhere
        // in this file and in AiTakeoverService.
        var aiPlayers = (await _dbContext.AiPlayers
            .AsNoTracking()
            .Include(a => a.User)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false))
            .OrderBy(a => a.CreatedAt)
            .ToList();

        var userIds = aiPlayers.Select(a => a.UserId).ToList();
        var settlements = await _dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.Buildings)
            .Include(s => s.Garrison)
            .Include(s => s.Runes)
            .Where(s => userIds.Contains(s.UserId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var settlementsByUser = settlements
            .GroupBy(s => s.UserId)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<SettlementEntity>)[.. g]);

        return [.. aiPlayers.Select(a => new AiPlayerListItem(
            a, settlementsByUser.GetValueOrDefault(a.UserId, [])))];
    }

    /// <summary>
    /// One AI player, in the same shape <see cref="ListAsync"/> returns rows
    /// in — used to build the admin response right after a takeover or an
    /// update, rather than re-listing every AI player.
    /// </summary>
    public async Task<AiPlayerListItem?> GetAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var aiPlayer = await _dbContext.AiPlayers
            .AsNoTracking()
            .Include(a => a.User)
            .FirstOrDefaultAsync(a => a.UserId == userId, cancellationToken)
            .ConfigureAwait(false);

        if (aiPlayer is null)
        {
            return null;
        }

        var settlements = await _dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.Buildings)
            .Include(s => s.Garrison)
            .Include(s => s.Runes)
            .Where(s => s.UserId == userId)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new AiPlayerListItem(aiPlayer, settlements);
    }

    /// <summary>Why <see cref="UpdateAsync"/> did not apply an update.</summary>
    public enum AiPlayerUpdateOutcome
    {
        Applied,
        NotFound,
    }

    /// <summary>
    /// Replaces an AI player's personality and/or objective list — the admin
    /// "edit AI" endpoint. Either argument left <see langword="null"/> leaves
    /// that part unchanged; passing a personality does not reset the
    /// objective list to that personality's defaults (an admin who wants that
    /// sends both explicitly).
    /// </summary>
    public async Task<(AiPlayerUpdateOutcome Outcome, AiPlayerEntity? AiPlayer)> UpdateAsync(
        Guid userId,
        AiPersonality? personality,
        IReadOnlyList<AiObjective>? objectives,
        CancellationToken cancellationToken = default)
    {
        var aiPlayer = await _dbContext.AiPlayers
            .FirstOrDefaultAsync(a => a.UserId == userId, cancellationToken)
            .ConfigureAwait(false);

        if (aiPlayer is null)
        {
            return (AiPlayerUpdateOutcome.NotFound, null);
        }

        if (personality is { } newPersonality)
        {
            aiPlayer.Personality = newPersonality;
        }

        if (objectives is not null)
        {
            aiPlayer.Objectives = [.. objectives];
        }

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return (AiPlayerUpdateOutcome.Applied, aiPlayer);
    }

    /// <summary>
    /// The AI personality behind a user id, or <see langword="null"/> if that
    /// user is not an AI player — used to shape <c>isAi</c>/<c>aiPersonality</c>
    /// on a single settlement's response.
    /// </summary>
    public async Task<AiPersonality?> GetPersonalityForUserAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var aiPlayer = await _dbContext.AiPlayers
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.UserId == userId, cancellationToken)
            .ConfigureAwait(false);

        return aiPlayer?.Personality;
    }

    /// <summary>
    /// Every AI player's personality in one world, keyed by user id — one
    /// query for a whole world-map/settlement listing, rather than one lookup
    /// per settlement.
    /// </summary>
    public async Task<IReadOnlyDictionary<Guid, AiPersonality>> GetPersonalitiesForWorldAsync(
        Guid worldId, CancellationToken cancellationToken = default) =>
        await _dbContext.AiPlayers
            .AsNoTracking()
            .Where(a => a.WorldId == worldId)
            .ToDictionaryAsync(a => a.UserId, a => a.Personality, cancellationToken)
            .ConfigureAwait(false);
}
