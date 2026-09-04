using Bjarnoy.Domain.Buildings;
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

    /// <summary>
    /// Siege power this unit contributes toward building destruction (issue
    /// #40 phase 5) — zero for every unit except <see cref="UnitClass.Siege"/>
    /// (the Catapult). Kept separate from <see cref="Attack"/>/<see cref="Defense"/>
    /// since it only matters for <see cref="SiegeResolver"/>'s
    /// levels-destroyed formula, never for ordinary battle power. A
    /// placeholder balance figure, not a tuned number — see
    /// <see cref="UnitCatalogue"/>'s Catapult entry. See
    /// <see cref="Bjarnoy.Domain.Combat.SiegeResolver"/> for how it is spent.
    /// </summary>
    public int SiegePower { get; init; }

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

    /// <summary>
    /// Which building type this unit trains at — the Longhouse for every
    /// civilian, <see cref="BuildingType.Barracks"/> for the basic melee
    /// land roster (Spearman, Axeman, Berserker),
    /// <see cref="BuildingType.ArcheryRange"/> for the archer/siege land
    /// roster (Bowman, Catapult), <see cref="BuildingType.Dockyard"/> for
    /// ships. Defaults to the Longhouse.
    /// </summary>
    public BuildingType RequiredBuildingType { get; init; } = BuildingType.Longhouse;
}
