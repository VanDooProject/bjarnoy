using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.Shrines;
using Bjarnoy.Domain.Units;
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

public sealed record CancelBuildResult(CancelBuildRejection Rejection, bool WorldPaused = false)
{
    public bool Accepted => Rejection == CancelBuildRejection.None && !WorldPaused;
}

public sealed record TrainResult(TrainRejection Rejection, TrainingOrder? Order = null, bool WorldPaused = false)
{
    public bool Accepted => Rejection == TrainRejection.None && Order is not null;
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

/// <summary>Outcome of a rune grant, slot, or unslot (issue #53).</summary>
public enum RuneOutcome
{
    Applied,
    SettlementNotFound,
    RuneNotFound,
    RuneAlreadySlotted,
    RuneNotSlotted,
    NoShrineOnHex,
    ShrineSlotsFull,
}

public sealed record RuneResult(RuneOutcome Outcome, SettlementEntity? Settlement = null, GameClock? Clock = null)
{
    public bool Accepted => Outcome == RuneOutcome.Applied && Settlement is not null;
}

/// <summary>How an admin god-mode edit ended.</summary>
public enum AdminEditOutcome
{
    Applied,
    SettlementNotFound,

    /// <summary>The settlement exists but the edit itself was refused; see the accompanying rejection.</summary>
    Rejected,
}

public sealed record AdminBuildingEditServiceResult(
    AdminEditOutcome Outcome,
    AdminBuildingEditRejection Rejection = AdminBuildingEditRejection.None,
    SettlementEntity? Settlement = null,
    GameClock? Clock = null)
{
    public bool Accepted => Outcome == AdminEditOutcome.Applied && Settlement is not null;
}

public sealed record AdminGarrisonEditServiceResult(
    AdminEditOutcome Outcome,
    AdminGarrisonEditRejection Rejection = AdminGarrisonEditRejection.None,
    SettlementEntity? Settlement = null,
    GameClock? Clock = null)
{
    public bool Accepted => Outcome == AdminEditOutcome.Applied && Settlement is not null;
}

/// <summary>Outcome of an admin's "finish everything queued, now".</summary>
public sealed record CompleteQueuesResult(
    SettlementEntity? Settlement = null,
    GameClock? Clock = null,
    int CompletedBuilds = 0,
    int CompletedTraining = 0)
{
    public bool Accepted => Settlement is not null;
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
    /// <summary>
    /// Founding's cheap, longhouse-only pre-filter: the minimum hex distance
    /// between two settlements' <em>centres</em> that lets a candidate skip
    /// straight past the real per-neighbour territory check
    /// (<see cref="FoundAsync"/>'s "phase 2", below) without loading anyone's
    /// building list. Sized so that even if both settlements' longhouses
    /// reach <see cref="BuildingCatalogue.MaxLevel"/>, their <em>centre
    /// discs alone</em> (<see cref="Settlement.MaxClaimRadius"/>) can never
    /// overlap.
    /// </summary>
    /// <remarks>
    /// This is deliberately <em>not</em> sized to also cover Tower satellite
    /// discs the way an earlier version of this constant tried to: once
    /// chaining a tower's placement through another tower's own disc is
    /// allowed (<see cref="Settlement.Claims"/>'s remarks), a settlement's
    /// full territory has no fixed ceiling to derive a safe static distance
    /// from — a long enough chain can in principle reach arbitrarily far
    /// from centre. So founding's real safety net is a second, live check
    /// (phase 2 in <see cref="FoundAsync"/>): after this cheap distance
    /// filter passes, every nearby settlement's <em>actual current</em>
    /// buildings are checked against the candidate via
    /// <see cref="Settlement.ClaimDiscsFor"/>, towers included, plus a small
    /// fixed safety margin. This constant only ever short-circuits the
    /// obviously-too-close case before that real check has to run — it is
    /// not itself a completeness guarantee.
    /// </remarks>
    public static readonly int MinimumSpacing = (2 * Settlement.MaxClaimRadius) + 1;

    /// <summary>
    /// Fixed safety cushion (in hexes) phase 2 of <see cref="FoundAsync"/>'s
    /// spacing check adds on top of a neighbour's real, computed claim-disc
    /// edge — a candidate landing this close to (not just strictly inside)
    /// a neighbour's actual territory is still refused, so a settlement's
    /// border always has a little room to grow into before it can ever touch
    /// a founding-time neighbour.
    /// </summary>
    public const int FoundingSafetyMargin = 2;

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

        // Spacing is checked in memory against this island's settlements: the
        // distance is hex distance, which SQL cannot express portably.
        // Scoped to the same island, not the whole world — two settlements
        // on different islands are always separated by open sea, so their
        // claim discs (see Settlement.ClaimDiscs) can never actually
        // overlap any land either could claim no matter how far apart (or
        // close) the islands themselves happen to be. Checking world-wide
        // would reject perfectly fine foundings on two nearby-but-separate
        // islands purely because MinimumSpacing is sized for the same-island
        // case (see that constant's own comment).
        //
        // Two phases, per neighbour, in one pass over one query (buildings
        // come along so phase 2 never needs a second round trip):
        //   1. Cheap centre-to-centre distance filter (MinimumSpacing) —
        //      catches the obviously-too-close case without needing to
        //      reason about anyone's buildings.
        //   2. The real check: does the candidate actually sit inside (or
        //      within FoundingSafetyMargin of) this neighbour's *current*
        //      claimed territory — Settlement.ClaimDiscsFor, towers and any
        //      tower chain included? Phase 1 alone cannot catch this: a
        //      neighbour whose towers chain out past MinimumSpacing's own
        //      centre-only radius can still have real territory reaching a
        //      candidate phase 1 would have waved through.
        // Only a candidate clearing both phases against every neighbour is
        // accepted.
        var neighbours = await _dbContext.Settlements
            .Where(s => s.WorldId == worldId && s.IslandId == islandId)
            .Select(s => new
            {
                s.CentreQ,
                s.CentreR,
                Buildings = s.Buildings.Select(b => new { b.Q, b.R, b.Type, b.Level }).ToList(),
            })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        foreach (var neighbour in neighbours)
        {
            var neighbourCentre = new HexCoord(neighbour.CentreQ, neighbour.CentreR);
            var distance = coord.DistanceTo(neighbourCentre);
            if (distance == 0)
            {
                return new FoundingResult(FoundingRejection.PlotTaken);
            }

            if (distance < MinimumSpacing)
            {
                return new FoundingResult(FoundingRejection.TooCloseToNeighbour);
            }

            var neighbourBuildings = neighbour.Buildings
                .Select(b => new PlacedBuilding(new HexCoord(b.Q, b.R), b.Type, b.Level))
                .ToList();
            var withinRealTerritory = Settlement.ClaimDiscsFor(neighbourCentre, neighbourBuildings)
                .Any(disc => disc.Centre.DistanceTo(coord) <= disc.Radius + FoundingSafetyMargin);
            if (withinRealTerritory)
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
    /// Founds a new settlement from a settler-crew convoy's arrival (issue
    /// #55 §5) — the second-and-onward-settlement counterpart to
    /// <see cref="FoundAsync"/>'s first-settlement flow, reusing the same
    /// starting shape (a Lv 1 Longhouse, <see cref="BuildingCatalogue.FoundingStock"/>)
    /// but skipping the start-position/joinability/one-per-world checks that
    /// only apply to a brand-new player joining a world — <c>ArmyService.
    /// ResolveFoundingAsync</c> has already re-validated the target hex is
    /// still foundable before calling this. Real, relational
    /// <paramref name="userId"/> ownership from the start (unlike anonymous
    /// founding's <c>SystemUserIds.Abandoned</c> fallback) — a founding
    /// convoy can only ever have been dispatched by an already-real account
    /// (see <c>ArmyService.DispatchAsync</c>'s Found-specific check).
    /// </summary>
    public async Task<SettlementEntity> FoundFromConvoyAsync(
        Guid worldId,
        HexCoord coord,
        Guid userId,
        string ownerName,
        string ownerId,
        string name,
        IReadOnlyList<UnitStack> startingGarrison,
        DateTimeOffset now,
        double speedFactor,
        CancellationToken cancellationToken = default)
    {
        // No tile-membership index exists per hex (see IslandEntity's
        // remarks) — the nearest island by centre is a reasonable, purely
        // decorative approximation (island name/grouping only; nothing
        // gameplay-relevant reads a settlement's IslandId today beyond that).
        var islands = await _dbContext.Islands
            .Where(i => i.WorldId == worldId)
            .Select(i => new { i.Id, i.CentreQ, i.CentreR })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var islandId = islands
            .OrderBy(i => coord.DistanceTo(new HexCoord(i.CentreQ, i.CentreR)))
            .Select(i => i.Id)
            .FirstOrDefault();

        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        production *= speedFactor;

        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            Name = name,
            OwnerName = ownerName,
            OwnerId = ownerId,
            UserId = userId,
            FoundedAt = now,
        };

        settlement.ApplyDomain(new Settlement
        {
            Id = settlement.Id,
            Name = name,
            Centre = coord,
            Buildings = [new PlacedBuilding(coord, BuildingType.Longhouse, 1)],
            Garrison = startingGarrison,
            Resources = ResourcePool.Create(BuildingCatalogue.FoundingStock, production, capacity, now),
        });

        _dbContext.Settlements.Add(settlement);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Settlement {Name} ({Id}) founded at {Coord} by settler convoy for user {UserId}.",
            name, settlement.Id, coord, userId);

        return settlement;
    }

