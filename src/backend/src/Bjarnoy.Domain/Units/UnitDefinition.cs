using Bjarnoy.Domain.Economy;

namespace Bjarnoy.Domain.Units;

/// <summary>What a unit is for — mirrors <c>BuildingType</c>'s role comments, but as data.</summary>
public enum UnitClass
{
    Infantry,
    Cavalry,
    Siege,
    Ship,
    Civilian,
}

/// <summary>
/// What one unit type costs, takes and gives. Movement (<see cref="Speed"/>)
/// is carried here so the catalogue is complete, but nothing reads it yet —
/// that is phase 2 (issue #40).
/// </summary>
public sealed record UnitDefinition
{
    public required UnitType Type { get; init; }

    public required UnitClass Class { get; init; }

    public required int Attack { get; init; }

    public required int Defense { get; init; }

    /// <summary>Hexes per hour. Unused until movement (issue #40 phase 2+).</summary>
    public required double Speed { get; init; }

    /// <summary>Resources this unit can carry home from a raid.</summary>
    public required int CarryCapacity { get; init; }

    /// <summary>Food specifically this unit can carry — provisioners run higher than their loot cap.</summary>
    public required int FoodCarryCapacity { get; init; }

    /// <summary>Food consumed per hour just for this unit standing in a garrison.</summary>
    public required double UpkeepPerHour { get; init; }

    public required ResourceAmounts TrainingCost { get; init; }

    /// <summary>Time to train one unit. A batch drips out one at a time — see <see cref="Bjarnoy.Domain.Buildings.TrainingOrder"/>.</summary>
    public required TimeSpan TrainingDuration { get; init; }

    public required int RequiredLonghouseLevel { get; init; }

    /// <summary>
    /// Another unit type that must itself be available (see
    /// <see cref="UnitCatalogue.IsAvailable"/>) before this one is — a simple
    /// prerequisite chain, not "must currently own one".
    /// </summary>
    public UnitType? RequiredUnitType { get; init; }
}
