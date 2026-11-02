namespace Bjarnoy.Domain.World;

/// <summary>The beasts standing in a wildlife camp, per <see cref="BeastTier"/>.</summary>
public readonly record struct CampGarrison(int Young, int Adult, int Alpha)
{
    public static CampGarrison Empty => default;

    /// <summary>The full garrison at <paramref name="effectiveLevel"/> (spec table, "Full garrison").</summary>
    public static CampGarrison Full(CampStrength strength, int effectiveLevel)
    {
        var level = Math.Max(1, effectiveLevel);
        return strength == CampStrength.Strong
            ? new CampGarrison(2 + level, 3 + (3 * level), Math.Max(0, level - 1))
            : new CampGarrison(2 + level, 3 + (2 * level), Math.Max(0, level - 2));
    }

    public bool IsEmpty => Young + Adult + Alpha == 0;

    /// <summary>True when at least one adult or alpha is alive (the camp can attack).</summary>
    public bool HasFighters => Adult + Alpha > 0;

    public int Total => Young + Adult + Alpha;

    public int this[BeastTier tier] => Get(tier);

    public int Get(BeastTier tier) => tier switch
    {
        BeastTier.Young => Young,
        BeastTier.Adult => Adult,
        BeastTier.Alpha => Alpha,
        _ => throw new ArgumentOutOfRangeException(nameof(tier), tier, null),
    };

    /// <summary>Σ count × beast attack.</summary>
    public double AttackPower(CampStrength strength) =>
        (Young * (double)CampRules.BeastStats(strength, BeastTier.Young).Attack)
        + (Adult * (double)CampRules.BeastStats(strength, BeastTier.Adult).Attack)
        + (Alpha * (double)CampRules.BeastStats(strength, BeastTier.Alpha).Attack);

    /// <summary>Σ count × beast defense.</summary>
    public double DefensePower(CampStrength strength) =>
        (Young * (double)CampRules.BeastStats(strength, BeastTier.Young).Defense)
        + (Adult * (double)CampRules.BeastStats(strength, BeastTier.Adult).Defense)
        + (Alpha * (double)CampRules.BeastStats(strength, BeastTier.Alpha).Defense);
}
