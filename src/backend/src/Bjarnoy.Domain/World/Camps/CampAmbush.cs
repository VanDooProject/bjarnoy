using Bjarnoy.Domain.Movement;

namespace Bjarnoy.Domain.World;

/// <summary>An aggressive camp catching a marching army: which camp, when, and on which hex of the army's route.</summary>
public readonly record struct CampAmbushHit(Camp Camp, DateTimeOffset At, HexCoord Hex);

/// <summary>Finds the camp ambush an army's route runs into.</summary>
public static class CampAmbush
{
    /// <summary>
    /// The earliest ambush on <paramref name="movement"/> in <c>(from, until]</c>, or null.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The route is walked in time order: the active leg's <see cref="Movement.Path"/> from
    /// <see cref="Movement.DepartedAt"/> by <see cref="Movement.CumulativeHours"/> and, for an outbound
    /// movement, the precomputed <see cref="Movement.ReturnPath"/> from <see cref="Movement.TurnAroundAt"/>
    /// by <see cref="Movement.ReturnCumulativeHours"/> (a returning movement already is its return leg).
    /// An army that is turned around by hand or retreating on an immune leg (<see cref="Movement.RetreatImmune"/>) is never ambushed.
    /// </para>
    /// <para>
    /// A camp is entered at the first hex of a stretch inside its guard range (distance at most
    /// <see cref="Camp.GuardRange"/>); the very first hex of the route counts as an entry at the span
    /// start (<see cref="Movement.DepartedAt"/>). Leaving and re-entering the range is a new entry. An entry
    /// ambushes when it lies in the window and the camp is aggressive at that instant; the earliest such
    /// entry across all camps wins, ties going to the lowest q then r. The camp at
    /// <paramref name="exemptCamp"/> (the hunt's own target) is skipped.
    /// </para>
    /// </remarks>
    /// <param name="insideRealm">Whether a camp's hex lies inside some realm (it decides respawn of cleared camps).</param>
    /// <param name="from">The last settled instant: earlier entries were already processed.</param>
    /// <param name="until">Now.</param>
    public static CampAmbushHit? FindEarliest(
        Movement.Movement movement,
        IEnumerable<(Camp Camp, CampState State)> camps,
        Func<HexCoord, bool> insideRealm,
        HexCoord? exemptCamp,
        DateTimeOffset from,
        DateTimeOffset until)
    {
        ArgumentNullException.ThrowIfNull(movement);
        ArgumentNullException.ThrowIfNull(camps);
        ArgumentNullException.ThrowIfNull(insideRealm);

        if (movement.RetreatImmune)
        {
            return null;
        }

        var steps = new List<(HexCoord Hex, DateTimeOffset At)>();
        for (var i = 0; i < movement.Path.Count; i++)
        {
            steps.Add((movement.Path[i], movement.DepartedAt + TimeSpan.FromHours(movement.CumulativeHours[i])));
        }

        if (!movement.IsReturning)
        {
            for (var i = 0; i < movement.ReturnPath.Count; i++)
            {
                steps.Add((movement.ReturnPath[i], movement.TurnAroundAt + TimeSpan.FromHours(movement.ReturnCumulativeHours[i])));
            }
        }

        CampAmbushHit? best = null;
        foreach (var (camp, state) in camps)
        {
            if (exemptCamp is { } exempt && exempt == camp.Coord)
            {
                continue;
            }

            var wasInRange = false;
            foreach (var (hex, at) in steps)
            {
                if (at > until)
                {
                    break;
                }

                var inRange = hex.DistanceTo(camp.Coord) <= camp.GuardRange;
                var entered = inRange && !wasInRange;
                wasInRange = inRange;

                if (!entered || at <= from)
                {
                    continue;
                }

                if (!state.IsAggressiveAt(camp, at, insideRealm(camp.Coord)))
                {
                    continue;
                }

                var hit = new CampAmbushHit(camp, at, hex);
                if (best is null || IsBefore(hit, best.Value))
                {
                    best = hit;
                }

                break;
            }
        }

        return best;
    }

    private static bool IsBefore(CampAmbushHit a, CampAmbushHit b)
    {
        if (a.At != b.At)
        {
            return a.At < b.At;
        }

        return a.Camp.Coord.Q != b.Camp.Coord.Q ? a.Camp.Coord.Q < b.Camp.Coord.Q : a.Camp.Coord.R < b.Camp.Coord.R;
    }
}
