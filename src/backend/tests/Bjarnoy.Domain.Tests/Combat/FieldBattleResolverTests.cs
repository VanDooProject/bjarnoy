using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Combat;

public class FieldBattleResolverTests
{
    private static readonly ResourceAmounts NoLoot = ResourceAmounts.Zero;

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
        var tower = new PlacedBuilding(new HexCoord(10, 0), BuildingType.Tower, Level: 4);
        var buildings = new[] { tower };

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
            sideA, FieldBattleClaim.None, sideB, FieldBattleClaim.None, NoLoot, NoLoot, seed: 1);

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

        var plan = FieldBattleResolver.Resolve(sideA, claim, sideB, claim, NoLoot, NoLoot, seed: 1);

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
            sideA, sideAClaim, sideB, FieldBattleClaim.None, NoLoot, NoLoot, seed: 1);

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
            sideA, FieldBattleClaim.None, sideB, FieldBattleClaim.None, NoLoot, NoLoot, seed: 1);

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
            sideA, FieldBattleClaim.None, sideB, FieldBattleClaim.None, NoLoot, NoLoot, seed: 1);

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
            sideA, FieldBattleClaim.None, sideB, FieldBattleClaim.None, NoLoot, lootB, seed: 1);

        Assert.Equal(ResourceAmounts.Zero, plan.LootTakenByWinner);
    }

    [Fact]
    public void Winner_loots_the_losers_carried_resources_up_to_its_own_remaining_capacity()
    {
        var sideA = new[] { new UnitStack(UnitType.Axeman, 100) }; // huge Attack power, huge carry capacity.
        var sideB = new[] { new UnitStack(UnitType.Spearman, 1) };
        var lootB = new ResourceAmounts(Wood: 5, Stone: 0, Food: 0, Iron: 0);

        var plan = FieldBattleResolver.Resolve(
            sideA, FieldBattleClaim.None, sideB, FieldBattleClaim.None, NoLoot, lootB, seed: 1);

        Assert.Equal(FieldBattleWinner.SideA, plan.Winner);
        Assert.Equal(5, plan.LootTakenByWinner.Wood);
    }

    [Fact]
    public void Winners_own_already_carried_loot_counts_against_its_remaining_capacity()
    {
        // A single axeman has carry capacity 30. Load it up with 25 already,
        // leaving only 5 of capacity for anything looted from the loser.
        var sideA = new[] { new UnitStack(UnitType.Axeman, 1) };
        var sideB = new[] { new UnitStack(UnitType.Spearman, 100) }; // weaker Attack (1500) than... actually make B tiny.
        var lootA = new ResourceAmounts(Wood: 25, Stone: 0, Food: 0, Iron: 0);
        var lootB = new ResourceAmounts(Wood: 50, Stone: 0, Food: 0, Iron: 0);

        // Ensure side A (1 axeman, attack 40) beats side B: use 1 weak spearman instead.
        var weakB = new[] { new UnitStack(UnitType.Spearman, 1) };

        var plan = FieldBattleResolver.Resolve(
            sideA, FieldBattleClaim.None, weakB, FieldBattleClaim.None, lootA, lootB, seed: 1);

        Assert.Equal(FieldBattleWinner.SideA, plan.Winner);
        Assert.Equal(5, plan.LootTakenByWinner.Wood);
    }
}
