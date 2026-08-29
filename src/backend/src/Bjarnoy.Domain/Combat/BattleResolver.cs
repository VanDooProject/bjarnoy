using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;

namespace Bjarnoy.Domain.Combat;

/// <summary>Which side came out on top of a <see cref="BattleResolver.Resolve"/> call.</summary>
public enum BattleWinner
{
    Attacker,
    Defender,
}

/// <summary>
/// The full outcome of one battle: enough to persist a <see cref="BattleReport"/>
/// and, later, to drive a premium simulator UI (issue #40 phase 7) directly —
/// this is why every number the fight produced is carried here rather than
/// only the final garrison/loot.
/// </summary>
public sealed record BattlePlan(
    IReadOnlyList<UnitStack> AttackerLosses,
    IReadOnlyList<UnitStack> AttackerSurvivors,
    IReadOnlyList<UnitStack> DefenderLosses,
    IReadOnlyList<UnitStack> DefenderSurvivors,
    ResourceAmounts LootTaken,
    BattleWinner Winner,
    double AttackPower,
    double DefensePower);

/// <summary>
/// Pure combat math (issue #40 phase 3): no I/O, no ambient clock, no ambient
/// RNG — every input, including the RNG seed, is a parameter, so a battle can
/// always be replayed exactly from the inputs a <see cref="BattleReport"/>
/// stores. Kept decoupled from persistence on purpose: the premium simulator
/// UI (phase 7) will call <see cref="Resolve"/> directly with no database in
/// the loop.
/// </summary>
public static class BattleResolver
{
    /// <summary>
    /// Resolves one battle. Both sides commit everything they bring — there is
    /// no partial commitment or retreat this phase.
    /// </summary>
    /// <param name="attackerStacks">The attacking army's stacks at the moment of battle.</param>
    /// <param name="defenderGarrison">The defending settlement's garrison, already settled to the battle instant.</param>
    /// <param name="defenseBonusPercent">
    /// Added to defense power as a percentage — see
    /// <see cref="Buildings.BuildingCatalogue.TowerDefenseBonusPercent"/> for
    /// the Tower's contribution.
    /// </param>
    /// <param name="lootAvailable">The defender's settled stock at the battle instant.</param>
    /// <param name="seed">
    /// Seeds the RNG used only to break ties when distributing a fractional
    /// rounding remainder across the winner's stacks (see
    /// <see cref="ApplyProportionalLosses"/>) — the same seed always produces
    /// the same result.
    /// </param>
    /// <param name="raid">
    /// When <see langword="true"/> (issue #40 phase 7, design doc §4's
    /// <see cref="Armies.ArmyMission.Raid"/>), the fight breaks off early:
    /// both sides' loss fraction is capped at <c>0.5</c> instead of the loser
    /// losing every committed unit — a raider prioritises loot over
    /// annihilating (or being annihilated by) the defender. Everything else —
    /// which side wins, attack/defense power, loot, and the caller's own
    /// siege step — is unaffected; this only ever makes a battle's losses
    /// smaller than the default (<see langword="false"/>, which preserves the
    /// original <see cref="Armies.ArmyMission.Attack"/> behavior exactly).
    /// </param>
    /// <remarks>
    /// <para>
    /// Attack power is Σ(count × Attack); defense power is Σ(count × Defense)
    /// × (1 + <paramref name="defenseBonusPercent"/>/100). The higher power
    /// wins; an exact tie goes to the defender — the attacker needs a real
    /// edge, not parity, to take a settlement.
    /// </para>
    /// <para>
    /// Outside a raid, the loser loses every committed unit, and the winner
    /// loses <c>(loserPower / winnerPower)^1.5</c> of its own committed units,
    /// applied proportionally per stack — see <see cref="ApplyProportionalLosses"/>
    /// for how the fractional count is turned into exact integers. In a raid,
    /// both of those fractions (the loser's implicit <c>1.0</c> and the
    /// winner's computed one) are capped at <c>0.5</c> before being applied
    /// the same way.
    /// </para>
    /// <para>
    /// Handles degenerate inputs defensively rather than throwing: an empty
    /// attacker (should never reach this — <c>Settlement.PlanDispatch</c>
    /// rejects an empty unit list before an army can exist) or an empty
    /// defender garrison (an undefended settlement) both resolve cleanly, the
    /// latter as a costless attacker win.
    /// </para>
    /// </remarks>
    public static BattlePlan Resolve(
        IReadOnlyList<UnitStack> attackerStacks,
        IReadOnlyList<UnitStack> defenderGarrison,
        double defenseBonusPercent,
        ResourceAmounts lootAvailable,
        int seed,
        bool raid = false)
    {
        ArgumentNullException.ThrowIfNull(attackerStacks);
        ArgumentNullException.ThrowIfNull(defenderGarrison);

        var attackPower = attackerStacks.Sum(s => (double)UnitCatalogue.Get(s.Type).Attack * s.Count);
        var defensePower = defenderGarrison.Sum(s => (double)UnitCatalogue.Get(s.Type).Defense * s.Count)
            * (1 + (defenseBonusPercent / 100.0));

        // A tie goes to the defender — see the type-level remarks.
        var winner = attackPower > defensePower ? BattleWinner.Attacker : BattleWinner.Defender;

        var rng = new Random(seed);

        IReadOnlyList<UnitStack> attackerLosses;
        IReadOnlyList<UnitStack> attackerSurvivors;
        IReadOnlyList<UnitStack> defenderLosses;
        IReadOnlyList<UnitStack> defenderSurvivors;

        if (winner == BattleWinner.Attacker)
        {
            // Outside a raid the loser loses everything (fraction 1.0); a
            // raid caps that at 0.5 — see raid's remarks — and routes it
            // through the same proportional-loss helper instead of the
            // "everyone dies" shortcut.
            (defenderLosses, defenderSurvivors) = raid
                ? ApplyProportionalLosses(defenderGarrison, RaidLossFraction(1.0), rng)
                : (defenderGarrison, []);

            var lossFraction = SafeRatioPow(defensePower, attackPower);
            if (raid)
            {
                lossFraction = RaidLossFraction(lossFraction);
            }

            (attackerLosses, attackerSurvivors) = ApplyProportionalLosses(attackerStacks, lossFraction, rng);
        }
        else
        {
            (attackerLosses, attackerSurvivors) = raid
                ? ApplyProportionalLosses(attackerStacks, RaidLossFraction(1.0), rng)
                : (attackerStacks, []);

            var lossFraction = SafeRatioPow(attackPower, defensePower);
            if (raid)
            {
                lossFraction = RaidLossFraction(lossFraction);
            }

            (defenderLosses, defenderSurvivors) = ApplyProportionalLosses(defenderGarrison, lossFraction, rng);
        }

        var loot = winner == BattleWinner.Attacker
            ? ComputeLoot(attackerSurvivors, lootAvailable)
            : ResourceAmounts.Zero;

        return new BattlePlan(
            attackerLosses, attackerSurvivors, defenderLosses, defenderSurvivors,
            loot, winner, attackPower, defensePower);
    }

