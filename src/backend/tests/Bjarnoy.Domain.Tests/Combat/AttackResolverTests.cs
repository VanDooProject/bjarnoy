using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Combat;

/// <summary>
/// An attack is a ship fight and then a land fight (<c>docs/design/economy.md</c>, "Fleets"): rules 1 to 9 of the phase A spec, plus
/// the Fire Ship burn counts.
/// </summary>
public class AttackResolverTests
{
    private static readonly HexCoord Centre = new(0, 0);
    private static readonly HexCoord LandHex = new(1, 0);
    private static readonly HexCoord SeaHex = new(5, 0);
    private static readonly ResourceAmounts Stock = new(10_000, 10_000, 10_000, 10_000);

    // Sea at 3 <= q <= 8, grass everywhere else.
    private static Terrain Strait(HexCoord c) => c.Q is >= 3 and <= 8 ? Terrain.Sea : Terrain.Grass;

    private static PlacedBuilding[] Buildings(params PlacedBuilding[] extra) =>
        [new(Centre, BuildingType.Longhouse, 10), .. extra];

    private static AttackPlan Attack(
        UnitStack[] attacker,
        UnitStack[]? home = null,
        UnitStack[]? guests = null,
        PlacedBuilding[]? buildings = null,
        HexCoord? target = null,
        bool raid = false,
        double defenseBonus = 0,
        double landBonus = 0,
        double shipBonus = 0,
        ResourceAmounts? loot = null,
        double provisions = double.PositiveInfinity) =>
        AttackResolver.Resolve(
            attacker, home ?? [], guests ?? [], defenseBonus, loot ?? Stock, seed: 1, raid, landBonus, shipBonus,
            target, buildings ?? Buildings(), Strait, provisions);

    private static int Count(IEnumerable<UnitStack> stacks, UnitType type) => stacks.Where(s => s.Type == type).Sum(s => s.Count);

    // ---- Rule 1: a land army fights the land units only

    [Fact]
    public void A_land_army_fights_one_land_fight_against_the_land_units_and_the_defenders_ships_stay_out()
    {
        var plan = Attack(
            [new(UnitType.Axeman, 20)], home: [new(UnitType.Spearman, 10), new(UnitType.Longship, 5)],
            guests: [new(UnitType.Longship, 2)]);

        Assert.Null(plan.ShipFight);
        Assert.Equal(10 * 35, plan.LandFight!.DefensePower);
        Assert.Equal(BattleWinner.Attacker, plan.Winner);
        Assert.DoesNotContain(plan.DefenderHomeLosses, s => s.Type == UnitType.Longship);
        Assert.Empty(plan.DefenderGuestLosses);
        Assert.Empty(plan.Drowned);
    }

    [Fact]
    public void A_land_armys_won_fight_sieges_with_random_fallback_and_loots_with_its_own_capacity()
    {
        var farm = new PlacedBuilding(LandHex, BuildingType.Farm, 9);
        var plan = Attack([new(UnitType.Catapult, 1), new(UnitType.Spearman, 50)], buildings: Buildings(farm), target: new HexCoord(9, 9));

        // The named hex has no building, so a random one the catapult can damage is hit.
        Assert.True(plan.LandSiege.Applied);
        Assert.Equal(1000, plan.Loot.Wood + plan.Loot.Stone + plan.Loot.Food + plan.Loot.Iron);
    }

    // ---- Rule 2: the ship fight

    [Fact]
    public void A_defender_without_ships_means_no_ship_fight_and_no_losses()
    {
        var plan = Attack([new(UnitType.Karve, 5)], home: [new(UnitType.Spearman, 500)]);

        Assert.Null(plan.ShipFight);
        Assert.Null(plan.LandFight);
        Assert.Equal(BattleWinner.Attacker, plan.Winner);
        Assert.Empty(plan.AttackerLosses);
        Assert.Equal(5, Count(plan.AttackerSurvivors, UnitType.Karve));
    }

    [Fact]
    public void Every_defending_ship_home_and_guest_fights_the_attacking_ships_wherever_they_stand()
    {
        var plan = Attack([new(UnitType.Karve, 5)], home: [new(UnitType.Longship, 1)], guests: [new(UnitType.Longship, 2)]);

        Assert.Equal(25, plan.ShipFight!.AttackPower);
        Assert.Equal(120, plan.ShipFight.DefensePower);
        Assert.Equal(BattleWinner.Defender, plan.Winner);
    }

