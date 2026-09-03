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
/// An army is either a fleet (every stack <see cref="UnitClass.Ship"/>) or a
/// land army (no stack <see cref="UnitClass.Ship"/>) — never both (issue #40
/// phase 6 §2; <see cref="PlanDispatch"/> rejects a mixed dispatch outright).
/// A fleet's destination/waypoints must be <see cref="Terrain.Sea"/>, a land
/// army's must be land — <see cref="HexPathfinder"/> treats the opposite
/// terrain as impassable either way. There is no transport/ferry mechanic:
/// land troops cannot be carried by ship (design doc §8, explicitly
/// deferred).
/// </para>
/// </remarks>
public sealed record Army
{
    public required Guid Id { get; init; }

    /// <summary>The settlement this army was dispatched from, and returns to.</summary>
    public required Guid SettlementId { get; init; }

    public IReadOnlyList<UnitStack> Stacks { get; init; } = [];

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
    /// The building this <see cref="ArmyMission.Attack"/> army was told to
    /// hit with any surviving catapults (issue #40 phase 5) — a coordinate
    /// within the target settlement, not an arbitrary hex. <see langword="null"/>
    /// means "no preference": <see cref="Combat.SiegeResolver.Resolve"/>
    /// picks uniformly at random among whatever buildings the defender
    /// actually has standing when the army arrives. Only ever set for
    /// <see cref="ArmyMission.Attack"/> — see <see cref="PlanDispatch"/>.
    /// Deliberately unvalidated against the target's actual layout at
    /// dispatch time (that layout can change before the army arrives — see
    /// <see cref="PlanDispatch"/>'s remarks); <see cref="SettleArrival"/> is
    /// what checks whether a building still stands there.
    /// </summary>
    public HexCoord? TargetBuildingCoord { get; init; }

    /// <summary>
    /// Resources looted from a won <see cref="ArmyMission.Attack"/> battle,
    /// carried home alongside the surviving stacks and deposited into the
    /// home settlement's stock only once the army actually arrives (mirroring
    /// how <see cref="Stacks"/> itself is only folded into the garrison on
    /// arrival — see <c>ArmyService</c>). Zero otherwise.
    /// </summary>
    public ResourceAmounts Loot { get; init; }

    /// <summary>The slowest unit type present sets the pace — a catapult army crawls at catapult speed.</summary>
    public double TotalSpeed => Stacks.Count == 0 ? 0 : Stacks.Min(s => UnitCatalogue.Get(s.Type).Speed);

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

