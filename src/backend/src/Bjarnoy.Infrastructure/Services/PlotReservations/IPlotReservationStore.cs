using Bjarnoy.Domain.World;

namespace Bjarnoy.Infrastructure.Services.PlotReservations;

/// <summary>
/// A short-lived, exclusive hold on a plot for one visitor: blocks every
/// other owner from founding within <c>PlotReservationService.ReservationSpacing</c>
/// hexes of <see cref="Plot"/> while <see cref="ExpiresAt"/> is still in the
/// future. Sliding — every suggestion GET for the same owner refreshes it.
/// </summary>
public sealed record PlotReservation(
    Guid WorldId,
    string OwnerId,
    Guid IslandId,
    HexCoord Plot,
    string IpKey,
    string FingerprintKey,
    DateTimeOffset ExpiresAt);

/// <summary>
/// A non-exclusive memory of the last plot offered to an owner. Holds no
/// lock and blocks nobody — it exists purely so a visitor who lets their
/// exclusive <see cref="PlotReservation"/> lapse (idle tab, slow signup)
/// gets re-offered the same plot if it is still free, instead of a freshly
/// randomised one every time they check back. Always re-validated against
/// live settlements/reservations before being reused; <see cref="ExpiresAt"/>
/// is a ceiling, not a guarantee that the plot is still theirs to take.
/// </summary>
public sealed record LastSuggestion(
    Guid WorldId,
    string OwnerId,
    Guid IslandId,
    HexCoord Plot,
    DateTimeOffset ExpiresAt);

/// <summary>
/// Storage for landing-page plot suggestions/reservations, scoped per world.
/// See <see cref="InMemoryPlotReservationStore"/>'s remarks for why this is
/// process-local by design, and <c>PlotReservationService</c> for the
/// suggestion algorithm built on top of it.
/// </summary>
public interface IPlotReservationStore
{
    PlotReservation? GetReservation(Guid worldId, string ownerId);

    /// <summary>Every live (non-expired) reservation in the world, optionally scoped to one island.</summary>
    IReadOnlyList<PlotReservation> LiveReservations(Guid worldId, Guid? islandId = null);

    /// <summary>How many distinct owners other than <paramref name="excludingOwnerId"/> hold a live reservation under this IP.</summary>
    int CountLiveOwnersByIp(Guid worldId, string ipKey, string excludingOwnerId);

    /// <summary>How many distinct owners other than <paramref name="excludingOwnerId"/> hold a live reservation under this fingerprint.</summary>
    int CountLiveOwnersByFingerprint(Guid worldId, string fingerprintKey, string excludingOwnerId);

    /// <summary>Creates or refreshes (sliding expiry) an owner's exclusive reservation.</summary>
    void UpsertReservation(PlotReservation reservation);

    LastSuggestion? GetLastSuggestion(Guid worldId, string ownerId);

    /// <summary>Creates or refreshes (sliding expiry) an owner's non-exclusive last-suggestion memory.</summary>
    void RememberSuggestion(LastSuggestion suggestion);

    /// <summary>Removes both the reservation and the last-suggestion memory for this owner (founding, explicit release, or the owner already having founded).</summary>
    void Release(Guid worldId, string ownerId);

    /// <summary>
    /// Whether <paramref name="plot"/> falls within <paramref name="reservationSpacing"/>
    /// hexes of a live reservation held by an owner other than <paramref name="ownerId"/>.
    /// </summary>
    bool IsBlockedByOtherOwner(Guid worldId, HexCoord plot, string ownerId, int reservationSpacing);

    /// <summary>Drops every reservation/last-suggestion for a world (e.g. admin world regeneration/reset).</summary>
    void ClearWorld(Guid worldId);
}
