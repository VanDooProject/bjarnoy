using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Camps;

/// <summary>
/// Naglfar, the endgame sea garrison (docs/design/endgame.md, "Naglfar"): its fixed crew and powers, the 48 h regrowth after a 1 h
/// grace, the 1 h calm, the full-battle ambush (the whale road's is raid-capped) and the fixed 6 000 hunt loot.
/// </summary>
public class NaglfarTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private static Camp Naglfar() => new(new HexCoord(10, 0), CampFamilies.Naglfar, 1, TileOrientation.E);

    private static Camp Whale() => new(new HexCoord(10, 0), CampFamilies.Whaleroad, 1, TileOrientation.E);

    private static UnitStack[] Snekkjas(int count) => [new UnitStack(UnitType.Snekkja, count)];

    [Fact]
    public void Naglfar_is_a_strong_water_endgame_camp_with_guard_range_eight_and_the_whale_road_is_none_of_that()
    {
        var naglfar = Naglfar();
        Assert.True(naglfar.Strong);
        Assert.True(naglfar.IsWater);
        Assert.True(naglfar.IsEndgame);
        Assert.Equal(8, naglfar.GuardRange);
        // The guard range does not follow the rolled level.
        Assert.Equal(8, (naglfar with { Level = 5 }).GuardRange);

        Assert.False(Whale().IsEndgame);
        Assert.Equal(0, Whale().GuardRange);
        Assert.Equal(CampFamilies.Naglfar, CampFamilies.All[^1].Family);
    }

    [Fact]
    public void The_crew_is_fixed_whatever_the_level_or_clears_and_its_power_is_sixty_thousand_each_way()
    {
        var camp = Naglfar();
        var crew = new CampGarrison(0, 100, 1);
        Assert.Equal(crew, CampGarrison.Full(camp, 1));
        Assert.Equal(crew, CampGarrison.Full(camp, 100));
        Assert.Equal(crew, CampState.Pristine(camp, T0).GarrisonAt(camp, T0, insideRealm: false));

        Assert.Equal(60_000, crew.AttackPower(camp));
        Assert.Equal(60_000, crew.DefensePower(camp));
        Assert.Equal((300, 300), CampRules.BeastStats(camp, BeastTier.Adult));
        Assert.Equal((30_000, 30_000), CampRules.BeastStats(camp, BeastTier.Alpha));
        Assert.Equal((0, 0), CampRules.BeastStats(camp, BeastTier.Young));

        // A whale road of the same level keeps the land table.
        Assert.Equal(CampGarrison.Full(CampStrength.Strong, 1), CampGarrison.Full(Whale(), 1));
    }

    [Fact]
    public void A_cleared_naglfar_stays_empty_for_the_grace_hour_then_regrows_linearly_over_48_hours()
    {
        var camp = Naglfar();
        var cleared = CampState.Pristine(camp, T0).AfterFight(camp, T0, CampGarrison.Empty);

        Assert.True(cleared.GarrisonAt(camp, T0.AddMinutes(59), false).IsEmpty);
        Assert.True(cleared.GarrisonAt(camp, T0.AddHours(1), false).IsEmpty);
        Assert.Equal(new CampGarrison(0, 2, 0), cleared.GarrisonAt(camp, T0.AddHours(1).AddMinutes(58), false));
        Assert.Equal(new CampGarrison(0, 50, 0), cleared.GarrisonAt(camp, T0.AddHours(1 + 24), false));
        Assert.Equal(new CampGarrison(0, 100, 1), cleared.GarrisonAt(camp, T0.AddHours(1 + 48), false));
        // Nobody holds a sea hex: a realm's claim over it changes nothing.
        Assert.Equal(new CampGarrison(0, 100, 1), cleared.GarrisonAt(camp, T0.AddHours(1 + 48), insideRealm: true));
    }

    [Fact]
    public void A_damaged_naglfar_that_is_not_cleared_regrows_at_once_without_the_grace()
    {
        var camp = Naglfar();
        var damaged = CampState.Pristine(camp, T0).AfterFight(camp, T0, new CampGarrison(0, 10, 0));

        Assert.Equal(new CampGarrison(0, 10 + 50, 0), damaged.GarrisonAt(camp, T0.AddHours(24), false));
    }

    [Fact]
    public void The_grace_applies_to_endgame_camps_only()
    {
        var camp = Whale();
        var cleared = CampState.Pristine(camp, T0).AfterFight(camp, T0, CampGarrison.Empty);

        Assert.False(cleared.GarrisonAt(camp, T0.AddHours(4), false).IsEmpty);
        Assert.Equal(CampGarrison.Full(CampStrength.Strong, 1), cleared.GarrisonAt(camp, T0.AddHours(8), false));
    }

    [Fact]
    public void After_a_fight_naglfar_is_calm_for_one_hour_where_other_camps_stay_calm_for_a_day()
    {
        var camp = Naglfar();
        var after = CampState.Pristine(camp, T0).AfterFight(camp, T0, new CampGarrison(0, 40, 1));

        Assert.True(after.IsCalmAt(T0.AddMinutes(59)));
        Assert.False(after.IsAggressiveAt(camp, T0.AddMinutes(59), false));
        Assert.False(after.IsCalmAt(T0.AddHours(1)));
        Assert.True(after.IsAggressiveAt(camp, T0.AddHours(1), false));

        var whale = Whale();
        var whaleAfter = CampState.Pristine(whale, T0).AfterFight(whale, T0, new CampGarrison(1, 1, 0));
        Assert.True(whaleAfter.IsCalmAt(T0.AddHours(23)));
    }

    [Fact]
    public void The_ambush_is_a_full_battle_a_beaten_naglfar_loses_its_whole_crew_where_the_whale_roads_loss_is_capped()
    {
        var fleet = Snekkjas(1600); // defense 64 000 beats Naglfar's attack of 60 000

        var naglfar = CampBattleResolver.CampAttack(CampGarrison.Full(Naglfar(), 1), Naglfar(), fleet, seed: 3);
        Assert.Equal(CampFightWinner.Army, naglfar.Winner);
        Assert.True(naglfar.BeastSurvivors.IsEmpty, "the beaten crew is gone, no 0.5 cap");
        // (60 000 / 64 000)^1.5 = 0.9077 of the fleet is lost.
        Assert.InRange(naglfar.ArmyLosses.Sum(s => s.Count), 1450, 1455);

        var whale = CampBattleResolver.CampAttack(CampGarrison.Full(CampStrength.Strong, 1), Whale(), Snekkjas(20), seed: 3);
        Assert.Equal(CampFightWinner.Army, whale.Winner);
        Assert.False(whale.BeastSurvivors.IsEmpty, "a whale road is never cleared by its own attack");
    }

    [Fact]
    public void A_fleet_that_loses_the_ambush_loses_every_ship_and_naglfar_loses_by_the_ratio()
    {
        var fleet = Snekkjas(500); // defense 20 000 against 60 000

        var plan = CampBattleResolver.Ambush(CampGarrison.Full(Naglfar(), 1), Naglfar(), fleet, seed: 3);

        Assert.Equal(CampFightWinner.Camp, plan.Winner);
        Assert.Empty(plan.ArmySurvivors);
        Assert.Equal(500, plan.ArmyLosses.Sum(s => s.Count));
        // (20 000 / 60 000)^1.5 = 0.19 of the 101 crew.
        Assert.InRange(plan.BeastLosses.Total, 18, 20);
        Assert.Equal(101, plan.BeastLosses.Total + plan.BeastSurvivors.Total);
        Assert.Equal(ResourceAmounts.Zero, plan.Loot);

        // The same hopeless fleet against a whale road keeps half its ships at most lost.
        var whale = CampBattleResolver.CampAttack(CampGarrison.Full(CampStrength.Strong, 5), Whale() with { Level = 5 }, Snekkjas(2), seed: 3);
        Assert.True(whale.ArmyLosses.Sum(s => s.Count) <= 1);
    }

    [Fact]
    public void A_winning_hunt_takes_the_fixed_pool_iron_three_thousand_wood_and_brick_fifteen_hundred_each()
    {
        var camp = Naglfar();
        var fleet = Snekkjas(2000); // attack 120 000 against 60 000; (60 000 / 120 000)^1.5 = 35 % lost, 1 292 ships carry 103 360

        var plan = CampBattleResolver.Hunt(
            fleet, CampGarrison.Full(camp, 1), camp, 1, seed: 5, provisionsAtBattle: double.PositiveInfinity);

        Assert.Equal(CampFightWinner.Army, plan.Winner);
        Assert.Equal(new ResourceAmounts(Wood: 1500, Stone: 1500, Food: 0, Iron: 3000), plan.Loot);
        Assert.Equal(0, plan.Refill);
    }

    [Fact]
    public void The_pool_is_not_scaled_by_the_crew_left_and_an_empty_naglfar_offers_nothing()
    {
        var camp = Naglfar();
        var half = new CampGarrison(0, 50, 0);

        Assert.Equal(
            new ResourceAmounts(Wood: 1500, Stone: 1500, Food: 0, Iron: 3000),
            CampBattleResolver.LootAvailable(default, camp, 1, half));
        Assert.Equal(ResourceAmounts.Zero, CampBattleResolver.LootAvailable(default, camp, 1, CampGarrison.Empty));
        // Whatever leftover a state might carry is not offered: nothing stays behind at Naglfar.
        Assert.Equal(ResourceAmounts.Zero, CampBattleResolver.LootAvailable(new ResourceAmounts(99, 0, 0, 0), camp, 1, CampGarrison.Empty));
    }

    [Fact]
    public void A_fleet_that_cannot_carry_the_pool_takes_what_it_can_and_the_rest_is_lost()
    {
        var camp = Naglfar();
        var state = CampState.Pristine(camp, T0);
        // 1 001 Snekkjas attack with 60 060, just above Naglfar's 60 000 defense: all but a ship or two are lost, so the few that
        // sail home carry far less than the 6 000 on offer.
        var fleet = Snekkjas(1001);
        var plan = CampBattleResolver.Hunt(fleet, state.GarrisonAt(camp, T0, false), camp, 1, seed: 7, double.PositiveInfinity);
        Assert.Equal(CampFightWinner.Army, plan.Winner);

        var survivors = plan.ArmySurvivors.Sum(s => s.Count);
        var carry = survivors * UnitCatalogue.Get(UnitType.Snekkja).CarryCapacity;
        Assert.True(carry < 6000, "the setup is meant to cap the loot");
        Assert.Equal(carry, plan.Loot.Wood + plan.Loot.Stone + plan.Loot.Iron, 3);

        var after = state.AfterHunt(camp, T0, plan);
        Assert.Equal(ResourceAmounts.Zero, after.Leftover);
        Assert.True(after.IsEmptyAt(camp, T0, false));
        Assert.True(after.IsCalmAt(T0.AddMinutes(30)));
    }

    [Fact]
    public void A_lost_hunt_keeps_the_crew_losses_and_gives_no_loot()
    {
        var camp = Naglfar();
        var plan = CampBattleResolver.Hunt(
            Snekkjas(600), CampGarrison.Full(camp, 1), camp, 1, seed: 5, provisionsAtBattle: double.PositiveInfinity); // 36 000 < 60 000

        Assert.Equal(CampFightWinner.Camp, plan.Winner);
        Assert.Empty(plan.ArmySurvivors);
        Assert.Equal(ResourceAmounts.Zero, plan.Loot);
        Assert.False(plan.BeastSurvivors.IsEmpty);
        Assert.True(plan.BeastLosses.Total > 0);
    }

    [Fact]
    public void Naglfars_loot_kinds_are_iron_two_wood_one_brick_one_and_no_food()
    {
        var kinds = CampRules.LootKinds(CampFamilies.Naglfar);
        Assert.Equal(2, kinds.Single(k => k.Kind == "iron").Weight);
        Assert.Equal(1, kinds.Single(k => k.Kind == "wood").Weight);
        Assert.Equal(1, kinds.Single(k => k.Kind == "stone").Weight);
        Assert.DoesNotContain(kinds, k => k.Kind == "food");
        Assert.Equal(
            new ResourceAmounts(Wood: 1500, Stone: 1500, Food: 0, Iron: 3000), CampRules.LootPool(Naglfar() with { Level = 7 }, 40));
    }
}
