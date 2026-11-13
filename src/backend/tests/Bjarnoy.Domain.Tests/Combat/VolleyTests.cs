using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Combat;

/// <summary>The volley (<c>docs/design/units-and-ships.md</c> section 4): the ranged units of both sides strike before the main fight.</summary>
public class VolleyTests
{
    private static readonly ResourceAmounts Abundant = ResourceAmounts.Uniform(1_000_000);

    private static Camp StrongCamp() => new(new HexCoord(10, 0), CampFamilies.Wolfden, 1, TileOrientation.E);

    private static CampGarrison FullStrong() => CampGarrison.Full(CampStrength.Strong, 1);

    // ---- the maths -------------------------------------------------------------------------------------------

    [Fact]
    public void Power_counts_only_the_ranged_units_and_takes_the_attack_bonus()
    {
        UnitStack[] stacks = [new(UnitType.Bowman, 10), new(UnitType.Skirmisher, 5), new(UnitType.Axeman, 100)];

        Assert.Equal((10 * 20) + (5 * 10), Volley.Power(stacks));
        Assert.Equal(250 * 1.2, Volley.Power(stacks, 20), 9);
        Assert.Equal(0, Volley.Power([new UnitStack(UnitType.Axeman, 100)]));
    }

    [Theory]
    [InlineData(0, 100, 0)]
    [InlineData(10, 100, 0.1)]
    [InlineData(100, 100, 1.0 / 3)]
    [InlineData(1_000, 100, 1.0 / 3)]
    [InlineData(10, 0, 1.0 / 3)]
    public void The_loss_fraction_is_the_ranged_attack_over_the_defence_capped_at_a_third(double power, double defence, double expected)
    {
        Assert.Equal(expected, Volley.LossFraction(power, defence), 9);
    }

    // ---- BattleResolver --------------------------------------------------------------------------------------

    [Fact]
    public void Without_ranged_units_there_is_no_volley_and_the_result_is_the_plain_fight()
    {
        UnitStack[] attacker = [new(UnitType.Axeman, 30), new(UnitType.Spearman, 10)];
        UnitStack[] defender = [new(UnitType.Spearman, 25), new(UnitType.Thrall, 10)];

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 50, Abundant, seed: 5);

