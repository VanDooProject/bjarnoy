using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Siege mission dispatch, route end and arrival (docs/design/endgame.md, "Breaching walls", player palisades).</summary>
public class ArmySiegeTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Home = new(0, 0);
    private static readonly HexCoord WallHex = new(2, 0);
    private static readonly HexCoord NearHex = new(1, 0);
    private static readonly Guid SenderKey = Guid.CreateVersion7();
    private static readonly Guid EnemyKey = Guid.CreateVersion7();

    private static Func<HexCoord, Terrain> AllGrass() => _ => Terrain.Grass;

    private static Settlement Found(double food = 1_000_000)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 5)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Home,
            Buildings = [new PlacedBuilding(Home, BuildingType.Longhouse, 5)],
            Garrison =
            [
                new UnitStack(UnitType.Axeman, 1000), new UnitStack(UnitType.Ram, 20),
                new UnitStack(UnitType.Catapult, 20), new UnitStack(UnitType.Karve, 5),
            ],
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 1_000_000, Stone: 1_000_000, Food: food, Iron: 1_000_000),
                production, capacity, T0),
        };
    }

    private static DispatchDecision DispatchSiege(
        HexCoord? targetWall,
        IReadOnlyList<UnitStack>? requested = null,
        bool friendly = false,
        double provisions = 600,
        HexCoord? destination = null) => Army.PlanDispatch(
            Found(), requested ?? [new UnitStack(UnitType.Ram, 5), new UnitStack(UnitType.Axeman, 100)], provisions, [],
            destination ?? NearHex, T0, Guid.CreateVersion7(), AllGrass(), ArmyMission.Siege,
            targetWallCoord: targetWall, targetWallFriendly: friendly);

    private static Army Besieger()
    {
        var decision = DispatchSiege(WallHex);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        return decision.Army!;
    }

    private static WallRules? Walls(params HexCoord[] hexes) =>
        new PalisadeIndex(hexes.Select(h => new StandingWall(h, false, EnemyKey)), AllGrass(), _ => false).ForOwner(SenderKey);

    [Fact]
    public void Siege_dispatch_records_the_mission_and_the_wall_without_a_target_settlement()
    {
        var decision = DispatchSiege(WallHex);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(ArmyMission.Siege, decision.Army!.Mission);
        Assert.Equal(WallHex, decision.Army.TargetWallCoord);
        Assert.Null(decision.Army.TargetSettlementId);
        Assert.Null(decision.Army.TargetCampCoord);
    }

    [Fact]
    public void Siege_dispatch_without_a_wall_at_the_destination_is_rejected()
    {
        Assert.Equal(DispatchRejection.NoWallAtDestination, DispatchSiege(targetWall: null).Rejection);
    }

    [Fact]
    public void Siege_dispatch_against_an_own_or_friendly_wall_is_rejected()
    {
        Assert.Equal(DispatchRejection.CannotSiegeFriendlyWall, DispatchSiege(WallHex, friendly: true).Rejection);
    }

    [Fact]
    public void Siege_dispatch_without_a_siege_unit_is_rejected()
    {
        var decision = DispatchSiege(WallHex, [new UnitStack(UnitType.Axeman, 50)]);

        Assert.Equal(DispatchRejection.SiegeRequiresSiegeUnit, decision.Rejection);
    }

    [Theory]
    [InlineData(UnitType.Ram)]
    [InlineData(UnitType.Catapult)]
    public void Either_siege_engine_is_enough_for_a_siege(UnitType engine)
    {
        Assert.True(DispatchSiege(WallHex, [new UnitStack(engine, 1), new UnitStack(UnitType.Axeman, 100)]).Accepted);
    }

    [Fact]
    public void Siege_dispatch_with_ships_is_rejected()
    {
        var decision = DispatchSiege(WallHex, [new UnitStack(UnitType.Karve, 2)]);

        Assert.Equal(DispatchRejection.SiegeRequiresLandUnits, decision.Rejection);
    }

    [Fact]
    public void Siege_dispatch_mixing_ships_and_land_units_is_still_the_mixed_rejection()
    {
        var decision = DispatchSiege(WallHex, [new UnitStack(UnitType.Ram, 2), new UnitStack(UnitType.Karve, 2)]);

        Assert.Equal(DispatchRejection.MixedFleetAndLandUnits, decision.Rejection);
    }

    [Fact]
    public void Only_a_siege_keeps_a_target_wall()
    {
        var decision = Army.PlanDispatch(
            Found(), [new UnitStack(UnitType.Axeman, 10)], 50, [], WallHex, T0, Guid.CreateVersion7(), AllGrass(),
            ArmyMission.Move, targetWallCoord: WallHex);

        Assert.True(decision.Accepted);
        Assert.Null(decision.Army!.TargetWallCoord);
    }

    [Fact]
    public void A_ram_army_crawls_at_ram_speed()
    {
        var army = Besieger();

        Assert.Equal(UnitCatalogue.Get(UnitType.Ram).Speed, army.TotalSpeed);
    }

    [Fact]
    public void The_siege_route_ends_on_the_neighbour_of_the_wall_nearest_to_home()
    {
        var walls = Walls(WallHex);

        var destination = Army.SiegeRouteDestination(WallHex, Home, AllGrass(), walls: walls);

        Assert.Equal(NearHex, destination);
        Assert.Equal(1, destination.DistanceTo(WallHex));
    }

    [Fact]
    public void The_siege_route_skips_neighbours_that_are_walls_themselves_and_is_deterministic()
    {
        var walls = Walls(WallHex, NearHex);

        var first = Army.SiegeRouteDestination(WallHex, Home, AllGrass(), walls: walls);
        var second = Army.SiegeRouteDestination(WallHex, Home, AllGrass(), walls: walls);

        Assert.Equal(first, second);
        Assert.Equal(1, first.DistanceTo(WallHex));
        Assert.NotEqual(NearHex, first);
        Assert.NotEqual(WallHex, first);
        // Both remaining near neighbours are two hexes from home: the pick is one of them, not a farther one.
        Assert.Equal(2, first.DistanceTo(Home));
    }

    [Fact]
    public void The_siege_route_skips_neighbours_that_are_not_land()
    {
        Terrain Terr(HexCoord c) => c == NearHex ? Terrain.Lake : Terrain.Grass;

        var destination = Army.SiegeRouteDestination(WallHex, Home, Terr, walls: Walls(WallHex));

        Assert.NotEqual(NearHex, destination);
        Assert.Equal(1, destination.DistanceTo(WallHex));
    }

    [Fact]
    public void A_siege_dispatch_routed_to_the_neighbour_ends_next_to_the_wall_and_returns_home()
    {
        var walls = Walls(WallHex);
        var destination = Army.SiegeRouteDestination(WallHex, Home, AllGrass(), walls: walls);

        var decision = Army.PlanDispatch(
            Found(), [new UnitStack(UnitType.Ram, 5), new UnitStack(UnitType.Axeman, 100)], 600, [], destination, T0, Guid.CreateVersion7(), AllGrass(),
            ArmyMission.Siege, walls: walls, targetWallCoord: WallHex);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var movement = ((ArmyLocation.InTransit)decision.Army!.Location).Movement;
        Assert.Equal(destination, movement.Path[^1]);
        Assert.DoesNotContain(WallHex, movement.Path);
        Assert.Equal(Home, movement.ReturnPath[^1]);
    }

    [Fact]
    public void Settling_a_siege_turns_the_survivors_straight_onto_the_return_leg_immune_to_interception()
    {
        var army = Besieger();
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;
        var arrival = movement.ArrivesAt;
        IReadOnlyList<UnitStack> survivors = [new UnitStack(UnitType.Ram, 4), new UnitStack(UnitType.Axeman, 6)];

        var returning = army.SettleSiegeArrival(survivors, arrival);

        Assert.NotNull(returning);
        Assert.Equal(survivors, returning!.Stacks);
        Assert.Equal(ResourceAmounts.Zero, returning.Loot);
        Assert.Equal(ArmyMission.Siege, returning.Mission);
        var leg = ((ArmyLocation.InTransit)returning.Location).Movement;
        Assert.True(leg.IsReturning);
        Assert.True(leg.RetreatImmune);
        Assert.Equal(arrival, leg.DepartedAt);
        Assert.Equal(movement.ReturnPath, leg.Path);
        Assert.Equal(army.Provisions - (army.TotalUpkeepPerHour * (arrival - movement.DepartedAt).TotalHours), returning.Provisions, 6);
    }

    [Fact]
    public void A_wiped_out_siege_army_leaves_nothing_to_send_home()
    {
        var army = Besieger();
        var arrival = ((ArmyLocation.InTransit)army.Location).Movement.ArrivesAt;

        Assert.Null(army.SettleSiegeArrival([], arrival));
    }

    [Fact]
    public void A_siege_can_only_be_settled_on_the_outbound_leg()
    {
        var army = Besieger();
        var arrival = ((ArmyLocation.InTransit)army.Location).Movement.ArrivesAt;
        var returning = army.SettleSiegeArrival(army.Stacks, arrival)!;

        Assert.Throws<InvalidOperationException>(() => returning.SettleSiegeArrival(army.Stacks, arrival));
    }

    private static List<PlacedBuilding> WallWorld(BuildingType type, int level) =>
    [
        new(Home, BuildingType.Longhouse, 5),
        new(WallHex, type, level),
        new(new HexCoord(1, 0), BuildingType.Farm, 3),
    ];

    [Fact]
    public void The_strike_takes_the_full_levels_destroyed_off_a_palisade()
    {
        // 1 ram = 40 siege power -> floor(sqrt(20)) = 4 levels; the Palisade is level 6, so it drops to 2.
        var outcome = SiegeResolver.ResolveWall(
            [new UnitStack(UnitType.Ram, 1)], WallWorld(BuildingType.Palisade, 6), WallHex);

        Assert.True(outcome.Applied);
        Assert.Equal(WallHex, outcome.TargetCoord);
        Assert.Equal(BuildingType.Palisade, outcome.TargetType);
        Assert.Equal(6, outcome.LevelBefore);
        Assert.Equal(2, outcome.LevelAfter);
        Assert.Equal(2, outcome.UpdatedBuildings!.Single(b => b.Coord == WallHex).Level);
        Assert.Equal(3, outcome.UpdatedBuildings!.Single(b => b.Type == BuildingType.Farm).Level);
    }

    [Fact]
    public void The_strike_removes_a_gate_taken_to_level_zero_and_frees_its_hex()
    {
        // Catapults and rams add up: 2 + 3 engines = 200 siege power -> 10 levels, more than the gate has.
        var outcome = SiegeResolver.ResolveWall(
            [new UnitStack(UnitType.Catapult, 2), new UnitStack(UnitType.Ram, 3)],
            WallWorld(BuildingType.PalisadeGate, 3), WallHex);

        Assert.True(outcome.Applied);
        Assert.Equal(0, outcome.LevelAfter);
        Assert.DoesNotContain(outcome.UpdatedBuildings!, b => b.Coord == WallHex);
        Assert.Equal(2, outcome.UpdatedBuildings!.Count);
    }

    [Fact]
    public void The_strike_does_nothing_without_surviving_siege_engines()
    {
        var outcome = SiegeResolver.ResolveWall(
            [new UnitStack(UnitType.Axeman, 50)], WallWorld(BuildingType.Palisade, 3), WallHex);

        Assert.False(outcome.Applied);
        Assert.Null(outcome.UpdatedBuildings);
    }

    [Fact]
    public void The_strike_does_nothing_when_the_wall_is_gone_or_never_was_one()
    {
        var engines = new[] { new UnitStack(UnitType.Ram, 5) };

        Assert.False(SiegeResolver.ResolveWall(engines, [new PlacedBuilding(Home, BuildingType.Longhouse, 5)], WallHex).Applied);

        // A farm on the hex is never a wall target, whatever the army carries.
        Assert.False(SiegeResolver.ResolveWall(engines, WallWorld(BuildingType.Farm, 3), WallHex).Applied);

        // A foundation (level 0) is no standing wall.
        Assert.False(SiegeResolver.ResolveWall(engines, WallWorld(BuildingType.Palisade, 0), WallHex).Applied);
    }

    [Fact]
    public void A_wall_siege_report_carries_the_siege_line_and_the_flag()
    {
        var plan = BattleResolver.Resolve([new UnitStack(UnitType.Ram, 5)], [], 0, ResourceAmounts.Zero, 1);
        var siege = SiegeResolver.ResolveWall(plan.AttackerSurvivors, WallWorld(BuildingType.Palisade, 3), WallHex);

        var report = BattleReport.From(
            Guid.CreateVersion7(), T0, Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(),
            [new UnitStack(UnitType.Ram, 5)], plan, 1, siege, wasWallSiege: true);

        Assert.True(report.WasWallSiege);
        Assert.False(report.WasRaid);
        Assert.NotNull(report.Siege);
        Assert.Equal(BuildingType.Palisade, report.Siege!.TargetType);
        Assert.Equal(3, report.Siege.LevelBefore);
        Assert.Equal(0, report.Siege.LevelAfter);
        Assert.Empty(report.DefenderLines);
    }
}
