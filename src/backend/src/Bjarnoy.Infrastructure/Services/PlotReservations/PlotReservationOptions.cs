namespace Bjarnoy.Infrastructure.Services.PlotReservations;

/// <summary>
/// Tuning for <see cref="PlotReservationService"/>, bound from the
/// <c>PlotReservation</c> config section — see <c>UserActivityOptions</c> for
/// the same convention.
/// </summary>
public sealed class PlotReservationOptions
{
    public const string SectionName = "PlotReservation";

    /// <summary>
    /// How long an exclusive reservation holds once granted, sliding: every
    /// suggestion GET for the same owner refreshes it back to this from now.
    /// </summary>
    public TimeSpan ReservationTtl { get; set; } = TimeSpan.FromMinutes(3);

    /// <summary>
    /// How long the non-exclusive "last plot we offered this owner" memory
    /// is kept — a ceiling, not a guarantee (always re-validated live); see
    /// <see cref="LastSuggestion"/>'s remarks.
    /// </summary>
    public TimeSpan LastSuggestionTtl { get; set; } = TimeSpan.FromHours(24);

    /// <summary>
    /// Abuse cap: at most this many distinct owners may hold a live
    /// exclusive reservation under the same IP before further owners from
    /// that IP still get a suggestion, just not an exclusive hold on it.
    /// Generous on purpose — a school/office NAT is one IP for many real
    /// visitors.
    /// </summary>
    public int MaxReservationsPerIp { get; set; } = 8;

    /// <summary>
    /// Abuse cap: at most this many distinct owners may hold a live
    /// exclusive reservation under the same browser fingerprint. Tighter
    /// than the IP cap — a fingerprint approximates one device, aimed at
    /// incognito-window <c>OwnerId</c> churn from the same visitor.
    /// </summary>
    public int MaxReservationsPerFingerprint { get; set; } = 3;

    /// <summary>How many additional, advisory (not individually reserved) plots to offer alongside the pinned one.</summary>
    public int AlternativeCount { get; set; } = 5;
}
