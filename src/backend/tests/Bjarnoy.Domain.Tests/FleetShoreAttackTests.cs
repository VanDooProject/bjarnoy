using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Issue #450, target half: a fleet Attack or Raid is sent at one building on the target's shore, sails to that
/// building's hex, fights there, and a won fight damages only that building. The target's Longhouse may be inland.
/// </summary>
public class FleetShoreAttackTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Home = new(0, 0);
    private static readonly HexCoord Dock = new(3, 0);
    private static readonly HexCoord TargetCentre = new(11, 0);
    private static readonly HexCoord ShoreHex = new(9, 0);
    private static readonly HexCoord CoastalWaterHex = new(8, 0);
    private static readonly HexCoord InlandHex = new(11, 1);
    private const int ClaimRadius = 3;

    // Sea at 3 <= q <= 8, grass either side. The target's centre (11,0) is three hexes from the water.
    private static Terrain Strait(HexCoord c) => c.Q is >= 3 and <= 8 ? Terrain.Sea : Terrain.Grass;

    private static Settlement Found(HexCoord centre, IReadOnlyList<UnitStack> garrison, params PlacedBuilding[] extra)
    {
        const int longhouseLevel = 10;
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = centre,
            Buildings = [new PlacedBuilding(centre, BuildingType.Longhouse, longhouseLevel), .. extra],
            Resources = ResourcePool.Create(new ResourceAmounts(1_000_000, 1_000_000, 1_000_000, 1_000_000), production, capacity, T0),
        }.WithGarrison(garrison);
    }

    private static Settlement Attacker() =>
        Found(Home, [new UnitStack(UnitType.Karve, 5)], new PlacedBuilding(Dock, BuildingType.Dockyard, 1));

    private static DispatchDecision Send(ArmyMission mission, HexCoord? targetBuilding, Settlement? attacker = null) =>
        TestArmy.PlanDispatch(
            attacker ?? Attacker(), [new UnitStack(UnitType.Karve, 5)], 100, [], TargetCentre, T0,
            Guid.CreateVersion7(), Strait, mission, Guid.CreateVersion7(),
            targetBuildingCoord: targetBuilding, targetClaimDiscs: [(TargetCentre, ClaimRadius)]);

    private static Bjarnoy.Domain.Movement.Movement MovementOf(Army army) => ((ArmyLocation.InTransit)army.Location).Movement;

    [Theory]
    [InlineData(ArmyMission.Attack)]
    [InlineData(ArmyMission.Raid)]
    public void A_fleet_is_sent_at_a_building_on_the_shoreline_of_an_inland_centred_target(ArmyMission mission)
    {
        var decision = Send(mission, ShoreHex);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var movement = MovementOf(decision.Army!);
        Assert.Equal(Dock, movement.Path[0]);
        Assert.Equal(ShoreHex, movement.Path[^1]);
        Assert.Equal(ShoreHex, movement.ReturnPath[0]);
        Assert.Equal(Dock, movement.ReturnPath[^1]);
        Assert.Equal(ShoreHex, decision.Army!.TargetBuildingCoord);
    }

    [Theory]
    [InlineData(ArmyMission.Attack)]
    [InlineData(ArmyMission.Raid)]
    public void A_fleet_without_a_target_building_is_rejected(ArmyMission mission)
    {
        Assert.Equal(DispatchRejection.FleetTargetBuildingRequired, Send(mission, null).Rejection);
    }

    [Fact]
    public void A_target_building_on_an_inland_hex_is_rejected()
    {
        Assert.Equal(DispatchRejection.FleetTargetBuildingNotOnShore, Send(ArmyMission.Attack, InlandHex).Rejection);
    }

    [Fact]
    public void The_inland_longhouse_itself_is_not_a_valid_fleet_target()
    {
        Assert.Equal(DispatchRejection.FleetTargetBuildingNotOnShore, Send(ArmyMission.Attack, TargetCentre).Rejection);
    }

    [Fact]
    public void A_target_building_outside_the_targets_claim_is_rejected()
    {
        // (7,0) is open sea four hexes from the centre, one past the claim radius.
        Assert.Equal(DispatchRejection.FleetTargetBuildingNotOnShore, Send(ArmyMission.Attack, new HexCoord(7, 0)).Rejection);
    }

    [Fact]
    public void A_building_on_coastal_water_inside_the_claim_is_a_valid_target()
    {
        var decision = Send(ArmyMission.Attack, CoastalWaterHex);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(CoastalWaterHex, MovementOf(decision.Army!).Path[^1]);
    }

    [Fact]
    public void A_land_armys_attack_still_goes_to_the_centre()
    {
        UnitStack[] army = [new UnitStack(UnitType.Axeman, 20), new UnitStack(UnitType.Provisioner, 20)];
        var attacker = Found(Home, army);

        var decision = TestArmy.PlanDispatch(
            attacker, army, 400, [], TargetCentre, T0,
            Guid.CreateVersion7(), _ => Terrain.Grass, ArmyMission.Attack, Guid.CreateVersion7(),
            targetClaimDiscs: [(TargetCentre, ClaimRadius)]);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(TargetCentre, MovementOf(decision.Army!).Path[^1]);
    }

    private static ArmyArrivalResult Arrive(Settlement defender, ArmyMission mission = ArmyMission.Attack, HexCoord? target = null)
    {
        var army = Send(mission, target ?? ShoreHex).Army!;
        return Army.SettleArrival(army, defender, 1.0, MovementOf(army).ArrivesAt, seed: 1, terrainAt: Strait);
    }

    [Theory]
    [InlineData(ArmyMission.Attack)]
    [InlineData(ArmyMission.Raid)]
    public void A_won_fleet_fight_lowers_only_the_named_building_by_the_ships_siege_power(ArmyMission mission)
    {
        var farm = new PlacedBuilding(ShoreHex, BuildingType.Farm, 9);
        var other = new PlacedBuilding(new HexCoord(10, 1), BuildingType.Farm, 9);
        var defender = Found(TargetCentre, [], farm, other);

        var arrival = Arrive(defender, mission);

        Assert.Equal(BattleWinner.Attacker, arrival.Battle!.Winner);
        var siegePower = arrival.Battle.AttackerSurvivors.Sum(s => (long)UnitCatalogue.Get(s.Type).SiegePower * s.Count);
        Assert.True(siegePower > 0);
        var expectedLevel = 9 - SiegeResolver.LevelsDestroyed(siegePower);
        Assert.True(arrival.Siege!.Applied);
        Assert.Equal(ShoreHex, arrival.Siege.TargetCoord);
        Assert.Equal(expectedLevel, arrival.Siege.LevelAfter);
        var buildings = arrival.DefenderSettlement.Buildings;
        Assert.Equal(expectedLevel, buildings.Single(b => b.Coord == ShoreHex).Level);
        Assert.Equal(9, buildings.Single(b => b.Coord == other.Coord).Level);
        Assert.Equal(10, buildings.Single(b => b.Coord == TargetCentre).Level);
    }

    [Fact]
    public void A_lost_fleet_fight_damages_nothing()
    {
        var dockyard = new PlacedBuilding(ShoreHex, BuildingType.Dockyard, 9);
        var defender = Found(TargetCentre, [new UnitStack(UnitType.Longship, 100)], dockyard);

        var arrival = Arrive(defender);

        Assert.Equal(BattleWinner.Defender, arrival.Battle!.Winner);
        Assert.False(arrival.Siege!.Applied);
        Assert.Equal(9, arrival.DefenderSettlement.Buildings.Single(b => b.Coord == ShoreHex).Level);
    }

    [Fact]
    public void A_fleet_whose_named_building_is_gone_by_arrival_hits_nothing_instead_of_a_random_building()
    {
        var defender = Found(TargetCentre, [], new PlacedBuilding(new HexCoord(10, 1), BuildingType.Farm, 9));

        var arrival = Arrive(defender);

        Assert.Equal(BattleWinner.Attacker, arrival.Battle!.Winner);
        Assert.False(arrival.Siege!.Applied);
        Assert.All(arrival.DefenderSettlement.Buildings, b => Assert.True(b.Level > 0));
        Assert.Equal(2, arrival.DefenderSettlement.Buildings.Count);
    }

    private static Army SendLoaded(UnitStack[] requested, ArmyMission mission = ArmyMission.Attack)
    {
        // The troops board where the ships stand: a fleet is sent from one spot.
        var attacker = Found(Home, [], new PlacedBuilding(Dock, BuildingType.Dockyard, 1)).WithGarrisonAt(Dock, requested);
        var decision = TestArmy.PlanDispatch(
            attacker, requested, Math.Min(150, requested.Sum(u => UnitCatalogue.Get(u.Type).FoodCarryCapacity * u.Count)), [], TargetCentre, T0,
            Guid.CreateVersion7(), Strait, mission, Guid.CreateVersion7(),
            targetBuildingCoord: ShoreHex, targetClaimDiscs: [(TargetCentre, ClaimRadius)], fromSpot: Dock);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        return decision.Army!;
    }

    private static ArmyArrivalResult ArriveWith(
        Army army, Settlement defender, IReadOnlyList<UnitStack>? guests = null) =>
        Army.SettleArrival(army, defender, 1.0, MovementOf(army).ArrivesAt, seed: 1, guests, terrainAt: Strait);

    private static int Count(IEnumerable<UnitStack> stacks, UnitType type) => stacks.Where(s => s.Type == type).Sum(s => s.Count);

    [Fact]
    public void Without_ships_at_home_there_is_no_fight_the_land_garrison_stays_out_and_the_siege_applies()
    {
        var farm = new PlacedBuilding(ShoreHex, BuildingType.Farm, 9);
        var defender = Found(TargetCentre, [new UnitStack(UnitType.Spearman, 1000), new UnitStack(UnitType.Axeman, 1000)], farm);

        var arrival = Arrive(defender);

        Assert.Equal(BattleWinner.Attacker, arrival.Battle!.Winner);
        Assert.Empty(arrival.Battle.AttackerLosses);
        Assert.Empty(arrival.Battle.DefenderLosses);
        Assert.Equal(1000, Count(arrival.DefenderSettlement.Garrison, UnitType.Spearman));
        Assert.Equal(1000, Count(arrival.DefenderSettlement.Garrison, UnitType.Axeman));
        Assert.True(arrival.Siege!.Applied);
        Assert.Equal(ShoreHex, arrival.Siege.TargetCoord);
        Assert.Equal(5, Count(arrival.Army!.Stacks, UnitType.Karve));
    }

    [Fact]
    public void Only_the_defenders_ships_fight_the_fleet_and_the_land_units_at_home_take_no_losses()
    {
        var defender = Found(TargetCentre, [new UnitStack(UnitType.Spearman, 1000), new UnitStack(UnitType.Longship, 1)],
            new PlacedBuilding(ShoreHex, BuildingType.Dockyard, 9));

        var arrival = Arrive(defender);

        // 5 Karves attack 25 against one Longship's defence of 40: the Longship holds, the spearmen did not add to it.
        Assert.Equal(40, arrival.Battle!.DefensePower);
        Assert.Equal(BattleWinner.Defender, arrival.Battle.Winner);
        Assert.DoesNotContain(arrival.Battle.DefenderLosses, s => s.Type == UnitType.Spearman);
        Assert.Equal(1000, Count(arrival.DefenderSettlement.Garrison, UnitType.Spearman));
    }

    // A settlement whose centre stands on the shore (7,0)/(9,0) strait edge: its centre is the fleet anchor and a valid target.
    private static readonly HexCoord ShoreCentre = new(9, 0);

    private static Army SendAtCentre(HexCoord centre, UnitStack[] requested)
    {
        var attacker = Found(Home, requested, new PlacedBuilding(Dock, BuildingType.Dockyard, 1));
        var decision = TestArmy.PlanDispatch(
            attacker, requested, 100, [], centre, T0, Guid.CreateVersion7(), Strait, ArmyMission.Attack, Guid.CreateVersion7(),
            targetBuildingCoord: centre, targetClaimDiscs: [(centre, ClaimRadius)]);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        return decision.Army!;
    }

    [Fact]
    public void A_fleet_at_the_dockyard_fights_the_home_ships()
    {
        var defender = Found(TargetCentre, [new UnitStack(UnitType.Longship, 1)], new PlacedBuilding(ShoreHex, BuildingType.Dockyard, 3));

        var arrival = Arrive(defender, target: ShoreHex);

        Assert.Equal(40, arrival.Battle!.DefensePower);
        Assert.Equal(BattleWinner.Defender, arrival.Battle.Winner);
    }

    [Fact]
    public void A_fleet_at_another_shore_building_does_not_fight_the_ships_at_the_dockyard_and_damages_the_building()
    {
        var hut = new PlacedBuilding(CoastalWaterHex, BuildingType.FishingHut, 5);
        var defender = Found(TargetCentre, [new UnitStack(UnitType.Longship, 100)], new PlacedBuilding(ShoreHex, BuildingType.Dockyard, 3), hut);

        var arrival = Arrive(defender, target: CoastalWaterHex);

        Assert.Equal(BattleWinner.Attacker, arrival.Battle!.Winner);
        Assert.Equal(0, arrival.Battle.DefensePower);
        Assert.Empty(arrival.Battle.AttackerLosses);
        Assert.Empty(arrival.Battle.DefenderLosses);
        Assert.Equal(100, Count(arrival.DefenderSettlement.Garrison, UnitType.Longship));
        Assert.True(arrival.Siege!.Applied);
        Assert.Equal(CoastalWaterHex, arrival.Siege.TargetCoord);
        Assert.True(arrival.Siege.LevelAfter < 5);
        Assert.Equal(3, arrival.DefenderSettlement.Buildings.Single(b => b.Coord == ShoreHex).Level);
    }

    [Fact]
    public void A_fleet_at_the_longhouse_of_a_shoreline_centred_settlement_fights_the_home_ships()
    {
        var defender = Found(ShoreCentre, [new UnitStack(UnitType.Longship, 1)]);

        var arrival = ArriveWith(SendAtCentre(ShoreCentre, [new UnitStack(UnitType.Karve, 5)]), defender);

        Assert.Equal(40, arrival.Battle!.DefensePower);
    }

    [Fact]
    public void Guest_ships_defend_with_the_home_ships_when_the_target_is_the_centre_and_guest_land_units_are_not_charged_losses()
    {
        var defender = Found(ShoreCentre, [new UnitStack(UnitType.Longship, 1)]);
        UnitStack[] guests = [new(UnitType.Longship, 1), new(UnitType.Spearman, 50)];

        var arrival = ArriveWith(SendAtCentre(ShoreCentre, [new UnitStack(UnitType.Karve, 5)]), defender, guests);

        Assert.Equal(80, arrival.Battle!.DefensePower);
        Assert.DoesNotContain(arrival.GuestLosses, s => s.Type == UnitType.Spearman);
    }

    [Fact]
    public void Guest_ships_stay_out_of_a_fight_at_the_dockyard_and_take_no_losses()
    {
        var defender = Found(TargetCentre, [new UnitStack(UnitType.Longship, 1)], new PlacedBuilding(ShoreHex, BuildingType.Dockyard, 3));
        UnitStack[] guests = [new(UnitType.Longship, 100)];

        var arrival = ArriveWith(SendLoaded([new UnitStack(UnitType.Karve, 5)]), defender, guests);

        Assert.Equal(40, arrival.Battle!.DefensePower);
        Assert.Empty(arrival.GuestLosses);
    }

    [Fact]
    public void Neither_home_nor_guest_ships_fight_a_fleet_at_a_shore_building_away_from_their_hexes()
    {
        // The Dockyard is the anchor (inland centre), the guests stand at the centre: a fleet at a third shore building
        // meets neither home nor guest ships.
        var defender = Found(TargetCentre, [new UnitStack(UnitType.Longship, 50)], new PlacedBuilding(CoastalWaterHex, BuildingType.Dockyard, 3),
            new PlacedBuilding(ShoreHex, BuildingType.Farm, 9));
        UnitStack[] guests = [new(UnitType.Longship, 50)];

        var arrival = ArriveWith(SendLoaded([new UnitStack(UnitType.Karve, 5)]), defender, guests);

        Assert.Equal(0, arrival.Battle!.DefensePower);
        Assert.Empty(arrival.GuestLosses);
        Assert.True(arrival.Siege!.Applied);
    }

    [Fact]
    public void Passengers_sail_through_a_won_fight_and_come_home_with_the_ships()
    {
        var army = SendLoaded([new UnitStack(UnitType.Karve, 5), new UnitStack(UnitType.Spearman, 50)]);
        var defender = Found(TargetCentre, [new UnitStack(UnitType.Spearman, 1000)], new PlacedBuilding(ShoreHex, BuildingType.Farm, 9));

        var arrival = ArriveWith(army, defender);

        Assert.Equal(BattleWinner.Attacker, arrival.Battle!.Winner);
        Assert.Equal(5, Count(arrival.Army!.Stacks, UnitType.Karve));
        Assert.Equal(50, Count(arrival.Army.Stacks, UnitType.Spearman));
        Assert.Equal(25, arrival.Battle.AttackPower);
    }

    [Fact]
    public void Siege_engines_aboard_do_not_fire_only_the_surviving_ships_do()
    {
        // 1 Longship (siege power 20) carries 2 rams (siege power 40 each); only the ship's 20 count.
        var army = SendLoaded([new UnitStack(UnitType.Longship, 1), new UnitStack(UnitType.Ram, 2)]);
        var defender = Found(TargetCentre, [], new PlacedBuilding(ShoreHex, BuildingType.Farm, 9));

        var arrival = ArriveWith(army, defender);

        Assert.True(arrival.Siege!.Applied);
        Assert.Equal(9 - SiegeResolver.LevelsDestroyed(20), arrival.Siege.LevelAfter);
        Assert.Equal(2, Count(arrival.Army!.Stacks, UnitType.Ram));
    }

    [Fact]
    public void Passengers_drown_beyond_the_slots_of_the_ships_that_survive_a_won_fight()
    {
        var army = SendLoaded([new UnitStack(UnitType.Longship, 5), new UnitStack(UnitType.Spearman, 90)]);
        var defender = Found(TargetCentre, [new UnitStack(UnitType.Longship, 6)], new PlacedBuilding(ShoreHex, BuildingType.Dockyard, 9));

        var arrival = ArriveWith(army, defender);

        Assert.Equal(BattleWinner.Attacker, arrival.Battle!.Winner);
        var ships = Count(arrival.Army!.Stacks, UnitType.Longship);
        Assert.InRange(ships, 1, 4);
        var kept = Count(arrival.Army.Stacks, UnitType.Spearman);
        Assert.Equal(Math.Min(90, ships * 20), kept);
        Assert.Equal(90 - kept, Count(arrival.Battle.AttackerLosses, UnitType.Spearman));
        Assert.Equal(kept, Count(arrival.Battle.AttackerSurvivors, UnitType.Spearman));
    }

    [Fact]
    public void Passengers_drown_with_a_fleet_that_loses_all_its_ships()
    {
        var army = SendLoaded([new UnitStack(UnitType.Karve, 5), new UnitStack(UnitType.Spearman, 50)]);
        var defender = Found(TargetCentre, [new UnitStack(UnitType.Longship, 100)], new PlacedBuilding(ShoreHex, BuildingType.Dockyard, 9));

        var arrival = ArriveWith(army, defender);

        Assert.Equal(BattleWinner.Defender, arrival.Battle!.Winner);
        Assert.Null(arrival.Army);
        Assert.Equal(50, Count(arrival.Battle.AttackerLosses, UnitType.Spearman));
        Assert.Empty(arrival.Battle.AttackerSurvivors);
    }

    [Fact]
    public void A_land_armys_attack_still_fights_the_whole_garrison()
    {
        UnitStack[] force = [new UnitStack(UnitType.Axeman, 20), new UnitStack(UnitType.Provisioner, 20)];
        var attacker = Found(Home, force);
        var decision = TestArmy.PlanDispatch(
            attacker, force, 400, [], TargetCentre, T0,
            Guid.CreateVersion7(), _ => Terrain.Grass, ArmyMission.Attack, Guid.CreateVersion7(),
            targetClaimDiscs: [(TargetCentre, ClaimRadius)]);
        var defender = Found(TargetCentre, [new UnitStack(UnitType.Spearman, 10), new UnitStack(UnitType.Longship, 1)]);

        var arrival = Army.SettleArrival(decision.Army!, defender, 1.0, MovementOf(decision.Army!).ArrivesAt, seed: 1);

        Assert.Equal((10 * 35) + 40, arrival.Battle!.DefensePower);
    }
}
