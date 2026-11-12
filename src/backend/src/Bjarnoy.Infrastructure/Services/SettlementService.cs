using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.Shrines;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services.PlotReservations;
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

    /// <summary>
    /// The plot falls within another visitor's live, exclusive landing-page
    /// reservation (<see cref="PlotReservationService"/>) — someone else is
    /// about to found there. Distinct from <see cref="PlotTaken"/> (an
    /// actual settlement already exists) and <see cref="TooCloseToNeighbour"/>
    /// (a real settlement's territory) — this is a soft, time-limited hold,
    /// not a database row, but enforced here for real rather than left as a
    /// UI-only suggestion: see <c>docs/plans/landing-plot-reservation.md</c>.
    /// </summary>
    PlotReserved,
}

public sealed record FoundingResult(FoundingRejection Rejection, SettlementEntity? Settlement = null)
{
    public bool Accepted => Rejection == FoundingRejection.None && Settlement is not null;
}

/// <param name="MissingPrerequisite">
/// Set only for <see cref="BuildRejection.RequiredBuildingTooLow"/> — the
/// prerequisite the settlement does not meet, so the API can name it rather
/// than only report that something is missing.
/// </param>
public sealed record BuildResult(
    BuildRejection Rejection,
    BuildOrder? Order = null,
    bool WorldPaused = false,
    BuildingPrerequisite? MissingPrerequisite = null)
{
    public bool Accepted => Rejection == BuildRejection.None && Order is not null;
}

public sealed record CancelBuildResult(CancelBuildRejection Rejection, bool WorldPaused = false)
{
    public bool Accepted => Rejection == CancelBuildRejection.None && !WorldPaused;
}

public sealed record FeastResult(FeastRejection Rejection, Feast? Feast = null, bool WorldPaused = false)
{
    public bool Accepted => Rejection == FeastRejection.None && Feast is not null;
}

/// <summary>Outcome of claiming an onboarding quest reward.</summary>
public sealed record ClaimQuestResult(
    QuestRejection Rejection,
    bool SettlementNotFound = false,
    bool WorldPaused = false,
    SettlementEntity? Settlement = null,
    GameClock? Clock = null)
{
    public bool Accepted => Rejection == QuestRejection.None && !SettlementNotFound && !WorldPaused && Settlement is not null;
}

/// <summary>Outcome of renaming a settlement.</summary>
public sealed record RenameSettlementResult(
    bool SettlementNotFound = false,
    bool WorldPaused = false,
    SettlementEntity? Settlement = null,
    GameClock? Clock = null)
{
    public bool Accepted => !SettlementNotFound && !WorldPaused && Settlement is not null;
}

