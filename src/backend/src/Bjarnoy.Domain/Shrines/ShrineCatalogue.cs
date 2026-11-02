using Bjarnoy.Domain.Economy;

namespace Bjarnoy.Domain.Shrines;

/// <summary>
/// What each god's shrine is worth: its own favour at a given level, and how
/// many rune slots that level has opened.
/// </summary>
/// <remarks>
/// A shrine's level is its <c>BuildingType</c> level like any other building —
/// see <c>BuildingCatalogue</c> — but its effect only scales up to
/// <see cref="MaxEffectLevel"/>. A shrine's own maximum level
/// (<c>BuildingCatalogue.MaxLevelFor</c>) is 5, the same number, so the two
/// ceilings agree; a level clamped in from a stored row keeps the level-5
/// favour rather than growing forever.
/// </remarks>
public static class ShrineCatalogue
{
    /// <summary>Levels above this keep the same favour and slot count.</summary>
    public const int MaxEffectLevel = 5;

    /// <summary>Odin's Wisdom: build time taken off per Odin Statue level.</summary>
    public const double WisdomPerLevel = 0.02;

    /// <summary>Odin's Ravens: extra rings of vision per Odin Statue level.</summary>
    public const int RavensRingsPerLevel = 2;

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
            // A war-god's favour, so Thor boosts land unit attack rather
            // than any resource's production — keeps this from overlapping
            // Freyja's or Ullr's domain.
            GodType.Thor => new ShrineEffect(ResourceAmounts.Zero, StorageBonus: 0, LandAttackBonus: perLevel),
            GodType.Freyja => new ShrineEffect(new ResourceAmounts(Wood: 0, Stone: 0, Food: perLevel, Iron: 0), StorageBonus: 0),
            GodType.Ullr => new ShrineEffect(new ResourceAmounts(Wood: perLevel, Stone: 0, Food: 0, Iron: 0), StorageBonus: 0),
            // A sea-raiding god's favour, so Njörd boosts ship attack rather
            // than storage capacity or any resource's production.
            GodType.Njord => new ShrineEffect(ResourceAmounts.Zero, StorageBonus: 0, ShipAttackBonus: perLevel),
            // Odin's two effects scale linearly with level and are the only
            // ones that do not read as a percentage of something: Wisdom takes
            // 2% off every build per level (10% at level 5), Ravens adds two
            // rings of vision per level (10 at level 5).
            GodType.Odin => new ShrineEffect(
                ResourceAmounts.Zero,
                StorageBonus: 0,
                BuildTimeReduction: WisdomPerLevel * scaledLevel,
                VisionBonusRings: RavensRingsPerLevel * scaledLevel),
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