    /// <summary>A raid caps any loss fraction at 0.5 — see <see cref="Resolve"/>'s <c>raid</c> remarks.</summary>
    private static double RaidLossFraction(double fraction) => Math.Min(fraction, 0.5);

    /// <summary>(loserPower / winnerPower)^1.5, or 0 when either power is non-positive — a powerless loser costs the winner nothing.</summary>
    private static double SafeRatioPow(double loserPower, double winnerPower) =>
        loserPower <= 0 || winnerPower <= 0 ? 0.0 : Math.Pow(loserPower / winnerPower, 1.5);

    /// <summary>
    /// Splits <paramref name="fraction"/> of <paramref name="stacks"/>' total
    /// count into losses, proportionally per stack.
    /// </summary>
    /// <remarks>
    /// Each stack's exact fractional loss (<c>count × fraction</c>) is floored
    /// first, which would systematically undercount the total — floor(2.4) +
    /// floor(1.4) = 3, not the 4 that round(3.8) demands. The missing units
    /// (the "remainder") are handed out one at a time to the stacks with the
    /// largest fractional remainder first, and <paramref name="rng"/> only
    /// breaks ties between equally-deserving stacks — so the total lost is
    /// always the correctly-rounded figure, deterministically for a given
    /// seed, without every stack being biased downward.
    /// </remarks>
    private static (IReadOnlyList<UnitStack> Losses, IReadOnlyList<UnitStack> Survivors) ApplyProportionalLosses(
        IReadOnlyList<UnitStack> stacks, double fraction, Random rng)
    {
        fraction = Math.Clamp(fraction, 0.0, 1.0);

        if (stacks.Count == 0 || fraction <= 0)
        {
            return ([], [.. stacks]);
        }

        var exact = new double[stacks.Count];
        var floored = new int[stacks.Count];
        var totalExact = 0.0;

        for (var i = 0; i < stacks.Count; i++)
        {
            exact[i] = stacks[i].Count * fraction;
            floored[i] = (int)Math.Floor(exact[i]);
            totalExact += exact[i];
        }

        var targetTotal = (int)Math.Round(totalExact, MidpointRounding.AwayFromZero);
        var remainder = targetTotal - floored.Sum();

        var order = Enumerable.Range(0, stacks.Count)
            .OrderByDescending(i => exact[i] - floored[i])
            .ThenBy(_ => rng.Next())
            .ToList();

        for (var k = 0; k < remainder && k < order.Count; k++)
        {
            var index = order[k];
            if (floored[index] < stacks[index].Count)
            {
                floored[index]++;
            }
        }

        var losses = new List<UnitStack>();
        var survivors = new List<UnitStack>();
        for (var i = 0; i < stacks.Count; i++)
        {
            var lost = Math.Min(floored[i], stacks[i].Count);
            if (lost > 0)
            {
                losses.Add(new UnitStack(stacks[i].Type, lost));
            }

            var survived = stacks[i].Count - lost;
            if (survived > 0)
            {
                survivors.Add(new UnitStack(stacks[i].Type, survived));
            }
        }

        return (losses, survivors);
    }

