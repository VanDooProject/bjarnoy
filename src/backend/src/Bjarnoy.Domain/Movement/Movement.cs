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

    /// <summary>
    /// Game-hours elapsed when the army crosses the edge into <c>Path[i]</c> (<c>EdgeHours[0]</c> is 0), see
    /// <see cref="HexPathfinder.EdgeHours"/>. Always between <c>CumulativeHours[i-1]</c> and <c>CumulativeHours[i]</c>. Same length as
    /// <see cref="Path"/>.
    /// </summary>
    public required IReadOnlyList<double> EdgeHours { get; init; }

    /// <summary>The precomputed homeward route from this leg's destination.</summary>
    public required IReadOnlyList<HexCoord> ReturnPath { get; init; }

    public required IReadOnlyList<double> ReturnCumulativeHours { get; init; }

    /// <summary>The edge-crossing schedule of <see cref="ReturnPath"/>, see <see cref="EdgeHours"/>.</summary>
    public required IReadOnlyList<double> ReturnEdgeHours { get; init; }

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

    /// <summary>
    /// Until when an army fleeing after a <em>lost field battle</em> is protected from field battles and camp ambushes
    /// (<c>docs/design/troop-movement-range.md</c> §2a): the battle instant plus <see cref="FleeProtection"/>. <see langword="null"/> for every
    /// other movement. Only <c>Army.ForceFieldRetreat</c> sets it; an order (recall, field order, retarget) builds a fresh movement without it,
    /// which is what ends the protection early. A meeting or an ambush entry is ruled out only while it lies before this instant.
    /// </summary>
    public DateTimeOffset? FieldBattleImmuneUntil { get; init; }

    /// <summary>How long a fleeing army is protected after the battle it lost.</summary>
    public static readonly TimeSpan FleeProtection = TimeSpan.FromHours(6);

    /// <summary>
    /// True for an army fleeing after a lost field battle (<see cref="FieldBattleImmuneUntil"/> set), on its way home or stranded. It takes
    /// field orders from where it is like a standing army (<c>docs/design/troop-movement-range.md</c> §2a); the order's fresh movement ends
    /// the flight and its protection.
    /// </summary>
    public bool IsFleeing => FieldBattleImmuneUntil is not null;

    /// <summary>Whether a field battle or camp ambush at <paramref name="at"/> is ruled out by the flee protection.</summary>
    public bool IsFieldBattleImmuneAt(DateTimeOffset at) => FieldBattleImmuneUntil is { } until && at < until;

    /// <summary>
    /// True for an army that cannot get home and so stands where it is (<see cref="Stranded"/>): its path is the single hex it stands on,
    /// it never turns around, and when its provisions run out the whole army starves (<c>docs/design/troop-movement-range.md</c> §2a).
    /// </summary>
    public bool IsStranded { get; init; }

    /// <summary>
    /// A stranded stand on <paramref name="hex"/> from <paramref name="at"/>. <see cref="TurnAroundAt"/> is set to <paramref name="at"/> here;
    /// <c>Army.Strand</c> replaces it with the instant the army starves.
    /// </summary>
    public static Movement Stranded(DateTimeOffset at, HexCoord hex) => new()
    {
        DepartedAt = at,
        Path = [hex],
        CumulativeHours = [0],
        EdgeHours = [0],
        ReturnPath = [hex],
        ReturnCumulativeHours = [0],
        ReturnEdgeHours = [0],
        TurnAroundAt = at,
        IsReturning = false,
        IsStranded = true,
    };

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
        IReadOnlyList<double> edgeHours,
        IReadOnlyList<HexCoord> returnPath,
        IReadOnlyList<double> returnCumulativeHours,
        IReadOnlyList<double> returnEdgeHours,
        double provisionsAtDeparture,
        double upkeepPerHour)
    {
        ArgumentNullException.ThrowIfNull(path);
        ArgumentNullException.ThrowIfNull(cumulativeHours);
        ArgumentNullException.ThrowIfNull(edgeHours);
        ArgumentNullException.ThrowIfNull(returnPath);
        ArgumentNullException.ThrowIfNull(returnEdgeHours);
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
            EdgeHours = edgeHours,
            ReturnPath = returnPath,
            ReturnCumulativeHours = returnCumulativeHours,
            ReturnEdgeHours = returnEdgeHours,
            TurnAroundAt = arrivesAt + TimeSpan.FromHours(standingHours),
            IsReturning = false,
        };
    }

    /// <summary>
    /// The hex the army stands on at <paramref name="now"/> — the last hex whose edge
    /// (<see cref="EdgeHours"/>) it has crossed, not a fractional point between two hexes, so the
    /// position switches at the shared edge rather than at the hex centre. Arrival stays on
    /// <see cref="CumulativeHours"/>. See the type-level remarks for why.
    /// </summary>
    public HexCoord PositionAt(DateTimeOffset now) => Path[ReachedIndexAt(now)];

    /// <summary>
    /// The index of the hex centre the marker has last passed at <paramref name="now"/> — the start of the leg a client interpolates
    /// along (centre to next centre), as opposed to <see cref="ReachedIndexAt"/>, which switches at the shared edge. Never behind
    /// <c>ReachedIndexAt - 1</c> and never ahead of it.
    /// </summary>
    public int CentreIndexAt(DateTimeOffset now)
    {
        if (now <= DepartedAt)
        {
            return 0;
        }

        var elapsedHours = (now - DepartedAt).TotalHours;
        if (elapsedHours >= CumulativeHours[^1])
        {
            return Path.Count - 1;
        }

        var index = 0;
        for (var i = 1; i < CumulativeHours.Count && CumulativeHours[i] <= elapsedHours; i++)
        {
            index = i;
        }

        return index;
    }

    /// <summary>
    /// Every hex of <see cref="Path"/> the army has stood on by <paramref name="at"/>: <c>Path[0..index]</c> where <c>index</c> is
    /// the one <see cref="PositionAt"/> reports (so the last element is always <see cref="PositionAt"/>). At or after
    /// <see cref="ArrivesAt"/> that is the whole path, before <see cref="DepartedAt"/> just the start hex.
    /// </summary>
    public IReadOnlyList<HexCoord> HexesReachedBy(DateTimeOffset at)
    {
        var index = ReachedIndexAt(at);
        return [.. Path.Take(index + 1)];
    }

    /// <summary>The index into <see cref="Path"/> of the hex <see cref="PositionAt"/> reports (the last edge crossed).</summary>
    public int ReachedIndexAt(DateTimeOffset now)
    {
        if (now <= DepartedAt)
        {
            return 0;
        }

        var elapsedHours = (now - DepartedAt).TotalHours;
        if (elapsedHours >= CumulativeHours[^1])
        {
            return Path.Count - 1;
        }

        var index = 0;
        for (var i = 1; i < EdgeHours.Count; i++)
        {
            if (EdgeHours[i] > elapsedHours)
            {
                break;
            }

            index = i;
        }

        return index;
    }
}