    [Fact]
    public void Fire_ships_take_part_in_the_ship_fight_with_no_attack_and_can_be_sunk()
    {
        var plan = Attack(
            [new(UnitType.Karve, 40), new(UnitType.FireShip, 30)], home: [new(UnitType.Longship, 3)]);

        Assert.Equal(200, plan.ShipFight!.AttackPower);
        Assert.Equal(BattleWinner.Attacker, plan.Winner);
        var sunk = Count(plan.ShipFight.AttackerLosses, UnitType.FireShip);
        Assert.InRange(sunk, 1, 30);
        Assert.Equal(30 - sunk, Count(plan.ShipFight.AttackerSurvivors, UnitType.FireShip));
    }

    // ---- Rule 3: a lost ship fight ends the attack

    [Fact]
    public void A_lost_ship_fight_means_no_land_fight_no_loot_no_siege_no_burn_and_the_passengers_drown()
    {
        var dockyard = new PlacedBuilding(SeaHex, BuildingType.Dockyard, 3);
        var plan = Attack(
            [new(UnitType.Karve, 5), new(UnitType.Spearman, 10)], home: [new(UnitType.Longship, 100)],
            buildings: Buildings(dockyard), target: SeaHex);

        Assert.Equal(BattleWinner.Defender, plan.ShipFight!.Winner);
        Assert.Null(plan.LandFight);
        Assert.Equal(ResourceAmounts.Zero, plan.Loot);
        Assert.False(plan.LandSiege.Applied);
        Assert.False(plan.FireSiege.Applied);
        Assert.Equal(0, plan.FireShipsBurned);
        Assert.Equal(10, Count(plan.Drowned, UnitType.Spearman));
        Assert.Empty(plan.AttackerSurvivors);
    }

    [Fact]
    public void A_lost_ship_fight_in_a_raid_returns_the_surviving_fire_ships_and_burns_nothing()
    {
        var dockyard = new PlacedBuilding(SeaHex, BuildingType.Dockyard, 3);
        var plan = Attack(
            [new(UnitType.Karve, 5), new(UnitType.FireShip, 30)], home: [new(UnitType.Longship, 100)],
            buildings: Buildings(dockyard), target: SeaHex, raid: true);

        Assert.Equal(BattleWinner.Defender, plan.Winner);
        Assert.Equal(0, plan.FireShipsBurned);
        Assert.False(plan.FireSiege.Applied);
        Assert.Equal(3, plan.Buildings.Single(b => b.Coord == SeaHex).Level);
        Assert.True(Count(plan.AttackerSurvivors, UnitType.FireShip) > 0);
    }

    // ---- Rule 4: the passengers beyond the surviving ships' slots drown before the land fight

    [Fact]
    public void Passengers_beyond_the_slots_of_the_surviving_ships_drown_before_the_land_fight()
    {
        // 2 Longships (attack 120) against 2 Longships (defence 80): one ship is lost, its 20 slots go with it.
        var plan = Attack([new(UnitType.Longship, 2), new(UnitType.Spearman, 40)], home: [new(UnitType.Longship, 2)]);

        Assert.Equal(BattleWinner.Attacker, plan.ShipFight!.Winner);
        Assert.Equal(1, Count(plan.ShipFight.AttackerLosses, UnitType.Longship));
        Assert.Equal(20, Count(plan.Drowned, UnitType.Spearman));
        Assert.Equal(20, Count(plan.LandFight!.AttackerSurvivors, UnitType.Spearman) + Count(plan.LandFight.AttackerLosses, UnitType.Spearman));
        Assert.Equal(20, Count(plan.AttackerLosses, UnitType.Spearman) - Count(plan.LandFight.AttackerLosses, UnitType.Spearman));
    }

    // ---- Rule 5: the land fight is what is still aboard against the land units

    [Fact]
    public void The_land_fight_pits_the_passengers_against_the_garrison_and_the_guests_and_splits_the_losses_home_and_guest()
    {
        var plan = Attack(
            [new(UnitType.Longship, 5), new(UnitType.Axeman, 80)],
            home: [new(UnitType.Spearman, 10), new(UnitType.Longship, 1)], guests: [new(UnitType.Spearman, 10)]);

        // The ships win at sea first; then 80 axemen (attack 80 * 40) against 20 spearmen.
        Assert.Equal(BattleWinner.Attacker, plan.ShipFight!.Winner);
        Assert.Equal(20 * 35, plan.LandFight!.DefensePower);
        Assert.Equal(BattleWinner.Attacker, plan.Winner);
        Assert.Equal(10, Count(plan.DefenderHomeLosses, UnitType.Spearman));
        Assert.Equal(10, Count(plan.DefenderGuestLosses, UnitType.Spearman));
        Assert.Equal(1, Count(plan.DefenderHomeLosses, UnitType.Longship));
    }