    /// <summary>
    /// Surviving attacker <c>CarryCapacity</c> total, filled from
    /// <paramref name="available"/> and split evenly across the four
    /// resources.
    /// </summary>
    /// <remarks>
    /// A simple deterministic water-filling split: start by offering each
    /// resource an equal quarter-share of the total carry capacity; whatever
    /// share a resource cannot use (because the defender does not hold that
    /// much) is not lost — it is re-offered, split evenly again, to the
    /// resources that still have more available. This is the classic "loot
    /// fills whatever's there, capped by total capacity" rule: a settlement
    /// heavy on wood and empty on iron still gives up close to a full hold of
    /// loot, just skewed toward wood, rather than 3/4 loot with the iron
    /// quarter wasted.
    /// </remarks>
    private static ResourceAmounts ComputeLoot(IReadOnlyList<UnitStack> survivors, ResourceAmounts available)
    {
        var carryCapacity = survivors.Sum(s => (double)UnitCatalogue.Get(s.Type).CarryCapacity * s.Count);
        if (carryCapacity <= 0)
        {
            return ResourceAmounts.Zero;
        }

        var avail = new[] { available.Wood, available.Stone, available.Food, available.Iron };
        var taken = new double[4];
        var active = new[] { true, true, true, true };
        var remaining = carryCapacity;

        // At most 4 rounds are ever needed: each round either finishes
        // allocating everything or permanently exhausts at least one more
        // resource, and there are only 4 resources to exhaust.
        for (var round = 0; round < 4 && remaining > 1e-9; round++)
        {
            var activeCount = active.Count(a => a);
            if (activeCount == 0)
            {
                break;
            }

            var share = remaining / activeCount;
            var exhaustedThisRound = false;

            for (var i = 0; i < 4; i++)
            {
                if (!active[i])
                {
                    continue;
                }

                var give = Math.Min(share, Math.Max(0, avail[i] - taken[i]));
                taken[i] += give;
                remaining -= give;

                if (give < share - 1e-9)
                {
                    active[i] = false;
                    exhaustedThisRound = true;
                }
            }

            if (!exhaustedThisRound)
            {
                break;
            }
        }

        return new ResourceAmounts(taken[0], taken[1], taken[2], taken[3]);
    }
}
