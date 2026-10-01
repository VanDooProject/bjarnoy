using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Hunt mission dispatch and arrival (docs/design/wildlife-camps.md, "Hunting a camp").</summary>
public class ArmyHuntTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Home = new(0, 0);
    private static readonly HexCoord CampHex = new(4, 0);

    private static Func<HexCoord, Terrain> AllGrass() => _ => Terrain.Grass;

    private static Settlement Found(IReadOnlyList<UnitStack>? garrison = null, double food = 1_000_000)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 5)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Home,
            Buildings = [new PlacedBuilding(Home, BuildingType.Longhouse, 5)],
            Garrison = garrison ?? [new UnitStack(UnitType.Axeman, 1000), new UnitStack(UnitType.Karve, 5)],
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 1_000_000, Stone: 1_000_000, Food: food, Iron: 1_000_000),
                production, capacity, T0),
        };
    }

    private static DispatchDecision DispatchHunt(
        Settlement settlement,
        HexCoord? targetCamp,
        IReadOnlyList<UnitStack>? requested = null,
        double provisions = 100,
        HexCoord? destination = null,
        Func<HexCoord, Terrain>? terrain = null) => Army.PlanDispatch(
            settlement, requested ?? [new UnitStack(UnitType.Axeman, 10)], provisions, [], destination ?? CampHex, T0,
            Guid.CreateVersion7(), terrain ?? AllGrass(), ArmyMission.Hunt, targetCampCoord: targetCamp);

    private static Army Hunter()
    {
        var decision = DispatchHunt(Found(), CampHex);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        return decision.Army!;
    }

    private static CampFightPlan Plan(
        CampFightWinner winner, IReadOnlyList<UnitStack> survivors, ResourceAmounts loot) =>
        new([], survivors, CampGarrison.Empty, CampGarrison.Empty, winner, 100, 50, loot);

    [Fact]
    public void Hunt_dispatch_records_the_mission_and_the_camp_without_a_target_settlement()
    {
        var decision = DispatchHunt(Found(), CampHex);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(ArmyMission.Hunt, decision.Army!.Mission);
        Assert.Equal(CampHex, decision.Army.TargetCampCoord);
        Assert.Null(decision.Army.TargetSettlementId);
    }

    [Fact]
    public void Hunt_dispatch_without_a_camp_at_the_destination_is_rejected()
    {
        var decision = DispatchHunt(Found(), targetCamp: null);

        Assert.Equal(DispatchRejection.NoCampAtDestination, decision.Rejection);
    }

    [Fact]
    public void Hunt_dispatch_with_ships_is_rejected()
    {
        var decision = DispatchHunt(Found(), CampHex, [new UnitStack(UnitType.Karve, 2)]);

        Assert.Equal(DispatchRejection.HuntRequiresLandUnits, decision.Rejection);
    }

    [Fact]
    public void Hunt_dispatch_mixing_ships_and_land_units_is_still_the_mixed_rejection()
    {
        var decision = DispatchHunt(Found(), CampHex, [new UnitStack(UnitType.Axeman, 2), new UnitStack(UnitType.Karve, 2)]);

        Assert.Equal(DispatchRejection.MixedFleetAndLandUnits, decision.Rejection);
    }

    [Fact]
    public void Hunt_dispatch_needs_the_round_trip_food()
    {
        // 10 axemen burn 10 food/hour; 4 hexes out and back at speed 4 is 2 hours.
        var decision = DispatchHunt(Found(), CampHex, provisions: 5);

        Assert.Equal(DispatchRejection.InsufficientProvisionsForRoundTrip, decision.Rejection);
    }

    [Fact]
    public void Only_a_hunt_keeps_a_target_camp()
    {
        var decision = Army.PlanDispatch(
            Found(), [new UnitStack(UnitType.Axeman, 10)], 100, [], CampHex, T0, Guid.CreateVersion7(), AllGrass(),
            ArmyMission.Move, targetCampCoord: CampHex);

        Assert.True(decision.Accepted);
        Assert.Null(decision.Army!.TargetCampCoord);
    }

    [Fact]
    public void A_walkable_camp_hex_is_the_route_destination()
    {
        Assert.Equal(CampHex, Army.HuntRouteDestination(CampHex, Home, AllGrass()));
    }

    [Fact]
    public void An_unwalkable_camp_hex_routes_to_the_walkable_neighbour_nearest_the_start()
    {
        // Every hex but the camp's own and the far side of it is grass: the near neighbour (3,0) wins.
        Terrain Terr(HexCoord c) => c == CampHex ? Terrain.Lake : Terrain.Grass;

        var destination = Army.HuntRouteDestination(CampHex, Home, Terr);

        Assert.Equal(3, destination.DistanceTo(Home));
        Assert.Equal(1, destination.DistanceTo(CampHex));

        var decision = DispatchHunt(Found(), CampHex, destination: destination, terrain: Terr);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(CampHex, decision.Army!.TargetCampCoord);
        Assert.Equal(destination, ((ArmyLocation.InTransit)decision.Army.Location).Movement.Path[^1]);
    }

    [Fact]
    public void A_camp_with_no_walkable_hex_around_it_keeps_the_camp_hex_so_dispatch_refuses_it()
    {
        Terrain Terr(HexCoord c) => c.DistanceTo(CampHex) <= 1 ? Terrain.Lake : Terrain.Grass;

        var destination = Army.HuntRouteDestination(CampHex, Home, Terr);

        Assert.Equal(CampHex, destination);
        Assert.Equal(
            DispatchRejection.DestinationNotLand,
            DispatchHunt(Found(), CampHex, destination: destination, terrain: Terr).Rejection);
    }

    [Fact]
    public void Survivors_walk_home_with_the_loot_on_the_return_path_retreat_immune()
    {
        var army = Hunter();
        var outbound = ((ArmyLocation.InTransit)army.Location).Movement;
        var battleInstant = outbound.ArrivesAt;
        var loot = new ResourceAmounts(Wood: 0, Stone: 0, Food: 120, Iron: 30);
        var plan = Plan(CampFightWinner.Army, [new UnitStack(UnitType.Axeman, 9)], loot);

        var returning = army.SettleHuntArrival(plan, battleInstant);

        Assert.NotNull(returning);
        Assert.Equal(9, returning!.Stacks.Single().Count);
        Assert.Equal(loot, returning.Loot);
        Assert.Equal(ArmyMission.Hunt, returning.Mission);

        var leg = ((ArmyLocation.InTransit)returning.Location).Movement;
        Assert.True(leg.IsReturning);
        Assert.True(leg.RetreatImmune);
        Assert.Equal(battleInstant, leg.DepartedAt);
        Assert.Equal(outbound.ReturnPath, leg.Path);
        Assert.Equal(outbound.ReturnCumulativeHours, leg.CumulativeHours);
        Assert.Equal(Home, leg.Path[^1]);

        // The food burned on the way out is already gone: 10 axemen for the outbound hours.
        var outboundHours = (battleInstant - outbound.DepartedAt).TotalHours;
        Assert.Equal(army.Provisions - (army.TotalUpkeepPerHour * outboundHours), returning.Provisions, 6);
    }

    [Fact]
    public void A_wiped_out_army_is_gone()
    {
        var army = Hunter();
        var battleInstant = ((ArmyLocation.InTransit)army.Location).Movement.ArrivesAt;

        var returning = army.SettleHuntArrival(Plan(CampFightWinner.Camp, [], ResourceAmounts.Zero), battleInstant);

        Assert.Null(returning);
    }

    [Fact]
    public void Settling_a_hunt_that_is_not_on_its_outbound_leg_is_refused()
    {
        var army = Hunter();
        var battleInstant = ((ArmyLocation.InTransit)army.Location).Movement.ArrivesAt;
        var returning = army.SettleHuntArrival(Plan(CampFightWinner.Army, [new UnitStack(UnitType.Axeman, 10)], ResourceAmounts.Zero), battleInstant)!;

        Assert.Throws<InvalidOperationException>(() =>
            returning.SettleHuntArrival(Plan(CampFightWinner.Army, [new UnitStack(UnitType.Axeman, 10)], ResourceAmounts.Zero), battleInstant));
    }

    [Fact]
    public void A_real_hunt_end_to_end_clears_a_weak_camp_and_carries_its_loot_home()
    {
        var camp = new Camp(CampHex, CampFamilies.Harewarren, 1, TileOrientation.E);
        var state = CampState.Pristine(camp, T0);
        var army = Hunter();
        var arrivesAt = ((ArmyLocation.InTransit)army.Location).Movement.ArrivesAt;

        var garrison = state.GarrisonAt(camp, arrivesAt, insideRealm: false);
        var plan = CampBattleResolver.Hunt(army.Stacks, garrison, camp, state.EffectiveLevel(camp), seed: 3, 0, state.Leftover);
        var returning = army.SettleHuntArrival(plan, arrivesAt);
        var after = state.AfterHunt(camp, arrivesAt, plan);

        Assert.Equal(CampFightWinner.Army, plan.Winner);
        Assert.NotNull(returning);
        Assert.False(returning!.Loot.IsZero);
        Assert.True(after.IsEmptyAt(camp, arrivesAt, insideRealm: true));
        Assert.Equal(1, after.Clears);
    }
}