public sealed record TrainResult(
    TrainRejection Rejection,
    IReadOnlyList<TrainingOrder>? Orders = null,
    bool WorldPaused = false,
    GameClock? Clock = null,
    DateTimeOffset Now = default)
{
    public bool Accepted => Rejection == TrainRejection.None && Orders is { Count: > 0 };
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
    IPlotReservationStore reservations,
    CampService campService,
    ConcurrentWriteExecutor concurrentWriteExecutor,
    LinkedGroupLoader groups,
    ILogger<SettlementService> logger)
{
    /// <summary>
    /// Founding's cheap, longhouse-only pre-filter: the minimum hex distance
    /// between two settlements' <em>centres</em> that lets a candidate skip
    /// straight past the real per-neighbour territory check
    /// (<see cref="FoundAsync"/>'s "phase 2", below) without loading anyone's
    /// building list. A fixed design figure, not derived from
    /// <see cref="Settlement.MaxClaimRadius"/>: the Longhouse's own disc
    /// stops growing at radius 3 (docs/design/economy.md, "Territory and
    /// towers"), and from there territory grows only through towers, so
    /// settlements need room between them for their towers — deriving the
    /// spacing from the centre disc (<c>2 × 3 + 1 = 7</c>) would pack them
    /// together. 15 is the spacing the game had while the centre disc grew
    /// to radius 7, and keeps world density unchanged.
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
    public const int MinimumSpacing = 15;

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
    private readonly IPlotReservationStore _reservations = reservations;
    private readonly CampService _campService = campService;
    private readonly ConcurrentWriteExecutor _concurrentWriteExecutor = concurrentWriteExecutor;
    private readonly LinkedGroupLoader _groups = groups;
    private readonly ILogger<SettlementService> _logger = logger;

    /// <summary>
    /// Founds a settlement on one of an island's precomputed start positions.
    /// </summary>
    /// <param name="callerUserId">
    /// The founding request's authenticated caller, if any (its JWT's
    /// <c>ClaimTypes.NameIdentifier</c>) — becomes the new settlement's real
    /// <see cref="SettlementEntity.UserId"/> straight away, instead of the
    /// anonymous-founding default (<see cref="SystemUserIds.Abandoned"/>,
    /// used when this is <see langword="null"/>). Without this, a logged-in
    /// player founding in a world they have never played would get an
    /// unclaimed realm nobody's account owns until some later, separate claim
    /// — there is no reason to make them do that when the account founding it
    /// is already known right here.
    /// </param>
    public async Task<FoundingResult> FoundAsync(
        Guid worldId,
        Guid islandId,
        HexCoord coord,
        string name,
        string ownerName,
        string ownerId,
        Guid? callerUserId = null,
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
        if (!island.FoundableStartPositions().Any(p => p.Q == coord.Q && p.R == coord.R))
        {
            return new FoundingResult(FoundingRejection.NotAStartPosition);
        }

        // One settlement per player per world — for now. Ships and carts will
        // one day let a player found a second one; until then this is a hard
        // rule, not just an unlikely-to-be-hit default.
        if (await AlreadyFoundedAsync(worldId, ownerId, callerUserId, cancellationToken).ConfigureAwait(false))
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
                s.Id,
                s.UserId,
                s.OwnerId,
                s.IslandId,
                s.CentreQ,
                s.CentreR,
                Buildings = s.Buildings.Select(b => new { b.Q, b.R, b.Type, b.Level }).ToList(),
            })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        // A neighbour's towers can be connected through another settlement of the same player (the chain rule), so its
        // claim discs come from the whole realm, not from the one settlement alone.
        var neighbourRows = neighbours
            .Select(n => new PlayerRealms.Row(
                n.Id, n.UserId, n.OwnerId, n.IslandId, new HexCoord(n.CentreQ, n.CentreR),
                [.. n.Buildings.Select(b => new PlacedBuilding(new HexCoord(b.Q, b.R), b.Type, b.Level))]))
            .ToList();
        var neighbourRealms = PlayerRealms.Resolve(neighbourRows);
        var snapshots = neighbourRows.Select(n => new Founding.NeighbourSnapshot(
            n.Centre, n.Buildings, neighbourRealms[n.Id].DiscsOf(n.Id)));

        switch (Founding.CheckSpacing(coord, snapshots, MinimumSpacing, FoundingSafetyMargin))
        {
            case Founding.SpacingVerdict.PlotTaken:
                return new FoundingResult(FoundingRejection.PlotTaken);
            case Founding.SpacingVerdict.TooClose:
                return new FoundingResult(FoundingRejection.TooCloseToNeighbour);
        }

        // A landing-page visitor other than this caller may be holding an
        // exclusive, time-limited reservation on this plot right now (see
        // PlotReservationService) — real, not just a UI suggestion. The
        // caller's own reservation (if any) never blocks their own founding.
        if (_reservations.IsBlockedByOtherOwner(worldId, coord, ownerId, PlotReservationService.ReservationSpacing))
        {
            return new FoundingResult(FoundingRejection.PlotReserved);
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
            // A caller founding while already logged in owns it outright from
            // the start (callerUserId). Anonymous founding has no real
            // account yet, but UserId is required, so it starts out owned by
            // the reserved "Abandoned" system user — AuthService.RegisterAsync
            // reassigns it to a real account when the client later registers
            // with this same OwnerId.
            UserId = callerUserId ?? SystemUserIds.Abandoned,
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
        catch (DbUpdateException ex) when (!ConcurrentWriteExecutor.IsRetryable(ex))
        {
            // Two requests raced (same plot, or the same player founding
            // twice). The unique indexes are what actually decided it, so
            // re-read to see which one before reporting it as such.
            _dbContext.Entry(settlement).State = EntityState.Detached;

            if (await PlotTakenAsync(worldId, coord, cancellationToken).ConfigureAwait(false))
            {
                return new FoundingResult(FoundingRejection.PlotTaken);
            }

            if (await AlreadyFoundedAsync(worldId, ownerId, callerUserId, cancellationToken).ConfigureAwait(false))
            {
                return new FoundingResult(FoundingRejection.AlreadyFounded);
            }

            throw;
        }

        _reservations.Release(worldId, ownerId);

        // A settlement founded against the player's others may link with them: it joins their shared stock.
        await ReconcileRealmAsync(settlement.Id, cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Settlement {Name} ({Id}) founded at {Coord} on island {IslandId}.",
            name, settlement.Id, coord, islandId);

        return new FoundingResult(FoundingRejection.None, settlement);
    }

    /// <summary>
    /// Founds a new settlement from a settler convoy's arrival (issue
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
        var islandId = await NearestIslandIdAsync(worldId, coord, cancellationToken).ConfigureAwait(false);

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
            // The convoy's escort stands at the new longhouse, the only spot a new settlement has.
            SpotStacks = [.. startingGarrison.Select(g => new SpotStack(coord, g.Type, g.Count))],
            Resources = ResourcePool.Create(BuildingCatalogue.FoundingStock, production, capacity, now),
        });

        _dbContext.Settlements.Add(settlement);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        // The new longhouse may reach buildings of the player's other settlements on the island that stood outside the realm,
        // and its realm may touch theirs: it joins their shared stock.
        await ReconcileRealmAsync(settlement.Id, cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Settlement {Name} ({Id}) founded at {Coord} by settler convoy for user {UserId}.",
            name, settlement.Id, coord, userId);

        return settlement;
    }

    /// <summary>
    /// The island whose centre is nearest <paramref name="coord"/>: no tile-membership index exists per hex (see IslandEntity's
    /// remarks), so a settlement founded off a start position gets the nearest island by centre — a purely decorative
    /// approximation (island name/grouping only; nothing gameplay-relevant reads a settlement's IslandId beyond that).
    /// </summary>
    private async Task<Guid> NearestIslandIdAsync(Guid worldId, HexCoord coord, CancellationToken cancellationToken)
    {
        var islands = await _dbContext.Islands
            .Where(i => i.WorldId == worldId)
            .Select(i => new { i.Id, i.CentreQ, i.CentreR })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return islands
            .OrderBy(i => coord.DistanceTo(new HexCoord(i.CentreQ, i.CentreR)))
            .Select(i => i.Id)
            .FirstOrDefault();
    }

    /// <summary>
    /// Sets up a beach camp from a camp-builder army that has stood on its site for the whole build time
    /// (<c>ArmyService.ResolveCampAsync</c> has re-checked the site): a one-hex settlement with a <see cref="BuildingType.BeachCamp"/>
    /// at its centre and no Longhouse. <paramref name="garrison"/> is what came along (the camp builders are used up) and
    /// <paramref name="food"/> the army's leftover provisions, which become the camp's food pile (clamped to its capacity). The
    /// camp's cost was in the army's loot and is consumed. Like a founded settlement it joins the player's linked realm.
    /// </summary>
    public async Task<SettlementEntity> FoundCampFromConvoyAsync(
        Guid worldId,
        HexCoord coord,
        Guid userId,
        string ownerName,
        string ownerId,
        string name,
        IReadOnlyList<UnitStack> garrison,
        double food,
        DateTimeOffset completedAt,
        CancellationToken cancellationToken = default)
    {
        var islandId = await NearestIslandIdAsync(worldId, coord, cancellationToken).ConfigureAwait(false);

        // A camp produces nothing, so no speed factor on the (zero) production; it stores BuildingCatalogue.BeachCampStorage of each.
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.BeachCamp, 1)]);

        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            Name = name,
            OwnerName = ownerName,
            OwnerId = ownerId,
            UserId = userId,
            FoundedAt = completedAt,
        };

        settlement.ApplyDomain(new Settlement
        {
            Id = settlement.Id,
            Name = name,
            Centre = coord,
            Buildings = [new PlacedBuilding(coord, BuildingType.BeachCamp, 1)],
            SpotStacks = [.. garrison.Select(s => new SpotStack(coord, s.Type, s.Count))],
            Resources = ResourcePool.Create(new ResourceAmounts(0, 0, Math.Max(0, food), 0), production, capacity, completedAt),
        });

        _dbContext.Settlements.Add(settlement);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        // The camp may touch one of the player's realms: it then joins their shared stock.
        await ReconcileRealmAsync(settlement.Id, cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Beach camp {Name} ({Id}) set up at {Coord} for user {UserId}.",
            name, settlement.Id, coord, userId);

        return settlement;
    }

    /// <summary>
    /// How many settlements <paramref name="userId"/> already holds in
    /// <paramref name="worldId"/> — the "existing settlement count"
    /// <c>Settlers.RenownThresholds.AllowsAnotherSettlement</c> scales against (issue #55 §3). Beach camps (a
    /// <see cref="BuildingType.BeachCamp"/> at the centre) do not count towards the renown limit.
    /// </summary>
    public Task<int> GetSettlementCountAsync(Guid userId, Guid worldId, CancellationToken cancellationToken = default) =>
        _dbContext.Settlements.CountAsync(
            s => s.UserId == userId && s.WorldId == worldId
                && !s.Buildings.Any(b => b.Type == BuildingType.BeachCamp && b.Q == s.CentreQ && b.R == s.CentreR),
            cancellationToken);

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
        var session = await GetGroupAsync(settlementId, cancellationToken).ConfigureAwait(false);
        return session is null ? null : (session.Anchor, session.Clock);
    }

    /// <summary>
    /// <see cref="GetAsync"/> for a caller that builds the linked realm's owner view: the settled group session itself
    /// (written back when something was due), so the response needs no second load.
    /// </summary>
    public async Task<LinkedGroupSession?> GetGroupAsync(
        Guid settlementId,
        CancellationToken cancellationToken = default)
    {
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return null;
        }

        if (await session.WriteBackAsync(cancellationToken).ConfigureAwait(false))
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            _logger.LogInformation(
                "Settlement {Id} (and its linked realm) settled {Count} member(s) on read.",
                settlementId, session.ChangedMembers.Count);
        }

        return session;
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
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new GrantResourcesResult(GrantResourcesOutcome.SettlementNotFound);
        }

        // The grant goes into the linked realm's shared stock.
        var settled = session.View(settlementId);
        session.Apply(settlementId, settled with { Resources = settled.Resources.Adjust(delta, session.Now) });
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Admin granted {Delta} to settlement {Id}.", delta, settlementId);

        return new GrantResourcesResult(GrantResourcesOutcome.Applied, session.Anchor, session.Clock);
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
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new AdminSetBuildingLevelResult(SetBuildingLevelOutcome.SettlementNotFound);
        }

        var result = session.View(settlementId).SetBuildingLevel(
            coord, level, session.Now, session.SpeedFactor, session.GuestStacksOf(settlementId), session.TerrainAt);

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
            await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
            return new AdminSetBuildingLevelResult(outcome);
        }

        session.Apply(settlementId, result.Settlement!);
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        await ReconcileRealmAsync(settlementId, cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Admin set building at {Coord} in settlement {Id} to level {Level}.", coord, settlementId, level);

        return new AdminSetBuildingLevelResult(SetBuildingLevelOutcome.Applied, session.Anchor, session.Clock);
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
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new RuneResult(RuneOutcome.SettlementNotFound);
        }

        var granted = session.View(settlementId).GrantRune(new RuneInstance { Id = Guid.CreateVersion7(), Type = type, Rarity = rarity });
        session.Apply(settlementId, granted);
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Granted a {Rarity} {Type} rune to settlement {Id}.", rarity, type, settlementId);

        return new RuneResult(RuneOutcome.Applied, session.Anchor, session.Clock);
    }

    /// <summary>Slots an unslotted rune into the shrine standing on <paramref name="shrineCoord"/>.</summary>
    public async Task<RuneResult> SlotRuneAsync(
        Guid settlementId, Guid runeId, HexCoord shrineCoord, CancellationToken cancellationToken = default)
    {
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new RuneResult(RuneOutcome.SettlementNotFound);
        }

        var result = session.View(settlementId).SlotRune(
            runeId, shrineCoord, session.Now, session.SpeedFactor, session.GuestStacksOf(settlementId), session.TerrainAt);

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
            await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
            return new RuneResult(outcome);
        }

        session.Apply(settlementId, result.Settlement!);
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return new RuneResult(RuneOutcome.Applied, session.Anchor, session.Clock);
    }

    /// <summary>Returns a slotted rune to storage.</summary>
    public async Task<RuneResult> UnslotRuneAsync(
        Guid settlementId, Guid runeId, CancellationToken cancellationToken = default)
    {
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new RuneResult(RuneOutcome.SettlementNotFound);
        }

        var result = session.View(settlementId).UnslotRune(
            runeId, session.Now, session.SpeedFactor, session.GuestStacksOf(settlementId), session.TerrainAt);

        if (!result.Accepted)
        {
            var outcome = result.Rejection switch
            {
                UnslotRuneRejection.RuneNotFound => RuneOutcome.RuneNotFound,
                UnslotRuneRejection.RuneNotSlotted => RuneOutcome.RuneNotSlotted,
                _ => RuneOutcome.RuneNotFound,
            };

            await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
            return new RuneResult(outcome);
        }

        session.Apply(settlementId, result.Settlement!);
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return new RuneResult(RuneOutcome.Applied, session.Anchor, session.Clock);
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
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new CompleteQueuesResult();
        }

        // A linked realm has one queue: every member of the component has its orders marked due, then the group settles as one.
        foreach (var id in session.Store.ComponentOf(settlementId))
        {
            session.Apply(id, session.View(id).WithQueuesDueAt(session.Now, builds, training));
        }

        session.Store.SettleTo(session.Now);

        if (await session.WriteBackAsync(cancellationToken).ConfigureAwait(false))
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }

        var outcomes = session.Members.Select(m => session.Store.Outcome(m.Id)).ToList();
        var completedBuilds = outcomes.SelectMany(o => o.Completed).ToList();
        var completedTraining = outcomes.Sum(o => o.CompletedTraining.Count);

        if (completedBuilds.Any(o => o.Type is BuildingType.Tower or BuildingType.Longhouse))
        {
            await ReconcileRealmAsync(settlementId, cancellationToken).ConfigureAwait(false);
        }

        _logger.LogInformation(
            "Admin insta-completed {Builds} build(s) and {Training} training batch(es) in settlement {Id}.",
            completedBuilds.Count, completedTraining, settlementId);

        return new CompleteQueuesResult(session.Anchor, session.Clock, completedBuilds.Count, completedTraining);
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
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new AdminBuildingEditServiceResult(AdminEditOutcome.SettlementNotFound);
        }

        var sampler = session.Sampler;
        var placeGiants = await session.GiantsAsync(cancellationToken).ConfigureAwait(false);

        var bogKind = await WorldTerrain.BogKindAtAsync(_dbContext, session.Anchor.WorldId, coord, cancellationToken).ConfigureAwait(false);
        var result = session.View(settlementId).PlaceBuilding(
            coord, type, level, sampler.TerrainAt(coord), sampler.IsCoastalWater(coord),
            session.Now, session.SpeedFactor, session.GuestStacksOf(settlementId), sampler.TerrainAt, placeGiants, bogKind,
            realm: session.Store.Realm,
            isInlandLakeShore: sampler.IsInlandLakeShore(coord));

        if (!result.Accepted)
        {
            await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
            return new AdminBuildingEditServiceResult(AdminEditOutcome.Rejected, result.Rejection);
        }

        session.Apply(settlementId, result.Settlement!);
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        await ReconcileRealmAsync(settlementId, cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Admin placed {Type} level {Level} at {Coord} in settlement {Id}.", type, level, coord, settlementId);

        return new AdminBuildingEditServiceResult(
            AdminEditOutcome.Applied, AdminBuildingEditRejection.None, session.Anchor, session.Clock);
    }

    /// <summary>Admin god-mode: razes whatever stands on a hex — <see cref="PlaceBuildingAsync"/>'s counterpart.</summary>
    public async Task<AdminBuildingEditServiceResult> RazeBuildingAsync(
        Guid settlementId,
        HexCoord coord,
        CancellationToken cancellationToken = default)
    {
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new AdminBuildingEditServiceResult(AdminEditOutcome.SettlementNotFound);
        }

        var result = session.View(settlementId).RazeBuilding(
            coord, session.Now, session.SpeedFactor, session.GuestStacksOf(settlementId), session.TerrainAt);

        if (!result.Accepted)
        {
            await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
            return new AdminBuildingEditServiceResult(AdminEditOutcome.Rejected, result.Rejection);
        }

        session.Apply(settlementId, result.Settlement!);
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        await ReconcileRealmAsync(settlementId, cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Admin razed the building at {Coord} in settlement {Id}.", coord, settlementId);

        return new AdminBuildingEditServiceResult(
            AdminEditOutcome.Applied, AdminBuildingEditRejection.None, session.Anchor, session.Clock);
    }

    /// <summary>
    /// Admin god-mode "troop creation": adds units of one type straight into a
    /// settlement's garrison (or, with a negative count, removes them), free
    /// of cost and training time. The units are ordinary garrison units from
    /// there on — dispatchable, feedable, starvable.
    /// </summary>
    public async Task<AdminGarrisonEditServiceResult> AdjustGarrisonAsync(
        Guid settlementId,
        HexCoord spot,
        UnitType unitType,
        int delta,
        CancellationToken cancellationToken = default)
    {
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new AdminGarrisonEditServiceResult(AdminEditOutcome.SettlementNotFound);
        }

        var result = session.View(settlementId).AdjustGarrison(
            spot, unitType, delta, session.Now, session.SpeedFactor, session.GuestStacksOf(settlementId), session.TerrainAt);

        if (!result.Accepted)
        {
            await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
            return new AdminGarrisonEditServiceResult(AdminEditOutcome.Rejected, result.Rejection);
        }

        session.Apply(settlementId, result.Settlement!);
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Admin adjusted settlement {Id}'s garrison by {Delta}x {Unit}.", settlementId, delta, unitType);

        return new AdminGarrisonEditServiceResult(
            AdminEditOutcome.Applied, AdminGarrisonEditRejection.None, session.Anchor, session.Clock);
    }

    public Task<List<SettlementEntity>> GetForWorldAsync(
        Guid worldId, CancellationToken cancellationToken = default) =>
        _dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.Buildings)
            .Where(s => s.WorldId == worldId)
            .OrderBy(s => s.Id)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// The settlements standing on one island — backs
    /// <c>GET .../plot-suggestion</c>'s <c>IslandSettlements</c>, so a
    /// landing-page visitor previewing a plot sees who their would-be
    /// neighbours are without the world-wide list <c>ListForWorld</c> used to
    /// (and no longer does) hand every anonymous caller.
    /// </summary>
    public Task<List<SettlementEntity>> GetForIslandAsync(
        Guid islandId, CancellationToken cancellationToken = default) =>
        _dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.Buildings)
            .Where(s => s.IslandId == islandId)
            .OrderBy(s => s.Id)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// The chain-rule realm (<see cref="ConnectedRealm"/>) of <paramref name="settled"/> and the same player's other
    /// settlements on its island: which towers are connected and which ground the player's realm covers.
    /// </summary>
    public Task<ConnectedRealm> LoadRealmAsync(
        SettlementEntity entity, Settlement settled, CancellationToken cancellationToken = default) =>
        PlayerRealms.ForSettlementAsync(_dbContext, entity, settled, cancellationToken);

    /// <summary>Queues a build, charging for it up front.</summary>
    public async Task<BuildResult> QueueBuildAsync(
        Guid settlementId,
        BuildingType type,
        HexCoord coord,
        CancellationToken cancellationToken = default)
    {
        // Settling first so the decision sees the queue and stock as of now: a build that finished a minute ago must free its
        // slot and count towards production. A linked realm settles as one, so the stock the build draws on is the pooled one.
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new BuildResult(BuildRejection.UnknownBuildingLevel);
        }

        if (!session.Clock.AllowsCommands)
        {
            return new BuildResult(BuildRejection.None, null, WorldPaused: true);
        }

        var now = session.Now;
        var sampler = session.Sampler;

        // The build is booked on the linked-realm member that already has something on the hex, else the oldest member whose own
        // realm claims it, else the requested one; everything about the hex is read through that member.
        var bookingId = session.Store.BookingMemberFor(settlementId, coord);
        var booking = session.EntityOf(bookingId);
        var booked = session.View(bookingId);

        // The premium waiting queue is gated server-side, from the
        // settlement's owning user (the anchor load includes Owner) — Anonymous
        // settlements are owned by SystemUserIds.Abandoned and are simply not
        // premium (issue #158).
        var maxWaitingOrders = (session.Anchor.Owner?.IsPremium ?? false) ? Settlement.MaxWaitingOrders : 0;

        var terrain = sampler.TerrainAt(coord);
        var (riverShapeAt, onRiverTile) = await RiverSiteAsync(booking.WorldId, coord, cancellationToken)
            .ConfigureAwait(false);
        // A bridge is the one building that stands on a wide river: it needs the raw tile (a stream's shape too, so PlanBuild can name
        // the stream), whether the tile is wide, and whether its island is a wasted one.
        var bridgeSite = type == BuildingType.Bridge
            ? await BridgeSiteAsync(booking.WorldId, coord, cancellationToken).ConfigureAwait(false)
            : default;
        riverShapeAt = bridgeSite.Shape ?? riverShapeAt;
        // Only meaningful when there's a river shape to begin with — see
        // Settlement.PlanBuild's riverVariantAt doc comment.
        var riverVariantAt = riverShapeAt is { } shapeAt ? sampler.RiverVariantAt(coord, shapeAt) : RiverVariant.Plain;

        // Only worth a query for an actual shrine — every other building
        // type has no god, so PlanBuild's check is a no-op for it regardless
        // of what set we hand it.
        var shrineGodsElsewhereOnIsland = BuildingCatalogue.GodOf(type) is not null
            ? await ShrineGodsElsewhereOnIslandAsync(booking.IslandId, booking.Id, coord, cancellationToken)
                .ConfigureAwait(false)
            : null;

        // Likewise, only PumpkinFarm cares which crop this island grows —
        // Farm stays buildable everywhere.
        var islandSoil = type == BuildingType.PumpkinFarm
            ? await IslandSoilAsync(booking.IslandId, sampler, cancellationToken).ConfigureAwait(false)
            : null;

        var buildGiants = await session.GiantsAsync(cancellationToken).ConfigureAwait(false);
        var decision = booked.PlanBuild(
            type, coord, terrain, now, Guid.CreateVersion7(),
            session.SpeedFactor, sampler.IsCoastalWater(coord),
            maxWaitingOrders, Settlement.DefaultMaxOrdersPerHex,
            riverShapeAt: riverShapeAt,
            riverVariantAt: riverVariantAt,
            shrineGodsElsewhereOnIsland: shrineGodsElsewhereOnIsland,
            islandSoil: islandSoil,
            giants: buildGiants,
            camps: await LoadCampIndexAsync(booking.WorldId, now, cancellationToken).ConfigureAwait(false),
            endgameSites: await LoadEndgameSiteIndexAsync(booking.WorldId, cancellationToken).ConfigureAwait(false),
            bogKindAt: await WorldTerrain.BogKindAtAsync(_dbContext, booking.WorldId, coord, cancellationToken).ConfigureAwait(false),
            palisades: type is BuildingType.Palisade or BuildingType.PalisadeGate
                ? await WorldPalisades.NearAsync(_dbContext, booking.WorldId, coord, sampler.TerrainAt, cancellationToken).ConfigureAwait(false)
                : null,
            isWideRiverAt: bridgeSite.IsWide,
            onWastedIsland: bridgeSite.OnWastedIsland,
            realm: session.Store.Realm,
            onRiverTile: onRiverTile,
            isInlandLakeShore: sampler.IsInlandLakeShore(coord));

        if (!decision.Accepted)
        {
            // Even a refused build may have completed work while settling, and
            // that is a real change worth keeping.
            await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
            return new BuildResult(
                decision.Rejection, MissingPrerequisite: decision.MissingPrerequisite);
        }

        session.Apply(bookingId, booked.Enqueue(decision.Order!, now));
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Settlement {Id} queued {Type} level {Level} at {Coord} (booked on {BookingId}), completing {CompletesAt}.",
            settlementId, type, decision.Order!.TargetLevel, coord, bookingId, decision.Order.CompletesAt);

        return new BuildResult(BuildRejection.None, decision.Order);
    }

    /// <summary>
    /// Queues a raze of one level of the building on <paramref name="coord"/> (<c>docs/design/construction-slots.md</c>,
    /// "Razing"): free, takes construction slots and goes through the queue like a build.
    /// </summary>
    public async Task<BuildResult> RazeBuildingLevelAsync(
        Guid settlementId,
        HexCoord coord,
        CancellationToken cancellationToken = default)
    {
        // Settled first, like QueueBuildAsync: a build that finished a minute ago must free its slot and count for the level
        // the raze takes off.
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new BuildResult(BuildRejection.UnknownBuildingLevel);
        }

        if (!session.Clock.AllowsCommands)
        {
            return new BuildResult(BuildRejection.None, null, WorldPaused: true);
        }

        var now = session.Now;

        // Booked on the linked-realm member that holds the building, so the raze runs on the member whose hex it is.
        var bookingId = session.Store.BookingMemberFor(settlementId, coord);
        var booked = session.View(bookingId);

        // Same premium waiting-room gate as a build.
        var maxWaitingOrders = (session.Anchor.Owner?.IsPremium ?? false) ? Settlement.MaxWaitingOrders : 0;

        var decision = booked.PlanRaze(
            coord, now, Guid.CreateVersion7(), session.SpeedFactor, maxWaitingOrders, Settlement.DefaultMaxOrdersPerHex);

        if (!decision.Accepted)
        {
            await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
            return new BuildResult(decision.Rejection);
        }

        session.Apply(bookingId, booked.Enqueue(decision.Order!, now));
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Settlement {Id} queued a raze of {Type} level {Level} at {Coord} (booked on {BookingId}), completing {CompletesAt}.",
            settlementId, decision.Order!.Type, decision.Order.LevelInWork, coord, bookingId, decision.Order.CompletesAt);

        return new BuildResult(BuildRejection.None, decision.Order);
    }

    /// <summary>Cancels a still-queued build order, refunding its cost.</summary>
    public async Task<CancelBuildResult> CancelBuildAsync(
        Guid settlementId,
        Guid orderId,
        CancellationToken cancellationToken = default)
    {
        // Settle first so the cancel sees the queue and stock as of now: an
        // order that finished a minute ago is no longer cancellable — same
        // reasoning as QueueBuildAsync.
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new CancelBuildResult(CancelBuildRejection.OrderNotFound);
        }

        if (!session.Clock.AllowsCommands)
        {
            return new CancelBuildResult(CancelBuildRejection.None, WorldPaused: true);
        }

        // The order sits in the queue of the member it was booked on; its refund goes into the shared stock.
        var owner = session.Store.MemberOwningOrder(orderId) is { } found && session.Store.ComponentOf(settlementId).Contains(found)
            ? found
            : settlementId;

        var decision = session.View(owner).CancelBuild(orderId, session.Now, session.SpeedFactor);
        if (!decision.Accepted)
        {
            await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
            return new CancelBuildResult(decision.Rejection);
        }

        session.Apply(owner, decision.Settlement!);
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Settlement {Id} cancelled build order {OrderId}.", settlementId, orderId);

        return new CancelBuildResult(CancelBuildRejection.None);
    }

    /// <summary>
    /// A wildlife camp burns the tower on <paramref name="coord"/> (see <see cref="Settlement.BurnTower"/>): the
    /// settlement is settled to <paramref name="now"/> first so production and storage stay correct, then the
    /// tower (standing, or the unfinished one with its build orders, no refund) is removed. Nothing is saved: the
    /// caller commits it together with the fight's other writes.
    /// </summary>
    /// <returns>False when the settlement is gone or no tower stood on the hex (nothing changed).</returns>
    public async Task<bool> BurnTowerAsync(
        Guid settlementId, HexCoord coord, DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var session = await _groups.LoadAsync(settlementId, settleTo: now, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return false;
        }

        var settled = session.View(settlementId);
        if (!settled.Buildings.Any(b => b.Coord == coord && b.Type == BuildingType.Tower))
        {
            await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
            return false;
        }

        session.Apply(settlementId, settled.BurnTower(coord, now, session.SpeedFactor, session.GuestStacksOf(settlementId), session.TerrainAt));
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        return true;
    }

    /// <summary>
    /// Queues training a batch of units in the building on <paramref name="buildingCoord"/> (and, by <paramref name="split"/>, in
    /// its siblings), charging for it up front.
    /// </summary>
    public async Task<TrainResult> TrainUnitsAsync(
        Guid settlementId,
        UnitType unitType,
        int count,
        HexCoord buildingCoord,
        TrainingSplit split = TrainingSplit.Here,
        CancellationToken cancellationToken = default)
    {
        // Settle first so the decision sees the queue and stock as of now —
        // same reasoning as QueueBuildAsync. The batch is paid from the linked realm's shared stock.
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new TrainResult(TrainRejection.InvalidCount);
        }

        if (!session.Clock.AllowsCommands)
        {
            return new TrainResult(TrainRejection.None, null, WorldPaused: true);
        }

        var now = session.Now;
        var settlement = session.Anchor;
        var settled = session.View(settlementId);
        var sampler = session.Sampler;

        // Ship training needs the settlement's *full* claimed territory to
        // reach the sea, not just its centre disc — a settlement inland at
        // its centre but with a tower on the coast is exactly the case this
        // mechanic exists to enable. See Settlement.ClaimDiscs. Filtered
        // through the territory rule (Territory.Claims), not the raw disc
        // union: a giant hex that only geometrically overlaps a disc but
        // isn't actually claimed (its footprint isn't fully covered) must
        // not count as this settlement's shoreline either.
        var trainGiants = await session.GiantsAsync(cancellationToken).ConfigureAwait(false);
        var discs = session.Store.Realm.DiscsOf(settled.Id).ToList();
        var hasShoreline = discs
            .SelectMany(disc => disc.Centre.WithinRadius(disc.Radius))
            .Distinct()
            .Where(coord => Territory.Claims(discs, coord, trainGiants))
            .Any(sampler.IsShoreline);

        var decision = settled.PlanTrain(
            unitType, count, now, Guid.CreateVersion7, buildingCoord, split, settlement.Owner?.IsPremium ?? false,
            hasShoreline, session.SpeedFactor);

        if (!decision.Accepted)
        {
            // Even a refused request may have completed work while settling
            // (a build, a training batch, or a starvation death), and that is
            // a real change worth keeping.
            await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
            return new TrainResult(decision.Rejection);
        }

        session.Apply(settlementId, settled.EnqueueTraining(decision.Orders, now));
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Settlement {Id} queued training {Count}x {Type} in {Parts} part(s), completing {CompletesAt}.",
            settlementId, count, unitType, decision.Orders.Count, decision.Orders.Max(o => o.CompletesAt));

        return new TrainResult(TrainRejection.None, decision.Orders, Clock: session.Clock, Now: now);
    }

    /// <summary>Starts a Town Square feast, charging its cost up front (economy.md section 6).</summary>
    public async Task<FeastResult> StartFeastAsync(Guid settlementId, CancellationToken cancellationToken = default)
    {
        // Settle first so the decision sees the stock as of now, and a feast
        // that just ended is already off the settlement. The feast is paid from the linked realm's shared stock.
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new FeastResult(FeastRejection.NoTownSquare);
        }

        if (!session.Clock.AllowsCommands)
        {
            return new FeastResult(FeastRejection.None, null, WorldPaused: true);
        }

        var now = session.Now;
        var settled = session.View(settlementId);

        var decision = settled.PlanFeast(now, session.SpeedFactor);
        if (!decision.Accepted)
        {
            await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
            return new FeastResult(decision.Rejection);
        }

        session.Apply(settlementId, settled.StartFeast(decision.Feast!, now));
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Settlement {Id} started a feast, ending {EndsAt} for {Renown} renown.",
            settlementId, decision.Feast!.EndsAt, decision.Feast.RenownGain);

        return new FeastResult(FeastRejection.None, decision.Feast);
    }

    /// <summary>
    /// Claims an onboarding quest reward (economy.md section 7): settles first,
    /// then plans and pays it into the stock (clamped to storage) and sets the
    /// quest's claimed bit in one save, so it pays exactly once.
    /// </summary>
    public async Task<ClaimQuestResult> ClaimQuestAsync(
        Guid settlementId, string questId, CancellationToken cancellationToken = default)
    {
        // Settle first so a building that just finished counts, and the reward
        // lands on the stock as of now (the linked realm's shared stock).
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new ClaimQuestResult(QuestRejection.None, SettlementNotFound: true);
        }

        if (!session.Clock.AllowsCommands)
        {
            return new ClaimQuestResult(QuestRejection.None, WorldPaused: true);
        }

        if (settlementId != session.FirstSettlementId)
        {
            return new ClaimQuestResult(QuestRejection.NotFirstSettlement);
        }

        var now = session.Now;
        var settled = session.View(settlementId);

        var decision = settled.PlanClaimQuest(questId);
        if (!decision.Accepted)
        {
            await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
            return new ClaimQuestResult(decision.Rejection);
        }

        session.Apply(settlementId, settled.ClaimQuest(decision.Quest!, now));
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Settlement {Id} claimed quest {Quest}.", settlementId, decision.Quest!.Id);

        return new ClaimQuestResult(QuestRejection.None, Settlement: session.Anchor, Clock: session.Clock);
    }

    /// <summary>
    /// Renames a settlement: the owner may do so any time, free, and names need not be unique. The caller passes the
    /// already trimmed and length-checked name; only the display name changes, nothing is settled or charged.
    /// </summary>
    public async Task<RenameSettlementResult> RenameAsync(
        Guid settlementId, string name, CancellationToken cancellationToken = default)
    {
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        var settlement = session?.Members.FirstOrDefault(m => m.Id == settlementId);
        if (session is null || settlement is null)
        {
            return new RenameSettlementResult(SettlementNotFound: true);
        }

        if (!session.Clock.AllowsCommands)
        {
            return new RenameSettlementResult(WorldPaused: true);
        }

        settlement.Name = name;
        await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Settlement {Id} was renamed.", settlementId);

        return new RenameSettlementResult(Settlement: settlement, Clock: session.Clock);
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

        // Ordered client-side: SQLite cannot order by a DateTimeOffset.
        var ids = (await _dbContext.Settlements
            .AsNoTracking()
            .Where(s => s.WorldId == worldId)
            .Select(s => new { s.Id, s.FoundedAt })
            .ToListAsync(cancellationToken).ConfigureAwait(false))
            .OrderBy(s => s.FoundedAt).ThenBy(s => s.Id)
            .Select(s => s.Id)
            .ToList();

        // Each player-and-island set (the linked realms of one player) is settled together under the old factor, then re-rated.
        // The world still carries the old factor here, which is what the group is loaded with.
        var handled = new HashSet<Guid>();
        foreach (var id in ids)
        {
            if (handled.Contains(id))
            {
                continue;
            }

            var session = await _groups.LoadAsync(id, settleTo: now, ct: cancellationToken).ConfigureAwait(false);
            if (session is null)
            {
                continue;
            }

            session.Store.Rerate(newFactor);
            await session.WriteBackAsync(cancellationToken).ConfigureAwait(false);
            handled.UnionWith(session.Members.Select(m => m.Id));
        }

        if (handled.Count > 0)
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }

        _logger.LogInformation(
            "World {WorldId} retuned from speed {Old} to {New} across {Count} settlement(s).",
            worldId, oldFactor, newFactor, handled.Count);
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
    /// <summary>The terrain sampler (bog laid over the seed) for a settlement's world — for the admin layout view.</summary>
    public Task<TerrainSampler> GetSamplerAsync(WorldEntity world, CancellationToken cancellationToken = default) =>
        WorldTerrain.SamplerAsync(_dbContext, world, cancellationToken);

    private async Task<Func<HexCoord, Terrain>> TerrainAtAsync(WorldEntity world, CancellationToken cancellationToken) =>
        (await WorldTerrain.SamplerAsync(_dbContext, world, cancellationToken).ConfigureAwait(false)).TerrainAt;

    /// <summary>
    /// What the river on <paramref name="coord"/> itself means for a build there: the shape of the river tile when it is a full-width
    /// river (<see langword="null"/> otherwise: the Sawmill's buildability rule, see
    /// <see cref="BuildingDefinition.RequiresRiverShape"/>: it's built directly on a river tile, and only a river-width tile has the art),
    /// and whether any river tile of any width stands there (<see cref="Settlement.PlanBuild"/>'s <c>onRiverTile</c>: a stream or a
    /// widening takes no building at all). Rivers are generated once per island and persisted (<see cref="IslandEntity.RiverTiles"/>), not
    /// derivable from the seed the way plain terrain is, so this needs a query.
    /// </summary>
    private async Task<(RiverTileShape? BuildableShape, bool OnRiverTile)> RiverSiteAsync(
        Guid worldId, HexCoord coord, CancellationToken cancellationToken)
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
                return (tile.Width == (int)RiverWidth.River ? (RiverTileShape)tile.Shape : null, true);
            }
        }

        return (null, false);
    }

    /// <summary>
    /// What a bridge's placement rule needs to know about <paramref name="coord"/>: the shape of the river tile standing there whatever its
    /// width (<see langword="null"/> when there is none), whether that tile is a wide river (<see cref="RiverIndex.IsWide"/>), and whether
    /// the island it lies on is a wasted one.
    /// </summary>
    private async Task<(RiverTileShape? Shape, bool IsWide, bool OnWastedIsland)> BridgeSiteAsync(
        Guid worldId, HexCoord coord, CancellationToken cancellationToken)
    {
        var rivers = await WorldRivers.IndexAsync(_dbContext, worldId, cancellationToken).ConfigureAwait(false);
        if (rivers.TileAt(coord) is not { } tile)
        {
            return (null, false, false);
        }

        var wasted = await WorldRivers.IsOnWastedIslandAsync(_dbContext, worldId, coord, cancellationToken).ConfigureAwait(false);
        return (tile.Shape, rivers.IsWide(coord), wasted);
    }

    /// <summary>
    /// Which gods already have a standing shrine somewhere on
    /// <paramref name="islandId"/>, at a hex other than
    /// (<paramref name="settlementId"/>, <paramref name="coord"/>) — spanning
    /// every settlement on the island, so a second settlement can't raise the
    /// same god's shrine just because it isn't the one that already has it
    /// (see <see cref="Settlement.PlanBuild"/>'s
    /// shrineGodsElsewhereOnIsland parameter).
    /// </summary>
    private async Task<IReadOnlySet<GodType>> ShrineGodsElsewhereOnIslandAsync(
        Guid islandId, Guid settlementId, HexCoord coord, CancellationToken cancellationToken)
    {
        var shrineTypesOnIsland = await _dbContext.PlacedBuildings
            .Where(b => b.Settlement!.IslandId == islandId
                && (b.SettlementId != settlementId || b.Q != coord.Q || b.R != coord.R))
            .Select(b => b.Type)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return shrineTypesOnIsland
            .Select(BuildingCatalogue.GodOf)
            .Where(god => god is not null)
            .Select(god => god!.Value)
            .ToHashSet();
    }

    /// <summary>
    /// Which crop <paramref name="islandId"/>'s island grows
    /// (<see cref="TerrainSampler.SoilAt"/>, from its stored centre) — or
    /// <see langword="null"/> if the island row is somehow missing, in which
    /// case <see cref="Settlement.PlanBuild"/> just skips the soil check
    /// rather than refusing every Farm/PumpkinFarm build outright.
    /// </summary>
    private async Task<SoilType?> IslandSoilAsync(Guid islandId, TerrainSampler sampler, CancellationToken cancellationToken)
    {
        var centre = await _dbContext.Islands
            .Where(i => i.Id == islandId)
            .Select(i => new { i.CentreQ, i.CentreR })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return centre is null ? null : sampler.SoilAt(new HexCoord(centre.CentreQ, centre.CentreR));
    }

    /// <summary>
    /// Every giant across every island of <paramref name="worldId"/> (the
    /// territory rule), built into one lookup — mirrors
    /// <see cref="RiverSiteAsync"/>'s own whole-world scan, and
    /// <c>ArmyService.LoadGiantIndexAsync</c> for the same reason.
    /// </summary>
    public Task<IGiantIndex> LoadGiantIndexAsync(Guid worldId, CancellationToken cancellationToken = default) =>
        WorldGiants.IndexAsync(_dbContext, worldId, cancellationToken);

    /// <summary>
    /// The world's <em>blocking</em> wildlife camps as of <paramref name="now"/>, built into one lookup for the build rule:
    /// camps that still have beasts (a cleared camp's hex is buildable) plus Fenrir's brood always — see
    /// <see cref="CampIndex.Blocking"/>.
    /// </summary>
    public Task<ICampIndex> LoadCampIndexAsync(Guid worldId, DateTimeOffset now, CancellationToken cancellationToken = default) =>
        _campService.LoadBlockingIndexAsync(worldId, now, cancellationToken);

    /// <summary>The world's Utgard wall hexes (rubble included) and Jötun watchtowers as one lookup for the build rule.</summary>
    public async Task<IEndgameSiteIndex> LoadEndgameSiteIndexAsync(Guid worldId, CancellationToken cancellationToken = default)
    {
        var islands = await _dbContext.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId && i.IsWasted)
            .Select(i => new { i.UtgardWalls, i.JotunTowers })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return new EndgameSiteIndex(islands.SelectMany(i =>
            i.UtgardWalls.Select(w => new HexCoord(w.Q, w.R)).Concat(i.JotunTowers.Select(t => new HexCoord(t.Q, t.R)))));
    }

    /// <summary>
    /// Loads the player's settlements on <paramref name="settlementId"/>'s island as one group, tracked and settled together
    /// (<see cref="LinkedGroupLoader.LoadAsync"/>), for a caller that saves itself: <see cref="LinkedGroupSession.Apply"/> its
    /// changes, <see cref="LinkedGroupSession.WriteBack"/> and save in its own unit of work.
    /// </summary>
    public Task<LinkedGroupSession?> LoadGroupAsync(
        Guid settlementId, DateTimeOffset? settleTo = null, bool forceRealm = false, CancellationToken cancellationToken = default) =>
        _groups.LoadAsync(settlementId, settleTo, forceRealm, cancellationToken);

    /// <summary>Writes the session back and saves when settling (or a refused request) changed anything: a real change worth keeping.</summary>
    private async Task SaveIfChangedAsync(LinkedGroupSession session, CancellationToken cancellationToken)
    {
        if (await session.WriteBackAsync(cancellationToken).ConfigureAwait(false))
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Brings the realm state (<see cref="Settlement.ApplyRealmState"/>) of every settlement of the player that owns
    /// <paramref name="settlementId"/> on its island up to the game clock now, and saves: the hook for a change that moved the
    /// realm (a tower burnt or sieged, a building placed or razed, a level set, a founding), so buildings that just fell outside
    /// stop working at once in every settlement of the player, not only the one that changed, and a newly founded settlement joins
    /// its linked realm's shared stock. One group load and one save. Call it after the change is saved.
    /// </summary>
    /// <returns>How many settlements changed.</returns>
    public async Task<int> ReconcileRealmAsync(Guid settlementId, CancellationToken cancellationToken = default) =>
        (await ApplyRealmStateAsync(settlementId, cancellationToken).ConfigureAwait(false))?.ChangedMembers.Count ?? 0;

    /// <summary>
    /// The periodic sweep: for every world that accepts commands, applies the realm state to the settlements that have a step due
    /// (<see cref="PlayerRealms.DueForRealmStepAsync"/>), so decay happens (and a reconnected building starts working) even when
    /// nobody looks at the settlement. One world failing never stops the others, and one group losing a write race never stops
    /// the rest of its world: each player's island set is its own unit of work through <see cref="ConcurrentWriteExecutor"/> (retried
    /// against fresh state), and one that still conflicts is skipped until the next sweep.
    /// </summary>
    /// <remarks>
    /// Only the hosted service and tests call this, never a request already running inside the executor, so the executor (which is
    /// not re-entrant) is safe to use here. <see cref="ReconcileRealmAsync"/> shares <see cref="ApplyRealmStateAsync"/> but is
    /// called from inside such requests, so the executor wraps the call here, not <see cref="ApplyRealmStateAsync"/> itself.
    /// </remarks>
    /// <returns>How many settlements changed.</returns>
    public async Task<int> SweepRealmStateAsync(CancellationToken cancellationToken = default)
    {
        var worlds = await _dbContext.Worlds.AsNoTracking().ToListAsync(cancellationToken).ConfigureAwait(false);
        var wall = _timeProvider.GetUtcNow();
        var changed = 0;

        foreach (var world in worlds)
        {
            var clock = world.ToClock();
            if (!clock.AllowsCommands)
            {
                continue;
            }

            try
            {
                var giants = await LoadGiantIndexAsync(world.Id, cancellationToken).ConfigureAwait(false);
                var due = await PlayerRealms.DueForRealmStepAsync(
                    _dbContext, world.Id, giants, clock.ToGameTime(wall), world.SpeedFactor, cancellationToken).ConfigureAwait(false);
                var handled = new HashSet<Guid>();
                foreach (var id in due)
                {
                    // Several due settlements of one player's island set are all handled by the first one's group.
                    if (handled.Contains(id))
                    {
                        continue;
                    }

                    try
                    {
                        var (count, members) = await _concurrentWriteExecutor.ExecuteAsync(
                            async ct =>
                            {
                                var session = await ApplyRealmStateAsync(id, ct).ConfigureAwait(false);
                                return session is null
                                    ? (0, [])
                                    : (session.ChangedMembers.Count, session.Members.Select(m => m.Id).ToList());
                            },
                            cancellationToken).ConfigureAwait(false);
                        changed += count;
                        handled.UnionWith(members);
                    }
                    catch (ConcurrentUpdateException ex)
                    {
                        _logger.LogInformation(ex, "Realm sweep of settlement {SettlementId} lost a write race; will retry next sweep.", id);
                    }
                    finally
                    {
                        _dbContext.ChangeTracker.Clear();
                    }
                }
            }
            catch (DbUpdateConcurrencyException ex)
            {
                _dbContext.ChangeTracker.Clear();
                _logger.LogInformation(ex, "Realm sweep in world {WorldId} lost a write race; will retry next sweep.", world.Id);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _dbContext.ChangeTracker.Clear();
                _logger.LogError(ex, "Realm sweep in world {WorldId} failed; will retry next sweep.", world.Id);
            }
        }

        return changed;
    }

    /// <summary>Settles the group of one settlement to the game clock now with its realm state applied, and saves when that changed anything.</summary>
    private async Task<LinkedGroupSession?> ApplyRealmStateAsync(Guid settlementId, CancellationToken cancellationToken)
    {
        var session = await _groups.LoadAsync(settlementId, forceRealm: true, ct: cancellationToken).ConfigureAwait(false);
        if (session is not null)
        {
            await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
        }

        return session;
    }

    private Task<bool> PlotTakenAsync(Guid worldId, HexCoord coord, CancellationToken cancellationToken) =>
        _dbContext.Settlements.AnyAsync(
            s => s.WorldId == worldId && s.CentreQ == coord.Q && s.CentreR == coord.R,
            cancellationToken);

    // `callerUserId` closes the cross-browser gap: a logged-in player's realm
    // keeps the OwnerId of the browser it was founded in, so an OwnerId-only
    // check would let the same account found a second realm in this world
    // from any other browser (a fresh local id) just by being logged in.
    private Task<bool> AlreadyFoundedAsync(
        Guid worldId, string ownerId, Guid? callerUserId, CancellationToken cancellationToken) =>
        _dbContext.Settlements.AnyAsync(
            s => s.WorldId == worldId
                && (s.OwnerId == ownerId || (callerUserId != null && s.UserId == callerUserId)),
            cancellationToken);

    /// <summary>
    /// The settlement (if any) this owner holds in this world — the "join
    /// another world" flow's membership check (<c>GET .../membership</c>).
    /// Same <c>(worldId, ownerId)</c> scoping as <see cref="AlreadyFoundedAsync"/>,
    /// but for the id/name a client needs rather than a plain bool. Read-only:
    /// callers must not use this to decide whether founding is allowed —
    /// <see cref="FoundAsync"/>'s own checks are the authority for that.
    /// </summary>
    public Task<SettlementEntity?> FindByOwnerAsync(
        Guid worldId, string ownerId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);

        return _dbContext.Settlements
            .FirstOrDefaultAsync(s => s.WorldId == worldId && s.OwnerId == ownerId, cancellationToken);
    }
}
