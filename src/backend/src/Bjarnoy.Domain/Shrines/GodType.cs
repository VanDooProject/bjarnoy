namespace Bjarnoy.Domain.Shrines;

/// <summary>
/// A god a settlement can raise a shrine to. See issue #53: this is the v1
/// slice, since extended with the wood and water lines' own capstones (Ullr,
/// Njörd) and Odin (Wisdom and Ravens). Tyr stays deferred until a garrison stat
/// exists for his boost to apply to.
/// </summary>
public enum GodType
{
    /// <summary>Labour and storm. Boosts Wood and Stone production.</summary>
    Thor = 0,

    /// <summary>Hearth and growth. Boosts Food production.</summary>
    Freyja = 1,

    /// <summary>Hunting and the wild wood. Boosts Wood production.</summary>
    Ullr = 2,

    /// <summary>Sea and sea-wealth. Boosts storage capacity rather than any resource's production.</summary>
    Njord = 3,

    /// <summary>
    /// Wisdom and wanderers. Not a production or attack bonus: shortens every
    /// build in his own settlement (Wisdom) and widens what it can see (Ravens).
    /// </summary>
    Odin = 4,
}
