using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Armies;

/// <summary>What an army is currently doing.</summary>
public enum ArmyMission
{
    /// <summary>Travel to a destination, stand there, and auto-return once provisions demand it.</summary>
    Move = 0,

    /// <summary>
    /// Travel to a target settlement and fight its garrison on arrival
    /// (issue #40 phase 3) — see <see cref="Army.SettleArrival"/>. Survivors
    /// (if any) and loot immediately start the precomputed return leg; there
    /// is no standing at the destination the way <see cref="Move"/> allows.
    /// </summary>
    Attack = 1,

    /// <summary>
    /// Travel to a target settlement and, on arrival, join it as a guest
    /// garrison — <see cref="ArmyLocation.Supporting"/> — rather than fighting
    /// or standing idle (issue #40 phase 4). Stays there, still owned by its
    /// origin <see cref="Army.SettlementId"/>, feeding off the host's food
    /// (see <c>Settlement.SettleTo</c>) and fighting alongside its garrison
    /// (see <c>Army.SettleArrival</c>'s <c>guestDefenderStacks</c> parameter)
    /// until the owner <see cref="Army.Recall"/>s it home.
    /// </summary>
    Support = 2,

    /// <summary>
    /// Travel to a target settlement and fight its garrison on arrival, same
    /// as <see cref="Attack"/>, but the fight breaks off early (issue #40
    /// phase 7, design doc §4): both sides' loss fraction is scaled down and
    /// capped rather than the loser losing everything, since a raider
    /// prioritises loot over annihilation. Dispatch validation, target-
    /// building support, food-range rules, and siege behavior on a win are
    /// all identical to <see cref="Attack"/> — the only difference is the
    /// <c>raid: true</c> flag threaded into <see cref="Combat.BattleResolver.Resolve"/>
    /// by <see cref="SettleArrival"/>. See <see cref="Combat.BattleResolver.Resolve"/>'s
    /// remarks for the exact loss-fraction math.
    /// </summary>
    Raid = 3,

    /// <summary>
    /// Travel to an arbitrary hex — overland via land pathing, or by sea as a
    /// ship-carried convoy landing on a shoreline hex (issue #55 §2) — and, on
    /// arrival, found a new settlement there if the hex is still foundable
    /// (see <see cref="Army.PlanDispatch"/>'s Found-specific validation and
    /// the infrastructure layer's <c>ArmyService.ResolveFoundingAsync</c>).
    /// Otherwise behaves exactly like <see cref="Move"/>: it stands at the
    /// target, auto-returns once provisions demand it (same
    /// <see cref="Movement.TurnAroundAt"/> mechanism), and can be recalled or
    /// retargeted (<see cref="Army.RetargetFounding"/>) mid-journey or while
    /// parked — issue #55 §6's "claimed mid-transit" edge case is handled by
    /// simply never treating a no-longer-foundable arrival as a special case
    /// at all, letting it fall through to ordinary standing/auto-return.
    /// </summary>
    Found = 4,

    /// <summary>
    /// Travel to a wildlife camp's hex (<see cref="Army.TargetCampCoord"/>) and fight its garrison on arrival
    /// (<c>docs/design/wildlife-camps.md</c>, "Hunting a camp"). Land units hunt land camps, fleets hunt water camps
    /// (the whale road) and neither the other. Like <see cref="Attack"/> there
    /// is no standing at the destination: survivors (if any) and loot start the precomputed return leg at once,
    /// see <see cref="Army.SettleHuntArrival"/>.
    /// </summary>
    Hunt = 5,

    /// <summary>
    /// Travel to a free sand shore hex and, once the army has stood there for <see cref="BeachCamp.BuildDuration"/>, set up a
    /// beach camp: a one-hex settlement (<c>ArmyService.ResolveCampAsync</c>, <see cref="Army.PlanCampBuild"/>). The two camp
    /// builders are used up. The camp's cost rides in <see cref="Army.Loot"/> until then, so a recall or an invalid site brings
    /// it home with the army. See <c>docs/design/skirmish/beach-camp.md</c>.
    /// </summary>
    SetUpCamp = 6,
}

/// <summary>
/// A body of units in the field: dispatched from a settlement's
/// <see cref="Settlement.Garrison"/>, travelling under its own
/// <see cref="ArmyLocation"/>, independent of any settlement while away.
/// </summary>
/// <remarks>
/// <para>
/// Pure and immutable, mirroring <see cref="Settlement"/>'s shape: it takes
/// its clock as a parameter (<see cref="SettleTo"/>) and never reaches for a
/// database or ambient time. Not part of the <see cref="Settlement"/>
/// aggregate — an army must be able to exist (and be looked up, recalled,
/// etc.) while its home settlement is nowhere nearby, which a child
/// collection cannot do.
/// </para>
/// <para>
/// An army is a fleet when any stack is a <see cref="UnitClass.Ship"/>; its other stacks are passengers riding in the ships'
/// slots (<see cref="ShipCargo"/>). Otherwise it is a land army.
/// A fleet's destination/waypoints must be <see cref="Terrain.Sea"/>, a land
/// army's must be land — <see cref="HexPathfinder"/> treats the opposite
/// terrain as impassable either way.
/// </para>
/// </remarks>
public sealed record Army
{
    public required Guid Id { get; init; }

    /// <summary>The settlement this army was dispatched from, and returns to.</summary>
    public required Guid SettlementId { get; init; }

    /// <summary>
    /// The garrison spot of <see cref="SettlementId"/> this army leaves from and returns to (and folds into when it arrives):
    /// the spot it was dispatched from, or the one it last folded into or was rehomed to.
    /// </summary>
    public required HexCoord HomeSpot { get; init; }

    public IReadOnlyList<UnitStack> Stacks { get; init; } = [];

    /// <summary>
    /// True when any stack is a <see cref="UnitClass.Ship"/> (the rest are passengers, see this file's own class
    /// remarks). False for an empty army, same as every other <c>isFleet</c> check in this file.
    /// </summary>
    public bool IsFleet => Stacks.Count > 0 && Stacks.Any(s => UnitCatalogue.Get(s.Type).Class == UnitClass.Ship);

    public required ArmyLocation Location { get; init; }

    /// <summary>
    /// Food carried, as of the currently active <see cref="Movement"/> leg's
    /// <see cref="Movement.DepartedAt"/> — see <see cref="ProvisionsAt"/> for
    /// the amount at an arbitrary instant. Meaningless (and left at its last
    /// value) while <see cref="Location"/> is <see cref="ArmyLocation.AtHome"/>.
    /// </summary>
    public double Provisions { get; init; }

    public ArmyMission Mission { get; init; } = ArmyMission.Move;

    /// <summary>
    /// The settlement this <see cref="ArmyMission.Attack"/> army is headed to
    /// fight. <see langword="null"/> for <see cref="ArmyMission.Move"/> — see
    /// <see cref="PlanDispatch"/>.
    /// </summary>
    public Guid? TargetSettlementId { get; init; }

    /// <summary>
    /// The building this <see cref="ArmyMission.Attack"/>/<see cref="ArmyMission.Raid"/> army was told to
    /// hit with its surviving siege power (catapults, issue #40 phase 5) — a coordinate
    /// within the target settlement, not an arbitrary hex. <see langword="null"/>
    /// means "no preference": <see cref="Combat.SiegeResolver.Resolve"/>
    /// picks uniformly at random among whatever buildings the defender
    /// actually has standing when the army arrives. Always set for a fleet (it is the building on the
    /// target's shore the fleet sails to, and the only building it can damage; if it is gone at arrival, nothing is hit). Only ever set for
    /// <see cref="ArmyMission.Attack"/> — see <see cref="PlanDispatch"/>.
    /// Deliberately unvalidated against the target's actual layout at
    /// dispatch time (that layout can change before the army arrives — see
    /// <see cref="PlanDispatch"/>'s remarks); <see cref="SettleArrival"/> is
    /// what checks whether a building still stands there.
    /// </summary>
    public HexCoord? TargetBuildingCoord { get; init; }

    /// <summary>
    /// The wildlife camp this <see cref="ArmyMission.Hunt"/> army was sent to fight. Its path may end on a
    /// neighbour hex when the camp's own hex is not walkable, so this is not necessarily the route's last hex.
    /// <see langword="null"/> for every other mission.
    /// </summary>
    public HexCoord? TargetCampCoord { get; init; }

    /// <summary>
    /// Resources looted from a won <see cref="ArmyMission.Attack"/> battle,
    /// carried home alongside the surviving stacks and deposited into the
    /// home settlement's stock only once the army actually arrives (mirroring
    /// how <see cref="Stacks"/> itself is only folded into the garrison on
    /// arrival — see <c>ArmyService</c>). Zero otherwise.
    /// </summary>
    public ResourceAmounts Loot { get; init; }

    /// <summary>The slowest unit type present sets the pace — a catapult army crawls at catapult speed. A fleet moves at its slowest ship; passengers do not slow it.</summary>
    public double TotalSpeed => ShipCargo.Pace(Stacks);

    public double TotalUpkeepPerHour => Stacks.Sum(s => UnitCatalogue.Get(s.Type).UpkeepPerHour * s.Count);

    public double TotalFoodCarryCapacity => Stacks.Sum(s => UnitCatalogue.Get(s.Type).FoodCarryCapacity * s.Count);

    /// <summary>Provisions remaining at <paramref name="now"/>, burned at <see cref="TotalUpkeepPerHour"/> since the active leg departed.</summary>
    public double ProvisionsAt(DateTimeOffset now)
    {
        if (Location is not ArmyLocation.InTransit inTransit)
        {
            return Provisions;
        }

        var hours = Math.Max(0, (now - inTransit.Movement.DepartedAt).TotalHours);
        return Math.Max(0, Provisions - (TotalUpkeepPerHour * hours));
    }

    /// <summary>
    /// This army with its provisions rebased so that <see cref="ProvisionsAt"/> gives exactly <paramref name="provisionsAtThen"/> at
    /// <paramref name="at"/>, burning at the army's <em>current</em> upkeep from there on. The stored figure is the active leg's
    /// departure baseline, so after a fight that changed the stacks (smaller upkeep) or refilled the food it is set to
    /// <c>provisionsAtThen + upkeep * hours since the leg departed</c>; for a leg that departs at <paramref name="at"/> (a battle's
    /// return leg) that is <paramref name="provisionsAtThen"/> itself.
    /// </summary>
    public Army WithProvisionsAt(DateTimeOffset at, double provisionsAtThen)
    {
        var burnedSinceDeparture = Location is ArmyLocation.InTransit inTransit
            ? TotalUpkeepPerHour * Math.Max(0, (at - inTransit.Movement.DepartedAt).TotalHours)
            : 0;
        return this with { Provisions = Math.Max(0, provisionsAtThen) + burnedSinceDeparture };
    }

    /// <summary>
    /// True while this army cannot get home and so stands where it is, burning provisions until it starves
    /// (<c>docs/design/troop-movement-range.md</c> §2a). The single place that decides it.
    /// </summary>
    public bool CannotGetHome => Location is ArmyLocation.InTransit { Movement.IsStranded: true };

    /// <summary>
    /// The instant a stranded army's provisions hit zero and the whole army dies (<see cref="ProvisionsAt"/> reaches 0);
    /// <see langword="null"/> when the army is not stranded or burns nothing.
    /// </summary>
    public DateTimeOffset? StarvesAt =>
        CannotGetHome && TotalUpkeepPerHour > 0 && Location is ArmyLocation.InTransit { Movement: var movement }
            ? movement.DepartedAt + TimeSpan.FromHours(Provisions / TotalUpkeepPerHour)
            : null;

    /// <summary>
    /// This army left standing on <paramref name="hex"/> from <paramref name="at"/> because it has no way home: the provisions it carried at
    /// <paramref name="at"/> are kept and burn from there, and <see cref="Movement.TurnAroundAt"/> is the instant it starves, so the
    /// "standing" checks of orders and camp aggression keep working until then. Any later order builds a normal movement.
    /// </summary>
    public Army Strand(DateTimeOffset at, HexCoord hex)
    {
        var stranded = this with { Provisions = ProvisionsAt(at), Location = new ArmyLocation.InTransit(Movement.Movement.Stranded(at, hex)) };
        var turnAround = stranded.StarvesAt ?? at.AddYears(100);
        return stranded with
        {
            Location = new ArmyLocation.InTransit(((ArmyLocation.InTransit)stranded.Location).Movement with { TurnAroundAt = turnAround }),
        };
    }

    /// <summary>Current hex: <paramref name="home"/> while <see cref="ArmyLocation.AtHome"/>, else the active leg's position.</summary>
    public HexCoord PositionAt(HexCoord home, DateTimeOffset now) => Location switch
    {
        ArmyLocation.InTransit inTransit => inTransit.Movement.PositionAt(now),
        _ => home,
    };

    /// <summary>Every hex the army has stood on by <paramref name="now"/> on its active leg; just <paramref name="home"/> while it is not travelling.</summary>
    public IReadOnlyList<HexCoord> HexesReachedBy(HexCoord home, DateTimeOffset now) => Location switch
    {
        ArmyLocation.InTransit inTransit => inTransit.Movement.HexesReachedBy(now),
        _ => [home],
    };

