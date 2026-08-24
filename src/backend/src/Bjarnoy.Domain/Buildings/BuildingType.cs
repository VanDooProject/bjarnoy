namespace Bjarnoy.Domain.Buildings;

/// <summary>
/// The buildings from <c>prototypes/MECHANICS.md</c> §7.
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
    LumberCamp = 1,

    /// <summary>Stone, on a ridge.</summary>
    Quarry = 2,

    /// <summary>Grain, on grass.</summary>
    Farm = 3,

    /// <summary>Storage capacity. Placed anywhere buildable.</summary>
    Warehouse = 4,

    /// <summary>Extends the claimed border. Placed on a border hex.</summary>
    Watchtower = 5,
}

public static class BuildingTypeExtensions
{
    public static string ToWireName(this BuildingType type) => type switch
    {
        BuildingType.Longhouse => "longhouse",
        BuildingType.LumberCamp => "lumbercamp",
        BuildingType.Quarry => "quarry",
        BuildingType.Farm => "farm",
        BuildingType.Warehouse => "warehouse",
        BuildingType.Watchtower => "watchtower",
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unknown building type"),
    };
}
