using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Movement;

/// <summary>
/// A frozen route an army is travelling, computed once at dispatch (or at
/// recall / turn-around, which each replace it with a fresh one) — never
/// mutated afterwards.
/// </summary>
/// <remarks>
/// <para>
/// Same "truth is a pure function of time" trick <c>ResourcePool</c> applies
/// to resources, applied to space: an army's current hex is never stored,
/// only derived from <see cref="DepartedAt"/>/<see cref="Path"/>/
/// <see cref="CumulativeHours"/> by <see cref="PositionAt"/> on read.
/// </para>
/// <para>
/// <see cref="PositionAt"/> reports the last hex actually reached rather than
/// interpolating a fractional position between two hexes — simpler for v1
/// and good enough for both display and for <c>Army.Recall</c>, which only
/// needs "the nearest hex reached" to build a new route home from. Smooth
/// interpolation is a frontend rendering concern that can be layered on
/// later without changing this shape.
/// </para>
/// <para>
/// <see cref="ReturnPath"/>/<see cref="ReturnCumulativeHours"/>/
/// <see cref="TurnAroundAt"/> are precomputed at construction against the
/// provisions and upkeep known then, so dispatch can validate the whole round
/// trip up front (see <c>Army.PlanDispatch</c>). <see cref="IsReturning"/>
/// distinguishes the outbound leg from the return leg: once
/// <c>Army.SettleTo</c> turns an army around, it builds a *new*
/// <see cref="Movement"/> whose <see cref="Path"/>/<see cref="CumulativeHours"/>
/// are the old <see cref="ReturnPath"/>/<see cref="ReturnCumulativeHours"/>
/// and whose own <see cref="ReturnPath"/> just mirrors itself (there is
/// nowhere further to go home from) — this keeps <see cref="PositionAt"/> and
/// <see cref="ArrivesAt"/> the same two-line computation for both legs,
/// rather than branching internally on which leg is active.
/// </para>
/// </remarks>
public sealed record Movement
{
    public required DateTimeOffset DepartedAt { get; init; }

    /// <summary>Full route for the currently active leg, start hex included.</summary>
    public required IReadOnlyList<HexCoord> Path { get; init; }

    /// <summary>
    /// Game-hours elapsed to reach <c>Path[i]</c> from <c>Path[0]</c>
    /// (<c>CumulativeHours[0]</c> is always 0). Same length as <see cref="Path"/>.
    /// </summary>
    public required IReadOnlyList<double> CumulativeHours { get; init; }

    /// <summary>The precomputed homeward route from this leg's destination.</summary>
    public required IReadOnlyList<HexCoord> ReturnPath { get; init; }

    public required IReadOnlyList<double> ReturnCumulativeHours { get; init; }

    /// <summary>
    /// The instant remaining provisions exactly cover the precomputed return
    /// trip — the moment <c>Army.SettleTo</c> turns the army around. Capped so
    /// it is never later than provisions physically running out; see
    /// <see cref="Create"/>.
    /// </summary>
    public required DateTimeOffset TurnAroundAt { get; init; }

    /// <summary>
    /// Whether this <see cref="Movement"/> instance <em>is</em> the return
    /// leg (built by <c>Army.SettleTo</c> or <c>Army.Recall</c>) rather than
    /// the original outbound leg from dispatch.
    /// </summary>
    public bool IsReturning { get; init; }

    /// <summary>When this leg's <see cref="Path"/> is fully travelled.</summary>
    public DateTimeOffset ArrivesAt => DepartedAt + TimeSpan.FromHours(CumulativeHours[^1]);

    /// <summary>When the precomputed <see cref="ReturnPath"/> would complete, were it started at <see cref="TurnAroundAt"/>.</summary>
    public DateTimeOffset ReturnArrivesAt => TurnAroundAt + TimeSpan.FromHours(ReturnCumulativeHours[^1]);

    /// <summary>
    /// Builds the outbound leg, computing <see cref="TurnAroundAt"/> from the
    /// provisions loaded and the upkeep the army burns per hour.
    /// </summary>
    /// <remarks>
    /// <paramref name="provisionsAtDeparture"/> must already have been
    /// validated (by <c>Army.PlanDispatch</c>) as enough for the whole round
    /// trip — this only decides <em>when</em> the turn happens, not whether
    /// it is affordable at all.
    /// </remarks>
    public static Movement Create(
        DateTimeOffset departedAt,
        IReadOnlyList<HexCoord> path,
        IReadOnlyList<double> cumulativeHours,
        IReadOnlyList<HexCoord> returnPath,
        IReadOnlyList<double> returnCumulativeHours,
        double provisionsAtDeparture,
        double upkeepPerHour)
    {
        ArgumentNullException.ThrowIfNull(path);
        ArgumentNullException.ThrowIfNull(cumulativeHours);
        ArgumentNullException.ThrowIfNull(returnPath);
        ArgumentNullException.ThrowIfNull(returnCumulativeHours);

        var arrivesAt = departedAt + TimeSpan.FromHours(cumulativeHours[^1]);
        var outboundCost = cumulativeHours[^1] * upkeepPerHour;
        var returnCost = returnCumulativeHours[^1] * upkeepPerHour;
        var provisionsAtArrival = Math.Max(0, provisionsAtDeparture - outboundCost);

        // No unit in the catalogue has zero upkeep, so this is defensive
        // rather than a real case: with no food burn there is nothing to
        // trigger an automatic return, so stand for zero time rather than
        // model an infinite wait. A fuller in-field-starvation/standing model
        // is future work (issue #40 design doc notes this as an edge case).
        var standingHours = upkeepPerHour > 0
            ? Math.Max(0, (provisionsAtArrival - returnCost) / upkeepPerHour)
            : 0;

        return new Movement
        {
            DepartedAt = departedAt,
            Path = path,
            CumulativeHours = cumulativeHours,
            ReturnPath = returnPath,
            ReturnCumulativeHours = returnCumulativeHours,
            TurnAroundAt = arrivesAt + TimeSpan.FromHours(standingHours),
            IsReturning = false,
        };
    }

    /// <summary>
    /// The hex reached by <paramref name="now"/> — the last hex whose
    /// cumulative hour has passed, not a fractional point between two hexes.
    /// See the type-level remarks for why.
    /// </summary>
    public HexCoord PositionAt(DateTimeOffset now)
    {
        if (now <= DepartedAt)
        {
            return Path[0];
        }

        var elapsedHours = (now - DepartedAt).TotalHours;
        if (elapsedHours >= CumulativeHours[^1])
        {
            return Path[^1];
        }

        var index = 0;
        for (var i = 1; i < CumulativeHours.Count; i++)
        {
            if (CumulativeHours[i] > elapsedHours)
            {
                break;
            }

            index = i;
        }

        return Path[index];
    }
}
