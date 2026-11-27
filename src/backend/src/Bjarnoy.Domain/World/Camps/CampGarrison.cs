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

    /// <summary>
    /// The full garrison of <paramref name="camp"/> at <paramref name="effectiveLevel"/>: the fixed crew of an endgame camp
    /// (<see cref="EndgameRules.NaglfarCrew"/>, whatever the level), else the strength's table.
    /// </summary>
    public static CampGarrison Full(Camp camp, int effectiveLevel) =>
        camp.Family == CampFamilies.Naglfar
            ? EndgameRules.NaglfarCrew
            : Full(camp.Strong ? CampStrength.Strong : CampStrength.Weak, effectiveLevel);

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

    /// <summary>Σ count × beast attack of <paramref name="camp"/>'s family.</summary>
    public double AttackPower(Camp camp) =>
        (Young * (double)CampRules.BeastStats(camp, BeastTier.Young).Attack)
        + (Adult * (double)CampRules.BeastStats(camp, BeastTier.Adult).Attack)
        + (Alpha * (double)CampRules.BeastStats(camp, BeastTier.Alpha).Attack);

    /// <summary>Σ count × beast defense of <paramref name="camp"/>'s family.</summary>
    public double DefensePower(Camp camp) =>
        (Young * (double)CampRules.BeastStats(camp, BeastTier.Young).Defense)
        + (Adult * (double)CampRules.BeastStats(camp, BeastTier.Adult).Defense)
        + (Alpha * (double)CampRules.BeastStats(camp, BeastTier.Alpha).Defense);

    /// <summary>Σ count × beast attack by strength (the land and whale road table).</summary>
    public double AttackPower(CampStrength strength) =>
        (Young * (double)CampRules.BeastStats(strength, BeastTier.Young).Attack)
        + (Adult * (double)CampRules.BeastStats(strength, BeastTier.Adult).Attack)
        + (Alpha * (double)CampRules.BeastStats(strength, BeastTier.Alpha).Attack);

    /// <summary>Σ count × beast defense by strength (the land and whale road table).</summary>
    public double DefensePower(CampStrength strength) =>
        (Young * (double)CampRules.BeastStats(strength, BeastTier.Young).Defense)
        + (Adult * (double)CampRules.BeastStats(strength, BeastTier.Adult).Defense)
        + (Alpha * (double)CampRules.BeastStats(strength, BeastTier.Alpha).Defense);
}
