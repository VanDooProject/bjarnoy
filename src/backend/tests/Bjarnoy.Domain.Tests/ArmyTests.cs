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
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 1_000_000, Stone: 1_000_000, Food: food, Iron: 1_000_000),
                production, capacity, T0),
        }.WithGarrison(garrison ?? [new UnitStack(UnitType.Spearman, 10)]);
    }

    private static DispatchDecision Dispatch(
        Settlement settlement,
        HexCoord destination,
        double provisions,
        IReadOnlyList<HexCoord>? waypoints = null,
        IReadOnlyList<UnitStack>? requested = null,
        Func<HexCoord, Terrain>? terrainAt = null)
    {
        return TestArmy.PlanDispatch(
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
    public void Dispatch_is_rejected_when_the_destination_is_walled_in_by_mountains()
    {
        var settlement = Found();
        var target = new HexCoord(5, 0);
        var ring = target.Neighbours().ToHashSet();
        Terrain TerrainAt(HexCoord c) => ring.Contains(c) ? Terrain.Mountain : Terrain.Grass;

        var decision = Dispatch(settlement, target, provisions: 40, terrainAt: TerrainAt);

        Assert.Equal(DispatchRejection.UnreachableLeg, decision.Rejection);
    }

    [Fact]
    public void Dispatch_is_rejected_when_a_wide_river_cuts_the_only_way_and_accepted_when_it_is_a_stream()
    {
        var settlement = Found();
        var riverWall = Enumerable.Range(-15, 31).Select(r => new HexCoord(2, r)).ToHashSet();

        DispatchDecision Send(Func<HexCoord, bool>? isWide) => TestArmy.PlanDispatch(
            settlement, [new UnitStack(UnitType.Spearman, 5)], 40, [], new HexCoord(5, 0), T0, Guid.CreateVersion7(),
            AllGrass(), isRiver: riverWall.Contains, isWideRiver: isWide);

        Assert.Equal(DispatchRejection.UnreachableLeg, Send(riverWall.Contains).Rejection);
        Assert.True(Send(_ => false).Accepted);
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

    private static int Expansions(HexCoord from, HexCoord to) =>
        HexPathfinder.Search(from, to, AllGrass(), isLandUnit: true).Expanded;

    [Fact]
    public void Dispatch_legs_share_one_search_budget_so_legs_that_each_fit_alone_can_be_refused_together()
    {
        var settlement = Found();
        var waypoint = new HexCoord(3, 0);
        var destination = new HexCoord(3, 3);
        var firstLeg = Expansions(Home, waypoint);
        var secondLeg = Expansions(waypoint, destination);
        var total = firstLeg + secondLeg;
        Assert.True(firstLeg > 0 && secondLeg > 0);

        DispatchDecision PlanWith(int budget) => TestArmy.PlanDispatch(
            settlement, [new UnitStack(UnitType.Spearman, 5)], 40, [waypoint], destination, T0, Guid.CreateVersion7(),
            AllGrass(), routeSearchBudget: budget);

        // Each leg alone fits in the budget, together they do not.
        Assert.True(Math.Max(firstLeg, secondLeg) <= total - 1);
        Assert.Equal(DispatchRejection.RouteTooLong, PlanWith(total - 1).Rejection);
        Assert.True(PlanWith(total).Accepted);
    }

    [Fact]
    public void Dispatch_with_waypoints_under_the_default_budget_still_succeeds()
    {
        var decision = Dispatch(Found(), new HexCoord(3, 3), provisions: 40, waypoints: [new HexCoord(3, 0), new HexCoord(0, 3)]);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
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
    public void Travel_time_scales_down_with_the_world_speed_factor()
    {
        var settlement = Found();
        var destination = new HexCoord(4, 0);

        var normal = TestArmy.PlanDispatch(
            settlement, [new UnitStack(UnitType.Spearman, 5)], provisions: 40, [], destination, T0,
            Guid.CreateVersion7(), AllGrass());
        var doubled = TestArmy.PlanDispatch(
            settlement, [new UnitStack(UnitType.Spearman, 5)], provisions: 40, [], destination, T0,
            Guid.CreateVersion7(), AllGrass(), speedFactor: 2.0);

        Assert.True(normal.Accepted, $"expected accept, got {normal.Rejection}");
        Assert.True(doubled.Accepted, $"expected accept, got {doubled.Rejection}");

        var normalMovement = ((ArmyLocation.InTransit)normal.Army!.Location).Movement;
        var doubledMovement = ((ArmyLocation.InTransit)doubled.Army!.Location).Movement;

        Assert.Equal(normalMovement.CumulativeHours[^1] / 2.0, doubledMovement.CumulativeHours[^1], precision: 9);
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

    private static (Army Army, Bjarnoy.Domain.Movement.Movement Movement) Outbound(HexCoord? to = null)
    {
        var decision = Dispatch(Found(), to ?? new HexCoord(6, 0), provisions: 45);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        return (decision.Army!, ((ArmyLocation.InTransit)decision.Army!.Location).Movement);
    }

    [Fact]
    public void HexesReachedBy_is_the_path_prefix_ending_at_PositionAt()
    {
        var (_, movement) = Outbound();

        for (var i = 0; i < movement.Path.Count; i++)
        {
            var at = movement.DepartedAt + TimeSpan.FromHours(movement.EdgeHours[i]);
            var reached = movement.HexesReachedBy(at);

            Assert.Equal(movement.Path.Take(i + 1), reached);
            Assert.Equal(movement.PositionAt(at), reached[^1]);
        }
    }

    [Fact]
    public void HexesReachedBy_is_just_the_start_before_departure_and_the_whole_path_from_arrival_on()
    {
        var (_, movement) = Outbound();

        Assert.Equal([movement.Path[0]], movement.HexesReachedBy(movement.DepartedAt.AddSeconds(-1)));
        Assert.Equal(movement.Path, movement.HexesReachedBy(movement.ArrivesAt));
        Assert.Equal(movement.Path, movement.HexesReachedBy(DateTimeOffset.MaxValue));
    }

    [Fact]
    public void Army_HexesReachedBy_follows_the_leg_while_travelling_and_is_home_otherwise()
    {
        var (army, movement) = Outbound();
        var partway = movement.DepartedAt + TimeSpan.FromHours(movement.EdgeHours[3]);

        Assert.Equal(movement.Path.Take(4), army.HexesReachedBy(Home, partway));
        Assert.Equal([Home], (army with { Location = new ArmyLocation.AtHome() }).HexesReachedBy(Home, partway));
    }

    [Fact]
    public void SettleTo_reports_the_outbound_leg_as_walked_up_to_the_turn_around()
    {
        var (army, movement) = Outbound();

        var result = army.SettleTo(movement.TurnAroundAt.AddMinutes(1));

        var walked = Assert.Single(result.Walked);
        Assert.Same(movement, walked.Leg);
        Assert.Equal(movement.Path, walked.Hexes);
    }

    [Fact]
    public void SettleTo_over_the_whole_round_trip_reports_the_outbound_and_the_return_leg()
    {
        var (army, movement) = Outbound();

        var result = army.SettleTo(movement.ReturnArrivesAt.AddMinutes(1));

        Assert.True(result.ArrivedHome);
        Assert.Equal(2, result.Walked.Count);
        Assert.Equal(movement.Path, result.Walked[0].Hexes);
        Assert.Equal(movement.ReturnPath, result.Walked[1].Hexes);
    }

    [Fact]
    public void SettleTo_reports_nothing_walked_when_nothing_is_due()
    {
        var (army, movement) = Outbound();

        Assert.Empty(army.SettleTo(movement.TurnAroundAt.AddMinutes(-1)).Walked);
    }

    [Fact]
    public void WalkedLeg_Between_a_recall_covers_the_route_up_to_the_new_leg_and_nothing_when_the_leg_is_unchanged()
    {
        var (army, movement) = Outbound();
        var now = movement.DepartedAt + TimeSpan.FromHours(movement.EdgeHours[3]);

        var recalled = army.Recall(now, Home, AllGrass());
        Assert.NotNull(recalled);

        var walked = WalkedLeg.Between(army, recalled!);
        Assert.NotNull(walked);
        Assert.Equal(movement.Path.Take(4), walked!.Hexes);
        Assert.Null(WalkedLeg.Between(army, army));
        Assert.Null(WalkedLeg.Between(army with { Location = new ArmyLocation.AtHome() }, army));
    }

    [Fact]
    public void WalkedLeg_Between_an_arrival_covers_the_whole_leg()
    {
        var (army, movement) = Outbound();

        var walked = WalkedLeg.Between(army, army with { Location = new ArmyLocation.AtHome() });

        Assert.Equal(movement.Path, walked!.Hexes);
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
        // One Spearman (upkeep 0.25/h, speed 4/h) moving 4 hexes: outbound and
        // return each take 1 hour. Load exactly enough for the round trip
        // plus 2 hours of standing.
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 1)]);
        var provisions = 0.25 * (2.0 + 2.0); // round trip (2h @ 0.25/h) + 2h standing
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
            HomeSpot = new HexCoord(0, 0),
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

    // Issue #156 phase 1: PlanFieldOrder — sending an army already out in the
    // field onward. `Standing` and `Marching` below both go through the real
    // Dispatch() fixture (not a hand-built Army) so the movement/food math the
    // assertions lean on is exactly what a real dispatch would have produced.

    /// <summary>An army dispatched to <paramref name="destination"/>, settled to just after it arrives (still standing, before turn-around).</summary>
    private static Army Standing(HexCoord destination, double provisions = 40)
    {
        var settlement = Found();
        var decision = Dispatch(settlement, destination, provisions);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;
        return army.SettleTo(movement.ArrivesAt.AddMinutes(1)).Army;
    }

    /// <summary>An army dispatched to <paramref name="destination"/>, still partway along the outbound leg.</summary>
    private static Army Marching(HexCoord destination, double provisions = 40)
    {
        var settlement = Found();
        var decision = Dispatch(settlement, destination, provisions);
        return decision.Army!;
    }

    private static DateTimeOffset ArrivedAt(Army army) => ((ArmyLocation.InTransit)army.Location).Movement.ArrivesAt.AddMinutes(1);

    private static DateTimeOffset MidwayOf(Army army) =>
        ((ArmyLocation.InTransit)army.Location).Movement is var m
            ? m.DepartedAt + TimeSpan.FromHours(m.CumulativeHours[^1] / 4.0)
            : throw new InvalidOperationException();

    [Fact]
    public void FieldOrder_is_rejected_when_the_army_is_at_home()
    {
        var army = new Army
        {
            Id = Guid.CreateVersion7(),
            SettlementId = Guid.CreateVersion7(),
            HomeSpot = new HexCoord(0, 0),
            Location = new ArmyLocation.AtHome(),
        };

        var result = Army.PlanFieldOrder(army, [], new HexCoord(1, 0), Home, T0, AllGrass(), isPremium: true);

        Assert.Equal(FieldOrderRejection.NoActiveJourney, result.Rejection);
    }

    [Fact]
    public void FieldOrder_is_rejected_when_the_army_is_supporting()
    {
        var army = new Army
        {
            Id = Guid.CreateVersion7(),
            SettlementId = Guid.CreateVersion7(),
            HomeSpot = new HexCoord(0, 0),
            Location = new ArmyLocation.Supporting(Guid.CreateVersion7(), new HexCoord(0, 0)),
        };

        var result = Army.PlanFieldOrder(army, [], new HexCoord(1, 0), Home, T0, AllGrass(), isPremium: true);

        Assert.Equal(FieldOrderRejection.NoActiveJourney, result.Rejection);
    }

    [Fact]
    public void FieldOrder_is_rejected_when_already_returning()
    {
        var army = Standing(new HexCoord(10, 0));
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;
        var returning = army.SettleTo(movement.TurnAroundAt.AddMinutes(1)).Army;

        var result = Army.PlanFieldOrder(
            returning, [], new HexCoord(1, 0), Home, movement.TurnAroundAt.AddMinutes(2), AllGrass(), isPremium: true);

        Assert.Equal(FieldOrderRejection.NoActiveJourney, result.Rejection);
    }

    [Fact]
    public void FieldOrder_move_on_with_no_waypoints_is_free()
    {
        var army = Standing(new HexCoord(10, 0));

        var result = Army.PlanFieldOrder(
            army, [], new HexCoord(15, 0), Home, ArrivedAt(army), AllGrass(), isPremium: false);

        Assert.True(result.Accepted, $"expected accept, got {result.Rejection}");
        var movement = ((ArmyLocation.InTransit)result.Army!.Location).Movement;
        Assert.Equal(new HexCoord(10, 0), movement.Path[0]);
        Assert.Equal(new HexCoord(15, 0), movement.Path[^1]);
        Assert.False(movement.IsReturning);
    }

    [Fact]
    public void FieldOrder_way_home_counts_against_the_same_search_budget_as_the_legs()
    {
        var standingAt = new HexCoord(10, 0);
        var destination = new HexCoord(15, 0);
        var army = Standing(standingAt);
        var outbound = Expansions(standingAt, destination);
        var wayHome = Expansions(destination, Home);
        var total = outbound + wayHome;
        Assert.True(outbound > 0 && wayHome > 0);

        FieldOrderResult PlanWith(int budget) => Army.PlanFieldOrder(
            army, [], destination, Home, ArrivedAt(army), AllGrass(), isPremium: false, routeSearchBudget: budget);

        // The outbound leg fits alone, and so does the way home; it is the pair that runs over.
        Assert.Equal(FieldOrderRejection.RouteTooLong, PlanWith(total - 1).Rejection);
        Assert.True(PlanWith(total).Accepted);
    }

    [Fact]
    public void FieldOrder_legs_share_one_search_budget()
    {
        var standingAt = new HexCoord(10, 0);
        var waypoint = new HexCoord(10, 6);
        var destination = new HexCoord(15, 0);
        var army = Standing(standingAt);
        var total = Expansions(standingAt, waypoint) + Expansions(waypoint, destination) + Expansions(destination, Home);

        FieldOrderResult PlanWith(int budget) => Army.PlanFieldOrder(
            army, [waypoint], destination, Home, ArrivedAt(army), AllGrass(), isPremium: true, routeSearchBudget: budget);

        Assert.Equal(FieldOrderRejection.RouteTooLong, PlanWith(total - 1).Rejection);
        Assert.True(PlanWith(total).Accepted);
    }

    private static List<HexCoord> WaypointsOf(int count) => [.. Enumerable.Range(1, count).Select(i => new HexCoord(i, 0))];

    [Theory]
    [InlineData(5, false, true)]
    [InlineData(6, false, false)]
    [InlineData(10, true, true)]
    [InlineData(11, true, false)]
    public void Dispatch_takes_at_most_five_waypoints_or_ten_with_premium(int count, bool isPremium, bool accepted)
    {
        var decision = TestArmy.PlanDispatch(
            Found(), [new UnitStack(UnitType.Spearman, 5)], 100, WaypointsOf(count), new HexCoord(count + 1, 0), T0,
            Guid.CreateVersion7(), AllGrass(), isPremium: isPremium);

        Assert.Equal(accepted, decision.Accepted);
        if (!accepted)
        {
            Assert.Equal(DispatchRejection.TooManyWaypoints, decision.Rejection);
        }
    }

    [Fact]
    public void Dispatch_with_six_waypoints_is_refused_for_a_free_account_before_any_search()
    {
        var decision = TestArmy.PlanDispatch(
            Found(), [new UnitStack(UnitType.Spearman, 5)], 100, WaypointsOf(6), new HexCoord(7, 0), T0,
            Guid.CreateVersion7(), AllGrass(), routeSearchBudget: 0);

        Assert.Equal(DispatchRejection.TooManyWaypoints, decision.Rejection);
    }

    [Theory]
    [InlineData(10, true)]
    [InlineData(11, false)]
    public void FieldOrder_move_on_takes_at_most_ten_waypoints_for_premium(int count, bool accepted)
    {
        var army = Standing(new HexCoord(0, 0));

        var result = Army.PlanFieldOrder(
            army, WaypointsOf(count), new HexCoord(count + 1, 0), Home, ArrivedAt(army), AllGrass(), isPremium: true);

        Assert.Equal(accepted, result.Accepted);
        if (!accepted)
        {
            Assert.Equal(FieldOrderRejection.TooManyWaypoints, result.Rejection);
        }
    }

    [Fact]
    public void FieldOrder_move_on_with_waypoints_requires_premium()
    {
        var army = Standing(new HexCoord(10, 0));
        var now = ArrivedAt(army);

        var refused = Army.PlanFieldOrder(
            army, [new HexCoord(12, 0)], new HexCoord(15, 0), Home, now, AllGrass(), isPremium: false);
        Assert.Equal(FieldOrderRejection.PremiumRequired, refused.Rejection);

        var accepted = Army.PlanFieldOrder(
            army, [new HexCoord(12, 0)], new HexCoord(15, 0), Home, now, AllGrass(), isPremium: true);
        Assert.True(accepted.Accepted, $"expected accept, got {accepted.Rejection}");
        var movement = ((ArmyLocation.InTransit)accepted.Army!.Location).Movement;
        Assert.Contains(new HexCoord(12, 0), movement.Path);
    }

    [Fact]
    public void FieldOrder_append_goal_while_still_marching_requires_premium()
    {
        var army = Marching(new HexCoord(10, 0));
        var midway = MidwayOf(army);

        var refused = Army.PlanFieldOrder(army, [], new HexCoord(15, 0), Home, midway, AllGrass(), isPremium: false);
        Assert.Equal(FieldOrderRejection.PremiumRequired, refused.Rejection);

        var accepted = Army.PlanFieldOrder(army, [], new HexCoord(15, 0), Home, midway, AllGrass(), isPremium: true);
        Assert.True(accepted.Accepted, $"expected accept, got {accepted.Rejection}");
    }

    [Fact]
    public void FieldOrder_append_goal_extends_the_original_route_rather_than_restarting_it()
    {
        var army = Marching(new HexCoord(10, 0));
        var originalMovement = ((ArmyLocation.InTransit)army.Location).Movement;
        var midway = MidwayOf(army);

        var result = Army.PlanFieldOrder(army, [], new HexCoord(15, 0), Home, midway, AllGrass(), isPremium: true);

        Assert.True(result.Accepted, $"expected accept, got {result.Rejection}");
        var movement = ((ArmyLocation.InTransit)result.Army!.Location).Movement;
        // The already-computed original leg is untouched (same departure and
        // the same hexes up to the original destination), just continued.
        Assert.Equal(originalMovement.DepartedAt, movement.DepartedAt);
        Assert.Equal(originalMovement.Path, movement.Path.Take(originalMovement.Path.Count));
        Assert.Equal(new HexCoord(15, 0), movement.Path[^1]);
    }

    [Fact]
    public void FieldOrder_is_rejected_when_the_new_destination_is_unreachable()
    {
        var army = Standing(new HexCoord(10, 0));
        var seaWall = Enumerable.Range(-10, 21).Select(r => new HexCoord(12, r)).ToHashSet();
        Terrain TerrainAt(HexCoord c) => seaWall.Contains(c) ? Terrain.Sea : Terrain.Grass;

        var result = Army.PlanFieldOrder(
            army, [], new HexCoord(15, 0), Home, ArrivedAt(army), TerrainAt, isPremium: false);

        Assert.Equal(FieldOrderRejection.UnreachableLeg, result.Rejection);
    }

    [Fact]
    public void FieldOrder_is_rejected_when_provisions_do_not_cover_the_new_round_trip()
    {
        // 5 Spearmen eat 1.25/h. 10 food is 8 hours: enough for the original round trip (10 out, 10 back = 5 h)
        // with a margin — nowhere near enough for a much longer detour to (60, 0) (30 h).
        var army = Standing(new HexCoord(10, 0), provisions: 10);

        var result = Army.PlanFieldOrder(
            army, [], new HexCoord(60, 0), Home, ArrivedAt(army), AllGrass(), isPremium: false);

        Assert.Equal(FieldOrderRejection.InsufficientProvisionsForRoundTrip, result.Rejection);
    }

    [Fact]
    public void Fleet_dispatch_carries_land_units_as_passengers_within_the_ship_slots()
    {
        // 5 spearmen (5 slots) on 1 Karve (10 slots).
        var settlement = Found(garrison: [new UnitStack(UnitType.Karve, 1), new UnitStack(UnitType.Spearman, 5)]);

        var decision = Dispatch(settlement, new HexCoord(4, 0), provisions: 40,
            requested: [new UnitStack(UnitType.Karve, 1), new UnitStack(UnitType.Spearman, 5)],
            terrainAt: c => c == new HexCoord(0, 0) ? Terrain.Grass : Terrain.Sea);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.True(decision.Army!.IsFleet);
    }

    [Theory]
    [InlineData(10, 0, true)]
    [InlineData(11, 0, false)]
    [InlineData(8, 1, true)]
    [InlineData(9, 1, false)]
    public void Fleet_dispatch_is_refused_when_the_passengers_need_more_slots_than_one_karve_offers(
        int spearmen, int bowmen, bool accepted)
    {
        // Spearman 1 slot, Bowman 2 slots; one Karve offers 10.
        var requested = new List<UnitStack> { new(UnitType.Karve, 1), new(UnitType.Spearman, spearmen) };
        if (bowmen > 0)
        {
            requested.Add(new UnitStack(UnitType.Bowman, bowmen));
        }

        var settlement = Found(garrison: requested);

        var decision = Dispatch(settlement, new HexCoord(4, 0), provisions: 40, requested: requested,
            terrainAt: c => c == new HexCoord(0, 0) ? Terrain.Grass : Terrain.Sea);

        Assert.Equal(accepted, decision.Accepted);
        if (!accepted)
        {
            Assert.Equal(DispatchRejection.InsufficientShipCapacity, decision.Rejection);
        }
    }

    [Theory]
    [InlineData(UnitType.Karve, 1, 1, true)]
    [InlineData(UnitType.Karve, 1, 2, false)]
    [InlineData(UnitType.Longship, 1, 2, true)]
    [InlineData(UnitType.Longship, 1, 3, false)]
    [InlineData(UnitType.Karve, 2, 2, true)]
    public void Siege_engines_ride_aboard_at_ten_slots_each(UnitType ship, int ships, int rams, bool accepted)
    {
        var requested = new[] { new UnitStack(ship, ships), new UnitStack(UnitType.Ram, rams) };
        var settlement = Found(garrison: requested);

        var decision = Dispatch(settlement, new HexCoord(4, 0), provisions: 40, requested: requested,
            terrainAt: c => c == new HexCoord(0, 0) ? Terrain.Grass : Terrain.Sea);

        Assert.Equal(accepted, decision.Accepted);
    }

    [Fact]
    public void Fleet_moves_at_the_speed_of_its_slowest_ship_not_of_its_passengers()
    {
        var karveOnly = Found(garrison: [new UnitStack(UnitType.Karve, 1)]);
        var withRam = Found(garrison: [new UnitStack(UnitType.Karve, 1), new UnitStack(UnitType.Ram, 1)]);
        Func<HexCoord, Terrain> terrain = c => c == new HexCoord(0, 0) ? Terrain.Grass : Terrain.Sea;

        var plain = Dispatch(karveOnly, new HexCoord(4, 0), provisions: 40, requested: [new UnitStack(UnitType.Karve, 1)], terrainAt: terrain);
        var loaded = Dispatch(withRam, new HexCoord(4, 0), provisions: 40,
            requested: [new UnitStack(UnitType.Karve, 1), new UnitStack(UnitType.Ram, 1)], terrainAt: terrain);

        Assert.True(loaded.Accepted, $"expected accept, got {loaded.Rejection}");
        Assert.Equal(UnitCatalogue.Get(UnitType.Karve).Speed, loaded.Army!.TotalSpeed);
        Assert.Equal(
            ((ArmyLocation.InTransit)plain.Army!.Location).Movement.ArrivesAt,
            ((ArmyLocation.InTransit)loaded.Army.Location).Movement.ArrivesAt);
    }

    [Fact]
    public void Land_army_still_moves_at_its_slowest_unit()
    {
        var decision = Dispatch(Found(garrison: [new UnitStack(UnitType.Spearman, 2), new UnitStack(UnitType.Ram, 1)]),
            new HexCoord(1, 0), provisions: 15,
            requested: [new UnitStack(UnitType.Spearman, 2), new UnitStack(UnitType.Ram, 1)]);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(UnitCatalogue.Get(UnitType.Ram).Speed, decision.Army!.TotalSpeed);
    }

    [Fact]
    public void Fleet_dispatch_validates_the_destination_as_sea_not_land()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Karve, 5)]);
        Terrain TerrainAt(HexCoord c) => c == new HexCoord(5, 0) ? Terrain.Grass : Terrain.Sea;

        var decision = Dispatch(settlement, new HexCoord(5, 0), provisions: 40,
            requested: [new UnitStack(UnitType.Karve, 5)], terrainAt: TerrainAt);

        Assert.Equal(DispatchRejection.DestinationNotSea, decision.Rejection);
    }

    [Fact]
    public void Fleet_dispatch_accepted_over_open_sea()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Karve, 5)]);
        var destination = new HexCoord(4, 0);

        var decision = Dispatch(settlement, destination, provisions: 40,
            requested: [new UnitStack(UnitType.Karve, 5)], terrainAt: _ => Terrain.Sea);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var movement = ((ArmyLocation.InTransit)decision.Army!.Location).Movement;
        Assert.Equal(Home, movement.Path[0]);
        Assert.Equal(destination, movement.Path[^1]);
    }

    [Fact]
    public void Fleet_dispatch_return_path_is_the_outbound_path_walked_backwards()
    {
        // The way home is not searched again: a second search has its own node budget and once gave up on a long
        // trip the outbound search had just planned (a fleet to open water ~320 hexes out was refused as unreachable).
        var settlement = Found(garrison: [new UnitStack(UnitType.Karve, 5)]);
        var islet = new HexCoord(3, 0).Neighbours().Append(new HexCoord(3, 0)).ToHashSet();
        Terrain TerrainAt(HexCoord c) => islet.Contains(c) ? Terrain.Mountain : Terrain.Sea;

        var decision = Dispatch(settlement, new HexCoord(7, 0), provisions: 80,
            requested: [new UnitStack(UnitType.Karve, 5)], terrainAt: TerrainAt);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var movement = ((ArmyLocation.InTransit)decision.Army!.Location).Movement;
        Assert.Equal(movement.Path.Reverse(), movement.ReturnPath);
    }

    [Fact]
    public void Fleet_dispatch_to_a_sea_hex_walled_in_by_land_is_a_sea_route_failure_not_a_land_one()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Karve, 5)]);
        var target = new HexCoord(5, 0);
        var ring = target.Neighbours().ToHashSet();
        Terrain TerrainAt(HexCoord c) => ring.Contains(c) ? Terrain.Mountain : Terrain.Sea;

        var decision = Dispatch(settlement, target, provisions: 40,
            requested: [new UnitStack(UnitType.Karve, 5)], terrainAt: TerrainAt);

        Assert.Equal(DispatchRejection.NoSeaRoute, decision.Rejection);
    }

    [Fact]
    public void Fleet_dispatch_too_far_to_plan_is_refused_as_a_too_long_trip_not_as_unreachable()
    {
        // No route exists, but a target this far out cannot be proven cut off within the search budget.
        var settlement = Found(garrison: [new UnitStack(UnitType.Karve, 5)]);
        var target = new HexCoord(250, 0);
        var ring = target.Neighbours().ToHashSet();
        Terrain TerrainAt(HexCoord c) => ring.Contains(c) ? Terrain.Mountain : Terrain.Sea;

        var decision = Dispatch(settlement, target, provisions: 40,
            requested: [new UnitStack(UnitType.Karve, 5)], terrainAt: TerrainAt);

        Assert.Equal(DispatchRejection.RouteTooLong, decision.Rejection);
    }

    [Fact]
    public void Land_dispatch_to_a_non_land_hex_is_still_rejected_the_ordinary_way()
    {
        // Mirrors Fleet_dispatch_validates_the_destination_as_sea_not_land —
        // a land army dispatched to sea keeps its own pre-existing rejection,
        // unaffected by fleet support existing.
        var settlement = Found();
        Terrain TerrainAt(HexCoord c) => c == new HexCoord(5, 0) ? Terrain.Sea : Terrain.Grass;

        var decision = Dispatch(settlement, new HexCoord(5, 0), provisions: 40, terrainAt: TerrainAt);

        Assert.Equal(DispatchRejection.DestinationNotLand, decision.Rejection);
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

    // Field orders with a mission, and splitting a standing army (issue #156): the target rules are the dispatch ones
    // (Army.ValidateMissionTarget), so these only pin that PlanFieldOrder applies them, sets the mission and handles the split.

    private static readonly HexCoord Beyond = new(12, 0);

    /// <summary>The target's longhouse at <see cref="Beyond"/>: the garrison spot a support order joins.</summary>
    private static readonly IReadOnlyList<GarrisonSpot> BeyondSpots =
        [new GarrisonSpot(new HexCoord(12, 0), GarrisonSpotKind.Longhouse, [], HoldsLand: true, HoldsShips: false)];

    private static Army StandingWith(
        IReadOnlyList<UnitStack> garrison, IReadOnlyList<UnitStack> sent, double provisions, HexCoord? destination = null)
    {
        var settlement = Found(garrison: garrison);
        var decision = Dispatch(settlement, destination ?? new HexCoord(10, 0), provisions, requested: sent);
        Assert.True(decision.Accepted, $"setup dispatch refused: {decision.Rejection}");
        var army = decision.Army!;
        return army.SettleTo(((ArmyLocation.InTransit)army.Location).Movement.ArrivesAt.AddMinutes(1)).Army;
    }

    private static Bjarnoy.Domain.Movement.Movement MovementOf(Army army) => ((ArmyLocation.InTransit)army.Location).Movement;

    [Fact]
    public void FieldOrder_attack_is_accepted_and_carries_the_mission_and_target()
    {
        var army = Standing(new HexCoord(10, 0));
        var target = Guid.CreateVersion7();

        var result = Army.PlanFieldOrder(
            army, [], Beyond, Home, ArrivedAt(army), AllGrass(), isPremium: false,
            mission: ArmyMission.Attack, targetSettlementId: target, targetBuildingCoord: new HexCoord(12, 0));

        Assert.True(result.Accepted, $"expected accept, got {result.Rejection}");
        Assert.Equal(ArmyMission.Attack, result.Army!.Mission);
        Assert.Equal(target, result.Army.TargetSettlementId);
        Assert.Equal(new HexCoord(12, 0), result.Army.TargetBuildingCoord);
        Assert.Null(result.Army.TargetCampCoord);
        Assert.Equal(army.Id, result.Army.Id);
        Assert.Null(result.Remainder);
        Assert.Equal(Beyond, MovementOf(result.Army).Path[^1]);
    }

    [Fact]
    public void FieldOrder_support_is_accepted_and_carries_the_host()
    {
        var army = Standing(new HexCoord(10, 0));
        var host = Guid.CreateVersion7();

        var result = Army.PlanFieldOrder(
            army, [], Beyond, Home, ArrivedAt(army), AllGrass(), isPremium: false,
            mission: ArmyMission.Support, targetSettlementId: host, targetBuildingCoord: Beyond, targetSpots: BeyondSpots);

        Assert.True(result.Accepted, $"expected accept, got {result.Rejection}");
        Assert.Equal(ArmyMission.Support, result.Army!.Mission);
        Assert.Equal(host, result.Army.TargetSettlementId);
        Assert.Equal(Beyond, result.Army.TargetBuildingCoord); // the spot the guest will stand at
    }

    [Fact]
    public void FieldOrder_hunt_is_accepted_and_carries_the_camp_and_move_clears_an_earlier_target()
    {
        var army = Standing(new HexCoord(10, 0));
        var now = ArrivedAt(army);

        var hunt = Army.PlanFieldOrder(
            army, [], Beyond, Home, now, AllGrass(), isPremium: false,
            mission: ArmyMission.Hunt, targetCampCoord: Beyond);
        Assert.True(hunt.Accepted, $"expected accept, got {hunt.Rejection}");
        Assert.Equal(ArmyMission.Hunt, hunt.Army!.Mission);
        Assert.Equal(Beyond, hunt.Army.TargetCampCoord);
        Assert.Null(hunt.Army.TargetSettlementId);

        // A Move order sets the Move mission and drops any target the army carried.
        var asSupport = army with { Mission = ArmyMission.Move, TargetSettlementId = Guid.CreateVersion7() };
        var move = Army.PlanFieldOrder(asSupport, [], Beyond, Home, now, AllGrass(), isPremium: false);
        Assert.Equal(ArmyMission.Move, move.Army!.Mission);
        Assert.Null(move.Army.TargetSettlementId);
    }

    [Fact]
    public void FieldOrder_found_is_not_an_order_mission()
    {
        var army = Standing(new HexCoord(10, 0));

        var result = Army.PlanFieldOrder(
            army, [], Beyond, Home, ArrivedAt(army), AllGrass(), isPremium: true, mission: ArmyMission.Found);

        Assert.Equal(FieldOrderRejection.MissionNotAllowed, result.Rejection);
    }

    [Fact]
    public void FieldOrder_attack_or_support_without_a_target_settlement_is_rejected()
    {
        var army = Standing(new HexCoord(10, 0));
        var now = ArrivedAt(army);

        foreach (var mission in new[] { ArmyMission.Attack, ArmyMission.Support, ArmyMission.Raid })
        {
            var result = Army.PlanFieldOrder(army, [], Beyond, Home, now, AllGrass(), isPremium: true, mission: mission);
            Assert.Equal(FieldOrderRejection.TargetSettlementRequired, result.Rejection);
        }
    }

    [Fact]
    public void FieldOrder_cannot_target_the_armys_own_home_settlement()
    {
        var army = Standing(new HexCoord(10, 0));
        var now = ArrivedAt(army);

        var attack = Army.PlanFieldOrder(
            army, [], Beyond, Home, now, AllGrass(), isPremium: true,
            mission: ArmyMission.Attack, targetSettlementId: army.SettlementId);
        Assert.Equal(FieldOrderRejection.CannotAttackOwnSettlement, attack.Rejection);

        var support = Army.PlanFieldOrder(
            army, [], Beyond, Home, now, AllGrass(), isPremium: true,
            mission: ArmyMission.Support, targetSettlementId: army.SettlementId);
        Assert.Equal(FieldOrderRejection.CannotSupportOwnSettlement, support.Rejection);
    }

    [Fact]
    public void FieldOrder_target_building_only_goes_with_attack_raid_or_support()
    {
        var army = Standing(new HexCoord(10, 0));

        var result = Army.PlanFieldOrder(
            army, [], Beyond, Home, ArrivedAt(army), AllGrass(), isPremium: true,
            mission: ArmyMission.Move, targetBuildingCoord: Beyond);

        Assert.Equal(FieldOrderRejection.TargetBuildingRequiresAttackMission, result.Rejection);
    }

    [Fact]
    public void FieldOrder_support_must_name_a_spot_of_the_target_that_holds_the_army()
    {
        var army = Standing(new HexCoord(10, 0));
        var now = ArrivedAt(army);
        var host = Guid.CreateVersion7();

        var unnamed = Army.PlanFieldOrder(
            army, [], Beyond, Home, now, AllGrass(), isPremium: true,
            mission: ArmyMission.Support, targetSettlementId: host, targetSpots: BeyondSpots);
        Assert.Equal(FieldOrderRejection.SupportSpotRequired, unnamed.Rejection);

        var elsewhere = Army.PlanFieldOrder(
            army, [], Beyond, Home, now, AllGrass(), isPremium: true,
            mission: ArmyMission.Support, targetSettlementId: host, targetBuildingCoord: new HexCoord(13, 0), targetSpots: BeyondSpots);
        Assert.Equal(FieldOrderRejection.SupportSpotCannotHold, elsewhere.Rejection);
    }

    [Fact]
    public void FieldOrder_hunt_without_a_camp_or_with_the_wrong_kind_of_camp_is_rejected()
    {
        var army = Standing(new HexCoord(10, 0));
        var now = ArrivedAt(army);

        var none = Army.PlanFieldOrder(army, [], Beyond, Home, now, AllGrass(), isPremium: true, mission: ArmyMission.Hunt);
        Assert.Equal(FieldOrderRejection.NoCampAtDestination, none.Rejection);

        var water = Army.PlanFieldOrder(
            army, [], Beyond, Home, now, AllGrass(), isPremium: true,
            mission: ArmyMission.Hunt, targetCampCoord: Beyond, targetCampIsWater: true);
        Assert.Equal(FieldOrderRejection.HuntRequiresFleet, water.Rejection);
    }

    [Fact]
    public void FieldOrder_premium_gate_is_the_same_for_every_mission()
    {
        var standing = Standing(new HexCoord(10, 0));
        var now = ArrivedAt(standing);
        var target = Guid.CreateVersion7();

        // Standing: free without waypoints, premium with them.
        Assert.True(Army.PlanFieldOrder(
            standing, [], Beyond, Home, now, AllGrass(), isPremium: false,
            mission: ArmyMission.Attack, targetSettlementId: target).Accepted);
        Assert.Equal(FieldOrderRejection.PremiumRequired, Army.PlanFieldOrder(
            standing, [new HexCoord(11, 0)], Beyond, Home, now, AllGrass(), isPremium: false,
            mission: ArmyMission.Attack, targetSettlementId: target).Rejection);

        // Still marching: premium for any mission.
        var marching = Marching(new HexCoord(10, 0));
        var midway = MidwayOf(marching);
        Assert.Equal(FieldOrderRejection.PremiumRequired, Army.PlanFieldOrder(
            marching, [], Beyond, Home, midway, AllGrass(), isPremium: false,
            mission: ArmyMission.Support, targetSettlementId: target, targetBuildingCoord: Beyond, targetSpots: BeyondSpots).Rejection);
        Assert.True(Army.PlanFieldOrder(
            marching, [], Beyond, Home, midway, AllGrass(), isPremium: true,
            mission: ArmyMission.Support, targetSettlementId: target, targetBuildingCoord: Beyond, targetSpots: BeyondSpots).Accepted);
    }

    [Fact]
    public void FieldOrder_split_leaves_a_new_army_and_keeps_the_rest_standing_on_its_own_movement()
    {
        var army = StandingWith([new UnitStack(UnitType.Spearman, 10)], [new UnitStack(UnitType.Spearman, 8)], provisions: 80);
        var now = ArrivedAt(army);
        var originalMovement = MovementOf(army);
        var splitId = Guid.CreateVersion7();

        var result = Army.PlanFieldOrder(
            army, [], Beyond, Home, now, AllGrass(), isPremium: false,
            mission: ArmyMission.Attack, targetSettlementId: Guid.CreateVersion7(),
            requestedUnits: [new UnitStack(UnitType.Spearman, 3)], splitArmyId: splitId);

        Assert.True(result.Accepted, $"expected accept, got {result.Rejection}");
        var leaving = result.Army!;
        var remainder = result.Remainder!;

        Assert.Equal(splitId, leaving.Id);
        Assert.Equal(army.SettlementId, leaving.SettlementId);
        Assert.Equal(3, Assert.Single(leaving.Stacks).Count);
        Assert.Equal(ArmyMission.Attack, leaving.Mission);
        var leavingMovement = MovementOf(leaving);
        Assert.Equal(now, leavingMovement.DepartedAt);
        Assert.Equal(new HexCoord(10, 0), leavingMovement.Path[0]);
        Assert.Equal(Beyond, leavingMovement.Path[^1]);

        Assert.Equal(army.Id, remainder.Id);
        Assert.Equal(5, Assert.Single(remainder.Stacks).Count);
        Assert.Equal(army.Mission, remainder.Mission);
        Assert.Equal(originalMovement, MovementOf(remainder));

        // Food by upkeep share (3 of 8 upkeep leaves): together exactly what the army had.
        var before = army.ProvisionsAt(now);
        Assert.Equal(before * 3 / 8, leaving.Provisions, precision: 9);
        Assert.Equal(before * 5 / 8, remainder.ProvisionsAt(now), precision: 9);
        Assert.Equal(before, leaving.Provisions + remainder.ProvisionsAt(now), precision: 9);
    }

    [Fact]
    public void FieldOrder_split_keeps_the_remainders_turn_around_unchanged()
    {
        var army = StandingWith([new UnitStack(UnitType.Spearman, 10)], [new UnitStack(UnitType.Spearman, 8)], provisions: 80);

        var result = Army.PlanFieldOrder(
            army, [], Beyond, Home, ArrivedAt(army), AllGrass(), isPremium: false,
            requestedUnits: [new UnitStack(UnitType.Spearman, 3)], splitArmyId: Guid.CreateVersion7());

        Assert.True(result.Accepted, $"expected accept, got {result.Rejection}");
        var expected = MovementOf(army).TurnAroundAt;
        Assert.True(
            Math.Abs((MovementOf(result.Remainder!).TurnAroundAt - expected).TotalMilliseconds) < 1,
            "the part that stays must turn around exactly when the whole army would have");

        // And what is left of the remainder's own burn still leads to that same instant: at the turn-around the food
        // equals what the way home costs it.
        var remainder = result.Remainder!;
        var m = MovementOf(remainder);
        var atTurn = remainder.ProvisionsAt(m.TurnAroundAt);
        Assert.Equal(m.ReturnCumulativeHours[^1] * remainder.TotalUpkeepPerHour, atTurn, precision: 6);
    }

    [Fact]
    public void FieldOrder_split_caps_each_parts_food_and_moves_the_excess_to_the_other_part()
    {
        // 1 provisioner and 4 spearmen share the food by upkeep (4 of 5 would leave), with more food on board than the
        // spearmen's share fits into their own carry capacity.
        var spearmenCarry = 4 * UnitCatalogue.Get(UnitType.Spearman).FoodCarryCapacity;
        var army = StandingWith(
            [new UnitStack(UnitType.Provisioner, 1), new UnitStack(UnitType.Spearman, 4)],
            [new UnitStack(UnitType.Provisioner, 1), new UnitStack(UnitType.Spearman, 4)], provisions: 150);
        var now = ArrivedAt(army);
        var foodNow = army.ProvisionsAt(now);

        var result = Army.PlanFieldOrder(
            army, [], Beyond, Home, now, AllGrass(), isPremium: false,
            requestedUnits: [new UnitStack(UnitType.Spearman, 4)], splitArmyId: Guid.CreateVersion7());

        Assert.True(result.Accepted, $"expected accept, got {result.Rejection}");
        Assert.True(foodNow * 4 / 5 > spearmenCarry, "setup: the spearmen's 4/5 share must exceed their carry capacity");
        // The spearmen's 4/5 share is over their carry capacity: they take that much, the provisioner keeps the rest.
        Assert.Equal(spearmenCarry, result.Army!.Provisions, precision: 9);
        var remainder = result.Remainder!;
        Assert.Equal(foodNow - spearmenCarry, remainder.ProvisionsAt(now), precision: 9);

        // The remainder's movement was rebuilt from its new food: it turns around when that food just covers the way home.
        var m = MovementOf(remainder);
        var expectedTurn = now + TimeSpan.FromHours((foodNow - spearmenCarry) / remainder.TotalUpkeepPerHour - m.ReturnCumulativeHours[^1]);
        Assert.True(Math.Abs((m.TurnAroundAt - expectedTurn).TotalMilliseconds) < 1, "turn-around must follow the remainder's food");
        Assert.Equal(m.DepartedAt, MovementOf(army).DepartedAt);
    }

    [Fact]
    public void FieldOrder_split_drops_the_food_neither_part_can_carry()
    {
        var army = StandingWith([new UnitStack(UnitType.Spearman, 10)], [new UnitStack(UnitType.Spearman, 8)], provisions: 80);
        // More food than the whole army can carry (admin edits can do this): each part keeps only what its spearmen carry.
        var spearmanCarry = UnitCatalogue.Get(UnitType.Spearman).FoodCarryCapacity;
        var overloaded = army with { Provisions = 1000 };
        var now = ArrivedAt(army);

        var result = Army.PlanFieldOrder(
            overloaded, [], Beyond, Home, now, AllGrass(), isPremium: false,
            requestedUnits: [new UnitStack(UnitType.Spearman, 3)], splitArmyId: Guid.CreateVersion7());

        Assert.True(result.Accepted, $"expected accept, got {result.Rejection}");
        Assert.Equal(3 * spearmanCarry, result.Army!.Provisions, precision: 9);
        Assert.Equal(5 * spearmanCarry, result.Remainder!.ProvisionsAt(now), precision: 9);
    }

    [Fact]
    public void FieldOrder_split_that_takes_the_whole_army_is_no_split()
    {
        var army = StandingWith([new UnitStack(UnitType.Spearman, 10)], [new UnitStack(UnitType.Spearman, 8)], provisions: 80);

        // Listed in two lines that add up to everything.
        var result = Army.PlanFieldOrder(
            army, [], Beyond, Home, ArrivedAt(army), AllGrass(), isPremium: false,
            requestedUnits: [new UnitStack(UnitType.Spearman, 5), new UnitStack(UnitType.Spearman, 3)],
            splitArmyId: Guid.CreateVersion7());

        Assert.True(result.Accepted, $"expected accept, got {result.Rejection}");
        Assert.Null(result.Remainder);
        Assert.Equal(army.Id, result.Army!.Id);
        Assert.Equal(8, Assert.Single(result.Army.Stacks).Count);
        Assert.Equal(army.ProvisionsAt(ArrivedAt(army)), result.Army.Provisions, precision: 9);
    }

    [Fact]
    public void FieldOrder_split_of_a_marching_army_is_rejected_but_the_whole_army_may_append()
    {
        var settlement = Found();
        var army = Dispatch(settlement, new HexCoord(10, 0), 80, requested: [new UnitStack(UnitType.Spearman, 8)]).Army!;
        var midway = MidwayOf(army);

        var split = Army.PlanFieldOrder(
            army, [], Beyond, Home, midway, AllGrass(), isPremium: true,
            requestedUnits: [new UnitStack(UnitType.Spearman, 3)], splitArmyId: Guid.CreateVersion7());
        Assert.Equal(FieldOrderRejection.SplitRequiresStandingArmy, split.Rejection);

        var whole = Army.PlanFieldOrder(
            army, [], Beyond, Home, midway, AllGrass(), isPremium: true,
            requestedUnits: [new UnitStack(UnitType.Spearman, 8)]);
        Assert.True(whole.Accepted, $"expected accept, got {whole.Rejection}");
        Assert.Null(whole.Remainder);
    }

    [Fact]
    public void FieldOrder_split_with_an_invalid_unit_selection_is_rejected()
    {
        var army = StandingWith([new UnitStack(UnitType.Spearman, 10)], [new UnitStack(UnitType.Spearman, 8)], provisions: 80);
        var now = ArrivedAt(army);

        FieldOrderRejection Order(IReadOnlyList<UnitStack> units) => Army.PlanFieldOrder(
            army, [], Beyond, Home, now, AllGrass(), isPremium: true, requestedUnits: units).Rejection;

        Assert.Equal(FieldOrderRejection.InvalidUnitSelection, Order([new UnitStack(UnitType.Spearman, 9)]));
        Assert.Equal(FieldOrderRejection.InvalidUnitSelection, Order([new UnitStack(UnitType.Axeman, 1)]));
        Assert.Equal(FieldOrderRejection.InvalidUnitSelection, Order([new UnitStack((UnitType)999, 1)]));
        Assert.Equal(FieldOrderRejection.InvalidUnitSelection, Order([new UnitStack(UnitType.Spearman, 0)]));
        Assert.Equal(FieldOrderRejection.InvalidUnitSelection, Order([]));
    }

    [Fact]
    public void FieldOrder_split_is_checked_against_the_leaving_partss_own_food_for_the_round_trip()
    {
        // The provisioner carries the food; a catapult carries none of its own (food capacity 0) but burns 1.5 an hour. A far
        // target the whole army can afford on the provisioner's food is out of reach for the catapult alone.
        var army = StandingWith(
            [new UnitStack(UnitType.Provisioner, 1), new UnitStack(UnitType.Catapult, 1)],
            [new UnitStack(UnitType.Provisioner, 1), new UnitStack(UnitType.Catapult, 1)], provisions: 100);
        var now = ArrivedAt(army);
        var far = new HexCoord(30, 0);

        var whole = Army.PlanFieldOrder(army, [], far, Home, now, AllGrass(), isPremium: false);
        Assert.True(whole.Accepted, $"the whole army can afford it, got {whole.Rejection}");

        var split = Army.PlanFieldOrder(
            army, [], far, Home, now, AllGrass(), isPremium: false,
            requestedUnits: [new UnitStack(UnitType.Catapult, 1)], splitArmyId: Guid.CreateVersion7());
        Assert.Equal(FieldOrderRejection.InsufficientProvisionsForRoundTrip, split.Rejection);
    }

    // Fleets: a fleet stands at sea hex (5,0) of the Strait (sea in columns 3-8, grass either side); the dockyard home is (3,0).

    private static Terrain Strait(HexCoord c) => c.Q is >= 3 and <= 8 ? Terrain.Sea : Terrain.Grass;

    private static readonly HexCoord Dock = new(3, 0);
    private static readonly HexCoord CoastalTarget = new(9, 0);

    private static Army StandingFleet(IReadOnlyList<UnitStack> stacks, double provisions = 200)
    {
        var path = new[] { Dock, new HexCoord(4, 0), new HexCoord(5, 0) };
        var hours = new[] { 0.0, 1.0, 2.0 };
        var upkeep = stacks.Sum(s => UnitCatalogue.Get(s.Type).UpkeepPerHour * s.Count);
        var movement = Bjarnoy.Domain.Movement.Movement.Create(
            T0, path, hours, hours, path.Reverse().ToArray(), hours, hours, provisions, upkeep);
        return new Army
        {
            Id = Guid.CreateVersion7(),
            SettlementId = Guid.CreateVersion7(),
            HomeSpot = new HexCoord(0, 0),
            Stacks = stacks,
            Provisions = provisions,
            Location = new ArmyLocation.InTransit(movement),
        };
    }

    [Fact]
    public void FieldOrder_fleet_attack_sails_to_the_shore_building_and_needs_one_on_the_shore()
    {
        var fleet = StandingFleet([new UnitStack(UnitType.Karve, 2)]);
        var now = ArrivedAt(fleet);
        var target = Guid.CreateVersion7();

        FieldOrderResult Attack(HexCoord? building) => Army.PlanFieldOrder(
            fleet, [], CoastalTarget, Dock, now, Strait, isPremium: false,
            mission: ArmyMission.Attack, targetSettlementId: target, targetBuildingCoord: building,
            targetClaimDiscs: [(CoastalTarget, 3)]);

        var accepted = Attack(CoastalTarget);
        Assert.True(accepted.Accepted, $"expected accept, got {accepted.Rejection}");
        Assert.Equal(CoastalTarget, MovementOf(accepted.Army!).Path[^1]);
        Assert.Equal(CoastalTarget, accepted.Army!.TargetBuildingCoord);

        Assert.Equal(FieldOrderRejection.FleetTargetBuildingRequired, Attack(null).Rejection);
        // (11,0) lies inside the claim but is neither shoreline nor sea.
        Assert.Equal(FieldOrderRejection.FleetTargetBuildingNotOnShore, Attack(new HexCoord(11, 0)).Rejection);
    }

    [Fact]
    public void FieldOrder_fleet_hunt_needs_a_water_camp()
    {
        var fleet = StandingFleet([new UnitStack(UnitType.Karve, 2)]);
        var now = ArrivedAt(fleet);

        var onLand = Army.PlanFieldOrder(
            fleet, [], new HexCoord(7, 0), Dock, now, Strait, isPremium: true,
            mission: ArmyMission.Hunt, targetCampCoord: new HexCoord(7, 0), targetCampIsWater: false);
        Assert.Equal(FieldOrderRejection.HuntRequiresLandUnits, onLand.Rejection);

        // A sand camp is hunted with land troops aboard only; a fleet with none is refused.
        var onSand = Army.PlanFieldOrder(
            fleet, [], new HexCoord(7, 0), Dock, now, Strait, isPremium: true,
            mission: ArmyMission.Hunt, targetCampCoord: new HexCoord(7, 0), targetCampIsSand: true);
        Assert.Equal(FieldOrderRejection.HuntRequiresLandUnits, onSand.Rejection);

        var atSea = Army.PlanFieldOrder(
            fleet, [], new HexCoord(7, 0), Dock, now, Strait, isPremium: true,
            mission: ArmyMission.Hunt, targetCampCoord: new HexCoord(7, 0), targetCampIsWater: true);
        Assert.True(atSea.Accepted, $"expected accept, got {atSea.Rejection}");
    }

    [Fact]
    public void FieldOrder_fleet_split_needs_ship_slots_for_the_passengers_of_both_parts()
    {
        // 2 karves (20 slots) carrying 12 spearmen (1 slot each) and 4 axemen (2 slots each): 20 slots used.
        var fleet = StandingFleet(
            [new UnitStack(UnitType.Karve, 2), new UnitStack(UnitType.Spearman, 12), new UnitStack(UnitType.Axeman, 4)]);
        var now = ArrivedAt(fleet);
        var move = new HexCoord(7, 0);

        FieldOrderResult Split(params UnitStack[] leaving) => Army.PlanFieldOrder(
            fleet, [], move, Dock, now, Strait, isPremium: true,
            requestedUnits: leaving, splitArmyId: Guid.CreateVersion7());

        // One karve with 10 slots of passengers each: fits both ways.
        var fits = Split(new UnitStack(UnitType.Karve, 1), new UnitStack(UnitType.Spearman, 6), new UnitStack(UnitType.Axeman, 2));
        Assert.True(fits.Accepted, $"expected accept, got {fits.Rejection}");
        Assert.True(fits.Army!.IsFleet);
        Assert.True(fits.Remainder!.IsFleet);

        // The leaving karve would carry 12 slots, the other part 8: the leaving part is over.
        Assert.Equal(
            FieldOrderRejection.InsufficientShipCapacity,
            Split(new UnitStack(UnitType.Karve, 1), new UnitStack(UnitType.Spearman, 12)).Rejection);

        // The part that stays is over its one ship's slots.
        Assert.Equal(
            FieldOrderRejection.InsufficientShipCapacity,
            Split(new UnitStack(UnitType.Karve, 1)).Rejection);

        // Troops without a ship cannot leave a fleet standing at sea.
        Assert.Equal(
            FieldOrderRejection.InsufficientShipCapacity,
            Split(new UnitStack(UnitType.Spearman, 4)).Rejection);
    }
}
