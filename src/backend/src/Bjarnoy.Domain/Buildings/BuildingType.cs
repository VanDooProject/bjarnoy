namespace Bjarnoy.Domain.Buildings;

/// <summary>
/// The anchor and terrain-bound producers are the four-resource economy from
/// <c>prototypes/MECHANICS.md</c> §7; <see cref="Lumberjack"/>,
/// <see cref="Tower"/> and <see cref="StorageHouse"/> take their names from
/// the buildings <c>legacy/browsergame</c> actually implemented
/// (<c>Models/Buildings/Lumberjack.cs</c>, <c>Tower.cs</c>,
/// <c>StorageHouse.cs</c>) rather than the design-zip mockups' names for the
/// same roles (lumber camp / watchtower / warehouse).
/// </summary>
/// <remarks>
/// Serialised to the client by name, lowercased, matching the frontend's
/// <c>buildingType</c> union in <c>src/frontend/src/lib/map/types.ts</c>.
/// </remarks>
public enum BuildingType
{
    /// <summary>The anchor. Its level sets claim radius, build slots and settlement cap.</summary>
    Longhouse = 0,

    /// <summary>Wood, on forest.</summary>
    Lumberjack = 1,

    /// <summary>Stone, on a ridge.</summary>
    Quarry = 2,

    /// <summary>Food, on grass.</summary>
    Farm = 3,

    /// <summary>Storage capacity. Placed on grass.</summary>
    StorageHouse = 4,

    /// <summary>Extends the claimed border. Placed on grass.</summary>
    Tower = 5,

    /// <summary>Food, from shallow (coastal) water rather than land.</summary>
    FishingHut = 6,

    /// <summary>Iron, from arcane means. Placed on grass only.</summary>
    MagicTower = 7,

    /// <summary>Food, on grass. A second farm variant (issue #24).</summary>
    PumpkinFarm = 8,

    /// <summary>
    /// Raised to Thor. Its favour, plus any slotted runes, boosts Wood and
    /// Stone production (issue #53).
    /// </summary>
    ShrineOfThor = 9,

    /// <summary>
    /// Raised to Freyja. Its favour, plus any slotted runes, boosts Food
    /// production (issue #53).
    /// </summary>
    ShrineOfFreyja = 10,

    /// <summary>
    /// A late-game storage tier on grass, gated behind both a level-10
    /// Longhouse and a level-10 <see cref="StorageHouse"/> of its own — see
    /// <see cref="BuildingDefinition.RequiredBuildingType"/>.
    /// </summary>
    GreatStorehouse = 11,

    /// <summary>
    /// Trains the archer/siege slice of the land roster (Bowman, Catapult)
    /// in place of the Longhouse. No production/storage of its own, and no
    /// combat bonus (deferred) — unlike <see cref="Tower"/>. See
    /// <see cref="Barracks"/> for the basic-melee half of the split.
    /// </summary>
    ArcheryRange = 12,

    /// <summary>
    /// Trains ships in place of the Longhouse. Placed on shallow (coastal)
    /// water, like <see cref="FishingHut"/>.
    /// </summary>
    Dockyard = 13,

    /// <summary>
    /// Trains the basic melee slice of the land roster (Spearman, Axeman,
    /// Berserker) in place of the Longhouse — <see cref="ArcheryRange"/>
    /// keeps the archer/siege units (Bowman, Catapult). A garrison building
    /// on land otherwise: no production/storage of its own, and no combat
    /// bonus (deferred: a garrison capacity, once one exists to hang it off).
    /// </summary>
    Barracks = 14,

    /// <summary>
    /// Food, on grass — a third food-producer variant alongside
    /// <see cref="Farm"/> and <see cref="PumpkinFarm"/>. Unlike
    /// <see cref="FishingHut"/> it doesn't stand on water itself, but its
    /// hex must be adjacent to some (see
    /// <see cref="BuildingDefinition.RequiresAdjacentToWater"/>). Flat/inland
    /// art only.
    /// </summary>
    FisherHut = 15,

    /// <summary>
    /// Wood, on grass — refines what a <see cref="Lumberjack"/> cuts, so it
    /// shares that building's Forest-neighbour boost (see
    /// <see cref="BuildingCatalogue.Boosts"/>). Its hex must be adjacent to a
    /// river of any shape (see
    /// <see cref="BuildingDefinition.RequiresAdjacentRiver"/>). Ships with
    /// art keyed off which river shape the adjacency comes from
    /// (flat/riverside/river-bend) — cosmetic only on the frontend, not
    /// modelled here.
    /// </summary>
    Sawmill = 16,
}

public static class BuildingTypeExtensions
{
    public static string ToWireName(this BuildingType type) => type switch
    {
        BuildingType.Longhouse => "longhouse",
        BuildingType.Lumberjack => "lumberjack",
        BuildingType.Quarry => "quarry",
        BuildingType.Farm => "farm",
        BuildingType.StorageHouse => "storagehouse",
        BuildingType.Tower => "tower",
        BuildingType.FishingHut => "fishinghut",
        BuildingType.MagicTower => "magictower",
        BuildingType.PumpkinFarm => "pumpkinfarm",
        BuildingType.ShrineOfThor => "shrineofthor",
        BuildingType.ShrineOfFreyja => "shrineoffreyja",
        BuildingType.GreatStorehouse => "greatstorehouse",
        BuildingType.ArcheryRange => "archeryrange",
        BuildingType.Dockyard => "dockyard",
        BuildingType.Barracks => "barracks",
        BuildingType.FisherHut => "fisherhut",
        BuildingType.Sawmill => "sawmill",
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unknown building type"),
    };
}
