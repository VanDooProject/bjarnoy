using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Movement;

/// <summary>
/// The short stretch of a foreign army's active leg a viewer may see: rebased so it starts at the hex the marker last passed, with its
/// own departure and arrival instants and hour schedules. Carries nothing else of the <see cref="Movement"/> (no return route).
/// </summary>
public sealed record ForeignRouteStretch(
    DateTimeOffset DepartedAt,
    IReadOnlyList<HexCoord> Path,
    IReadOnlyList<double> CumulativeHours,
    IReadOnlyList<double> EdgeHours,
    DateTimeOffset ArrivesAt)
{
    /// <summary>Hexes the stretch reaches beyond the army's current hex (the one more out-of-sight hex of the rule comes on top).</summary>
    public const int LookAheadHexes = 2;

    /// <summary>
    /// Clips <paramref name="movement"/>'s active leg to what the viewer sees at <paramref name="now"/> (<c>docs/design/map-fog-v2.md</c> §1g):
    /// from the hex the marker is leaving (the leg start a client interpolates from; nothing further behind) up to
    /// <see cref="LookAheadHexes"/> hexes beyond the army's current hex, ending early after the first hex that is out of
    /// <paramref name="inSight"/> — that one hex is the "+1". The result is rebased to its own start: the marker moves along it exactly as
    /// along the full leg, but the rest of the route stays unknown.
    /// </summary>
    public static ForeignRouteStretch Clip(Movement movement, DateTimeOffset now, Func<HexCoord, bool> inSight)
    {
        ArgumentNullException.ThrowIfNull(movement);
        ArgumentNullException.ThrowIfNull(inSight);

        var start = movement.CentreIndexAt(now);
        var current = movement.ReachedIndexAt(now);
        var last = movement.Path.Count - 1;

        var end = Math.Max(current, start);
        for (var step = 0; step < LookAheadHexes && end < last;)
        {
            end++;
            step++;
            if (!inSight(movement.Path[end]))
            {
                break;
            }
        }

        var offset = movement.CumulativeHours[start];
        var path = new List<HexCoord>();
        var cumulative = new List<double>();
        var edges = new List<double>();
        for (var i = start; i <= end; i++)
        {
            path.Add(movement.Path[i]);
            cumulative.Add(movement.CumulativeHours[i] - offset);
            edges.Add(i == start ? 0 : movement.EdgeHours[i] - offset);
        }

        return new ForeignRouteStretch(
            movement.DepartedAt + TimeSpan.FromHours(offset),
            path,
            cumulative,
            edges,
            movement.DepartedAt + TimeSpan.FromHours(movement.CumulativeHours[end]));
    }
}
