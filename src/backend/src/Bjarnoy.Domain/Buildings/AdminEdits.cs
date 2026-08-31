namespace Bjarnoy.Domain.Buildings;

/// <summary>Why an admin's direct building placement or razing was refused.</summary>
public enum AdminBuildingEditRejection
{
    None = 0,

    /// <summary>The hex lies outside the settlement's claimed radius.</summary>
    HexNotInSettlement,

    /// <summary>No such (type, level) pair in the catalogue.</summary>
    InvalidLevel,

    /// <summary>The building's definition does not allow that hex's terrain.</summary>
    TerrainNotAllowed,

    /// <summary>Nothing stands on that hex.</summary>
    BuildingNotFound,

    /// <summary>A settlement has exactly one longhouse: it can neither gain a second nor lose the one it has.</summary>
    LonghouseIsFixed,
}

/// <summary>The outcome of an admin placing, re-typing, re-levelling, or razing a building.</summary>
public sealed record AdminBuildingEditResult(AdminBuildingEditRejection Rejection, Settlement? Settlement = null)
{
    public bool Accepted => Rejection == AdminBuildingEditRejection.None && Settlement is not null;

    public static AdminBuildingEditResult Rejected(AdminBuildingEditRejection reason) => new(reason);

    public static AdminBuildingEditResult Accept(Settlement settlement) =>
        new(AdminBuildingEditRejection.None, settlement);
}

/// <summary>Why an admin's direct garrison edit was refused.</summary>
public enum AdminGarrisonEditRejection
{
    None = 0,

    /// <summary>A delta of zero changes nothing and is refused rather than silently accepted.</summary>
    InvalidCount,

    /// <summary>Removing more units of that type than actually stand in the garrison.</summary>
    NotEnoughUnits,
}

/// <summary>The outcome of an admin adding or removing garrison units directly.</summary>
public sealed record AdminGarrisonEditResult(AdminGarrisonEditRejection Rejection, Settlement? Settlement = null)
{
    public bool Accepted => Rejection == AdminGarrisonEditRejection.None && Settlement is not null;

    public static AdminGarrisonEditResult Rejected(AdminGarrisonEditRejection reason) => new(reason);

    public static AdminGarrisonEditResult Accept(Settlement settlement) =>
        new(AdminGarrisonEditRejection.None, settlement);
}
