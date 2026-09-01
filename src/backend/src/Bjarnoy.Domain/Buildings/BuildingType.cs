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
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unknown building type"),
    };
}
