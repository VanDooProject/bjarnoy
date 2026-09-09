using Bjarnoy.Domain.Economy;

namespace Bjarnoy.Domain.Shrines;

/// <summary>
/// What each god's shrine is worth: its own favour at a given level, and how
/// many rune slots that level has opened.
/// </summary>
/// <remarks>
/// A shrine's level is its <c>BuildingType</c> level like any other building —
/// see <c>BuildingCatalogue</c> — but its effect only scales up to
/// <see cref="MaxEffectLevel"/>; a shrine built past that keeps the level-5
/// favour rather than growing forever, so the tech tree's generic
/// <c>MaxLevel</c> of 10 does not have to be reinvented per shrine.
/// </remarks>
public static class ShrineCatalogue
{
    /// <summary>Levels above this keep the same favour and slot count.</summary>
    public const int MaxEffectLevel = 5;

    /// <summary>The god's own favour at <paramref name="level"/> (1-based, uncapped).</summary>
    public static ShrineEffect Favour(GodType god, int level)
    {
        var scaledLevel = Math.Clamp(level, 1, MaxEffectLevel);

        // +10% at level 1, +3% per level after, capped at level 5 (+22%) — a
        // maxed shrine alone never reaches Settlement.MaxEffectBonus, so
        // slotted runes always have headroom to add something.
        var perLevel = 0.10 + (0.03 * (scaledLevel - 1));

        return god switch
        {
            GodType.Thor => new ShrineEffect(new ResourceAmounts(Wood: perLevel, Stone: perLevel, Food: 0, Iron: 0), StorageBonus: 0),
            GodType.Freyja => new ShrineEffect(new ResourceAmounts(Wood: 0, Stone: 0, Food: perLevel, Iron: 0), StorageBonus: 0),
            GodType.Ullr => new ShrineEffect(new ResourceAmounts(Wood: perLevel, Stone: 0, Food: 0, Iron: 0), StorageBonus: 0),
            // Sea-trade wealth rather than a harvest, so Njörd's favour boosts
            // storage capacity instead of any resource's production — the one
            // unused ShrineEffect axis (see ShrineEffect.StorageBonus), which
            // keeps this from overlapping either Thor's or Freyja's domain.
            GodType.Njord => new ShrineEffect(ResourceAmounts.Zero, StorageBonus: perLevel),
            _ => throw new ArgumentOutOfRangeException(nameof(god), god, "Unknown god"),
        };
    }

    /// <summary>Rune slots open at <paramref name="level"/> (1-based, uncapped).</summary>
    public static int Slots(int level)
    {
        var scaledLevel = Math.Clamp(level, 1, MaxEffectLevel);

        return scaledLevel switch
        {
            >= 5 => 3,
            >= 3 => 2,
            _ => 1,
        };
    }
}
