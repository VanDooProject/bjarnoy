using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Combat;

public class FieldBattleResolverTests
{
    private static readonly ResourceAmounts NoLoot = ResourceAmounts.Zero;

    // Provisions already at (or above) the food capacity: there is no room to refill.
    private const double AtCapacity = double.PositiveInfinity;

    [Fact]
    public void Same_owner_is_never_hostile()
    {
        var user = Guid.NewGuid();
        Assert.False(FieldBattleResolver.IsHostile(user, guildAId: null, user, guildBId: null));
        Assert.False(FieldBattleResolver.IsHostile(user, guildAId: Guid.NewGuid(), user, guildBId: Guid.NewGuid()));
    }

    [Fact]
    public void Same_guild_is_never_hostile_even_for_different_owners()
    {
        var guild = Guid.NewGuid();
        Assert.False(FieldBattleResolver.IsHostile(Guid.NewGuid(), guild, Guid.NewGuid(), guild));
    }

    [Fact]
    public void Different_owners_and_guilds_are_hostile()
    {
        Assert.True(FieldBattleResolver.IsHostile(Guid.NewGuid(), null, Guid.NewGuid(), null));
        Assert.True(FieldBattleResolver.IsHostile(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()));
    }

    [Fact]
    public void ClaimAt_uses_the_specific_towers_own_halved_bonus_inside_its_disc()
    {
        var centre = new HexCoord(0, 0);
        // Inside the longhouse's reach, so the tower is connected and claims (the chain rule).
        var tower = new PlacedBuilding(new HexCoord(2, 0), BuildingType.Tower, Level: 4);
        var buildings = new[] { new PlacedBuilding(centre, BuildingType.Longhouse, Level: 3), tower };

        var claim = FieldBattleResolver.ClaimAt(tower.Coord, centre, buildings);

        Assert.True(claim.Claims);
        // Tower level 4 -> BuildingCatalogue.TowerDefenseBonusPercent(4) = 20, halved = 10.
        Assert.Equal(10.0, claim.DefenseBonusPercent);
    }

    [Fact]
    public void ClaimAt_uses_the_highest_tower_level_halved_inside_the_central_disc()
    {
        var centre = new HexCoord(0, 0);
        var longhouse = new PlacedBuilding(centre, BuildingType.Longhouse, Level: 3);
        var weakTower = new PlacedBuilding(new HexCoord(1, 0), BuildingType.Tower, Level: 2);
        var strongTower = new PlacedBuilding(new HexCoord(-1, 0), BuildingType.Tower, Level: 6);
        var buildings = new[] { longhouse, weakTower, strongTower };

        // A hex inside the central/Longhouse claim disc but outside both
        // towers' own (much smaller) discs.
        var farHex = new HexCoord(0, 3);

        var claim = FieldBattleResolver.ClaimAt(farHex, centre, buildings);

        Assert.True(claim.Claims);
        // Highest tower level 6 -> TowerDefenseBonusPercent(6) = 30, halved = 15.
        Assert.Equal(15.0, claim.DefenseBonusPercent);
    }

    [Fact]
    public void ClaimAt_central_disc_bonus_ignores_a_cut_off_tower_and_counts_it_once_connected()
    {
        var centre = new HexCoord(0, 0);
        var longhouse = new PlacedBuilding(centre, BuildingType.Longhouse, Level: 3);
        var hex = new HexCoord(0, 2);

        var cutOff = FieldBattleResolver.ClaimAt(
            hex, centre, [longhouse, new PlacedBuilding(new HexCoord(40, 0), BuildingType.Tower, Level: 5)]);
        var connected = FieldBattleResolver.ClaimAt(
            hex, centre, [longhouse, new PlacedBuilding(new HexCoord(-1, 0), BuildingType.Tower, Level: 5)]);

        Assert.True(cutOff.Claims);
        Assert.Equal(0.0, cutOff.DefenseBonusPercent);
        Assert.Equal(BuildingCatalogue.TowerDefenseBonusPercent(5) * 0.5, connected.DefenseBonusPercent);
    }

    [Fact]
    public void ClaimAt_returns_none_for_a_settlement_whose_longhouse_is_destroyed()
    {
        var centre = new HexCoord(0, 0);

        Assert.Equal(FieldBattleClaim.None, FieldBattleResolver.ClaimAt(centre, centre, []));
        Assert.Equal(FieldBattleClaim.None, FieldBattleResolver.ClaimAt(new HexCoord(1, 0), centre, []));
    }