    [Fact]
    public void Siege_engines_aboard_fire_in_the_land_fight()
    {
        var farm = new PlacedBuilding(LandHex, BuildingType.Farm, 9);
        var plan = Attack(
            [new(UnitType.Longship, 1), new(UnitType.Catapult, 1), new(UnitType.Spearman, 5)],
            buildings: Buildings(farm), target: LandHex);

        Assert.True(plan.LandSiege.Applied);
        Assert.Equal(LandHex, plan.LandSiege.TargetCoord);
        Assert.Equal(9 - SiegeResolver.LevelsDestroyed(40), plan.Buildings.Single(b => b.Coord == LandHex).Level);
    }

    [Fact]
    public void A_defender_without_land_units_is_a_costless_win_for_the_passengers()
    {
        var plan = Attack([new(UnitType.Karve, 1), new(UnitType.Spearman, 10)]);

        Assert.Equal(BattleWinner.Attacker, plan.LandFight!.Winner);
        Assert.Empty(plan.AttackerLosses);
        Assert.Equal(10, Count(plan.AttackerSurvivors, UnitType.Spearman));
    }

    [Fact]
    public void A_fleet_without_passengers_has_no_land_fight_no_loot_and_no_land_siege()
    {
        var farm = new PlacedBuilding(LandHex, BuildingType.Farm, 9);
        var plan = Attack([new(UnitType.Karve, 5)], home: [new(UnitType.Spearman, 1)], buildings: Buildings(farm), target: LandHex);

        Assert.Null(plan.LandFight);
        Assert.Equal(ResourceAmounts.Zero, plan.Loot);
        Assert.False(plan.LandSiege.Applied);
        Assert.Equal(9, plan.Buildings.Single(b => b.Coord == LandHex).Level);
    }

    [Fact]
    public void A_lost_land_fight_loses_the_passengers_not_the_ships_and_takes_no_loot()
    {
        var plan = Attack([new(UnitType.Karve, 5), new(UnitType.Spearman, 10)], home: [new(UnitType.Spearman, 100)]);

        Assert.Equal(BattleWinner.Defender, plan.LandFight!.Winner);
        Assert.Equal(BattleWinner.Defender, plan.Winner);
        Assert.Equal(5, Count(plan.AttackerSurvivors, UnitType.Karve));
        Assert.Equal(0, Count(plan.AttackerSurvivors, UnitType.Spearman));
        Assert.Equal(10, Count(plan.AttackerLosses, UnitType.Spearman));
        Assert.Equal(ResourceAmounts.Zero, plan.Loot);
    }

    // ---- Rule 6: a target in the water is a ship fight only

    [Theory]
    [InlineData(BuildingType.Dockyard)]
    [InlineData(BuildingType.FishingHut)]
    [InlineData(BuildingType.Palisade)]
    public void A_target_in_the_water_skips_the_land_fight_and_takes_no_loot(BuildingType type)
    {
        var building = new PlacedBuilding(SeaHex, type, 3);
        var plan = Attack(
            [new(UnitType.Karve, 5), new(UnitType.Spearman, 10), new(UnitType.Catapult, 1)], home: [new(UnitType.Spearman, 1)],
            buildings: Buildings(building), target: SeaHex);

        Assert.Null(plan.LandFight);
        Assert.False(plan.LandSiege.Applied);
        Assert.Equal(ResourceAmounts.Zero, plan.Loot);
        Assert.Equal(10, Count(plan.AttackerSurvivors, UnitType.Spearman));
        Assert.Equal(3, plan.Buildings.Single(b => b.Coord == SeaHex).Level);
        Assert.Empty(plan.DefenderHomeLosses);
    }

    [Fact]
    public void A_target_on_land_is_fought_over_on_land()
    {
        var plan = Attack(
            [new(UnitType.Karve, 5), new(UnitType.Spearman, 10)], home: [new(UnitType.Spearman, 1)],
            buildings: Buildings(new PlacedBuilding(LandHex, BuildingType.Sawmill, 3)), target: LandHex);

        Assert.NotNull(plan.LandFight);
    }

