using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Settlement expansion via settler crews (issue #55): dispatch validation, arrival, and retargeting.</summary>
public class ArmyFoundingTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Home = new(0, 0);

    private static Func<HexCoord, Terrain> AllGrass() => _ => Terrain.Grass;

    private static Settlement Found(IReadOnlyList<UnitStack>? garrison = null, int longhouseLevel = 5)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Home,
            Buildings = [new PlacedBuilding(Home, BuildingType.Longhouse, longhouseLevel)],
            Garrison = garrison ?? [new UnitStack(UnitType.SettlerCrew, 3)],
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 1_000_000, Stone: 1_000_000, Food: 1_000_000, Iron: 1_000_000),
                production, capacity, T0),
        };
    }

    private static DispatchDecision DispatchFound(
        Settlement settlement,
        HexCoord destination,
        // 3 SettlerCrews alone can carry only 3 * 40 = 120 food
        // (UnitDefinition.FoodCarryCapacity) — a default above that rejects
        // every "should succeed" dispatch test with
        // ProvisionsExceedCarryCapacity before it ever reaches Found-specific
        // validation.
        double provisions = 100,
        IReadOnlyList<UnitStack>? requested = null,
        Func<HexCoord, Terrain>? terrainAt = null,
        Func<HexCoord, bool>? isHexFoundable = null,
        bool renownAndSlotAllowed = true) =>
        Army.PlanDispatch(
            settlement,
            requested ?? [new UnitStack(UnitType.SettlerCrew, 3)],
            provisions,
            [],
            destination,
            T0,
            Guid.CreateVersion7(),
            terrainAt ?? AllGrass(),
            ArmyMission.Found,
            isHexFoundable: isHexFoundable,
            renownAndSlotAllowed: renownAndSlotAllowed);

    [Fact]
    public void Overland_founding_dispatch_succeeds_with_exactly_three_settler_crews()
    {
        var settlement = Found();

        var decision = DispatchFound(settlement, new HexCoord(5, 0));

        Assert.True(decision.Accepted);
        Assert.Equal(ArmyMission.Found, decision.Army!.Mission);
        Assert.Null(decision.Army.TargetSettlementId);
    }

    [Theory]
    [InlineData(2)]
    [InlineData(4)]
    public void Founding_dispatch_is_rejected_when_settler_crew_count_is_not_exactly_three(int count)
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.SettlerCrew, count)]);

        var decision = DispatchFound(
            settlement, new HexCoord(5, 0), requested: [new UnitStack(UnitType.SettlerCrew, count)]);

        Assert.Equal(DispatchRejection.WrongSettlerCrewCount, decision.Rejection);
    }

    [Fact]
    public void Founding_dispatch_is_rejected_when_renown_or_slot_requirement_is_not_met()
    {
        var settlement = Found();

        var decision = DispatchFound(settlement, new HexCoord(5, 0), renownAndSlotAllowed: false);

        Assert.Equal(DispatchRejection.RenownOrSettlementSlotRequirementNotMet, decision.Rejection);
    }

    [Fact]
    public void Founding_dispatch_is_rejected_when_the_target_hex_is_not_foundable()
    {
        var settlement = Found();

        var decision = DispatchFound(settlement, new HexCoord(5, 0), isHexFoundable: _ => false);

        Assert.Equal(DispatchRejection.TargetHexNotFoundable, decision.Rejection);
    }

    [Fact]
    public void Sea_founding_convoy_allows_ships_carrying_settler_crews()
    {
        var settlement = Found(garrison:
        [
            new UnitStack(UnitType.SettlerCrew, 3),
            new UnitStack(UnitType.Longship, 2),
        ]);

        var decision = DispatchFound(
            settlement, new HexCoord(5, 0),
            requested: [new UnitStack(UnitType.SettlerCrew, 3), new UnitStack(UnitType.Longship, 2)],
            // A sea convoy is a fleet — needs a route over open water, same
            // as any other fleet dispatch test (see ArmyTests's
            // Fleet_dispatch_accepted_over_open_sea); the destination's own
            // terrain is exempt from the land/sea check for Found, same as
            // Attack, via the beaching exemption.
            terrainAt: _ => Terrain.Sea);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
    }

    [Fact]
    public void Sea_founding_convoy_is_rejected_when_ships_cannot_carry_every_settler_crew()
    {
        var settlement = Found(garrison:
        [
            new UnitStack(UnitType.SettlerCrew, 3),
            new UnitStack(UnitType.Karve, 1),
        ]);

        var decision = DispatchFound(
            settlement, new HexCoord(5, 0),
            requested: [new UnitStack(UnitType.SettlerCrew, 3), new UnitStack(UnitType.Karve, 1)]);

        Assert.Equal(DispatchRejection.InsufficientShipCapacityForSettlers, decision.Rejection);
    }

    [Fact]
    public void Founding_dispatch_still_rejects_a_settler_crew_mixed_with_ordinary_land_units()
    {
        var settlement = Found(garrison:
        [
            new UnitStack(UnitType.SettlerCrew, 3),
            new UnitStack(UnitType.Karve, 3),
            new UnitStack(UnitType.Spearman, 5),
        ]);

        var decision = DispatchFound(
            settlement, new HexCoord(5, 0),
            requested:
            [
                new UnitStack(UnitType.SettlerCrew, 3),
                new UnitStack(UnitType.Karve, 3),
                new UnitStack(UnitType.Spearman, 5),
            ]);

        Assert.Equal(DispatchRejection.MixedFleetAndLandUnits, decision.Rejection);
    }

    [Fact]
    public void PlanFoundingArrival_founds_when_the_target_is_still_foundable()
    {
        var settlement = Found();
        var decision = DispatchFound(settlement, new HexCoord(4, 0));
        var arrivesAt = ((ArmyLocation.InTransit)decision.Army!.Location).Movement.ArrivesAt;

        var arrival = Army.PlanFoundingArrival(decision.Army, arrivesAt, targetStillFoundable: true);

        Assert.True(arrival.Arrived);
        Assert.True(arrival.ShouldFound);
        Assert.Null(arrival.Army);
        Assert.Equal(new HexCoord(4, 0), arrival.FoundedAt);
        Assert.Empty(arrival.GarrisonForNewSettlement);
    }

    [Fact]
    public void PlanFoundingArrival_leaves_escort_units_for_the_new_settlements_garrison()
    {
        var settlement = Found(garrison:
        [
            new UnitStack(UnitType.SettlerCrew, 3),
            new UnitStack(UnitType.Spearman, 4),
        ]);

        var decision = DispatchFound(
            settlement, new HexCoord(4, 0),
            requested: [new UnitStack(UnitType.SettlerCrew, 3), new UnitStack(UnitType.Spearman, 4)]);
        var arrivesAt = ((ArmyLocation.InTransit)decision.Army!.Location).Movement.ArrivesAt;

        var arrival = Army.PlanFoundingArrival(decision.Army, arrivesAt, targetStillFoundable: true);

        Assert.True(arrival.ShouldFound);
        var escort = Assert.Single(arrival.GarrisonForNewSettlement);
        Assert.Equal(UnitType.Spearman, escort.Type);
        Assert.Equal(4, escort.Count);
    }

    [Fact]
    public void PlanFoundingArrival_does_not_found_when_the_target_was_claimed_mid_transit()
    {
        var settlement = Found();
        var decision = DispatchFound(settlement, new HexCoord(4, 0));
        var arrivesAt = ((ArmyLocation.InTransit)decision.Army!.Location).Movement.ArrivesAt;

        var arrival = Army.PlanFoundingArrival(decision.Army, arrivesAt, targetStillFoundable: false);

        Assert.True(arrival.Arrived);
        Assert.False(arrival.ShouldFound);
        Assert.NotNull(arrival.Army);
    }

    [Fact]
    public void PlanFoundingArrival_is_a_no_op_before_arrival()
    {
        var settlement = Found();
        var decision = DispatchFound(settlement, new HexCoord(4, 0));

        var arrival = Army.PlanFoundingArrival(decision.Army!, T0, targetStillFoundable: true);

        Assert.False(arrival.Arrived);
        Assert.False(arrival.ShouldFound);
    }

    [Fact]
    public void A_not_yet_founded_convoy_falls_back_to_ordinary_standing_and_can_be_recalled()
    {
        var settlement = Found();
        var decision = DispatchFound(settlement, new HexCoord(4, 0));
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        // Stands at the target past arrival, exactly like an ordinary Move
        // mission, since SettleTo has no special case for Found at all.
        var standing = army.SettleTo(movement.ArrivesAt);
        Assert.False(standing.Changed);

        var recalled = army.Recall(movement.ArrivesAt, Home, AllGrass());
        Assert.NotNull(recalled);
        Assert.True(((ArmyLocation.InTransit)recalled!.Location).Movement.IsReturning);
    }

    [Fact]
    public void RetargetFounding_redirects_an_in_transit_convoy_to_a_new_hex()
    {
        var settlement = Found();
        var decision = DispatchFound(settlement, new HexCoord(10, 0));
        var army = decision.Army!;

        var result = Army.RetargetFounding(army, new HexCoord(3, 3), T0.AddMinutes(30), Home, AllGrass());

        Assert.True(result.Accepted);
        var movement = ((ArmyLocation.InTransit)result.Army!.Location).Movement;
        Assert.Equal(new HexCoord(3, 3), movement.Path[^1]);
        Assert.False(movement.IsReturning);
    }

    [Fact]
    public void RetargetFounding_is_rejected_for_a_non_founding_mission()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Spearman, 5)]);
        // 5 Spearmen carry at most 5 * 10 = 50 food (FoodCarryCapacity) —
        // must stay at or under that or the dispatch itself is rejected
        // before RetargetFounding is even reached.
        var decision = Army.PlanDispatch(
            settlement, [new UnitStack(UnitType.Spearman, 5)], 40, [], new HexCoord(10, 0),
            T0, Guid.CreateVersion7(), AllGrass());

        var result = Army.RetargetFounding(decision.Army!, new HexCoord(3, 3), T0.AddMinutes(30), Home, AllGrass());

        Assert.Equal(RetargetFoundingRejection.NotAFoundingMission, result.Rejection);
    }

    [Fact]
    public void RetargetFounding_is_rejected_when_provisions_no_longer_cover_the_new_round_trip()
    {
        var settlement = Found();

        // Load barely enough for the original short trip; retargeting much
        // further away should now fail the round-trip food check.
        var decision = DispatchFound(settlement, new HexCoord(2, 0), provisions: 3);
        var army = decision.Army!;

        var result = Army.RetargetFounding(army, new HexCoord(50, 0), T0.AddMinutes(10), Home, AllGrass());

        Assert.Equal(RetargetFoundingRejection.InsufficientProvisionsForRoundTrip, result.Rejection);
    }
}
