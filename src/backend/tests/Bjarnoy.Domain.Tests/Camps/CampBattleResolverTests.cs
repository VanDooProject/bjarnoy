using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Camps;

public class CampBattleResolverTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private static Camp Strong(int level = 1, string family = CampFamilies.Wolfden) =>
        new(new HexCoord(10, 0), family, level, TileOrientation.E);

    private static CampGarrison FullStrong(int level = 1) => CampGarrison.Full(CampStrength.Strong, level);

    [Fact]
    public void Army_wins_a_hunt_clears_the_camp_and_loses_the_ratio_to_the_one_and_a_half()
    {
        // 10 Axemen: attack 400 vs defense 195 -> (195/400)^1.5 = 0.34 -> 3 lost.
        var army = new[] { new UnitStack(UnitType.Axeman, 10) };

        var plan = CampBattleResolver.Hunt(army, FullStrong(), Strong(), 1, seed: 1);

        Assert.Equal(CampFightWinner.Army, plan.Winner);
        Assert.Equal(400, plan.ArmyPower);
        Assert.Equal(195, plan.CampPower);
        Assert.Equal([new UnitStack(UnitType.Axeman, 3)], plan.ArmyLosses);
        Assert.Equal([new UnitStack(UnitType.Axeman, 7)], plan.ArmySurvivors);
        Assert.Equal(FullStrong(), plan.BeastLosses);
        Assert.True(plan.BeastSurvivors.IsEmpty);
    }

    [Fact]
    public void Camp_wins_a_hunt_when_stronger_and_keeps_survivors()
    {
        var army = new[] { new UnitStack(UnitType.Axeman, 2) }; // 80 vs 195
        var plan = CampBattleResolver.Hunt(army, FullStrong(), Strong(), 1, seed: 1);

        Assert.Equal(CampFightWinner.Camp, plan.Winner);
        Assert.Equal(army, plan.ArmyLosses);
        Assert.Empty(plan.ArmySurvivors);
        Assert.Equal(ResourceAmounts.Zero, plan.Loot);
        Assert.False(plan.BeastSurvivors.IsEmpty);
        Assert.Equal(2, plan.BeastLosses.Total); // round(9 beasts * (80/195)^1.5 = 2.4)
        Assert.Equal(FullStrong().Total, plan.BeastLosses.Total + plan.BeastSurvivors.Total);
    }

    [Fact]
    public void A_tie_goes_to_the_camp()
    {
        var army = new[] { new UnitStack(UnitType.Spearman, 13) }; // 13 * 15 = 195
        var plan = CampBattleResolver.Hunt(army, FullStrong(), Strong(), 1, seed: 1);

        Assert.Equal(195, plan.ArmyPower);
        Assert.Equal(195, plan.CampPower);
        Assert.Equal(CampFightWinner.Camp, plan.Winner);
    }

    [Fact]
    public void Hunt_is_deterministic_for_a_seed()
    {
        var army = new[] { new UnitStack(UnitType.Axeman, 7), new UnitStack(UnitType.Berserker, 3) };
        var a = CampBattleResolver.Hunt(army, FullStrong(2), Strong(2), 2, seed: 42);
        var b = CampBattleResolver.Hunt(army, FullStrong(2), Strong(2), 2, seed: 42);
        Assert.Equal(a.ArmySurvivors, b.ArmySurvivors);
        Assert.Equal(a.Loot, b.Loot);
    }

    [Fact]
    public void Hunt_land_attack_bonus_scales_army_power()
    {
        var army = new[] { new UnitStack(UnitType.Axeman, 10) };
        var plan = CampBattleResolver.Hunt(army, FullStrong(), Strong(), 1, seed: 1, landAttackBonusPercent: 50);
        Assert.Equal(600, plan.ArmyPower);
    }

    [Fact]
    public void Hunt_loot_is_capped_by_the_survivors_carry_capacity()
    {
        // 7 survivors * 30 carry = 210 of the 1800 pool; the rest stays behind.
        var army = new[] { new UnitStack(UnitType.Axeman, 10) };
        var plan = CampBattleResolver.Hunt(army, FullStrong(), Strong(), 1, seed: 1);

        var total = plan.Loot.Wood + plan.Loot.Stone + plan.Loot.Food + plan.Loot.Iron;
        Assert.Equal(210, total, 6);
        Assert.Equal(0, plan.Loot.Stone);
        Assert.Equal(new ResourceAmounts(600, 0, 600, 600), plan.LootAvailable);
    }

    [Fact]
    public void Hunt_loot_takes_the_whole_pool_when_the_army_can_carry_it()
    {
        UnitStack[] army = [new UnitStack(UnitType.Axeman, 10), new UnitStack(UnitType.Thrall, 100)];
        var plan = CampBattleResolver.Hunt(army, FullStrong(), Strong(), 1, seed: 1);

        Assert.Equal(CampFightWinner.Army, plan.Winner);
        Assert.Equal(new ResourceAmounts(600, 0, 600, 600), plan.Loot);
    }

    [Fact]
    public void Hunt_on_a_damaged_camp_offers_loot_in_proportion_to_the_garrison_and_adds_leftover()
    {
        var army = new[] { new UnitStack(UnitType.Axeman, 50) };
        var plan = CampBattleResolver.Hunt(
            army, new CampGarrison(0, 3, 0), Strong(), 1, seed: 1, leftover: new ResourceAmounts(0, 0, 10, 0));

        var fraction = 90.0 / 195.0;
        Assert.Equal(Math.Floor((600 * fraction) + 10), plan.LootAvailable.Food);
        Assert.Equal(Math.Floor(600 * fraction), plan.LootAvailable.Iron);
    }

    [Fact]
    public void Hunt_on_an_empty_camp_is_no_fight_and_takes_only_leftover()
    {
        var army = new[] { new UnitStack(UnitType.Axeman, 5) }; // carry 150
        var leftover = new ResourceAmounts(0, 0, 90, 30);
        var plan = CampBattleResolver.Hunt(army, CampGarrison.Empty, Strong(), 1, seed: 1, leftover: leftover);

        Assert.Equal(CampFightWinner.Army, plan.Winner);
        Assert.Empty(plan.ArmyLosses);
        Assert.Equal(army, plan.ArmySurvivors);
        Assert.True(plan.BeastLosses.IsEmpty);
        Assert.Equal(leftover, plan.Loot);
    }

    [Fact]
    public void Hunt_on_an_empty_camp_without_leftover_gives_nothing()
    {
        var army = new[] { new UnitStack(UnitType.Axeman, 5) };
        var plan = CampBattleResolver.Hunt(army, CampGarrison.Empty, Strong(), 1, seed: 1);

        Assert.Equal(CampFightWinner.Army, plan.Winner);
        Assert.Equal(ResourceAmounts.Zero, plan.Loot);
    }

    [Fact]
    public void Hunt_empty_camp_pickup_is_capped_by_carry()
    {
        var army = new[] { new UnitStack(UnitType.Axeman, 1) }; // carry 30
        var plan = CampBattleResolver.Hunt(
            army, CampGarrison.Empty, Strong(), 1, seed: 1, leftover: new ResourceAmounts(0, 0, 500, 0));
        Assert.Equal(30, plan.Loot.Food);
    }

    [Fact]
    public void After_a_carry_capped_clear_the_rest_stays_as_leftover()
    {
        var camp = Strong();
        var state = CampState.Pristine(camp, T0);
        var army = new[] { new UnitStack(UnitType.Axeman, 10) };
        var plan = CampBattleResolver.Hunt(army, state.GarrisonAt(camp, T0, false), camp, 1, seed: 1,
            leftover: state.Leftover);

        var after = state.AfterHunt(camp, T0, plan);

        Assert.Equal(1, after.Clears);
        Assert.Equal(T0, after.ClearedAt);
        var leftoverTotal = after.Leftover.Wood + after.Leftover.Food + after.Leftover.Iron;
        Assert.Equal(1800 - 210, leftoverTotal, 6);
    }

    [Fact]
    public void Leftover_is_capped_at_one_pool_of_the_level_after_the_clear()
    {
        var camp = Strong();
        var state = CampState.Pristine(camp, T0) with { Leftover = new ResourceAmounts(0, 0, 5000, 0) };
        var army = new[] { new UnitStack(UnitType.Axeman, 10) };
        var plan = CampBattleResolver.Hunt(army, state.GarrisonAt(camp, T0, false), camp, 1, seed: 1,
            leftover: state.Leftover);

        var after = state.AfterHunt(camp, T0, plan);

        var pool = CampRules.LootPool(camp, after.EffectiveLevel(camp));
        Assert.True(after.Leftover.Food <= pool.Food);
        Assert.Equal(pool.Food, after.Leftover.Food);
    }

    [Fact]
    public void A_lost_hunt_leaves_the_leftover_unchanged_and_the_camp_alive()
    {
        var camp = Strong();
        var leftover = new ResourceAmounts(1, 2, 3, 4);
        var state = CampState.Pristine(camp, T0) with { Leftover = leftover };
        var army = new[] { new UnitStack(UnitType.Axeman, 2) };
        var plan = CampBattleResolver.Hunt(army, state.GarrisonAt(camp, T0, false), camp, 1, seed: 1, leftover: leftover);

        var after = state.AfterHunt(camp, T0, plan);

        Assert.Equal(leftover, after.Leftover);
        Assert.Equal(0, after.Clears);
        Assert.Equal(plan.BeastSurvivors, after.Snapshot);
        Assert.Equal(T0.AddHours(24), after.CalmUntil);
    }

    [Fact]
    public void Camp_attack_wins_but_losses_are_raid_capped_both_sides()
    {
        // Beast attack 6*25 + 3*2 = 156 vs 20 Thralls (defense 2 each = 40).
        var defenders = new[] { new UnitStack(UnitType.Thrall, 20) };
        var plan = CampBattleResolver.CampAttack(FullStrong(), Strong(), defenders, seed: 1);

        Assert.Equal(CampFightWinner.Camp, plan.Winner);
        Assert.Equal(156, plan.CampPower);
        Assert.Equal(40, plan.ArmyPower);
        Assert.Equal([new UnitStack(UnitType.Thrall, 10)], plan.ArmyLosses); // capped at half, not all
        Assert.Equal(ResourceAmounts.Zero, plan.Loot);
        Assert.False(plan.BeastSurvivors.IsEmpty);
        Assert.True(plan.BeastLosses.Total <= FullStrong().Total / 2 + 1);
    }

    [Fact]
    public void Camp_attack_loses_to_stronger_defenders_and_is_never_cleared()
    {
        // 100 Spearmen: defense 3500 vs beast attack 156.
        var defenders = new[] { new UnitStack(UnitType.Spearman, 100) };
        var plan = CampBattleResolver.CampAttack(FullStrong(), Strong(), defenders, seed: 1);

        Assert.Equal(CampFightWinner.Army, plan.Winner);
        Assert.Equal(FullStrong().Total / 2.0, plan.BeastLosses.Total, 1.0);
        Assert.False(plan.BeastSurvivors.IsEmpty);
        Assert.True(plan.ArmySurvivors.Sum(s => s.Count) >= 99);
        Assert.Equal(ResourceAmounts.Zero, plan.Loot);
    }

    [Fact]
    public void Camp_attack_tie_goes_to_the_defenders()
    {
        // Beast attack 156 = 78 Thralls * defense 2.
        var defenders = new[] { new UnitStack(UnitType.Thrall, 78) };
        var plan = CampBattleResolver.CampAttack(FullStrong(), Strong(), defenders, seed: 1);

        Assert.Equal(CampFightWinner.Army, plan.Winner);
    }

    [Fact]
    public void Camp_attack_on_empty_defenders_is_a_costless_camp_win()
    {
        var plan = CampBattleResolver.CampAttack(FullStrong(), Strong(), [], seed: 1);

        Assert.Equal(CampFightWinner.Camp, plan.Winner);
        Assert.True(plan.BeastLosses.IsEmpty);
        Assert.Equal(FullStrong(), plan.BeastSurvivors);
    }

    [Fact]
    public void Camp_fight_state_keeps_leftover_unchanged()
    {
        var camp = Strong();
        var leftover = new ResourceAmounts(5, 0, 5, 5);
        var state = CampState.Pristine(camp, T0) with { Leftover = leftover };
        var plan = CampBattleResolver.CampAttack(FullStrong(), camp, [new UnitStack(UnitType.Thrall, 20)], 1);

        var after = state.AfterFight(camp, T0, plan.BeastSurvivors);

        Assert.Equal(leftover, after.Leftover);
    }
}
