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
    ResourceAmounts LootAvailable = default,
    double Refill = 0)
{
    /// <summary>Everything the army took from the camp's pool: the <see cref="Loot"/> and the food that refilled its provisions.</summary>
    public ResourceAmounts Taken => Loot + new ResourceAmounts(0, 0, Refill, 0);

    /// <summary>
    /// The ranged attack the army's Bowmen and Skirmishers threw at the beasts before the fight (<see cref="Volley"/>; the beasts throw
    /// nothing back). Zero without ranged units.
    /// </summary>
    public double ArmyVolleyPower { get; init; }

    /// <summary>The beasts the volley killed; already part of <see cref="BeastLosses"/>.</summary>
    public CampGarrison BeastVolleyLosses { get; init; }
}

/// <summary>
/// Pure, seeded combat maths for wildlife camps, reusing <see cref="BattleResolver"/>'s loss rounding
/// and carry-capacity loot split. See <c>docs/design/wildlife-camps.md</c>, "Gameplay".
/// </summary>
public static class CampBattleResolver
{
    /// <summary>
    /// A camp ambushes a marching <paramref name="army"/>: <see cref="CampAttack"/> with the army's fleet rules. A fleet's
    /// passengers do not fight; the ships that survive carry what they can and the rest drown (<see cref="ShipCargo.Rejoin"/>).
    /// </summary>
    public static CampFightPlan Ambush(CampGarrison garrison, Camp camp, IReadOnlyList<UnitStack> army, int seed)
    {
        ArgumentNullException.ThrowIfNull(army);

        var (fighters, passengers) = ShipCargo.SplitForFight(army);
        var plan = CampAttack(garrison, camp, fighters, seed);
        var (losses, survivors) = ShipCargo.Rejoin(plan.ArmyLosses, plan.ArmySurvivors, passengers);
        return plan with { ArmyLosses = losses, ArmySurvivors = survivors };
    }

    /// <summary>
    /// The army hunts the camp: army attack against beast <em>defense</em>; a tie goes to the camp. At a sand camp a fleet's land
    /// troops hunt it (the ships take no part and no losses); at a water camp the ships do. The loser
    /// loses everything, the winner <c>(loser/winner)^1.5</c> of its own, no raid caps.
    /// <see cref="CampFightPlan.ArmyPower"/> is the attack power, <see cref="CampFightPlan.CampPower"/> the beasts' defense.
    /// </summary>
    /// <remarks>
    /// The loot on offer is <see cref="LootAvailable"/>: <paramref name="leftover"/> plus the level's pool scaled by
    /// the fraction of the full garrison still standing. An army win first refills its provisions from the food on offer
    /// (<c>min(food, the survivors' food capacity - <paramref name="provisionsAtBattle"/>)</c>, <see cref="CampFightPlan.Refill"/>), then takes
    /// <c>ComputeLootWithCapacity(survivors' carry capacity, what is left)</c>; a fleet's carry capacity is its surviving ships' alone.
    /// An already empty garrison is no fight: a costless army win that takes up to the whole army's
    /// carry from <paramref name="leftover"/> only (zero when there is none), refill first like any win.
    /// </remarks>
    public static CampFightPlan Hunt(
        IReadOnlyList<UnitStack> army,
        CampGarrison garrison,
        Camp camp,
        int effectiveLevel,
        int seed,
        double provisionsAtBattle,
        double landAttackBonusPercent = 0,
        ResourceAmounts leftover = default)
    {
        ArgumentNullException.ThrowIfNull(army);

        IReadOnlyList<UnitStack> losses;
        IReadOnlyList<UnitStack> survivors;
        CampFightPlan plan;

        if (ShipCargo.Ships(army).Count > 0 && camp.IsSand)
        {
            // A sand camp is hunted by the land troops aboard: the ships take no part and no losses.
            plan = HuntFight(ShipCargo.Passengers(army), garrison, camp, effectiveLevel, seed, landAttackBonusPercent, leftover);
            (losses, survivors) = (plan.ArmyLosses, [.. ShipCargo.Ships(army), .. plan.ArmySurvivors]);
        }
        else
        {
            // At a water camp a fleet's passengers do not fight; the ships that survive carry what they can (ShipCargo.Rejoin).
            var (fighters, passengers) = ShipCargo.SplitForFight(army);
            plan = HuntFight(fighters, garrison, camp, effectiveLevel, seed, landAttackBonusPercent, leftover);
            (losses, survivors) = ShipCargo.Rejoin(plan.ArmyLosses, plan.ArmySurvivors, passengers);
        }

        // The army that comes home takes the loot: capped by the surviving ships' capacity alone for a fleet, by everyone's for a
        // land army. The food that refills the provisions of every survivor, passengers included, comes off the top.
        var (loot, refill) = plan.Winner == CampFightWinner.Army
            ? BattleResolver.TakeLootAndRefill(
                BattleResolver.LootCapacity(survivors),
                BattleResolver.FoodCapacity(survivors), provisionsAtBattle, plan.LootAvailable)
            : (ResourceAmounts.Zero, 0);
        return plan with { ArmyLosses = losses, ArmySurvivors = survivors, Loot = loot, Refill = refill };
    }

