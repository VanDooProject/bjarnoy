using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>Why founding a settlement was refused.</summary>
public enum FoundingRejection
{
    None = 0,
    WorldNotFound,
    IslandNotFound,
    WorldPaused,
    NotAStartPosition,
    PlotTaken,
    TooCloseToNeighbour,
    WorldFull,
    AlreadyFounded,
    WorldNotActive,
    JoinsClosed,
    NotStartedYet,
}

public sealed record FoundingResult(FoundingRejection Rejection, SettlementEntity? Settlement = null)
{
    public bool Accepted => Rejection == FoundingRejection.None && Settlement is not null;
}

public sealed record BuildResult(BuildRejection Rejection, BuildOrder? Order = null, bool WorldPaused = false)
{
    public bool Accepted => Rejection == BuildRejection.None && Order is not null;
}

/// <summary>A page of settlements matching an admin search.</summary>
public sealed record SettlementsPage(IReadOnlyList<SettlementEntity> Settlements, int TotalCount);

/// <summary>Outcome of an admin resource grant.</summary>
public enum GrantResourcesOutcome
{
    Applied,
    SettlementNotFound,
}

public sealed record GrantResourcesResult(
    GrantResourcesOutcome Outcome, SettlementEntity? Settlement = null, GameClock? Clock = null)
{
    public bool Accepted => Outcome == GrantResourcesOutcome.Applied && Settlement is not null;
}

/// <summary>Outcome of an admin's direct building-level set.</summary>
public enum SetBuildingLevelOutcome
{
    Applied,
    SettlementNotFound,
    BuildingNotFound,
    InvalidLevel,
}

public sealed record AdminSetBuildingLevelResult(
    SetBuildingLevelOutcome Outcome, SettlementEntity? Settlement = null, GameClock? Clock = null)
{
    public bool Accepted => Outcome == SetBuildingLevelOutcome.Applied && Settlement is not null;
}

