namespace Bjarnoy.Domain.Shrines;

/// <summary>
/// A god a settlement can raise a shrine to. See issue #53: this is the v1
/// slice — Njörd (sea/dock terrain), Tyr (a garrison stat does not exist yet)
/// and Odin (an "accepts any rune" domain rule) are deferred until the systems
/// their boosts would apply to exist.
/// </summary>
public enum GodType
{
    /// <summary>Labour and storm. Boosts Wood and Stone production.</summary>
    Thor = 0,

    /// <summary>Hearth and growth. Boosts Food production.</summary>
    Freyja = 1,
}
