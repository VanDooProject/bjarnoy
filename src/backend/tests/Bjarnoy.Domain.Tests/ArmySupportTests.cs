using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Support mission dispatch, arrival, and recall tests (issue #40 phase 4).</summary>
public class ArmySupportTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Home = new(0, 0);
    private static readonly HexCoord HostHex = new(4, 0);

    private static Func<HexCoord, Terrain> AllGrass() => _ => Terrain.Grass;

    private static Settlement Found(
        Guid? id = null,
        HexCoord? centre = null,
        IReadOnlyList<UnitStack>? garrison = null,
        double food = 1_000_000,
        int longhouseLevel = 5)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);
        var home = centre ?? Home;

        return new Settlement
        {
            Id = id ?? Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = home,
            Buildings = [new PlacedBuilding(home, BuildingType.Longhouse, longhouseLevel)],
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 1_000_000, Stone: 1_000_000, Food: food, Iron: 1_000_000),
                production, capacity, T0),
        }.WithGarrison(garrison ?? []);
    }

    /// <summary>The host's longhouse hex, a spot that holds land units.</summary>
    private static readonly GarrisonSpot HostLonghouse = new(HostHex, GarrisonSpotKind.Longhouse, [], HoldsLand: true, HoldsShips: false);

    private static DispatchDecision DispatchSupport(
        Settlement settlement,
        Guid hostSettlementId,
        double provisions,
        IReadOnlyList<UnitStack>? requested = null,
        HexCoord? spot = null,
        IReadOnlyList<GarrisonSpot>? hostSpots = null) => TestArmy.PlanDispatch(
            settlement,
            requested ?? [new UnitStack(UnitType.Spearman, 10)],
            provisions,
            [],
            HostHex,
            T0,
            Guid.CreateVersion7(),
            AllGrass(),
            ArmyMission.Support,
            hostSettlementId,
            targetBuildingCoord: spot ?? HostHex,
            targetSpots: hostSpots ?? [HostLonghouse]);

    [Fact]
    public void Support_dispatch_is_rejected_without_a_target_settlement()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 10)]);

        var decision = TestArmy.PlanDispatch(
            settlement, [new UnitStack(UnitType.Spearman, 5)], 40, [], HostHex, T0,
            Guid.CreateVersion7(), AllGrass(), ArmyMission.Support, targetSettlementId: null);

        Assert.Equal(DispatchRejection.TargetSettlementRequired, decision.Rejection);
    }

    [Fact]
    public void Support_dispatch_is_rejected_against_ones_own_settlement()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 10)]);

        var decision = DispatchSupport(settlement, settlement.Id, provisions: 100);

        Assert.Equal(DispatchRejection.CannotSupportOwnSettlement, decision.Rejection);
    }

    [Fact]
    public void Support_dispatch_requires_provisions_for_the_full_round_trip()
    {
        // Destination is 4 hexes away; Spearman speed is 4/h so each leg
        // takes 1h. Upkeep is 1/unit/h for 10 Spearmen = 10/h.
        // Round trip = (1 + 1) * 10 = 20 — a guest is fed by its host while
        // there, but Recall still has to walk it all the way home on
        // whatever it carries, so Support needs the same round-trip cover as
        // every other mission.
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 10)]);
        var provisions = 2.0 * 10.0;

        var decision = DispatchSupport(settlement, Guid.CreateVersion7(), provisions);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(ArmyMission.Support, decision.Army!.Mission);
    }

    [Fact]
    public void Support_dispatch_is_rejected_when_provisions_fall_short_of_the_round_trip()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 10)]);
        var provisions = (2.0 * 10 * UnitCatalogue.Get(UnitType.Spearman).UpkeepPerHour) - 0.01; // 2 h round trip for 10 Spearmen

        var decision = DispatchSupport(settlement, Guid.CreateVersion7(), provisions);

        Assert.Equal(DispatchRejection.InsufficientProvisionsForRoundTrip, decision.Rejection);
    }

    [Fact]
    public void Support_dispatch_is_rejected_for_a_non_land_target()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 10)]);
        Terrain TerrainAt(HexCoord c) => c == HostHex ? Terrain.Sea : Terrain.Grass;

        var decision = TestArmy.PlanDispatch(
            settlement, [new UnitStack(UnitType.Spearman, 5)], 40, [], HostHex, T0,
            Guid.CreateVersion7(), TerrainAt, ArmyMission.Support, Guid.CreateVersion7(),
            targetBuildingCoord: HostHex, targetSpots: [HostLonghouse]);

        Assert.Equal(DispatchRejection.DestinationNotLand, decision.Rejection);
    }

    [Fact]
    public void Arriving_at_the_host_turns_the_army_into_a_guest_rather_than_starting_a_return_leg()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 10)]);
        var hostId = Guid.CreateVersion7();
        var decision = DispatchSupport(settlement, hostId, provisions: 100);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var arrival = Army.SettleSupportArrival(army, movement.ArrivesAt);

        Assert.True(arrival.Arrived);
        var supporting = Assert.IsType<ArmyLocation.Supporting>(arrival.Army.Location);
        Assert.Equal(hostId, supporting.HostSettlementId);
        Assert.Equal(10, arrival.Army.Stacks.Single().Count); // stacks untouched, just relocated
    }

    [Fact]
    public void A_support_dispatch_must_name_the_garrison_spot_to_join()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 10)]);

        var decision = TestArmy.PlanDispatch(
            settlement, [new UnitStack(UnitType.Spearman, 5)], 100, [], HostHex, T0,
            Guid.CreateVersion7(), AllGrass(), ArmyMission.Support, Guid.CreateVersion7(), targetSpots: [HostLonghouse]);

        Assert.Equal(DispatchRejection.SupportSpotRequired, decision.Rejection);
    }

    [Fact]
    public void A_support_dispatch_is_refused_at_a_hex_that_is_no_spot_of_the_host()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 10)]);

        var decision = DispatchSupport(settlement, Guid.CreateVersion7(), provisions: 100, spot: new HexCoord(5, 0));

        Assert.Equal(DispatchRejection.SupportSpotCannotHold, decision.Rejection);
    }

    [Fact]
    public void A_support_dispatch_is_refused_at_a_spot_that_cannot_hold_the_units()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 10)]);
        var dock = new GarrisonSpot(new HexCoord(5, 0), GarrisonSpotKind.Dock, [], HoldsLand: false, HoldsShips: true);

        var landAtDock = DispatchSupport(settlement, Guid.CreateVersion7(), provisions: 100, spot: dock.Coord, hostSpots: [HostLonghouse, dock]);

        Assert.Equal(DispatchRejection.SupportSpotCannotHold, landAtDock.Rejection);
    }

    [Fact]
    public void A_fleet_cannot_support_at_a_tower()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Karve, 2)]);
        var dock = new GarrisonSpot(new HexCoord(5, 0), GarrisonSpotKind.Dock, [], HoldsLand: false, HoldsShips: true);
        var tower = new GarrisonSpot(new HexCoord(3, 0), GarrisonSpotKind.Tower, [], HoldsLand: true, HoldsShips: false);
        List<UnitStack> karves = [new UnitStack(UnitType.Karve, 2)];

        var atTower = DispatchSupport(settlement, Guid.CreateVersion7(), provisions: 100, karves, spot: tower.Coord, hostSpots: [HostLonghouse, tower, dock]);

        Assert.Equal(DispatchRejection.SupportSpotCannotHold, atTower.Rejection);
    }

    [Fact]
    public void The_guest_walks_to_the_spot_it_joins_and_stands_there()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 10)]);
        var tower = new GarrisonSpot(new HexCoord(3, 1), GarrisonSpotKind.Tower, [], HoldsLand: true, HoldsShips: false);
        var hostId = Guid.CreateVersion7();

        var decision = DispatchSupport(settlement, hostId, provisions: 100, spot: tower.Coord, hostSpots: [HostLonghouse, tower]);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var army = decision.Army!;
        Assert.Equal(tower.Coord, ((ArmyLocation.InTransit)army.Location).Movement.Path[^1]);
        Assert.Equal(tower.Coord, army.TargetBuildingCoord);

        var arrival = Army.SettleSupportArrival(army, ((ArmyLocation.InTransit)army.Location).Movement.ArrivesAt);

        var supporting = Assert.IsType<ArmyLocation.Supporting>(arrival.Army.Location);
        Assert.Equal(new ArmyLocation.Supporting(hostId, tower.Coord), supporting);
        Assert.Equal(arrival.Army.Stacks, Army.GuestsAt([arrival.Army], hostId, tower.Coord));
        Assert.Empty(Army.GuestsAt([arrival.Army], hostId, HostHex));
    }

    [Fact]
    public void SettleSupportArrival_is_a_no_op_before_arrival()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 10)]);
        var decision = DispatchSupport(settlement, Guid.CreateVersion7(), provisions: 100);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var arrival = Army.SettleSupportArrival(army, movement.ArrivesAt.AddMinutes(-1));

        Assert.False(arrival.Arrived);
        Assert.Same(army, arrival.Army);
    }

    [Fact]
    public void A_plain_SettleTo_treats_a_supporting_army_as_nothing_to_settle()
    {
        var army = new Army
        {
            Id = Guid.CreateVersion7(),
            SettlementId = Guid.CreateVersion7(),
            HomeSpot = new HexCoord(0, 0),
            Stacks = [new UnitStack(UnitType.Spearman, 10)],
            Mission = ArmyMission.Support,
            TargetSettlementId = Guid.CreateVersion7(),
            Location = new ArmyLocation.Supporting(Guid.CreateVersion7(), HostHex),
        };

        var result = army.SettleTo(T0.AddYears(1));

        Assert.False(result.Changed);
        Assert.False(result.ArrivedHome);
    }

    [Fact]
    public void The_owner_can_recall_a_supporting_army_and_it_heads_straight_home()
    {
        var hostId = Guid.CreateVersion7();
        var homeId = Guid.CreateVersion7();
        var army = new Army
        {
            Id = Guid.CreateVersion7(),
            SettlementId = homeId,
            HomeSpot = new HexCoord(0, 0),
            Stacks = [new UnitStack(UnitType.Spearman, 10)],
            Provisions = 42,
            Mission = ArmyMission.Support,
            TargetSettlementId = hostId,
            Location = new ArmyLocation.Supporting(hostId, HostHex),
        };

        var recalled = army.Recall(T0, Home, AllGrass(), currentHex: HostHex);

        Assert.NotNull(recalled);
        var movement = Assert.IsType<ArmyLocation.InTransit>(recalled!.Location).Movement;
        Assert.True(movement.IsReturning); // already the trip home, not a fresh outbound leg
        Assert.Equal(HostHex, movement.Path[0]);
        Assert.Equal(Home, movement.Path[^1]);
        Assert.Equal(T0, movement.DepartedAt);

        // A guest does not burn its own provisions while hosted — nothing to
        // rebase, unlike a mid-journey Move/Attack recall.
        Assert.Equal(42, recalled.Provisions);
    }

    [Fact]
    public void Recalling_a_supporting_army_without_a_current_hex_is_rejected()
    {
        var army = new Army
        {
            Id = Guid.CreateVersion7(),
            SettlementId = Guid.CreateVersion7(),
            HomeSpot = new HexCoord(0, 0),
            Stacks = [new UnitStack(UnitType.Spearman, 10)],
            Mission = ArmyMission.Support,
            TargetSettlementId = Guid.CreateVersion7(),
            Location = new ArmyLocation.Supporting(Guid.CreateVersion7(), HostHex),
        };

        Assert.Null(army.Recall(T0, Home, AllGrass()));
    }
}