    /// <summary>
    /// The settlement side and the movement side of dispatching an army in
    /// one pure decision — mirrors <see cref="Settlement.PlanBuild"/>'s shape.
    /// </summary>
    /// <remarks>
    /// Splits into two pure steps: <see cref="Settlement.PlanDispatch"/>
    /// checks the settlement can actually afford to hand over these units and
    /// this food, and only if that passes does this go on to plan the route
    /// (<see cref="HexPathfinder"/>, called once per waypoint leg plus once
    /// for the precomputed return leg) and validate the round trip's food
    /// range. <paramref name="terrainAt"/> keeps this pure — no DB, no
    /// singleton map — while still letting the caller (<c>ArmyService</c>)
    /// supply a real <c>TerrainSampler.TerrainAt</c>.
    /// </remarks>
    /// <param name="targetClaimDiscs">
    /// The target settlement's full claimed territory, as the same
    /// (centre, radius) discs <see cref="Settlement.ClaimDiscs"/> yields —
    /// the centre disc plus one satellite disc per placed Tower, each
    /// centred on that tower's own hex, not the settlement's centre. Only
    /// consulted when <paramref name="mission"/> is <see cref="ArmyMission.Attack"/>
    /// or <see cref="ArmyMission.Raid"/> and the requested units are a fleet
    /// (design doc §8): the fleet's <paramref name="targetBuildingCoord"/> must lie inside
    /// this territory (a tower can extend it to the coast even when the centre disc alone never reaches it,
    /// so every disc counts) and be on its shore. <see langword="null"/> or empty is treated as a single
    /// zero-radius disc at <paramref name="destination"/>. Ignored for land
    /// armies and for every other mission.
    /// </param>
    /// <param name="isHexFoundable">
    /// Only consulted for <see cref="ArmyMission.Found"/> (issue #55): whether
    /// <paramref name="destination"/> currently clears every claimed
    /// settlement's spacing rule — see
    /// <see cref="Founding.IsHexFoundable"/>. The caller
    /// (<c>ArmyService.DispatchAsync</c>) is the one with database access to
    /// every settlement in the world, so it always supplies this for a Found
    /// dispatch; <see langword="null"/> is only a valid default for every
    /// other mission, which ignores it entirely.
    /// </param>
    /// <param name="renownAndSlotAllowed">
    /// Only consulted for <see cref="ArmyMission.Found"/>: whether the
    /// dispatching player's current renown and settlement count already clear
    /// <see cref="RenownThresholds.AllowsAnotherSettlement"/> — computed
    /// by the caller and resolved here, at dispatch time, exactly once (issue
    /// #55 §6: a convoy already travelling is never invalidated later by a
    /// renown or slot rule that changes after it left).
    /// </param>
    /// <param name="isCampSiteOccupied">
    /// Only consulted for <see cref="ArmyMission.SetUpCamp"/>: whether <paramref name="destination"/> holds a building of any
    /// player, a settlement centre or a wildlife camp (see <see cref="BeachCamp.CheckSite"/>). The caller has the database, so it
    /// supplies this; <see langword="null"/> means nothing stands there.
    /// </param>
    /// <param name="speedFactor">
    /// The world's speed multiplier, mirroring how build/training durations
    /// are scaled in <see cref="Buildings.Settlement.PlanBuild"/>. Defaults to
    /// <c>1.0</c> (no scaling) for callers that have no world in hand.
    /// </param>
    /// <param name="isRiver">
    /// Optional river-tile lookup (issue #159 part A), threaded straight into
    /// every <see cref="HexPathfinder"/> call this makes. <see langword="null"/>
    /// (the default) prices no hex as a river.
    /// </param>
    /// <param name="walls">
    /// The palisade rules for this army's owner (<see cref="PalisadeIndex.ForOwner"/>): every wall hex blocks, a gate of the owner's
    /// passes, a half-open end costs the ground plus <see cref="HexPathfinder.HalfOpenEndCost"/>. <see langword="null"/> (the default) means no wall.
    /// Threaded alongside <c>isRiver</c>/<c>isWideRiver</c> into every route and travel-time query of this method, and into the
    /// same-named parameter of the other planning methods here.
    /// </param>
    /// <param name="isWideRiver">
    /// Which river hexes are wide and so impassable to a land army, threaded alongside
    /// <paramref name="isRiver"/> into every <see cref="HexPathfinder"/> call this makes.
    /// <see langword="null"/> (the default) treats every river hex as a crossable stream.
    /// </param>
    public static DispatchDecision PlanDispatch(
        Settlement settlement,
        HexCoord fromSpot,
        IReadOnlyList<UnitStack> requestedUnits,
        double provisions,
        IReadOnlyList<HexCoord> waypoints,
        HexCoord destination,
        DateTimeOffset now,
        Guid armyId,
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
        ArgumentNullException.ThrowIfNull(requestedUnits);
        ArgumentNullException.ThrowIfNull(waypoints);
        ArgumentNullException.ThrowIfNull(terrainAt);

        var normalisedRequest = requestedUnits.Where(s => s.Count > 0).ToList();

        // Any request with at least one ship is a fleet, for every mission; the non-ship stacks in it are its
        // passengers (docs/design/economy.md, "Troops on ships"). Whether a requested unit type even exists is
        // Settlement.PlanDispatch's job below.
        var isFoundingConvoy = mission == ArmyMission.Found;
        var isFleet = normalisedRequest.Any(s => UnitCatalogue.Get(s.Type).Class == UnitClass.Ship);

        // Ship slots, hunt camp, target settlement, target building and fleet shore rules: shared with
        // PlanFieldOrder, which holds a field order to exactly the same targets.
        var target = ValidateMissionTarget(
            mission, normalisedRequest, settlement.Id, targetSettlementId, targetBuildingCoord, targetClaimDiscs,
            destination, targetCampCoord, targetCampIsWater, targetCampIsSand, terrainAt, giants, targetSpots);
        if (target.Rejection != DispatchRejection.None)
        {
            return DispatchDecision.Rejected(target.Rejection);
        }

        var routeDestination = target.RouteDestination;

        if (isFoundingConvoy)
        {
            var settlerCount = normalisedRequest
                .Where(s => s.Type == UnitType.Settler)
                .Sum(s => s.Count);
            if (settlerCount != Founding.RequiredSettlers)
            {
                return DispatchDecision.Rejected(DispatchRejection.WrongSettlerCount);
            }

            if (!renownAndSlotAllowed)
            {
                return DispatchDecision.Rejected(DispatchRejection.RenownOrSettlementSlotRequirementNotMet);
            }

            if (isHexFoundable is not null && !isHexFoundable(destination))
            {
                return DispatchDecision.Rejected(DispatchRejection.TargetHexNotFoundable);
            }
        }

        var isCampMission = mission == ArmyMission.SetUpCamp;
        if (isCampMission)
        {
            var builderCount = normalisedRequest
                .Where(s => s.Type == UnitType.CampBuilder)
                .Sum(s => s.Count);
            if (builderCount != BeachCamp.RequiredBuilders)
            {
                return DispatchDecision.Rejected(DispatchRejection.WrongCampBuilderCount);
            }

            var siteRejection = BeachCamp.CheckSite(destination, terrainAt, giants, isCampSiteOccupied);
            if (siteRejection != DispatchRejection.None)
            {
                return DispatchDecision.Rejected(siteRejection);
            }
        }

        var settlementDecision = settlement.PlanDispatch(fromSpot, requestedUnits, provisions, now);
        if (!settlementDecision.Accepted)
        {
            return DispatchDecision.Rejected(settlementDecision.Rejection);
        }

        // The camp's cost leaves the stock now, like the provisions (and not out of what the build queue has reserved), and
        // rides in the army's Loot.
        var dispatchedFrom = settlementDecision.Settlement!;
        if (isCampMission)
        {
            if (!dispatchedFrom.TrySpendAvailable(BeachCamp.Cost, now, out var paidForCamp))
            {
                return DispatchDecision.Rejected(DispatchRejection.InsufficientResources);
            }

            dispatchedFrom = dispatchedFrom with { Resources = paidForCamp };
        }

        // A fleet needs every hex of its route to be open sea; a land army
        // needs every hex to be land — same shape, opposite terrain, so one
        // isLandUnit flag threads through both the terrain checks below and
        // every HexPathfinder call for this dispatch.
        var isLandUnit = !isFleet;

        // A land army's Attack/Support destination is always a real settlement's own centre — inherently land — so
        // this check applies to it exactly as before fleets existed. A fleet's Attack/Raid destination is the shore
        // building it was sent at (a shoreline land hex or a sea hex), and its Support destination is the settlement
        // centre, which is land; landing on land is exactly the point for a fleet (see FindPath's isLandUnit remarks
        // on the beaching/harbor exemption it applies at both route endpoints), so this generic sea-only check is
        // skipped for those missions. The real fleet-reachability gate for Attack/Raid is the shore-building check
        // above, not this one. A sea Found convoy's destination is, by definition, the land hex it means to land
        // settlers on (issue #55 §2) — same beaching exemption, no separate shoreline check needed:
        // HexPathfinder can only ever reach that land hex by sea if it is adjacent to reachable open water, which is
        // exactly what "shoreline" means (see Shoreline.IsShoreline); any other land hex fails as UnreachableLeg below.
        if (!SkipsDestinationTerrainCheck(isFleet, mission, targetCampIsSand) && !terrainAt(routeDestination).IsTraversable(isLandUnit))
        {
            return DispatchDecision.Rejected(isFleet
                ? DispatchRejection.DestinationNotSea
                : DispatchRejection.DestinationNotLand);
        }

        foreach (var waypoint in waypoints)
        {
            if (!terrainAt(waypoint).IsTraversable(isLandUnit))
            {
                return DispatchDecision.Rejected(isFleet
                    ? DispatchRejection.WaypointNotSea
                    : DispatchRejection.WaypointNotLand);
            }
        }

        // The army leaves from (and returns to) the garrison spot its units stood at.
        var origin = fromSpot;
        List<HexCoord> stops = [origin, .. waypoints, routeDestination];
        List<HexCoord> fullPath = [origin];

        for (var i = 0; i < stops.Count - 1; i++)
        {
            var search = HexPathfinder.Search(stops[i], stops[i + 1], terrainAt, isLandUnit, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
            if (search.Path is not { Count: > 0 } leg)
            {
                return DispatchDecision.Rejected(
                    search.LimitReached ? DispatchRejection.RouteTooLong
                    : isFleet ? DispatchRejection.NoSeaRoute
                    : DispatchRejection.UnreachableLeg);
            }

            // Drop the joint hex: leg[0] is stops[i], already the last entry added.
            fullPath.AddRange(leg.Skip(1));
        }

        var stacks = settlementDecision.Stacks!;
        var speed = ShipCargo.Pace(stacks);
        var upkeepPerHour = stacks.Sum(s => UnitCatalogue.Get(s.Type).UpkeepPerHour * s.Count);

        var cumulativeHours = HexPathfinder.CumulativeHours(fullPath, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var edgeHours = HexPathfinder.EdgeHours(fullPath, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);

        // The way home is the way out walked backwards: a second search from the destination would be a fresh
        // search with its own node budget and could give up on a trip the outbound search just planned.
        List<HexCoord> returnPath = [.. fullPath];
        returnPath.Reverse();

        var returnCumulativeHours = HexPathfinder.CumulativeHours(returnPath, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var returnEdgeHours = HexPathfinder.EdgeHours(returnPath, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);

        // Every mission, Support included, needs the full round trip: a guest
        // does not burn its own provisions while hosted (Settlement.SettleTo
        // feeds it), but Recall still walks it home on whatever it is
        // carrying, with nobody feeding it on the way — so the same
        // "can it get back" check that gates Move/Attack/Raid has to gate
        // Support too, or a recalled guest starves on the road home.
        // A camp army also stands on the site while the camp is built, and must not be due to turn around before it is up.
        var standingHours = isCampMission ? BeachCamp.ScaledBuildDuration(speedFactor).TotalHours : 0;
        var totalFoodNeeded = (cumulativeHours[^1] + standingHours + returnCumulativeHours[^1]) * upkeepPerHour;

        if (provisions < totalFoodNeeded)
        {
            return DispatchDecision.Rejected(DispatchRejection.InsufficientProvisionsForRoundTrip);
        }

        var movement = Movement.Movement.Create(
            now, fullPath, cumulativeHours, edgeHours, returnPath, returnCumulativeHours, returnEdgeHours, provisions, upkeepPerHour);

        var army = new Army
        {
            Id = armyId,
            SettlementId = settlement.Id,
            HomeSpot = fromSpot,
            Stacks = stacks,
            Location = new ArmyLocation.InTransit(movement),
            Provisions = provisions,
            Mission = mission,
            TargetSettlementId = mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid ? targetSettlementId : null,
            TargetBuildingCoord = mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid ? targetBuildingCoord : null,
            TargetCampCoord = mission == ArmyMission.Hunt ? targetCampCoord : null,
            Loot = isCampMission ? BeachCamp.Cost : default,
        };

        return DispatchDecision.Accept(dispatchedFrom, army);
    }

    /// <summary>
    /// The mission and target rules a dispatch from home (<see cref="PlanDispatch"/>) and a field order
    /// (<see cref="PlanFieldOrder"/>) both hold an army to, in one place: a fleet's passengers need ship slots, a
    /// <see cref="ArmyMission.Hunt"/> needs a camp the units can reach (land units a land camp, ships a water camp, a fleet a sand camp too with land troops aboard), an
    /// Attack/Support/Raid needs a target settlement other than the army's own, a target building only goes with
    /// Attack/Raid, and a fleet Attack/Raid is always sent at one building on the target's shore.
    /// </summary>
    /// <param name="units">The units that will actually travel (zero-count stacks already dropped).</param>
    /// <param name="homeSettlementId">The army's own settlement: "own settlement" means this one.</param>
    /// <param name="destination">
    /// The resolved destination: the target settlement's centre for Attack/Support/Raid, the camp's route hex for a Hunt,
    /// the plain hex for a Move.
    /// </param>
    /// <returns>
    /// The first rule broken, or <see cref="DispatchRejection.None"/> with the hex the route really ends on: the shore
    /// building for a fleet Attack/Raid, otherwise <paramref name="destination"/>.
    /// </returns>
    private static (DispatchRejection Rejection, HexCoord RouteDestination) ValidateMissionTarget(
        ArmyMission mission,
        IReadOnlyList<UnitStack> units,
        Guid homeSettlementId,
        Guid? targetSettlementId,
        HexCoord? targetBuildingCoord,
        IReadOnlyList<(HexCoord Centre, int Radius)>? targetClaimDiscs,
        HexCoord destination,
        HexCoord? targetCampCoord,
        bool targetCampIsWater,
        bool targetCampIsSand,
        Func<HexCoord, Terrain> terrainAt,
        IGiantIndex? giants,
        IReadOnlyList<GarrisonSpot>? targetSpots)
    {
        var classes = units.Select(s => UnitCatalogue.Get(s.Type).Class).ToHashSet();
        var isFleet = classes.Contains(UnitClass.Ship);

        if (isFleet)
        {
            // Passengers need slots on the ships, whatever the mission.
            if (ShipCargo.SlotsNeeded(ShipCargo.Passengers(units)) > ShipCargo.SlotsOffered(units))
            {
                return (DispatchRejection.InsufficientShipCapacity, destination);
            }
        }

        if (mission == ArmyMission.Hunt)
        {
            // The camp itself is looked up by the caller, which passes its hex as targetCampCoord only when one
            // exists (and says whether it stands on the sea). Land units hunt land camps and fleets hunt water
            // camps (the whale road); a fleet also hunts a sand camp (a haul-out) with the land troops it carries (they fight,
            // the ships do not), so it needs some aboard. Any other land camp is out of a fleet's reach, and land units cannot
            // reach a water camp.
            if (targetCampCoord is null)
            {
                return (DispatchRejection.NoCampAtDestination, destination);
            }

            if (isFleet && !targetCampIsWater && !(targetCampIsSand && ShipCargo.Passengers(units).Count > 0))
            {
                return (DispatchRejection.HuntRequiresLandUnits, destination);
            }

            if (!isFleet && targetCampIsWater && classes.Count > 0)
            {
                return (DispatchRejection.HuntRequiresFleet, destination);
            }
        }

        if (mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid)
        {
            if (targetSettlementId is null)
            {
                return (DispatchRejection.TargetSettlementRequired, destination);
            }

            if (targetSettlementId == homeSettlementId)
            {
                return (mission == ArmyMission.Support
                    ? DispatchRejection.CannotSupportOwnSettlement
                    : DispatchRejection.CannotAttackOwnSettlement, destination);
            }
        }

        // Shape validation only — whether a building actually stands at this
        // coordinate on the target settlement is checked at resolution time
        // (see TargetBuildingCoord's remarks), since the layout can change
        // before the army arrives. All this rejects is "a target building was
        // named for a mission that has no battle to apply it in". Raid mirrors
        // Attack here — a raid can carry catapults just as an attack can (the
        // design doc places no restriction on this), even though it usually
        // wouldn't.
        if (targetBuildingCoord is not null && mission is not (ArmyMission.Attack or ArmyMission.Raid or ArmyMission.Support))
        {
            return (DispatchRejection.TargetBuildingRequiresAttackMission, destination);
        }

        // A guest joins one garrison spot of its host: the target building names it, and the spot must be able to hold
        // every one of the army's units. The army walks to that spot and stands there.
        if (mission == ArmyMission.Support)
        {
            if (targetBuildingCoord is not { } supportSpot)
            {
                return (DispatchRejection.SupportSpotRequired, destination);
            }

            var spot = targetSpots?.FirstOrDefault(s => s.Coord == supportSpot);
            if (spot is null || !spot.HoldsAll(units))
            {
                return (DispatchRejection.SupportSpotCannotHold, destination);
            }

            return (DispatchRejection.None, supportSpot);
        }

        // A fleet Attack/Raid is always sent at one building on the target's shore: it sails to that building's
        // hex, the fight happens there, and a won fight damages only that building. The target's Longhouse may be
        // inland. "On the shore" = inside the target's claim and either a shoreline land hex or a sea hex (the
        // coastal-water buildings: Dockyard, Fishing Hut, Shrine of Njörd). Whether a building actually stands there
        // is checked at arrival, like for catapults. Land armies are unaffected.
        if (mission is ArmyMission.Attack or ArmyMission.Raid && isFleet)
        {
            if (targetBuildingCoord is not { } shoreBuilding)
            {
                return (DispatchRejection.FleetTargetBuildingRequired, destination);
            }

            IReadOnlyList<(HexCoord Centre, int Radius)> discs =
                targetClaimDiscs is { Count: > 0 } ? targetClaimDiscs : [(destination, 0)];
            // The territory rule, not the raw disc union: a giant hex only geometrically inside a disc but not
            // actually claimed must not count as the defender's shore either.
            var onShore = Territory.Claims(discs, shoreBuilding, giants ?? GiantIndex.Empty)
                && (terrainAt(shoreBuilding) == Terrain.Sea || Shoreline.IsShoreline(shoreBuilding, terrainAt));
            if (!onShore)
            {
                return (DispatchRejection.FleetTargetBuildingNotOnShore, destination);
            }

            return (DispatchRejection.None, shoreBuilding);
        }

        return (DispatchRejection.None, destination);
    }

    /// <summary>
    /// Whether a route to <paramref name="mission"/>'s destination skips the generic "destination must be traversable
    /// for this unit kind" check: a fleet landing on a settlement (Attack/Support/Raid) or on a founding site (Found)
    /// ends on land, which is exactly the point (see <see cref="HexPathfinder.FindPath"/>'s beaching exemption at both
    /// route endpoints). The real fleet-reachability gate for Attack/Raid is the shore-building check.
    /// </summary>
    private static bool SkipsDestinationTerrainCheck(bool isFleet, ArmyMission mission, bool targetCampIsSand) =>
        isFleet && (mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid or ArmyMission.Found
            or ArmyMission.SetUpCamp
            || (mission == ArmyMission.Hunt && targetCampIsSand));

    /// <summary>
    /// Settles an <see cref="ArmyMission.Attack"/> or <see cref="ArmyMission.Raid"/>
    /// army's arrival at its target: if <paramref name="now"/> has reached the
    /// outbound leg's <see cref="Movement.ArrivesAt"/>, the battle happens
    /// right there — no standing at the destination the way <see cref="Move"/>
    /// allows — and this returns the fought-out <see cref="BattlePlan"/>
    /// alongside the updated army and defender settlement. A
    /// <see cref="ArmyMission.Raid"/> army fights through
    /// <see cref="BattleResolver.Resolve"/>'s <c>raid: true</c> path (reduced,
    /// capped losses on both sides — issue #40 phase 7); everything else
    /// (guest combining, loot, siege) is identical to <see cref="ArmyMission.Attack"/>.
    /// Otherwise (mid-journey, already on the return leg, or a
    /// <see cref="Move"/>/<see cref="Support"/>-mission army) this is a no-op:
    /// <see cref="ArmyArrivalResult.Fought"/> is <see langword="false"/> and
    /// both aggregates come back unchanged, so a caller can call this
    /// unconditionally before falling back to plain <see cref="SettleTo"/>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <paramref name="defenderSettlement"/> must be the defender's own
    /// aggregate — not yet settled to the battle instant, that is this
    /// method's job (mirroring how <c>Settlement.SettleTo</c> is always
    /// called before other settlement operations elsewhere): it is settled to
    /// the exact arrival instant first, so the garrison and food the battle
    /// sees are correct for that moment, the battle applies, and only then is
    /// the defender settled forward again to <paramref name="now"/> so
    /// ordinary production/starvation since the battle still happens.
    /// </para>
    /// <para>
    /// A wiped-out attacker (<see cref="BattlePlan.AttackerSurvivors"/> empty)
    /// simply ceases to exist — <see cref="ArmyArrivalResult.Army"/> comes
    /// back <see langword="null"/>, and the caller (<c>ArmyService</c>)
    /// removes the row rather than starting a return trip for zero units.
    /// Otherwise the survivors (plus <see cref="Loot"/>) are put straight onto
    /// the already-precomputed <see cref="Movement.ReturnPath"/>/
    /// <see cref="Movement.ReturnCumulativeHours"/> — no new pathfinding is
    /// needed, since that leg was already computed at dispatch.
    /// </para>
    /// <para>
    /// Simultaneous-arrival note (issue #40 design doc): this does not by
    /// itself impose an order between two different attackers landing on the
    /// same settlement in the same settle pass — the caller is responsible
    /// for processing due arrivals one at a time in a stable order (e.g. by
    /// <see cref="Id"/>) if that situation can occur. A real total order over
    /// simultaneous combat events is a nice-to-have, not required by issue #40
    /// phase 3.
    /// </para>
    /// </remarks>
    /// <param name="defenderRealm">
    /// The defender's chain-rule realm (<see cref="ConnectedRealm"/>, including the player's other settlements on the island),
    /// or <see langword="null"/> to resolve the defender alone. Only connected towers count for the defence bonus.
    /// </param>
    public static ArmyArrivalResult SettleArrival(
        Army army, Settlement defenderSettlement, double defenderSpeedFactor, DateTimeOffset now, int seed,
        IReadOnlyList<UnitStack>? guestDefenderStacks = null,
        double landAttackBonusPercent = 0,
        double shipAttackBonusPercent = 0,
        ConnectedRealm? defenderRealm = null,
        Func<HexCoord, Terrain>? terrainAt = null)
    {
        ArgumentNullException.ThrowIfNull(army);
        ArgumentNullException.ThrowIfNull(defenderSettlement);
        if (army.IsFleet)
        {
            ArgumentNullException.ThrowIfNull(terrainAt);
        }

        if (army.Mission is not (ArmyMission.Attack or ArmyMission.Raid)
            || army.Location is not ArmyLocation.InTransit { Movement.IsReturning: false } inTransit
            || now < inTransit.Movement.ArrivesAt)
        {
            return new ArmyArrivalResult(army, defenderSettlement, Fought: false, Battle: null, GuestLosses: [], Siege: null, Attack: null);
        }

        guestDefenderStacks ??= [];

        var movement = inTransit.Movement;
        var battleInstant = movement.ArrivesAt;

        // The defender as of the exact instant the attacker lands — not
        // "now", which may be later — so the garrison and stock the battle
        // sees are the ones that were actually there. Deliberately not
        // guest-aware here (issue #40 phase 4 simplification): folding guest
        // upkeep into this specific settle-to-instant call would mean also
        // propagating a second, mid-battle cross-aggregate starvation death
        // list, on top of the one this method already produces for combat
        // losses. Guest starvation is instead applied continuously by the
        // ordinary SettlementService read/write path (see
        // Settlement.SettleTo's guestStacks parameter) — the same
        // last-time-anyone-looked staleness the engine already accepts for
        // ordinary garrison starvation between reads.
        var settledDefender = defenderSettlement.SettleTo(battleInstant, defenderSpeedFactor).Settlement;

        // Only a tower connected to a longhouse (ConnectedRealm) adds its defence bonus; a cut-off one claims and defends nothing.
        var towerLevel = (defenderRealm ?? ConnectedRealm.Resolve([settledDefender.AsRealmSettlement()]))
            .HighestConnectedTowerLevel(settledDefender.Id, settledDefender.Buildings);
        var defenseBonusPercent = BuildingCatalogue.TowerDefenseBonusPercent(towerLevel);

        var lootAvailable = settledDefender.Resources.At(battleInstant);

        // Guest armies fight alongside the home garrison (issue #40 phase 4 §3): their stacks are merged, by type, into the defense
        // side of each fight, so combined defense power (and hence the win/loss outcome itself) reflects everyone standing on the
        // wall. A land army fights the defender's land units; a fleet fights the defender's ships first and then lands what is still
        // aboard against the land units (AttackResolver, docs/design/economy.md "Fleets"). The defender's pooled losses are split
        // back home/guest inside the resolver (ProportionalAllocator, see its remarks). A second split, of the guest total across
        // the actual guest Army records, happens one layer up in ArmyService — this method only knows the pooled guest total, never
        // individual guest armies, to keep it DB-free.
        //
        // The provisions the (pre-battle, full-strength) army still carries at the battle instant: what it burned reaching it is gone,
        // and a won land fight refills them from the target's food (docs/design/troop-movement-range.md section 1b).
        var provisionsAtBattle = army.ProvisionsAt(battleInstant);
        var attack = AttackResolver.Resolve(
            army.Stacks, settledDefender.Garrison, guestDefenderStacks, defenseBonusPercent, lootAvailable, seed,
            raid: army.Mission == ArmyMission.Raid,
            landAttackBonusPercent: landAttackBonusPercent,
            shipAttackBonusPercent: shipAttackBonusPercent,
            army.TargetBuildingCoord, settledDefender.Buildings, terrainAt, provisionsAtBattle);
        var plan = attack.Overall;

        // Loot leaves the defender's stock at the instant of battle even
        // though it does not reach the attacker's own stock until the
        // survivors physically get home (see Loot's remarks) — it is gone
        // from the defender either way. So is the food that refilled the army's provisions.
        var afterLoot = settledDefender.Resources.TrySpend(
            plan.LootTaken + new ResourceAmounts(0, 0, attack.Refill, 0), battleInstant, out var spent)
            ? spent
            : settledDefender.Resources.SettledTo(battleInstant);

        // Loot deliberately reaches into reserved resources too (taking them
        // is the entire point of a raid) — a reservation is only unspendable
        // by the settlement's own economy (issue #158 stage 1c). If the raid
        // took the stock below what the waiting queue has earmarked, the
        // first unfunded waiting order and everything behind it is dropped
        // at this same instant, not whenever someone next looks.
        settledDefender = (settledDefender with { Resources = afterLoot }).DropUnfundedOrders(battleInstant);

        var guestLosses = attack.DefenderGuestLosses;
        var homeLosses = attack.DefenderHomeLosses;

        // The home losses come off the spots pro rata per type (Settlement.WithHomeDeaths).
        var defenderPostBattle = settledDefender.WithHomeDeaths(homeLosses) with { Resources = afterLoot };

        // Building damage (issue #40 phase 5): the Fire Ships' fire first, then the siege engines' (only after a won land fight),
        // both already worked out by the resolver. Applied to Buildings before the forward SettleTo below, so the resulting
        // production/capacity totals (and hence any starvation the loss of a Farm/FishingHut/PumpkinFarm triggers) already reflect
        // the damage — Settlement.SettleTo recomputes both from Buildings on every call, nothing extra is needed here for that
        // to fall out correctly. Each step drops any build order still targeting a hex it destroyed outright, or the next SettleTo
        // would find nothing standing there and silently rebuild it (issue #158 stage 1b).
        var siege = attack.LandSiege;
        foreach (var step in new[] { attack.FireSiege, attack.LandSiege })
        {
            if (step.Applied)
            {
                defenderPostBattle = defenderPostBattle.WithSiegeDamage(
                    step.UpdatedBuildings!, step.TargetCoord!.Value, battleInstant, defenderSpeedFactor, guestDefenderStacks);
            }
        }

        var finalDefender = defenderPostBattle.SettleTo(now, defenderSpeedFactor).Settlement;

        var survivorCount = plan.AttackerSurvivors.Sum(s => s.Count);
        if (survivorCount == 0)
        {
            return new ArmyArrivalResult(null, finalDefender, Fought: true, plan, guestLosses, siege, attack);
        }

        var returning = new Movement.Movement
        {
            DepartedAt = battleInstant,
            Path = movement.ReturnPath,
            CumulativeHours = movement.ReturnCumulativeHours,
            EdgeHours = movement.ReturnEdgeHours,
            ReturnPath = movement.ReturnPath,
            ReturnCumulativeHours = movement.ReturnCumulativeHours,
            ReturnEdgeHours = movement.ReturnEdgeHours,
            TurnAroundAt = battleInstant,
            IsReturning = true,
            // A battle-forced retreat is immune to further interception
            // (issue #206 §5) — not something a player triggers on demand,
            // unlike a voluntary Recall.
            RetreatImmune = true,
        };

        // Provisions are rebased to what the army carried at the battle instant, plus what the win refilled (same trick
        // SettleTo's turn-around branch uses for Move).
        var survivorArmy = (army with
        {
            Stacks = plan.AttackerSurvivors,
            Location = new ArmyLocation.InTransit(returning),
            Loot = plan.LootTaken,
        }).WithProvisionsAt(battleInstant, provisionsAtBattle + attack.Refill);

        return new ArmyArrivalResult(survivorArmy, finalDefender, Fought: true, plan, guestLosses, siege, attack);
    }

    /// <summary>
    /// The army after a hunt fought at <paramref name="battleInstant"/> (the outbound leg's arrival): the
    /// survivors of <paramref name="plan"/>, carrying <see cref="CampFightPlan.Loot"/>, are put straight onto the
    /// precomputed return leg, retreat-immune like <see cref="SettleArrival"/>'s survivors, with the provisions
    /// burned on the way out already deducted. Returns <see langword="null"/> when nobody survived.
    /// An empty-camp pickup is a plan with every unit surviving, so it turns the army home the same way.
    /// </summary>
    /// <exception cref="InvalidOperationException">The army is not on its outbound leg.</exception>
    public Army? SettleHuntArrival(CampFightPlan plan, DateTimeOffset battleInstant)
    {
        ArgumentNullException.ThrowIfNull(plan);

        if (Location is not ArmyLocation.InTransit { Movement.IsReturning: false } inTransit)
        {
            throw new InvalidOperationException("A hunt can only be settled on the outbound leg.");
        }

        if (plan.ArmySurvivors.Sum(s => s.Count) == 0)
        {
            return null;
        }

        var movement = inTransit.Movement;
        var provisionsAtBattle = ProvisionsAt(battleInstant);

        var returning = new Movement.Movement
        {
            DepartedAt = battleInstant,
            Path = movement.ReturnPath,
            CumulativeHours = movement.ReturnCumulativeHours,
            EdgeHours = movement.ReturnEdgeHours,
            ReturnPath = movement.ReturnPath,
            ReturnCumulativeHours = movement.ReturnCumulativeHours,
            ReturnEdgeHours = movement.ReturnEdgeHours,
            TurnAroundAt = battleInstant,
            IsReturning = true,
            RetreatImmune = true,
        };

        // What the army carried at the battle instant, plus the food the win took from the camp to refill it.
        return (this with
        {
            Stacks = plan.ArmySurvivors,
            Location = new ArmyLocation.InTransit(returning),
            Loot = plan.Loot,
        }).WithProvisionsAt(battleInstant, provisionsAtBattle + plan.Refill);
    }

    /// <summary>
    /// Whether a settlement's centre can harbour ships (<see cref="Settlement.CentreHarboursShips"/>): it is sand and a
    /// shoreline hex (<see cref="Shoreline.IsShoreline"/>). The one place that rule is read off the terrain.
    /// </summary>
    public static bool CentreHarbours(HexCoord centre, Func<HexCoord, Terrain> terrainAt)
    {
        ArgumentNullException.ThrowIfNull(terrainAt);
        return terrainAt(centre) == Terrain.Sand && Shoreline.IsShoreline(centre, terrainAt);
    }

    /// <summary>
    /// The settlement's harbour spot: where its ships stand. The centre when it harbours ships (sand next to the sea, see
    /// <see cref="CentreHarbours"/>), otherwise the Dockyard nearest the centre (ties by Q, then R); the centre when there is
    /// no Dockyard either.
    /// </summary>
    public static HexCoord FleetAnchor(HexCoord centre, IEnumerable<PlacedBuilding> buildings, Func<HexCoord, Terrain> terrainAt)
    {
        ArgumentNullException.ThrowIfNull(buildings);
        ArgumentNullException.ThrowIfNull(terrainAt);

        if (CentreHarbours(centre, terrainAt))
        {
            return centre;
        }

        return buildings
            .Where(b => b.Type == BuildingType.Dockyard && b.IsFunctioning)
            .Select(b => b.Coord)
            .OrderBy(c => c.DistanceTo(centre)).ThenBy(c => c.Q).ThenBy(c => c.R)
            .Cast<HexCoord?>()
            .FirstOrDefault() ?? centre;
    }

    /// <inheritdoc cref="FleetAnchor(HexCoord, IEnumerable{PlacedBuilding}, Func{HexCoord, Terrain})"/>
    public static HexCoord FleetAnchor(Settlement settlement, Func<HexCoord, Terrain> terrainAt)
    {
        ArgumentNullException.ThrowIfNull(settlement);
        return FleetAnchor(settlement.Centre, settlement.Buildings, terrainAt);
    }

    /// <summary>
    /// A march of <paramref name="stacks"/> from <paramref name="from"/> to the garrison spot <paramref name="spot"/> of
    /// <paramref name="settlementId"/> (the army's new home), departing <paramref name="now"/>: the shape of a recall, a
    /// returning movement. The army's provisions are left at zero for the caller to set (<see cref="SpotMarch.FoodNeeded"/> is
    /// what the walk burns). <see langword="null"/> when no route exists.
    /// </summary>
    public static SpotMarch? PlanSpotMarch(
        Guid armyId, Guid settlementId, HexCoord spot, IReadOnlyList<UnitStack> stacks, HexCoord from, DateTimeOffset now,
        Func<HexCoord, Terrain> terrainAt, double speedFactor = 1.0, Func<HexCoord, bool>? isRiver = null,
        Func<HexCoord, bool>? isWideRiver = null, WallRules? walls = null)
    {
        ArgumentNullException.ThrowIfNull(stacks);
        ArgumentNullException.ThrowIfNull(terrainAt);

        var isLandUnit = !stacks.Any(s => UnitCatalogue.Get(s.Type).Class == UnitClass.Ship);
        var path = from == spot
            ? [from]
            : HexPathfinder.FindPath(from, spot, terrainAt, isLandUnit, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        if (path is null || path.Count == 0)
        {
            return null;
        }

        var speed = ShipCargo.Pace(stacks);
        var cumulativeHours = HexPathfinder.CumulativeHours(path, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var edgeHours = HexPathfinder.EdgeHours(path, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);

        var movement = new Movement.Movement
        {
            DepartedAt = now,
            Path = path,
            CumulativeHours = cumulativeHours,
            EdgeHours = edgeHours,
            ReturnPath = path,
            ReturnCumulativeHours = cumulativeHours,
            ReturnEdgeHours = edgeHours,
            TurnAroundAt = now,
            IsReturning = true,
        };

        var army = new Army
        {
            Id = armyId,
            SettlementId = settlementId,
            HomeSpot = spot,
            Stacks = stacks,
            Location = new ArmyLocation.InTransit(movement),
            Provisions = 0,
        };

        var upkeep = stacks.Sum(s => UnitCatalogue.Get(s.Type).UpkeepPerHour * s.Count);
        return new SpotMarch(army, cumulativeHours[^1] * upkeep);
    }

    /// <summary>
    /// The units of every guest in <paramref name="armies"/> standing as a guest at <paramref name="spot"/> of
    /// <paramref name="hostId"/>, pooled by type: with <see cref="Settlement.GarrisonAt"/>, everything one spot holds.
    /// </summary>
    public static IReadOnlyList<UnitStack> GuestsAt(IEnumerable<Army> armies, Guid hostId, HexCoord spot)
    {
        ArgumentNullException.ThrowIfNull(armies);
        return
        [
            .. armies
                .Where(a => a.Location is ArmyLocation.Supporting s && s.HostSettlementId == hostId && s.Spot == spot)
                .SelectMany(a => a.Stacks)
                .Where(s => s.Count > 0)
                .GroupBy(s => s.Type).OrderBy(g => (int)g.Key)
                .Select(g => new UnitStack(g.Key, g.Sum(s => s.Count))),
        ];
    }

    /// <summary>
    /// Whether this army's food covers its way home: on its return leg, what it carries now; still outbound, what is left when
    /// it reaches its destination. <see langword="false"/> for an army that is not on a movement.
    /// </summary>
    public bool AffordsWayHome
    {
        get
        {
            if (Location is not ArmyLocation.InTransit { Movement: var m })
            {
                return false;
            }

            var carried = m.IsReturning ? Provisions : Provisions - (m.CumulativeHours[^1] * TotalUpkeepPerHour);
            return carried + 1e-9 >= m.ReturnCumulativeHours[^1] * TotalUpkeepPerHour;
        }
    }

    /// <summary>The hours of this army's way home (the whole return leg). Zero for an army that is not on a movement.</summary>
    public double WayHomeHours => Location is ArmyLocation.InTransit { Movement: var m } ? m.ReturnCumulativeHours[^1] : 0;

    /// <summary>
    /// This army with its way home rebuilt to <paramref name="newHome"/> (its new <see cref="HomeSpot"/>) from where it stands
    /// at <paramref name="now"/>: <see langword="null"/> when it is not out in the field (at home, or a guest) or no route
    /// exists. An army still on its outbound leg keeps its outbound route and gets the new return leg appended from its
    /// destination; one already returning is re-routed from where it is.
    /// </summary>
    public Army? RehomedTo(
        HexCoord newHome, DateTimeOffset now, Func<HexCoord, Terrain> terrainAt, double speedFactor = 1.0,
        Func<HexCoord, bool>? isRiver = null, Func<HexCoord, bool>? isWideRiver = null, WallRules? walls = null)
    {
        ArgumentNullException.ThrowIfNull(terrainAt);

        if (Location is not ArmyLocation.InTransit { Movement: var movement })
        {
            return null;
        }

        var isLandUnit = !IsFleet;
        var speed = TotalSpeed;

        if (movement.IsReturning)
        {
            var march = PlanSpotMarch(Id, SettlementId, newHome, Stacks, movement.PositionAt(now), now, terrainAt, speedFactor, isRiver, isWideRiver, walls);
            return march is null
                ? null
                : this with { Location = march.Army.Location, Provisions = ProvisionsAt(now), HomeSpot = newHome };
        }

        // Outbound: the route out stays as it is; only the way back changes, from the destination to the new home.
        var destination = movement.Path[^1];
        var back = HexPathfinder.FindPath(destination, newHome, terrainAt, isLandUnit, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        if (back is not { Count: > 0 })
        {
            return null;
        }

        var returnCumulative = HexPathfinder.CumulativeHours(back, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var returnEdge = HexPathfinder.EdgeHours(back, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var rebuilt = Movement.Movement.Create(
            movement.DepartedAt, movement.Path, movement.CumulativeHours, movement.EdgeHours, back, returnCumulative, returnEdge,
            Provisions, TotalUpkeepPerHour);
        return this with { Location = new ArmyLocation.InTransit(rebuilt), HomeSpot = newHome };
    }

    /// <summary>
    /// The hex a <see cref="ArmyMission.Hunt"/> route ends on: the camp's own hex when the hunters can stand on it
    /// (always for a fleet at a water camp: the whale road's own sea hex), otherwise its traversable neighbour nearest to
    /// <paramref name="from"/> (ties by neighbour order). Falls back to the camp's hex when no neighbour is traversable
    /// either, so the dispatch is refused as an unwalkable destination.
    /// </summary>
    /// <param name="isFleet">The hunters are ships (they traverse sea, not land).</param>
    public static HexCoord HuntRouteDestination(
        HexCoord camp, HexCoord from, Func<HexCoord, Terrain> terrainAt, bool isFleet = false)
    {
        ArgumentNullException.ThrowIfNull(terrainAt);

        var isLandUnit = !isFleet;
        if (terrainAt(camp).IsTraversable(isLandUnit))
        {
            return camp;
        }

        return camp.Neighbours()
            .Where(n => terrainAt(n).IsTraversable(isLandUnit))
            .OrderBy(n => n.DistanceTo(from))
            .Cast<HexCoord?>()
            .FirstOrDefault() ?? camp;
    }

    /// <summary>Merges two stack lists into one, aggregated by type.</summary>
    internal static IReadOnlyList<UnitStack> MergeStacksByType(
        IReadOnlyList<UnitStack> a, IReadOnlyList<UnitStack> b) =>
        a.Concat(b)
            .GroupBy(s => s.Type)
            .Select(g => new UnitStack(g.Key, g.Sum(s => s.Count)))
            .ToList();

    /// <summary>Subtracts <paramref name="losses"/> from <paramref name="stacks"/>, per type, dropping a type that reaches zero.</summary>
    internal static IReadOnlyList<UnitStack> SubtractStacks(
        IReadOnlyList<UnitStack> stacks, IReadOnlyList<UnitStack> losses)
    {
        var lossByType = losses.ToDictionary(s => s.Type, s => s.Count);
        return stacks
            .Select(s => s with { Count = s.Count - lossByType.GetValueOrDefault(s.Type) })
            .Where(s => s.Count > 0)
            .ToList();
    }

    /// <summary>
    /// Splits <paramref name="pooled"/> (a per-type total already computed
    /// against the home+guest combined pool) into the home share or the guest
    /// share, per <see cref="ProportionalAllocator"/> — see
    /// <see cref="SettleArrival"/>'s remarks.
    /// </summary>
    internal static IReadOnlyList<UnitStack> SplitPooledByOwner(
        IReadOnlyList<UnitStack> pooled,
        IReadOnlyList<UnitStack> homeStacks,
        IReadOnlyList<UnitStack> guestStacks,
        bool wantHome)
    {
        var result = new List<UnitStack>();
        foreach (var entry in pooled)
        {
            var homeCount = homeStacks.FirstOrDefault(s => s.Type == entry.Type).Count;
            var guestCount = guestStacks.FirstOrDefault(s => s.Type == entry.Type).Count;
            var split = ProportionalAllocator.Allocate(entry.Count, [homeCount, guestCount]);
            var share = wantHome ? split[0] : split[1];
            if (share > 0)
            {
                result.Add(new UnitStack(entry.Type, share));
            }
        }

        return result;
    }

    /// <summary>
    /// Settles an <see cref="ArmyMission.Support"/> army's arrival at its
    /// host: once <paramref name="now"/> reaches the outbound leg's arrival,
    /// the army stops travelling and starts standing as a guest at
    /// <see cref="TargetSettlementId"/> — see <see cref="ArmyLocation.Supporting"/>.
    /// Unlike <see cref="ArmyMission.Attack"/> there is no battle, and unlike
    /// <see cref="ArmyMission.Move"/> there is no auto-return leg to start: a
    /// support army simply stays put until its owner calls
    /// <see cref="Recall"/>. A no-op (<see cref="ArmySupportArrivalResult.Arrived"/>
    /// <see langword="false"/>, the army unchanged) before arrival, on the
    /// return leg, or for any other mission — so a caller can call this
    /// unconditionally before falling back to plain <see cref="SettleTo"/>,
    /// mirroring <see cref="SettleArrival"/>'s own contract.
    /// </summary>
    public static ArmySupportArrivalResult SettleSupportArrival(Army army, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(army);

        if (army.Mission != ArmyMission.Support
            || army.Location is not ArmyLocation.InTransit { Movement.IsReturning: false } inTransit
            || now < inTransit.Movement.ArrivesAt)
        {
            return new ArmySupportArrivalResult(army, Arrived: false);
        }

        var movement = inTransit.Movement;

        // Rebase provisions to what was actually burned reaching the host —
        // same trick SettleTo's turn-around branch and SettleArrival's
        // battle-instant branch use.
        var elapsedHours = (movement.ArrivesAt - movement.DepartedAt).TotalHours;
        var provisionsAtArrival = Math.Max(0, army.Provisions - (army.TotalUpkeepPerHour * elapsedHours));

        var arrived = army with
        {
            Location = new ArmyLocation.Supporting(army.TargetSettlementId!.Value, army.TargetBuildingCoord!.Value),
            Provisions = provisionsAtArrival,
        };

        return new ArmySupportArrivalResult(arrived, Arrived: true);
    }

    /// <summary>
    /// Decides, at the instant an <see cref="ArmyMission.Found"/> convoy
    /// reaches its target hex, whether founding actually happens (issue #55
    /// §5/§6). A pure decision only — creating the new settlement, an entity
    /// touching the settlement/user aggregates and requiring a fresh id, is
    /// the infrastructure layer's job (<c>ArmyService.ResolveFoundingAsync</c>),
    /// mirroring how <see cref="SettleArrival"/> itself never writes a
    /// <c>BattleReportEntity</c>.
    /// </summary>
    /// <param name="targetStillFoundable">
    /// Whether the target hex still clears the spacing rule as of
    /// <paramref name="now"/> (see <see cref="Founding.IsHexFoundable"/>) —
    /// re-checked at arrival, not trusted from dispatch time, since someone
    /// else may have claimed nearby territory in the meantime (issue #55 §6).
    /// When <see langword="false"/>, this is a no-op: the caller falls back to
    /// plain <see cref="SettleTo"/>, which treats an arrived-but-not-yet-
    /// turned-around <see cref="ArmyMission.Found"/> army exactly like a
    /// <see cref="ArmyMission.Move"/> one — it simply stands at the hex,
    /// auto-returns once provisions demand it, and can be recalled
    /// (<see cref="Recall"/>) or redirected (<see cref="RetargetFounding"/>)
    /// in the meantime. That is this issue's answer to "target hex claimed
    /// mid-transit": the mission is never silently lost, just never founds
    /// until either the hex frees up again or the player moves it.
    /// </param>
    public static FoundingArrivalResult PlanFoundingArrival(Army army, DateTimeOffset now, bool targetStillFoundable)
    {
        ArgumentNullException.ThrowIfNull(army);

        if (army.Mission != ArmyMission.Found
            || army.Location is not ArmyLocation.InTransit { Movement.IsReturning: false } inTransit
            || now < inTransit.Movement.ArrivesAt)
        {
            return new FoundingArrivalResult(Arrived: false, ShouldFound: false, army, [], default);
        }

        if (!targetStillFoundable)
        {
            return new FoundingArrivalResult(Arrived: true, ShouldFound: false, army, [], default);
        }

        var targetHex = inTransit.Movement.Path[^1];

        // Exactly RequiredSettlers were required at dispatch (PlanDispatch's
        // WrongSettlerCount rejection), so every Settler stack present
        // is consumed entire; whatever else travelled along (ships that
        // carried them, any escort) is what the new settlement starts with —
        // "undefended except for any escort units that travelled with the
        // convoy" (issue #55 §5). Ships are not a sensible land garrison, but
        // this deliberately does not special-case them out: a player who
        // sailed settlers over with no other escort ends up with the ships
        // themselves as the only "defenders", exactly as reasonable a v1
        // reading of "leaves it undefended except escorts" as any other.
        var garrisonForNewSettlement = army.Stacks.Where(s => s.Type != UnitType.Settler).ToList();

        return new FoundingArrivalResult(
            Arrived: true, ShouldFound: true, Army: null, GarrisonForNewSettlement: garrisonForNewSettlement, FoundedAt: targetHex);
    }

    /// <summary>
    /// Decides whether an <see cref="ArmyMission.SetUpCamp"/> army has stood on its site long enough
    /// (<see cref="Movement.ArrivesAt"/> plus <see cref="BeachCamp.ScaledBuildDuration"/>) for the camp to be up, and if so
    /// whether the site is still free. A pure decision; creating the settlement is <c>ArmyService.ResolveCampAsync</c>'s job.
    /// A recalled army (<see cref="Movement.IsReturning"/>) is never due: recalling during the build cancels the camp.
    /// When the site is no longer free the caller settles the army the ordinary way: it stands, auto-returns and can be
    /// recalled, and its <see cref="Loot"/> (the camp's cost) comes home with it.
    /// </summary>
    /// <param name="siteStillFree">The site rule (<see cref="BeachCamp.CheckSite"/>) re-checked as of the completion instant.</param>
    public static CampBuildResult PlanCampBuild(Army army, DateTimeOffset now, double speedFactor, bool siteStillFree)
    {
        ArgumentNullException.ThrowIfNull(army);

        if (army.Mission != ArmyMission.SetUpCamp
            || army.Location is not ArmyLocation.InTransit { Movement.IsReturning: false } inTransit)
        {
            return new CampBuildResult(false, false, default, default, [], 0);
        }

        var completesAt = inTransit.Movement.ArrivesAt + BeachCamp.ScaledBuildDuration(speedFactor);
        var site = inTransit.Movement.Path[^1];
        if (now < completesAt)
        {
            return new CampBuildResult(false, false, site, completesAt, [], 0);
        }

        if (!siteStillFree)
        {
            return new CampBuildResult(true, false, site, completesAt, [], 0);
        }

        // The camp builders are used up; whatever else travelled along (troops, the ships that carried them) garrisons the camp.
        var garrison = army.Stacks.Where(s => s.Type != UnitType.CampBuilder).ToList();
        return new CampBuildResult(true, true, site, completesAt, garrison, army.ProvisionsAt(completesAt));
    }

    /// <summary>
    /// Redirects an <see cref="ArmyMission.Found"/> convoy to a different
    /// target hex — issue #55 §6's "retargetable" edge case, for when the
    /// original target was claimed by someone else mid-transit (see
    /// <see cref="PlanFoundingArrival"/>) and the player would rather try
    /// somewhere else than recall all the way home. Works whether the convoy
    /// is still travelling or already standing/parked at the old target — in
    /// both cases a fresh route is planned from wherever it currently is.
    /// </summary>
    /// <remarks>
    /// Mirrors <see cref="Recall"/>'s shape closely — same current-position
    /// derivation, same <see cref="HexPathfinder"/> call — but the new
    /// <see cref="Movement"/> is an outbound Found leg to
    /// <paramref name="newTarget"/>, not a trip home: it gets its own
    /// precomputed <see cref="Movement.ReturnPath"/> back to
    /// <paramref name="home"/> so the round-trip food check
    /// (<see cref="Army.PlanDispatch"/>'s own logic, reapplied here against
    /// whatever provisions remain) and a later plain <see cref="Recall"/>
    /// both still work exactly as they would for a freshly dispatched Found
    /// convoy — this is issue #55 §6's food-gating requirement applied to
    /// retargeting the same way it already applies to recall.
    /// </remarks>
    /// <param name="speedFactor">
    /// The world's speed multiplier — see <see cref="PlanDispatch"/>'s own
    /// parameter of the same name. Defaults to <c>1.0</c> for callers with no
    /// world in hand.
    /// </param>
    /// <param name="isRiver">
    /// Optional river-tile lookup (issue #159 part A), threaded into both
    /// <see cref="HexPathfinder"/> calls this makes — a retargeted founding
    /// convoy prices river crossings exactly like every other movement.
    /// <see langword="null"/> (the default) charges no river penalty.
    /// </param>
    /// <param name="isWideRiver">
    /// Which river hexes are wide and so impassable to a land army, threaded alongside
    /// <paramref name="isRiver"/> into every <see cref="HexPathfinder"/> call this makes.
    /// <see langword="null"/> (the default) treats every river hex as a crossable stream.
    /// </param>
    public static RetargetFoundingResult RetargetFounding(
        Army army, HexCoord newTarget, DateTimeOffset now, HexCoord home, Func<HexCoord, Terrain> terrainAt,
        double speedFactor = 1.0, Func<HexCoord, bool>? isRiver = null,
        Func<HexCoord, bool>? isWideRiver = null,
        WallRules? walls = null)
    {
        ArgumentNullException.ThrowIfNull(army);
        ArgumentNullException.ThrowIfNull(terrainAt);

        if (army.Mission != ArmyMission.Found)
        {
            return RetargetFoundingResult.Rejected(RetargetFoundingRejection.NotAFoundingMission);
        }

        HexCoord fromHex;
        switch (army.Location)
        {
            case ArmyLocation.InTransit { Movement.IsReturning: false } inTransit:
                fromHex = inTransit.Movement.PositionAt(now);
                break;

            default:
                return RetargetFoundingResult.Rejected(RetargetFoundingRejection.NothingToRetarget);
        }

        var isFleet = army.Stacks.Count > 0 && army.Stacks.Any(s => UnitCatalogue.Get(s.Type).Class == UnitClass.Ship);
        var isLandUnit = !isFleet;

        // Mirrors PlanDispatch's own SkipsDestinationTerrainCheck: an overland
        // convoy's new target must itself be land; a sea convoy is exempt —
        // the beaching exemption baked into HexPathfinder/FindPath below
        // already requires the hex to be reachable by water, which is exactly
        // what a shoreline hex is.
        if (isLandUnit && !terrainAt(newTarget).IsLand())
        {
            return RetargetFoundingResult.Rejected(RetargetFoundingRejection.TargetNotReachable);
        }

        var path = HexPathfinder.FindPath(fromHex, newTarget, terrainAt, isLandUnit, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        if (path is null || path.Count == 0)
        {
            return RetargetFoundingResult.Rejected(RetargetFoundingRejection.TargetNotReachable);
        }

        var returnPath = HexPathfinder.FindPath(newTarget, home, terrainAt, isLandUnit, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        if (returnPath is null || returnPath.Count == 0)
        {
            return RetargetFoundingResult.Rejected(RetargetFoundingRejection.TargetNotReachable);
        }

        var speed = army.TotalSpeed;
        var upkeepPerHour = army.TotalUpkeepPerHour;
        var cumulativeHours = HexPathfinder.CumulativeHours(path, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var edgeHours = HexPathfinder.EdgeHours(path, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var returnCumulativeHours = HexPathfinder.CumulativeHours(returnPath, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var returnEdgeHours = HexPathfinder.EdgeHours(returnPath, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);

        var provisionsNow = army.ProvisionsAt(now);
        var totalFoodNeeded = (cumulativeHours[^1] + returnCumulativeHours[^1]) * upkeepPerHour;
        if (provisionsNow < totalFoodNeeded)
        {
            return RetargetFoundingResult.Rejected(RetargetFoundingRejection.InsufficientProvisionsForRoundTrip);
        }

        var movement = Movement.Movement.Create(
            now, path, cumulativeHours, edgeHours, returnPath, returnCumulativeHours, returnEdgeHours, provisionsNow, upkeepPerHour);

        var retargeted = army with { Location = new ArmyLocation.InTransit(movement), Provisions = provisionsNow };
        return RetargetFoundingResult.Accept(retargeted);
    }

    /// <summary>
    /// Settles this army to <paramref name="now"/>: past <see cref="Movement.TurnAroundAt"/>
    /// it is put onto its precomputed return leg, and past the return leg's
    /// arrival it comes home. Mirrors <see cref="Settlement.SettleTo"/>'s
    /// "nothing due, nothing changed" contract — a caller sees
    /// <see cref="ArmySettleResult.Changed"/> false when there is nothing to
    /// persist.
    /// </summary>
    public ArmySettleResult SettleTo(DateTimeOffset now)
    {
        if (Location is not ArmyLocation.InTransit inTransit)
        {
            return new ArmySettleResult(this, Changed: false, ArrivedHome: false);
        }

        var movement = inTransit.Movement;

        if (movement.IsStranded)
        {
            // Never turns around: it waits for the food to run out, then the whole army is gone.
            return StarvesAt is { } starvesAt && now >= starvesAt
                ? new ArmySettleResult(
                    this with { Provisions = 0 }, Changed: true, ArrivedHome: false, [new WalkedLeg(movement, starvesAt)], Starved: true)
                : new ArmySettleResult(this, Changed: false, ArrivedHome: false);
        }

        if (!movement.IsReturning)
        {
            if (now < movement.TurnAroundAt)
            {
                return new ArmySettleResult(this, Changed: false, ArrivedHome: false);
            }

            // Rebase provisions to what is left at the moment of the turn —
            // the outbound leg (travel plus any standing time) has burned
            // upkeep since departure.
            var elapsedOutboundHours = (movement.TurnAroundAt - movement.DepartedAt).TotalHours;
            var provisionsAtTurnAround = Math.Max(0, Provisions - (TotalUpkeepPerHour * elapsedOutboundHours));

            var returning = new Movement.Movement
            {
                DepartedAt = movement.TurnAroundAt,
                Path = movement.ReturnPath,
                CumulativeHours = movement.ReturnCumulativeHours,
                EdgeHours = movement.ReturnEdgeHours,
                ReturnPath = movement.ReturnPath,
                ReturnCumulativeHours = movement.ReturnCumulativeHours,
                ReturnEdgeHours = movement.ReturnEdgeHours,
                TurnAroundAt = movement.TurnAroundAt,
                IsReturning = true,
                // Natural provisions-driven turnaround is immune to
                // interception (issue #206 §5) — not something a player
                // triggers on demand.
                RetreatImmune = true,
            };

            var turned = this with
            {
                Location = new ArmyLocation.InTransit(returning),
                Provisions = provisionsAtTurnAround,
            };

            var outbound = new WalkedLeg(movement, movement.TurnAroundAt);
            return now >= returning.ArrivesAt
                ? new ArmySettleResult(
                    // What is left on arrival is what folds into the stock at home (docs/design/troop-movement-range.md §1a).
                    turned with { Location = new ArmyLocation.AtHome(), Provisions = turned.ProvisionsAt(returning.ArrivesAt) },
                    Changed: true, ArrivedHome: true, [outbound, WalkedLeg.Full(returning)])
                : new ArmySettleResult(turned, Changed: true, ArrivedHome: false, [outbound]);
        }

        if (now >= movement.ArrivesAt)
        {
            return new ArmySettleResult(
                this with { Location = new ArmyLocation.AtHome(), Provisions = ProvisionsAt(movement.ArrivesAt) },
                Changed: true, ArrivedHome: true, [WalkedLeg.Full(movement)]);
        }

        return new ArmySettleResult(this, Changed: false, ArrivedHome: false);
    }

    /// <summary>
    /// Replaces the current movement with a fresh route from wherever this
    /// army has reached back to <paramref name="home"/>, departing
    /// <paramref name="now"/>. Rejected (returns <see langword="null"/>,
    /// leaving the caller's copy unchanged) when the army is already
    /// returning or already home — there is nothing left to redirect.
    /// </summary>
    /// <param name="currentHex">
    /// Required (and only meaningful) when <see cref="Location"/> is
    /// <see cref="ArmyLocation.Supporting"/> — a guest army has no active
    /// <see cref="Movement"/> to derive its position from, so the caller
    /// (<c>ArmyService</c>, which knows the host settlement's hex) supplies
    /// it directly. Ignored for <see cref="ArmyLocation.InTransit"/>, whose
    /// position comes from its own movement as before. A supporting army
    /// recalled this way departs straight for <paramref name="home"/> — this
    /// already <em>is</em> the trip home, not an outbound leg needing its own
    /// return (<see cref="Movement.IsReturning"/> is set immediately, same as
    /// a mid-journey <see cref="ArmyMission.Move"/> recall).
    /// </param>
    /// <param name="isRiver">
    /// Optional river-tile lookup (issue #159 part A), threaded straight into
    /// the recall route's <see cref="HexPathfinder"/> call. <see langword="null"/>
    /// (the default) prices no hex as a river.
    /// </param>
    /// <param name="isWideRiver">
    /// Which river hexes are wide and so impassable to a land army, threaded alongside
    /// <paramref name="isRiver"/> into every <see cref="HexPathfinder"/> call this makes.
    /// <see langword="null"/> (the default) treats every river hex as a crossable stream.
    /// </param>
    public Army? Recall(
        DateTimeOffset now, HexCoord home, Func<HexCoord, Terrain> terrainAt, HexCoord? currentHex = null,
        double speedFactor = 1.0, Func<HexCoord, bool>? isRiver = null,
        Func<HexCoord, bool>? isWideRiver = null,
        WallRules? walls = null)
    {
        ArgumentNullException.ThrowIfNull(terrainAt);

        HexCoord fromHex;
        switch (Location)
        {
            case ArmyLocation.InTransit { Movement.IsReturning: false } inTransit:
                fromHex = inTransit.Movement.PositionAt(now);
                break;

            case ArmyLocation.Supporting when currentHex is { } supportingHex:
                fromHex = supportingHex;
                break;

            default:
                return null;
        }

        // Any ship makes the whole army a fleet (a sea Found convoy carries settlers on its ships), the same
        // read IsFleet uses, so the route table always matches the fleet it belongs to.
        var isLandUnit = !IsFleet;

        var path = HexPathfinder.FindPath(fromHex, home, terrainAt, isLandUnit, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        if (path is null || path.Count == 0)
        {
            return null;
        }

        var speed = TotalSpeed;
        var cumulativeHours = HexPathfinder.CumulativeHours(path, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var edgeHours = HexPathfinder.EdgeHours(path, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);

        // ProvisionsAt returns the raw Provisions field for anything other
        // than InTransit — including Supporting, which is exactly right here:
        // a guest army does not burn its own provisions while hosted (the
        // host feeds it), so nothing needs rebasing the way a mid-journey
        // Move/Attack recall rebases against elapsed outbound upkeep.
        var provisionsNow = ProvisionsAt(now);

        var recallMovement = new Movement.Movement
        {
            DepartedAt = now,
            Path = path,
            CumulativeHours = cumulativeHours,
            EdgeHours = edgeHours,
            ReturnPath = path,
            ReturnCumulativeHours = cumulativeHours,
            ReturnEdgeHours = edgeHours,
            TurnAroundAt = now,
            IsReturning = true,
        };

        return this with { Location = new ArmyLocation.InTransit(recallMovement), Provisions = provisionsNow };
    }

    /// <summary>
    /// Puts this army onto an immediate, non-cancellable, direct-path-home
    /// march (issue #206 §5) — the mechanical consequence of losing (or
    /// tying) a <see cref="FieldBattleResolver"/> interception. Deliberately
    /// not built through <see cref="Recall"/>: the resulting <see cref="Movement"/>
    /// carries <see cref="Movement.RetreatImmune"/> so it cannot itself be
    /// intercepted again (unlike a voluntary Recall), and this army cannot
    /// take a fresh <see cref="Recall"/>/<see cref="PlanFieldOrder"/> while it
    /// holds — both require <see cref="Movement.IsReturning"/> to be
    /// <see langword="false"/>, which a forced retreat never is again once
    /// applied.
    /// </summary>
    /// <param name="battleInstant">
    /// When the fight happened — the new leg's <see cref="Movement.DepartedAt"/>,
    /// exactly like <see cref="Army.SettleArrival"/>'s own post-battle return.
    /// </param>
    /// <param name="fromHex">Where the fight happened — always a hex this army's original route actually passed through.</param>
    /// <param name="provisionsAtBattle">
    /// What the army carried at <paramref name="battleInstant"/>, when the caller has already swapped in the survivors (whose smaller upkeep would
    /// understate the burn so far). Defaults to <see cref="ProvisionsAt"/> of this army.
    /// </param>
    /// <returns>
    /// The army on its way home. When no route home exists (a wall now closes the way) it is instead left standing where it
    /// fought (<see cref="Strand"/>) and starves when its food runs out.
    /// </returns>
    public Army ForceFieldRetreat(
        DateTimeOffset battleInstant, HexCoord fromHex, HexCoord home, Func<HexCoord, Terrain> terrainAt,
        double speedFactor = 1.0, Func<HexCoord, bool>? isRiver = null,
        Func<HexCoord, bool>? isWideRiver = null,
        WallRules? walls = null,
        double? provisionsAtBattle = null)
    {
        ArgumentNullException.ThrowIfNull(terrainAt);

        var isLandUnit = !IsFleet;
        var provisionsNow = provisionsAtBattle ?? ProvisionsAt(battleInstant);

        if (HexPathfinder.FindPath(fromHex, home, terrainAt, isLandUnit, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost) is not { Count: > 0 } path)
        {
            // No way home (a wall in the way): it stays where it fought, still protected from further fights, and starves
            // when the food runs out (docs/design/troop-movement-range.md §2a).
            var stranded = WithProvisionsAt(battleInstant, provisionsNow).Strand(battleInstant, fromHex);
            return stranded with
            {
                Location = new ArmyLocation.InTransit(((ArmyLocation.InTransit)stranded.Location).Movement with { RetreatImmune = true }),
            };
        }

        var speed = TotalSpeed;
        var cumulativeHours = HexPathfinder.CumulativeHours(path, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var edgeHours = HexPathfinder.EdgeHours(path, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);

        var retreatMovement = new Movement.Movement
        {
            DepartedAt = battleInstant,
            Path = path,
            CumulativeHours = cumulativeHours,
            EdgeHours = edgeHours,
            ReturnPath = path,
            ReturnCumulativeHours = cumulativeHours,
            ReturnEdgeHours = edgeHours,
            TurnAroundAt = battleInstant,
            IsReturning = true,
            RetreatImmune = true,
        };

        // The retreat departs at the battle instant, so the stored baseline is what the army carried then.
        return (this with { Location = new ArmyLocation.InTransit(retreatMovement) }).WithProvisionsAt(battleInstant, provisionsNow);
    }

    private static FieldOrderRejection NoRouteRejection(PathSearch search, bool isLandUnit) =>
        search.LimitReached ? FieldOrderRejection.RouteTooLong
        : isLandUnit ? FieldOrderRejection.UnreachableLeg
        : FieldOrderRejection.NoSeaRoute;

    /// <summary>
    /// Orders an army already out in the field onward (issue #156) — the gap the design doc opens with: an army that
    /// has reached where it was sent could previously only be <see cref="Recall"/>ed, never sent further. The order
    /// carries a mission (<see cref="ArmyMission.Move"/>, Attack, Support, Hunt or Raid) held to exactly the same
    /// target rules as a dispatch from home (<see cref="ValidateMissionTarget"/>), and — for a standing army only —
    /// can take just part of it. Two shapes, one method, per the design doc's "an in-flight order may only extend the
    /// route, never divert it" rule:
    /// <list type="bullet">
    /// <item>
    /// Standing at its current destination (<c>now &gt;= Movement.ArrivesAt</c>,
    /// still before <see cref="Movement.TurnAroundAt"/>) — "move on": a fresh
    /// leg departs from here, right now, exactly like <see cref="Recall"/>
    /// builds its own fresh leg home.
    /// </item>
    /// <item>
    /// Still travelling the outbound leg (<c>now &lt; Movement.ArrivesAt</c>) —
    /// "append goal": the original route is never touched (it always finishes
    /// — <see cref="Movement.DepartedAt"/> and every hex already computed stay
    /// exactly as they were), only extended past the original destination
    /// through the new waypoints/destination. Food is still checked from the
    /// true original departure, so a chained append is exactly as affordable
    /// as if the whole extended route had been the plan from the start.
    /// </item>
    /// </list>
    /// Refused (<see cref="FieldOrderRejection.NoActiveJourney"/>) for
    /// <see cref="ArmyLocation.AtHome"/>, <see cref="ArmyLocation.Supporting"/>,
    /// or an already-returning <see cref="ArmyLocation.InTransit"/> — none of
    /// those have anywhere left to extend from (recall/re-dispatch cover them
    /// instead). Restricted by the caller (<c>ArmyService</c>) to armies whose current mission is
    /// <see cref="ArmyMission.Move"/>/<see cref="ArmyMission.Found"/>; <see cref="ArmyMission.Found"/> is not an order
    /// mission (founding from the field is <c>RetargetFounding</c>).
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Split.</b> <paramref name="requestedUnits"/> names what leaves. Anything short of the whole army is a split,
    /// allowed only while the army stands (<see cref="FieldOrderRejection.SplitRequiresStandingArmy"/> otherwise): the
    /// leaving units become a new army (<paramref name="splitArmyId"/>, same home settlement) departing from here, and the
    /// rest stay standing where they are with their existing <see cref="Movement"/> (the result's
    /// <see cref="FieldOrderResult.Remainder"/>). For a fleet, both parts must still have ship slots for their passengers.
    /// </para>
    /// <para>
    /// <b>Provisions.</b> The food on hand now is split by upkeep share: the leaving part takes
    /// <c>upkeepLeaving / upkeepTotal</c> of it. <see cref="Provisions"/> of an in-transit army is the figure at departure
    /// and its burn is derived from <see cref="TotalUpkeepPerHour"/>, so scaling the remainder's stored figure by its
    /// share keeps its <see cref="ProvisionsAt"/> and its <see cref="Movement.TurnAroundAt"/> (which depends only on
    /// provisions divided by upkeep) exactly as they were. Each part is capped at its own
    /// <see cref="TotalFoodCarryCapacity"/>; whatever is over one part's cap goes to the other part, and is dropped if
    /// that is full too. When the cap moved the remainder's food, its movement is rebuilt from the new figure so the
    /// turn-around matches it. The leaving part must then pass the usual round-trip food check from where it stands
    /// with its own share.
    /// </para>
    /// </remarks>
    /// <param name="isPremium">
    /// Gates the premium half of the design doc's rule table: waypoints on a
    /// "move on" order, and any "append goal" order at all, are premium-only
    /// (<see cref="FieldOrderRejection.PremiumRequired"/>) — a free "move on"
    /// straight to a new hex, no waypoints, is the one case every player gets, whatever the mission.
    /// A pure boolean rather than a user id: whether the caller resolves that
    /// from a live premium check or a test fixture is not this method's
    /// concern (mirrors how <see cref="PlanDispatch"/> takes already-resolved
    /// <c>renownAndSlotAllowed</c> for the same reason).
    /// </param>
    /// <param name="destination">
    /// The resolved destination, as for <see cref="PlanDispatch"/>: the target settlement's centre for
    /// Attack/Support/Raid, the camp's route hex (<see cref="HuntRouteDestination"/>) for a Hunt, the plain hex for a Move.
    /// </param>
    /// <param name="home">The army's home settlement's own hex — needed to price the new return leg, exactly as <see cref="Recall"/> needs it.</param>
    /// <param name="isRiver">Optional river-tile lookup (issue #159 part A), threaded into every <see cref="HexPathfinder"/> call this makes.</param>
    /// <param name="isWideRiver">Optional wide-river lookup (impassable to a land army), threaded alongside <paramref name="isRiver"/>.</param>
    /// <param name="mission">What the ordered army does on arrival; <see cref="ArmyMission.Found"/> is refused.</param>
    /// <param name="targetSettlementId">The settlement to fight/support; required for Attack/Support/Raid.</param>
    /// <param name="targetBuildingCoord">Attack/Raid only; always required for a fleet (see <see cref="PlanDispatch"/>).</param>
    /// <param name="targetClaimDiscs">The target's claim discs, for the fleet shore rule — see <see cref="PlanDispatch"/>.</param>
    /// <param name="targetCampCoord">The camp's hex for a Hunt, or <see langword="null"/> when no camp stands there.</param>
    /// <param name="targetCampIsWater">Whether that camp stands on the sea.</param>
    /// <param name="targetCampIsSand">Whether that camp is a sand camp (a haul-out), the one land camp a fleet hunts, with the land troops aboard.</param>
    /// <param name="giants">Giant hexes, for the fleet shore rule's territory test.</param>
    /// <param name="requestedUnits">What leaves; <see langword="null"/> means the whole army.</param>
    /// <param name="splitArmyId">The id of the new army when this is a split.</param>
    public static FieldOrderResult PlanFieldOrder(
        Army army,
        IReadOnlyList<HexCoord> waypoints,
        HexCoord destination,
        HexCoord home,
        DateTimeOffset now,
        Func<HexCoord, Terrain> terrainAt,
        bool isPremium,
        double speedFactor = 1.0,
        Func<HexCoord, bool>? isRiver = null,
        Func<HexCoord, bool>? isWideRiver = null,
        WallRules? walls = null,
        ArmyMission mission = ArmyMission.Move,
        Guid? targetSettlementId = null,
        HexCoord? targetBuildingCoord = null,
        IReadOnlyList<(HexCoord Centre, int Radius)>? targetClaimDiscs = null,
        HexCoord? targetCampCoord = null,
        bool targetCampIsWater = false,
        bool targetCampIsSand = false,
        IGiantIndex? giants = null,
        IReadOnlyList<UnitStack>? requestedUnits = null,
        Guid? splitArmyId = null,
        IReadOnlyList<GarrisonSpot>? targetSpots = null)
    {
        ArgumentNullException.ThrowIfNull(army);
        ArgumentNullException.ThrowIfNull(waypoints);
        ArgumentNullException.ThrowIfNull(terrainAt);

        if (army.Location is not ArmyLocation.InTransit { Movement.IsReturning: false } inTransit)
        {
            return FieldOrderResult.Rejected(FieldOrderRejection.NoActiveJourney);
        }

        if (mission is ArmyMission.Found or ArmyMission.SetUpCamp)
        {
            return FieldOrderResult.Rejected(FieldOrderRejection.MissionNotAllowed);
        }

        var movement = inTransit.Movement;
        var arrived = now >= movement.ArrivesAt;

        // Which units leave: everything, or the named part (a split).
        IReadOnlyList<UnitStack> leavingStacks = army.Stacks;
        IReadOnlyList<UnitStack> remainingStacks = [];
        if (requestedUnits is not null)
        {
            var selection = SelectUnits(army.Stacks, requestedUnits);
            if (selection is null)
            {
                return FieldOrderResult.Rejected(FieldOrderRejection.InvalidUnitSelection);
            }

            leavingStacks = selection.Value.Leaving;
            remainingStacks = selection.Value.Remaining;
        }

        var isSplit = remainingStacks.Count > 0;
        if (isSplit && !arrived)
        {
            return FieldOrderResult.Rejected(FieldOrderRejection.SplitRequiresStandingArmy);
        }

        // Both parts of a fleet keep riding in ship slots: a part left with passengers but too few (or no) ships is refused.
        if (isSplit && army.IsFleet
            && (!HasSlotsForPassengers(leavingStacks) || !HasSlotsForPassengers(remainingStacks)))
        {
            return FieldOrderResult.Rejected(FieldOrderRejection.InsufficientShipCapacity);
        }

        var leaving = army with { Stacks = leavingStacks };
        var isFleet = leaving.IsFleet;
        var isLandUnit = !isFleet;

        var target = ValidateMissionTarget(
            mission, leavingStacks, army.SettlementId, targetSettlementId, targetBuildingCoord, targetClaimDiscs,
            destination, targetCampCoord, targetCampIsWater, targetCampIsSand, terrainAt, giants, targetSpots);
        if (target.Rejection != DispatchRejection.None)
        {
            return FieldOrderResult.Rejected(ToFieldOrderRejection(target.Rejection));
        }

        var routeDestination = target.RouteDestination;

        if (!SkipsDestinationTerrainCheck(isFleet, mission, targetCampIsSand) && !terrainAt(routeDestination).IsTraversable(isLandUnit))
        {
            return FieldOrderResult.Rejected(isLandUnit
                ? FieldOrderRejection.DestinationNotLand
                : FieldOrderRejection.DestinationNotSea);
        }

        foreach (var waypoint in waypoints)
        {
            if (!terrainAt(waypoint).IsTraversable(isLandUnit))
            {
                return FieldOrderResult.Rejected(isLandUnit
                    ? FieldOrderRejection.WaypointNotLand
                    : FieldOrderRejection.WaypointNotSea);
            }
        }

        if (!arrived)
        {
            // Appending onto an in-progress leg is premium regardless of
            // waypoints — the design doc's table has no free cell here.
            if (!isPremium)
            {
                return FieldOrderResult.Rejected(FieldOrderRejection.PremiumRequired);
            }
        }
        else if (waypoints.Count > 0 && !isPremium)
        {
            // Standing "move on" is free with no waypoints; adding any is premium.
            return FieldOrderResult.Rejected(FieldOrderRejection.PremiumRequired);
        }

        DateTimeOffset departedAt;
        double provisionsAtDeparture;
        List<HexCoord> fullPath;
        Army? remainder = null;

        if (arrived)
        {
            var fromHex = movement.PositionAt(now);
            departedAt = now;
            provisionsAtDeparture = army.ProvisionsAt(now);

            if (isSplit)
            {
                (provisionsAtDeparture, remainder) = SplitStanding(army, leavingStacks, remainingStacks, now);
            }

            List<HexCoord> stops = [fromHex, .. waypoints, routeDestination];
            fullPath = [fromHex];
            for (var i = 0; i < stops.Count - 1; i++)
            {
                var search = HexPathfinder.Search(stops[i], stops[i + 1], terrainAt, isLandUnit, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
                if (search.Path is not { Count: > 0 } leg)
                {
                    return FieldOrderResult.Rejected(NoRouteRejection(search, isLandUnit));
                }

                fullPath.AddRange(leg.Skip(1));
            }
        }
        else
        {
            // The original leg always finishes — its already-computed hexes
            // are kept byte-for-byte, only extended past the old destination.
            departedAt = movement.DepartedAt;
            provisionsAtDeparture = army.Provisions;

            var originalDestination = movement.Path[^1];
            List<HexCoord> stops = [originalDestination, .. waypoints, routeDestination];
            fullPath = [.. movement.Path];
            for (var i = 0; i < stops.Count - 1; i++)
            {
                var search = HexPathfinder.Search(stops[i], stops[i + 1], terrainAt, isLandUnit, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
                if (search.Path is not { Count: > 0 } leg)
                {
                    return FieldOrderResult.Rejected(NoRouteRejection(search, isLandUnit));
                }

                fullPath.AddRange(leg.Skip(1));
            }
        }

        var returnSearch = HexPathfinder.Search(routeDestination, home, terrainAt, isLandUnit, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        if (returnSearch.Path is not { Count: > 0 } returnPath)
        {
            return FieldOrderResult.Rejected(NoRouteRejection(returnSearch, isLandUnit));
        }

        var speed = leaving.TotalSpeed;
        var upkeepPerHour = leaving.TotalUpkeepPerHour;
        var cumulativeHours = HexPathfinder.CumulativeHours(fullPath, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var edgeHours = HexPathfinder.EdgeHours(fullPath, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var returnCumulativeHours = HexPathfinder.CumulativeHours(returnPath, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var returnEdgeHours = HexPathfinder.EdgeHours(returnPath, terrainAt, speed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);

        // The leaving part's own share of the food must carry it there and back from where it stands.
        var totalFoodNeeded = (cumulativeHours[^1] + returnCumulativeHours[^1]) * upkeepPerHour;
        if (provisionsAtDeparture < totalFoodNeeded)
        {
            return FieldOrderResult.Rejected(FieldOrderRejection.InsufficientProvisionsForRoundTrip);
        }

        var newMovement = Movement.Movement.Create(
            departedAt, fullPath, cumulativeHours, edgeHours, returnPath, returnCumulativeHours, returnEdgeHours, provisionsAtDeparture, upkeepPerHour);

        var ordered = leaving with
        {
            Id = isSplit ? splitArmyId ?? Guid.CreateVersion7() : army.Id,
            Location = new ArmyLocation.InTransit(newMovement),
            Provisions = provisionsAtDeparture,
            Loot = isSplit ? default : army.Loot,
            Mission = mission,
            TargetSettlementId = mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid ? targetSettlementId : null,
            TargetBuildingCoord = mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid ? targetBuildingCoord : null,
            TargetCampCoord = mission == ArmyMission.Hunt ? targetCampCoord : null,
        };

        return FieldOrderResult.Accept(ordered, remainder);
    }

    /// <summary>
    /// Splits <paramref name="requested"/> off <paramref name="stacks"/>, per type. <see langword="null"/> when the
    /// selection is empty, names a type the army does not hold, or more of a type than it holds. An empty
    /// <c>Remaining</c> means the selection is the whole army (no split).
    /// </summary>
    private static (IReadOnlyList<UnitStack> Leaving, IReadOnlyList<UnitStack> Remaining)? SelectUnits(
        IReadOnlyList<UnitStack> stacks, IReadOnlyList<UnitStack> requested)
    {
        if (requested.Any(s => s.Count < 0))
        {
            return null;
        }

        var wanted = requested
            .Where(s => s.Count > 0)
            .GroupBy(s => s.Type)
            .Select(g => new UnitStack(g.Key, g.Sum(s => s.Count)))
            .ToList();
        if (wanted.Count == 0)
        {
            return null;
        }

        var held = MergeStacksByType(stacks, []);
        foreach (var stack in wanted)
        {
            if (held.FirstOrDefault(h => h.Type == stack.Type).Count < stack.Count)
            {
                return null;
            }
        }

        return (wanted, SubtractStacks(held, wanted));
    }

    private static bool HasSlotsForPassengers(IReadOnlyList<UnitStack> part) =>
        ShipCargo.SlotsNeeded(ShipCargo.Passengers(part)) <= ShipCargo.SlotsOffered(part);

    /// <summary>
    /// Divides a standing army's food between the part that leaves and the part that stays (see
    /// <see cref="PlanFieldOrder"/>'s remarks): by upkeep share, each part capped at its own carry capacity, the excess of
    /// one going to the other. Returns what the leaving part departs with and the remainder army, whose stored
    /// <see cref="Provisions"/> keeps <see cref="ProvisionsAt"/> and <see cref="Movement.TurnAroundAt"/> consistent.
    /// </summary>
    private static (double LeavingFood, Army Remainder) SplitStanding(
        Army army, IReadOnlyList<UnitStack> leavingStacks, IReadOnlyList<UnitStack> remainingStacks, DateTimeOffset now)
    {
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;
        var leaving = army with { Stacks = leavingStacks };
        var staying = army with { Stacks = remainingStacks };

        var foodNow = army.ProvisionsAt(now);
        var totalUpkeep = army.TotalUpkeepPerHour;
        var leavingShare = totalUpkeep > 0
            ? leaving.TotalUpkeepPerHour / totalUpkeep
            : leavingStacks.Sum(s => s.Count) / (double)army.Stacks.Sum(s => s.Count);

        var proportionalStayingFood = foodNow * (1 - leavingShare);
        var leavingFood = foodNow * leavingShare;
        var stayingFood = foodNow - leavingFood;

        var leavingCap = leaving.TotalFoodCarryCapacity;
        var stayingCap = staying.TotalFoodCarryCapacity;
        if (leavingFood > leavingCap)
        {
            stayingFood += leavingFood - leavingCap;
            leavingFood = leavingCap;
        }

        if (stayingFood > stayingCap)
        {
            leavingFood = Math.Min(leavingCap, leavingFood + (stayingFood - stayingCap));
            stayingFood = stayingCap;
        }

        // The remainder keeps its Movement. Its stored (departure) figure is scaled by its share: with burn derived from
        // its own upkeep, ProvisionsAt(now) and the turn-around (departure + provisions / upkeep - way home) are then
        // exactly what they were. Only when capping moved its food is the movement rebuilt from the new figure.
        Army remainder;
        if (Math.Abs(stayingFood - proportionalStayingFood) < 1e-9)
        {
            remainder = staying with { Provisions = army.Provisions * (1 - leavingShare) };
        }
        else if (movement.IsStranded)
        {
            // A stranded remainder stays stranded; only its food (and so the instant it starves) changes.
            remainder = staying.WithProvisionsAt(now, stayingFood).Strand(now, movement.Path[0]);
        }
        else
        {
            var stayingUpkeep = staying.TotalUpkeepPerHour;
            var hoursSinceDeparture = Math.Max(0, (now - movement.DepartedAt).TotalHours);
            var storedFood = stayingFood + (stayingUpkeep * hoursSinceDeparture);
            var rebuilt = Movement.Movement.Create(
                movement.DepartedAt, movement.Path, movement.CumulativeHours, movement.EdgeHours,
                movement.ReturnPath, movement.ReturnCumulativeHours, movement.ReturnEdgeHours, storedFood, stayingUpkeep);
            remainder = staying with { Provisions = storedFood, Location = new ArmyLocation.InTransit(rebuilt) };
        }

        return (leavingFood, remainder);
    }

    /// <summary>The field-order name of a rule <see cref="ValidateMissionTarget"/> broke (the names match the dispatch ones).</summary>
    private static FieldOrderRejection ToFieldOrderRejection(DispatchRejection rejection) => rejection switch
    {
        DispatchRejection.TargetSettlementRequired => FieldOrderRejection.TargetSettlementRequired,
        DispatchRejection.CannotAttackOwnSettlement => FieldOrderRejection.CannotAttackOwnSettlement,
        DispatchRejection.CannotSupportOwnSettlement => FieldOrderRejection.CannotSupportOwnSettlement,
        DispatchRejection.NoCampAtDestination => FieldOrderRejection.NoCampAtDestination,
        DispatchRejection.HuntRequiresLandUnits => FieldOrderRejection.HuntRequiresLandUnits,
        DispatchRejection.HuntRequiresFleet => FieldOrderRejection.HuntRequiresFleet,
        DispatchRejection.TargetBuildingRequiresAttackMission => FieldOrderRejection.TargetBuildingRequiresAttackMission,
        DispatchRejection.FleetTargetBuildingRequired => FieldOrderRejection.FleetTargetBuildingRequired,
        DispatchRejection.FleetTargetBuildingNotOnShore => FieldOrderRejection.FleetTargetBuildingNotOnShore,
        DispatchRejection.InsufficientShipCapacity => FieldOrderRejection.InsufficientShipCapacity,
        DispatchRejection.SupportSpotRequired => FieldOrderRejection.SupportSpotRequired,
        DispatchRejection.SupportSpotCannotHold => FieldOrderRejection.SupportSpotCannotHold,
        _ => throw new ArgumentOutOfRangeException(nameof(rejection), rejection, "Not a rule ValidateMissionTarget can break."),
    };

    /// <summary>
    /// Admin god-mode "speed up": slides the whole active leg along the time
    /// axis so it arrives at <paramref name="arrivesAt"/> instead of
    /// <see cref="Movement.ArrivesAt"/>, keeping the route, the standing time
    /// after arrival and the provisions burn-rate exactly as they were.
    /// <see langword="null"/> when the army is not travelling at all (at home,
    /// or a guest), since there is no arrival to move.
    /// </summary>
    /// <remarks>
    /// Shifting <see cref="Movement.DepartedAt"/> rather than shortening the
    /// route is what keeps every other rule intact:
    /// <see cref="Movement.PositionAt"/>, the turn-around instant and
    /// <see cref="ProvisionsAt"/> are all measured from departure, so the army
    /// simply behaves as though it had set out earlier (or later). A negative
    /// shift into the past is allowed and is exactly what "arrive now" means
    /// for a long journey.
    /// </remarks>
    public Army? ShiftArrivalTo(DateTimeOffset arrivesAt)
    {
        if (Location is not ArmyLocation.InTransit inTransit)
        {
            return null;
        }

        var movement = inTransit.Movement;
        var shift = arrivesAt - movement.ArrivesAt;
        if (shift == TimeSpan.Zero)
        {
            return this;
        }

        return this with
        {
            Location = new ArmyLocation.InTransit(movement with
            {
                DepartedAt = movement.DepartedAt + shift,
                TurnAroundAt = movement.TurnAroundAt + shift,
            }),
        };
    }

    /// <summary>
    /// Admin god-mode "put it over there": drops the army onto
    /// <paramref name="coord"/> as of <paramref name="now"/>, standing at the
    /// end of a zero-length outbound leg with a freshly pathfound route home.
    /// <see langword="null"/> when no route from <paramref name="coord"/> back
    /// to <paramref name="home"/> exists for this army's unit class.
    /// </summary>
    /// <remarks>
    /// A one-hex <see cref="Movement.Path"/> is a legitimate movement, not a
    /// special case: <see cref="Movement.PositionAt"/> reports
    /// <c>Path[0]</c> and <see cref="Movement.ArrivesAt"/> equals
    /// <see cref="Movement.DepartedAt"/>, so the army reads as "arrived, now
    /// standing here". Building it through <see cref="Movement.Create"/> means
    /// the standing time before it heads home is derived from its remaining
    /// provisions by the same formula every dispatched army uses — a
    /// teleported army is fed, and starves, like any other.
    /// </remarks>
    /// <param name="provisions">
    /// Food the army should stand there with. <see langword="null"/> (the
    /// default) carries over what it has actually got left right now
    /// (<see cref="ProvisionsAt"/>) — the leg it flew so far really was
    /// eaten. Pass a value to override that, which is what an admin setting
    /// provisions and repositioning in one edit means: the number given is the
    /// army's food, and the standing window before it turns for home is
    /// derived from that same number rather than from a figure the override
    /// has already replaced.
    /// </param>
    /// <param name="isRiver">
    /// Optional river-tile lookup (issue #159 part A), threaded straight into
    /// the fresh return route's <see cref="HexPathfinder"/> call.
    /// <see langword="null"/> (the default) prices no hex as a river.
    /// </param>
    /// <param name="isWideRiver">
    /// Which river hexes are wide and so impassable to a land army, threaded alongside
    /// <paramref name="isRiver"/> into every <see cref="HexPathfinder"/> call this makes.
    /// <see langword="null"/> (the default) treats every river hex as a crossable stream.
    /// </param>
    public Army? TeleportTo(
        HexCoord coord, HexCoord home, DateTimeOffset now, Func<HexCoord, Terrain> terrainAt,
        double? provisions = null, double speedFactor = 1.0, Func<HexCoord, bool>? isRiver = null,
        Func<HexCoord, bool>? isWideRiver = null,
        WallRules? walls = null)
    {
        ArgumentNullException.ThrowIfNull(terrainAt);

        // Same read of the army's unit class Recall uses: any ship makes it a fleet (see IsFleet).
        var isLandUnit = !IsFleet;

        if (!terrainAt(coord).IsTraversable(isLandUnit))
        {
            return null;
        }

        var returnPath = HexPathfinder.FindPath(coord, home, terrainAt, isLandUnit, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        if (returnPath is null || returnPath.Count == 0)
        {
            return null;
        }

        var returnCumulativeHours = HexPathfinder.CumulativeHours(returnPath, terrainAt, TotalSpeed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var returnEdgeHours = HexPathfinder.EdgeHours(returnPath, terrainAt, TotalSpeed, isLandUnit, speedFactor, isRiver, isWideRiver, walls?.Blocked, walls?.FriendlyGate, walls?.HalfOpen, walls?.BridgeCost);
        var provisionsNow = provisions is { } given ? Math.Max(0, given) : ProvisionsAt(now);

        var movement = Movement.Movement.Create(
            now, [coord], [0d], [0d], returnPath, returnCumulativeHours, returnEdgeHours, provisionsNow, TotalUpkeepPerHour);

        return this with { Location = new ArmyLocation.InTransit(movement), Provisions = provisionsNow };
    }
}

/// <param name="ArrivedHome">
/// True when this settle brought the army all the way home — the caller
/// (<c>ArmyService</c>) is then responsible for folding <see cref="Army.Stacks"/>
/// into the home settlement's <see cref="Settlement.Garrison"/> and retiring
/// the army row; see the type-level remarks on <see cref="Army"/>.
/// </param>
/// <param name="Walked">
/// The legs this settle finished, each with the instant it ended: what the army walked that the persisted
/// <see cref="Movement.Movement"/> no longer shows once the result is stored (the outbound leg when it turned around,
/// and the return leg too when the same call also brought it home). Empty when nothing changed.
/// </param>
public sealed record ArmySettleResult(
    Army Army, bool Changed, bool ArrivedHome, IReadOnlyList<WalkedLeg>? Walked = null, bool Starved = false)
{
    public IReadOnlyList<WalkedLeg> Walked { get; init; } = Walked ?? [];
}

/// <summary>
/// A leg of an army's route up to the instant it ended (it turned around, was replaced by a new route, or arrived).
/// <see cref="Hexes"/> are the hexes it crossed meanwhile — the ground that counts as explored by it.
/// </summary>
public sealed record WalkedLeg(Movement.Movement Leg, DateTimeOffset Until)
{
    /// <summary>The leg ran its whole path.</summary>
    public static WalkedLeg Full(Movement.Movement leg) => new(leg, DateTimeOffset.MaxValue);

    public IReadOnlyList<HexCoord> Hexes => Leg.HexesReachedBy(Until);

    /// <summary>
    /// The leg <paramref name="before"/> was travelling that <paramref name="after"/> no longer is: the whole leg when it
    /// ended in a non-travelling state, the part up to the new leg's departure when it was replaced by another route, and
    /// <see langword="null"/> when it is still the same leg (or <paramref name="before"/> was not travelling).
    /// </summary>
    public static WalkedLeg? Between(Army before, Army after)
    {
        ArgumentNullException.ThrowIfNull(before);
        ArgumentNullException.ThrowIfNull(after);

        if (before.Location is not ArmyLocation.InTransit { Movement: var old })
        {
            return null;
        }

        if (after.Location is not ArmyLocation.InTransit { Movement: var next })
        {
            return Full(old);
        }

        var sameLeg = old.DepartedAt == next.DepartedAt
            && old.IsReturning == next.IsReturning
            && old.Path.Count == next.Path.Count
            && old.Path[0] == next.Path[0]
            && old.Path[^1] == next.Path[^1];
        return sameLeg ? null : new WalkedLeg(old, next.DepartedAt);
    }
}

/// <param name="Army">
/// The updated army — <see langword="null"/> when a wiped-out attacker
/// ceases to exist entirely; the unchanged input army when
/// <paramref name="Fought"/> is <see langword="false"/>.
/// </param>
/// <param name="DefenderSettlement">
/// The defender, settled through the battle instant (and, when
/// <paramref name="Fought"/>, forward to "now" as well) — always non-null,
/// since even a no-op result still needs somewhere to hand the caller's own
/// settlement back unchanged.
/// </param>
/// <param name="Fought">Whether a battle actually happened this call — see <see cref="Army.SettleArrival"/>.</param>
/// <param name="GuestLosses">
/// The guest side's pooled per-type share of <c>Battle.DefenderLosses</c>
/// (issue #40 phase 4 §3) — empty when no guest defenders were passed in, or
/// when nothing happened this call. The caller (<c>ArmyService</c>) still has
/// to split this further across the actual guest <c>ArmyEntity</c> rows
/// present (<see cref="Army.SettleArrival"/>'s remarks explain why that
/// second split cannot happen here).
/// </param>
/// <param name="Siege">
/// The catapult building-damage outcome (issue #40 phase 5) —
/// <see cref="Combat.SiegeOutcome.None"/> when the attacker lost, no
/// catapults survived to fire, or the defender had no buildings to hit, and
/// <see langword="null"/> only when <paramref name="Fought"/> is
/// <see langword="false"/> (no battle happened at all this call, so siege was
/// never even attempted) — see <see cref="Combat.SiegeResolver.Resolve"/>. The Fire Ships' fire damage is
/// <see cref="Combat.AttackPlan.FireSiege"/> on <paramref name="Attack"/>.
/// </param>
/// <param name="Attack">
/// The whole attack: the ship fight and the land fight, the drowned, the Fire Ships burned and both sieges (see
/// <see cref="Combat.AttackPlan"/>). <paramref name="Battle"/> is its <see cref="Combat.AttackPlan.Overall"/> summary.
/// <see langword="null"/> when nothing was fought.
/// </param>
public sealed record ArmyArrivalResult(
    Army? Army, Settlement DefenderSettlement, bool Fought, Combat.BattlePlan? Battle,
    IReadOnlyList<UnitStack> GuestLosses, Combat.SiegeOutcome? Siege, Combat.AttackPlan? Attack);

/// <param name="Arrived">
/// True when this call actually brought the army to its host — the caller
/// (<c>ArmyService</c>) writes <see cref="ArmySupportArrivalResult.Army"/>
/// back either way, but only that transition is a real change worth
/// persisting; see <see cref="Army.SettleSupportArrival"/>.
/// </param>
public sealed record ArmySupportArrivalResult(Army Army, bool Arrived);

/// <param name="Arrived">Whether the outbound leg's arrival instant has been reached — a no-op before then.</param>
/// <param name="ShouldFound">
/// True only when the convoy has arrived and the target hex still clears the
/// spacing rule (see <see cref="Army.PlanFoundingArrival"/>). The caller
/// (<c>ArmyService.ResolveFoundingAsync</c>) creates the new settlement only
/// when this is true; otherwise it falls back to plain <see cref="Army.SettleTo"/>.
/// </param>
/// <param name="Army">
/// <see langword="null"/> when <paramref name="ShouldFound"/> — the convoy is
/// entirely consumed founding the new settlement, same shape as a wiped-out
/// attacker in <see cref="ArmyArrivalResult"/>. The unchanged input army in
/// every other case.
/// </param>
/// <param name="GarrisonForNewSettlement">
/// Non-settler stacks (any escort, and any ships that carried a sea convoy)
/// that become the new settlement's starting garrison — empty (and
/// meaningless) unless <paramref name="ShouldFound"/>.
/// </param>
/// <param name="FoundedAt">The target hex — meaningless unless <paramref name="ShouldFound"/>.</param>
public sealed record FoundingArrivalResult(
    bool Arrived, bool ShouldFound, Army? Army, IReadOnlyList<UnitStack> GarrisonForNewSettlement, HexCoord FoundedAt);

/// <summary>
/// What <see cref="Army.PlanCampBuild"/> decided about an <see cref="ArmyMission.SetUpCamp"/> army.
/// </summary>
/// <param name="Due">
/// Whether the army has stood on its site for the whole build time (<see cref="BeachCamp.ScaledBuildDuration"/>). When
/// <see langword="false"/> nothing is decided yet and the caller settles the army the ordinary way.
/// </param>
/// <param name="ShouldBuild">Due and the site is still free: the camp is set up and the army row goes.</param>
/// <param name="Site">The camp's hex.</param>
/// <param name="CompletesAt">When the camp was finished: arrival plus build time.</param>
/// <param name="GarrisonForCamp">Every stack but the used-up camp builders (troops and ships that came along).</param>
/// <param name="FoodForCamp">The army's leftover provisions at <paramref name="CompletesAt"/>, for the camp's food pile.</param>
public sealed record CampBuildResult(
    bool Due, bool ShouldBuild, HexCoord Site, DateTimeOffset CompletesAt, IReadOnlyList<UnitStack> GarrisonForCamp, double FoodForCamp);

/// <summary>Why <see cref="Army.RetargetFounding"/> was refused.</summary>
public enum RetargetFoundingRejection
{
    None = 0,
    NotAFoundingMission,

    /// <summary>The convoy is already home, already returning, or a guest — nothing left to redirect.</summary>
    NothingToRetarget,

    TargetNotReachable,
    InsufficientProvisionsForRoundTrip,
}

/// <summary>The outcome of asking to redirect a founding convoy — mirrors <see cref="DispatchDecision"/>.</summary>
public sealed record RetargetFoundingResult(RetargetFoundingRejection Rejection, Army? Army = null)
{
    public bool Accepted => Rejection == RetargetFoundingRejection.None && Army is not null;

    public static RetargetFoundingResult Rejected(RetargetFoundingRejection reason) => new(reason);

    public static RetargetFoundingResult Accept(Army army) => new(RetargetFoundingRejection.None, army);
}

/// <summary>Why <see cref="Army.PlanFieldOrder"/> was refused (issue #156).</summary>
public enum FieldOrderRejection
{
    None = 0,

    /// <summary>The army is at home, supporting as a guest, or already on its way home — nothing left to extend.</summary>
    NoActiveJourney,

    /// <summary>
    /// Only <see cref="ArmyMission.Move"/>/<see cref="ArmyMission.Found"/> armies can take a field order — checked by
    /// the caller (<c>ArmyService.FieldOrderAsync</c>), not <see cref="Army.PlanFieldOrder"/> itself: an army that
    /// already fights, hunts, supports or raids is on its way to that and finishes it (or is recalled).
    /// </summary>
    MissionNotFieldOrderable,

    /// <summary>The order's mission is <see cref="ArmyMission.Found"/>; founding from the field is a retarget, not a field order.</summary>
    MissionNotAllowed,

    /// <summary>A <see cref="ArmyMission.Move"/> or <see cref="ArmyMission.Hunt"/> order named no destination.</summary>
    DestinationRequired,

    /// <summary>An Attack/Support/Raid order named no target settlement.</summary>
    TargetSettlementRequired,

    /// <summary>The named target settlement does not exist (in this world).</summary>
    TargetSettlementNotFound,

    /// <summary>An army cannot attack or raid its own home settlement.</summary>
    CannotAttackOwnSettlement,

    /// <summary>An army cannot support its own home settlement.</summary>
    CannotSupportOwnSettlement,

    /// <summary>A <see cref="ArmyMission.Hunt"/> order's destination holds no wildlife camp.</summary>
    NoCampAtDestination,

    /// <summary>A hunt by ships named a land camp; fleets only hunt water camps.</summary>
    HuntRequiresLandUnits,

    /// <summary>A hunt by land units named a water camp; only fleets reach one.</summary>
    HuntRequiresFleet,

    /// <summary>A target building was named for a mission other than Attack/Raid.</summary>
    TargetBuildingRequiresAttackMission,

    /// <summary>A fleet Attack/Raid named no target building on the target's shore.</summary>
    FleetTargetBuildingRequired,

    /// <summary>A fleet Attack/Raid's target building is not on the target's shore.</summary>
    FleetTargetBuildingNotOnShore,

    /// <summary>A fleet (or, for a split, one of its two parts) has more passengers than its ships have slots for.</summary>
    InsufficientShipCapacity,

    /// <summary>A Support order named no garrison spot of the target to join.</summary>
    SupportSpotRequired,

    /// <summary>The garrison spot a Support order named is none of the target's, or cannot hold the army's units.</summary>
    SupportSpotCannotHold,

    /// <summary>Only part of an army was ordered while it is still marching; only a standing army can be split.</summary>
    SplitRequiresStandingArmy,

    /// <summary>The selected units are empty, of a type the army does not hold, or more than it holds.</summary>
    InvalidUnitSelection,

    DestinationNotLand,
    DestinationNotSea,
    WaypointNotLand,
    WaypointNotSea,
    UnreachableLeg,

    /// <summary>A fleet's leg has no sea route (the water is cut off, or the target has no shore to land on).</summary>
    NoSeaRoute,

    /// <summary>The route search hit its node cap before reaching the destination: the trip is too long to plan.</summary>
    RouteTooLong,
    InsufficientProvisionsForRoundTrip,

    /// <summary>
    /// Waypoints on a "move on" order, or any "append goal" order at all,
    /// require a premium account — see <see cref="Army.PlanFieldOrder"/>'s
    /// own remarks and the design doc's rule table (issue #156 §3).
    /// </summary>
    PremiumRequired,
}

/// <summary>The outcome of asking to send an already-fielded army onward — mirrors <see cref="RetargetFoundingResult"/>.</summary>
/// <param name="Rejection">Why the order was refused, or <see cref="FieldOrderRejection.None"/>.</param>
/// <param name="Army">The army that leaves: the ordered army itself, or, for a split, the new army made of the selected units.</param>
/// <param name="Remainder">
/// For a split, the part that stays where it is (same id as the army that was ordered); <see langword="null"/> when the whole army was ordered.
/// </param>
public sealed record FieldOrderResult(FieldOrderRejection Rejection, Army? Army = null, Army? Remainder = null)
{
    public bool Accepted => Rejection == FieldOrderRejection.None && Army is not null;

    public static FieldOrderResult Rejected(FieldOrderRejection reason) => new(reason);

    public static FieldOrderResult Accept(Army army, Army? remainder = null) => new(FieldOrderRejection.None, army, remainder);
}

/// <summary>Why a dispatch was refused.</summary>
public enum DispatchRejection
{
    None = 0,
    SettlementNotFound,
    NoUnitsRequested,
    InsufficientGarrison,
    ProvisionsExceedCarryCapacity,
    InsufficientResources,
    DestinationNotLand,
    WaypointNotLand,
    UnreachableLeg,
    InsufficientProvisionsForRoundTrip,

    /// <summary>An <see cref="ArmyMission.Attack"/> or <see cref="ArmyMission.Support"/> dispatch named no target settlement.</summary>
    TargetSettlementRequired,

    /// <summary>The named target settlement does not exist.</summary>
    TargetSettlementNotFound,

    /// <summary>An army cannot be sent to attack the settlement it was dispatched from.</summary>
    CannotAttackOwnSettlement,

    /// <summary>A <see cref="ArmyMission.Move"/> dispatch named no destination.</summary>
    DestinationRequired,

    /// <summary>An army cannot be sent to support the settlement it was dispatched from.</summary>
    CannotSupportOwnSettlement,

    /// <summary>
    /// A target building coordinate was given for a mission other than
    /// <see cref="ArmyMission.Attack"/> — see <see cref="Army.TargetBuildingCoord"/>.
    /// </summary>
    TargetBuildingRequiresAttackMission,

    /// <summary>
    /// A fleet's destination is not <see cref="Terrain.Sea"/> — the fleet
    /// mirror of <see cref="DestinationNotLand"/> (issue #40 phase 6).
    /// </summary>
    DestinationNotSea,

    /// <summary>
    /// A fleet's waypoint is not <see cref="Terrain.Sea"/> — the fleet mirror
    /// of <see cref="WaypointNotLand"/> (issue #40 phase 6).
    /// </summary>
    WaypointNotSea,

    /// <summary>
    /// A fleet <see cref="ArmyMission.Attack"/>/<see cref="ArmyMission.Raid"/> named no target building: a fleet is
    /// always sent at one building on the target's shore. Never raised for a land army.
    /// </summary>
    FleetTargetBuildingRequired,

    /// <summary>
    /// A fleet <see cref="ArmyMission.Attack"/>/<see cref="ArmyMission.Raid"/>'s target building hex is not on the
    /// target's shore: outside the target's claim, or neither a <see cref="Shoreline.IsShoreline"/> land hex nor a
    /// <see cref="Terrain.Sea"/> hex. Never raised for a land army.
    /// </summary>
    FleetTargetBuildingNotOnShore,

    /// <summary>
    /// An <see cref="ArmyMission.Found"/> dispatch did not name exactly
    /// <see cref="Founding.RequiredSettlers"/>
    /// <see cref="UnitType.Settler"/> — too few to found, or more than the
    /// mission consumes (issue #55 §1).
    /// </summary>
    WrongSettlerCount,

    /// <summary>
    /// A fleet's passengers (its non-ship units) need more slots than its ships offer — see <see cref="ShipCargo"/>.
    /// </summary>
    InsufficientShipCapacity,

    /// <summary>
    /// The dispatching player's renown and current settlement count do not
    /// yet clear <see cref="RenownThresholds.AllowsAnotherSettlement"/>
    /// (issue #55 §3/§6) — checked once, at dispatch time.
    /// </summary>
    RenownOrSettlementSlotRequirementNotMet,

    /// <summary>
    /// An <see cref="ArmyMission.Found"/> dispatch's target hex fails the
    /// minimum-spacing rule (issue #55 §4) against some already-claimed
    /// settlement — see <see cref="Founding.IsHexFoundable"/>.
    /// </summary>
    TargetHexNotFoundable,

    /// <summary>A <see cref="ArmyMission.Hunt"/> dispatch's destination hex holds no wildlife camp.</summary>
    NoCampAtDestination,

    /// <summary>A <see cref="ArmyMission.Hunt"/> dispatch of ships named a land camp; fleets only hunt water camps (the whale road).</summary>
    HuntRequiresLandUnits,

    /// <summary>A <see cref="ArmyMission.Hunt"/> dispatch of land units named a water camp (the whale road); only fleets reach one.</summary>
    HuntRequiresFleet,

    /// <summary>A fleet's leg has no sea route (the water is cut off, or the target has no shore to land on).</summary>
    NoSeaRoute,

    /// <summary>The route search hit its node cap before reaching the destination: the trip is too long to plan.</summary>
    RouteTooLong,

    /// <summary>An <see cref="ArmyMission.SetUpCamp"/> dispatch did not name exactly <see cref="BeachCamp.RequiredBuilders"/> camp builders.</summary>
    WrongCampBuilderCount,

    /// <summary>An <see cref="ArmyMission.SetUpCamp"/> dispatch's target hex is not a sand hex on the shoreline.</summary>
    CampSiteNotSandShore,

    /// <summary>An <see cref="ArmyMission.SetUpCamp"/> dispatch's target hex holds a building, a settlement centre, a wildlife camp or a giant.</summary>
    CampSiteNotFree,

    /// <summary>The dispatch's <c>FromSpot</c> is not a garrison spot (longhouse, tower or dock) of the settlement.</summary>
    NotAGarrisonSpot,

    /// <summary>An <see cref="ArmyMission.Support"/> dispatch named no garrison spot of the target to join.</summary>
    SupportSpotRequired,

    /// <summary>The garrison spot a <see cref="ArmyMission.Support"/> dispatch named is none of the target's, or cannot hold the army's units.</summary>
    SupportSpotCannotHold,

    /// <summary>A dispatch listed units at more than one garrison spot; gathering from several spots on the way is not built yet.</summary>
    UnitsAtSeveralSpots,
}

/// <summary>The outcome of asking to dispatch an army — mirrors <see cref="BuildDecision"/>.</summary>
public sealed record DispatchDecision(DispatchRejection Rejection, Settlement? Settlement = null, Army? Army = null)
{
    public bool Accepted => Rejection == DispatchRejection.None && Settlement is not null && Army is not null;

    public static DispatchDecision Rejected(DispatchRejection reason) => new(reason);

    public static DispatchDecision Accept(Settlement settlement, Army army) => new(DispatchRejection.None, settlement, army);
}

/// <summary>
/// The settlement-only half of a dispatch decision: whether the garrison and
/// resources can cover what was requested, and — if so — the settlement with
/// those units and that food already removed, plus the normalised stack list
/// to actually send. Movement/food-range validation is
/// <see cref="Army.PlanDispatch"/>'s job, one layer up, since that needs
/// terrain the settlement itself has no access to.
/// </summary>
public sealed record SettlementDispatchDecision(
    DispatchRejection Rejection, Settlement? Settlement = null, IReadOnlyList<UnitStack>? Stacks = null)
{
    public bool Accepted => Rejection == DispatchRejection.None && Settlement is not null && Stacks is not null;

    public static SettlementDispatchDecision Rejected(DispatchRejection reason) => new(reason);

    public static SettlementDispatchDecision Accept(Settlement settlement, IReadOnlyList<UnitStack> stacks) =>
        new(DispatchRejection.None, settlement, stacks);
}

/// <summary>A march to a garrison spot (<see cref="Army.PlanSpotMarch"/>): the army (no provisions yet) and the food its walk burns.</summary>
public sealed record SpotMarch(Army Army, double FoodNeeded);