        Assert.Empty(plan.AttackerVolleyLosses);
        Assert.Empty(plan.DefenderVolleyLosses);
        Assert.Equal(0, plan.AttackerVolleyPower);
        Assert.Equal(0, plan.DefenderVolleyPower);
        // The fight's powers are those of the armies as they arrived.
        Assert.Equal((30 * 40) + (10 * 15), plan.AttackPower);
        Assert.Equal(((25 * 35) + (10 * 2)) * 1.5, plan.DefensePower);
    }

    [Fact]
    public void The_volley_takes_at_most_a_third_of_the_other_side()
    {
        // 30 Bowmen throw 600; ten Spearmen have 350 defence: 600 / 350 is far above the cap, so a third of them (3 of 10) fall.
        UnitStack[] attacker = [new(UnitType.Bowman, 30)];
        UnitStack[] defender = [new(UnitType.Spearman, 10)];

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);

        Assert.Equal(600, plan.AttackerVolleyPower);
        Assert.Equal(0, plan.DefenderVolleyPower);
        Assert.Equal([new UnitStack(UnitType.Spearman, 3)], plan.DefenderVolleyLosses);
        Assert.Empty(plan.AttackerVolleyLosses);
    }

    [Fact]
    public void A_weak_volley_takes_the_ratio_and_not_the_cap()
    {
        // 7 Bowmen throw 140 against 100 Spearmen (3500 defence): 4 % of them, 4 Spearmen.
        UnitStack[] attacker = [new(UnitType.Bowman, 7)];
        UnitStack[] defender = [new(UnitType.Spearman, 100)];

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);

        Assert.Equal([new UnitStack(UnitType.Spearman, 4)], plan.DefenderVolleyLosses);
    }

    [Fact]
    public void The_defenders_tower_bonus_counts_in_its_total_defence()
    {
        UnitStack[] attacker = [new(UnitType.Bowman, 8)];
        UnitStack[] defender = [new(UnitType.Spearman, 100)];

        var open = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);
        var tower = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 100, Abundant, seed: 1);

        // 160 / 3500 of 100 is 4.6 (5); 160 / 7000 of 100 is 2.3 (2).
        Assert.Equal([new UnitStack(UnitType.Spearman, 5)], open.DefenderVolleyLosses);
        Assert.Equal([new UnitStack(UnitType.Spearman, 2)], tower.DefenderVolleyLosses);
    }

    [Fact]
    public void The_attackers_thor_bonus_raises_the_volley()
    {
        UnitStack[] attacker = [new(UnitType.Bowman, 8)];
        UnitStack[] defender = [new(UnitType.Spearman, 100)];

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1, landAttackBonusPercent: 50);

        Assert.Equal(240, plan.AttackerVolleyPower);
    }

    [Fact]
    public void Both_sides_volley_at_the_same_time_on_the_armies_as_they_arrive()
    {
        // 20 Skirmishers a side: 200 against 60 defence is far over the cap, so both lose a third (7 of 20) at once.
        UnitStack[] attacker = [new(UnitType.Skirmisher, 20)];
        UnitStack[] defender = [new(UnitType.Skirmisher, 20)];

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);

        Assert.Equal(200, plan.AttackerVolleyPower);
        Assert.Equal(200, plan.DefenderVolleyPower);
        Assert.Equal([new UnitStack(UnitType.Skirmisher, 7)], plan.AttackerVolleyLosses);
        Assert.Equal([new UnitStack(UnitType.Skirmisher, 7)], plan.DefenderVolleyLosses);
        // The fight is then 13 against 13: the attacker's attack beats the defender's defence and the defender is wiped out.
        Assert.Equal(130, plan.AttackPower);
        Assert.Equal(39, plan.DefensePower);
        Assert.Equal(BattleWinner.Attacker, plan.Winner);
        Assert.Equal([new UnitStack(UnitType.Skirmisher, 20)], plan.DefenderLosses);
    }

    [Fact]
    public void The_reported_losses_are_the_volleys_and_the_fights_together()
    {
        UnitStack[] attacker = [new(UnitType.Bowman, 30), new(UnitType.Axeman, 10)];
        UnitStack[] defender = [new(UnitType.Spearman, 10)];

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 3);

        foreach (var side in new[] { (attacker, plan.AttackerLosses, plan.AttackerSurvivors), (defender, plan.DefenderLosses, plan.DefenderSurvivors) })
        {
            foreach (var sent in side.Item1)
            {
                var lost = side.Item2.Where(s => s.Type == sent.Type).Sum(s => s.Count);
                var survived = side.Item3.Where(s => s.Type == sent.Type).Sum(s => s.Count);
                Assert.Equal(sent.Count, lost + survived);
            }
        }

        var volleyKilled = plan.DefenderVolleyLosses.Sum(s => s.Count);
        Assert.True(volleyKilled > 0);
        Assert.True(plan.DefenderLosses.Sum(s => s.Count) >= volleyKilled);
    }

    [Fact]
    public void A_defending_garrisons_ranged_units_strike_first_too()
    {
        // 10 Bowmen in the garrison throw 200 at ten Axemen's 150 defence: a third of the attackers (3) fall before the fight.
        UnitStack[] attacker = [new(UnitType.Axeman, 10)];
        UnitStack[] defender = [new(UnitType.Bowman, 10)];

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);

        Assert.Equal(200, plan.DefenderVolleyPower);
        Assert.Equal(0, plan.AttackerVolleyPower);
        Assert.Equal([new UnitStack(UnitType.Axeman, 3)], plan.AttackerVolleyLosses);
        Assert.Empty(plan.DefenderVolleyLosses);
    }

    [Fact]
    public void The_volley_can_decide_a_fight_the_plain_numbers_would_have_given_the_attacker()
    {
        // 12 Axemen attack 480 against 4 Spearmen and 25 Bowmen (440 defence): without the volley the attacker wins. The Bowmen's
        // 500 takes a third of the Axemen (4 of 12) first, and 8 Axemen (320 attack) lose to 440 defence.
        UnitStack[] attacker = [new(UnitType.Axeman, 12)];
        UnitStack[] defender = [new(UnitType.Spearman, 4), new(UnitType.Bowman, 25)];

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);

        Assert.Equal([new UnitStack(UnitType.Axeman, 4)], plan.AttackerVolleyLosses);
        Assert.Equal(320, plan.AttackPower);
        Assert.Equal(BattleWinner.Defender, plan.Winner);
    }

    [Fact]
    public void A_ship_fight_has_no_volley()
    {
        UnitStack[] attacker = [new(UnitType.Snekkja, 5)];
        UnitStack[] defender = [new(UnitType.Karve, 5)];

        var plan = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 0, Abundant, seed: 1);

        Assert.Empty(plan.AttackerVolleyLosses);
        Assert.Empty(plan.DefenderVolleyLosses);
        Assert.Equal(0, plan.AttackerVolleyPower + plan.DefenderVolleyPower);
    }

    [Fact]
    public void The_same_seed_gives_the_same_volley()
    {
        UnitStack[] attacker = [new(UnitType.Bowman, 17), new(UnitType.Skirmisher, 9), new(UnitType.Axeman, 4)];
        UnitStack[] defender = [new(UnitType.Spearman, 23), new(UnitType.Axeman, 11), new(UnitType.Bowman, 6)];

        var first = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 20, Abundant, seed: 99);
        var second = BattleResolver.Resolve(attacker, defender, defenseBonusPercent: 20, Abundant, seed: 99);

        Assert.Equal(first.AttackerVolleyLosses, second.AttackerVolleyLosses);
        Assert.Equal(first.DefenderVolleyLosses, second.DefenderVolleyLosses);
        Assert.Equal(first.AttackerLosses, second.AttackerLosses);
        Assert.Equal(first.DefenderLosses, second.DefenderLosses);
    }

    // ---- the report ------------------------------------------------------------------------------------------

    [Fact]
    public void The_report_carries_the_volley_powers_and_splits_each_lines_losses()
    {
        UnitStack[] attacker = [new(UnitType.Skirmisher, 20), new(UnitType.Axeman, 10)];
        UnitStack[] defender = [new(UnitType.Bowman, 10), new(UnitType.Spearman, 10)];

        var attack = AttackResolver.Resolve(
            attacker, defender, [], defenseBonusPercent: 0, Abundant, seed: 4, raid: false, landAttackBonusPercent: 0,
            shipAttackBonusPercent: 0, targetBuildingCoord: null, defenderBuildings: [], terrainAt: null, provisionsAtBattle: 0);
        var report = BattleReport.From(
            Guid.NewGuid(), DateTimeOffset.UnixEpoch, Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), attacker, attack, seed: 4);

        Assert.Equal(200, report.AttackerVolleyPower);
        Assert.Equal(200, report.DefenderVolleyPower);
        foreach (var line in report.AttackerLines)
        {
            Assert.Equal(attack.LandFight!.AttackerVolleyLosses.Where(s => s.Type == line.Type).Sum(s => s.Count), line.VolleyLost);
            Assert.InRange(line.VolleyLost, 0, line.Lost);
        }

        foreach (var line in report.DefenderLines)
        {
            Assert.Equal(attack.LandFight!.DefenderVolleyLosses.Where(s => s.Type == line.Type).Sum(s => s.Count), line.VolleyLost);
            Assert.InRange(line.VolleyLost, 0, line.Lost);
        }

        Assert.Contains(report.AttackerLines, l => l.Type == UnitType.Skirmisher && l.VolleyLost > 0);
        Assert.Contains(report.DefenderLines, l => l.Type == UnitType.Bowman && l.VolleyLost > 0);
    }

    // ---- FieldBattleResolver ---------------------------------------------------------------------------------

    private static FieldBattlePlan Field(
        UnitStack[] sideA, FieldBattleClaim claimA, UnitStack[] sideB, FieldBattleClaim claimB) =>
        FieldBattleResolver.Resolve(
            sideA, claimA, sideB, claimB, ResourceAmounts.Zero, ResourceAmounts.Zero,
            double.PositiveInfinity, double.PositiveInfinity, seed: 1);

    [Fact]
    public void A_field_battle_without_ranged_units_has_no_volley()
    {
        var plan = Field(
            [new UnitStack(UnitType.Axeman, 10)], FieldBattleClaim.None, [new UnitStack(UnitType.Axeman, 8)], FieldBattleClaim.None);

        Assert.Empty(plan.SideAVolleyLosses);
        Assert.Empty(plan.SideBVolleyLosses);
        Assert.Equal(400, plan.SideAPower);
        Assert.Equal(320, plan.SideBPower);
    }

    [Fact]
    public void A_field_battle_volley_hits_the_other_side_before_the_fight()
    {
        // 20 Skirmishers throw 200 at ten Axemen (150 defence): a third (3) fall; the fight is then 200 against 7 Axemen's 280.
        var plan = Field(
            [new UnitStack(UnitType.Skirmisher, 20)], FieldBattleClaim.None, [new UnitStack(UnitType.Axeman, 10)], FieldBattleClaim.None);

        Assert.Equal(200, plan.SideAVolleyPower);
        Assert.Equal(0, plan.SideBVolleyPower);
        Assert.Empty(plan.SideAVolleyLosses);
        Assert.Equal([new UnitStack(UnitType.Axeman, 3)], plan.SideBVolleyLosses);
        Assert.Equal(200, plan.SideAPower);
        Assert.Equal(280, plan.SideBPower);
        Assert.Equal(FieldBattleWinner.SideB, plan.Winner);
        Assert.True(plan.SideBLosses.Sum(s => s.Count) >= 3);
    }

    [Fact]
    public void A_defending_sides_claim_bonus_counts_in_its_total_defence_in_the_volley()
    {
        UnitStack[] bowmen = [new(UnitType.Bowman, 8)];
        UnitStack[] spearmen = [new(UnitType.Spearman, 100)];

        var open = Field(spearmen, FieldBattleClaim.None, bowmen, FieldBattleClaim.None);
        var claimed = Field(spearmen, new FieldBattleClaim(true, 100), bowmen, FieldBattleClaim.None);

        Assert.Equal([new UnitStack(UnitType.Spearman, 5)], open.SideAVolleyLosses);
        Assert.Equal([new UnitStack(UnitType.Spearman, 2)], claimed.SideAVolleyLosses);
    }

    // ---- camps -----------------------------------------------------------------------------------------------

    [Fact]
    public void A_hunt_without_ranged_units_has_no_volley()
    {
        UnitStack[] army = [new(UnitType.Axeman, 10)];

        var plan = CampBattleResolver.Hunt(army, FullStrong(), StrongCamp(), 1, seed: 1, provisionsAtBattle: double.PositiveInfinity);

        Assert.Equal(0, plan.ArmyVolleyPower);
        Assert.Equal(CampGarrison.Empty, plan.BeastVolleyLosses);
    }

    [Fact]
    public void A_hunts_ranged_units_kill_up_to_a_third_of_the_beasts_before_the_fight()
    {
        // 100 Bowmen throw 2000, far above the camp's defence: a third of each tier (3 young, 6 adult: 1 and 2) dies first.
        UnitStack[] army = [new(UnitType.Bowman, 100)];

        var plan = CampBattleResolver.Hunt(army, FullStrong(), StrongCamp(), 1, seed: 1, provisionsAtBattle: double.PositiveInfinity);

        Assert.Equal(2000, plan.ArmyVolleyPower);
        Assert.Equal(new CampGarrison(1, 2, 0), plan.BeastVolleyLosses);
        Assert.Equal(CampFightWinner.Army, plan.Winner);
        // The fight is against what was left, and the whole garrison counts as killed.
        Assert.Equal(FullStrong(), plan.BeastLosses);
    }

    [Fact]
    public void A_hunt_the_camp_wins_still_reports_the_volleys_kills_inside_the_beast_losses()
    {
        // 10 Skirmishers: 100 ranged and 100 attack against the camp's 195 defence: the camp wins the fight.
        UnitStack[] army = [new(UnitType.Skirmisher, 10)];

        var plan = CampBattleResolver.Hunt(army, FullStrong(), StrongCamp(), 1, seed: 1, provisionsAtBattle: double.PositiveInfinity);

        Assert.Equal(CampFightWinner.Camp, plan.Winner);
        Assert.True(plan.BeastVolleyLosses.Total > 0);
        Assert.True(plan.BeastLosses.Total >= plan.BeastVolleyLosses.Total);
        Assert.Equal(FullStrong().Total, plan.BeastLosses.Total + plan.BeastSurvivors.Total);
    }

    [Fact]
    public void A_camp_ambush_meets_the_defenders_volley()
    {
        UnitStack[] defenders = [new(UnitType.Bowman, 100)];

        var plan = CampBattleResolver.CampAttack(FullStrong(), StrongCamp(), defenders, seed: 1);

        Assert.Equal(2000, plan.ArmyVolleyPower);
        Assert.Equal(new CampGarrison(1, 2, 0), plan.BeastVolleyLosses);
        Assert.True(plan.BeastLosses.Total >= 3);
    }

    [Fact]
    public void A_camp_attack_without_ranged_defenders_has_no_volley()
    {
        var plan = CampBattleResolver.CampAttack(FullStrong(), StrongCamp(), [new UnitStack(UnitType.Spearman, 10)], seed: 1);

        Assert.Equal(0, plan.ArmyVolleyPower);
        Assert.Equal(CampGarrison.Empty, plan.BeastVolleyLosses);
    }

    [Fact]
    public void The_camp_report_carries_the_volley()
    {
        UnitStack[] army = [new(UnitType.Bowman, 100)];
        var camp = StrongCamp();
        var plan = CampBattleResolver.Hunt(army, FullStrong(), camp, 1, seed: 1, provisionsAtBattle: double.PositiveInfinity);

        var report = CampReport.From(
            Guid.NewGuid(), Guid.NewGuid(), CampReportKind.Hunt, DateTimeOffset.UnixEpoch, camp, 1, Guid.NewGuid(), Guid.NewGuid(),
            army, FullStrong(), plan, seed: 1);

        Assert.Equal(2000, report.ArmyVolleyPower);
        Assert.Equal(1, report.BeastLines.Single(l => l.Tier == BeastTier.Young).VolleyLost);
        Assert.Equal(2, report.BeastLines.Single(l => l.Tier == BeastTier.Adult).VolleyLost);
    }
}
