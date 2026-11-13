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
/// What kinds of building a siege engine can damage (<c>docs/design/economy.md</c> section 5). The catapult burns towers and every ordinary
/// building (bridges included) but cannot touch a wall; the ram breaches walls and towers but nothing else.
/// <see cref="Bjarnoy.Domain.Combat.SiegeResolver.KindOf"/> maps a <see cref="BuildingType"/> to one kind.
/// </summary>
[Flags]
public enum SiegeTargets
{
    None = 0,

    /// <summary>Palisade and palisade gate hexes.</summary>
    Walls = 1,

    /// <summary>The tower.</summary>
    Towers = 2,

    /// <summary>Every other building, bridges included.</summary>
    Buildings = 4,
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

    /// <summary>
    /// Rings of the map around itself an army sees while it travels (<c>docs/design/map-fog-v2.md</c> §1c). An army sees as far as the
    /// highest value among its unit types (<see cref="World.FogVisionRadii.ArmyVisionRadius"/>): faster units see a little more, stronger ones less.
    /// </summary>
    public required int VisionRadius { get; init; }

    /// <summary>Resources this unit can carry home from a raid.</summary>
    public required int CarryCapacity { get; init; }

    /// <summary>Food specifically this unit can carry — provisioners run higher than their loot cap.</summary>
    public required int FoodCarryCapacity { get; init; }

    /// <summary>
    /// Slots this unit takes aboard a ship (<c>docs/design/economy.md</c>, "Troops on ships"). Zero for ships, which are never cargo.
    /// See <see cref="ShipCargo"/>.
    /// </summary>
    public int CargoSlots { get; init; }

    /// <summary>Slots this ship offers to land troops; zero for every unit that is not a ship. See <see cref="ShipCargo"/>.</summary>
    public int ShipSlots { get; init; }

    /// <summary>Food consumed per hour just for this unit standing in a garrison.</summary>
    public required double UpkeepPerHour { get; init; }

    /// <summary>
    /// Siege power this unit contributes toward building destruction (issue
    /// #40 phase 5) — zero for every unit except <see cref="UnitClass.Siege"/>
    /// (the Catapult and the Ram); ships do no damage to buildings on land. Kept separate from <see cref="Attack"/>/<see cref="Defense"/>
    /// since it only matters for <see cref="SiegeResolver"/>'s
    /// levels-destroyed formula, never for ordinary battle power. A
    /// placeholder balance figure, not a tuned number — see
    /// <see cref="UnitCatalogue"/>'s Catapult entry. See
    /// <see cref="Bjarnoy.Domain.Combat.SiegeResolver"/> for how it is spent.
    /// </summary>
    public int SiegePower { get; init; }

    /// <summary>
    /// Which kinds of building this unit's <see cref="SiegePower"/> counts against: <see cref="SiegeTargets.None"/> for a unit without
    /// siege power. Data, not branches — the resolver asks <see cref="Bjarnoy.Domain.Combat.SiegeResolver.CanDamage"/>.
    /// </summary>
    public SiegeTargets SiegeTargets { get; init; }

    public required ResourceAmounts TrainingCost { get; init; }

    /// <summary>Time to train one unit. A batch drips out one at a time — see <see cref="Bjarnoy.Domain.Buildings.TrainingOrder"/>.</summary>
    public required TimeSpan TrainingDuration { get; init; }

    /// <summary>The unit's own Longhouse gate, on top of the Longhouse level its training building opens at.</summary>
    public required int RequiredLonghouseLevel { get; init; }

    /// <summary>
    /// The minimum level of the training building (<see cref="RequiredBuildingType"/>) the order is placed in
    /// (<c>docs/design/units-and-ships.md</c> section 1). Checked against that one building, not against any building of the type.
    /// </summary>
    public int RequiredBuildingLevel { get; init; } = 1;

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
    /// <see cref="BuildingType.ArcheryRange"/> for the archer
    /// (Bowman), <see cref="BuildingType.SiegeWorkshop"/> for the siege
    /// engines (Catapult, Ram), <see cref="BuildingType.Dockyard"/> for
    /// ships. Defaults to the Longhouse.
    /// </summary>
    public BuildingType RequiredBuildingType { get; init; } = BuildingType.Longhouse;
}
