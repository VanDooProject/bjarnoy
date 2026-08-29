using Bjarnoy.Domain.Economy;

namespace Bjarnoy.Domain.Units;

/// <summary>
/// The unit roster, as data (issue #40 phase 1). Mirrors
/// <see cref="Bjarnoy.Domain.Buildings.BuildingCatalogue"/>: a static table
/// rather than one class per unit, so balancing this is a data edit.
/// </summary>
/// <remarks>
/// Numbers are a placeholder roster from the design doc, not a finished
/// economy — see the issue #40 table this was seeded from.
/// </remarks>
public static class UnitCatalogue
{
    public static IReadOnlyList<UnitType> AllTypes { get; } = Enum.GetValues<UnitType>();

    private static readonly Dictionary<UnitType, UnitDefinition> Definitions = new()
    {
        [UnitType.Thrall] = new UnitDefinition
        {
            Type = UnitType.Thrall,
            Class = UnitClass.Civilian,
            Attack = 0,
            Defense = 2,
            Speed = 5,
            CarryCapacity = 60,
            FoodCarryCapacity = 20,
            UpkeepPerHour = 1,
            TrainingCost = new ResourceAmounts(Wood: 60, Stone: 30, Food: 25, Iron: 15),
            TrainingDuration = TimeSpan.FromMinutes(10),
            RequiredLonghouseLevel = 1,
        },
        [UnitType.Spearman] = new UnitDefinition
        {
            Type = UnitType.Spearman,
            Class = UnitClass.Infantry,
            Attack = 15,
            Defense = 35,
            Speed = 4,
            CarryCapacity = 20,
            FoodCarryCapacity = 10,
            UpkeepPerHour = 1,
            TrainingCost = new ResourceAmounts(Wood: 80, Stone: 40, Food: 20, Iron: 40),
            TrainingDuration = TimeSpan.FromMinutes(15),
            RequiredLonghouseLevel = 1,
        },
        [UnitType.Axeman] = new UnitDefinition
        {
            Type = UnitType.Axeman,
            Class = UnitClass.Infantry,
            Attack = 40,
            Defense = 15,
            Speed = 4,
            CarryCapacity = 30,
            FoodCarryCapacity = 10,
            UpkeepPerHour = 1,
            TrainingCost = new ResourceAmounts(Wood: 100, Stone: 30, Food: 20, Iron: 60),
            TrainingDuration = TimeSpan.FromMinutes(20),
            RequiredLonghouseLevel = 3,
        },
        [UnitType.Bowman] = new UnitDefinition
        {
            Type = UnitType.Bowman,
            Class = UnitClass.Infantry,
            Attack = 30,
            Defense = 30,
            Speed = 4,
            CarryCapacity = 15,
            FoodCarryCapacity = 10,
            UpkeepPerHour = 1,
            TrainingCost = new ResourceAmounts(Wood: 90, Stone: 60, Food: 20, Iron: 50),
            TrainingDuration = TimeSpan.FromMinutes(20),
            RequiredLonghouseLevel = 4,
        },
        [UnitType.Berserker] = new UnitDefinition
        {
            Type = UnitType.Berserker,
            Class = UnitClass.Infantry,
            Attack = 70,
            Defense = 20,
            Speed = 5,
            CarryCapacity = 25,
            FoodCarryCapacity = 10,
            UpkeepPerHour = 2,
            TrainingCost = new ResourceAmounts(Wood: 150, Stone: 60, Food: 30, Iron: 120),
            TrainingDuration = TimeSpan.FromMinutes(35),
            RequiredLonghouseLevel = 6,
            RequiredUnitType = UnitType.Axeman,
        },
        [UnitType.Provisioner] = new UnitDefinition
        {
            Type = UnitType.Provisioner,
            Class = UnitClass.Civilian,
            Attack = 0,
            Defense = 5,
            Speed = 4,
            CarryCapacity = 20,
            FoodCarryCapacity = 150,
            UpkeepPerHour = 1,
            TrainingCost = new ResourceAmounts(Wood: 90, Stone: 40, Food: 30, Iron: 20),
            TrainingDuration = TimeSpan.FromMinutes(20),
            RequiredLonghouseLevel = 4,
        },
        [UnitType.Catapult] = new UnitDefinition
        {
            Type = UnitType.Catapult,
            Class = UnitClass.Siege,
            Attack = 10,
            Defense = 10,
            Speed = 1.5,
            CarryCapacity = 0,
            FoodCarryCapacity = 0,
            UpkeepPerHour = 3,
            // Placeholder balance figure (issue #40 phase 5): with the design
            // doc's levelsDestroyed = floor(sqrt(survivingSiegePower/2))
            // formula, 40 siege power per catapult means ~4-5 surviving
            // catapults (160-200 siege power) knock a level off — a real
            // commitment, not a throwaway raid. Revisit alongside a real
            // combat balancing pass, same as UpkeepPerHour/Attack/Defense above.
            SiegePower = 40,
            TrainingCost = new ResourceAmounts(Wood: 300, Stone: 200, Food: 40, Iron: 250),
            TrainingDuration = TimeSpan.FromHours(1),
            RequiredLonghouseLevel = 10,
            RequiredUnitType = UnitType.Berserker,
        },
        [UnitType.Karve] = new UnitDefinition
        {
            Type = UnitType.Karve,
            Class = UnitClass.Ship,
            Attack = 5,
            Defense = 30,
            Speed = 8,
            CarryCapacity = 200,
            FoodCarryCapacity = 100,
            UpkeepPerHour = 2,
            TrainingCost = new ResourceAmounts(Wood: 250, Stone: 100, Food: 40, Iron: 100),
            TrainingDuration = TimeSpan.FromMinutes(45),
            RequiredLonghouseLevel = 5,
        },
        [UnitType.Longship] = new UnitDefinition
        {
            Type = UnitType.Longship,
            Class = UnitClass.Ship,
            Attack = 60,
            Defense = 40,
            Speed = 10,
            CarryCapacity = 80,
            FoodCarryCapacity = 60,
            UpkeepPerHour = 3,
            TrainingCost = new ResourceAmounts(Wood: 400, Stone: 200, Food: 60, Iron: 220),
            TrainingDuration = TimeSpan.FromHours(1.5),
            RequiredLonghouseLevel = 8,
            RequiredUnitType = UnitType.Karve,
        },
    };

    /// <summary>The definition for a unit type.</summary>
    public static UnitDefinition Get(UnitType type) => Definitions[type];

    public static UnitDefinition? TryGet(UnitType type) =>
        Definitions.TryGetValue(type, out var definition) ? definition : null;

    /// <summary>
    /// Whether <paramref name="type"/> is trainable at <paramref name="longhouseLevel"/>:
    /// the longhouse is high enough, and (recursively) any prerequisite unit is
    /// itself available at that same longhouse level.
    /// </summary>
    /// <remarks>
    /// "Available" means "unlockable here", not "one stands in the garrison" —
    /// Berserker only needs Axeman to be a buildable option, not an owned unit.
    /// The roster has no cycles, so plain recursion terminates; a cycle would
    /// be a data bug, not something this needs to guard against defensively.
    /// </remarks>
    public static bool IsAvailable(UnitType type, int longhouseLevel)
    {
        var definition = Get(type);
        if (longhouseLevel < definition.RequiredLonghouseLevel)
        {
            return false;
        }

        return definition.RequiredUnitType is not { } prerequisite
            || IsAvailable(prerequisite, longhouseLevel);
    }
}