    // ---- Rule 7: loot

    [Fact]
    public void A_fleets_loot_is_capped_by_its_surviving_ships_carry_capacity_only()
    {
        // 100 spearmen could carry 2000; the Karve carries 200.
        var plan = Attack([new(UnitType.Karve, 1), new(UnitType.Spearman, 10)]);

        Assert.Equal(200, plan.Loot.Wood + plan.Loot.Stone + plan.Loot.Food + plan.Loot.Iron);
    }

    [Fact]
    public void Loot_is_zero_when_the_defender_has_nothing_to_take()
    {
        var plan = Attack([new(UnitType.Longship, 1), new(UnitType.Spearman, 5)], loot: new ResourceAmounts(0, 0, 0, 0));

        Assert.Equal(ResourceAmounts.Zero, plan.Loot);
    }

    // ---- Fire Ships

    [Theory]
    [InlineData(9, 3, 0, 3)]
    [InlineData(10, 3, 10, 2)]
    [InlineData(25, 3, 20, 1)]
    [InlineData(45, 3, 30, 0)]
    public void Fire_ships_burn_a_level_per_ten_surviving_ships_clamped_to_the_building(int fireShips, int level, int burned, int levelAfter)
    {
        var dockyard = new PlacedBuilding(SeaHex, BuildingType.Dockyard, level);
        var plan = Attack([new(UnitType.FireShip, fireShips)], buildings: Buildings(dockyard), target: SeaHex);

        Assert.Equal(burned, plan.FireShipsBurned);
        Assert.Equal(fireShips - burned, Count(plan.AttackerSurvivors, UnitType.FireShip));
        Assert.Equal(burned, Count(plan.AttackerLosses, UnitType.FireShip));
        Assert.Equal(burned > 0, plan.FireSiege.Applied);
        var standing = plan.Buildings.Where(b => b.Coord == SeaHex).Select(b => b.Level).DefaultIfEmpty(0).Single();
        Assert.Equal(levelAfter, standing);
    }

    [Fact]
    public void Twenty_five_fire_ships_at_a_dockyard_of_level_3_burn_two_levels_and_five_sail_home()
    {
        var plan = Attack(
            [new(UnitType.FireShip, 25)], buildings: Buildings(new PlacedBuilding(SeaHex, BuildingType.Dockyard, 3)), target: SeaHex);

        Assert.Equal(20, plan.FireShipsBurned);
        Assert.Equal(1, plan.FireSiege.LevelAfter);
        Assert.Equal(5, Count(plan.AttackerSurvivors, UnitType.FireShip));
    }

    [Fact]
    public void A_wall_at_sea_loses_one_level_to_the_fire_and_ten_ships_burn_whatever_the_fleet_brings()
    {
        var palisade = new PlacedBuilding(SeaHex, BuildingType.Palisade, 3);
        var plan = Attack([new(UnitType.FireShip, 25)], buildings: Buildings(palisade), target: SeaHex);

        Assert.Equal(10, plan.FireShipsBurned);
        Assert.Equal(2, plan.Buildings.Single(b => b.Coord == SeaHex).Level);
        Assert.Equal(15, Count(plan.AttackerSurvivors, UnitType.FireShip));
    }

    [Fact]
    public void A_building_on_land_does_not_burn_and_no_fire_ship_is_lost()
    {
        var farm = new PlacedBuilding(LandHex, BuildingType.Farm, 5);
        var plan = Attack([new(UnitType.FireShip, 30)], buildings: Buildings(farm), target: LandHex);

        Assert.Equal(0, plan.FireShipsBurned);
        Assert.False(plan.FireSiege.Applied);
        Assert.Equal(5, plan.Buildings.Single(b => b.Coord == LandHex).Level);
        Assert.Equal(30, Count(plan.AttackerSurvivors, UnitType.FireShip));
    }

    [Fact]
    public void A_target_that_is_gone_burns_nothing()
    {
        var plan = Attack([new(UnitType.FireShip, 30)], target: SeaHex);

        Assert.Equal(0, plan.FireShipsBurned);
        Assert.Equal(30, Count(plan.AttackerSurvivors, UnitType.FireShip));
    }