    [Fact]
    public void ClaimAt_returns_none_outside_every_disc()
    {
        var centre = new HexCoord(0, 0);
        var longhouse = new PlacedBuilding(centre, BuildingType.Longhouse, Level: 1);
        var claim = FieldBattleResolver.ClaimAt(new HexCoord(500, 500), centre, new[] { longhouse });

        Assert.Equal(FieldBattleClaim.None, claim);
    }

    [Fact]
    public void Neutral_ground_uses_attack_stat_symmetrically_on_both_sides()
    {
        // Neither side claims the hex: both fight with Attack, not Defense.
        // 10 Axemen (Attack 40 = 400) vs 10 Spearmen (Attack 15 = 150,
        // Defense 35 would have been 350 - proves Attack, not Defense, is used).
        var sideA = new[] { new UnitStack(UnitType.Axeman, 10) };
        var sideB = new[] { new UnitStack(UnitType.Spearman, 10) };

        var plan = FieldBattleResolver.Resolve(
            sideA, FieldBattleClaim.None, sideB, FieldBattleClaim.None, NoLoot, NoLoot, AtCapacity, AtCapacity, seed: 1);

        Assert.Equal(400, plan.SideAPower);
        Assert.Equal(150, plan.SideBPower);
        Assert.Equal(FieldBattleWinner.SideA, plan.Winner);
        Assert.False(plan.SideAWasDefending);
        Assert.False(plan.SideBWasDefending);
    }

    [Fact]
    public void Contested_ground_where_both_sides_claim_is_also_symmetric_attack_vs_attack()
    {
        var claim = new FieldBattleClaim(true, 50);
        var sideA = new[] { new UnitStack(UnitType.Axeman, 10) };
        var sideB = new[] { new UnitStack(UnitType.Spearman, 10) };

        var plan = FieldBattleResolver.Resolve(sideA, claim, sideB, claim, NoLoot, NoLoot, AtCapacity, AtCapacity, seed: 1);

        // Both claim -> not asymmetric -> both use Attack power, bonus ignored.
        Assert.Equal(400, plan.SideAPower);
        Assert.Equal(150, plan.SideBPower);
        Assert.False(plan.SideAWasDefending);
        Assert.False(plan.SideBWasDefending);
    }

    [Fact]
    public void Exactly_one_defender_fights_with_defense_stat_plus_its_halved_bonus()
    {
        var sideAClaim = new FieldBattleClaim(true, 20); // e.g. tower level 4 halved.
        var sideA = new[] { new UnitStack(UnitType.Spearman, 10) }; // Defense 35 each -> 350 base.
        var sideB = new[] { new UnitStack(UnitType.Axeman, 1) };

        var plan = FieldBattleResolver.Resolve(
            sideA, sideAClaim, sideB, FieldBattleClaim.None, NoLoot, NoLoot, AtCapacity, AtCapacity, seed: 1);

        Assert.Equal(350 * 1.2, plan.SideAPower);
        Assert.True(plan.SideAWasDefending);
        Assert.False(plan.SideBWasDefending);
    }

    [Fact]
    public void Loser_always_loses_the_raid_capped_fraction_regardless_of_power_gap()
    {
        var sideA = new[] { new UnitStack(UnitType.Axeman, 1000) };
        var sideB = new[] { new UnitStack(UnitType.Spearman, 1) };

        var plan = FieldBattleResolver.Resolve(
            sideA, FieldBattleClaim.None, sideB, FieldBattleClaim.None, NoLoot, NoLoot, AtCapacity, AtCapacity, seed: 1);

        Assert.Equal(FieldBattleWinner.SideA, plan.Winner);
        Assert.Equal(sideB, plan.SideBLosses);
        Assert.Empty(plan.SideBSurvivors);
        // Raid-capped: the winner never loses more than 50%, and here the
        // power gap is enormous so it should barely be scratched.
        Assert.True(plan.SideASurvivors.Sum(s => s.Count) > 900);
    }

