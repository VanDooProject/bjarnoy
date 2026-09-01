namespace Bjarnoy.Domain.Shrines;

/// <summary>
/// An Elder Futhark stave, carved into a rune slotted at a shrine. See
/// issue #53's v1 whitelist: production and storage bonuses only.
/// </summary>
public enum RuneType
{
    /// <summary>Wealth. A small bonus to every resource's production.</summary>
    Fehu = 0,

    /// <summary>Harvest. A bonus to Food production.</summary>
    Jera = 1,

    /// <summary>Inheritance. A bonus to storage capacity.</summary>
    Othala = 2,
}

/// <summary>How strong a carved rune is. Same effect family, bigger number.</summary>
public enum RuneRarity
{
    Carved = 0,
    Bound = 1,
    Blooded = 2,
}

public static class RuneTypeExtensions
{
    /// <summary>The wire name for a rune, as the API/frontend spell it.</summary>
    public static string ToWireName(this RuneType type) => type switch
    {
        RuneType.Fehu => "fehu",
        RuneType.Jera => "jera",
        RuneType.Othala => "othala",
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unknown rune type"),
    };

    public static string ToWireName(this RuneRarity rarity) => rarity switch
    {
        RuneRarity.Carved => "carved",
        RuneRarity.Bound => "bound",
        RuneRarity.Blooded => "blooded",
        _ => throw new ArgumentOutOfRangeException(nameof(rarity), rarity, "Unknown rune rarity"),
    };
}