    /// <summary>
    /// How many settlements <paramref name="userId"/> already holds in
    /// <paramref name="worldId"/> — the "existing settlement count" both
    /// <c>Settlers.RenownThresholds.AllowsAnotherSettlement</c> and
    /// <c>Settlers.Founding.CostMultiplier</c> scale against (issue #55 §3/§4).
    /// </summary>
    public Task<int> GetSettlementCountAsync(Guid userId, Guid worldId, CancellationToken cancellationToken = default) =>
        _dbContext.Settlements.CountAsync(s => s.UserId == userId && s.WorldId == worldId, cancellationToken);

    /// <summary>
    /// Every claimed settlement in <paramref name="worldId"/> — yours or
    /// another player's — as a (centre, claim radius) pair, for
    /// <c>Settlers.Founding.IsHexFoundable</c>'s spacing check (issue #55 §4).
    /// Longhouse level is fetched alongside centre in one query, mirroring
    /// <c>ArmyService.DispatchAsync</c>'s own target-claim-radius lookup for
    /// Attack/Support fleet dispatch.
    /// </summary>
    public async Task<IReadOnlyList<(HexCoord Centre, int ClaimRadius)>> GetClaimedSettlementsAsync(
        Guid worldId, CancellationToken cancellationToken = default)
    {
        var rows = await _dbContext.Settlements
            .AsNoTracking()
            .Where(s => s.WorldId == worldId)
            .Select(s => new
            {
                s.CentreQ,
                s.CentreR,
                LonghouseLevel = s.Buildings
                    .Where(b => b.Type == BuildingType.Longhouse)
                    .Select(b => (int?)b.Level)
                    .Max() ?? 0,
            })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return [.. rows.Select(r => (new HexCoord(r.CentreQ, r.CentreR), Settlement.ClaimRadiusForLonghouseLevel(r.LonghouseLevel)))];
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

        var (_, result, guestArmies) = await SettleWithGuestsAsync(
            settlement, now, settlement.World.SpeedFactor, cancellationToken).ConfigureAwait(false);
        if (result.Changed)
        {
            settlement.ApplyDomain(result.Settlement);
            ApplyGuestDeaths(guestArmies, result.GuestDeaths);
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            _logger.LogInformation(
                "Settlement {Id} completed {Count} queued build(s) on read.",
                settlementId, result.Completed.Count);
        }

        return (settlement, clock);
    }