/// <summary>
/// Settlements: founding them, reading them, and queueing builds in them.
/// </summary>
/// <remarks>
/// Every method converts wall time to game time through the world's
/// <see cref="GameClock"/> before touching the domain, so a paused world stops
/// producing and stops completing builds without any of the game rules knowing
/// that pausing exists.
/// </remarks>
public sealed class SettlementService(
    GameDbContext dbContext,
    TimeProvider timeProvider,
    ILogger<SettlementService> logger)
{
    /// <summary>Minimum hex distance between two settlements' centres.</summary>
    public const int MinimumSpacing = 3;

    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<SettlementService> _logger = logger;

    /// <summary>
    /// Founds a settlement on one of an island's precomputed start positions.
    /// </summary>
    public async Task<FoundingResult> FoundAsync(
        Guid worldId,
        Guid islandId,
        HexCoord coord,
        string name,
        string ownerName,
        string ownerId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerName);
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);

        var world = await _dbContext.Worlds
            .FirstOrDefaultAsync(w => w.Id == worldId, cancellationToken)
            .ConfigureAwait(false);

        if (world is null)
        {
            return new FoundingResult(FoundingRejection.WorldNotFound);
        }

        var clock = world.ToClock();
        if (!clock.AllowsCommands)
        {
            return new FoundingResult(FoundingRejection.WorldPaused);
        }

        var island = await _dbContext.Islands
            .FirstOrDefaultAsync(i => i.Id == islandId && i.WorldId == worldId, cancellationToken)
            .ConfigureAwait(false);

        if (island is null)
        {
            return new FoundingResult(FoundingRejection.IslandNotFound);
        }

        // Founding is restricted to the plots the generator already vetted, so
        // the terrain rules are enforced once at world creation rather than
        // re-derived per request.
        if (!island.StartPositions.Any(p => p.Q == coord.Q && p.R == coord.R))
        {
            return new FoundingResult(FoundingRejection.NotAStartPosition);
        }

        // One settlement per player per world — for now. Ships and carts will
        // one day let a player found a second one; until then this is a hard
        // rule, not just an unlikely-to-be-hit default.
        if (await AlreadyFoundedAsync(worldId, ownerId, cancellationToken).ConfigureAwait(false))
        {
            return new FoundingResult(FoundingRejection.AlreadyFounded);
        }

        var settlementCount = await _dbContext.Settlements
            .CountAsync(s => s.WorldId == worldId, cancellationToken).ConfigureAwait(false);

        // Same rule the public world listing derives from WorldEntity.DetermineJoinability,
        // so a world that stops accepting joins there also stops accepting them here.
        var joinability = world.DetermineJoinability(settlementCount, _timeProvider.GetUtcNow());
        if (!joinability.Joinable)
        {
            return new FoundingResult(joinability.Reason switch
            {
                JoinableReason.WorldNotActive => FoundingRejection.WorldNotActive,
                JoinableReason.JoinsClosed => FoundingRejection.JoinsClosed,
                JoinableReason.NotStartedYet => FoundingRejection.NotStartedYet,
                JoinableReason.Full => FoundingRejection.WorldFull,
                _ => FoundingRejection.WorldFull,
            });
        }

        // Spacing is checked in memory against this world's centres: the
        // distance is hex distance, which SQL cannot express portably.
        var centres = await _dbContext.Settlements
            .Where(s => s.WorldId == worldId)
            .Select(s => new { s.CentreQ, s.CentreR })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        foreach (var centre in centres)
        {
            var distance = coord.DistanceTo(new HexCoord(centre.CentreQ, centre.CentreR));
            if (distance == 0)
            {
                return new FoundingResult(FoundingRejection.PlotTaken);
            }

            if (distance < MinimumSpacing)
            {
                return new FoundingResult(FoundingRejection.TooCloseToNeighbour);
            }
        }

        var now = clock.ToGameTime(_timeProvider.GetUtcNow());
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        production *= world.SpeedFactor;

        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            Name = name,
            OwnerName = ownerName,
            OwnerId = ownerId,
            // Anonymous founding — the only path today — has no real account
            // yet, but UserId is required, so it starts out owned by the
            // reserved "Abandoned" system user. AuthService.RegisterAsync
            // reassigns it to a real account when the client later registers
            // with this same OwnerId.
            UserId = SystemUserIds.Abandoned,
            FoundedAt = now,
        };

        settlement.ApplyDomain(new Settlement
        {
            Id = settlement.Id,
            Name = name,
            Centre = coord,
            Buildings = [new PlacedBuilding(coord, BuildingType.Longhouse, 1)],
            Resources = ResourcePool.Create(
                BuildingCatalogue.FoundingStock, production, capacity, now),
        });

        _dbContext.Settlements.Add(settlement);

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException)
        {
            // Two requests raced (same plot, or the same player founding
            // twice). The unique indexes are what actually decided it, so
            // re-read to see which one before reporting it as such.
            _dbContext.Entry(settlement).State = EntityState.Detached;

            if (await PlotTakenAsync(worldId, coord, cancellationToken).ConfigureAwait(false))
            {
                return new FoundingResult(FoundingRejection.PlotTaken);
            }

            if (await AlreadyFoundedAsync(worldId, ownerId, cancellationToken).ConfigureAwait(false))
            {
                return new FoundingResult(FoundingRejection.AlreadyFounded);
            }

            throw;
        }

        _logger.LogInformation(
            "Settlement {Name} ({Id}) founded at {Coord} on island {IslandId}.",
            name, settlement.Id, coord, islandId);

        return new FoundingResult(FoundingRejection.None, settlement);
    }

    /// <summary>
    /// Loads a settlement as of now, applying anything its queue owed.
    /// </summary>
    /// <remarks>
    /// A read that finds nothing due writes nothing: <c>SettleTo</c> reports
    /// <c>Changed = false</c> and this returns without calling
    /// <c>SaveChanges</c>. That is the property the whole design rests on — see
    /// <c>docs/tech/backend.md</c>.
    /// </remarks>
    public async Task<(SettlementEntity Settlement, GameClock Clock)?> GetAsync(
        Guid settlementId,
        CancellationToken cancellationToken = default)
    {
        var settlement = await LoadAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (settlement?.World is null)
        {
            return null;
        }

        var clock = settlement.World.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        var result = settlement.ToDomain().SettleTo(now, settlement.World.SpeedFactor);
        if (result.Changed)
        {
            settlement.ApplyDomain(result.Settlement);
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            _logger.LogInformation(
                "Settlement {Id} completed {Count} queued build(s) on read.",
                settlementId, result.Completed.Count);
        }

        return (settlement, clock);
    }

    /// <summary>Admin search: settlements by world and/or owner name, paged.</summary>
    public async Task<SettlementsPage> SearchAsync(
        Guid? worldId,
        string? owner,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var query = _dbContext.Settlements.AsNoTracking().Include(s => s.World).Include(s => s.Buildings).AsQueryable();

        if (worldId is { } world)
        {
            query = query.Where(s => s.WorldId == world);
        }

        if (!string.IsNullOrWhiteSpace(owner))
        {
            var term = owner.Trim().ToLowerInvariant();
            query = query.Where(s => s.OwnerName.ToLower().Contains(term));
        }

        var totalCount = await query.CountAsync(cancellationToken).ConfigureAwait(false);

        // Guid v7 sorts time-ordered — same stable paging key UserService.GetUsersAsync uses.
        var settlements = await query
            .OrderBy(s => s.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return new SettlementsPage(settlements, totalCount);
    }

    /// <summary>
    /// Admin god-mode: grants (or, with a negative component, removes) a
    /// signed resource delta, settling the pool to now first so accrued
    /// production since the last settle is neither lost nor misapplied.
    /// </summary>
    public async Task<GrantResourcesResult> GrantResourcesAsync(
        Guid settlementId,
        ResourceAmounts delta,
        CancellationToken cancellationToken = default)
    {
        var settlement = await LoadAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (settlement?.World is null)
        {
            return new GrantResourcesResult(GrantResourcesOutcome.SettlementNotFound);
        }

        var clock = settlement.World.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        var settled = settlement.ToDomain().SettleTo(now, settlement.World.SpeedFactor).Settlement;
        var granted = settled with { Resources = settled.Resources.Adjust(delta, now) };

        settlement.ApplyDomain(granted);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Admin granted {Delta} to settlement {Id}.", delta, settlementId);

        return new GrantResourcesResult(GrantResourcesOutcome.Applied, settlement, clock);
    }

    /// <summary>
    /// Admin god-mode: sets a placed building's level directly, settling the
    /// settlement to now first so the rate recalculation applies from now
    /// onward rather than retroactively.
    /// </summary>
    public async Task<AdminSetBuildingLevelResult> SetBuildingLevelAsync(
        Guid settlementId,
        HexCoord coord,
        int level,
        CancellationToken cancellationToken = default)
    {
        var settlement = await LoadAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (settlement?.World is null)
        {
            return new AdminSetBuildingLevelResult(SetBuildingLevelOutcome.SettlementNotFound);
        }

        var clock = settlement.World.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        var settled = settlement.ToDomain().SettleTo(now, settlement.World.SpeedFactor).Settlement;
        var result = settled.SetBuildingLevel(coord, level, now, settlement.World.SpeedFactor);

        if (!result.Accepted)
        {
            var outcome = result.Rejection switch
            {
                SetBuildingLevelRejection.BuildingNotFound => SetBuildingLevelOutcome.BuildingNotFound,
                SetBuildingLevelRejection.InvalidLevel => SetBuildingLevelOutcome.InvalidLevel,
                _ => SetBuildingLevelOutcome.BuildingNotFound,
            };

            // A rejected set may still have completed due builds while
            // settling, which is a real change worth keeping.
            await PersistIfSettledAsync(settlement, settled, now, cancellationToken).ConfigureAwait(false);
            return new AdminSetBuildingLevelResult(outcome);
        }

        settlement.ApplyDomain(result.Settlement!);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Admin set building at {Coord} in settlement {Id} to level {Level}.", coord, settlementId, level);

        return new AdminSetBuildingLevelResult(SetBuildingLevelOutcome.Applied, settlement, clock);
    }

    public Task<List<SettlementEntity>> GetForWorldAsync(
        Guid worldId, CancellationToken cancellationToken = default) =>
        _dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.Buildings)
            .Where(s => s.WorldId == worldId)
            .OrderBy(s => s.Id)
            .ToListAsync(cancellationToken);

    /// <summary>Queues a build, charging for it up front.</summary>
    public async Task<BuildResult> QueueBuildAsync(
        Guid settlementId,
        BuildingType type,
        HexCoord coord,
        CancellationToken cancellationToken = default)
    {
        var settlement = await LoadAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (settlement?.World is null)
        {
            return new BuildResult(BuildRejection.UnknownBuildingLevel);
        }

        var clock = settlement.World.ToClock();
        if (!clock.AllowsCommands)
        {
            return new BuildResult(BuildRejection.None, null, WorldPaused: true);
        }

        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        // Settle first so the decision sees the queue and stock as of now: a
        // build that finished a minute ago must free its slot and count towards
        // production.
        var settled = settlement.ToDomain().SettleTo(now, settlement.World.SpeedFactor).Settlement;

        var sampler = new TerrainSampler(settlement.World.ToGenerationOptions());
        var terrain = sampler.TerrainAt(coord);
        var decision = settled.PlanBuild(
            type, coord, terrain, now, Guid.CreateVersion7(),
            settlement.World.SpeedFactor, sampler.IsCoastalWater(coord));

        if (!decision.Accepted)
        {
            // Even a refused build may have completed work while settling, and
            // that is a real change worth keeping.
            await PersistIfSettledAsync(settlement, settled, now, cancellationToken)
                .ConfigureAwait(false);
            return new BuildResult(decision.Rejection);
        }

        settlement.ApplyDomain(settled.Enqueue(decision.Order!, now));
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Settlement {Id} queued {Type} level {Level} at {Coord}, completing {CompletesAt}.",
            settlementId, type, decision.Order!.TargetLevel, coord, decision.Order.CompletesAt);

        return new BuildResult(BuildRejection.None, decision.Order);
    }

    /// <summary>
    /// Re-rates every settlement in a world for a changed speed factor: each is
    /// settled to "now" under the old factor first — so builds already due and
    /// resources already accrued are locked in exactly as they were — and only
    /// then re-rated to produce at the new factor from now on.
    /// </summary>
    /// <remarks>
    /// Called by the admin settings endpoint before the new
    /// <see cref="WorldEntity.SpeedFactor"/> is persisted on the world; without
    /// this, a settlement's stored <c>RatePerHour</c> would keep the old
    /// factor baked in until its next building completion happened to
    /// recompute it.
    /// </remarks>
    public async Task RetuneSpeedAsync(
        Guid worldId,
        double oldFactor,
        double newFactor,
        CancellationToken cancellationToken = default)
    {
        var world = await _dbContext.Worlds
            .FirstOrDefaultAsync(w => w.Id == worldId, cancellationToken).ConfigureAwait(false);

        if (world is null)
        {
            return;
        }

        var clock = world.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        var settlements = await _dbContext.Settlements
            .Include(s => s.Buildings)
            .Include(s => s.Queue)
            .Where(s => s.WorldId == worldId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        foreach (var entity in settlements)
        {
            var settled = entity.ToDomain().SettleTo(now, oldFactor).Settlement;
            var (production, capacity) = settled.CurrentTotals(newFactor);
            entity.ApplyDomain(settled with { Resources = settled.Resources.WithRate(production, capacity, now) });
        }

        if (settlements.Count > 0)
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }

        _logger.LogInformation(
            "World {WorldId} retuned from speed {Old} to {New} across {Count} settlement(s).",
            worldId, oldFactor, newFactor, settlements.Count);
    }

    /// <summary>Moves a world between run states, optionally crediting grace.</summary>
    public async Task<WorldEntity?> SetRunStateAsync(
        Guid worldId,
        WorldRunState state,
        TimeSpan grace = default,
        CancellationToken cancellationToken = default)
    {
        var world = await _dbContext.Worlds
            .FirstOrDefaultAsync(w => w.Id == worldId, cancellationToken).ConfigureAwait(false);

        if (world is null)
        {
            return null;
        }

        var before = world.ToClock();
        var after = before.TransitionTo(state, _timeProvider.GetUtcNow(), grace);
        world.ApplyClock(after);

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "World {WorldId} moved from {From} to {To}; clock offset now {Offset}.",
            worldId, before.State, after.State, after.AccumulatedOffset);

        return world;
    }

    private Task<SettlementEntity?> LoadAsync(Guid settlementId, CancellationToken cancellationToken) =>
        _dbContext.Settlements
            .Include(s => s.World)
            .Include(s => s.Buildings)
            .Include(s => s.Queue)
            .FirstOrDefaultAsync(s => s.Id == settlementId, cancellationToken);

    private async Task PersistIfSettledAsync(
        SettlementEntity entity,
        Settlement settled,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (settled.Resources.SettledAt == entity.SettledAt && settled.Queue.Count == entity.Queue.Count)
        {
            return;
        }

        entity.ApplyDomain(settled);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }

    private Task<bool> PlotTakenAsync(Guid worldId, HexCoord coord, CancellationToken cancellationToken) =>
        _dbContext.Settlements.AnyAsync(
            s => s.WorldId == worldId && s.CentreQ == coord.Q && s.CentreR == coord.R,
            cancellationToken);

    private Task<bool> AlreadyFoundedAsync(Guid worldId, string ownerId, CancellationToken cancellationToken) =>
        _dbContext.Settlements.AnyAsync(
            s => s.WorldId == worldId && s.OwnerId == ownerId,
            cancellationToken);
}