    [Fact]
    public void Siege_engines_aboard_do_not_fire_at_a_target_the_fire_hits()
    {
        // A wall's sea end loses one level per attack: the fire takes it, the rams aboard cannot reach a hex in the water.
        var seaEnd = new PlacedBuilding(SeaHex, BuildingType.Palisade, 3);
        var plan = Attack(
            [new(UnitType.Longship, 4), new(UnitType.FireShip, 25), new(UnitType.Ram, 2)],
            buildings: Buildings(seaEnd), target: SeaHex);

        Assert.True(plan.FireSiege.Applied);
        Assert.False(plan.LandSiege.Applied);
        Assert.Null(plan.LandFight);
        Assert.Equal(2, plan.Buildings.Single(b => b.Coord == SeaHex).Level);
        Assert.Empty(plan.Drowned);
        Assert.Equal(2, Count(plan.AttackerSurvivors, UnitType.Ram));
    }

    // ---- Defaults: tower bonus in both fights, raid caps in both, attack bonuses by fight

    [Fact]
    public void The_tower_bonus_applies_to_both_fights()
    {
        var plan = Attack(
            [new(UnitType.Longship, 5), new(UnitType.Axeman, 40)],
            home: [new(UnitType.Longship, 1), new(UnitType.Spearman, 10)], defenseBonus: 50);

        Assert.Equal(40 * 1.5, plan.ShipFight!.DefensePower);
        Assert.Equal(350 * 1.5, plan.LandFight!.DefensePower);
    }

    [Fact]
    public void Ship_attack_bonus_applies_in_the_ship_fight_only_and_land_attack_bonus_in_the_land_fight_only()
    {
        UnitStack[] fleet = [new(UnitType.Longship, 5), new(UnitType.Axeman, 10)];
        UnitStack[] home = [new(UnitType.Longship, 1), new(UnitType.Spearman, 1)];

        var shipBonus = Attack(fleet, home, shipBonus: 100);
        Assert.Equal(600, shipBonus.ShipFight!.AttackPower);
        Assert.Equal(400, shipBonus.LandFight!.AttackPower);

        var landBonus = Attack(fleet, home, landBonus: 100);
        Assert.Equal(300, landBonus.ShipFight!.AttackPower);
        Assert.Equal(800, landBonus.LandFight!.AttackPower);
    }

    [Fact]
    public void A_raid_caps_the_losses_in_both_fights()
    {
        // Each side loses at most half: the lost ship fight of a raid leaves survivors, a lost land fight too.
        var shipRaid = Attack([new(UnitType.Karve, 4)], home: [new(UnitType.Longship, 10)], raid: true);
        Assert.Equal(2, Count(shipRaid.ShipFight!.AttackerSurvivors, UnitType.Karve));

        var landRaid = Attack([new(UnitType.Karve, 1), new(UnitType.Spearman, 10)], home: [new(UnitType.Spearman, 100)], raid: true);
        Assert.Equal(5, Count(landRaid.LandFight!.AttackerSurvivors, UnitType.Spearman));
    }

    // ---- Refill (docs/design/troop-movement-range.md section 1b): food off the top, up to the room in the provisions

    [Fact]
    public void A_won_land_fight_refills_the_provisions_from_the_targets_food_before_the_loot()
    {
        // 10 spearmen: food capacity 10 x 24 = 240, carry 10 x 20 = 200. Provisions 100 leave room for 140.
        var plan = Attack([new(UnitType.Spearman, 10)], provisions: 100);

        Assert.Equal(140, plan.Refill);
        // The loot takes its full 200 from what is left, the refill on top of it.
        Assert.Equal(200, plan.Loot.Wood + plan.Loot.Stone + plan.Loot.Food + plan.Loot.Iron);
        Assert.Equal(plan.Loot, plan.LandFight!.LootTaken);
    }

    [Fact]
    public void The_refill_is_capped_by_the_food_the_target_has_and_leaves_the_loot_to_what_is_left()
    {
        var plan = Attack([new(UnitType.Spearman, 10)], provisions: 0, loot: new ResourceAmounts(1000, 0, 100, 0));

        Assert.Equal(100, plan.Refill);
        Assert.Equal(0, plan.Loot.Food);
        Assert.Equal(200, plan.Loot.Wood);
    }

    [Fact]
    public void Full_provisions_leave_no_room_to_refill_and_the_loot_may_take_food()
    {
        var plan = Attack([new(UnitType.Spearman, 10)], provisions: 240, loot: new ResourceAmounts(0, 0, 1000, 0));

        Assert.Equal(0, plan.Refill);
        Assert.Equal(200, plan.Loot.Food);
    }

