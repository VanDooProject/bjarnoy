using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Movement;

/// <summary>
/// One hex an army occupies during a half-open time window
/// <c>[Start, End)</c> along a <see cref="Movement"/>'s <see cref="Movement.Path"/>
/// (issue #206 §5). <paramref name="End"/> is <see langword="null"/> for the
/// last hex of the path — an open-ended <c>[Start, +∞)</c> window, since
/// nothing in this frozen <see cref="Movement"/> snapshot says when (or
/// whether) the army ever leaves it; this is also exactly the "stationary
/// army / deliberately holding position" case the design calls out
/// explicitly, since a one-hex <see cref="Movement.Path"/>'s only hex is
/// simultaneously its first and its last.
/// </summary>
public readonly record struct HexOccupancy(HexCoord Hex, DateTimeOffset Start, DateTimeOffset? End)
{
    /// <summary>Whether this occupancy window overlaps <paramref name="otherStart"/>/<paramref name="otherEnd"/> (same half-open-interval convention).</summary>
    public bool Overlaps(DateTimeOffset otherStart, DateTimeOffset? otherEnd)
    {
        if (End is { } end && otherStart >= end)
        {
            return false;
        }

        if (otherEnd is { } oEnd && Start >= oEnd)
        {
            return false;
        }

        return true;
    }
}

/// <summary>
/// Turns a <see cref="Movement"/>'s frozen route into the exact per-hex
/// occupancy windows an interception check needs (issue #206 §5/§6) — the
/// expensive, exact half of detection, only ever run against candidates that
/// already survived the cheap scalar-column pre-filter (owner/guild, time
/// window, bounding box, island).
/// </summary>
public static class MovementOccupancy
{
    /// <summary>
    /// Every hex this <paramref name="movement"/> occupies, in path order.
    /// The general rule — hex <c>i</c> occupies <c>[c_i, c_{i+1})</c> — needs
    /// no special case for a one-hex (stationary/holding) path: with no
    /// <c>c_1</c> to bound it, hex 0's window is already open-ended by the
    /// same "no known end" reasoning that gives every path's *last* hex an
    /// open-ended window (see <see cref="HexOccupancy"/>'s remarks).
    /// </summary>
    public static IReadOnlyList<HexOccupancy> Compute(Movement movement)
    {
        ArgumentNullException.ThrowIfNull(movement);

        var result = new List<HexOccupancy>(movement.Path.Count);
        for (var i = 0; i < movement.Path.Count; i++)
        {
            var start = movement.DepartedAt + TimeSpan.FromHours(movement.CumulativeHours[i]);
            DateTimeOffset? end = i + 1 < movement.Path.Count
                ? movement.DepartedAt + TimeSpan.FromHours(movement.CumulativeHours[i + 1])
                : null;
            result.Add(new HexOccupancy(movement.Path[i], start, end));
        }

        return result;
    }

    /// <summary>
    /// The earliest instant two movements share a hex during overlapping
    /// windows, excluding <paramref name="excludeHex"/> (issue #206 §5's
    /// "home hex arrivals are excluded from interception" rule — the caller
    /// passes each side's own home hex). Edge-swap — two armies crossing in
    /// opposite directions without ever sharing a hex, even when their
    /// crossing instants are numerically identical — is never reported as a
    /// meeting: it simply never produces a shared <see cref="HexOccupancy.Hex"/>
    /// in the first place, so no special-case logic is needed to exclude it
    /// (issue #206's own design history: this was considered and dropped).
    /// </summary>
    public static (HexCoord Hex, DateTimeOffset At)? EarliestMeeting(
        Movement a, Movement b, HexCoord? excludeHexA = null, HexCoord? excludeHexB = null)
    {
        var occupancyA = Compute(a);
        var occupancyB = Compute(b);

        (HexCoord Hex, DateTimeOffset At)? earliest = null;

        foreach (var oa in occupancyA)
        {
            if (excludeHexA is { } exA && oa.Hex == exA)
            {
                continue;
            }

            foreach (var ob in occupancyB)
            {
                if (!oa.Hex.Equals(ob.Hex))
                {
                    continue;
                }

                if (excludeHexB is { } exB && ob.Hex == exB)
                {
                    continue;
                }

                if (!oa.Overlaps(ob.Start, ob.End))
                {
                    continue;
                }

                var meetAt = oa.Start > ob.Start ? oa.Start : ob.Start;
                if (earliest is null || meetAt < earliest.Value.At)
                {
                    earliest = (oa.Hex, meetAt);
                }
            }
        }

        return earliest;
    }
}
