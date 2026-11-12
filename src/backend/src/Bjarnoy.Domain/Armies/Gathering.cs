using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Armies;

/// <summary>
/// The meeting of an army that was sent out from several garrison spots (<c>docs/design/garrison.md</c>, "Training, sending out,
/// losing a spot"): the hex <see cref="Hex"/> the groups walk to, the instant <see cref="DepartAt"/> they leave it together (fixed at
/// dispatch, the slowest group's arrival, never recomputed) and the order the merged army carries out from there. Every group is
/// an <see cref="Army"/> of its own with <see cref="Army.GatheringId"/> set until it merges, is recalled, gets another order, is
/// split off or loses a fight. There is no lead: whoever is at the hex waits.
/// </summary>
/// <remarks>
/// A fleet that takes passengers from spots without ships has two gatherings: the passengers board at one of the fleet's docks
/// (a gathering whose <see cref="ParentGatheringId"/> is the sea meeting of the ship groups, or, with a single ship group, whose order is
/// the dispatch order itself) and the merged ship group then sails to the sea meeting.
/// </remarks>
public sealed record Gathering
{
    public required Guid Id { get; init; }

    public required Guid SettlementId { get; init; }

    /// <summary>The join hex the groups of this gathering walk to and merge on.</summary>
    public required HexCoord Hex { get; init; }

    /// <summary>
    /// Whether this is a meeting of ships (a boarding or a sea meeting): it only merges when a ship group stands on the join hex, otherwise
    /// every group goes home to its own spot.
    /// </summary>
    public bool IsFleet { get; init; }

    /// <summary>
    /// The land hex next to <see cref="Hex"/> where land groups stand when <see cref="Hex"/> is a dock on the water (land troops cannot walk
    /// onto the water; they board from the shore); <see langword="null"/> when every group stands on <see cref="Hex"/> itself.
    /// </summary>
    public HexCoord? BoardingHex { get; init; }

    /// <summary>Whether a group standing on <paramref name="hex"/> is at this gathering.</summary>
    public bool Stands(HexCoord hex) => hex == Hex || (BoardingHex is { } boarding && hex == boarding);

    /// <summary>Game instant the groups still standing on <see cref="Hex"/> merge and leave together.</summary>
    public required DateTimeOffset DepartAt { get; init; }

    /// <summary>The mission of the merged army (<see cref="ArmyMission.Move"/> for a boarding gathering that joins a sea meeting).</summary>
    public ArmyMission Mission { get; init; } = ArmyMission.Move;

    public Guid? TargetSettlementId { get; init; }

    public HexCoord? TargetBuildingCoord { get; init; }

    public HexCoord? TargetCampCoord { get; init; }

    /// <summary>The hexes the merged army walks to in order after <see cref="Hex"/>: what is left of the waypoints, then the route's destination.</summary>
    public IReadOnlyList<HexCoord> Stops { get; init; } = [];

    /// <summary>The garrison spot the merged army belongs to: the settlement's spot nearest <see cref="Hex"/> that can hold all of its units.</summary>
    public required HexCoord HomeSpot { get; init; }

    /// <summary>The sea meeting the merged army joins when it leaves a boarding gathering; <see langword="null"/> for every other gathering.</summary>
    public Guid? ParentGatheringId { get; init; }
}

/// <summary>The outcome of <see cref="Army.PlanGatheredDispatch"/>: every group's army, the gatherings and the settlement without the units.</summary>
/// <param name="Armies">One army per spot the units came from.</param>
/// <param name="Gatherings">The meeting(s) the armies walk to; the last one is the one the armies join last.</param>
/// <param name="Reported">The army the dispatch answers with: the group that gets to the final meeting hex first.</param>
public sealed record GatheredDispatchDecision(
    DispatchRejection Rejection,
    Settlement? Settlement = null,
    IReadOnlyList<Army>? Armies = null,
    IReadOnlyList<Gathering>? Gatherings = null,
    Army? Reported = null)
{
    public bool Accepted => Rejection == DispatchRejection.None && Settlement is not null && Armies is { Count: > 0 } && Reported is not null;

    public static GatheredDispatchDecision Rejected(DispatchRejection reason) => new(reason);
}