    /// <summary>
    /// A settlement's real owner (<see cref="SettlementEntity.UserId"/>) and
    /// client-local owner id (<see cref="SettlementEntity.OwnerId"/>) — a
    /// lightweight projection for the ownership-authorization endpoint
    /// filters (<c>Bjarnoy.Api.Auth.OwnershipGate</c>), not a full load. Null
    /// if no such settlement exists.
    /// </summary>
    public async Task<(Guid UserId, string OwnerId)?> GetOwnershipAsync(
        Guid settlementId, CancellationToken cancellationToken = default)
    {
        var ownership = await _dbContext.Settlements
            .Where(s => s.Id == settlementId)
            .Select(s => new { s.UserId, s.OwnerId })
            .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

        return ownership is null ? null : (ownership.UserId, ownership.OwnerId);
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

        var (settled, result, guestArmies) = await SettleWithGuestsAsync(
            settlement, now, settlement.World.SpeedFactor, cancellationToken).ConfigureAwait(false);
        var granted = settled with { Resources = settled.Resources.Adjust(delta, now) };

        settlement.ApplyDomain(granted);
        ApplyGuestDeaths(guestArmies, result.GuestDeaths);
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

        var (settled, settleResult, guestArmies) = await SettleWithGuestsAsync(
            settlement, now, settlement.World.SpeedFactor, cancellationToken).ConfigureAwait(false);
        var guestStacks = AggregateStacks(guestArmies.SelectMany(a => a.Stacks.Select(s => new UnitStack(s.UnitType, s.Count))));
        var result = settled.SetBuildingLevel(
            coord, level, now, settlement.World.SpeedFactor, guestStacks, TerrainAt(settlement.World));

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
            await PersistIfSettledAsync(settlement, settleResult, guestArmies, cancellationToken).ConfigureAwait(false);
            return new AdminSetBuildingLevelResult(outcome);
        }

        settlement.ApplyDomain(result.Settlement!);
        ApplyGuestDeaths(guestArmies, settleResult.GuestDeaths);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Admin set building at {Coord} in settlement {Id} to level {Level}.", coord, settlementId, level);

