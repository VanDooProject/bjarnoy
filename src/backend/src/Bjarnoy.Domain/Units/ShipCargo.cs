namespace Bjarnoy.Domain.Units;

/// <summary>
/// Land troops aboard ships (<c>docs/design/economy.md</c>, "Troops on ships"): ships offer slots
/// (<see cref="UnitDefinition.ShipSlots"/>), every other unit takes some (<see cref="UnitDefinition.CargoSlots"/>). The one place that
/// counts them, so dispatch, battles, ambushes and hunts all agree.
/// </summary>
public static class ShipCargo
{
    public static bool IsShip(UnitType type) => UnitCatalogue.Get(type).Class == UnitClass.Ship;

    /// <summary>The ship stacks of <paramref name="stacks"/>.</summary>
    public static IReadOnlyList<UnitStack> Ships(IEnumerable<UnitStack> stacks) =>
        [.. stacks.Where(s => s.Count > 0 && IsShip(s.Type))];

    /// <summary>The non-ship stacks of <paramref name="stacks"/>: the passengers of a fleet.</summary>
    public static IReadOnlyList<UnitStack> Passengers(IEnumerable<UnitStack> stacks) =>
        [.. stacks.Where(s => s.Count > 0 && !IsShip(s.Type))];

    /// <summary>Slots the ships among <paramref name="stacks"/> offer.</summary>
    public static int SlotsOffered(IEnumerable<UnitStack> stacks) =>
        stacks.Sum(s => UnitCatalogue.Get(s.Type).ShipSlots * s.Count);

    /// <summary>Slots the non-ship units among <paramref name="stacks"/> take aboard.</summary>
    public static int SlotsNeeded(IEnumerable<UnitStack> stacks) =>
        stacks.Sum(s => UnitCatalogue.Get(s.Type).CargoSlots * s.Count);

    /// <summary>
    /// The pace of <paramref name="stacks"/>: a fleet (any ship among them) moves at its slowest ship, passengers do not slow it;
    /// a land army at its slowest unit. Zero for no stacks.
    /// </summary>
    public static double Pace(IReadOnlyList<UnitStack> stacks)
    {
        if (stacks.Count == 0)
        {
            return 0;
        }

        var ships = Ships(stacks);
        return (ships.Count > 0 ? ships : stacks).Min(s => UnitCatalogue.Get(s.Type).Speed);
    }

    /// <summary>
    /// After a fleet lost ships: keeps the passengers the <paramref name="ships"/> that are left can still carry and drowns the rest.
    /// The rule is deterministic and simple: while the passengers need more slots than the ships offer, the unit that takes the
    /// most slots drowns first (siege engines, then Berserkers, then the 2-slot units, then the rest; equal slots by unit type order),
    /// one unit at a time, so a ship lost never drowns more than the overflow plus the last unit's size.
    /// </summary>
    public static (IReadOnlyList<UnitStack> Kept, IReadOnlyList<UnitStack> Drowned) DropOverflow(
        IReadOnlyList<UnitStack> ships, IReadOnlyList<UnitStack> passengers)
    {
        var overflow = SlotsNeeded(passengers) - SlotsOffered(ships);
        if (overflow <= 0)
        {
            return ([.. passengers], []);
        }

        var drownedBy = new Dictionary<UnitType, int>();
        foreach (var stack in passengers
            .OrderByDescending(s => UnitCatalogue.Get(s.Type).CargoSlots)
            .ThenBy(s => (int)s.Type))
        {
            var slots = UnitCatalogue.Get(stack.Type).CargoSlots;
            var drowned = 0;
            while (overflow > 0 && drowned < stack.Count)
            {
                drowned++;
                overflow -= Math.Max(1, slots);
            }

            if (drowned > 0)
            {
                drownedBy[stack.Type] = drowned;
            }
        }

        var kept = passengers
            .Select(s => new UnitStack(s.Type, s.Count - drownedBy.GetValueOrDefault(s.Type)))
            .Where(s => s.Count > 0)
            .ToList();
        var lost = drownedBy.Select(kv => new UnitStack(kv.Key, kv.Value)).ToList();
        return (kept, lost);
    }
}
