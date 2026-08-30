using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Trade;

/// <summary>A hex on a frozen path, with the cumulative travel time to reach it.</summary>
public readonly record struct CartWaypoint(HexCoord Coord, double CumulativeHours);

/// <summary>
/// A cart's journey between two hexes: a departure timestamp plus a path
/// frozen at dispatch, cumulative hours included. Where the cart <em>is</em>
/// is a pure read (<see cref="PositionAt"/>) — the same "truth from time"
/// trick as <c>ResourcePool.At</c>, applied to space instead of stock. Nothing
/// moves a <see cref="CartMovement"/>; reading it at T tells you where it is
/// at T.
/// </summary>
/// <remarks>
/// Mirrors the <c>Movement</c> record from issue #40 (troop movement).
/// Pathing here is a straight hex line rather than #40's terrain-costed A* —
/// carts in v1 are land-only and unopposed, so a shortest-path line is enough
/// to produce a meaningful travel time; swapping in A* later (once #40 lands)
/// only changes <see cref="Create"/>, not this record's shape or any caller.
/// </remarks>
public sealed record CartMovement
{
    public required DateTimeOffset DepartedAt { get; init; }

    /// <summary>The frozen path, start hex through destination hex inclusive.</summary>
    public required IReadOnlyList<CartWaypoint> Path { get; init; }

    public DateTimeOffset ArrivesAt => DepartedAt.AddHours(Path[^1].CumulativeHours);

    public bool HasArrived(DateTimeOffset now) => now >= ArrivesAt;

    /// <summary>
    /// The hex this cart occupies at <paramref name="now"/>, interpolated over
    /// the frozen <see cref="Path"/>. A pure read; the movement is unchanged.
    /// </summary>
    public HexCoord PositionAt(DateTimeOffset now)
    {
        var elapsedHours = (now - DepartedAt).TotalHours;
        if (elapsedHours <= 0)
        {
            return Path[0].Coord;
        }

        foreach (var waypoint in Path)
        {
            if (elapsedHours <= waypoint.CumulativeHours)
            {
                return waypoint.Coord;
            }
        }

        return Path[^1].Coord;
    }

    /// <summary>
    /// Freezes a straight-line path from <paramref name="from"/> to
    /// <paramref name="to"/> at <paramref name="speedHexesPerHour"/>, departing
    /// <paramref name="departedAt"/>.
    /// </summary>
    public static CartMovement Create(HexCoord from, HexCoord to, double speedHexesPerHour, DateTimeOffset departedAt)
    {
        if (speedHexesPerHour <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(speedHexesPerHour), speedHexesPerHour, "Cart speed must be positive.");
        }

        var line = HexLine(from, to);
        var path = new List<CartWaypoint>(line.Count);
        for (var step = 0; step < line.Count; step++)
        {
            path.Add(new CartWaypoint(line[step], step / speedHexesPerHour));
        }

        return new CartMovement { DepartedAt = departedAt, Path = path };
    }

    /// <summary>The hexes on a straight line between <paramref name="a"/> and <paramref name="b"/>, inclusive of both ends.</summary>
    private static IReadOnlyList<HexCoord> HexLine(HexCoord a, HexCoord b)
    {
        var steps = HexCoord.Distance(a, b);
        if (steps == 0)
        {
            return [a];
        }

        var result = new List<HexCoord>(steps + 1);
        for (var i = 0; i <= steps; i++)
        {
            var t = (double)i / steps;
            result.Add(CubeRound(
                a.Q + ((b.Q - a.Q) * t),
                a.R + ((b.R - a.R) * t),
                a.S + ((b.S - a.S) * t)));
        }

        return result;
    }

    /// <summary>Rounds a fractional cube coordinate to the nearest hex, correcting the axis with the largest rounding error so <c>Q + R + S</c> stays zero.</summary>
    private static HexCoord CubeRound(double q, double r, double s)
    {
        var roundedQ = Math.Round(q);
        var roundedR = Math.Round(r);
        var roundedS = Math.Round(s);

        var qDiff = Math.Abs(roundedQ - q);
        var rDiff = Math.Abs(roundedR - r);
        var sDiff = Math.Abs(roundedS - s);

        if (qDiff > rDiff && qDiff > sDiff)
        {
            roundedQ = -roundedR - roundedS;
        }
        else if (rDiff > sDiff)
        {
            roundedR = -roundedQ - roundedS;
        }

        return new HexCoord((int)roundedQ, (int)roundedR);
    }
}
