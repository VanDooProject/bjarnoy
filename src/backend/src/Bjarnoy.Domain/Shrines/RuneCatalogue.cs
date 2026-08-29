using Bjarnoy.Domain.Economy;

namespace Bjarnoy.Domain.Shrines;

/// <summary>What one rune, at one rarity, contributes when slotted.</summary>
public static class RuneCatalogue
{
    public static ShrineEffect Effect(RuneType type, RuneRarity rarity)
    {
        var magnitude = rarity switch
        {
            RuneRarity.Carved => 1,
            RuneRarity.Bound => 2,
            RuneRarity.Blooded => 3,
            _ => throw new ArgumentOutOfRangeException(nameof(rarity), rarity, "Unknown rarity"),
        };

        return type switch
        {
            // +5/8/12% all resource production.
            RuneType.Fehu => AllProduction(magnitude switch { 1 => 0.05, 2 => 0.08, _ => 0.12 }),

            // +8/12/18% food production.
            RuneType.Jera => new ShrineEffect(
                new ResourceAmounts(Wood: 0, Stone: 0, Food: magnitude switch { 1 => 0.08, 2 => 0.12, _ => 0.18 }, Iron: 0),
                StorageBonus: 0),

            // +10/15/25% storage capacity.
            RuneType.Othala => new ShrineEffect(
                ResourceAmounts.Zero,
                StorageBonus: magnitude switch { 1 => 0.10, 2 => 0.15, _ => 0.25 }),

            _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unknown rune"),
        };
    }

    private static ShrineEffect AllProduction(double bonus) =>
        new(ResourceAmounts.Uniform(bonus), StorageBonus: 0);
}