        return new AdminSetBuildingLevelResult(SetBuildingLevelOutcome.Applied, settlement, clock);
    }

    /// <summary>
    /// Admin/dev god-mode: grants a rune of the given type and rarity to a
    /// settlement's storage, unslotted. Stand-in for a real acquisition
    /// source (hex finds, raid loot, offerings — issue #53), which does not
    /// exist yet.
    /// </summary>
    public async Task<RuneResult> GrantRuneAsync(
        Guid settlementId, RuneType type, RuneRarity rarity, CancellationToken cancellationToken = default)
    {
        var settlement = await LoadAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (settlement?.World is null)
        {
            return new RuneResult(RuneOutcome.SettlementNotFound);
        }

        var clock = settlement.World.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        var (settled, result, guestArmies) = await SettleWithGuestsAsync(
            settlement, now, settlement.World.SpeedFactor, cancellationToken).ConfigureAwait(false);
        var granted = settled.GrantRune(new RuneInstance { Id = Guid.CreateVersion7(), Type = type, Rarity = rarity });

        settlement.ApplyDomain(granted);
        ApplyGuestDeaths(guestArmies, result.GuestDeaths);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Granted a {Rarity} {Type} rune to settlement {Id}.", rarity, type, settlementId);

        return new RuneResult(RuneOutcome.Applied, settlement, clock);
    }

    /// <summary>Slots an unslotted rune into the shrine standing on <paramref name="shrineCoord"/>.</summary>
    public async Task<RuneResult> SlotRuneAsync(
        Guid settlementId, Guid runeId, HexCoord shrineCoord, CancellationToken cancellationToken = default)
    {
        var settlement = await LoadAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (settlement?.World is null)
        {
            return new RuneResult(RuneOutcome.SettlementNotFound);
        }

        var clock = settlement.World.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        var (settled, settleResult, guestArmies) = await SettleWithGuestsAsync(
            settlement, now, settlement.World.SpeedFactor, cancellationToken).ConfigureAwait(false);
        var guestStacks = AggregateStacks(guestArmies.SelectMany(a => a.Stacks.Select(s => new UnitStack(s.UnitType, s.Count))));
        var result = settled.SlotRune(
            runeId, shrineCoord, now, settlement.World.SpeedFactor, guestStacks, TerrainAt(settlement.World));

        if (!result.Accepted)
        {
            var outcome = result.Rejection switch
            {
                SlotRuneRejection.RuneNotFound => RuneOutcome.RuneNotFound,
                SlotRuneRejection.RuneAlreadySlotted => RuneOutcome.RuneAlreadySlotted,
                SlotRuneRejection.NoShrineOnHex => RuneOutcome.NoShrineOnHex,
                SlotRuneRejection.ShrineSlotsFull => RuneOutcome.ShrineSlotsFull,
                _ => RuneOutcome.RuneNotFound,
            };

            // A rejected slot may still have completed due builds while
            // settling, which is a real change worth keeping.
            await PersistIfSettledAsync(settlement, settleResult, guestArmies, cancellationToken).ConfigureAwait(false);
            return new RuneResult(outcome);
        }

        settlement.ApplyDomain(result.Settlement!);
        ApplyGuestDeaths(guestArmies, settleResult.GuestDeaths);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return new RuneResult(RuneOutcome.Applied, settlement, clock);
    }

    /// <summary>Returns a slotted rune to storage.</summary>
    public async Task<RuneResult> UnslotRuneAsync(
        Guid settlementId, Guid runeId, CancellationToken cancellationToken = default)
    {
        var settlement = await LoadAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (settlement?.World is null)
        {
            return new RuneResult(RuneOutcome.SettlementNotFound);
        }

        var clock = settlement.World.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        var (settled, settleResult, guestArmies) = await SettleWithGuestsAsync(
            settlement, now, settlement.World.SpeedFactor, cancellationToken).ConfigureAwait(false);
        var guestStacks = AggregateStacks(guestArmies.SelectMany(a => a.Stacks.Select(s => new UnitStack(s.UnitType, s.Count))));
        var result = settled.UnslotRune(
            runeId, now, settlement.World.SpeedFactor, guestStacks, TerrainAt(settlement.World));

        if (!result.Accepted)
        {
            var outcome = result.Rejection switch
            {
                UnslotRuneRejection.RuneNotFound => RuneOutcome.RuneNotFound,
                UnslotRuneRejection.RuneNotSlotted => RuneOutcome.RuneNotSlotted,
                _ => RuneOutcome.RuneNotFound,
            };

            await PersistIfSettledAsync(settlement, settleResult, guestArmies, cancellationToken).ConfigureAwait(false);
            return new RuneResult(outcome);
        }

        settlement.ApplyDomain(result.Settlement!);
        ApplyGuestDeaths(guestArmies, settleResult.GuestDeaths);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return new RuneResult(RuneOutcome.Applied, settlement, clock);
    }

    /// <summary>
    /// Admin god-mode "instant build": marks every still-pending build (and,
    /// optionally, training) order as due right now and then settles, so the
    /// completions land through the ordinary
    /// <see cref="Settlement.SettleTo"/> path — same rate recalculation, same
    /// chronological merge, same starvation pass.
    /// </summary>
    public async Task<CompleteQueuesResult> CompleteQueuesAsync(
        Guid settlementId,
        bool builds = true,
        bool training = true,
        CancellationToken cancellationToken = default)
    {
        var settlement = await LoadAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (settlement?.World is null)
        {
            return new CompleteQueuesResult();
        }

        var clock = settlement.World.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        var guestArmies = await _dbContext.Armies
            .Include(a => a.Stacks)
            .Where(a => a.IsSupporting && a.TargetSettlementId == settlement.Id)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var guestStacks = AggregateStacks(
            guestArmies.SelectMany(a => a.Stacks.Select(s => new UnitStack(s.UnitType, s.Count))));

        var result = settlement.ToDomain()
            .WithQueuesDueAt(now, builds, training)
            .SettleTo(now, settlement.World.SpeedFactor, guestStacks, TerrainAt(settlement.World));

        if (result.Changed)
        {
            settlement.ApplyDomain(result.Settlement);
            ApplyGuestDeaths(guestArmies, result.GuestDeaths);
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }

        _logger.LogInformation(
            "Admin insta-completed {Builds} build(s) and {Training} training batch(es) in settlement {Id}.",
            result.Completed.Count, result.TrainingCompleted.Count, settlementId);

        return new CompleteQueuesResult(settlement, clock, result.Completed.Count, result.TrainingCompleted.Count);
    }

    /// <summary>
    /// Admin god-mode: places (or re-types/re-levels) a building on a hex —
    /// the write half of the graphical settlement editor. See
    /// <see cref="Settlement.PlaceBuilding"/> for which rules still apply.
    /// </summary>
    public async Task<AdminBuildingEditServiceResult> PlaceBuildingAsync(
        Guid settlementId,
        HexCoord coord,
        BuildingType type,
        int level,
        CancellationToken cancellationToken = default)
    {
        var loaded = await LoadForEditAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (loaded is null)
        {
            return new AdminBuildingEditServiceResult(AdminEditOutcome.SettlementNotFound);
        }

        var (settlement, clock, now, settled, settleResult, guestArmies, guestStacks) = loaded.Value;
        var sampler = new TerrainSampler(settlement.World!.ToGenerationOptions());

        var result = settled.PlaceBuilding(
            coord, type, level, sampler.TerrainAt(coord), sampler.IsCoastalWater(coord),
            now, settlement.World.SpeedFactor, guestStacks, sampler.TerrainAt);

        if (!result.Accepted)
        {
            await PersistIfSettledAsync(settlement, settleResult, guestArmies, cancellationToken).ConfigureAwait(false);
            return new AdminBuildingEditServiceResult(AdminEditOutcome.Rejected, result.Rejection);
        }

        settlement.ApplyDomain(result.Settlement!);
        ApplyGuestDeaths(guestArmies, settleResult.GuestDeaths);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Admin placed {Type} level {Level} at {Coord} in settlement {Id}.", type, level, coord, settlementId);

        return new AdminBuildingEditServiceResult(
            AdminEditOutcome.Applied, AdminBuildingEditRejection.None, settlement, clock);
    }

    /// <summary>Admin god-mode: razes whatever stands on a hex — <see cref="PlaceBuildingAsync"/>'s counterpart.</summary>
    public async Task<AdminBuildingEditServiceResult> RazeBuildingAsync(
        Guid settlementId,
        HexCoord coord,
        CancellationToken cancellationToken = default)
    {
        var loaded = await LoadForEditAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (loaded is null)
        {
            return new AdminBuildingEditServiceResult(AdminEditOutcome.SettlementNotFound);
        }

        var (settlement, clock, now, settled, settleResult, guestArmies, guestStacks) = loaded.Value;

        var result = settled.RazeBuilding(
            coord, now, settlement.World!.SpeedFactor, guestStacks, TerrainAt(settlement.World));

        if (!result.Accepted)
        {
            await PersistIfSettledAsync(settlement, settleResult, guestArmies, cancellationToken).ConfigureAwait(false);
            return new AdminBuildingEditServiceResult(AdminEditOutcome.Rejected, result.Rejection);
        }

        settlement.ApplyDomain(result.Settlement!);
        ApplyGuestDeaths(guestArmies, settleResult.GuestDeaths);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Admin razed the building at {Coord} in settlement {Id}.", coord, settlementId);

        return new AdminBuildingEditServiceResult(
            AdminEditOutcome.Applied, AdminBuildingEditRejection.None, settlement, clock);
    }

    /// <summary>
    /// Admin god-mode "troop creation": adds units of one type straight into a
    /// settlement's garrison (or, with a negative count, removes them), free
    /// of cost and training time. The units are ordinary garrison units from
    /// there on — dispatchable, feedable, starvable.
    /// </summary>
    public async Task<AdminGarrisonEditServiceResult> AdjustGarrisonAsync(
        Guid settlementId,
        UnitType unitType,
        int delta,
        CancellationToken cancellationToken = default)
    {
        var loaded = await LoadForEditAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (loaded is null)
        {
            return new AdminGarrisonEditServiceResult(AdminEditOutcome.SettlementNotFound);
        }

        var (settlement, clock, now, settled, settleResult, guestArmies, guestStacks) = loaded.Value;

        var result = settled.AdjustGarrison(
            unitType, delta, now, settlement.World!.SpeedFactor, guestStacks, TerrainAt(settlement.World));

        if (!result.Accepted)
        {
            await PersistIfSettledAsync(settlement, settleResult, guestArmies, cancellationToken).ConfigureAwait(false);
            return new AdminGarrisonEditServiceResult(AdminEditOutcome.Rejected, result.Rejection);
        }

        settlement.ApplyDomain(result.Settlement!);
        ApplyGuestDeaths(guestArmies, settleResult.GuestDeaths);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Admin adjusted settlement {Id}'s garrison by {Delta}x {Unit}.", settlementId, delta, unitType);

        return new AdminGarrisonEditServiceResult(
            AdminEditOutcome.Applied, AdminGarrisonEditRejection.None, settlement, clock);
    }

    /// <summary>
    /// The shared prologue of every admin god-mode edit: load the settlement
    /// with its world, convert wall time to game time, and settle it (with its
    /// guests) to now, so the edit itself is decided against the settlement as
    /// it stands this instant. Null when there is no such settlement.
    /// </summary>
    private async Task<(SettlementEntity Settlement,
        GameClock Clock,
        DateTimeOffset Now,
        Settlement Settled,
        SettleResult SettleResult,
        List<ArmyEntity> GuestArmies,
        List<UnitStack> GuestStacks)?> LoadForEditAsync(
        Guid settlementId, CancellationToken cancellationToken)
    {
        var settlement = await LoadAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (settlement?.World is null)
        {
            return null;
        }

        var clock = settlement.World.ToClock();
        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        var (settled, settleResult, guestArmies) = await SettleWithGuestsAsync(
            settlement, now, settlement.World.SpeedFactor, cancellationToken).ConfigureAwait(false);

        var guestStacks = AggregateStacks(
            guestArmies.SelectMany(a => a.Stacks.Select(s => new UnitStack(s.UnitType, s.Count))));

        return (settlement, clock, now, settled, settleResult, guestArmies, guestStacks);
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

        var sampler = new TerrainSampler(settlement.World.ToGenerationOptions());

        // Settle first so the decision sees the queue and stock as of now: a
        // build that finished a minute ago must free its slot and count towards
        // production.
        var (settled, settleResult, guestArmies) = await SettleWithGuestsAsync(
            settlement, now, settlement.World.SpeedFactor, cancellationToken).ConfigureAwait(false);

        // The premium waiting queue is gated server-side, from the
        // settlement's owning user (LoadAsync includes Owner) — Anonymous
        // settlements are owned by SystemUserIds.Abandoned and are simply not
        // premium (issue #158).
        var maxWaitingOrders = (settlement.Owner?.IsPremium ?? false) ? Settlement.MaxWaitingOrders : 0;

        var terrain = sampler.TerrainAt(coord);
        var riverShapeAt = await RiverShapeAtAsync(settlement.WorldId, coord, cancellationToken)
            .ConfigureAwait(false);
        var decision = settled.PlanBuild(
            type, coord, terrain, now, Guid.CreateVersion7(),
            settlement.World.SpeedFactor, sampler.IsCoastalWater(coord),
            maxWaitingOrders, Settlement.DefaultMaxOrdersPerHex,
            riverShapeAt: riverShapeAt);

        if (!decision.Accepted)
        {
            // Even a refused build may have completed work while settling, and
            // that is a real change worth keeping.
            await PersistIfSettledAsync(settlement, settleResult, guestArmies, cancellationToken)
                .ConfigureAwait(false);
            return new BuildResult(decision.Rejection);
        }

        settlement.ApplyDomain(settled.Enqueue(decision.Order!, now));
        ApplyGuestDeaths(guestArmies, settleResult.GuestDeaths);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Settlement {Id} queued {Type} level {Level} at {Coord}, completing {CompletesAt}.",
            settlementId, type, decision.Order!.TargetLevel, coord, decision.Order.CompletesAt);

        return new BuildResult(BuildRejection.None, decision.Order);
    }

    /// <summary>Cancels a still-queued build order, refunding its cost.</summary>
    public async Task<CancelBuildResult> CancelBuildAsync(
        Guid settlementId,
        Guid orderId,
        CancellationToken cancellationToken = default)
    {
        var settlement = await LoadAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (settlement?.World is null)
        {
            return new CancelBuildResult(CancelBuildRejection.OrderNotFound);
        }

        var clock = settlement.World.ToClock();
        if (!clock.AllowsCommands)
        {
            return new CancelBuildResult(CancelBuildRejection.None, WorldPaused: true);
        }

        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        // Settle first so the cancel sees the queue and stock as of now: an
        // order that finished a minute ago is no longer cancellable — same
        // reasoning as QueueBuildAsync.
        var (settled, settleResult, guestArmies) = await SettleWithGuestsAsync(
            settlement, now, settlement.World.SpeedFactor, cancellationToken).ConfigureAwait(false);

        var decision = settled.CancelBuild(orderId, now, settlement.World.SpeedFactor);
        if (!decision.Accepted)
        {
            await PersistIfSettledAsync(settlement, settleResult, guestArmies, cancellationToken)
                .ConfigureAwait(false);
            return new CancelBuildResult(decision.Rejection);
        }

        settlement.ApplyDomain(decision.Settlement!);
        ApplyGuestDeaths(guestArmies, settleResult.GuestDeaths);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Settlement {Id} cancelled build order {OrderId}.", settlementId, orderId);

        return new CancelBuildResult(CancelBuildRejection.None);
    }

    /// <summary>Queues training a batch of units, charging for it up front.</summary>
    public async Task<TrainResult> TrainUnitsAsync(
        Guid settlementId,
        UnitType unitType,
        int count,
        CancellationToken cancellationToken = default)
    {
        var settlement = await LoadAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (settlement?.World is null)
        {
            return new TrainResult(TrainRejection.InvalidCount);
        }

        var clock = settlement.World.ToClock();
        if (!clock.AllowsCommands)
        {
            return new TrainResult(TrainRejection.None, null, WorldPaused: true);
        }

        var now = clock.ToGameTime(_timeProvider.GetUtcNow());

        // Settle first so the decision sees the queue and stock as of now —
        // same reasoning as QueueBuildAsync.
        var (settled, settleResult, guestArmies) = await SettleWithGuestsAsync(
            settlement, now, settlement.World.SpeedFactor, cancellationToken).ConfigureAwait(false);

        var sampler = new TerrainSampler(settlement.World.ToGenerationOptions());

        // Ship training needs the settlement's *full* claimed territory to
        // reach the sea, not just its centre disc — a settlement inland at
        // its centre but with a tower on the coast is exactly the case this
        // mechanic exists to enable. See Settlement.ClaimDiscs.
        var hasShoreline = settled.ClaimDiscs
            .SelectMany(disc => disc.Centre.WithinRadius(disc.Radius))
            .Distinct()
            .Any(sampler.IsShoreline);

        // Settler-crew training escalates per settlement the owning player
        // already holds (issue #55 §4) — every other unit type trains at the
        // catalogue's flat cost (multiplier 1.0).
        var costMultiplier = 1.0;
        if (unitType == UnitType.SettlerCrew)
        {
            var existingSettlementCount = await GetSettlementCountAsync(settlement.UserId, settlement.WorldId, cancellationToken)
                .ConfigureAwait(false);
            costMultiplier = Founding.CostMultiplier(existingSettlementCount);
        }

        var decision = settled.PlanTrain(
            unitType, count, now, Guid.CreateVersion7(), hasShoreline, costMultiplier, settlement.World.SpeedFactor);

        if (!decision.Accepted)
        {
            // Even a refused request may have completed work while settling
            // (a build, a training batch, or a starvation death), and that is
            // a real change worth keeping.
            await PersistIfSettledAsync(settlement, settleResult, guestArmies, cancellationToken)
                .ConfigureAwait(false);
            return new TrainResult(decision.Rejection);
        }

        settlement.ApplyDomain(settled.EnqueueTraining(decision.Order!, now));
        ApplyGuestDeaths(guestArmies, settleResult.GuestDeaths);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Settlement {Id} queued training {Count}x {Type}, completing {CompletesAt}.",
            settlementId, count, unitType, decision.Order!.CompletesAt);

        return new TrainResult(TrainRejection.None, decision.Order);
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
            .Include(s => s.Garrison)
            .Include(s => s.TrainingQueue)
            .Include(s => s.Runes)
            .Where(s => s.WorldId == worldId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var terrainAt = TerrainAt(world);

        var settlementIds = settlements.Select(s => s.Id).ToHashSet();
        var guestArmies = await _dbContext.Armies
            .Include(a => a.Stacks)
            .Where(a => a.IsSupporting && settlementIds.Contains(a.TargetSettlementId!.Value))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        var guestArmiesByHost = guestArmies.ToLookup(a => a.TargetSettlementId!.Value);

        foreach (var entity in settlements)
        {
            var hostGuestArmies = guestArmiesByHost[entity.Id].ToList();
            var guestStacks = AggregateStacks(
                hostGuestArmies.SelectMany(a => a.Stacks.Select(s => new UnitStack(s.UnitType, s.Count))));

            var result = entity.ToDomain().SettleTo(now, oldFactor, guestStacks, terrainAt);
            var settled = result.Settlement;
            ApplyGuestDeaths(hostGuestArmies, result.GuestDeaths);

            var (production, capacity) = settled.CurrentTotals(newFactor, guestStacks, terrainAt);
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

    /// <summary>
    /// The terrain lookup <see cref="Settlement.SettleTo"/> and friends need
    /// for a terrain-bound producer's neighbour-adjacency boost — built fresh
    /// per call since a <see cref="TerrainSampler"/> is cheap (no state, no
    /// I/O) and a world's generation options can differ per request.
    /// </summary>
    private static Func<HexCoord, Terrain> TerrainAt(WorldEntity world) =>
        new TerrainSampler(world.ToGenerationOptions()).TerrainAt;

    /// <summary>
    /// The shape of the river tile standing on <paramref name="coord"/>
    /// itself, or <see langword="null"/> if there is none there — the
    /// Sawmill's buildability rule (see
    /// <see cref="BuildingDefinition.RequiresRiverShape"/>: it's built
    /// directly on a river tile). Rivers are generated once per island and
    /// persisted (<see cref="IslandEntity.RiverTiles"/>), not derivable from
    /// the seed the way plain terrain is, so this needs a query.
    /// </summary>
    private async Task<RiverTileShape?> RiverShapeAtAsync(Guid worldId, HexCoord coord, CancellationToken cancellationToken)
    {
        var riverTileLists = await _dbContext.Islands
            .Where(i => i.WorldId == worldId)
            .Select(i => i.RiverTiles)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        foreach (var tile in riverTileLists.SelectMany(tiles => tiles))
        {
            if (tile.Q == coord.Q && tile.R == coord.R)
            {
                return (RiverTileShape)tile.Shape;
            }
        }

        return null;
    }

    private Task<SettlementEntity?> LoadAsync(Guid settlementId, CancellationToken cancellationToken) =>
        _dbContext.Settlements
            .Include(s => s.World)
            .Include(s => s.Buildings)
            .Include(s => s.Queue)
            .Include(s => s.Garrison)
            .Include(s => s.TrainingQueue)
            .Include(s => s.Runes)
            // Needed to gate the premium waiting queue (issue #158) from the
            // owning user's IsPremium — a single extra join on the row this
            // already loads, cheaper than a second round trip everywhere the
            // response needs to know.
            .Include(s => s.Owner)
            .FirstOrDefaultAsync(s => s.Id == settlementId, cancellationToken);

    /// <summary>
    /// Loads every guest (<see cref="Bjarnoy.Domain.Armies.ArmyMission.Support"/>)
    /// army currently hosted at <paramref name="settlementId"/> (issue #40
    /// phase 4 §2) and settles the settlement against their pooled upkeep and
    /// its terrain-bound producers' adjacency boost in one step —
    /// <see cref="Settlement.SettleTo"/>'s <c>guestStacks</c> and
    /// <c>terrainAt</c> parameters. Tracked (not <c>AsNoTracking</c>): a
    /// starvation pass may need to write guest deaths back onto these same
    /// entities — see <see cref="ApplyGuestDeaths"/>. Requires
    /// <paramref name="entity"/>.World to already be loaded (every caller
    /// checks this before calling in).
    /// </summary>
    private async Task<(Settlement Settled, SettleResult Result, List<ArmyEntity> GuestArmies)> SettleWithGuestsAsync(
        SettlementEntity entity, DateTimeOffset now, double speedFactor, CancellationToken cancellationToken)
    {
        var guestArmies = await _dbContext.Armies
            .Include(a => a.Stacks)
            .Where(a => a.IsSupporting && a.TargetSettlementId == entity.Id)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var guestStacks = AggregateStacks(
            guestArmies.SelectMany(a => a.Stacks.Select(s => new UnitStack(s.UnitType, s.Count))));

        var result = entity.ToDomain().SettleTo(now, speedFactor, guestStacks, TerrainAt(entity.World!));
        return (result.Settlement, result, guestArmies);
    }

    private static List<UnitStack> AggregateStacks(IEnumerable<UnitStack> stacks) =>
        [.. stacks.GroupBy(s => s.Type).Select(g => new UnitStack(g.Key, g.Sum(s => s.Count)))];

    /// <summary>
    /// Splits <paramref name="guestDeaths"/> (pooled by type, from
    /// <see cref="SettleResult.GuestDeaths"/>) across the actual guest
    /// <paramref name="guestArmies"/> present and removes any left with no
    /// stacks — <see cref="GuestArmyAllocation"/> does the split; this just
    /// also deletes the now-empty rows, which that helper deliberately leaves
    /// to the caller (its own remarks explain why).
    /// </summary>
    private void ApplyGuestDeaths(IReadOnlyList<ArmyEntity> guestArmies, IReadOnlyList<UnitStack> guestDeaths)
    {
        if (guestDeaths.Count == 0)
        {
            return;
        }

        GuestArmyAllocation.ApplyLosses(guestArmies, guestDeaths);

        foreach (var army in guestArmies.Where(a => a.Stacks.Count == 0))
        {
            _dbContext.Armies.Remove(army);
        }
    }

    private async Task PersistIfSettledAsync(
        SettlementEntity entity,
        SettleResult result,
        List<ArmyEntity> guestArmies,
        CancellationToken cancellationToken)
    {
        if (!result.Changed)
        {
            return;
        }

        entity.ApplyDomain(result.Settlement);
        ApplyGuestDeaths(guestArmies, result.GuestDeaths);
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
