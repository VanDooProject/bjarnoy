using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>One building that can take part of a training order.</summary>
/// <param name="Coord">The building's hex.</param>
/// <param name="Level">The building's level (more levels train faster and win ties).</param>
/// <param name="Start">When the building is free: its current backlog's end, or now.</param>
/// <param name="UnitTime">Time one unit takes in this building.</param>
internal readonly record struct TrainingSlot(HexCoord Coord, int Level, DateTimeOffset Start, TimeSpan UnitTime);

/// <summary>Spreads a unit count over buildings (<see cref="TrainingSplit.Evenly"/>, <see cref="TrainingSplit.Fastest"/>).</summary>
internal static class TrainingPlanner
{
    /// <summary>Highest level first, then by hex, so every split is deterministic.</summary>
    private static IOrderedEnumerable<TrainingSlot> Ranked(IEnumerable<TrainingSlot> slots) =>
        slots.OrderByDescending(s => s.Level).ThenBy(s => s.Coord.Q).ThenBy(s => s.Coord.R);

    /// <summary>The count divided by the number of buildings; the remainder goes one each to the highest levels.</summary>
    public static IReadOnlyList<(TrainingSlot Slot, int Units)> Evenly(IReadOnlyList<TrainingSlot> slots, int count)
    {
        var ranked = Ranked(slots).ToList();
        var share = count / ranked.Count;
        var remainder = count % ranked.Count;
        return [.. ranked.Select((slot, i) => (slot, share + (i < remainder ? 1 : 0))).Where(x => x.Item2 > 0)];
    }

    /// <summary>
    /// The split in which the last unit finishes as early as possible: every unit goes to the building where it would finish
    /// first (ties: higher level, then hex). Found by binary search on the finish time instead of one step per unit.
    /// </summary>
    public static IReadOnlyList<(TrainingSlot Slot, int Units)> Fastest(
        IReadOnlyList<TrainingSlot> slots, int count, DateTimeOffset now)
    {
        var ranked = Ranked(slots).ToList();
        Int128 StartTicks(TrainingSlot s) => (s.Start - now).Ticks;
        Int128 UnitsBy(TrainingSlot s, Int128 t) => t < StartTicks(s) ? 0 : (t - StartTicks(s)) / s.UnitTime.Ticks;

        // The earliest finish time T (ticks after now) by which the buildings together can train `count` units.
        Int128 low = 0;
        var high = ranked.Min(s => StartTicks(s) + (Int128)count * s.UnitTime.Ticks);
        while (low < high)
        {
            var mid = low + (high - low) / 2;
            if (ranked.Aggregate((Int128)0, (sum, s) => sum + UnitsBy(s, mid)) >= count)
            {
                high = mid;
            }
            else
            {
                low = mid + 1;
            }
        }

        var units = ranked.Select(s => (int)UnitsBy(s, low)).ToArray();
        var excess = units.Sum() - count;

        // Units ending exactly at T are interchangeable in time; the lowest-ranked buildings give theirs up.
        for (var i = ranked.Count - 1; i >= 0 && excess > 0; i--)
        {
            if (units[i] > 0 && StartTicks(ranked[i]) + (Int128)units[i] * ranked[i].UnitTime.Ticks == low)
            {
                units[i]--;
                excess--;
            }
        }

        return [.. ranked.Select((slot, i) => (slot, units[i])).Where(x => x.Item2 > 0)];
    }
}