public sealed partial record Army
{
    /// <summary>
    /// The route and time functions every planner needs with the same terrain, river, wall and speed inputs, so a route is searched and
    /// timed one way everywhere: the dispatch planners, the gathering's departure and the legs between.
    /// </summary>
    private sealed class Router(
        Func<HexCoord, Terrain> terrainAt, double speedFactor, Func<HexCoord, bool>? isRiver, Func<HexCoord, bool>? isWideRiver, WallRules? walls)
    {
        /// <param name="avoid">A hex no route may enter (the target when the groups only meet next to it, so no group walks through it).</param>
        public (IReadOnlyList<HexCoord>? Path, DispatchRejection Rejection) Search(HexCoord from, HexCoord to, bool isLandUnit, HexCoord? avoid = null)
        {
            var blocked = walls?.Blocked;
            var friendlyGate = walls?.FriendlyGate;
            var halfOpen = walls?.HalfOpen;
            if (avoid is { } closed)
            {
                var wallBlocked = blocked;
                var wallGate = friendlyGate;
                var wallHalfOpen = halfOpen;
                blocked = hex => hex == closed || (wallBlocked?.Invoke(hex) ?? false);
                friendlyGate = hex => hex != closed && (wallGate?.Invoke(hex) ?? false);
                halfOpen = hex => hex != closed && (wallHalfOpen?.Invoke(hex) ?? false);
            }

            var search = HexPathfinder.Search(from, to, terrainAt, isLandUnit, isRiver, isWideRiver, blocked, friendlyGate, halfOpen, walls?.BridgeCost);
            if (search.Path is { Count: > 0 } path)
            {
                return (path, DispatchRejection.None);
            }

            return (null, search.LimitReached ? DispatchRejection.RouteTooLong
                : isLandUnit ? DispatchRejection.UnreachableLeg
                : DispatchRejection.NoSeaRoute);
        }

        /// <summary>The route from <paramref name="start"/> through every one of <paramref name="stops"/> in turn (joint hexes once).</summary>
        public (IReadOnlyList<HexCoord>? Path, DispatchRejection Rejection) Chain(HexCoord start, IReadOnlyList<HexCoord> stops, bool isLandUnit)
        {
            List<HexCoord> full = [start];
            var from = start;
            foreach (var stop in stops)
            {
                var (leg, rejection) = Search(from, stop, isLandUnit);
                if (leg is null)
                {
                    return (null, rejection);
                }

                // Drop the joint hex: leg[0] is `from`, already the last entry added.
                full.AddRange(leg.Skip(1));
                from = stop;
            }

            return (full, DispatchRejection.None);
        }

        /// <summary>
        /// The way on from <paramref name="join"/> through <paramref name="stops"/> and the way home from there: the way out walked backwards,
        /// then from <paramref name="join"/> to <paramref name="home"/> (joint hex once), both timed at <paramref name="pace"/>.
        /// </summary>
        public (RouteTimes? Out, RouteTimes? Back, DispatchRejection Rejection) Round(
            HexCoord join, IReadOnlyList<HexCoord> stops, HexCoord home, double pace, bool isLandUnit)
        {
            var (outbound, rejection) = Chain(join, stops, isLandUnit);
            if (outbound is null)
            {
                return (null, null, rejection);
            }

            var (toHome, homeRejection) = Search(join, home, isLandUnit);
            if (toHome is null)
            {
                return (null, null, homeRejection);
            }

            List<HexCoord> back = [.. Reversed(outbound), .. toHome.Skip(1)];
            return (Times(outbound, pace, isLandUnit), Times(back, pace, isLandUnit), DispatchRejection.None);
        }

        public RouteTimes Times(IReadOnlyList<HexCoord> path, double pace, bool isLandUnit) => new(
            path,
            HexPathfinder.CumulativeHours(path, terrainAt, pace, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost),
            HexPathfinder.EdgeHours(path, terrainAt, pace, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost));
    }

    /// <summary>A route with its cumulative and edge-crossing hours.</summary>
    private sealed record RouteTimes(IReadOnlyList<HexCoord> Path, IReadOnlyList<double> Cumulative, IReadOnlyList<double> Edges)
    {
        public double Hours => Cumulative[^1];
    }

    private static List<HexCoord> Reversed(IReadOnlyList<HexCoord> path)
    {
        List<HexCoord> reversed = [.. path];
        reversed.Reverse();
        return reversed;
    }

    /// <summary>One group walking to a meeting: where it starts, what it is and how long it starts late (a ship group waiting for its passengers).</summary>
    private sealed record Walker(HexCoord Spot, IReadOnlyList<UnitStack> Stacks, double DelayHours);

    private sealed record MeetingPlan(HexCoord Join, IReadOnlyList<RouteTimes> Walks, IReadOnlyList<double> Arrivals, double Hours);

