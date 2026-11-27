using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// An army put together from the units of several garrison spots (<c>docs/design/garrison.md</c>, "Training, sending out, losing a spot"):
/// each group leaves its spot at once as an army of its own and walks to the first hex their routes share; the groups that got there
/// wait until the slowest has arrived and then go on as one.
/// </summary>
public class ArmyGatheringTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);

    private static Terrain Grass(HexCoord _) => Terrain.Grass;

    // Sea in the middle columns, grass either side: docks stand on the water, the land beside them is column 2.
    private static Terrain Strait(HexCoord c) => c.Q is >= 3 and <= 8 ? Terrain.Sea : Terrain.Grass;

    private static UnitStack[] Spearmen(int count) => [new UnitStack(UnitType.Spearman, count)];

    private static Settlement Found(params (HexCoord At, BuildingType Type)[] extra)
    {
        const int longhouseLevel = 10;
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings =
            [
                new PlacedBuilding(Centre, BuildingType.Longhouse, longhouseLevel),
                .. extra.Select(e => new PlacedBuilding(e.At, e.Type, 1)),
            ],
            Resources = ResourcePool.Create(new ResourceAmounts(1_000_000, 1_000_000, 1_000_000, 1_000_000), production, capacity, T0),
        };
    }

    private static Settlement WithUnits(Settlement settlement, params (HexCoord Spot, UnitStack[] Units)[] garrison)
    {
        foreach (var (spot, units) in garrison)
        {
            settlement = settlement.WithGarrisonAt(spot, units);
        }

        return settlement;
    }

    private static GatheredDispatchDecision Send(
        Settlement settlement,
        double provisions,
        IReadOnlyList<HexCoord> waypoints,
        HexCoord destination,
        Func<HexCoord, Terrain> terrain,
        params (HexCoord Spot, UnitStack[] Units)[] groups) =>
        Send(settlement, provisions, waypoints, destination, terrain, HexPathfinder.MaxExpandedNodes, false, groups);

    private static GatheredDispatchDecision Send(
        Settlement settlement,
        double provisions,
        IReadOnlyList<HexCoord> waypoints,
        HexCoord destination,
        Func<HexCoord, Terrain> terrain,
        int routeSearchBudget,
        bool isPremium,
        params (HexCoord Spot, UnitStack[] Units)[] groups) =>
        Army.PlanGatheredDispatch(
            settlement, [.. groups.Select(g => (g.Spot, (IReadOnlyList<UnitStack>)g.Units))], provisions, waypoints, destination, T0,
            Guid.CreateVersion7, terrain, routeSearchBudget: routeSearchBudget, isPremium: isPremium);

    private static Bjarnoy.Domain.Movement.Movement MovementOf(Army army) => ((ArmyLocation.InTransit)army.Location).Movement;

    private static Army GroupAt(GatheredDispatchDecision decision, HexCoord spot) => decision.Armies!.Single(a => a.HomeSpot == spot);

    private static double Hours(IReadOnlyList<HexCoord> path, double pace, Func<HexCoord, Terrain> terrain, bool land = true) =>
        HexPathfinder.CumulativeHours(path, terrain, pace, land)[^1];

    private static IReadOnlyList<HexCoord> Route(HexCoord from, HexCoord to, Func<HexCoord, Terrain> terrain, bool land = true) =>
        HexPathfinder.FindPath(from, to, terrain, land)!;

    [Fact]
    public void The_groups_meet_on_the_first_hex_of_the_longest_route_that_all_routes_share()
    {
        // The tower stands on the longhouse group's straight way to the target, so that is where the routes first share a hex.
        var tower = new HexCoord(3, 0);
        var target = new HexCoord(10, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));

        var decision = Send(settlement, 100, [], target, Grass, (Centre, Spearmen(10)), (tower, Spearmen(10)));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var gathering = Assert.Single(decision.Gatherings!);
        Assert.Equal(tower, gathering.Hex);
        Assert.Equal(tower, MovementOf(GroupAt(decision, Centre)).Path[^1]);
        Assert.Equal([tower], MovementOf(GroupAt(decision, tower)).Path);
        Assert.All(decision.Armies!, a => Assert.Equal(gathering.Id, a.GatheringId));
    }

    [Theory]
    [InlineData(5, false, true)]
    [InlineData(6, false, false)]
    [InlineData(10, true, true)]
    [InlineData(11, true, false)]
    public void A_gathered_dispatch_takes_at_most_five_waypoints_or_ten_with_premium(int count, bool isPremium, bool accepted)
    {
        var tower = new HexCoord(3, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));
        List<HexCoord> waypoints = [.. Enumerable.Range(1, count).Select(i => new HexCoord(3 + i, 0))];

        var decision = Send(
            settlement, 200, waypoints, new HexCoord(count + 4, 0), Grass, HexPathfinder.MaxExpandedNodes, isPremium,
            (Centre, Spearmen(10)), (tower, Spearmen(10)));

        Assert.True(accepted == decision.Accepted, $"expected accepted={accepted}, got {decision.Rejection}");
        if (!accepted)
        {
            Assert.Equal(DispatchRejection.TooManyWaypoints, decision.Rejection);
        }
    }

    [Fact]
    public void Every_route_search_of_a_gathered_dispatch_draws_from_one_budget()
    {
        var tower = new HexCoord(3, 0);
        var target = new HexCoord(10, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var longest = HexPathfinder.Search(Centre, target, Grass, isLandUnit: true).Expanded;

        // Enough for the longest single search, not for all the searches the order makes together.
        var decision = Send(
            settlement, 100, [], target, Grass, longest, false, (Centre, Spearmen(10)), (tower, Spearmen(10)));

        Assert.Equal(DispatchRejection.RouteTooLong, decision.Rejection);
        Assert.True(Send(settlement, 100, [], target, Grass, (Centre, Spearmen(10)), (tower, Spearmen(10))).Accepted);
    }

    [Fact]
    public void Routes_that_share_only_the_target_meet_on_the_hex_just_before_it()
    {
        // From (0,0) and (0,10) the straight ways to (10,0) only meet at the target. The slower longhouse group has the longer route.
        var tower = new HexCoord(0, 10);
        var target = new HexCoord(10, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, [new UnitStack(UnitType.Thrall, 10)]));

        var decision = Send(settlement, 100, [], target, Grass, (Centre, Spearmen(10)), (tower, [new UnitStack(UnitType.Thrall, 10)]));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(new HexCoord(9, 0), Assert.Single(decision.Gatherings!).Hex);
        Assert.Equal([target], Assert.Single(decision.Gatherings!).Stops);
    }

    [Fact]
    public void A_waypoint_the_routes_meet_on_is_the_meeting_point()
    {
        var tower = new HexCoord(0, 8);
        var waypoint = new HexCoord(8, 0);
        var target = new HexCoord(14, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));

        var decision = Send(settlement, 100, [waypoint], target, Grass, (Centre, Spearmen(10)), (tower, Spearmen(10)));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var gathering = Assert.Single(decision.Gatherings!);
        Assert.Equal(waypoint, gathering.Hex);
        Assert.Equal([target], gathering.Stops);
    }

    [Fact]
    public void The_army_leaves_when_the_slowest_group_has_arrived_and_the_time_is_fixed_at_dispatch()
    {
        // Catapults crawl: the tower group is the slowest to the waypoint although both routes are 8 hexes.
        var tower = new HexCoord(0, 8);
        var waypoint = new HexCoord(8, 0);
        var target = new HexCoord(14, 0);
        UnitStack[] slow = [new UnitStack(UnitType.Catapult, 2), new UnitStack(UnitType.Spearman, 10)];
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, slow));

        var decision = Send(settlement, 200, [waypoint], target, Grass, (Centre, Spearmen(10)), (tower, slow));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var slowestHours = Hours(Route(tower, waypoint, Grass), pace: 1.5, Grass);
        var fastHours = Hours(Route(Centre, waypoint, Grass), pace: 4, Grass);
        Assert.True(slowestHours > fastHours);
        Assert.Equal(T0 + TimeSpan.FromHours(slowestHours), Assert.Single(decision.Gatherings!).DepartAt);
    }

    [Fact]
    public void A_group_that_gets_there_first_stands_on_the_meeting_hex_until_the_army_leaves_whatever_its_food_would_allow()
    {
        var tower = new HexCoord(0, 8);
        var waypoint = new HexCoord(8, 0);
        var target = new HexCoord(14, 0);
        UnitStack[] slow = [new UnitStack(UnitType.Catapult, 2), new UnitStack(UnitType.Spearman, 10)];
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, slow));

        var decision = Send(settlement, 200, [waypoint], target, Grass, (Centre, Spearmen(10)), (tower, slow));

        var departAt = Assert.Single(decision.Gatherings!).DepartAt;
        Assert.All(decision.Armies!, a => Assert.Equal(departAt, a.GatherDepartAt));
        Assert.True(MovementOf(GroupAt(decision, Centre)).ArrivesAt < departAt);

        // Even with food that would turn it around long before, the early group stands until the departure and no longer after it.
        var early = GroupAt(decision, Centre);
        var hungry = early with
        {
            Location = new ArmyLocation.InTransit(MovementOf(early) with { TurnAroundAt = MovementOf(early).ArrivesAt }),
        };
        Assert.False(hungry.SettleTo(departAt).Changed);
        var after = hungry.SettleTo(departAt.AddMinutes(1));
        Assert.True(after.Changed);
        Assert.Null(after.Army.GatheringId);
        Assert.Null(after.Army.GatherDepartAt);
    }

    [Fact]
    public void The_groups_meeting_just_before_the_target_never_walk_through_it()
    {
        var tower = new HexCoord(0, 10);
        var target = new HexCoord(10, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, [new UnitStack(UnitType.Thrall, 10)]));

        var decision = Send(settlement, 100, [], target, Grass, (Centre, Spearmen(10)), (tower, [new UnitStack(UnitType.Thrall, 10)]));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.All(decision.Armies!, a => Assert.DoesNotContain(target, MovementOf(a).Path));
    }

    [Fact]
    public void A_founding_army_without_its_settlers_does_not_go_on_and_neither_does_a_camp_army_without_its_builders()
    {
        var tower = new HexCoord(3, 0);
        var target = new HexCoord(10, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var decision = Send(settlement, 100, [], target, Grass, (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var gathering = Assert.Single(decision.Gatherings!);
        var escort = Army.MergeGatheringMembers([GroupAt(decision, Centre), GroupAt(decision, tower)], gathering.DepartAt);

        Assert.NotNull(Army.PlanGatheringDeparture(escort, gathering, gathering.DepartAt, Grass));
        Assert.Null(Army.PlanGatheringDeparture(escort, gathering with { Mission = ArmyMission.Found }, gathering.DepartAt, Grass));
        Assert.Null(Army.PlanGatheringDeparture(escort, gathering with { Mission = ArmyMission.SetUpCamp }, gathering.DepartAt, Grass));

        var settlers = escort with { Stacks = [.. escort.Stacks, new UnitStack(UnitType.Settler, Bjarnoy.Domain.Settlers.Founding.RequiredSettlers)] };
        Assert.NotNull(Army.PlanGatheringDeparture(settlers, gathering with { Mission = ArmyMission.Found }, gathering.DepartAt, Grass));
    }

    [Fact]
    public void Merging_ships_with_more_passengers_than_slots_leaves_the_overflow_behind()
    {
        var dock = new HexCoord(3, 0);
        UnitStack[] ships = [new UnitStack(UnitType.Karve, 1)];
        var settlement = WithUnits(Found((dock, BuildingType.Harbour)), (Centre, Spearmen(8)), (dock, ships));
        var decision = Send(settlement, 100, [], new HexCoord(6, 0), Strait, (Centre, Spearmen(8)), (dock, ships));
        var group = GroupAt(decision, Centre);
        var crowded = group with { Stacks = [new UnitStack(UnitType.Spearman, 15)] };

        var merged = Army.MergeGatheringMembers([crowded, GroupAt(decision, dock)], T0);

        Assert.Equal(ShipCargo.SlotsOffered(merged.Stacks), ShipCargo.SlotsNeeded(ShipCargo.Passengers(merged.Stacks)));
        Assert.Equal(10, merged.Stacks.Single(x => x.Type == UnitType.Spearman).Count);
    }

    [Fact]
    public void The_walk_and_the_wait_count_in_the_food_check_exactly()
    {
        var tower = new HexCoord(3, 0);
        var target = new HexCoord(10, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));

        // Every unit eats until the army leaves the tower, then on the way to the target, then on the way home: the way out walked
        // backwards (home is the tower, where they met).
        var upkeep = 20 * UnitCatalogue.Get(UnitType.Spearman).UpkeepPerHour;
        var wait = Hours(Route(Centre, tower, Grass), pace: 4, Grass);
        var onward = Hours(Route(tower, target, Grass), pace: 4, Grass);
        var needed = (upkeep * wait) + ((onward + onward) * upkeep);

        var enough = Send(settlement, needed + 1e-9, [], target, Grass, (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var oneShort = Send(settlement, needed - 0.01, [], target, Grass, (Centre, Spearmen(10)), (tower, Spearmen(10)));

        Assert.True(enough.Accepted, $"expected accept, got {enough.Rejection}");
        Assert.Equal(DispatchRejection.InsufficientProvisionsForRoundTrip, oneShort.Rejection);
    }

    [Fact]
    public void The_provisions_are_split_by_upkeep_share_and_all_of_them_are_loaded()
    {
        var tower = new HexCoord(3, 0);
        var target = new HexCoord(10, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(20)));

        var decision = Send(settlement, 300, [], target, Grass, (Centre, Spearmen(10)), (tower, Spearmen(20)));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(100, GroupAt(decision, Centre).Provisions, 6);
        Assert.Equal(200, GroupAt(decision, tower).Provisions, 6);
        Assert.Equal(300, decision.Armies!.Sum(a => a.Provisions), 6);
        Assert.Equal(settlement.Resources.At(T0).Food - 300, decision.Settlement!.Resources.At(T0).Food, 3);
    }

    [Fact]
    public void A_groups_share_is_capped_at_what_it_carries_and_the_overflow_goes_to_the_others()
    {
        // Upkeep share alone would give the small tower group 98.8 of 240, but a bowman and a catapult carry only 40.
        var tower = new HexCoord(3, 0);
        var target = new HexCoord(10, 0);
        UnitStack[] small = [new UnitStack(UnitType.Bowman, 1), new UnitStack(UnitType.Catapult, 1)];
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, small));

        var decision = Send(settlement, 240, [], target, Grass, (Centre, Spearmen(10)), (tower, small));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(40, GroupAt(decision, tower).Provisions, 6);
        Assert.Equal(200, GroupAt(decision, Centre).Provisions, 6);
    }

    [Fact]
    public void A_group_whose_share_cannot_feed_it_until_the_army_leaves_is_refused()
    {
        // Catapults carry no food at all, so a tower group of catapults cannot eat through the wait however much the others carry.
        var tower = new HexCoord(3, 0);
        UnitStack[] catapults = [new UnitStack(UnitType.Catapult, 2)];
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, catapults));

        var decision = Send(settlement, 200, [], new HexCoord(10, 0), Grass, (Centre, Spearmen(10)), (tower, catapults));

        Assert.Equal(DispatchRejection.InsufficientProvisionsForRoundTrip, decision.Rejection);
    }

    [Fact]
    public void The_army_belongs_to_the_spot_nearest_the_meeting_hex_and_each_group_to_its_own_spot()
    {
        var tower = new HexCoord(3, 0);
        var farTower = new HexCoord(9, 0);
        var target = new HexCoord(10, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower), (farTower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));

        var decision = Send(settlement, 100, [], target, Grass, (Centre, Spearmen(10)), (tower, Spearmen(10)));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(tower, Assert.Single(decision.Gatherings!).HomeSpot);
        Assert.Equal(Centre, GroupAt(decision, Centre).HomeSpot);
        Assert.Equal(tower, GroupAt(decision, tower).HomeSpot);
        Assert.Equal(Centre, MovementOf(GroupAt(decision, Centre)).ReturnPath[^1]);
    }

    [Fact]
    public void The_units_leave_their_own_spots_and_the_food_is_paid_once()
    {
        var tower = new HexCoord(3, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));

        var decision = Send(settlement, 100, [], new HexCoord(10, 0), Grass, (Centre, Spearmen(4)), (tower, Spearmen(7)));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(6, decision.Settlement!.GarrisonAt(Centre).Single().Count);
        Assert.Equal(3, decision.Settlement.GarrisonAt(tower).Single().Count);
        Assert.Equal(settlement.Resources.At(T0).Food - 100, decision.Settlement.Resources.At(T0).Food, 3);
    }

    [Fact]
    public void Units_that_do_not_stand_at_the_spot_they_are_asked_from_are_refused()
    {
        var tower = new HexCoord(3, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(3)));

        var decision = Send(settlement, 100, [], new HexCoord(10, 0), Grass, (Centre, Spearmen(4)), (tower, Spearmen(4)));

        Assert.Equal(DispatchRejection.InsufficientGarrison, decision.Rejection);
    }

    [Fact]
    public void The_provisions_may_not_exceed_what_all_the_units_together_carry()
    {
        var tower = new HexCoord(3, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var capacity = 20 * UnitCatalogue.Get(UnitType.Spearman).FoodCarryCapacity;

        var tooMuch = Send(settlement, capacity + 1, [], new HexCoord(10, 0), Grass, (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var allOfIt = Send(settlement, capacity, [], new HexCoord(10, 0), Grass, (Centre, Spearmen(10)), (tower, Spearmen(10)));

        Assert.Equal(DispatchRejection.ProvisionsExceedCarryCapacity, tooMuch.Rejection);
        Assert.True(allOfIt.Accepted, $"expected accept, got {allOfIt.Rejection}");
    }

    [Fact]
    public void The_target_rules_hold_for_the_union_of_all_groups()
    {
        // A support target must be a spot that can hold every unit of the army, counted over all groups.
        var tower = new HexCoord(3, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));

        var decision = Army.PlanGatheredDispatch(
            settlement, [(Centre, Spearmen(10)), (tower, Spearmen(10))], 100, [], new HexCoord(10, 0), T0, Guid.CreateVersion7, Grass,
            ArmyMission.Support, Guid.CreateVersion7(), targetBuildingCoord: new HexCoord(10, 0), targetSpots: []);

        Assert.Equal(DispatchRejection.SupportSpotCannotHold, decision.Rejection);
    }

    [Fact]
    public void Passengers_walk_to_the_shore_beside_the_dock_and_board_there()
    {
        var dock = new HexCoord(3, 0);
        UnitStack[] ships = [new UnitStack(UnitType.Karve, 1)];
        var settlement = WithUnits(Found((dock, BuildingType.Harbour)), (Centre, Spearmen(5)), (dock, ships));

        var decision = Send(settlement, 100, [], new HexCoord(6, 0), Strait, (Centre, Spearmen(5)), (dock, ships));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var gathering = Assert.Single(decision.Gatherings!);
        Assert.Equal(dock, gathering.Hex);
        var shore = Assert.IsType<HexCoord>(gathering.BoardingHex);
        Assert.Contains(shore, dock.Neighbours());
        Assert.Equal(Terrain.Grass, Strait(shore));
        Assert.Equal(shore, MovementOf(GroupAt(decision, Centre)).Path[^1]);
        Assert.Equal([dock], MovementOf(GroupAt(decision, dock)).Path);
        Assert.Equal(T0 + TimeSpan.FromHours(MovementOf(GroupAt(decision, Centre)).CumulativeHours[^1]), gathering.DepartAt);
        Assert.Equal(dock, gathering.HomeSpot);
        Assert.All(decision.Armies!, a => Assert.Equal(gathering.Id, a.GatheringId));
    }

    [Fact]
    public void With_several_ship_groups_the_passengers_board_at_the_dock_they_reach_soonest_and_the_boarded_ships_join_the_others()
    {
        var near = new HexCoord(3, 0);
        var far = new HexCoord(3, 12);
        UnitStack[] ships = [new UnitStack(UnitType.Karve, 2)];
        var settlement = WithUnits(
            Found((near, BuildingType.Harbour), (far, BuildingType.Harbour)), (Centre, Spearmen(5)), (near, ships), (far, ships));

        var decision = Send(settlement, 200, [], new HexCoord(7, 6), Strait, (Centre, Spearmen(5)), (near, ships), (far, ships));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(2, decision.Gatherings!.Count);
        var boarding = decision.Gatherings.Single(g => g.ParentGatheringId is not null);
        var sea = decision.Gatherings.Single(g => g.ParentGatheringId is null);
        Assert.Equal(near, boarding.Hex);
        Assert.Equal(sea.Id, boarding.ParentGatheringId);
        Assert.Equal(boarding.Id, GroupAt(decision, near).GatheringId);
        Assert.Equal(boarding.Id, GroupAt(decision, Centre).GatheringId);
        Assert.Equal(sea.Id, GroupAt(decision, far).GatheringId);
        Assert.Equal([sea.Hex], boarding.Stops);
        Assert.True(sea.DepartAt >= boarding.DepartAt);
        Assert.Equal(Terrain.Sea, Strait(sea.Hex));
    }

    [Fact]
    public void The_dock_is_chosen_by_free_slots_before_the_walk()
    {
        // 12 spearmen need 12 slots: the near dock's single karve offers 10, the far dock's two offer 20.
        var near = new HexCoord(3, 0);
        var far = new HexCoord(3, 12);
        var settlement = WithUnits(
            Found((near, BuildingType.Harbour), (far, BuildingType.Harbour)),
            (Centre, Spearmen(12)), (near, [new UnitStack(UnitType.Karve, 1)]), (far, [new UnitStack(UnitType.Karve, 2)]));

        var decision = Send(
            settlement, 200, [], new HexCoord(7, 6), Strait,
            (Centre, Spearmen(12)), (near, [new UnitStack(UnitType.Karve, 1)]), (far, [new UnitStack(UnitType.Karve, 2)]));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(far, decision.Gatherings!.Single(g => g.ParentGatheringId is not null).Hex);
    }

    [Fact]
    public void Passengers_that_fit_on_no_single_dock_are_refused_even_when_all_ships_together_have_room()
    {
        var near = new HexCoord(3, 0);
        var far = new HexCoord(3, 12);
        UnitStack[] ships = [new UnitStack(UnitType.Karve, 1)];
        var settlement = WithUnits(
            Found((near, BuildingType.Harbour), (far, BuildingType.Harbour)), (Centre, Spearmen(15)), (near, ships), (far, ships));

        var decision = Send(settlement, 200, [], new HexCoord(7, 6), Strait, (Centre, Spearmen(15)), (near, ships), (far, ships));

        Assert.Equal(DispatchRejection.InsufficientShipCapacity, decision.Rejection);
    }

    [Fact]
    public void The_merged_army_leaves_the_meeting_hex_with_the_pace_of_the_units_that_arrived_and_all_their_food()
    {
        var tower = new HexCoord(3, 0);
        var target = new HexCoord(10, 0);
        UnitStack[] catapults = [new UnitStack(UnitType.Catapult, 2), new UnitStack(UnitType.Spearman, 10)];
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, catapults));
        var decision = Send(settlement, 200, [], target, Grass, (Centre, Spearmen(10)), (tower, catapults));
        var gathering = Assert.Single(decision.Gatherings!);

        var merged = Army.MergeGatheringMembers([GroupAt(decision, Centre), GroupAt(decision, tower)], gathering.DepartAt);
        var departed = Army.PlanGatheringDeparture(merged, gathering, gathering.DepartAt, Grass);

        Assert.NotNull(departed);
        var movement = MovementOf(departed!);
        Assert.Equal(gathering.Hex, movement.Path[0]);
        Assert.Equal(target, movement.Path[^1]);
        Assert.Equal(gathering.DepartAt, movement.DepartedAt);
        Assert.Equal(Hours(Route(tower, target, Grass), pace: 1.5, Grass), movement.CumulativeHours[^1], 6);
        Assert.Equal(20, departed!.Stacks.Single(s => s.Type == UnitType.Spearman).Count);
        Assert.Equal(2, departed.Stacks.Single(s => s.Type == UnitType.Catapult).Count);
        Assert.Equal(
            GroupAt(decision, Centre).ProvisionsAt(gathering.DepartAt) + GroupAt(decision, tower).ProvisionsAt(gathering.DepartAt),
            departed.Provisions, 6);
        Assert.Equal(gathering.HomeSpot, departed.HomeSpot);
        Assert.Null(departed.GatheringId);
    }

    [Fact]
    public void The_merged_army_carries_out_the_order_of_the_gathering()
    {
        var tower = new HexCoord(3, 0);
        var target = new HexCoord(10, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var hostId = Guid.CreateVersion7();
        IReadOnlyList<GarrisonSpot> hostSpots = [new GarrisonSpot(target, GarrisonSpotKind.Longhouse, [], true, false)];

        var decision = Army.PlanGatheredDispatch(
            settlement, [(Centre, Spearmen(10)), (tower, Spearmen(10))], 100, [], target, T0, Guid.CreateVersion7, Grass,
            ArmyMission.Support, hostId, targetBuildingCoord: target, targetSpots: hostSpots);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var gathering = Assert.Single(decision.Gatherings!);
        Assert.Equal(ArmyMission.Support, gathering.Mission);
        Assert.Equal(hostId, gathering.TargetSettlementId);
        Assert.Equal(target, gathering.TargetBuildingCoord);
        Assert.All(decision.Armies!, a => Assert.Equal(ArmyMission.Move, a.Mission));
    }

    [Fact]
    public void A_recalled_group_leaves_the_gathering_and_walks_home_alone()
    {
        var tower = new HexCoord(3, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var decision = Send(settlement, 100, [], new HexCoord(10, 0), Grass, (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var group = GroupAt(decision, Centre);

        var recalled = group.Recall(T0.AddMinutes(10), group.HomeSpot, Grass);

        Assert.NotNull(recalled);
        Assert.Null(recalled!.GatheringId);
        Assert.Null(recalled.GatherDepartAt);
        Assert.Equal(Centre, MovementOf(recalled).Path[^1]);
    }

    [Fact]
    public void A_group_that_loses_a_fight_leaves_the_gathering()
    {
        var tower = new HexCoord(3, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var decision = Send(settlement, 100, [], new HexCoord(10, 0), Grass, (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var group = GroupAt(decision, Centre);

        var retreating = group.ForceFieldRetreat(T0.AddMinutes(10), new HexCoord(1, 0), group.HomeSpot, Grass);

        Assert.Null(retreating.GatheringId);
    }

    [Fact]
    public void A_group_that_gets_a_field_order_leaves_the_gathering()
    {
        var tower = new HexCoord(3, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var decision = Send(settlement, 100, [], new HexCoord(10, 0), Grass, (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var standing = GroupAt(decision, tower);

        // The group that waits at the meeting hex is told to go somewhere else.
        var order = Army.PlanFieldOrder(standing, [], new HexCoord(3, 5), standing.HomeSpot, T0.AddMinutes(1), Grass, isPremium: true);

        Assert.True(order.Accepted, $"expected accept, got {order.Rejection}");
        Assert.Null(order.Army!.GatheringId);
    }

    [Fact]
    public void The_part_that_stays_after_a_split_keeps_the_gathering_and_the_part_that_leaves_does_not()
    {
        var tower = new HexCoord(3, 0);
        var settlement = WithUnits(Found((tower, BuildingType.Tower)), (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var decision = Send(settlement, 100, [], new HexCoord(10, 0), Grass, (Centre, Spearmen(10)), (tower, Spearmen(10)));
        var standing = GroupAt(decision, tower);

        var order = Army.PlanFieldOrder(
            standing, [], new HexCoord(3, 5), standing.HomeSpot, T0.AddMinutes(1), Grass, isPremium: true,
            requestedUnits: Spearmen(4), splitArmyId: Guid.CreateVersion7());

        Assert.True(order.Accepted, $"expected accept, got {order.Rejection}");
        Assert.Null(order.Army!.GatheringId);
        Assert.Equal(standing.GatheringId, order.Remainder!.GatheringId);
    }
}
