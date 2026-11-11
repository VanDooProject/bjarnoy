using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Movement;

/// <summary>
/// The moment a marching army finds a wall that was built after it set out in its way (<c>docs/design/troop-movement-range.md</c> §5,
/// "Walls built after an army set out block it too"): at <paramref name="At"/> the wall on <paramref name="Hex"/>, index
/// <paramref name="BlockedIndex"/> of the leg's path, stands and the army has not entered that hex yet. <paramref name="OnReturnLeg"/> tells
/// whether that leg is the way home (the active leg of a returning army, or the stored return leg of an outbound one).
/// </summary>
public readonly record struct WallEncounter(DateTimeOffset At, HexCoord Hex, int BlockedIndex, bool OnReturnLeg);

/// <summary>Finds the first <see cref="WallEncounter"/> on a <see cref="Movement"/>. Pure.</summary>
public static class WallEncounters
{
    /// <summary>
    /// The earliest encounter at or before <paramref name="until"/>, or <see langword="null"/>. A hex <c>i</c> of a leg that starts at
    /// <c>start</c> is entered at <c>start + EdgeHours[i]</c>; a wall that blocks the army there (<paramref name="blockingSince"/>: the
    /// instant the hex blocks this army, <see langword="null"/> when it never does) and stands before that entry is found at
    /// <c>max(standing, start)</c>: an army only looks at its route when the leg begins, and at once when a wall goes up while it walks.
    /// </summary>
    /// <remarks>
    /// The active leg is scanned, and for an outbound army also its stored way home, scheduled from <see cref="Movement.TurnAroundAt"/>
    /// (so a wall on the way home is found when the army turns around at the earliest). An outbound army that turns around before entering
    /// a hex never enters it. The hex the army stands on is never in the way (index 0 is the leg's start). A stranded army goes nowhere.
    /// </remarks>
    public static WallEncounter? FindEarliest(
        Movement movement, Func<HexCoord, DateTimeOffset?> blockingSince, DateTimeOffset until)
    {
        ArgumentNullException.ThrowIfNull(movement);
        ArgumentNullException.ThrowIfNull(blockingSince);
        if (movement.IsStranded)
        {
            return null;
        }

        WallEncounter? best = null;
        Scan(movement.Path, movement.EdgeHours, movement.DepartedAt,
            movement.IsReturning ? DateTimeOffset.MaxValue : movement.TurnAroundAt, movement.IsReturning);
        if (!movement.IsReturning)
        {
            Scan(movement.ReturnPath, movement.ReturnEdgeHours, movement.TurnAroundAt, DateTimeOffset.MaxValue, onReturnLeg: true);
        }

        return best;

        void Scan(IReadOnlyList<HexCoord> path, IReadOnlyList<double> edgeHours, DateTimeOffset start, DateTimeOffset leaveBy, bool onReturnLeg)
        {
            for (var i = 1; i < path.Count; i++)
            {
                var entry = start + TimeSpan.FromHours(edgeHours[i]);
                if (entry > leaveBy)
                {
                    break;
                }

                if (blockingSince(path[i]) is not { } standing || standing >= entry)
                {
                    continue;
                }

                var at = standing > start ? standing : start;
                if (at <= until && (best is null || at < best.Value.At))
                {
                    best = new WallEncounter(at, path[i], i, onReturnLeg);
                }
            }
        }
    }
}