    /// <summary>
    /// Where the <paramref name="walkers"/> meet on their way to <paramref name="firstStop"/>: the first hex of the longest route (the
    /// anchor's, by hours at its own pace) that every other route shares, the hex just before the destination when that first shared hex
    /// is the destination itself (no waypoint to meet on), and the walk of every group to it.
    /// </summary>
    private static (MeetingPlan? Plan, DispatchRejection Rejection) PlanMeeting(
        Router router, IReadOnlyList<Walker> walkers, bool isLandUnit, HexCoord firstStop, HexCoord routeDestination, bool hasWaypoints)
    {
        var routes = new List<RouteTimes>();
        foreach (var walker in walkers)
        {
            var (route, rejection) = router.Search(walker.Spot, firstStop, isLandUnit);
            if (route is null)
            {
                return (null, rejection);
            }

            routes.Add(router.Times(route, ShipCargo.Pace(walker.Stacks), isLandUnit));
        }

        var anchor = 0;
        for (var i = 1; i < routes.Count; i++)
        {
            if (routes[i].Hours > routes[anchor].Hours)
            {
                anchor = i;
            }
        }

        var anchorPath = routes[anchor].Path;
        var join = anchorPath.First(hex => routes.All(r => r.Path.Contains(hex)));
        HexCoord? avoid = null;
        if (!hasWaypoints && join == routeDestination)
        {
            // No way point to meet on and the routes only share the target: the groups meet on the hex just before it.
            if (anchorPath.Count < 2)
            {
                return (null, DispatchRejection.UnreachableLeg);
            }

            join = anchorPath[^2];
            avoid = routeDestination;
        }

        var walks = new List<RouteTimes>();
        var arrivals = new List<double>();
        for (var i = 0; i < walkers.Count; i++)
        {
            var (walk, rejection) = router.Search(walkers[i].Spot, join, isLandUnit, avoid);
            if (walk is null)
            {
                return (null, rejection);
            }

            var times = router.Times(walk, ShipCargo.Pace(walkers[i].Stacks), isLandUnit);
            walks.Add(times);
            arrivals.Add(walkers[i].DelayHours + times.Hours);
        }

        return (new MeetingPlan(join, walks, arrivals, arrivals.Max()), DispatchRejection.None);
    }

    /// <summary>The hexes the merged army walks after the join hex <paramref name="join"/>: what is left of the waypoints, then the route's destination.</summary>
    private static List<HexCoord> StopsAfter(HexCoord join, IReadOnlyList<HexCoord> waypoints, HexCoord routeDestination)
    {
        if (waypoints.Count == 0)
        {
            return [routeDestination];
        }

        List<HexCoord> stops = [.. waypoints.Skip(1), routeDestination];
        if (join != waypoints[0])
        {
            stops.Insert(0, waypoints[0]);
        }

        return stops;
    }

    /// <summary>The food a gathered army needs from now: it eats <paramref name="waitHours"/> until it leaves, walks the continuation and walks home.</summary>
    private static double GatheredFoodNeeded(double upkeepPerHour, double waitHours, double continuationHours, double returnHours) =>
        (upkeepPerHour * waitHours) + ((continuationHours + returnHours) * upkeepPerHour);

    /// <summary>
    /// Divides <paramref name="provisions"/> between the groups by their upkeep share, each capped at what its units carry, the overflow
    /// going to the groups with room left.
    /// </summary>
    private static double[] SplitProvisions(double provisions, IReadOnlyList<IReadOnlyList<UnitStack>> groups)
    {
        var upkeep = groups.Select(g => g.Sum(s => UnitCatalogue.Get(s.Type).UpkeepPerHour * s.Count)).ToArray();
        var capacity = groups.Select(g => g.Sum(s => UnitCatalogue.Get(s.Type).FoodCarryCapacity * s.Count)).ToArray();
        var totalUpkeep = upkeep.Sum();
        var shares = upkeep.Select(u => totalUpkeep > 0 ? provisions * u / totalUpkeep : provisions / groups.Count).ToArray();

        for (var round = 0; round <= groups.Count; round++)
        {
            var overflow = 0d;
            for (var i = 0; i < shares.Length; i++)
            {
                if (shares[i] > capacity[i])
                {
                    overflow += shares[i] - capacity[i];
                    shares[i] = capacity[i];
                }
            }

            if (overflow <= 1e-9)
            {
                break;
            }

            var room = Enumerable.Range(0, shares.Length).Where(i => shares[i] < capacity[i] - 1e-12).ToList();
            var roomUpkeep = room.Sum(i => upkeep[i]);
            if (room.Count == 0)
            {
                break;
            }

            foreach (var i in room)
            {
                shares[i] += roomUpkeep > 0 ? overflow * upkeep[i] / roomUpkeep : overflow / room.Count;
            }
        }

        return shares;
    }