    /// <summary>The fight itself: who wins and who loses what. The loot is worked out by <see cref="Hunt"/> from the final survivors.</summary>
    private static CampFightPlan HuntFight(
        IReadOnlyList<UnitStack> army,
        CampGarrison garrison,
        Camp camp,
        int effectiveLevel,
        int seed,
        double landAttackBonusPercent,
        ResourceAmounts leftover)
    {
        var available = LootAvailable(leftover, camp, effectiveLevel, garrison);

        if (garrison.IsEmpty)
        {
            var emptyArmyPower = army.Sum(s => UnitCatalogue.Get(s.Type).Attack * s.Count * (1 + (landAttackBonusPercent / 100.0)));
            return new CampFightPlan([], [.. army], CampGarrison.Empty, CampGarrison.Empty,
                CampFightWinner.Army, emptyArmyPower, garrison.DefensePower(camp), ResourceAmounts.Zero, available);
        }

        var rng = new Random(seed);

        // The army's ranged units volley first (the beasts throw nothing back); the fight is then fought against what is left of
        // the camp. The loot on offer stays that of the whole garrison: the beasts the volley killed count as cleared.
        var volleyPower = Volley.Power(army, landAttackBonusPercent);
        var (volleyLosses, standing) = BeastLosses(
            garrison, Volley.LossFraction(volleyPower, garrison.DefensePower(camp)), rng);

        var armyPower = army.Sum(s => UnitCatalogue.Get(s.Type).Attack * s.Count * (1 + (landAttackBonusPercent / 100.0)));
        var campPower = standing.DefensePower(camp);

        if (armyPower > campPower)
        {
            var (armyLosses, armySurvivors) = BattleResolver.ApplyProportionalLossesInternal(
                army, BattleResolver.SafeRatioPowInternal(campPower, armyPower), rng);
            return new CampFightPlan(armyLosses, armySurvivors, garrison, CampGarrison.Empty,
                CampFightWinner.Army, armyPower, campPower, ResourceAmounts.Zero, available)
            {
                ArmyVolleyPower = volleyPower,
                BeastVolleyLosses = volleyLosses,
            };
        }

        var (fightLosses, beastSurvivors) = BeastLosses(
            standing, BattleResolver.SafeRatioPowInternal(armyPower, campPower), rng);
        return new CampFightPlan([.. army], [], Add(volleyLosses, fightLosses), beastSurvivors,
            CampFightWinner.Camp, armyPower, campPower, ResourceAmounts.Zero, available)
        {
            ArmyVolleyPower = volleyPower,
            BeastVolleyLosses = volleyLosses,
        };
    }

    /// <summary>
    /// <paramref name="leftover"/> plus <c>LootPool(camp, effectiveLevel)</c> scaled by
    /// <c>garrison defense power / full garrison defense power</c> (0 for an empty camp), each resource rounded down.
    /// </summary>
    internal static ResourceAmounts LootAvailable(ResourceAmounts leftover, Camp camp, int effectiveLevel, CampGarrison garrison)
    {
        if (camp.IsEndgame)
        {
            // The fleet that beats an endgame camp takes the whole fixed pool, not scaled by the crew left; nothing is left over.
            return garrison.IsEmpty ? ResourceAmounts.Zero : CampRules.LootPool(camp, effectiveLevel).Floor();
        }

        var strength = camp.Strong ? CampStrength.Strong : CampStrength.Weak;
        var fullPower = CampGarrison.Full(strength, effectiveLevel).DefensePower(strength);
        var fraction = fullPower <= 0 ? 0 : Math.Clamp(garrison.DefensePower(strength) / fullPower, 0, 1);
        return (leftover + (CampRules.LootPool(camp, effectiveLevel) * fraction)).Floor();
    }

