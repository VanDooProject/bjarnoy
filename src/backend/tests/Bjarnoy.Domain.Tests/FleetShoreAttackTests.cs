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
            Garrison = garrison,
            Resources = ResourcePool.Create(new ResourceAmounts(1_000_000, 1_000_000, 1_000_000, 1_000_000), production, capacity, T0),
        };
    }

    private static Settlement Attacker() =>
        Found(Home, [new UnitStack(UnitType.Karve, 5)], new PlacedBuilding(Dock, BuildingType.Dockyard, 1));

    private static DispatchDecision Send(ArmyMission mission, HexCoord? targetBuilding, Settlement? attacker = null) =>
        Army.PlanDispatch(
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

        var decision = Army.PlanDispatch(
            attacker, army, 400, [], TargetCentre, T0,
            Guid.CreateVersion7(), _ => Terrain.Grass, ArmyMission.Attack, Guid.CreateVersion7(),
            targetClaimDiscs: [(TargetCentre, ClaimRadius)]);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(TargetCentre, MovementOf(decision.Army!).Path[^1]);
    }

    private static ArmyArrivalResult Arrive(Settlement defender, ArmyMission mission = ArmyMission.Attack, HexCoord? target = null)
    {
        var army = Send(mission, target ?? ShoreHex).Army!;
        return Army.SettleArrival(army, defender, 1.0, MovementOf(army).ArrivesAt, seed: 1);
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
        var farm = new PlacedBuilding(ShoreHex, BuildingType.Farm, 9);
        var defender = Found(TargetCentre, [new UnitStack(UnitType.Spearman, 1000)], farm);

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
}