    /// <summary>
    /// Plans sending an army put together from the units of several garrison spots of one settlement
    /// (<c>docs/design/garrison.md</c>, "Training, sending out, losing a spot"). Each group leaves its own spot at once as an army of its
    /// own (mission <see cref="ArmyMission.Move"/>) and walks to the join hex, where the groups that got there wait, eating their
    /// provisions, until the slowest has arrived; then they merge into one army that carries out the order (<see cref="Gathering"/>).
    /// </summary>
    /// <remarks>
    /// <para>
    /// Land army: the join hex is the first hex of the longest route that all routes to the first stop share (the hex just before the
    /// target when only the target is shared); every group walks to it at its own pace, the meeting is at the slowest arrival, the
    /// merged army goes on at the pace of all its units and its home is the spot nearest the join hex. The walk and the wait count in
    /// the round-trip food check, exactly: provisions must cover every unit's upkeep until the army leaves, the continuation and the way
    /// home.
    /// </para>
    /// <para>
    /// Fleet: passengers at spots without ships walk to a dock (a ship group whose ships have the slots for its own land units and all
    /// the passengers, the one the last passenger reaches soonest) and board there. With several ship groups the boarded ships sail on to
    /// a sea meeting with the others, where the same rules apply.
    /// </para>
    /// </remarks>
    /// <param name="groups">The units of each spot, two spots or more.</param>
    /// <param name="newId">Makes the ids of the armies and gatherings.</param>
    public static GatheredDispatchDecision PlanGatheredDispatch(
        Settlement settlement,
        IReadOnlyList<(HexCoord Spot, IReadOnlyList<UnitStack> Units)> groups,
        double provisions,
        IReadOnlyList<HexCoord> waypoints,
        HexCoord destination,
        DateTimeOffset now,
        Func<Guid> newId,
        Func<HexCoord, Terrain> terrainAt,
        ArmyMission mission = ArmyMission.Move,
        Guid? targetSettlementId = null,
        HexCoord? targetBuildingCoord = null,
        IReadOnlyList<(HexCoord Centre, int Radius)>? targetClaimDiscs = null,
        Func<HexCoord, bool>? isHexFoundable = null,
        bool renownAndSlotAllowed = true,
        double speedFactor = 1.0,
        Func<HexCoord, bool>? isRiver = null,
        Func<HexCoord, bool>? isWideRiver = null,
        IGiantIndex? giants = null,
        WallRules? walls = null,
        HexCoord? targetCampCoord = null,
        bool targetCampIsWater = false,
        bool targetCampIsSand = false,
        IReadOnlyList<GarrisonSpot>? targetSpots = null,
        Func<HexCoord, bool>? isCampSiteOccupied = null)
    {
        ArgumentNullException.ThrowIfNull(settlement);
        ArgumentNullException.ThrowIfNull(groups);
        ArgumentNullException.ThrowIfNull(waypoints);
        ArgumentNullException.ThrowIfNull(newId);
        ArgumentNullException.ThrowIfNull(terrainAt);

        var union = MergeStacksByType(groups.SelectMany(g => g.Units.Where(s => s.Count > 0)).ToList(), []);
        var isFleet = union.Any(s => UnitCatalogue.Get(s.Type).Class == UnitClass.Ship);

        var check = ValidateDispatchRequest(
            mission, union, settlement.Id, targetSettlementId, targetBuildingCoord, targetClaimDiscs, destination,
            targetCampCoord, targetCampIsWater, targetCampIsSand, terrainAt, giants, targetSpots, isHexFoundable,
            renownAndSlotAllowed, isCampSiteOccupied);
        if (check.Rejection != DispatchRejection.None)
        {
            return GatheredDispatchDecision.Rejected(check.Rejection);
        }

        var routeDestination = check.RouteDestination;

        var settlementDecision = settlement.PlanDispatch(groups, provisions, now);
        if (!settlementDecision.Accepted)
        {
            return GatheredDispatchDecision.Rejected(settlementDecision.Rejection);
        }

        // The camp's cost leaves the stock now, like the provisions, and rides in the Loot of the first group's army.
        var dispatchedFrom = settlementDecision.Settlement!;
        var isCampMission = mission == ArmyMission.SetUpCamp;
        if (isCampMission)
        {
            if (!dispatchedFrom.TrySpendAvailable(BeachCamp.Cost, now, out var paidForCamp))
            {
                return GatheredDispatchDecision.Rejected(DispatchRejection.InsufficientResources);
            }

            dispatchedFrom = dispatchedFrom with { Resources = paidForCamp };
        }

        var endpointRejection = ValidateEndpoints(isFleet, mission, targetCampIsSand, routeDestination, waypoints, terrainAt);
        if (endpointRejection != DispatchRejection.None)
        {
            return GatheredDispatchDecision.Rejected(endpointRejection);
        }

        var spots = settlementDecision.GroupStacks!;
        var router = new Router(terrainAt, speedFactor, isRiver, isWideRiver, walls);
        var upkeepAll = union.Sum(s => UnitCatalogue.Get(s.Type).UpkeepPerHour * s.Count);
        var paceAll = ShipCargo.Pace(union);
        var firstStop = waypoints.Count > 0 ? waypoints[0] : routeDestination;
        var hasWaypoints = waypoints.Count > 0;

        Gathering OrderGathering(HexCoord hex, DateTimeOffset departAt, IReadOnlyList<HexCoord> stops, HexCoord home, HexCoord? boardingHex = null)
        {
            var hasTarget = mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid;
            return new Gathering
            {
                Id = newId(),
                SettlementId = settlement.Id,
                Hex = hex,
                BoardingHex = boardingHex,
                DepartAt = departAt,
                IsFleet = isFleet,
                Mission = mission,
                TargetSettlementId = hasTarget ? targetSettlementId : null,
                TargetBuildingCoord = hasTarget ? targetBuildingCoord : null,
                TargetCampCoord = mission == ArmyMission.Hunt ? targetCampCoord : null,
                Stops = stops,
                HomeSpot = home,
            };
        }

        // Every group of the plan: its spot, units, walk, the gathering it joins and when that leaves.
        var members = new List<GroupWalk>();
        var gatherings = new List<Gathering>();
        double finalWaitHours;
        double continuationHours;
        double returnHours;
        Gathering finalGathering;

        List<Walker> shipWalkers = [.. spots.Where(g => ShipCargo.Ships(g.Units).Count > 0).Select(g => new Walker(g.Spot, g.Units, 0))];
        var passengerGroups = spots.Where(g => ShipCargo.Ships(g.Units).Count == 0).ToList();

        if (!isFleet || passengerGroups.Count == 0)
        {
            // One meeting of every group (land army, or a fleet whose groups all have ships).
            var land = !isFleet;
            var walkers = spots.Select(g => new Walker(g.Spot, g.Units, 0)).ToList();
            var (meeting, rejection) = PlanMeeting(router, walkers, land, firstStop, routeDestination, hasWaypoints);
            if (meeting is null)
            {
                return GatheredDispatchDecision.Rejected(rejection);
            }

            var planned = PlanContinuation(router, dispatchedFrom, union, paceAll, meeting.Join, StopsAfter(meeting.Join, waypoints, routeDestination), land, spots[0].Spot);
            if (planned.Rejection != DispatchRejection.None)
            {
                return GatheredDispatchDecision.Rejected(planned.Rejection);
            }

            var departAt = now + TimeSpan.FromHours(meeting.Hours);
            finalGathering = OrderGathering(meeting.Join, departAt, planned.Stops!, planned.Home);
            gatherings.Add(finalGathering);
            for (var i = 0; i < spots.Count; i++)
            {
                members.Add(new GroupWalk(spots[i].Spot, spots[i].Units, meeting.Walks[i], finalGathering, meeting.Hours));
            }

            finalWaitHours = meeting.Hours;
            continuationHours = planned.ContinuationHours;
            returnHours = planned.ReturnHours;
        }
        else
        {
            // Passengers walk to a dock and board there. The dock is a ship group whose ships have the slots for its own land
            // units and all the passengers; of those, the one the last passenger reaches soonest.
            var passengerStacks = passengerGroups.SelectMany(g => g.Units).ToList();
            var candidates = shipWalkers
                .Where(w => ShipCargo.SlotsNeeded(ShipCargo.Passengers(w.Stacks).Concat(passengerStacks)) <= ShipCargo.SlotsOffered(w.Stacks))
                .ToList();
            if (candidates.Count == 0)
            {
                return GatheredDispatchDecision.Rejected(DispatchRejection.InsufficientShipCapacity);
            }

            Walker? dock = null;
            HexCoord? dockBoarding = null;
            List<RouteTimes>? passengerWalks = null;
            var bestHours = double.MaxValue;
            var failure = DispatchRejection.UnreachableLeg;
            foreach (var candidate in candidates)
            {
                // A dock on the water cannot be walked onto: the passengers board from the land hex beside it, the one they reach soonest.
                List<HexCoord> boardingHexes = terrainAt(candidate.Spot).IsTraversable(isLandUnit: true)
                    ? [candidate.Spot]
                    : [.. candidate.Spot.Neighbours().Where(n => terrainAt(n).IsTraversable(isLandUnit: true)).OrderBy(n => n.Q).ThenBy(n => n.R)];
                if (boardingHexes.Count == 0)
                {
                    failure = DispatchRejection.UnreachableLeg;
                }

                foreach (var boardingHex in boardingHexes)
                {
                    var walks = new List<RouteTimes>();
                    var latest = 0d;
                    var reachable = true;
                    foreach (var passengers in passengerGroups)
                    {
                        var (walk, rejection) = router.Search(passengers.Spot, boardingHex, isLandUnit: true);
                        if (walk is null)
                        {
                            failure = rejection;
                            reachable = false;
                            break;
                        }

                        var times = router.Times(walk, ShipCargo.Pace(passengers.Units), isLandUnit: true);
                        walks.Add(times);
                        latest = Math.Max(latest, times.Hours);
                    }

                    if (reachable && latest < bestHours)
                    {
                        bestHours = latest;
                        dock = candidate;
                        dockBoarding = boardingHex == candidate.Spot ? null : boardingHex;
                        passengerWalks = walks;
                    }
                }
            }

            if (dock is null || passengerWalks is null)
            {
                return GatheredDispatchDecision.Rejected(failure);
            }

            var boardingHours = bestHours;
            var boardingDepartAt = now + TimeSpan.FromHours(boardingHours);
            var dockGroup = spots.First(g => g.Spot == dock.Spot);
            var dockStacks = dockGroup.Units.Concat(passengerStacks).ToList();

            if (shipWalkers.Count == 1)
            {
                // The only ship group: the boarding is the meeting, and the order starts from the dock.
                var planned = PlanContinuation(router, dispatchedFrom, union, paceAll, dock.Spot, StopsAfter(dock.Spot, waypoints, routeDestination), land: false, dock.Spot);
                if (planned.Rejection != DispatchRejection.None)
                {
                    return GatheredDispatchDecision.Rejected(planned.Rejection);
                }

                finalGathering = OrderGathering(dock.Spot, boardingDepartAt, planned.Stops!, planned.Home, dockBoarding);
                gatherings.Add(finalGathering);
                finalWaitHours = boardingHours;
                continuationHours = planned.ContinuationHours;
                returnHours = planned.ReturnHours;
            }
            else
            {
                // Several ship groups meet at sea; the boarded dock group is late by the time its passengers need.
                var walkers = shipWalkers
                    .Select(w => w.Spot == dock.Spot ? w with { Stacks = dockStacks, DelayHours = boardingHours } : w)
                    .ToList();
                var (meeting, rejection) = PlanMeeting(router, walkers, isLandUnit: false, firstStop, routeDestination, hasWaypoints);
                if (meeting is null)
                {
                    return GatheredDispatchDecision.Rejected(rejection);
                }

                var planned = PlanContinuation(router, dispatchedFrom, union, paceAll, meeting.Join, StopsAfter(meeting.Join, waypoints, routeDestination), land: false, dock.Spot);
                if (planned.Rejection != DispatchRejection.None)
                {
                    return GatheredDispatchDecision.Rejected(planned.Rejection);
                }

                finalGathering = OrderGathering(meeting.Join, now + TimeSpan.FromHours(meeting.Hours), planned.Stops!, planned.Home);

                var boarding = new Gathering
                {
                    Id = newId(),
                    SettlementId = settlement.Id,
                    Hex = dock.Spot,
                    DepartAt = boardingDepartAt,
                    IsFleet = true,
                    Mission = ArmyMission.Move,
                    BoardingHex = dockBoarding,
                    Stops = [meeting.Join],
                    HomeSpot = dock.Spot,
                    ParentGatheringId = finalGathering.Id,
                };
                gatherings.Add(finalGathering);
                gatherings.Add(boarding);

                for (var i = 0; i < shipWalkers.Count; i++)
                {
                    var spot = shipWalkers[i].Spot;
                    members.Add(spot == dock.Spot
                        ? new GroupWalk(spot, dockGroup.Units, router.Times([spot], ShipCargo.Pace(dockGroup.Units), false), boarding, boardingHours)
                        : new GroupWalk(spot, shipWalkers[i].Stacks, meeting.Walks[i], finalGathering, meeting.Hours));
                }

                finalWaitHours = meeting.Hours;
                continuationHours = planned.ContinuationHours;
                returnHours = planned.ReturnHours;
            }

            if (shipWalkers.Count == 1)
            {
                members.Add(new GroupWalk(dock.Spot, dockGroup.Units, router.Times([dock.Spot], ShipCargo.Pace(dockGroup.Units), false), finalGathering, boardingHours));
            }

            var boardingGathering = gatherings.Count > 1 ? gatherings[1] : finalGathering;
            for (var i = 0; i < passengerGroups.Count; i++)
            {
                members.Add(new GroupWalk(passengerGroups[i].Spot, passengerGroups[i].Units, passengerWalks[i], boardingGathering, boardingHours));
            }
        }

        // Every unit eats from now until the army leaves, then on the continuation and the way home.
        if (provisions < GatheredFoodNeeded(upkeepAll, finalWaitHours, continuationHours, returnHours))
        {
            return GatheredDispatchDecision.Rejected(DispatchRejection.InsufficientProvisionsForRoundTrip);
        }

        var shares = SplitProvisions(provisions, members.Select(m => m.Stacks).ToList());

        // Every gathering must also feed all its groups until the army finally leaves (a boarded fleet rides on to the sea meeting).
        foreach (var gathering in gatherings)
        {
            var shareSum = 0d;
            var needed = 0d;
            for (var i = 0; i < members.Count; i++)
            {
                if (members[i].Gathering == gathering)
                {
                    shareSum += shares[i];
                    needed += members[i].Stacks.Sum(s => UnitCatalogue.Get(s.Type).UpkeepPerHour * s.Count) * finalWaitHours;
                }
            }

            if (shareSum < needed - 1e-9)
            {
                return GatheredDispatchDecision.Rejected(DispatchRejection.InsufficientProvisionsForRoundTrip);
            }
        }

        var armies = new List<Army>();
        for (var i = 0; i < members.Count; i++)
        {
            var member = members[i];
            var groupUpkeep = member.Stacks.Sum(s => UnitCatalogue.Get(s.Type).UpkeepPerHour * s.Count);
            if (shares[i] < (groupUpkeep * member.WaitHours) - 1e-9)
            {
                return GatheredDispatchDecision.Rejected(DispatchRejection.InsufficientProvisionsForRoundTrip);
            }

            var pace = ShipCargo.Pace(member.Stacks);
            var land = !member.Stacks.Any(s => ShipCargo.IsShip(s.Type));
            var home = router.Times(Reversed(member.Walk.Path), pace, land);
            var created = Movement.Movement.Create(
                now, member.Walk.Path, member.Walk.Cumulative, member.Walk.Edges, home.Path, home.Cumulative, home.Edges, shares[i], groupUpkeep);

            armies.Add(new Army
            {
                Id = newId(),
                SettlementId = settlement.Id,
                HomeSpot = member.Spot,
                Stacks = member.Stacks,
                Location = new ArmyLocation.InTransit(created),
                Provisions = shares[i],
                Mission = ArmyMission.Move,
                Loot = isCampMission && i == 0 ? BeachCamp.Cost : default,
            }.JoinGathering(member.Gathering.Id, member.Gathering.DepartAt));
        }

        var reported = armies
            .Where(a => a.GatheringId == finalGathering.Id)
            .OrderBy(a => ((ArmyLocation.InTransit)a.Location).Movement.ArrivesAt)
            .First();

        return new GatheredDispatchDecision(DispatchRejection.None, dispatchedFrom, armies, gatherings, reported);
    }

