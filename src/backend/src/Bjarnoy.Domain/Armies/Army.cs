using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Movement;
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

    // Raid and Support (support-joins-garrison is issue #40 phase 4) deliberately
    // have no cases yet — adding them is a data change to this enum plus new
    // PlanX methods, not a rewrite of Army's shape.
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
/// Land-only this phase (issue #40 phase 2): dispatch rejects a non-land
/// destination or waypoint outright, and <see cref="HexPathfinder"/> treats
/// sea as impassable. Ship movement is phase 6.
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
        Guid? targetSettlementId = null)
    {
        ArgumentNullException.ThrowIfNull(settlement);
        ArgumentNullException.ThrowIfNull(requestedUnits);
        ArgumentNullException.ThrowIfNull(waypoints);
        ArgumentNullException.ThrowIfNull(terrainAt);

        if (mission == ArmyMission.Attack)
        {
            if (targetSettlementId is null)
            {
                return DispatchDecision.Rejected(DispatchRejection.TargetSettlementRequired);
            }

            if (targetSettlementId == settlement.Id)
            {
                return DispatchDecision.Rejected(DispatchRejection.CannotAttackOwnSettlement);
            }
        }

        var settlementDecision = settlement.PlanDispatch(requestedUnits, provisions, now);
        if (!settlementDecision.Accepted)
        {
            return DispatchDecision.Rejected(settlementDecision.Rejection);
        }

        if (!terrainAt(destination).IsLand())
        {
            return DispatchDecision.Rejected(DispatchRejection.DestinationNotLand);
        }

        foreach (var waypoint in waypoints)
        {
            if (!terrainAt(waypoint).IsLand())
            {
                return DispatchDecision.Rejected(DispatchRejection.WaypointNotLand);
            }
        }

        List<HexCoord> stops = [settlement.Centre, .. waypoints, destination];
        List<HexCoord> fullPath = [settlement.Centre];

        for (var i = 0; i < stops.Count - 1; i++)
        {
            var leg = HexPathfinder.FindPath(stops[i], stops[i + 1], terrainAt, isLandUnit: true);
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

        var cumulativeHours = HexPathfinder.CumulativeHours(fullPath, terrainAt, speed);

        var returnPath = HexPathfinder.FindPath(destination, settlement.Centre, terrainAt, isLandUnit: true);
        if (returnPath is null || returnPath.Count == 0)
        {
            return DispatchDecision.Rejected(DispatchRejection.UnreachableLeg);
        }

        var returnCumulativeHours = HexPathfinder.CumulativeHours(returnPath, terrainAt, speed);

        var totalFoodNeeded = (cumulativeHours[^1] + returnCumulativeHours[^1]) * upkeepPerHour;
        if (provisions < totalFoodNeeded)
        {
            return DispatchDecision.Rejected(DispatchRejection.InsufficientProvisionsForRoundTrip);
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
            TargetSettlementId = mission == ArmyMission.Attack ? targetSettlementId : null,
        };

        return DispatchDecision.Accept(settlementDecision.Settlement!, army);
    }

    /// <summary>
    /// Settles an <see cref="ArmyMission.Attack"/> army's arrival at its
    /// target: if <paramref name="now"/> has reached the outbound leg's
    /// <see cref="Movement.ArrivesAt"/>, the battle happens right there — no
    /// standing at the destination the way <see cref="Move"/> allows — and
    /// this returns the fought-out <see cref="BattlePlan"/> alongside the
    /// updated army and defender settlement. Otherwise (mid-journey, already
    /// on the return leg, or a <see cref="Move"/>-mission army) this is a
    /// no-op: <see cref="ArmyArrivalResult.Fought"/> is <see langword="false"/>
    /// and both aggregates come back unchanged, so a caller can call this
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
        Army army, Settlement defenderSettlement, double defenderSpeedFactor, DateTimeOffset now, int seed)
    {
        ArgumentNullException.ThrowIfNull(army);
        ArgumentNullException.ThrowIfNull(defenderSettlement);

        if (army.Mission != ArmyMission.Attack
            || army.Location is not ArmyLocation.InTransit { Movement.IsReturning: false } inTransit
            || now < inTransit.Movement.ArrivesAt)
        {
            return new ArmyArrivalResult(army, defenderSettlement, Fought: false, Battle: null);
        }

        var movement = inTransit.Movement;
        var battleInstant = movement.ArrivesAt;

        // The defender as of the exact instant the attacker lands — not
        // "now", which may be later — so the garrison and stock the battle
        // sees are the ones that were actually there.
        var settledDefender = defenderSettlement.SettleTo(battleInstant, defenderSpeedFactor).Settlement;

        var towerLevel = settledDefender.Buildings
            .Where(b => b.Type == BuildingType.Tower)
            .Select(b => b.Level)
            .DefaultIfEmpty(0)
            .Max();
        var defenseBonusPercent = BuildingCatalogue.TowerDefenseBonusPercent(towerLevel);

        var lootAvailable = settledDefender.Resources.At(battleInstant);
        var plan = BattleResolver.Resolve(
            army.Stacks, settledDefender.Garrison, defenseBonusPercent, lootAvailable, seed);

        // Loot leaves the defender's stock at the instant of battle even
        // though it does not reach the attacker's own stock until the
        // survivors physically get home (see Loot's remarks) — it is gone
        // from the defender either way.
        var afterLoot = settledDefender.Resources.TrySpend(plan.LootTaken, battleInstant, out var spent)
            ? spent
            : settledDefender.Resources.SettledTo(battleInstant);

        var defenderPostBattle = settledDefender with { Garrison = plan.DefenderSurvivors, Resources = afterLoot };
        var finalDefender = defenderPostBattle.SettleTo(now, defenderSpeedFactor).Settlement;

        var survivorCount = plan.AttackerSurvivors.Sum(s => s.Count);
        if (survivorCount == 0)
        {
            return new ArmyArrivalResult(null, finalDefender, Fought: true, plan);
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

        return new ArmyArrivalResult(survivorArmy, finalDefender, Fought: true, plan);
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
    public Army? Recall(DateTimeOffset now, HexCoord home, Func<HexCoord, Terrain> terrainAt)
    {
        ArgumentNullException.ThrowIfNull(terrainAt);

        if (Location is not ArmyLocation.InTransit inTransit || inTransit.Movement.IsReturning)
        {
            return null;
        }

        var currentHex = inTransit.Movement.PositionAt(now);
        var path = HexPathfinder.FindPath(currentHex, home, terrainAt, isLandUnit: true);
        if (path is null || path.Count == 0)
        {
            return null;
        }

        var speed = TotalSpeed;
        var cumulativeHours = HexPathfinder.CumulativeHours(path, terrainAt, speed);
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
public sealed record ArmyArrivalResult(Army? Army, Settlement DefenderSettlement, bool Fought, Combat.BattlePlan? Battle);

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

    /// <summary>An <see cref="ArmyMission.Attack"/> dispatch named no target settlement.</summary>
    TargetSettlementRequired,

    /// <summary>The named target settlement does not exist.</summary>
    TargetSettlementNotFound,

    /// <summary>An army cannot be sent to attack the settlement it was dispatched from.</summary>
    CannotAttackOwnSettlement,

    /// <summary>A <see cref="ArmyMission.Move"/> dispatch named no destination.</summary>
    DestinationRequired,
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