    [Fact]
    public void An_exact_tie_caps_both_sides_at_the_raid_loss_fraction_with_survivors_on_both_sides()
    {
        // Equal Attack power on both sides: 7 Spearmen (Attack 15 = 105)
        // vs 7 Axemen (Attack 40... not equal). Use equal counts/types instead.
        var sideA = new[] { new UnitStack(UnitType.Spearman, 10) };
        var sideB = new[] { new UnitStack(UnitType.Spearman, 10) };

        var plan = FieldBattleResolver.Resolve(
            sideA, FieldBattleClaim.None, sideB, FieldBattleClaim.None, NoLoot, NoLoot, AtCapacity, AtCapacity, seed: 1);

        Assert.Equal(FieldBattleWinner.Tie, plan.Winner);
        Assert.Equal(plan.SideAPower, plan.SideBPower);

        // Raid cap is 50%: exactly half (5 of 10) survive on each side —
        // no infinite/mutual annihilation like the settlement-siege tie rule.
        Assert.Equal(5, plan.SideASurvivors.Sum(s => s.Count));
        Assert.Equal(5, plan.SideBSurvivors.Sum(s => s.Count));
        Assert.Equal(NoLoot, plan.LootTakenByWinner);
    }

    [Fact]
    public void No_loot_changes_hands_on_a_tie()
    {
        var sideA = new[] { new UnitStack(UnitType.Spearman, 10) };
        var sideB = new[] { new UnitStack(UnitType.Spearman, 10) };
        var lootB = new ResourceAmounts(Wood: 100, Stone: 0, Food: 0, Iron: 0);

        var plan = FieldBattleResolver.Resolve(
            sideA, FieldBattleClaim.None, sideB, FieldBattleClaim.None, NoLoot, lootB, AtCapacity, AtCapacity, seed: 1);

        Assert.Equal(ResourceAmounts.Zero, plan.LootTakenByWinner);
    }

    [Fact]
    public void Winner_loots_the_losers_carried_resources_up_to_its_own_remaining_capacity()
    {
        var sideA = new[] { new UnitStack(UnitType.Axeman, 100) }; // huge Attack power, huge carry capacity.
        var sideB = new[] { new UnitStack(UnitType.Spearman, 1) };
        var lootB = new ResourceAmounts(Wood: 5, Stone: 0, Food: 0, Iron: 0);

        var plan = FieldBattleResolver.Resolve(
            sideA, FieldBattleClaim.None, sideB, FieldBattleClaim.None, NoLoot, lootB, AtCapacity, AtCapacity, seed: 1);

        Assert.Equal(FieldBattleWinner.SideA, plan.Winner);
        Assert.Equal(5, plan.LootTakenByWinner.Wood);
    }

    [Fact]
    public void Winners_own_already_carried_loot_counts_against_its_remaining_capacity()
    {
        // A single axeman has carry capacity 40. Load it up with 35 already,
        // leaving only 5 of capacity for anything looted from the loser.
        var sideA = new[] { new UnitStack(UnitType.Axeman, 1) };
        var sideB = new[] { new UnitStack(UnitType.Spearman, 100) }; // weaker Attack (1500) than... actually make B tiny.
        var lootA = new ResourceAmounts(Wood: 35, Stone: 0, Food: 0, Iron: 0);
        var lootB = new ResourceAmounts(Wood: 50, Stone: 0, Food: 0, Iron: 0);

        // Ensure side A (1 axeman, attack 40) beats side B: use 1 weak spearman instead.
        var weakB = new[] { new UnitStack(UnitType.Spearman, 1) };

        var plan = FieldBattleResolver.Resolve(
            sideA, FieldBattleClaim.None, weakB, FieldBattleClaim.None, lootA, lootB, AtCapacity, AtCapacity, seed: 1);

        Assert.Equal(FieldBattleWinner.SideA, plan.Winner);
        Assert.Equal(5, plan.LootTakenByWinner.Wood);
    }

    private static int Count(IEnumerable<UnitStack> stacks, UnitType type) => stacks.Where(s => s.Type == type).Sum(s => s.Count);

