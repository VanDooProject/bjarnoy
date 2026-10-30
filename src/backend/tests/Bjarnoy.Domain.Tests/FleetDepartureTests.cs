using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Issue #450, departure half: a fleet leaves from and returns to its settlement's harbour hex
/// (<see cref="Army.FleetAnchor(HexCoord, IEnumerable{PlacedBuilding}, Func{HexCoord, Terrain})"/>), which is the
/// Dockyard when the centre is inland. Only coastal targets are used here; arrival at inland targets is a separate change.
/// </summary>
public class FleetDepartureTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord InlandHome = new(0, 0);
    private static readonly HexCoord Dock = new(3, 0);
    private static readonly HexCoord CoastalTarget = new(9, 0);

    // Sea in the middle columns, grass either side: (0,0) is three hexes from the water, (2,0) touches it.
    private static Terrain Strait(HexCoord c) => c.Q is >= 3 and <= 8 ? Terrain.Sea : Terrain.Grass;

    private static Settlement Found(HexCoord centre, params HexCoord[] dockyards) =>
        FoundWithUnits(centre, [new UnitStack(UnitType.Karve, 5)], dockyards);

    private static Settlement FoundWithUnits(HexCoord centre, UnitStack[] garrison, params HexCoord[] dockyards)
    {
        const int longhouseLevel = 10;
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = centre,
            Buildings =
            [
                new PlacedBuilding(centre, BuildingType.Longhouse, longhouseLevel),
                .. dockyards.Select(d => new PlacedBuilding(d, BuildingType.Dockyard, 1)),
            ],
            Garrison = garrison,
            Resources = ResourcePool.Create(new ResourceAmounts(1_000_000, 1_000_000, 1_000_000, 1_000_000), production, capacity, T0),
        };
    }

    private static DispatchDecision Move(Settlement settlement, HexCoord destination, UnitStack[]? requested = null) =>
        Army.PlanDispatch(
            settlement, requested ?? [new UnitStack(UnitType.Karve, 5)], 100, [], destination, T0,
            Guid.CreateVersion7(), Strait);

    private static DispatchDecision Raid(Settlement settlement) =>
        Army.PlanDispatch(
            settlement, [new UnitStack(UnitType.Karve, 5)], 100, [], CoastalTarget, T0,
            Guid.CreateVersion7(), Strait, ArmyMission.Raid, Guid.CreateVersion7(),
            targetClaimDiscs: [(CoastalTarget, 3)]);

    private static Bjarnoy.Domain.Movement.Movement MovementOf(Army army) => ((ArmyLocation.InTransit)army.Location).Movement;

    [Fact]
    public void Pathfinder_fact_a_fleet_cannot_start_from_an_inland_hex_but_can_from_a_coastal_one()
    {
        Assert.Null(HexPathfinder.FindPath(InlandHome, CoastalTarget, Strait, isLandUnit: false));
        Assert.NotNull(HexPathfinder.FindPath(new HexCoord(2, 0), CoastalTarget, Strait, isLandUnit: false));
    }

    [Fact]
    public void Inland_settlement_can_train_ships_because_its_claim_touches_the_shore()
    {
        var settlement = Found(InlandHome, Dock);

        var train = settlement.PlanTrain(UnitType.Karve, 1, T0, Guid.CreateVersion7(), hasShoreline: true);

        Assert.True(train.Accepted, $"expected accept, got {train.Rejection}");
    }

    [Fact]
    public void Inland_settlement_fleet_move_starts_and_returns_at_the_dockyard()
    {
        var settlement = Found(InlandHome, Dock);

        var decision = Move(settlement, new HexCoord(6, 0));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var movement = MovementOf(decision.Army!);
        Assert.Equal(Dock, movement.Path[0]);
        Assert.Equal(Dock, movement.ReturnPath[^1]);
    }

    [Fact]
    public void Inland_settlement_fleet_raid_starts_and_returns_at_the_dockyard()
    {
        var settlement = Found(InlandHome, Dock);

        var decision = Raid(settlement);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var movement = MovementOf(decision.Army!);
        Assert.Equal(Dock, movement.Path[0]);
        Assert.Equal(Dock, movement.ReturnPath[^1]);
    }

    [Fact]
    public void Coastal_settlement_keeps_its_centre_as_the_fleet_origin()
    {
        var centre = new HexCoord(2, 0);
        var settlement = Found(centre, Dock);

        var decision = Move(settlement, new HexCoord(6, 0));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var movement = MovementOf(decision.Army!);
        Assert.Equal(centre, movement.Path[0]);
        Assert.Equal(centre, movement.ReturnPath[^1]);
    }

    [Fact]
    public void Inland_settlement_without_a_dockyard_keeps_the_centre_and_cannot_dispatch_a_fleet()
    {
        // Expected: without a Dockyard it cannot train ships either, so this state only arises from admin edits.
        var settlement = Found(InlandHome);

        Assert.Equal(InlandHome, Army.FleetAnchor(settlement, Strait));
        Assert.Equal(DispatchRejection.UnreachableLeg, Move(settlement, new HexCoord(6, 0)).Rejection);
    }

    [Fact]
    public void FleetAnchor_picks_the_dockyard_nearest_the_centre()
    {
        var settlement = Found(InlandHome, new HexCoord(5, 0), Dock, new HexCoord(7, 0));

        Assert.Equal(Dock, Army.FleetAnchor(settlement, Strait));
    }

    [Fact]
    public void FleetAnchor_breaks_distance_ties_by_q_then_r()
    {
        // Both docks are three hexes from the centre; the lower Q wins.
        var a = new HexCoord(3, 0);
        var b = new HexCoord(2, 1);
        var distance = InlandHome.DistanceTo(a);
        Assert.Equal(distance, InlandHome.DistanceTo(b));

        var settlement = Found(InlandHome, a, b);

        Assert.Equal(b, Army.FleetAnchor(settlement, Strait));
    }

    [Fact]
    public void Land_army_from_an_inland_settlement_still_starts_at_the_centre()
    {
        var settlement = FoundWithUnits(InlandHome, [new UnitStack(UnitType.Spearman, 5)], Dock);

        var decision = Army.PlanDispatch(
            settlement, [new UnitStack(UnitType.Spearman, 5)], 10, [], new HexCoord(0, 2), T0,
            Guid.CreateVersion7(), Strait);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var movement = MovementOf(decision.Army!);
        Assert.Equal(InlandHome, movement.Path[0]);
        Assert.Equal(InlandHome, movement.ReturnPath[^1]);
    }

    [Fact]
    public void Recall_of_a_fleet_to_an_inland_home_ends_at_the_dockyard()
    {
        var settlement = Found(InlandHome, Dock);
        var army = Move(settlement, new HexCoord(7, 0)).Army!;
        var home = army.HomeHex(settlement.Centre, settlement.Buildings, Strait);

        var recalled = army.Recall(T0.AddMinutes(10), home, Strait);

        Assert.NotNull(recalled);
        var movement = MovementOf(recalled!);
        Assert.True(movement.IsReturning);
        Assert.Equal(Dock, movement.Path[^1]);
    }

    [Fact]
    public void Recall_of_a_mixed_ship_and_settler_convoy_routes_over_sea_to_the_dockyard()
    {
        // A sea Found convoy: ships plus settlers. Any ship makes it a fleet, so Recall must use the sea tables.
        var settlement = Found(InlandHome, Dock);
        var path = new[] { Dock, new HexCoord(4, 0), new HexCoord(5, 0), new HexCoord(6, 0) };
        var returnPath = path.Reverse().ToArray();
        var hours = new[] { 0.0, 1, 2, 3 };
        var movement = Bjarnoy.Domain.Movement.Movement.Create(T0, path, hours, returnPath, hours, 100, 1);
        var convoy = new Army
        {
            Id = Guid.CreateVersion7(),
            SettlementId = settlement.Id,
            Stacks = [new UnitStack(UnitType.Karve, 2), new UnitStack(UnitType.SettlerCrew, 3)],
            Location = new ArmyLocation.InTransit(movement),
            Provisions = 100,
            Mission = ArmyMission.Found,
        };
        Assert.True(convoy.IsFleet);
        var home = convoy.HomeHex(settlement.Centre, settlement.Buildings, Strait);
        Assert.Equal(Dock, home);

        var recalled = convoy.Recall(T0.AddHours(1.5), home, Strait);

        Assert.NotNull(recalled);
        var recallMovement = MovementOf(recalled!);
        Assert.Equal(Dock, recallMovement.Path[^1]);
        Assert.All(recallMovement.Path.Skip(1).SkipLast(1), h => Assert.Equal(Terrain.Sea, Strait(h)));
    }

    [Fact]
    public void PlanFieldOrder_from_an_inland_home_returns_to_the_dockyard()
    {
        var settlement = Found(InlandHome, Dock);
        var army = Move(settlement, new HexCoord(6, 0)).Army!;
        var home = army.HomeHex(settlement.Centre, settlement.Buildings, Strait);

        var result = Army.PlanFieldOrder(army, [], new HexCoord(8, 0), home, T0.AddMinutes(5), Strait, isPremium: true);

        Assert.True(result.Accepted, $"expected accept, got {result.Rejection}");
        Assert.Equal(Dock, MovementOf(result.Army!).ReturnPath[^1]);
    }

    [Fact]
    public void RetargetFounding_of_a_sea_convoy_from_an_inland_home_returns_to_the_dockyard()
    {
        var settlement = Found(InlandHome, Dock);
        var path = new[] { Dock, new HexCoord(4, 0), new HexCoord(5, 0), new HexCoord(6, 0), new HexCoord(7, 0), new HexCoord(8, 0), CoastalTarget };
        var returnPath = path.Reverse().ToArray();
        var hours = Enumerable.Range(0, path.Length).Select(i => (double)i).ToArray();
        var movement = Bjarnoy.Domain.Movement.Movement.Create(T0, path, hours, returnPath, hours, 100, 1);
        var convoy = new Army
        {
            Id = Guid.CreateVersion7(),
            SettlementId = settlement.Id,
            Stacks = [new UnitStack(UnitType.Karve, 2), new UnitStack(UnitType.SettlerCrew, 3)],
            Location = new ArmyLocation.InTransit(movement),
            Provisions = 100,
            Mission = ArmyMission.Found,
        };
        var home = convoy.HomeHex(settlement.Centre, settlement.Buildings, Strait);

        var result = Army.RetargetFounding(convoy, new HexCoord(9, 1), T0.AddHours(1.5), home, Strait);

        Assert.True(result.Accepted, $"expected accept, got {result.Rejection}");
        Assert.Equal(Dock, MovementOf(result.Army!).ReturnPath[^1]);
    }

    [Fact]
    public void ForceFieldRetreat_of_a_fleet_to_an_inland_home_ends_at_the_dockyard()
    {
        var settlement = Found(InlandHome, Dock);
        var army = Move(settlement, new HexCoord(7, 0)).Army!;
        var home = army.HomeHex(settlement.Centre, settlement.Buildings, Strait);

        var retreating = army.ForceFieldRetreat(T0.AddMinutes(30), new HexCoord(5, 0), home, Strait);

        var movement = MovementOf(retreating);
        Assert.True(movement.IsReturning);
        Assert.Equal(Dock, movement.Path[^1]);
    }
}
