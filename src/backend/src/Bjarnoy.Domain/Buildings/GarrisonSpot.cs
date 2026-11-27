using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>
/// The kind of building a garrison stands in (<c>docs/design/garrison.md</c>). A new kind (the beach camp) is one more entry
/// here plus its rule in <see cref="GarrisonSpot.Holds"/>.
/// </summary>
public enum GarrisonSpotKind
{
    /// <summary>The settlement's centre. Land units; ships too when the centre is sand next to the sea.</summary>
    Longhouse,

    /// <summary>A Tower. Land units only.</summary>
    Tower,

    /// <summary>A Harbour or a Shipyard. Ships only.</summary>
    Dock,

    /// <summary>A beach camp's centre (<c>docs/design/skirmish/beach-camp.md</c>). Land units and ships.</summary>
    BeachCamp,
}

/// <summary>Wire names of <see cref="GarrisonSpotKind"/>.</summary>
public static class GarrisonSpotKindExtensions
{
    /// <summary>The lower camel wire name (<c>"longhouse"</c> / <c>"tower"</c> / <c>"dock"</c> / <c>"beachcamp"</c>).</summary>
    public static string ToWireName(this GarrisonSpotKind kind) => kind switch
    {
        GarrisonSpotKind.Longhouse => "longhouse",
        GarrisonSpotKind.Tower => "tower",
        GarrisonSpotKind.Dock => "dock",
        GarrisonSpotKind.BeachCamp => "beachcamp",
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
    };
}

/// <summary>Some number of one unit type standing at one garrison spot — the storage form of a settlement's garrison.</summary>
public readonly record struct SpotStack(HexCoord Coord, UnitType Type, int Count);

/// <summary>
/// One place a settlement's units stand: its Longhouse hex, a Tower, a Harbour or a Shipyard.
/// </summary>
/// <param name="Coord">The building's hex.</param>
/// <param name="Kind">What stands there.</param>
/// <param name="Stacks">The units standing there now (empty for a spot nobody stands in).</param>
/// <param name="HoldsLand">Whether land units may stand here.</param>
/// <param name="HoldsShips">Whether ships may stand here.</param>
public sealed record GarrisonSpot(
    HexCoord Coord, GarrisonSpotKind Kind, IReadOnlyList<UnitStack> Stacks, bool HoldsLand, bool HoldsShips)
{
    /// <summary>Whether a unit of <paramref name="type"/> may stand here.</summary>
    public bool Holds(UnitType type) =>
        UnitCatalogue.Get(type).Class == UnitClass.Ship ? HoldsShips : HoldsLand;

    /// <summary>Whether every one of <paramref name="stacks"/> may stand here.</summary>
    public bool HoldsAll(IEnumerable<UnitStack> stacks) => stacks.All(s => s.Count <= 0 || Holds(s.Type));

    /// <summary>The spot's rule for a settlement whose centre does (or does not) harbour ships.</summary>
    internal static (bool Land, bool Ships) Rule(GarrisonSpotKind kind, bool centreHarboursShips) => kind switch
    {
        GarrisonSpotKind.Longhouse => (true, centreHarboursShips),
        GarrisonSpotKind.Tower => (true, false),
        GarrisonSpotKind.Dock => (false, true),
        GarrisonSpotKind.BeachCamp => (true, true),
        _ => (false, false),
    };
}

/// <summary>Units that stood at a coordinate that is no longer a garrison spot (its Tower, Harbour or Shipyard is gone).</summary>
public readonly record struct OrphanedGarrison(HexCoord From, IReadOnlyList<UnitStack> Stacks);