    [Fact]
    public void A_fleets_refill_counts_the_food_capacity_of_every_survivor_aboard_but_its_loot_only_the_ships_carry()
    {
        // Karve: food 600, carry 200; 10 spearmen: food 240. Provisions 0: room for 840, the loot is the Karve's 200.
        var plan = Attack([new(UnitType.Karve, 1), new(UnitType.Spearman, 10)], provisions: 0);

        Assert.Equal(840, plan.Refill);
        Assert.Equal(200, plan.Loot.Wood + plan.Loot.Stone + plan.Loot.Food + plan.Loot.Iron);
    }

    [Fact]
    public void No_loot_means_no_refill_a_lost_fight_a_dockyard_target_or_a_fleet_without_passengers()
    {
        Assert.Equal(0, Attack([new(UnitType.Spearman, 1)], home: [new(UnitType.Spearman, 100)], provisions: 0).Refill);

        var dockyard = new PlacedBuilding(SeaHex, BuildingType.Dockyard, 3);
        Assert.Equal(
            0, Attack([new(UnitType.Karve, 1), new(UnitType.Spearman, 10)], buildings: Buildings(dockyard), target: SeaHex, provisions: 0).Refill);

        Assert.Equal(0, Attack([new(UnitType.Karve, 5)], provisions: 0).Refill);
    }

    // ---- Siege: only a won Attack does land siege damage; a Raid only plunders (owner decision 2026-11-12)

    public static TheoryData<BuildingType> SiegeTargetTypes => new()
    {
        BuildingType.Farm, BuildingType.Palisade, BuildingType.PalisadeGate, BuildingType.Tower, BuildingType.Bridge, BuildingType.Longhouse,
    };

    private static readonly UnitStack[] SiegeArmy =
        [new(UnitType.Axeman, 30), new(UnitType.Catapult, 20), new(UnitType.Ram, 20)];

    [Theory]
    [MemberData(nameof(SiegeTargetTypes))]
    public void A_won_raid_with_catapults_and_rams_takes_no_levels_off_the_target(BuildingType type)
    {
        var hex = type == BuildingType.Longhouse ? Centre : LandHex;
        var buildings = type == BuildingType.Longhouse ? Buildings() : Buildings(new PlacedBuilding(hex, type, 4));

        var plan = Attack(SiegeArmy, home: [new(UnitType.Spearman, 2)], buildings: buildings, target: hex, raid: true);

        Assert.Equal(BattleWinner.Attacker, plan.Winner);
        Assert.False(plan.LandSiege.Applied);
        Assert.Equal(buildings, plan.Buildings);
    }

    [Theory]
    [MemberData(nameof(SiegeTargetTypes))]
    public void A_won_attack_with_the_same_army_still_damages_the_target(BuildingType type)
    {
        var hex = type == BuildingType.Longhouse ? Centre : LandHex;
        var buildings = type == BuildingType.Longhouse ? Buildings() : Buildings(new PlacedBuilding(hex, type, 4));

        var plan = Attack(SiegeArmy, home: [new(UnitType.Spearman, 2)], buildings: buildings, target: hex, raid: false);

        Assert.True(plan.LandSiege.Applied);
        Assert.NotEqual(buildings, plan.Buildings);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void A_fleet_with_siege_engines_aboard_damages_a_beach_building_only_in_an_attack(bool raid, bool sieges)
    {
        var farm = new PlacedBuilding(LandHex, BuildingType.Farm, 4);
        var buildings = Buildings(farm);

        // 10 Karves carry 100 slots: 10 Axemen (2 each) and 8 Catapults (10 each) fit, so the engines reach the land fight.
        var plan = Attack(
            [new(UnitType.Karve, 10), new(UnitType.Axeman, 10), new(UnitType.Catapult, 8)],
            home: [new(UnitType.Spearman, 2)], buildings: buildings, target: LandHex, raid: raid);

        Assert.Equal(BattleWinner.Attacker, plan.Winner);
        Assert.Equal(8, Count(plan.AttackerSurvivors, UnitType.Catapult));
        Assert.Equal(sieges, plan.LandSiege.Applied);
        Assert.Equal(sieges, !buildings.SequenceEqual(plan.Buildings));
    }
}
