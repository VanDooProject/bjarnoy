using Bjarnoy.Domain.Units;

namespace Bjarnoy.Domain.Combat;

/// <summary>
/// What the volley (<c>docs/design/units-and-ships.md</c> section 4) did to two sides: who is left of each, what each lost and the
/// ranged attack each side threw.
/// </summary>
/// <param name="LossesA">What side A lost in the volley, per unit type.</param>
/// <param name="SurvivorsA">Side A as it enters the main fight.</param>
/// <param name="LossesB">What side B lost in the volley, per unit type.</param>
/// <param name="SurvivorsB">Side B as it enters the main fight.</param>
/// <param name="PowerA">Side A's ranged attack (what it threw at side B).</param>
/// <param name="PowerB">Side B's ranged attack (what it threw at side A).</param>
public sealed record VolleyOutcome(
    IReadOnlyList<UnitStack> LossesA,
    IReadOnlyList<UnitStack> SurvivorsA,
    IReadOnlyList<UnitStack> LossesB,
    IReadOnlyList<UnitStack> SurvivorsB,
    double PowerA,
    double PowerB);

/// <summary>
/// The ranged volley that opens every land fight: the ranged units (<see cref="UnitDefinition.Ranged"/>) of both sides strike once,
/// at the same time, on the armies as they arrive. Each side then loses <c>min(1/3, the other side's ranged attack ÷ its own total
/// defence)</c> of every unit type, and the unchanged main fight runs on what is left. Pure and seeded like <see cref="BattleResolver"/>.
/// </summary>
public static class Volley
{
    /// <summary>No volley takes more than a third of a side.</summary>
    public const double MaxLossFraction = 1.0 / 3.0;

    /// <summary>
    /// The ranged attack of <paramref name="stacks"/>: Σ count × attack over the ranged unit types, raised by
    /// <paramref name="attackBonusPercent"/> (the attacker's Thor favour, like the main fight's attack).
    /// </summary>
    public static double Power(IEnumerable<UnitStack> stacks, double attackBonusPercent = 0)
    {
        ArgumentNullException.ThrowIfNull(stacks);
        return stacks.Sum(s =>
        {
            var definition = UnitCatalogue.Get(s.Type);
            return definition.Ranged ? (double)definition.Attack * s.Count : 0.0;
        }) * (1 + (attackBonusPercent / 100.0));
    }

    /// <summary>
    /// The fraction of every unit type a side loses: <c>min(1/3, rangedAttack ÷ ownDefence)</c>, zero without ranged attack and the full
    /// third against a side with no defence at all.
    /// </summary>
    public static double LossFraction(double otherRangedAttack, double ownDefence)
    {
        if (otherRangedAttack <= 0)
        {
            return 0;
        }

        return ownDefence <= 0 ? MaxLossFraction : Math.Min(MaxLossFraction, otherRangedAttack / ownDefence);
    }

    /// <summary>Σ count × defence of <paramref name="stacks"/>, raised by <paramref name="defenseBonusPercent"/> (the tower bonus).</summary>
    public static double TotalDefence(IEnumerable<UnitStack> stacks, double defenseBonusPercent = 0)
    {
        ArgumentNullException.ThrowIfNull(stacks);
        return stacks.Sum(s => (double)UnitCatalogue.Get(s.Type).Defense * s.Count) * (1 + (defenseBonusPercent / 100.0));
    }

    /// <summary>
    /// Both sides' volleys, simultaneously, on the armies as given. A side without ranged units throws nothing; with no ranged
    /// unit on either side nothing is lost and no random number is drawn, so a fight without ranged units is exactly what it was.
    /// </summary>
    /// <param name="attackBonusPercentA">Raises side A's ranged attack.</param>
    /// <param name="defenseBonusPercentA">Raises side A's total defence (what its losses are measured against).</param>
    internal static VolleyOutcome Exchange(
        IReadOnlyList<UnitStack> sideA, double attackBonusPercentA, double defenseBonusPercentA,
        IReadOnlyList<UnitStack> sideB, double attackBonusPercentB, double defenseBonusPercentB,
        Random rng)
    {
        var powerA = Power(sideA, attackBonusPercentA);
        var powerB = Power(sideB, attackBonusPercentB);
        if (powerA <= 0 && powerB <= 0)
        {
            return new VolleyOutcome([], sideA, [], sideB, 0, 0);
        }

        // Both volleys are measured on the armies as they arrive, before either takes losses.
        var fractionA = LossFraction(powerB, TotalDefence(sideA, defenseBonusPercentA));
        var fractionB = LossFraction(powerA, TotalDefence(sideB, defenseBonusPercentB));
        var (lossesA, survivorsA) = BattleResolver.ApplyProportionalLossesInternal(sideA, fractionA, rng);
        var (lossesB, survivorsB) = BattleResolver.ApplyProportionalLossesInternal(sideB, fractionB, rng);
        return new VolleyOutcome(lossesA, survivorsA, lossesB, survivorsB, powerA, powerB);
    }

    /// <summary>
    /// A side's whole losses of a fight with a volley: the volley's plus the main fight's, per unit type, in the order of
    /// <paramref name="original"/>. Without a volley loss it is <paramref name="fightLosses"/> untouched.
    /// </summary>
    internal static IReadOnlyList<UnitStack> TotalLosses(
        IReadOnlyList<UnitStack> original, IReadOnlyList<UnitStack> volleyLosses, IReadOnlyList<UnitStack> fightLosses)
    {
        if (volleyLosses.Count == 0)
        {
            return fightLosses;
        }

        var volleyByType = volleyLosses.ToDictionary(s => s.Type, s => s.Count);
        var fightByType = fightLosses.ToDictionary(s => s.Type, s => s.Count);
        return [.. original
            .Select(s => s.Type)
            .Distinct()
            .Select(type => new UnitStack(type, volleyByType.GetValueOrDefault(type) + fightByType.GetValueOrDefault(type)))
            .Where(s => s.Count > 0)];
    }
}
