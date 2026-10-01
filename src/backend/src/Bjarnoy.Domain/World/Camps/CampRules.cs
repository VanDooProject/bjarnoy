using Bjarnoy.Domain.Economy;

namespace Bjarnoy.Domain.World;

/// <summary>One loot kind of a camp family with its share weight (1, or 2 for a <c>++</c> kind).</summary>
/// <param name="Kind">One of <c>food</c>, <c>wood</c>, <c>stone</c>, <c>iron</c>.</param>
public readonly record struct CampLootKind(string Kind, int Weight);

/// <summary>
/// Every tuning constant of wildlife camp gameplay (<c>docs/design/wildlife-camps.md</c>, "Gameplay"),
/// plus the pure formulas built on them. Mirrored by <c>campRules.ts</c> where the client shows them.
/// </summary>
public static class CampRules
{
    /// <summary>A damaged weak camp regrows to its full garrison in this long.</summary>
    public static readonly TimeSpan RegrowWeak = TimeSpan.FromHours(4);

    /// <summary>A damaged strong camp regrows to its full garrison in this long.</summary>
    public static readonly TimeSpan RegrowStrong = TimeSpan.FromHours(8);

    /// <summary>After any fight a camp is calm (regrows, does not attack) for this long.</summary>
    public static readonly TimeSpan CalmDuration = TimeSpan.FromHours(24);

    /// <summary>How long after an ambush a tower's attack waits before it is fought.</summary>
    public static readonly TimeSpan TowerAttackDelay = TimeSpan.FromMinutes(30);

    /// <summary>Every this many clears a camp gains one effective level.</summary>
    public const int ClearsPerLevel = 10;

    /// <summary>The effective level never exceeds this.</summary>
    public const int MaxEffectiveLevel = 100;

    /// <summary>Loot pool base of a strong camp (level 1).</summary>
    public const double StrongLootBase = 1800;

    /// <summary>Loot pool base of a weak camp (level 1).</summary>
    public const double WeakLootBase = 450;

    /// <summary>Loot grows with <c>level^LootLevelExponent</c>, slower than the garrison.</summary>
    public const double LootLevelExponent = 0.7;

    /// <summary>The beast's attack and defense by camp strength and tier.</summary>
    public static (int Attack, int Defense) BeastStats(CampStrength strength, BeastTier tier) => (strength, tier) switch
    {
        (CampStrength.Weak, BeastTier.Young) => (0, 2),
        (CampStrength.Weak, BeastTier.Adult) => (8, 12),
        (CampStrength.Weak, BeastTier.Alpha) => (15, 25),
        (CampStrength.Strong, BeastTier.Young) => (2, 5),
        (CampStrength.Strong, BeastTier.Adult) => (25, 30),
        (CampStrength.Strong, BeastTier.Alpha) => (50, 60),
        _ => throw new ArgumentOutOfRangeException(nameof(tier), tier, null),
    };

    /// <summary><c>min(100, Level + floor(Clears / 10))</c>. The guard range stays on the rolled <see cref="Camp.Level"/>.</summary>
    public static int EffectiveLevel(Camp camp, int clears) =>
        Math.Min(MaxEffectiveLevel, camp.Level + (Math.Max(0, clears) / ClearsPerLevel));

    /// <summary>Time a damaged camp of this strength needs to regrow fully.</summary>
    public static TimeSpan RegrowDuration(CampStrength strength) =>
        strength == CampStrength.Strong ? RegrowStrong : RegrowWeak;

    /// <summary>
    /// The loot pool of a camp at <paramref name="effectiveLevel"/>: <c>base × L^0.7</c> split over the
    /// family's <see cref="LootKinds"/> by weight, each share rounded down to a whole number.
    /// </summary>
    public static ResourceAmounts LootPool(Camp camp, int effectiveLevel)
    {
        var level = Math.Max(1, effectiveLevel);
        var pool = (camp.Strong ? StrongLootBase : WeakLootBase) * Math.Pow(level, LootLevelExponent);
        var kinds = LootKinds(camp.Family);
        var totalWeight = kinds.Sum(k => k.Weight);

        double wood = 0, stone = 0, food = 0, iron = 0;
        foreach (var (kind, weight) in kinds)
        {
            var share = Math.Floor(pool * weight / totalWeight);
            switch (kind)
            {
                case "wood": wood = share; break;
                case "stone": stone = share; break;
                case "food": food = share; break;
                case "iron": iron = share; break;
            }
        }

        return new ResourceAmounts(wood, stone, food, iron);
    }

    /// <summary>
    /// The loot kinds of a camp family: food always, iron for a strong camp, plus the family's extras;
    /// a <c>++</c> kind weighs 2, every other 1. Order is food, stone, wood, iron. Mirrors
    /// <c>WildlifeCampsView.vue</c>'s <c>lootOf</c>.
    /// </summary>
    public static IReadOnlyList<CampLootKind> LootKinds(string family)
    {
        var weights = new Dictionary<string, int> { ["food"] = 1 };
        if (CampFamilies.IsStrong(family))
        {
            weights["iron"] = 1;
        }

        switch (family)
        {
            case CampFamilies.Wolfden:
            case CampFamilies.Beaverlodge:
            case CampFamilies.Otterslide:
                weights["wood"] = 1;
                break;
            case CampFamilies.Boarwallow:
            case CampFamilies.Moosemire:
                weights["food"] = 2;
                break;
            case CampFamilies.Bearrapids:
                weights["stone"] = 1;
                break;
            case CampFamilies.Eagleeyrie:
                weights["stone"] = 1;
                weights["iron"] = 1;
                break;
            case CampFamilies.Fenrirbrood:
                weights["iron"] = 2;
                break;
        }

        string[] order = ["food", "stone", "wood", "iron"];
        return order
            .Where(weights.ContainsKey)
            .Select(k => new CampLootKind(k, weights[k]))
            .ToList();
    }
}