    /// <summary>One group of a gathered dispatch before its army exists: what it walks, which gathering it joins and how long it eats until that leaves.</summary>
    private sealed record GroupWalk(HexCoord Spot, IReadOnlyList<UnitStack> Stacks, RouteTimes Walk, Gathering Gathering, double WaitHours);

    private sealed record ContinuationPlan(
        DispatchRejection Rejection, IReadOnlyList<HexCoord>? Stops, HexCoord Home, double ContinuationHours, double ReturnHours);

    /// <summary>
    /// The merged army's way on from <paramref name="join"/> through <paramref name="stops"/> and back to its home (the settlement's spot
    /// nearest the join hex that can hold all its units; <paramref name="fallbackHome"/> when none can): the way out walked backwards,
    /// then from the join hex home, all at the pace of all units.
    /// </summary>
    private static ContinuationPlan PlanContinuation(
        Router router, Settlement settlement, IReadOnlyList<UnitStack> union, double pace, HexCoord join, IReadOnlyList<HexCoord> stops,
        bool land, HexCoord fallbackHome)
    {
        // A fleet's home is a spot for its ships; the land troops aboard come off there (garrison.md).
        var home = settlement.NearestSpotFor(join, land ? union : ShipCargo.Ships(union))?.Coord ?? fallbackHome;
        var (outbound, back, rejection) = router.Round(join, stops, home, pace, land);
        return outbound is null || back is null
            ? new ContinuationPlan(rejection, null, home, 0, 0)
            : new ContinuationPlan(DispatchRejection.None, stops, home, outbound.Hours, back.Hours);
    }

