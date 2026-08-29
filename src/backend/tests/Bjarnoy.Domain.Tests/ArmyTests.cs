using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class ArmyTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Home = new(0, 0);

    private static Func<HexCoord, Terrain> AllGrass() => _ => Terrain.Grass;

    private static Settlement Found(
        IReadOnlyList<UnitStack>? garrison = null, double food = 1_000_000, int longhouseLevel = 5)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Home,
            Buildings = [new PlacedBuilding(Home, BuildingType.Longhouse, longhouseLevel)],
            Garrison = garrison ?? [new UnitStack(UnitType.Spearman, 10)],
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 1_000_000, Stone: 1_000_000, Food: food, Iron: 1_000_000),
                production, capacity, T0),
        };
    }

    private static DispatchDecision Dispatch(
        Settlement settlement,
        HexCoord destination,
        double provisions,
        IReadOnlyList<HexCoord>? waypoints = null,
        IReadOnlyList<UnitStack>? requested = null,
        Func<HexCoord, Terrain>? terrainAt = null)
    {
        return Army.PlanDispatch(
            settlement,
            requested ?? [new UnitStack(UnitType.Spearman, 5)],
            provisions,
            waypoints ?? [],
            destination,
            T0,
            Guid.CreateVersion7(),
            terrainAt ?? AllGrass());
    }

    [Fact]
    public void Dispatch_is_rejected_when_no_units_are_requested()
    {
        var settlement = Found();

        var decision = Dispatch(settlement, new HexCoord(5, 0), provisions: 100, requested: []);

        Assert.Equal(DispatchRejection.NoUnitsRequested, decision.Rejection);
    }

    [Fact]
    public void Dispatch_is_rejected_when_the_garrison_does_not_hold_enough_units()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 2)]);

        var decision = Dispatch(settlement, new HexCoord(5, 0), provisions: 100,
            requested: [new UnitStack(UnitType.Spearman, 5)]);

        Assert.Equal(DispatchRejection.InsufficientGarrison, decision.Rejection);
    }

    [Fact]
    public void Dispatch_is_rejected_when_the_destination_is_not_land()
    {
        var settlement = Found();
        Terrain TerrainAt(HexCoord c) => c == new HexCoord(5, 0) ? Terrain.Sea : Terrain.Grass;

        var decision = Dispatch(settlement, new HexCoord(5, 0), provisions: 40, terrainAt: TerrainAt);

        Assert.Equal(DispatchRejection.DestinationNotLand, decision.Rejection);
    }

    [Fact]
    public void Dispatch_is_rejected_when_the_destination_is_unreachable()
    {
        var settlement = Found();
        var seaWall = Enumerable.Range(-10, 21).Select(r => new HexCoord(2, r)).ToHashSet();
        Terrain TerrainAt(HexCoord c) => seaWall.Contains(c) ? Terrain.Sea : Terrain.Grass;

        var decision = Dispatch(settlement, new HexCoord(5, 0), provisions: 40, terrainAt: TerrainAt);

        Assert.Equal(DispatchRejection.UnreachableLeg, decision.Rejection);
    }

    [Fact]
    public void Dispatch_is_rejected_when_provisions_do_not_cover_the_round_trip()
    {
        var settlement = Found();

        // Destination is 10 hexes away; Spearman speed is 4/h and upkeep 1/h,
        // so the round trip costs (10/4 + 10/4) * 1 = 5 food for 5 spearmen
        // (upkeep is per-unit) — load far less than that.
        var decision = Dispatch(settlement, new HexCoord(10, 0), provisions: 0.1);

        Assert.Equal(DispatchRejection.InsufficientProvisionsForRoundTrip, decision.Rejection);
    }

    [Fact]
    public void Dispatch_charges_the_settlement_and_produces_an_army_in_transit()
    {
        var settlement = Found();
        var destination = new HexCoord(4, 0);

        var decision = Dispatch(settlement, destination, provisions: 40);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(5, decision.Settlement!.Garrison.Single(s => s.Type == UnitType.Spearman).Count);
        Assert.Equal(
            settlement.Resources.At(T0).Food - 40, decision.Settlement.Resources.At(T0).Food, 6);

        var army = decision.Army!;
        Assert.IsType<ArmyLocation.InTransit>(army.Location);
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;
        Assert.Equal(Home, movement.Path[0]);
        Assert.Equal(destination, movement.Path[^1]);
        Assert.False(movement.IsReturning);
    }

    [Fact]
    public void Waypoints_are_visited_in_order_in_the_concatenated_path()
    {
        var settlement = Found();
        var waypoint = new HexCoord(3, 0);
        var destination = new HexCoord(3, 3);

        var decision = Dispatch(settlement, destination, provisions: 40, waypoints: [waypoint]);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var path = ((ArmyLocation.InTransit)decision.Army!.Location).Movement.Path;

        Assert.Contains(waypoint, path);
        Assert.True(path.ToList().IndexOf(waypoint) < path.ToList().IndexOf(destination));
        Assert.Equal(path.Count, path.Distinct().Count()); // no duplicated joint hex
    }

    [Fact]
    public void Total_speed_is_the_slowest_units_speed()
    {
        var settlement = Found(garrison:
        [
            new UnitStack(UnitType.Spearman, 5), // speed 4
            new UnitStack(UnitType.Catapult, 1), // speed 1.5
        ]);

        var decision = Dispatch(settlement, new HexCoord(4, 0), provisions: 45,
            requested: [new UnitStack(UnitType.Spearman, 5), new UnitStack(UnitType.Catapult, 1)]);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(UnitCatalogue.Get(UnitType.Catapult).Speed, decision.Army!.TotalSpeed);
    }

    [Fact]
    public void PositionAt_reports_start_hex_before_departure_and_destination_after_arrival()
    {
        var settlement = Found();
        var destination = new HexCoord(4, 0);
        var decision = Dispatch(settlement, destination, provisions: 40);
        Assert.True(decision.Accepted);

        var movement = ((ArmyLocation.InTransit)decision.Army!.Location).Movement;

        Assert.Equal(Home, movement.PositionAt(T0.AddSeconds(-1)));
        Assert.Equal(destination, movement.PositionAt(movement.ArrivesAt));
        Assert.Equal(destination, movement.PositionAt(movement.ArrivesAt.AddYears(1)));
    }

    [Fact]
    public void PositionAt_reports_an_intermediate_hex_partway_along_the_route()
    {
        var settlement = Found();
        var destination = new HexCoord(4, 0);
        var decision = Dispatch(settlement, destination, provisions: 40);
        var movement = ((ArmyLocation.InTransit)decision.Army!.Location).Movement;

        var midway = movement.DepartedAt + TimeSpan.FromHours(movement.CumulativeHours[^1] / 2.0);
        var position = movement.PositionAt(midway);

        Assert.NotEqual(Home, position);
        Assert.NotEqual(destination, position);
        Assert.Contains(position, movement.Path);
    }

    [Fact]
    public void SettleTo_leaves_an_outbound_army_unchanged_before_turn_around()
    {
        var settlement = Found();
        var decision = Dispatch(settlement, new HexCoord(20, 0), provisions: 50);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var result = army.SettleTo(movement.TurnAroundAt.AddMinutes(-1));

        Assert.False(result.Changed);
        Assert.False(result.ArrivedHome);
    }

    [Fact]
    public void SettleTo_turns_the_army_around_once_turn_around_time_passes()
    {
        var settlement = Found();
        var decision = Dispatch(settlement, new HexCoord(20, 0), provisions: 50);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        // Past turn-around but not yet home.
        var result = army.SettleTo(movement.TurnAroundAt.AddMinutes(1));

        Assert.True(result.Changed);
        Assert.False(result.ArrivedHome);
        var newMovement = ((ArmyLocation.InTransit)result.Army.Location).Movement;
        Assert.True(newMovement.IsReturning);
        Assert.Equal(movement.ReturnPath, newMovement.Path);
    }

    [Fact]
    public void SettleTo_arrives_home_once_the_return_leg_completes()
    {
        var settlement = Found();
        var decision = Dispatch(settlement, new HexCoord(4, 0), provisions: 40);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var result = army.SettleTo(movement.ReturnArrivesAt.AddDays(1));

        Assert.True(result.Changed);
        Assert.True(result.ArrivedHome);
        Assert.IsType<ArmyLocation.AtHome>(result.Army.Location);
    }

    [Fact]
    public void SettleTo_handles_turn_around_and_full_return_in_a_single_late_settle()
    {
        var settlement = Found();
        var decision = Dispatch(settlement, new HexCoord(4, 0), provisions: 40);
        var army = decision.Army!;

        // Never looked at again until long after everything should have happened.
        var result = army.SettleTo(T0.AddYears(1));

        Assert.True(result.Changed);
        Assert.True(result.ArrivedHome);
    }

    [Fact]
    public void TurnAroundAt_is_computed_from_provisions_and_upkeep()
    {
        // One Spearman (upkeep 1/h, speed 4/h) moving 4 hexes: outbound and
        // return each take 1 hour. Load exactly enough for the round trip
        // plus 2 hours of standing.
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 1)]);
        var provisions = 2.0 + 2.0; // round trip (2h @ 1/h) + 2h standing
        var decision = Dispatch(settlement, new HexCoord(4, 0), provisions,
            requested: [new UnitStack(UnitType.Spearman, 1)]);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var movement = ((ArmyLocation.InTransit)decision.Army!.Location).Movement;

        var expectedStandingHours = 2.0;
        Assert.Equal(
            movement.ArrivesAt + TimeSpan.FromHours(expectedStandingHours), movement.TurnAroundAt,
            TimeSpan.FromSeconds(1));
    }

    [Fact]
    public void Recall_is_rejected_when_already_home()
    {
        var army = new Army
        {
            Id = Guid.CreateVersion7(),
            SettlementId = Guid.CreateVersion7(),
            Location = new ArmyLocation.AtHome(),
        };

        Assert.Null(army.Recall(T0, Home, AllGrass()));
    }

    [Fact]
    public void Recall_is_rejected_when_already_returning()
    {
        var settlement = Found();
        var decision = Dispatch(settlement, new HexCoord(20, 0), provisions: 50);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;
        var returning = army.SettleTo(movement.TurnAroundAt.AddMinutes(1)).Army;

        Assert.Null(returning.Recall(movement.TurnAroundAt.AddMinutes(2), Home, AllGrass()));
    }

    [Fact]
    public void Recall_mid_journey_builds_a_route_home_from_the_current_position()
    {
        var settlement = Found();
        var decision = Dispatch(settlement, new HexCoord(20, 0), provisions: 50);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var midway = movement.DepartedAt + TimeSpan.FromHours(movement.CumulativeHours[^1] / 4.0);
        var recalled = army.Recall(midway, Home, AllGrass());

        Assert.NotNull(recalled);
        var recalledMovement = ((ArmyLocation.InTransit)recalled!.Location).Movement;
        Assert.True(recalledMovement.IsReturning);
        Assert.Equal(Home, recalledMovement.Path[^1]);
        Assert.Equal(midway, recalledMovement.DepartedAt);
    }

    [Fact]
    public void Merging_a_returned_army_adds_its_stacks_back_into_the_garrison()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 10)]);
        var decision = Dispatch(settlement, new HexCoord(4, 0), provisions: 40,
            requested: [new UnitStack(UnitType.Spearman, 5)]);
        Assert.True(decision.Accepted);

        // Simulate ArmyService's merge-on-arrival step directly against the
        // domain boundary it touches (Settlement.Garrison).
        var garrison = decision.Settlement!.Garrison.ToList();
        foreach (var stack in decision.Army!.Stacks)
        {
            var index = garrison.FindIndex(g => g.Type == stack.Type);
            garrison[index] = garrison[index] with { Count = garrison[index].Count + stack.Count };
        }

        Assert.Equal(10, garrison.Single(g => g.Type == UnitType.Spearman).Count);
    }
}
