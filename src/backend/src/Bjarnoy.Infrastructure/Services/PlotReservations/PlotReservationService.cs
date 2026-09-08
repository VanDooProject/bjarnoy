using System.Collections.Concurrent;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Infrastructure.Services.PlotReservations;

public enum PlotSuggestionRejection
{
    None = 0,
    WorldNotFound,
    AlreadyFounded,
    NoPlotAvailable,
}

public sealed record PlotSuggestion(
    Guid IslandId,
    HexCoord Plot,
    IReadOnlyList<HexCoord> Alternatives,
    bool Reserved,
    DateTimeOffset? ReservedUntil);

public sealed record PlotSuggestionResult(
    PlotSuggestionRejection Rejection,
    PlotSuggestion? Suggestion = null,
    Guid? ExistingSettlementId = null)
{
    public bool Accepted => Rejection == PlotSuggestionRejection.None && Suggestion is not null;
}

/// <summary>
/// Backend-owned counterpart to the landing page's old client-side plot
/// finder (deleted from <c>world.ts</c>): decides which hex/island a visitor
/// is offered, pins it per <c>OwnerId</c> across reloads, and holds it with a
/// short exclusive reservation so concurrent signups (a school on one
/// network) can't collide or have their plot pulled out from under them —
/// see <c>docs/plans/landing-plot-reservation.md</c> for the full design.
/// </summary>
/// <remarks>
/// The suggestion algorithm reuses <see cref="Founding.CheckSpacing"/> — the
/// exact same rule <c>SettlementService.FoundAsync</c> enforces — so a
/// suggested plot can only ever be rejected at founding time by a genuine
/// race, not by the two rules disagreeing.
/// </remarks>
public sealed class PlotReservationService(
    GameDbContext dbContext,
    IPlotReservationStore store,
    TimeProvider timeProvider,
    IOptions<PlotReservationOptions> options)
{
    /// <summary>
    /// How far apart two owners' pinned plots must be so that once either
    /// one founds, the other's plot still clears <c>FoundAsync</c>'s own
    /// spacing rule against the brand-new settlement:
    /// <c>SettlementService.MinimumSpacing (15) + FoundingSafetyMargin (2) = 17</c>,
    /// which is itself &gt; <c>MinimumSpacing</c> (15) &gt; a fresh level-1
    /// settlement's real claim radius + safety margin (2+2=4). See
    /// <c>PlotReservationSpacingTests</c> for the pinned chain.
    /// </summary>
    public static readonly int ReservationSpacing = SettlementService.MinimumSpacing + SettlementService.FoundingSafetyMargin;

    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> WorldLocks = new();

    private readonly GameDbContext _dbContext = dbContext;
    private readonly IPlotReservationStore _store = store;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly PlotReservationOptions _options = options.Value;

    private static SemaphoreSlim LockFor(Guid worldId) => WorldLocks.GetOrAdd(worldId, static _ => new SemaphoreSlim(1, 1));

    public async Task<PlotSuggestionResult> GetOrRefreshAsync(
        Guid worldId,
        string ownerId,
        string ipKey,
        string fingerprintKey,
        CancellationToken cancellationToken = default)
    {
        var world = await _dbContext.Worlds
            .FirstOrDefaultAsync(w => w.Id == worldId, cancellationToken)
            .ConfigureAwait(false);
        if (world is null)
        {
            return new PlotSuggestionResult(PlotSuggestionRejection.WorldNotFound);
        }

        var existingSettlementId = await _dbContext.Settlements
            .Where(s => s.WorldId == worldId && s.OwnerId == ownerId)
            .Select(s => (Guid?)s.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (existingSettlementId is not null)
        {
            _store.Release(worldId, ownerId);
            return new PlotSuggestionResult(PlotSuggestionRejection.AlreadyFounded, ExistingSettlementId: existingSettlementId);
        }

        var islands = await _dbContext.Islands
            .Where(i => i.WorldId == worldId)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (islands.Count == 0)
        {
            return new PlotSuggestionResult(PlotSuggestionRejection.NoPlotAvailable);
        }

        var neighboursByIsland = await LoadNeighboursByIslandAsync(worldId, cancellationToken).ConfigureAwait(false);

        bool IsValid(Guid islandId, HexCoord candidate) =>
            Founding.CheckSpacing(
                candidate,
                neighboursByIsland.GetValueOrDefault(islandId, []),
                SettlementService.MinimumSpacing,
                SettlementService.FoundingSafetyMargin) == Founding.SpacingVerdict.Ok
            && !_store.IsBlockedByOtherOwner(worldId, candidate, ownerId, ReservationSpacing);

        bool IsStartPosition(Guid islandId, HexCoord candidate) =>
            islands.Any(i => i.Id == islandId && i.StartPositions.Any(p => p.Q == candidate.Q && p.R == candidate.R));

        (Guid IslandId, HexCoord Plot)? pin = null;

        var reservation = _store.GetReservation(worldId, ownerId);
        if (reservation is not null
            && IsStartPosition(reservation.IslandId, reservation.Plot)
            && IsValid(reservation.IslandId, reservation.Plot))
        {
            pin = (reservation.IslandId, reservation.Plot);
        }
        else
        {
            var last = _store.GetLastSuggestion(worldId, ownerId);
            if (last is not null
                && IsStartPosition(last.IslandId, last.Plot)
                && IsValid(last.IslandId, last.Plot))
            {
                pin = (last.IslandId, last.Plot);
            }
        }

        if (pin is null)
        {
            var sem = LockFor(worldId);
            await sem.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                // Re-check after acquiring the lock: another request racing
                // for the same world may have just taken the plot we're
                // about to walk into.
                pin = ComputeFreshPin(worldId, ownerId, islands, neighboursByIsland, IsValid);
            }
            finally
            {
                sem.Release();
            }
        }

        if (pin is null)
        {
            return new PlotSuggestionResult(PlotSuggestionRejection.NoPlotAvailable);
        }

        var (islandId, plot) = pin.Value;
        var island = islands.First(i => i.Id == islandId);
        var alternatives = island.StartPositions
            .Select(p => new HexCoord(p.Q, p.R))
            .Where(c => c != plot && IsValid(islandId, c))
            .Take(_options.AlternativeCount)
            .ToList();

        var now = _timeProvider.GetUtcNow();
        _store.RememberSuggestion(new LastSuggestion(worldId, ownerId, islandId, plot, now + _options.LastSuggestionTtl));

        var settlementCount = await _dbContext.Settlements
            .CountAsync(s => s.WorldId == worldId, cancellationToken)
            .ConfigureAwait(false);
        var joinable = world.DetermineJoinability(settlementCount, now).Joinable;

        bool reserved = false;
        DateTimeOffset? reservedUntil = null;
        if (joinable
            && _store.CountLiveOwnersByIp(worldId, ipKey, ownerId) < _options.MaxReservationsPerIp
            && _store.CountLiveOwnersByFingerprint(worldId, fingerprintKey, ownerId) < _options.MaxReservationsPerFingerprint)
        {
            reservedUntil = now + _options.ReservationTtl;
            _store.UpsertReservation(new PlotReservation(worldId, ownerId, islandId, plot, ipKey, fingerprintKey, reservedUntil.Value));
            reserved = true;
        }

        return new PlotSuggestionResult(
            PlotSuggestionRejection.None,
            new PlotSuggestion(islandId, plot, alternatives, reserved, reservedUntil));
    }

    public void Release(Guid worldId, string ownerId) => _store.Release(worldId, ownerId);

    /// <summary>
    /// Islands ordered least-populated first (settlements plus other owners'
    /// live reservations), then by ring distance from the origin, then by
    /// index — spreads new players across islands ("one player per island as
    /// long as possible") while keeping the existing ring-outward-from-origin
    /// order as the tiebreak rather than replacing it.
    /// </summary>
    private (Guid IslandId, HexCoord Plot)? ComputeFreshPin(
        Guid worldId,
        string ownerId,
        List<Entities.IslandEntity> islands,
        Dictionary<Guid, List<Founding.NeighbourSnapshot>> neighboursByIsland,
        Func<Guid, HexCoord, bool> isValid)
    {
        var origin = new HexCoord(0, 0);
        var ordered = islands
            .Select(island => new
            {
                Island = island,
                Population = neighboursByIsland.GetValueOrDefault(island.Id, []).Count
                    + _store.LiveReservations(worldId, island.Id).Count(r => r.OwnerId != ownerId),
                Distance = origin.DistanceTo(new HexCoord(island.CentreQ, island.CentreR)),
            })
            .OrderBy(x => x.Population)
            .ThenBy(x => x.Distance)
            .ThenBy(x => x.Island.Index);

        foreach (var entry in ordered)
        {
            foreach (var position in entry.Island.StartPositions)
            {
                var candidate = new HexCoord(position.Q, position.R);
                if (isValid(entry.Island.Id, candidate))
                {
                    return (entry.Island.Id, candidate);
                }
            }
        }

        return null;
    }

    private async Task<Dictionary<Guid, List<Founding.NeighbourSnapshot>>> LoadNeighboursByIslandAsync(
        Guid worldId, CancellationToken cancellationToken)
    {
        var rows = await _dbContext.Settlements
            .Where(s => s.WorldId == worldId)
            .Select(s => new
            {
                s.IslandId,
                s.CentreQ,
                s.CentreR,
                Buildings = s.Buildings.Select(b => new { b.Q, b.R, b.Type, b.Level }).ToList(),
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows
            .GroupBy(r => r.IslandId)
            .ToDictionary(
                g => g.Key,
                g => g.Select(r => new Founding.NeighbourSnapshot(
                    new HexCoord(r.CentreQ, r.CentreR),
                    r.Buildings.Select(b => new PlacedBuilding(new HexCoord(b.Q, b.R), b.Type, b.Level)).ToList()))
                    .ToList());
    }
}