    /// <summary>
    /// The army that leaves the gathering <paramref name="gathering"/> at <paramref name="at"/>: <paramref name="merged"/> (the groups
    /// that stood on the join hex, merged, with the provisions they have left then) put on the way through the gathering's stops, with its
    /// mission, targets and home. <see langword="null"/> when no route exists any more (a wall now closes the way); the caller then sends
    /// the army home.
    /// </summary>
    /// <param name="parentDepartAt">
    /// The departure of the gathering this army joins next (a boarded fleet sailing to the sea meeting), or <see langword="null"/>: the merged
    /// army is then a group of that gathering (<see cref="Gathering.ParentGatheringId"/>) and stands there until it leaves.
    /// </param>
    public static Army? PlanGatheringDeparture(
        Army merged,
        Gathering gathering,
        DateTimeOffset at,
        Func<HexCoord, Terrain> terrainAt,
        double speedFactor = 1.0,
        Func<HexCoord, bool>? isRiver = null,
        Func<HexCoord, bool>? isWideRiver = null,
        WallRules? walls = null,
        DateTimeOffset? parentDepartAt = null)
    {
        ArgumentNullException.ThrowIfNull(merged);
        ArgumentNullException.ThrowIfNull(gathering);
        ArgumentNullException.ThrowIfNull(terrainAt);

        // The rules of the mission hold for the units that actually arrived: a founding convoy needs exactly its settlers, a camp army
        // exactly its builders (the groups that carried them may be gone). Otherwise the army goes home.
        if (gathering.Mission == ArmyMission.Found
            && merged.Stacks.Where(s => s.Type == UnitType.Settler).Sum(s => s.Count) != Founding.RequiredSettlers)
        {
            return null;
        }

        if (gathering.Mission == ArmyMission.SetUpCamp
            && merged.Stacks.Where(s => s.Type == UnitType.CampBuilder).Sum(s => s.Count) != BeachCamp.RequiredBuilders)
        {
            return null;
        }

        var land = !merged.IsFleet;
        var router = new Router(terrainAt, speedFactor, isRiver, isWideRiver, walls);
        var (outbound, back, _) = router.Round(gathering.Hex, gathering.Stops, gathering.HomeSpot, merged.TotalSpeed, land);
        if (outbound is null || back is null)
        {
            return null;
        }

        var movement = Movement.Movement.Create(
            at, outbound.Path, outbound.Cumulative, outbound.Edges, back.Path, back.Cumulative, back.Edges, merged.Provisions, merged.TotalUpkeepPerHour);
        var departed = merged with
        {
            HomeSpot = gathering.HomeSpot,
            Location = new ArmyLocation.InTransit(movement),
            Mission = gathering.Mission,
            TargetSettlementId = gathering.TargetSettlementId,
            TargetBuildingCoord = gathering.TargetBuildingCoord,
            TargetCampCoord = gathering.TargetCampCoord,
        };
        return gathering.ParentGatheringId is { } parent && parentDepartAt is { } parentAt
            ? departed.JoinGathering(parent, parentAt)
            : departed.LeaveGathering();
    }

