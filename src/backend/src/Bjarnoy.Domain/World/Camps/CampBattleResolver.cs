using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;

namespace Bjarnoy.Domain.World;

/// <summary>Which side won a camp fight.</summary>
public enum CampFightWinner
{
    Army,
    Camp,
}

/// <summary>The outcome of one camp fight. Powers are the ones that decided it (see the resolver methods).</summary>
public sealed record CampFightPlan(
    IReadOnlyList<UnitStack> ArmyLosses,
    IReadOnlyList<UnitStack> ArmySurvivors,
    CampGarrison BeastLosses,
    CampGarrison BeastSurvivors,
    CampFightWinner Winner,
    double ArmyPower,
    double CampPower,
    ResourceAmounts Loot,
    ResourceAmounts LootAvailable = default);

/// <summary>
/// Pure, seeded combat maths for wildlife camps, reusing <see cref="BattleResolver"/>'s loss rounding
/// and carry-capacity loot split. See <c>docs/design/wildlife-camps.md</c>, "Gameplay".
/// </summary>
public static class CampBattleResolver
{
    /// <summary>
    /// The army hunts the camp: army attack against beast <em>defense</em>; a tie goes to the camp. The loser
    /// loses everything, the winner <c>(loser/winner)^1.5</c> of its own, no raid caps.
    /// <see cref="CampFightPlan.ArmyPower"/> is the attack power, <see cref="CampFightPlan.CampPower"/> the beasts' defense.
    /// </summary>
    /// <remarks>
    /// The loot on offer is <see cref="LootAvailable"/>: <paramref name="leftover"/> plus the level's pool scaled by
    /// the fraction of the full garrison still standing. An army win takes
    /// <c>ComputeLootWithCapacity(survivors' carry capacity, available)</c>.
    /// An already empty garrison is no fight: a costless army win that takes up to the whole army's
    /// carry from <paramref name="leftover"/> only (zero when there is none).
    /// </remarks>
    public static CampFightPlan Hunt(
        IReadOnlyList<UnitStack> army,
        CampGarrison garrison,
        Camp camp,
        int effectiveLevel,
        int seed,
        double landAttackBonusPercent = 0,
        ResourceAmounts leftover = default)
    {
        ArgumentNullException.ThrowIfNull(army);

        var strength = camp.Strong ? CampStrength.Strong : CampStrength.Weak;
        var armyPower = army.Sum(s => UnitCatalogue.Get(s.Type).Attack * s.Count * (1 + (landAttackBonusPercent / 100.0)));
        var campPower = garrison.DefensePower(strength);

        var available = LootAvailable(leftover, camp, effectiveLevel, garrison);

        if (garrison.IsEmpty)
        {
            var pickup = BattleResolver.ComputeLootWithCapacity(CarryCapacity(army), available);
            return new CampFightPlan([], [.. army], CampGarrison.Empty, CampGarrison.Empty,
                CampFightWinner.Army, armyPower, campPower, pickup, available);
        }

        var rng = new Random(seed);

        if (armyPower > campPower)
        {
            var (armyLosses, armySurvivors) = BattleResolver.ApplyProportionalLossesInternal(
                army, BattleResolver.SafeRatioPowInternal(campPower, armyPower), rng);
            var loot = BattleResolver.ComputeLootWithCapacity(CarryCapacity(armySurvivors), available);
            return new CampFightPlan(armyLosses, armySurvivors, garrison, CampGarrison.Empty,
                CampFightWinner.Army, armyPower, campPower, loot, available);
        }

        var (beastLosses, beastSurvivors) = BeastLosses(
            garrison, BattleResolver.SafeRatioPowInternal(armyPower, campPower), rng);
        return new CampFightPlan([.. army], [], beastLosses, beastSurvivors,
            CampFightWinner.Camp, armyPower, campPower, ResourceAmounts.Zero, available);
    }

