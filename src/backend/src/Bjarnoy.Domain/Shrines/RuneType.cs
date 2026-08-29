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
