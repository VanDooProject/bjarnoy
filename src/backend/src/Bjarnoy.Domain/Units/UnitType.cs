namespace Bjarnoy.Domain.Units;

/// <summary>
/// The unit roster (issue #40 phase 1). Names and rough roles come from the
/// Viking setting; numbers are placeholders for a later balancing pass, not a
/// finished economy.
/// </summary>
/// <remarks>
/// Serialised to the client by name, lowercased, the same convention
/// <see cref="Bjarnoy.Domain.Buildings.BuildingType"/> uses.
/// </remarks>
public enum UnitType
{
    /// <summary>Cheap loot-carrier and the settlement's baseline defender.</summary>
    Thrall = 0,

    /// <summary>Balanced early infantry.</summary>
    Spearman = 1,

    /// <summary>Attack-leaning infantry.</summary>
    Axeman = 2,

    /// <summary>Defence-leaning infantry.</summary>
    Bowman = 3,

    /// <summary>Elite infantry; requires Axeman to be trainable first.</summary>
    Berserker = 4,

    /// <summary>Civilian food-carry specialist for supply runs.</summary>
    Provisioner = 5,

    /// <summary>Siege unit; requires Berserker to be trainable first.</summary>
    Catapult = 6,

    /// <summary>Entry-level transport ship.</summary>
    Karve = 7,

    /// <summary>Heavier warship; requires Karve to be trainable first.</summary>
    Longship = 8,

    /// <summary>
    /// Civilian coloniser (issue #55): three, standing together on an
    /// unclaimed hex, found a new settlement — see
    /// <see cref="Bjarnoy.Domain.Settlers.Founding"/>.
    /// </summary>
    SettlerCrew = 9,
}

public static class UnitTypeExtensions
{
    public static string ToWireName(this UnitType type) => type switch
    {
        UnitType.Thrall => "thrall",
        UnitType.Spearman => "spearman",
        UnitType.Axeman => "axeman",
        UnitType.Bowman => "bowman",
        UnitType.Berserker => "berserker",
        UnitType.Provisioner => "provisioner",
        UnitType.Catapult => "catapult",
        UnitType.Karve => "karve",
        UnitType.Longship => "longship",
        UnitType.SettlerCrew => "settlercrew",
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unknown unit type"),
    };
}
