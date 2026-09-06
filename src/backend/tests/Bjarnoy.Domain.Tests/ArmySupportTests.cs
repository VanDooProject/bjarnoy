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
            Garrison = garrison ?? [],
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 1_000_000, Stone: 1_000_000, Food: food, Iron: 1_000_000),
                production, capacity, T0),
        };
    }

    private static DispatchDecision DispatchSupport(
        Settlement settlement,
        Guid hostSettlementId,
        double provisions,
        IReadOnlyList<UnitStack>? requested = null) => Army.PlanDispatch(
            settlement,
            requested ?? [new UnitStack(UnitType.Spearman, 10)],
            provisions,
            [],
            HostHex,
            T0,
            Guid.CreateVersion7(),
            AllGrass(),
            ArmyMission.Support,
            hostSettlementId);

    [Fact]
    public void Support_dispatch_is_rejected_without_a_target_settlement()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 10)]);

        var decision = Army.PlanDispatch(
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
        var provisions = (2.0 * 10.0) - 0.01;

        var decision = DispatchSupport(settlement, Guid.CreateVersion7(), provisions);

        Assert.Equal(DispatchRejection.InsufficientProvisionsForRoundTrip, decision.Rejection);
    }

    [Fact]
    public void Support_dispatch_is_rejected_for_a_non_land_target()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 10)]);
        Terrain TerrainAt(HexCoord c) => c == HostHex ? Terrain.Sea : Terrain.Grass;

        var decision = Army.PlanDispatch(
            settlement, [new UnitStack(UnitType.Spearman, 5)], 40, [], HostHex, T0,
            Guid.CreateVersion7(), TerrainAt, ArmyMission.Support, Guid.CreateVersion7());

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
            Stacks = [new UnitStack(UnitType.Spearman, 10)],
            Mission = ArmyMission.Support,
            TargetSettlementId = Guid.CreateVersion7(),
            Location = new ArmyLocation.Supporting(Guid.CreateVersion7()),
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
            Stacks = [new UnitStack(UnitType.Spearman, 10)],
            Provisions = 42,
            Mission = ArmyMission.Support,
            TargetSettlementId = hostId,
            Location = new ArmyLocation.Supporting(hostId),
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
            Stacks = [new UnitStack(UnitType.Spearman, 10)],
            Mission = ArmyMission.Support,
            TargetSettlementId = Guid.CreateVersion7(),
            Location = new ArmyLocation.Supporting(Guid.CreateVersion7()),
        };

        Assert.Null(army.Recall(T0, Home, AllGrass()));
    }
}
