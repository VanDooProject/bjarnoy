using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using ArmyMovement = Bjarnoy.Domain.Movement.Movement;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The pure half of the admin god-mode surface (issue #105): instant build,
/// direct building placement/razing, direct garrison edits, and moving or
/// retiming an army in the field.
/// </summary>
public sealed class AdminGodModeTests
{
    private static readonly DateTimeOffset Start = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    /// <summary>Everything is grass unless a test says otherwise — enough for the rules under test here.</summary>
    private static Terrain Grass(HexCoord _) => Terrain.Grass;

    private static Settlement NewSettlement(HexCoord? centre = null)
    {
        var at = centre ?? new HexCoord(0, 0);
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);

        // Started full: ResourcePool.Create clamps to capacity, so this is
        // simply "as much as a level-1 longhouse can hold" — enough that these
        // tests never turn into affordability tests by accident.

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = at,
            Buildings = [new PlacedBuilding(at, BuildingType.Longhouse, 1)],
            Resources = ResourcePool.Create(
                ResourceAmounts.Uniform(1_000), production, capacity, Start),
        };
    }

    [Fact]
    public void Instant_build_finishes_a_queued_build_that_would_still_be_running()
    {
        var settlement = NewSettlement();
        var coord = new HexCoord(1, 0);

        var decision = settlement.PlanBuild(
            BuildingType.Farm, coord, Terrain.Grass, Start, Guid.CreateVersion7());
        Assert.True(decision.Accepted);

        var queued = settlement.Enqueue(decision.Order!, Start);
        var oneMinuteIn = Start + TimeSpan.FromMinutes(1);

        // Nothing is due a minute in — the ordinary settle leaves the queue alone.
        Assert.False(queued.SettleTo(oneMinuteIn).Changed);

        var settled = queued.WithQueuesDueAt(oneMinuteIn).SettleTo(oneMinuteIn);

        Assert.True(settled.Changed);
        Assert.Empty(settled.Settlement.Queue);
        Assert.Contains(settled.Settlement.Buildings, b => b.Coord == coord && b.Type == BuildingType.Farm);
    }

    /// <summary>
    /// Issue #158: god mode is an admin bypass, not a new plan — instant
    /// build must still empty the whole queue, including whatever sits in
    /// the premium waiting tail, rather than stalling on slot limits.
    /// </summary>
    [Fact]
    public void Instant_build_also_empties_a_queue_with_waiting_orders()
    {
        var settlement = NewSettlement();

        // Two construction slots at longhouse level 1 — queue three orders,
        // the third going to the waiting tail (premium queue simulated by
        // passing maxWaitingOrders explicitly, exactly as SettlementService
        // does for a premium settlement).
        var first = settlement.PlanBuild(BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, Start, Guid.CreateVersion7());
        var withFirst = settlement.Enqueue(first.Order!, Start);
        var second = withFirst.PlanBuild(BuildingType.Farm, new HexCoord(0, 1), Terrain.Grass, Start, Guid.CreateVersion7());
        var withSecond = withFirst.Enqueue(second.Order!, Start);
        var third = withSecond.PlanBuild(
            BuildingType.Farm, new HexCoord(-1, 1), Terrain.Grass, Start, Guid.CreateVersion7(), maxWaitingOrders: 1);
        Assert.True(third.Accepted);
        Assert.True(third.Order!.IsWaiting);
        var withThird = withSecond.Enqueue(third.Order!, Start);

        Assert.Single(withThird.WaitingOrders);

        var oneMinuteIn = Start + TimeSpan.FromMinutes(1);
        var settled = withThird.WithQueuesDueAt(oneMinuteIn).SettleTo(oneMinuteIn);

        Assert.True(settled.Changed);
        Assert.Empty(settled.Settlement.Queue);
        Assert.Equal(3, settled.Settlement.Buildings.Count(b => b.Type == BuildingType.Farm));
    }

    [Fact]
    public void Instant_build_lands_a_training_batch_in_the_garrison()
    {
        var settlement = NewSettlement();
        var decision = settlement.PlanTrain(UnitType.Thrall, 5, Start, Guid.CreateVersion7(), hasShoreline: false);
        Assert.True(decision.Accepted);

        var queued = settlement.EnqueueTraining(decision.Order!, Start);
        var oneMinuteIn = Start + TimeSpan.FromMinutes(1);

        var settled = queued.WithQueuesDueAt(oneMinuteIn).SettleTo(oneMinuteIn);

        Assert.True(settled.Changed);
        Assert.Empty(settled.Settlement.TrainingQueue);
        Assert.Equal(5, settled.Settlement.Garrison.Single(s => s.Type == UnitType.Thrall).Count);
    }

    [Fact]
    public void Instant_build_can_finish_builds_while_leaving_training_running()
    {
        var settlement = NewSettlement();
        var build = settlement.PlanBuild(
            BuildingType.Farm, new HexCoord(1, 0), Terrain.Grass, Start, Guid.CreateVersion7());
        var withBuild = settlement.Enqueue(build.Order!, Start);

        var train = withBuild.PlanTrain(UnitType.Thrall, 5, Start, Guid.CreateVersion7(), hasShoreline: false);
        var queued = withBuild.EnqueueTraining(train.Order!, Start);

        var oneMinuteIn = Start + TimeSpan.FromMinutes(1);
        var settled = queued.WithQueuesDueAt(oneMinuteIn, builds: true, training: false).SettleTo(oneMinuteIn);

        Assert.Empty(settled.Settlement.Queue);
        Assert.Single(settled.Settlement.TrainingQueue);
    }

    [Fact]
    public void Placing_a_building_puts_it_on_an_empty_claimed_hex()
    {
        var settlement = NewSettlement();
        var coord = new HexCoord(1, 0);

        var result = settlement.PlaceBuilding(
            coord, BuildingType.Farm, level: 3, Terrain.Grass, isCoastalWater: false, Start,
            terrainAt: Grass);

        Assert.True(result.Accepted);
        var placed = result.Settlement!.Buildings.Single(b => b.Coord == coord);
        Assert.Equal(BuildingType.Farm, placed.Type);
        Assert.Equal(3, placed.Level);

        // A level-3 farm produces more food than the bare longhouse did.
        Assert.True(result.Settlement.Resources.RatePerHour.Food > settlement.Resources.RatePerHour.Food);
    }

    [Fact]
    public void Placing_a_building_is_refused_outside_the_claim_radius_and_on_the_wrong_terrain()
    {
        var settlement = NewSettlement();

        var farAway = settlement.PlaceBuilding(
            new HexCoord(20, 20), BuildingType.Farm, 1, Terrain.Grass, false, Start, terrainAt: Grass);
        Assert.Equal(AdminBuildingEditRejection.HexNotInSettlement, farAway.Rejection);

        var wrongTerrain = settlement.PlaceBuilding(
            new HexCoord(1, 0), BuildingType.Farm, 1, Terrain.Mountain, false, Start, terrainAt: Grass);
        Assert.Equal(AdminBuildingEditRejection.TerrainNotAllowed, wrongTerrain.Rejection);

        var noSuchLevel = settlement.PlaceBuilding(
            new HexCoord(1, 0), BuildingType.Farm, 999, Terrain.Grass, false, Start, terrainAt: Grass);
        Assert.Equal(AdminBuildingEditRejection.InvalidLevel, noSuchLevel.Rejection);
    }

    [Fact]
    public void The_single_longhouse_can_be_relevelled_but_never_duplicated_moved_or_razed()
    {
        var settlement = NewSettlement();
        var centre = settlement.Centre;

        var relevelled = settlement.PlaceBuilding(
            centre, BuildingType.Longhouse, 4, Terrain.Grass, false, Start, terrainAt: Grass);
        Assert.True(relevelled.Accepted);
        Assert.Equal(4, relevelled.Settlement!.LonghouseLevel);

        var second = settlement.PlaceBuilding(
            new HexCoord(1, 0), BuildingType.Longhouse, 1, Terrain.Grass, false, Start, terrainAt: Grass);
        Assert.Equal(AdminBuildingEditRejection.LonghouseIsFixed, second.Rejection);

        var retyped = settlement.PlaceBuilding(
            centre, BuildingType.Farm, 1, Terrain.Grass, false, Start, terrainAt: Grass);
        Assert.Equal(AdminBuildingEditRejection.LonghouseIsFixed, retyped.Rejection);

        var razed = settlement.RazeBuilding(centre, Start, terrainAt: Grass);
        Assert.Equal(AdminBuildingEditRejection.LonghouseIsFixed, razed.Rejection);
    }

    [Fact]
    public void Razing_removes_the_building_and_drops_any_order_still_aimed_at_that_hex()
    {
        var settlement = NewSettlement();
        var coord = new HexCoord(1, 0);

        var placed = settlement.PlaceBuilding(
            coord, BuildingType.Farm, 1, Terrain.Grass, false, Start, terrainAt: Grass).Settlement!;

        var upgrade = placed.PlanBuild(BuildingType.Farm, coord, Terrain.Grass, Start, Guid.CreateVersion7());
        Assert.True(upgrade.Accepted);
        var queued = placed.Enqueue(upgrade.Order!, Start);

        var razed = queued.RazeBuilding(coord, Start, terrainAt: Grass);

        Assert.True(razed.Accepted);
        Assert.DoesNotContain(razed.Settlement!.Buildings, b => b.Coord == coord);
        Assert.Empty(razed.Settlement.Queue);
    }

    [Fact]
    public void Adjusting_the_garrison_creates_units_and_charges_their_upkeep_from_now()
    {
        var settlement = NewSettlement();
        var before = settlement.Resources.RatePerHour.Food;

        var result = settlement.AdjustGarrison(UnitType.Spearman, 10, Start, terrainAt: Grass);

        Assert.True(result.Accepted);
        Assert.Equal(10, result.Settlement!.Garrison.Single(s => s.Type == UnitType.Spearman).Count);
        Assert.True(result.Settlement.Resources.RatePerHour.Food < before);
    }

    [Fact]
    public void Adjusting_the_garrison_removes_units_and_refuses_removing_more_than_stand_there()
    {
        var settlement = NewSettlement()
            .AdjustGarrison(UnitType.Spearman, 10, Start, terrainAt: Grass).Settlement!;

        var removed = settlement.AdjustGarrison(UnitType.Spearman, -4, Start, terrainAt: Grass);
        Assert.Equal(6, removed.Settlement!.Garrison.Single(s => s.Type == UnitType.Spearman).Count);

        var emptied = removed.Settlement.AdjustGarrison(UnitType.Spearman, -6, Start, terrainAt: Grass);
        Assert.DoesNotContain(emptied.Settlement!.Garrison, s => s.Type == UnitType.Spearman);

        var tooMany = removed.Settlement.AdjustGarrison(UnitType.Spearman, -7, Start, terrainAt: Grass);
        Assert.Equal(AdminGarrisonEditRejection.NotEnoughUnits, tooMany.Rejection);

        var nothing = removed.Settlement.AdjustGarrison(UnitType.Spearman, 0, Start, terrainAt: Grass);
        Assert.Equal(AdminGarrisonEditRejection.InvalidCount, nothing.Rejection);
    }

    [Fact]
    public void Shifting_an_arrival_moves_the_whole_leg_without_changing_its_route()
    {
        var army = TravellingArmy(out var movement);
        var landNow = army.ShiftArrivalTo(Start);

        Assert.NotNull(landNow);
        var shifted = ((ArmyLocation.InTransit)landNow!.Location).Movement;

        Assert.Equal(Start, shifted.ArrivesAt);
        Assert.Equal(movement.Path, shifted.Path);
        Assert.Equal(movement.CumulativeHours, shifted.CumulativeHours);

        // The standing window after arrival is preserved, not collapsed.
        Assert.Equal(movement.TurnAroundAt - movement.ArrivesAt, shifted.TurnAroundAt - shifted.ArrivesAt);
    }

    [Fact]
    public void Shifting_an_arrival_is_refused_for_an_army_that_is_not_travelling()
    {
        var atHome = TravellingArmy(out _) with { Location = new ArmyLocation.AtHome() };

        Assert.Null(atHome.ShiftArrivalTo(Start));
    }

    [Fact]
    public void Teleporting_stands_the_army_on_the_named_hex_with_a_fresh_route_home()
    {
        var army = TravellingArmy(out _);
        var home = new HexCoord(0, 0);
        var destination = new HexCoord(2, 0);

        var moved = army.TeleportTo(destination, home, Start, Grass);

        Assert.NotNull(moved);
        var movement = ((ArmyLocation.InTransit)moved!.Location).Movement;

        Assert.Equal(destination, movement.PositionAt(Start));
        Assert.Equal(Start, movement.ArrivesAt);
        Assert.Equal(home, movement.ReturnPath[^1]);
    }

    [Fact]
    public void Teleporting_charges_the_leg_already_flown_unless_provisions_are_overridden()
    {
        var army = TravellingArmy(out _);
        var home = new HexCoord(0, 0);
        var tenHoursIn = Start + TimeSpan.FromHours(10);

        // Ten hours of upkeep really were eaten, so a plain teleport carries
        // over what is left rather than refunding the trip.
        var carried = army.TeleportTo(new HexCoord(2, 0), home, tenHoursIn, Grass);
        Assert.NotNull(carried);
        Assert.Equal(army.Provisions - (army.TotalUpkeepPerHour * 10), carried!.Provisions, 3);

        // An explicit value replaces it outright — the admin said "you have
        // this much food", and the standing window follows from that number.
        var overridden = army.TeleportTo(new HexCoord(2, 0), home, tenHoursIn, Grass, provisions: 500);
        Assert.NotNull(overridden);
        Assert.Equal(500, overridden!.Provisions, 3);
    }

    [Fact]
    public void Teleporting_a_land_army_onto_water_is_refused()
    {
        var army = TravellingArmy(out _);

        Assert.Null(army.TeleportTo(new HexCoord(2, 0), new HexCoord(0, 0), Start, _ => Terrain.Sea));
    }

    /// <summary>A five-thrall army ten hours into a journey, with plenty of food aboard.</summary>
    private static Army TravellingArmy(out ArmyMovement movement)
    {
        var path = new List<HexCoord> { new(0, 0), new(1, 0), new(2, 0) };

        movement = new ArmyMovement
        {
            DepartedAt = Start,
            Path = path,
            CumulativeHours = [0, 5, 10],
            ReturnPath = [new HexCoord(2, 0), new HexCoord(1, 0), new HexCoord(0, 0)],
            ReturnCumulativeHours = [0, 5, 10],
            TurnAroundAt = Start + TimeSpan.FromHours(40),
            IsReturning = false,
        };

        return new Army
        {
            Id = Guid.CreateVersion7(),
            SettlementId = Guid.CreateVersion7(),
            Stacks = [new UnitStack(UnitType.Thrall, 5)],
            Location = new ArmyLocation.InTransit(movement),
            Provisions = 1_000,
            Mission = ArmyMission.Move,
        };
    }
}