    /// <summary>
    /// The camp attacks: beast <em>attack</em> against the defenders' <em>defense</em>; a tie goes to the
    /// defenders. Raid-capped like <see cref="BattleResolver"/>'s raid: both loss fractions are at most
    /// 0.5, so a camp is never cleared by its own attack. An endgame camp (<see cref="CampFamilies.IsEndgame"/>) fights a full
    /// battle instead: the loser loses everything, the winner <c>(loser/winner)^1.5</c>, no cap. No loot either way. Empty defenders: a costless camp win.
    /// <see cref="CampFightPlan.ArmyPower"/> is the defenders' defense, <see cref="CampFightPlan.CampPower"/> the beasts' attack.
    /// </summary>
    public static CampFightPlan CampAttack(
        CampGarrison garrison,
        Camp camp,
        IReadOnlyList<UnitStack> defenders,
        int seed)
    {
        ArgumentNullException.ThrowIfNull(defenders);

        var defensePower = defenders.Sum(s => (double)UnitCatalogue.Get(s.Type).Defense * s.Count);

        if (defenders.Count == 0 || defenders.All(s => s.Count <= 0))
        {
            return new CampFightPlan([], [], CampGarrison.Empty, garrison,
                CampFightWinner.Camp, defensePower, garrison.AttackPower(camp), ResourceAmounts.Zero);
        }

        var rng = new Random(seed);

        // Raid caps keep a camp from being cleared by its own attack; an endgame camp fights a full battle without them.
        Func<double, double> loss = camp.IsEndgame ? f => f : BattleResolver.RaidLossFractionInternal;

        // The defenders' ranged units volley first (the beasts throw nothing back); the camp then attacks with what is left.
        var volleyPower = Volley.Power(defenders);
        var (volleyLosses, standing) = BeastLosses(
            garrison, Volley.LossFraction(volleyPower, garrison.DefensePower(camp)), rng);
        var campPower = standing.AttackPower(camp);

        if (campPower > defensePower)
        {
            var (losses, survivors) = BattleResolver.ApplyProportionalLossesInternal(
                defenders, loss(1.0), rng);
            var (fightLosses, beastSurvivors) = BeastLosses(
                standing,
                loss(BattleResolver.SafeRatioPowInternal(defensePower, campPower)),
                rng);
            return new CampFightPlan(losses, survivors, Add(volleyLosses, fightLosses), beastSurvivors,
                CampFightWinner.Camp, defensePower, campPower, ResourceAmounts.Zero)
            {
                ArmyVolleyPower = volleyPower,
                BeastVolleyLosses = volleyLosses,
            };
        }
        else
        {
            var (fightLosses, beastSurvivors) = BeastLosses(
                standing, loss(1.0), rng);
            var (losses, survivors) = BattleResolver.ApplyProportionalLossesInternal(
                defenders,
                loss(BattleResolver.SafeRatioPowInternal(campPower, defensePower)),
                rng);
            return new CampFightPlan(losses, survivors, Add(volleyLosses, fightLosses), beastSurvivors,
                CampFightWinner.Army, defensePower, campPower, ResourceAmounts.Zero)
            {
                ArmyVolleyPower = volleyPower,
                BeastVolleyLosses = volleyLosses,
            };
        }
    }

    private static CampGarrison Add(CampGarrison a, CampGarrison b) => new(a.Young + b.Young, a.Adult + b.Adult, a.Alpha + b.Alpha);

    /// <summary>Applies the shared floor + largest-remainder loss rounding across the three beast tiers.</summary>
    private static (CampGarrison Losses, CampGarrison Survivors) BeastLosses(CampGarrison garrison, double fraction, Random rng)
    {
        var lost = BattleResolver.ProportionalLossCounts([garrison.Young, garrison.Adult, garrison.Alpha], fraction, rng);
        return (new CampGarrison(lost[0], lost[1], lost[2]),
            new CampGarrison(garrison.Young - lost[0], garrison.Adult - lost[1], garrison.Alpha - lost[2]));
    }
}