    /// <summary>Current hex: <paramref name="home"/> while <see cref="ArmyLocation.AtHome"/>, else the active leg's position.</summary>
    public HexCoord PositionAt(HexCoord home, DateTimeOffset now) => Location switch
    {
        ArmyLocation.InTransit inTransit => inTransit.Movement.PositionAt(now),
        _ => home,
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
    /// <summary>
    /// A support army only needs to reach its host, plus a small buffer — the
    /// host feeds it from the moment it arrives (see
    /// <c>Settlement.SettleTo</c>'s <c>guestStacks</c> parameter), so unlike
    /// <see cref="ArmyMission.Move"/>/<see cref="ArmyMission.Attack"/> there is
    /// no return trip to provision for. The buffer covers the gap between
    /// "arrives" and "the host's next settle actually picks it up as a guest"
    /// (a settlement is only settled when something reads or writes it, not
    /// continuously) — two hours is comfortably more than that gap will
    /// realistically ever be, without materially weakening the one-way food
    /// check into a non-check for slow-upkeep units.
    /// </summary>
    public const double SupportReserveHours = 2.0;

    /// <param name="targetClaimDiscs">
    /// The target settlement's full claimed territory, as the same
    /// (centre, radius) discs <see cref="Settlement.ClaimDiscs"/> yields —
    /// the centre disc plus one satellite disc per placed Tower, each
    /// centred on that tower's own hex, not the settlement's centre. Only
    /// consulted when <paramref name="mission"/> is <see cref="ArmyMission.Attack"/>
    /// or <see cref="ArmyMission.Raid"/> and the requested units are a fleet
    /// (issue #40 phase 6, design doc §8): a fleet can only reach a
    /// settlement that claims at least one <see cref="Shoreline.IsShoreline"/>
    /// hex anywhere in its territory — a tower can extend that territory to
    /// the coast even when the centre disc alone never reaches it, so every
    /// disc is walked, not just the one around <paramref name="destination"/>.
    /// <see langword="null"/> or empty is treated as a single zero-radius
    /// disc at <paramref name="destination"/> (only <paramref name="destination"/>
    /// itself must be a shoreline hex) — a safe default for callers that
    /// have not computed the target's real territory. Ignored for land
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
    public static DispatchDecision PlanDispatch(
        Settlement settlement,
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
        Func<HexCoord, bool>? isRiver = null)
    {
        ArgumentNullException.ThrowIfNull(settlement);
        ArgumentNullException.ThrowIfNull(requestedUnits);
        ArgumentNullException.ThrowIfNull(waypoints);
        ArgumentNullException.ThrowIfNull(terrainAt);

        var normalisedRequest = requestedUnits.Where(s => s.Count > 0).ToList();

        // Shape validation only — whether a requested unit type even exists is
        // Settlement.PlanDispatch's job below; this only rejects mixing the
        // two unit-class families (issue #40 phase 6 §2). A fleet (every
        // requested class is UnitClass.Ship) and a land army (no Ship class
        // requested) are otherwise handled identically from here on, just
        // against different terrain/pathfinder tables.
        //
        // ArmyMission.Found gets one narrow exception (issue #55 §2 "by
        // sea"): Ship stacks alongside UnitType.SettlerCrew stacks are read
        // as "the ships are carrying the crews" rather than an illegal mix —
        // there is still no general ferry mechanic, so any other non-Ship
        // class alongside Ship remains rejected even for Found.
        var requestedClasses = normalisedRequest
            .Select(s => UnitCatalogue.Get(s.Type).Class)
            .ToHashSet();
        var isFoundingConvoy = mission == ArmyMission.Found;
        var nonShipClasses = requestedClasses.Where(c => c != UnitClass.Ship).ToHashSet();
        var isSettlerEmbark = isFoundingConvoy
            && requestedClasses.Contains(UnitClass.Ship)
            && nonShipClasses.Count > 0
            && nonShipClasses.SetEquals([UnitClass.Civilian])
            && normalisedRequest.Where(s => UnitCatalogue.Get(s.Type).Class == UnitClass.Civilian)
                .All(s => s.Type == UnitType.SettlerCrew);

        bool isFleet;
        if (isSettlerEmbark)
        {
            isFleet = true;
        }
        else
        {
            isFleet = requestedClasses.Count > 0 && requestedClasses.All(c => c == UnitClass.Ship);
            if (!isFleet && requestedClasses.Contains(UnitClass.Ship))
            {
                return DispatchDecision.Rejected(DispatchRejection.MixedFleetAndLandUnits);
            }
        }

        if (isFoundingConvoy)
        {
            var settlerCrews = normalisedRequest
                .Where(s => s.Type == UnitType.SettlerCrew)
                .Sum(s => s.Count);
            if (settlerCrews != Founding.RequiredSettlerCrews)
            {
                return DispatchDecision.Rejected(DispatchRejection.WrongSettlerCrewCount);
            }

            if (isFleet)
            {
                var shipCapacity = normalisedRequest
                    .Where(s => UnitCatalogue.Get(s.Type).Class == UnitClass.Ship)
                    .Sum(s => Founding.ShipCapacity(s.Type) * s.Count);
                if (settlerCrews > shipCapacity)
                {
                    return DispatchDecision.Rejected(DispatchRejection.InsufficientShipCapacityForSettlers);
                }
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

        if (mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid)
        {
            if (targetSettlementId is null)
            {
                return DispatchDecision.Rejected(DispatchRejection.TargetSettlementRequired);
            }

            if (targetSettlementId == settlement.Id)
            {
                return DispatchDecision.Rejected(mission == ArmyMission.Support
                    ? DispatchRejection.CannotSupportOwnSettlement
                    : DispatchRejection.CannotAttackOwnSettlement);
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
        if (targetBuildingCoord is not null && mission is not (ArmyMission.Attack or ArmyMission.Raid))
        {
            return DispatchDecision.Rejected(DispatchRejection.TargetBuildingRequiresAttackMission);
        }

        // Ships raid resources only (design doc §8) — a fleet attacking a
        // fully inland settlement has no shoreline to land on at all. Land
        // armies are unaffected. (A fleet can never carry a Catapult in the
        // first place — Catapult is UnitClass.Siege, not Ship, so the mixed-
        // class rejection above already makes "an all-Ship dispatch with a
        // catapult in it" unreachable; no separate check is needed here.)
        if (mission is ArmyMission.Attack or ArmyMission.Raid && isFleet)
        {
            IReadOnlyList<(HexCoord Centre, int Radius)> discs =
                targetClaimDiscs is { Count: > 0 } ? targetClaimDiscs : [(destination, 0)];
            var targetHasShoreline = discs
                .SelectMany(disc => disc.Centre.WithinRadius(disc.Radius))
                .Any(coord => Shoreline.IsShoreline(coord, terrainAt));
            if (!targetHasShoreline)
            {
                return DispatchDecision.Rejected(DispatchRejection.DefenderHasNoShoreline);
            }
        }

        var settlementDecision = settlement.PlanDispatch(requestedUnits, provisions, now);
        if (!settlementDecision.Accepted)
        {
            return DispatchDecision.Rejected(settlementDecision.Rejection);
        }

        // A fleet needs every hex of its route to be open sea; a land army
        // needs every hex to be land — same shape, opposite terrain, so one
        // isLandUnit flag threads through both the terrain checks below and
        // every HexPathfinder call for this dispatch.
        var isLandUnit = !isFleet;

        // A land army's Attack/Support destination is always a real
        // settlement's own centre — inherently land — so this check applies
        // to it exactly as before fleets existed. A fleet's Attack/Support
        // destination is that same settlement centre, which is land too —
        // but landing there is exactly the point for a fleet (see FindPath's
        // isLandUnit remarks on the beaching/harbor exemption it applies at
        // both route endpoints), so this generic sea-only check is skipped
        // only for that one combination; the real fleet-reachability gate for
        // Attack is DefenderHasNoShoreline above, not this check. A sea Found
        // convoy's destination is, by definition, the land hex it means to
        // land settlers on (issue #55 §2) — same beaching exemption, no
        // separate shoreline check needed: HexPathfinder can only ever reach
        // that land hex by sea if it is adjacent to reachable open water,
        // which is exactly what "shoreline" means (see Shoreline.IsShoreline);
        // any other land hex fails as UnreachableLeg below instead.
        var skipDestinationTerrainCheck = isFleet && mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid or ArmyMission.Found;
        if (!skipDestinationTerrainCheck && terrainAt(destination).IsLand() != isLandUnit)
        {
            return DispatchDecision.Rejected(isFleet
                ? DispatchRejection.DestinationNotSea
                : DispatchRejection.DestinationNotLand);
        }

        foreach (var waypoint in waypoints)
        {
            if (terrainAt(waypoint).IsLand() != isLandUnit)
            {
                return DispatchDecision.Rejected(isFleet
                    ? DispatchRejection.WaypointNotSea
                    : DispatchRejection.WaypointNotLand);
            }
        }

        List<HexCoord> stops = [settlement.Centre, .. waypoints, destination];
        List<HexCoord> fullPath = [settlement.Centre];

        for (var i = 0; i < stops.Count - 1; i++)
        {
            var leg = HexPathfinder.FindPath(stops[i], stops[i + 1], terrainAt, isLandUnit, isRiver);
            if (leg is null || leg.Count == 0)
            {
                return DispatchDecision.Rejected(DispatchRejection.UnreachableLeg);
            }

            // Drop the joint hex: leg[0] is stops[i], already the last entry added.
            fullPath.AddRange(leg.Skip(1));
        }

        var stacks = settlementDecision.Stacks!;
        var speed = stacks.Min(s => UnitCatalogue.Get(s.Type).Speed);
        var upkeepPerHour = stacks.Sum(s => UnitCatalogue.Get(s.Type).UpkeepPerHour * s.Count);

        var cumulativeHours = HexPathfinder.CumulativeHours(fullPath, terrainAt, speed, isLandUnit, speedFactor, isRiver);

        var returnPath = HexPathfinder.FindPath(destination, settlement.Centre, terrainAt, isLandUnit, isRiver);
        if (returnPath is null || returnPath.Count == 0)
        {
            return DispatchDecision.Rejected(DispatchRejection.UnreachableLeg);
        }

        var returnCumulativeHours = HexPathfinder.CumulativeHours(returnPath, terrainAt, speed, isLandUnit, speedFactor, isRiver);

        // Support only needs a one-way trip plus a small reserve — see
        // SupportReserveHours — everything else still needs the full round
        // trip, since standing at a Move destination or returning from an
        // Attack both burn provisions with nobody else feeding the army.
        var totalFoodNeeded = mission == ArmyMission.Support
            ? (cumulativeHours[^1] + SupportReserveHours) * upkeepPerHour
            : (cumulativeHours[^1] + returnCumulativeHours[^1]) * upkeepPerHour;

        if (provisions < totalFoodNeeded)
        {
            return DispatchDecision.Rejected(mission == ArmyMission.Support
                ? DispatchRejection.InsufficientProvisionsForTrip
                : DispatchRejection.InsufficientProvisionsForRoundTrip);
        }

        var movement = Movement.Movement.Create(
            now, fullPath, cumulativeHours, returnPath, returnCumulativeHours, provisions, upkeepPerHour);

        var army = new Army
        {
            Id = armyId,
            SettlementId = settlement.Id,
            Stacks = stacks,
            Location = new ArmyLocation.InTransit(movement),
            Provisions = provisions,
            Mission = mission,
            TargetSettlementId = mission is ArmyMission.Attack or ArmyMission.Support or ArmyMission.Raid ? targetSettlementId : null,
            TargetBuildingCoord = mission is ArmyMission.Attack or ArmyMission.Raid ? targetBuildingCoord : null,
        };

        return DispatchDecision.Accept(settlementDecision.Settlement!, army);
    }

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
    public static ArmyArrivalResult SettleArrival(
        Army army, Settlement defenderSettlement, double defenderSpeedFactor, DateTimeOffset now, int seed,
        IReadOnlyList<UnitStack>? guestDefenderStacks = null)
    {
        ArgumentNullException.ThrowIfNull(army);
        ArgumentNullException.ThrowIfNull(defenderSettlement);

        if (army.Mission is not (ArmyMission.Attack or ArmyMission.Raid)
            || army.Location is not ArmyLocation.InTransit { Movement.IsReturning: false } inTransit
            || now < inTransit.Movement.ArrivesAt)
        {
            return new ArmyArrivalResult(army, defenderSettlement, Fought: false, Battle: null, GuestLosses: [], Siege: null);
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

        var towerLevel = settledDefender.Buildings
            .Where(b => b.Type == BuildingType.Tower)
            .Select(b => b.Level)
            .DefaultIfEmpty(0)
            .Max();
        var defenseBonusPercent = BuildingCatalogue.TowerDefenseBonusPercent(towerLevel);

        var lootAvailable = settledDefender.Resources.At(battleInstant);

        // Guest armies fight alongside the home garrison (issue #40 phase 4
        // §3): their stacks are merged, by type, into the defense side the
        // resolver sees, so combined defense power (and hence the win/loss
        // outcome itself) properly reflects everyone standing on the wall.
        var combinedDefense = MergeStacksByType(settledDefender.Garrison, guestDefenderStacks);
        var plan = BattleResolver.Resolve(
            army.Stacks, combinedDefense, defenseBonusPercent, lootAvailable, seed, raid: army.Mission == ArmyMission.Raid);

        // Loot leaves the defender's stock at the instant of battle even
        // though it does not reach the attacker's own stock until the
        // survivors physically get home (see Loot's remarks) — it is gone
        // from the defender either way.
        var afterLoot = settledDefender.Resources.TrySpend(plan.LootTaken, battleInstant, out var spent)
            ? spent
            : settledDefender.Resources.SettledTo(battleInstant);

        // Loot deliberately reaches into reserved resources too (taking them
        // is the entire point of a raid) — a reservation is only unspendable
        // by the settlement's own economy (issue #158 stage 1c). If the raid
        // took the stock below what the waiting queue has earmarked, the
        // first unfunded waiting order and everything behind it is dropped
        // at this same instant, not whenever someone next looks.
        settledDefender = (settledDefender with { Resources = afterLoot }).DropUnfundedOrders(battleInstant);

        // plan.DefenderLosses/DefenderSurvivors are pooled across home+guest
        // (they were computed against combinedDefense above) — split each
        // type's pooled loss back between "home garrison" and "the guest
        // total", proportional to each side's own pre-battle holding of that
        // type (ProportionalAllocator; see its remarks). A second split, of
        // the guest total across the actual guest Army records, happens one
        // layer up in ArmyService — this method only knows the pooled guest
        // total, never individual guest armies, to keep it DB-free.
        var homeLosses = SplitPooledByOwner(plan.DefenderLosses, settledDefender.Garrison, guestDefenderStacks, wantHome: true);
        var guestLosses = SplitPooledByOwner(plan.DefenderLosses, settledDefender.Garrison, guestDefenderStacks, wantHome: false);
        var homeSurvivors = SubtractStacks(settledDefender.Garrison, homeLosses);

        var defenderPostBattle = settledDefender with { Garrison = homeSurvivors, Resources = afterLoot };

        // Catapult damage (issue #40 phase 5): only ever applied on an
        // attacker win, against whatever survived the fight. Applied to
        // Buildings before the forward SettleTo below, so the resulting
        // production/capacity totals (and hence any starvation the loss of a
        // Farm/FishingHut/PumpkinFarm triggers) already reflect the damage —
        // Settlement.SettleTo recomputes both from Buildings on every call,
        // nothing extra is needed here for that to fall out correctly.
        var siege = plan.Winner == BattleWinner.Attacker
            ? Combat.SiegeResolver.Resolve(
                plan.AttackerSurvivors, defenderPostBattle.Buildings, army.TargetBuildingCoord, seed)
            : Combat.SiegeOutcome.None;

        if (siege.Applied)
        {
            // Drops any build order still targeting the hit hex when the
            // catapult destroyed it outright, or the next SettleTo would find
            // nothing standing there and silently rebuild it (issue #158
            // stage 1b).
            defenderPostBattle = defenderPostBattle.WithSiegeDamage(
                siege.UpdatedBuildings!, siege.TargetCoord!.Value, battleInstant, defenderSpeedFactor, guestDefenderStacks);
        }

        var finalDefender = defenderPostBattle.SettleTo(now, defenderSpeedFactor).Settlement;

        var survivorCount = plan.AttackerSurvivors.Sum(s => s.Count);
        if (survivorCount == 0)
        {
            return new ArmyArrivalResult(null, finalDefender, Fought: true, plan, guestLosses, siege);
        }

        // Rebase provisions to what the (pre-battle, full-strength) army had
        // actually burned reaching the battle instant — same trick
        // SettleTo's turn-around branch uses for Move.
        var elapsedOutboundHours = (battleInstant - movement.DepartedAt).TotalHours;
        var provisionsAtBattle = Math.Max(0, army.Provisions - (army.TotalUpkeepPerHour * elapsedOutboundHours));

        var returning = new Movement.Movement
        {
            DepartedAt = battleInstant,
            Path = movement.ReturnPath,
            CumulativeHours = movement.ReturnCumulativeHours,
            ReturnPath = movement.ReturnPath,
            ReturnCumulativeHours = movement.ReturnCumulativeHours,
            TurnAroundAt = battleInstant,
            IsReturning = true,
        };

        var survivorArmy = army with
        {
            Stacks = plan.AttackerSurvivors,
            Location = new ArmyLocation.InTransit(returning),
            Provisions = provisionsAtBattle,
            Loot = plan.LootTaken,
        };

        return new ArmyArrivalResult(survivorArmy, finalDefender, Fought: true, plan, guestLosses, siege);
    }

    /// <summary>Merges two stack lists into one, aggregated by type.</summary>
    private static IReadOnlyList<UnitStack> MergeStacksByType(
        IReadOnlyList<UnitStack> a, IReadOnlyList<UnitStack> b) =>
        a.Concat(b)
            .GroupBy(s => s.Type)
            .Select(g => new UnitStack(g.Key, g.Sum(s => s.Count)))
            .ToList();

    /// <summary>Subtracts <paramref name="losses"/> from <paramref name="stacks"/>, per type, dropping a type that reaches zero.</summary>
    private static IReadOnlyList<UnitStack> SubtractStacks(
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
    private static IReadOnlyList<UnitStack> SplitPooledByOwner(
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
            Location = new ArmyLocation.Supporting(army.TargetSettlementId!.Value),
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

        // Exactly RequiredSettlerCrews were required at dispatch (PlanDispatch's
        // WrongSettlerCrewCount rejection), so every SettlerCrew stack present
        // is consumed entire; whatever else travelled along (ships that
        // carried them, any escort) is what the new settlement starts with —
        // "undefended except for any escort units that travelled with the
        // convoy" (issue #55 §5). Ships are not a sensible land garrison, but
        // this deliberately does not special-case them out: a player who
        // sailed settlers over with no other escort ends up with the ships
        // themselves as the only "defenders", exactly as reasonable a v1
        // reading of "leaves it undefended except escorts" as any other.
        var garrisonForNewSettlement = army.Stacks.Where(s => s.Type != UnitType.SettlerCrew).ToList();

        return new FoundingArrivalResult(
            Arrived: true, ShouldFound: true, Army: null, GarrisonForNewSettlement: garrisonForNewSettlement, FoundedAt: targetHex);
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
    public static RetargetFoundingResult RetargetFounding(
        Army army, HexCoord newTarget, DateTimeOffset now, HexCoord home, Func<HexCoord, Terrain> terrainAt,
        double speedFactor = 1.0)
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

        // Mirrors PlanDispatch's own skipDestinationTerrainCheck: an overland
        // convoy's new target must itself be land; a sea convoy is exempt —
        // the beaching exemption baked into HexPathfinder/FindPath below
        // already requires the hex to be reachable by water, which is exactly
        // what a shoreline hex is.
        if (isLandUnit && !terrainAt(newTarget).IsLand())
        {
            return RetargetFoundingResult.Rejected(RetargetFoundingRejection.TargetNotReachable);
        }

        var path = HexPathfinder.FindPath(fromHex, newTarget, terrainAt, isLandUnit);
        if (path is null || path.Count == 0)
        {
            return RetargetFoundingResult.Rejected(RetargetFoundingRejection.TargetNotReachable);
        }

        var returnPath = HexPathfinder.FindPath(newTarget, home, terrainAt, isLandUnit);
        if (returnPath is null || returnPath.Count == 0)
        {
            return RetargetFoundingResult.Rejected(RetargetFoundingRejection.TargetNotReachable);
        }

        var speed = army.TotalSpeed;
        var upkeepPerHour = army.TotalUpkeepPerHour;
        var cumulativeHours = HexPathfinder.CumulativeHours(path, terrainAt, speed, isLandUnit, speedFactor);
        var returnCumulativeHours = HexPathfinder.CumulativeHours(returnPath, terrainAt, speed, isLandUnit, speedFactor);

        var provisionsNow = army.ProvisionsAt(now);
        var totalFoodNeeded = (cumulativeHours[^1] + returnCumulativeHours[^1]) * upkeepPerHour;
        if (provisionsNow < totalFoodNeeded)
        {
            return RetargetFoundingResult.Rejected(RetargetFoundingRejection.InsufficientProvisionsForRoundTrip);
        }

        var movement = Movement.Movement.Create(
            now, path, cumulativeHours, returnPath, returnCumulativeHours, provisionsNow, upkeepPerHour);

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
                ReturnPath = movement.ReturnPath,
                ReturnCumulativeHours = movement.ReturnCumulativeHours,
                TurnAroundAt = movement.TurnAroundAt,
                IsReturning = true,
            };

            var turned = this with
            {
                Location = new ArmyLocation.InTransit(returning),
                Provisions = provisionsAtTurnAround,
            };

            return now >= returning.ArrivesAt
                ? new ArmySettleResult(turned with { Location = new ArmyLocation.AtHome() }, Changed: true, ArrivedHome: true)
                : new ArmySettleResult(turned, Changed: true, ArrivedHome: false);
        }

        if (now >= movement.ArrivesAt)
        {
            return new ArmySettleResult(this with { Location = new ArmyLocation.AtHome() }, Changed: true, ArrivedHome: true);
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
    public Army? Recall(
        DateTimeOffset now, HexCoord home, Func<HexCoord, Terrain> terrainAt, HexCoord? currentHex = null,
        double speedFactor = 1.0, Func<HexCoord, bool>? isRiver = null)
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

        // Stacks are never mixed (PlanDispatch's MixedFleetAndLandUnits
        // rejection guarantees that at dispatch time), so "all Ship" or "no
        // Ship" is an exhaustive, unambiguous read of which pathfinder table
        // this army's own recall route needs.
        var isLandUnit = Stacks.Count == 0 || Stacks.Any(s => UnitCatalogue.Get(s.Type).Class != UnitClass.Ship);

        var path = HexPathfinder.FindPath(fromHex, home, terrainAt, isLandUnit, isRiver);
        if (path is null || path.Count == 0)
        {
            return null;
        }

        var speed = TotalSpeed;
        var cumulativeHours = HexPathfinder.CumulativeHours(path, terrainAt, speed, isLandUnit, speedFactor, isRiver);

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
            ReturnPath = path,
            ReturnCumulativeHours = cumulativeHours,
            TurnAroundAt = now,
            IsReturning = true,
        };

        return this with { Location = new ArmyLocation.InTransit(recallMovement), Provisions = provisionsNow };
    }

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
    public Army? TeleportTo(
        HexCoord coord, HexCoord home, DateTimeOffset now, Func<HexCoord, Terrain> terrainAt,
        double? provisions = null, double speedFactor = 1.0, Func<HexCoord, bool>? isRiver = null)
    {
        ArgumentNullException.ThrowIfNull(terrainAt);

        // Same exhaustive read of the army's unit class Recall uses — stacks
        // are never mixed (PlanDispatch guarantees it at dispatch time).
        var isLandUnit = Stacks.Count == 0 || Stacks.Any(s => UnitCatalogue.Get(s.Type).Class != UnitClass.Ship);

        if (terrainAt(coord).IsLand() != isLandUnit)
        {
            return null;
        }

        var returnPath = HexPathfinder.FindPath(coord, home, terrainAt, isLandUnit, isRiver);
        if (returnPath is null || returnPath.Count == 0)
        {
            return null;
        }

        var returnCumulativeHours = HexPathfinder.CumulativeHours(returnPath, terrainAt, TotalSpeed, isLandUnit, speedFactor, isRiver);
        var provisionsNow = provisions is { } given ? Math.Max(0, given) : ProvisionsAt(now);

        var movement = Movement.Movement.Create(
            now, [coord], [0d], returnPath, returnCumulativeHours, provisionsNow, TotalUpkeepPerHour);

        return this with { Location = new ArmyLocation.InTransit(movement), Provisions = provisionsNow };
    }
}

/// <param name="ArrivedHome">
/// True when this settle brought the army all the way home — the caller
/// (<c>ArmyService</c>) is then responsible for folding <see cref="Army.Stacks"/>
/// into the home settlement's <see cref="Settlement.Garrison"/> and retiring
/// the army row; see the type-level remarks on <see cref="Army"/>.
/// </param>
public sealed record ArmySettleResult(Army Army, bool Changed, bool ArrivedHome);

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
/// never even attempted) — see <see cref="Combat.SiegeResolver.Resolve"/>.
/// </param>
public sealed record ArmyArrivalResult(
    Army? Army, Settlement DefenderSettlement, bool Fought, Combat.BattlePlan? Battle,
    IReadOnlyList<UnitStack> GuestLosses, Combat.SiegeOutcome? Siege);

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
    /// A <see cref="ArmyMission.Support"/> dispatch's provisions do not cover
    /// the one-way trip plus <see cref="Army.SupportReserveHours"/> — see
    /// <see cref="Army.PlanDispatch"/>'s remarks on why support only needs a
    /// one-way check, unlike <see cref="InsufficientProvisionsForRoundTrip"/>.
    /// </summary>
    InsufficientProvisionsForTrip,

    /// <summary>
    /// A target building coordinate was given for a mission other than
    /// <see cref="ArmyMission.Attack"/> — see <see cref="Army.TargetBuildingCoord"/>.
    /// </summary>
    TargetBuildingRequiresAttackMission,

    /// <summary>
    /// A dispatch requested both <see cref="UnitClass.Ship"/> and non-Ship
    /// unit types together (issue #40 phase 6 §2) — an army must be either a
    /// fleet or a land army, never both; there is no transport/ferry
    /// mechanic yet (design doc §8, explicitly deferred).
    /// </summary>
    MixedFleetAndLandUnits,

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
    /// A fleet's <see cref="ArmyMission.Attack"/> target settlement claims no
    /// <see cref="Shoreline.IsShoreline"/> hex — a fully inland
    /// settlement cannot be reached by ship at all (issue #40 phase 6, design
    /// doc §8). Never raised for a land army.
    /// </summary>
    DefenderHasNoShoreline,

    /// <summary>
    /// An <see cref="ArmyMission.Found"/> dispatch did not name exactly
    /// <see cref="Founding.RequiredSettlerCrews"/>
    /// <see cref="UnitType.SettlerCrew"/> — too few to found, or more than the
    /// mission consumes (issue #55 §1).
    /// </summary>
    WrongSettlerCrewCount,

    /// <summary>
    /// An <see cref="ArmyMission.Found"/> sea convoy named more settler crews
    /// than its ships can carry — see <see cref="Founding.ShipCapacity"/>.
    /// </summary>
    InsufficientShipCapacityForSettlers,

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