    [Fact]
    public void A_fleets_passengers_do_not_fight_and_drown_beyond_the_slots_of_the_ships_left()
    {
        // Side A: 4 Longships (attack 240, 80 slots) carrying 80 spearmen, who would add 1200 attack on land.
        var sideA = new[] { new UnitStack(UnitType.Snekkja, 4), new UnitStack(UnitType.Spearman, 80) };
        var sideB = new[] { new UnitStack(UnitType.Snekkja, 3) };

        var plan = FieldBattleResolver.Resolve(sideA, FieldBattleClaim.None, sideB, FieldBattleClaim.None, NoLoot, NoLoot, AtCapacity, AtCapacity, seed: 1);

        Assert.Equal(240, plan.SideAPower);
        Assert.Equal(FieldBattleWinner.SideA, plan.Winner);
        // The winner loses at most half of its ships (the raid cap): 2 of 4 left, 40 slots for 80 spearmen.
        Assert.Equal(2, Count(plan.SideASurvivors, UnitType.Snekkja));
        Assert.Equal(40, Count(plan.SideASurvivors, UnitType.Spearman));
        Assert.Equal(40, Count(plan.SideALosses, UnitType.Spearman));
    }

    [Fact]
    public void A_land_army_in_a_field_battle_has_no_passengers_and_fights_whole()
    {
        var sideA = new[] { new UnitStack(UnitType.Axeman, 10), new UnitStack(UnitType.Spearman, 10) };
        var sideB = new[] { new UnitStack(UnitType.Spearman, 10) };

        var plan = FieldBattleResolver.Resolve(sideA, FieldBattleClaim.None, sideB, FieldBattleClaim.None, NoLoot, NoLoot, AtCapacity, AtCapacity, seed: 1);

        Assert.Equal(550, plan.SideAPower);
    }

    // ---- Refill (docs/design/troop-movement-range.md section 1b): only from the loser's carried food, never its provisions

    [Fact]
    public void The_winner_refills_its_provisions_from_the_losers_carried_food_before_the_loot()
    {
        var sideA = new[] { new UnitStack(UnitType.Axeman, 100) }; // food capacity 4000, carry 3000
        var sideB = new[] { new UnitStack(UnitType.Spearman, 1) };
        var lootB = new ResourceAmounts(Wood: 100, Stone: 0, Food: 300, Iron: 0);

        var plan = FieldBattleResolver.Resolve(
            sideA, FieldBattleClaim.None, sideB, FieldBattleClaim.None, NoLoot, lootB, sideAProvisions: 3900, sideBProvisions: 5, seed: 1);

        Assert.Equal(FieldBattleWinner.SideA, plan.Winner);
        Assert.Equal(100, plan.FoodRefillToWinner);
        // The rest of the carried food (200) and the wood are loot.
        Assert.Equal(new ResourceAmounts(Wood: 100, Stone: 0, Food: 200, Iron: 0), plan.LootTakenByWinner);
    }

    [Fact]
    public void The_refill_never_takes_the_losers_provisions_only_what_it_carried_as_loot()
    {
        var sideA = new[] { new UnitStack(UnitType.Axeman, 100) };
        var sideB = new[] { new UnitStack(UnitType.Spearman, 1) };

        var plan = FieldBattleResolver.Resolve(
            sideA, FieldBattleClaim.None, sideB, FieldBattleClaim.None, NoLoot, NoLoot, sideAProvisions: 0, sideBProvisions: 5000, seed: 1);

        Assert.Equal(0, plan.FoodRefillToWinner);
        Assert.Equal(ResourceAmounts.Zero, plan.LootTakenByWinner);
    }

    [Fact]
    public void A_tie_refills_nobody_and_the_refill_is_capped_by_the_room_in_the_winners_provisions()
    {
        var spearmen = new[] { new UnitStack(UnitType.Spearman, 10) };
        var lootB = new ResourceAmounts(Wood: 0, Stone: 0, Food: 500, Iron: 0);
        var tie = FieldBattleResolver.Resolve(
            spearmen, FieldBattleClaim.None, spearmen, FieldBattleClaim.None, NoLoot, lootB, sideAProvisions: 0, sideBProvisions: 0, seed: 1);
        Assert.Equal(0, tie.FoodRefillToWinner);

        var full = FieldBattleResolver.Resolve(
            [new UnitStack(UnitType.Axeman, 100)], FieldBattleClaim.None, [new UnitStack(UnitType.Spearman, 1)], FieldBattleClaim.None,
            NoLoot, lootB, sideAProvisions: 4000, sideBProvisions: 0, seed: 1);
        Assert.Equal(0, full.FoodRefillToWinner);
        Assert.Equal(500, full.LootTakenByWinner.Food);
    }
}