    /// <summary>
    /// The groups of <paramref name="members"/> that stand on <paramref name="gathering"/>'s join hex at its departure, merged into one
    /// army: the first of <paramref name="members"/> (the caller orders them) takes the units and loot of the others and carries the sum
    /// of what they each have left at <paramref name="at"/>. The result stands on the hex with that food as of <paramref name="at"/>,
    /// ready for <see cref="PlanGatheringDeparture"/>.
    /// </summary>
    public static Army MergeGatheringMembers(IReadOnlyList<Army> members, DateTimeOffset at)
    {
        ArgumentNullException.ThrowIfNull(members);
        if (members.Count == 0)
        {
            throw new ArgumentException("A merge needs at least one army.", nameof(members));
        }

        var provisions = members.Sum(m => m.ProvisionsAt(at));
        var loot = members.Aggregate(default(ResourceAmounts), (sum, m) => sum + m.Loot);
        var stacks = MergeStacksByType(members.SelectMany(m => m.Stacks).ToList(), []);

        // The ships that arrived carry the passengers that arrived only as far as they have slots (the existing overflow rule).
        var ships = ShipCargo.Ships(stacks);
        if (ships.Count > 0)
        {
            var (kept, _) = ShipCargo.DropOverflow(ships, ShipCargo.Passengers(stacks));
            stacks = [.. ships, .. kept];
        }

        return members[0] with { Stacks = stacks, Provisions = provisions, Loot = loot };
    }
}