    /// <summary>
    /// <paramref name="leftover"/> plus <c>LootPool(camp, effectiveLevel)</c> scaled by
    /// <c>garrison defense power / full garrison defense power</c> (0 for an empty camp), each resource rounded down.
    /// </summary>
    internal static ResourceAmounts LootAvailable(ResourceAmounts leftover, Camp camp, int effectiveLevel, CampGarrison garrison)
    {
        var strength = camp.Strong ? CampStrength.Strong : CampStrength.Weak;
        var fullPower = CampGarrison.Full(strength, effectiveLevel).DefensePower(strength);
        var fraction = fullPower <= 0 ? 0 : Math.Clamp(garrison.DefensePower(strength) / fullPower, 0, 1);
        return (leftover + (CampRules.LootPool(camp, effectiveLevel) * fraction)).Floor();
    }

    private static double CarryCapacity(IReadOnlyList<UnitStack> stacks) =>
        stacks.Sum(s => (double)UnitCatalogue.Get(s.Type).CarryCapacity * s.Count);

    /// <summary>
    /// The camp attacks: beast <em>attack</em> against the defenders' <em>defense</em>; a tie goes to the
    /// defenders. Raid-capped like <see cref="BattleResolver"/>'s raid: both loss fractions are at most
    /// 0.5, so a camp is never cleared by its own attack. No loot either way. Empty defenders: a costless camp win.
    /// <see cref="CampFightPlan.ArmyPower"/> is the defenders' defense, <see cref="CampFightPlan.CampPower"/> the beasts' attack.
    /// </summary>
    public static CampFightPlan CampAttack(
        CampGarrison garrison,
        Camp camp,
        IReadOnlyList<UnitStack> defenders,
        int seed)
    {
        ArgumentNullException.ThrowIfNull(defenders);

        var strength = camp.Strong ? CampStrength.Strong : CampStrength.Weak;
        var campPower = garrison.AttackPower(strength);
        var defensePower = defenders.Sum(s => (double)UnitCatalogue.Get(s.Type).Defense * s.Count);

        if (defenders.Count == 0 || defenders.All(s => s.Count <= 0))
        {
            return new CampFightPlan([], [], CampGarrison.Empty, garrison,
                CampFightWinner.Camp, defensePower, campPower, ResourceAmounts.Zero);
        }

        var rng = new Random(seed);

        if (campPower > defensePower)
        {
            var (losses, survivors) = BattleResolver.ApplyProportionalLossesInternal(
                defenders, BattleResolver.RaidLossFractionInternal(1.0), rng);
            var (beastLosses, beastSurvivors) = BeastLosses(
                garrison,
                BattleResolver.RaidLossFractionInternal(BattleResolver.SafeRatioPowInternal(defensePower, campPower)),
                rng);
            return new CampFightPlan(losses, survivors, beastLosses, beastSurvivors,
                CampFightWinner.Camp, defensePower, campPower, ResourceAmounts.Zero);
        }
        else
        {
            var (beastLosses, beastSurvivors) = BeastLosses(
                garrison, BattleResolver.RaidLossFractionInternal(1.0), rng);
            var (losses, survivors) = BattleResolver.ApplyProportionalLossesInternal(
                defenders,
                BattleResolver.RaidLossFractionInternal(BattleResolver.SafeRatioPowInternal(campPower, defensePower)),
                rng);
            return new CampFightPlan(losses, survivors, beastLosses, beastSurvivors,
                CampFightWinner.Army, defensePower, campPower, ResourceAmounts.Zero);
        }
    }

    /// <summary>Applies the shared floor + largest-remainder loss rounding across the three beast tiers.</summary>
    private static (CampGarrison Losses, CampGarrison Survivors) BeastLosses(CampGarrison garrison, double fraction, Random rng)
    {
        var lost = BattleResolver.ProportionalLossCounts([garrison.Young, garrison.Adult, garrison.Alpha], fraction, rng);
        return (new CampGarrison(lost[0], lost[1], lost[2]),
            new CampGarrison(garrison.Young - lost[0], garrison.Adult - lost[1], garrison.Alpha - lost[2]));
    }
}
