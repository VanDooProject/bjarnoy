using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;

namespace Bjarnoy.Domain.Tests.Combat;

public class BattleResolverTests
{
    private static readonly ResourceAmounts Abundant = ResourceAmounts.Uniform(1_000_000);

    [Fact]
    public void Attacker_wins_when_strictly_stronger()
    {
        // 100 Axemen (Attack 40 each) vs 1 Spearman (Defense 35).
        var attacker = new[] { new UnitStack(UnitType.Axeman, 100) };
        var defender = new[] { new UnitStack(UnitType.Spearman, 1) };

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);

        Assert.Equal(BattleWinner.Attacker, plan.Winner);
        Assert.Equal(4000, plan.AttackPower);
        Assert.Equal(35, plan.DefensePower);
        Assert.Equal(defender, plan.DefenderLosses);
        Assert.Empty(plan.DefenderSurvivors);
        Assert.True(plan.AttackerSurvivors.Sum(s => s.Count) > 0, "the attacker should barely be scratched");
    }

    [Fact]
    public void Defender_wins_when_strictly_stronger()
    {
        var attacker = new[] { new UnitStack(UnitType.Spearman, 1) };
        var defender = new[] { new UnitStack(UnitType.Axeman, 100) };

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);

        Assert.Equal(BattleWinner.Defender, plan.Winner);
        Assert.Equal(attacker, plan.AttackerLosses);
        Assert.Empty(plan.AttackerSurvivors);
        Assert.True(plan.DefenderSurvivors.Sum(s => s.Count) > 0, "the defender should barely be scratched");
        Assert.Equal(ResourceAmounts.Zero, plan.LootTaken);
    }

    [Fact]
    public void Defense_bonus_percent_scales_defense_power()
    {
        var attacker = new[] { new UnitStack(UnitType.Spearman, 10) }; // 150 attack
        var defender = new[] { new UnitStack(UnitType.Spearman, 5) }; // 175 defense base

        var noBonus = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);
        Assert.Equal(175, noBonus.DefensePower);

        var withBonus = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 20, Abundant, seed: 1);
        Assert.Equal(210, withBonus.DefensePower);
    }

    [Fact]
    public void An_exact_tie_goes_to_the_defender_and_annihilates_both_sides()
    {
        // Both sides commit exactly equal power: 7 Spearmen attacking
        // (Attack 15 each = 105) vs 7 Axemen defending (Defense 15 each = 105).
        var attacker = new[] { new UnitStack(UnitType.Spearman, 7) };
        var defender = new[] { new UnitStack(UnitType.Axeman, 7) };

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);

        Assert.Equal(BattleWinner.Defender, plan.Winner);
        Assert.Equal(plan.AttackPower, plan.DefensePower);

        // The loser (attacker) loses everything, as always; but since the
        // ratio the winner's own losses are computed from is 1:1, the
        // "winning" defender also loses everything — an exact tie is mutual
        // annihilation, not a clean win.
        Assert.Equal(attacker, plan.AttackerLosses);
        Assert.Empty(plan.AttackerSurvivors);
        Assert.Equal(defender, plan.DefenderLosses);
        Assert.Empty(plan.DefenderSurvivors);
    }

    [Fact]
    public void An_undefended_settlement_falls_at_no_cost_to_the_attacker()
    {
        var attacker = new[] { new UnitStack(UnitType.Axeman, 10) };
        IReadOnlyList<UnitStack> defender = [];

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);

        Assert.Equal(BattleWinner.Attacker, plan.Winner);
        Assert.Empty(plan.AttackerLosses);
        Assert.Equal(attacker, plan.AttackerSurvivors);
        Assert.Empty(plan.DefenderLosses);
    }

    [Fact]
    public void A_zero_strength_attacker_is_handled_defensively_rather_than_throwing()
    {
        // Should never be reachable in practice (Settlement.PlanDispatch
        // rejects an empty unit list before an army can exist), but the
        // resolver itself must not blow up on it.
        IReadOnlyList<UnitStack> attacker = [];
        var defender = new[] { new UnitStack(UnitType.Spearman, 5) };

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);

        Assert.Equal(BattleWinner.Defender, plan.Winner);
        Assert.Empty(plan.AttackerLosses);
        Assert.Empty(plan.AttackerSurvivors);
        Assert.Empty(plan.DefenderLosses);
        Assert.Equal(defender, plan.DefenderSurvivors);
    }

    [Fact]
    public void Zero_strength_on_both_sides_is_a_bloodless_no_op()
    {
        IReadOnlyList<UnitStack> attacker = [];
        IReadOnlyList<UnitStack> defender = [];

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);

        Assert.Equal(BattleWinner.Defender, plan.Winner);
        Assert.Empty(plan.AttackerLosses);
        Assert.Empty(plan.DefenderLosses);
        Assert.Equal(ResourceAmounts.Zero, plan.LootTaken);
    }

    [Fact]
    public void Loot_is_capped_by_the_survivors_total_carry_capacity()
    {
        // 1 Axeman survives with CarryCapacity 30; the settlement holds far
        // more than that of everything.
        var attacker = new[] { new UnitStack(UnitType.Axeman, 1) };
        IReadOnlyList<UnitStack> defender = [];

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);

        var total = plan.LootTaken.Wood + plan.LootTaken.Stone + plan.LootTaken.Food + plan.LootTaken.Iron;
        Assert.Equal(30, total, 6);
        // Split evenly across the four resources when all are abundant.
        Assert.Equal(7.5, plan.LootTaken.Wood, 6);
        Assert.Equal(7.5, plan.LootTaken.Stone, 6);
        Assert.Equal(7.5, plan.LootTaken.Food, 6);
        Assert.Equal(7.5, plan.LootTaken.Iron, 6);
    }

    [Fact]
    public void Loot_is_capped_by_what_is_actually_available_and_the_shortfall_spreads_to_the_others()
    {
        // Carry capacity 120 (1 Axeman, 30) — wait, use enough units for a
        // round number: 4 Axemen => capacity 120, so an even split would want
        // 30 of each resource, but the settlement holds no wood at all.
        var attacker = new[] { new UnitStack(UnitType.Axeman, 4) };
        IReadOnlyList<UnitStack> defender = [];
        var available = new ResourceAmounts(Wood: 0, Stone: 1_000_000, Food: 1_000_000, Iron: 1_000_000);

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, available, seed: 1);

        Assert.Equal(0, plan.LootTaken.Wood, 6);
        // The 30 that would have gone to wood is re-split evenly across the
        // other three: 30 + 30/3 = 40 each.
        Assert.Equal(40, plan.LootTaken.Stone, 6);
        Assert.Equal(40, plan.LootTaken.Food, 6);
        Assert.Equal(40, plan.LootTaken.Iron, 6);
    }

    [Fact]
    public void Loot_never_exceeds_what_is_available_even_when_capacity_would_allow_more()
    {
        var attacker = new[] { new UnitStack(UnitType.Axeman, 100) }; // huge carry capacity
        IReadOnlyList<UnitStack> defender = [];
        var available = new ResourceAmounts(Wood: 5, Stone: 5, Food: 5, Iron: 5);

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, available, seed: 1);

        Assert.Equal(5, plan.LootTaken.Wood, 6);
        Assert.Equal(5, plan.LootTaken.Stone, 6);
        Assert.Equal(5, plan.LootTaken.Food, 6);
        Assert.Equal(5, plan.LootTaken.Iron, 6);
    }

    [Fact]
    public void Losses_apply_proportionally_across_multiple_stacks()
    {
        // Attacker overwhelms; defender's loss fraction lands mid-range so
        // both of the attacker's stacks should show *some* survivors and
        // some losses once inverted (use the defender-wins mirror to make
        // the "own stacks split proportionally" case land on the defender's
        // two-stack garrison instead).
        var attacker = new[] { new UnitStack(UnitType.Spearman, 5) }; // 75 attack
        var defender = new[]
        {
            new UnitStack(UnitType.Spearman, 10), // defense 350
            new UnitStack(UnitType.Axeman, 10), // defense 150
        };

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 42);

        Assert.Equal(BattleWinner.Defender, plan.Winner);
        Assert.True(plan.DefenderSurvivors.Count >= 1);

        // No stack loses more units than it had, and losses+survivors always
        // reconstitute the original count.
        foreach (var original in defender)
        {
            var lost = plan.DefenderLosses.Where(s => s.Type == original.Type).Sum(s => s.Count);
            var survived = plan.DefenderSurvivors.Where(s => s.Type == original.Type).Sum(s => s.Count);
            Assert.Equal(original.Count, lost + survived);
            Assert.InRange(lost, 0, original.Count);
        }
    }

    [Fact]
    public void The_same_seed_always_produces_the_same_result()
    {
        var attacker = new[]
        {
            new UnitStack(UnitType.Axeman, 37),
            new UnitStack(UnitType.Berserker, 11),
            new UnitStack(UnitType.Bowman, 23),
        };
        var defender = new[] { new UnitStack(UnitType.Spearman, 200) };

        var first = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 10, Abundant, seed: 12345);
        var second = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 10, Abundant, seed: 12345);

        Assert.Equal(first.Winner, second.Winner);
        Assert.Equal(first.AttackerLosses, second.AttackerLosses);
        Assert.Equal(first.AttackerSurvivors, second.AttackerSurvivors);
        Assert.Equal(first.DefenderLosses, second.DefenderLosses);
        Assert.Equal(first.DefenderSurvivors, second.DefenderSurvivors);
        Assert.Equal(first.LootTaken, second.LootTaken);
    }

    [Fact]
    public void A_different_seed_can_change_which_stack_absorbs_the_rounding_remainder_but_never_the_total()
    {
        // Three equal-sized stacks losing a fraction that produces a
        // non-integer total per stack, so the remainder must land somewhere.
        var attacker = new[]
        {
            new UnitStack(UnitType.Spearman, 10),
            new UnitStack(UnitType.Axeman, 10),
            new UnitStack(UnitType.Bowman, 10),
        };
        // Defender chosen so the attacker (winner) loses a non-trivial,
        // non-integer-per-stack fraction of its own committed units.
        var defender = new[] { new UnitStack(UnitType.Spearman, 12) }; // defense 420

        var seeds = new[] { 1, 2, 3, 4, 5 };
        var totalLostAcrossSeeds = seeds
            .Select(seed => BattleResolver.Resolve(attacker, defender, 0, Abundant, seed))
            .Select(plan => plan.AttackerLosses.Sum(s => s.Count))
            .Distinct()
            .ToList();

        // Whatever seed is used, the total lost is the single correctly
        // rounded figure — only which stack(s) absorb it may vary.
        Assert.Single(totalLostAcrossSeeds);
    }
}
