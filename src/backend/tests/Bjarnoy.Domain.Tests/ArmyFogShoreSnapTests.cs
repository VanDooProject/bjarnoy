using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using static Bjarnoy.Domain.Tests.ArmyFieldRetreatTests;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// A hex the player never explored that is off-terrain for the unit kind (water for a land army, land for a fleet) is moved to the
/// nearest hex the unit can stand on instead of being refused: every waypoint, and the destination of a plain Move
/// (<see cref="Army.FogShoreSnapRadius"/>). Explored hexes keep the ordinary rejection.
/// </summary>
public sealed class ArmyFogShoreSnapTests
{
    private static readonly Func<HexCoord, bool> Unexplored = _ => true;
    private static readonly Func<HexCoord, bool> Explored = _ => false;

    private static Settlement Found(IReadOnlyList<UnitStack>? garrison = null)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 5)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Home,
            Buildings = [new PlacedBuilding(Home, BuildingType.Longhouse, 5)],
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 1_000_000, Stone: 1_000_000, Food: 1_000_000, Iron: 1_000_000),
                production, capacity, T0),
        }.WithGarrison(garrison ?? [new UnitStack(UnitType.Spearman, 1000), new UnitStack(UnitType.Karve, 500)]);
    }

    private static DispatchDecision Dispatch(
        Func<HexCoord, Terrain> terrain, HexCoord destination, IReadOnlyList<HexCoord> waypoints, Func<HexCoord, bool>? isUnexplored,
        bool fleet = false, ArmyMission mission = ArmyMission.Move, Guid? targetSettlementId = null) =>
        TestArmy.PlanDispatch(
            Found(), fleet ? [new UnitStack(UnitType.Karve, 4)] : [new UnitStack(UnitType.Spearman, 20)], 480, waypoints, destination,
            T0, Guid.CreateVersion7(), terrain, mission, targetSettlementId, isUnexplored: isUnexplored, isPremium: true);

    /// <summary>The independent answer: every traversable hex within the radius, nearest first, then closest to the previous stop, then Q, then R.</summary>
    private static HexCoord Expected(HexCoord hex, HexCoord previous, Func<HexCoord, Terrain> terrain, bool land) =>
        hex.WithinRadius(Army.FogShoreSnapRadius)
            .Where(c => terrain(c).IsTraversable(land))
            .OrderBy(c => HexCoord.Distance(c, hex))
            .ThenBy(c => HexCoord.Distance(c, previous))
            .ThenBy(c => c.Q)
            .ThenBy(c => c.R)
            .First();

    private static IReadOnlyList<HexCoord> PathOf(DispatchDecision decision) => ((ArmyLocation.InTransit)decision.Army!.Location).Movement.Path;

    private static void AssertNoRepeatedHex(IReadOnlyList<HexCoord> path)
    {
        for (var i = 1; i < path.Count; i++)
        {
            Assert.NotEqual(path[i - 1], path[i]);
        }
    }

    // Land for q <= 10, open sea beyond.
    private static Terrain WestCoast(HexCoord c) => c.Q <= 10 ? Terrain.Grass : Terrain.Sea;

    [Fact]
    public void A_land_waypoint_on_unexplored_water_snaps_to_the_nearest_shore_and_the_path_goes_through_it()
    {
        var waypoint = new HexCoord(14, 2);
        var snapped = Expected(waypoint, Home, WestCoast, land: true);
        Assert.Equal(4, HexCoord.Distance(snapped, waypoint));

        var decision = Dispatch(WestCoast, new HexCoord(3, 0), [waypoint], Unexplored);

        Assert.True(decision.Accepted, decision.Rejection.ToString());
        var path = PathOf(decision);
        Assert.Contains(snapped, path);
        Assert.DoesNotContain(waypoint, path);
        Assert.All(path, hex => Assert.True(WestCoast(hex).IsLand()));
        Assert.Equal(new HexCoord(3, 0), path[^1]);
        AssertNoRepeatedHex(path);
    }

    [Fact]
    public void A_land_waypoint_on_explored_water_is_still_rejected()
    {
        var decision = Dispatch(WestCoast, new HexCoord(3, 0), [new HexCoord(14, 2)], Explored);

        Assert.Equal(DispatchRejection.WaypointNotLand, decision.Rejection);
    }

    [Fact]
    public void Without_an_explored_predicate_everything_counts_as_explored()
    {
        var decision = Dispatch(WestCoast, new HexCoord(3, 0), [new HexCoord(14, 2)], isUnexplored: null);

        Assert.Equal(DispatchRejection.WaypointNotLand, decision.Rejection);
    }

    [Fact]
    public void An_explored_waypoint_on_land_is_not_moved_even_when_the_predicate_says_unexplored()
    {
        var waypoint = new HexCoord(8, 3);

        var decision = Dispatch(WestCoast, new HexCoord(3, 0), [waypoint], Unexplored);

        Assert.True(decision.Accepted, decision.Rejection.ToString());
        Assert.Contains(waypoint, PathOf(decision));
    }

    [Fact]
    public void A_fleet_waypoint_on_unexplored_land_snaps_to_the_nearest_sea()
    {
        Terrain Island(HexCoord c) => c.Q is >= 20 and <= 22 && c.R is >= -5 and <= 5 ? Terrain.Grass : Terrain.Sea;
        var waypoint = new HexCoord(21, 0);
        var snapped = Expected(waypoint, Home, Island, land: false);

        var decision = Dispatch(Island, new HexCoord(0, 12), [waypoint], Unexplored, fleet: true);

        Assert.True(decision.Accepted, decision.Rejection.ToString());
        var path = PathOf(decision);
        Assert.Contains(snapped, path);
        Assert.All(path, hex => Assert.Equal(Terrain.Sea, Island(hex)));
        AssertNoRepeatedHex(path);
    }

    [Fact]
    public void A_fleet_waypoint_on_explored_land_is_still_rejected()
    {
        Terrain Island(HexCoord c) => c.Q is >= 20 and <= 22 && c.R is >= -5 and <= 5 ? Terrain.Grass : Terrain.Sea;

        var decision = Dispatch(Island, new HexCoord(0, 12), [new HexCoord(21, 0)], Explored, fleet: true);

        Assert.Equal(DispatchRejection.WaypointNotSea, decision.Rejection);
    }

    [Fact]
    public void A_move_destination_on_unexplored_water_snaps_to_the_shore_and_the_way_home_starts_there()
    {
        var destination = new HexCoord(15, 1);
        var snapped = Expected(destination, Home, WestCoast, land: true);

        var decision = Dispatch(WestCoast, destination, [], Unexplored);

        Assert.True(decision.Accepted, decision.Rejection.ToString());
        var movement = ((ArmyLocation.InTransit)decision.Army!.Location).Movement;
        Assert.Equal(snapped, movement.Path[^1]);
        Assert.Equal(snapped, movement.ReturnPath[0]);
        Assert.Equal(Home, movement.ReturnPath[^1]);
    }

    [Fact]
    public void A_move_destination_on_explored_water_is_still_rejected()
    {
        var decision = Dispatch(WestCoast, new HexCoord(15, 1), [], Explored);

        Assert.Equal(DispatchRejection.DestinationNotLand, decision.Rejection);
    }

    [Fact]
    public void A_fleet_move_destination_on_unexplored_land_snaps_to_the_nearest_sea()
    {
        Terrain Island(HexCoord c) => c.Q is >= 20 and <= 22 && c.R is >= -5 and <= 5 ? Terrain.Grass : Terrain.Sea;
        var destination = new HexCoord(21, 0);

        var decision = Dispatch(Island, destination, [], Unexplored, fleet: true);

        Assert.True(decision.Accepted, decision.Rejection.ToString());
        Assert.Equal(Expected(destination, Home, Island, land: false), PathOf(decision)[^1]);
    }

    [Fact]
    public void An_attack_destination_is_never_snapped()
    {
        var decision = Dispatch(WestCoast, new HexCoord(15, 1), [], Unexplored, mission: ArmyMission.Attack, targetSettlementId: Guid.CreateVersion7());

        Assert.Equal(DispatchRejection.DestinationNotLand, decision.Rejection);
    }

    [Fact]
    public void Nothing_to_stand_on_within_the_snap_radius_keeps_the_rejection()
    {
        // The only land is the strip q <= 0; a click 51 hexes out has none within 50, one 50 out reaches it.
        Terrain Strip0(HexCoord c) => c.Q <= 0 ? Terrain.Grass : Terrain.Sea;

        var tooFar = Dispatch(Strip0, new HexCoord(0, 5), [new HexCoord(51, 0)], Unexplored);
        var inReach = Dispatch(Strip0, new HexCoord(0, 5), [new HexCoord(50, 0)], Unexplored);

        Assert.Equal(DispatchRejection.WaypointNotLand, tooFar.Rejection);
        Assert.True(inReach.Accepted, inReach.Rejection.ToString());
    }

    [Fact]
    public void Nothing_to_stand_on_within_the_snap_radius_keeps_the_destination_rejection()
    {
        Terrain Strip0(HexCoord c) => c.Q <= 0 ? Terrain.Grass : Terrain.Sea;

        var decision = Dispatch(Strip0, new HexCoord(51, 0), [], Unexplored);

        Assert.Equal(DispatchRejection.DestinationNotLand, decision.Rejection);
    }

    [Fact]
    public void A_snapped_hex_that_cannot_be_reached_fails_with_the_ordinary_route_rejection()
    {
        // The only land within reach of the click is a separate islet the army cannot walk to.
        var islet = new HexCoord(30, 0).WithinRadius(1).ToHashSet();
        Terrain Terrain(HexCoord c) => c.Q <= 0 || islet.Contains(c) ? Bjarnoy.Domain.World.Terrain.Grass : Bjarnoy.Domain.World.Terrain.Sea;

        var decision = Dispatch(Terrain, new HexCoord(0, 3), [new HexCoord(33, 0)], Unexplored);

        Assert.Equal(DispatchRejection.UnreachableLeg, decision.Rejection);
    }

    [Fact]
    public void Equally_near_shores_snap_to_the_one_closest_to_the_previous_stop_then_by_q_then_by_r()
    {
        // Land at q <= 0 (west) and at q >= 20 (east), joined by land to the south (r >= 12). A click on (10, 0) is 10 from both; the west one is
        // nearer the army's start, and (0, 0) is the nearest of those to it.
        Terrain TwoCoasts(HexCoord c) => c.Q <= 0 || c.Q >= 20 || c.R >= 12 ? Terrain.Grass : Terrain.Sea;
        var click = new HexCoord(10, 0);
        Assert.Equal(Home, Expected(click, Home, TwoCoasts, land: true));

        var fromHome = Dispatch(TwoCoasts, new HexCoord(0, 5), [click], Unexplored);
        Assert.True(fromHome.Accepted, fromHome.Rejection.ToString());
        Assert.Equal(Home, PathOf(fromHome)[0]);

        // After a stop on the east coast the same click snaps east: previous stop (20, 0), and the click's east shore includes (20, 0) itself.
        var east = new HexCoord(20, 0);
        var afterEast = Dispatch(TwoCoasts, new HexCoord(25, 0), [east, click], Unexplored);
        Assert.True(afterEast.Accepted, afterEast.Rejection.ToString());
        Assert.Equal(east, Expected(click, east, TwoCoasts, land: true));
        var path = PathOf(afterEast);
        Assert.DoesNotContain(click, path);
        AssertNoRepeatedHex(path);
    }

    [Fact]
    public void A_snapped_waypoint_equal_to_the_previous_stop_adds_no_hex_and_no_duplicate()
    {
        // Click on (10, 0) snaps to the army's own start (0, 0): a zero-length leg.
        Terrain TwoCoasts(HexCoord c) => c.Q <= 0 || c.Q >= 20 || c.R >= 12 ? Terrain.Grass : Terrain.Sea;
        var direct = Dispatch(TwoCoasts, new HexCoord(0, 5), [], Unexplored);

        var viaSnap = Dispatch(TwoCoasts, new HexCoord(0, 5), [new HexCoord(10, 0)], Unexplored);

        Assert.True(viaSnap.Accepted, viaSnap.Rejection.ToString());
        Assert.Equal(PathOf(direct), PathOf(viaSnap));
    }

    [Fact]
    public void Gathered_dispatch_snaps_a_waypoint_on_unexplored_water_too()
    {
        var waypoint = new HexCoord(14, 2);
        var settlement = Found([new UnitStack(UnitType.Spearman, 10)]);

        var decision = Army.PlanGatheredDispatch(
            settlement, [(Home, [new UnitStack(UnitType.Spearman, 5)]), (Home, [new UnitStack(UnitType.Spearman, 5)])],
            50_000, [waypoint], new HexCoord(3, 0), T0, Guid.CreateVersion7, WestCoast, isPremium: true, isUnexplored: Unexplored);

        // Two groups at the same spot are not a valid gathering; the point is that the stop rule runs before it matters.
        Assert.NotEqual(DispatchRejection.WaypointNotLand, decision.Rejection);
    }

    [Fact]
    public void A_field_order_waypoint_on_unexplored_water_snaps_to_the_nearest_shore()
    {
        // Strip is land at q 0..8, r -3..3. (4, 5) is water: of the two shore hexes 2 away, (5, 3) is nearer the end of the running leg (8, 0).
        var army = Marching(provisions: 4000);
        var waypoint = new HexCoord(4, 5);
        var now = T0.AddHours(1);
        Assert.Equal(new HexCoord(5, 3), Expected(waypoint, Far, Strip, land: true));

        var result = Army.PlanFieldOrder(army, [waypoint], new HexCoord(2, 0), Home, now, Strip, isPremium: true, isUnexplored: Unexplored);

        Assert.True(result.Accepted, result.Rejection.ToString());
        var path = MovementOf(result.Army!).Path;
        Assert.Contains(new HexCoord(5, 3), path);
        Assert.DoesNotContain(waypoint, path);
        Assert.Equal(new HexCoord(2, 0), path[^1]);
        AssertNoRepeatedHex(path);
    }

    [Fact]
    public void A_field_order_waypoint_on_explored_water_is_still_rejected()
    {
        var result = Army.PlanFieldOrder(
            Marching(provisions: 4000), [new HexCoord(4, 5)], new HexCoord(2, 0), Home, T0.AddHours(1), Strip, isPremium: true, isUnexplored: Explored);

        Assert.Equal(FieldOrderRejection.WaypointNotLand, result.Rejection);
    }

    [Fact]
    public void A_field_order_waypoint_that_snaps_onto_the_end_of_the_running_leg_leaves_no_duplicate_hex()
    {
        // (12, 0) snaps to (8, 0), the end of the running leg itself.
        var army = Marching(provisions: 4000);

        var result = Army.PlanFieldOrder(
            army, [new HexCoord(12, 0)], new HexCoord(2, 0), Home, T0.AddHours(1), Strip, isPremium: true, isUnexplored: Unexplored);

        Assert.True(result.Accepted, result.Rejection.ToString());
        var path = MovementOf(result.Army!).Path;
        AssertNoRepeatedHex(path);
        Assert.Equal(MovementOf(army).Path, path.Take(MovementOf(army).Path.Count));
    }

    [Fact]
    public void A_field_order_move_destination_on_unexplored_water_snaps_to_the_shore_and_the_way_home_starts_there()
    {
        var army = Marching(provisions: 4000);
        var destination = new HexCoord(4, 5);

        var result = Army.PlanFieldOrder(army, [], destination, Home, T0.AddHours(1), Strip, isPremium: true, isUnexplored: Unexplored);

        Assert.True(result.Accepted, result.Rejection.ToString());
        var movement = MovementOf(result.Army!);
        Assert.Equal(new HexCoord(5, 3), movement.Path[^1]);
        Assert.Equal(new HexCoord(5, 3), movement.ReturnPath[0]);
    }

    [Fact]
    public void A_field_order_move_destination_on_explored_water_is_still_rejected()
    {
        var result = Army.PlanFieldOrder(
            Marching(provisions: 4000), [], new HexCoord(4, 5), Home, T0.AddHours(1), Strip, isPremium: true, isUnexplored: Explored);

        Assert.Equal(FieldOrderRejection.DestinationNotLand, result.Rejection);
    }
}
