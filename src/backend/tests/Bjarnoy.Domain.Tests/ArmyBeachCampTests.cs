using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Setting up a beach camp (docs/design/skirmish/beach-camp.md): dispatch validation, the cost in the loot, the build wait.</summary>
public class ArmyBeachCampTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Home = new(0, 0);
    private static readonly HexCoord Site = new(4, 0);
    private static readonly HexCoord Water = new(5, 0);

    /// <summary>Grass everywhere, with a sand hex at <see cref="Site"/> whose far side is open sea.</summary>
    private static Terrain SandShore(HexCoord hex) =>
        hex == Site ? Terrain.Sand : hex == Water ? Terrain.Sea : Terrain.Grass;

    private static Settlement Camp(
        IReadOnlyList<UnitStack>? garrison = null, ResourceAmounts? stock = null)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 5)]);

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Home,
            Buildings = [new PlacedBuilding(Home, BuildingType.Longhouse, 5)],
            SpotStacks = [.. (garrison ?? [new UnitStack(UnitType.CampBuilder, 2)]).Select(s => new SpotStack(Home, s.Type, s.Count))],
            Resources = ResourcePool.Create(
                stock ?? new ResourceAmounts(Wood: 10_000, Stone: 10_000, Food: 10_000, Iron: 10_000),
                production, capacity, T0),
        };
    }

    private static DispatchDecision Dispatch(
        Settlement settlement,
        HexCoord? destination = null,
        double provisions = 60,
        IReadOnlyList<UnitStack>? requested = null,
        Func<HexCoord, Terrain>? terrainAt = null,
        Func<HexCoord, bool>? isOccupied = null,
        IGiantIndex? giants = null,
        double speedFactor = 1.0) =>
        Army.PlanDispatch(
            settlement,
            settlement.Centre,
            requested ?? [new UnitStack(UnitType.CampBuilder, 2)],
            provisions,
            [],
            destination ?? Site,
            T0,
            Guid.CreateVersion7(),
            terrainAt ?? SandShore,
            ArmyMission.SetUpCamp,
            giants: giants,
            isCampSiteOccupied: isOccupied,
            speedFactor: speedFactor);

    private static Army Dispatched(double provisions = 60, double speedFactor = 1.0)
    {
        var decision = Dispatch(Camp(), provisions: provisions, speedFactor: speedFactor);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        return decision.Army!;
    }

    [Fact]
    public void A_camp_dispatch_with_two_builders_on_a_free_sand_shore_is_accepted()
    {
        var decision = Dispatch(Camp());

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(ArmyMission.SetUpCamp, decision.Army!.Mission);
        Assert.Equal(Site, ((ArmyLocation.InTransit)decision.Army.Location).Movement.Path[^1]);
    }

    [Fact]
    public void The_camp_cost_leaves_the_stock_at_dispatch_and_rides_in_the_armys_loot()
    {
        var before = Camp();

        var decision = Dispatch(before, provisions: 60);

        Assert.Equal(BeachCamp.Cost, decision.Army!.Loot);
        Assert.Equal(new ResourceAmounts(Wood: 200, Stone: 100, Food: 0, Iron: 0), BeachCamp.Cost);
        var after = decision.Settlement!.Resources.At(T0);
        var was = before.Resources.At(T0);
        Assert.Equal(was.Wood - 200, after.Wood, 6);
        Assert.Equal(was.Stone - 100, after.Stone, 6);
        Assert.Equal(was.Food - 60, after.Food, 6);
        Assert.Equal(was.Iron, after.Iron, 6);
    }

    [Fact]
    public void Other_missions_carry_no_loot()
    {
        var settlement = Camp(garrison: [new UnitStack(UnitType.Spearman, 5)]);

        var decision = Army.PlanDispatch(
            settlement, settlement.Centre, [new UnitStack(UnitType.Spearman, 5)], 40, [], new HexCoord(3, 0), T0, Guid.CreateVersion7(), SandShore);

        Assert.True(decision.Accepted);
        Assert.True(decision.Army!.Loot.IsZero);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    public void A_camp_dispatch_needs_exactly_two_camp_builders(int count)
    {
        var settlement = Camp(garrison: [new UnitStack(UnitType.CampBuilder, count)]);

        var decision = Dispatch(settlement, requested: [new UnitStack(UnitType.CampBuilder, count)]);

        Assert.Equal(DispatchRejection.WrongCampBuilderCount, decision.Rejection);
    }

    [Fact]
    public void Settlers_do_not_count_as_camp_builders()
    {
        var settlement = Camp(garrison: [new UnitStack(UnitType.Settler, 2)]);

        var decision = Dispatch(settlement, requested: [new UnitStack(UnitType.Settler, 2)]);

        Assert.Equal(DispatchRejection.WrongCampBuilderCount, decision.Rejection);
    }

    [Fact]
    public void Troops_may_come_along_with_the_builders()
    {
        var requested = new[] { new UnitStack(UnitType.CampBuilder, 2), new UnitStack(UnitType.Spearman, 5) };
        var settlement = Camp(garrison: requested);

        var decision = Dispatch(settlement, requested: requested);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
    }

    [Fact]
    public void A_camp_needs_a_sand_hex()
    {
        var decision = Dispatch(Camp(), terrainAt: h => h == Site ? Terrain.Grass : SandShore(h));

        Assert.Equal(DispatchRejection.CampSiteNotSandShore, decision.Rejection);
    }

    [Fact]
    public void A_sand_hex_inland_is_not_a_shore()
    {
        var decision = Dispatch(Camp(), terrainAt: h => h == Site ? Terrain.Sand : Terrain.Grass);

        Assert.Equal(DispatchRejection.CampSiteNotSandShore, decision.Rejection);
    }

    [Fact]
    public void A_camp_site_with_a_building_a_centre_or_a_wildlife_camp_is_not_free()
    {
        var decision = Dispatch(Camp(), isOccupied: hex => hex == Site);

        Assert.Equal(DispatchRejection.CampSiteNotFree, decision.Rejection);
    }

    [Fact]
    public void A_camp_site_on_a_giant_is_not_free()
    {
        var giants = new GiantIndex([new Giant(Site, "giantmountain", TileOrientation.E)]);

        var decision = Dispatch(Camp(), giants: giants);

        Assert.Equal(DispatchRejection.CampSiteNotFree, decision.Rejection);
    }

    [Fact]
    public void Another_players_realm_is_no_obstacle()
    {
        // No spacing rule: the occupancy callback only knows hexes with something on them.
        var decision = Dispatch(Camp(), isOccupied: hex => hex == new HexCoord(3, 0));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
    }

    [Fact]
    public void A_camp_dispatch_is_rejected_when_the_stock_cannot_pay_the_cost()
    {
        var settlement = Camp(stock: new ResourceAmounts(Wood: 199, Stone: 1_000, Food: 1_000, Iron: 0));

        var decision = Dispatch(settlement);

        Assert.Equal(DispatchRejection.InsufficientResources, decision.Rejection);
    }

    [Fact]
    public void A_fleet_may_land_on_the_camp_hex()
    {
        var requested = new[] { new UnitStack(UnitType.CampBuilder, 2), new UnitStack(UnitType.Longship, 1) };
        var settlement = Camp(garrison: requested);

        var decision = Dispatch(settlement, requested: requested, terrainAt: h => h == Site ? Terrain.Sand : Terrain.Sea);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
    }

    [Fact]
    public void The_provisions_must_cover_the_way_out_the_build_wait_and_the_way_back()
    {
        var probe = Dispatched(provisions: 80);
        var movement = ((ArmyLocation.InTransit)probe.Location).Movement;
        var upkeep = probe.TotalUpkeepPerHour;
        var wait = BeachCamp.BuildDuration.TotalHours;
        var needed = (movement.CumulativeHours[^1] + wait + movement.ReturnCumulativeHours[^1]) * upkeep;
        var withoutWait = (movement.CumulativeHours[^1] + movement.ReturnCumulativeHours[^1]) * upkeep;
        Assert.True(needed > withoutWait);

        Assert.Equal(
            DispatchRejection.InsufficientProvisionsForRoundTrip,
            Dispatch(Camp(), provisions: needed - 0.01).Rejection);
        Assert.True(Dispatch(Camp(), provisions: needed + 0.01).Accepted);
    }

    [Fact]
    public void A_camp_army_is_not_due_to_turn_around_before_the_camp_is_up()
    {
        var army = Dispatched(provisions: 80);
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        Assert.True(movement.TurnAroundAt >= movement.ArrivesAt + BeachCamp.BuildDuration);
    }

    [Fact]
    public void The_build_wait_is_shortened_by_the_world_speed()
    {
        Assert.Equal(TimeSpan.FromMinutes(10), BeachCamp.ScaledBuildDuration(1.0));
        Assert.Equal(TimeSpan.FromMinutes(5), BeachCamp.ScaledBuildDuration(2.0));
    }

    [Fact]
    public void PlanCampBuild_is_not_due_before_arrival_plus_the_build_time()
    {
        var army = Dispatched();
        var arrivesAt = ((ArmyLocation.InTransit)army.Location).Movement.ArrivesAt;

        var early = Army.PlanCampBuild(army, arrivesAt + BeachCamp.BuildDuration - TimeSpan.FromSeconds(1), 1.0, siteStillFree: true);

        Assert.False(early.Due);
        Assert.False(early.ShouldBuild);
    }

    [Fact]
    public void PlanCampBuild_builds_at_arrival_plus_build_time_without_the_builders_and_with_the_leftover_food()
    {
        var requested = new[] { new UnitStack(UnitType.CampBuilder, 2), new UnitStack(UnitType.Spearman, 3) };
        var decision = Dispatch(Camp(garrison: requested), provisions: 100, requested: requested);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var army = decision.Army!;
        var arrivesAt = ((ArmyLocation.InTransit)army.Location).Movement.ArrivesAt;
        var completesAt = arrivesAt + BeachCamp.BuildDuration;

        var plan = Army.PlanCampBuild(army, completesAt, 1.0, siteStillFree: true);

        Assert.True(plan.Due);
        Assert.True(plan.ShouldBuild);
        Assert.Equal(Site, plan.Site);
        Assert.Equal(completesAt, plan.CompletesAt);
        var troops = Assert.Single(plan.GarrisonForCamp);
        Assert.Equal(UnitType.Spearman, troops.Type);
        Assert.Equal(3, troops.Count);
        Assert.Equal(army.ProvisionsAt(completesAt), plan.FoodForCamp, 9);
        Assert.True(plan.FoodForCamp > 0);
    }

    [Fact]
    public void PlanCampBuild_falls_back_when_the_site_was_taken_in_the_meantime()
    {
        var army = Dispatched();
        var completesAt = ((ArmyLocation.InTransit)army.Location).Movement.ArrivesAt + BeachCamp.BuildDuration;

        var plan = Army.PlanCampBuild(army, completesAt, 1.0, siteStillFree: false);

        Assert.True(plan.Due);
        Assert.False(plan.ShouldBuild);
        Assert.Empty(plan.GarrisonForCamp);
    }

    [Fact]
    public void A_recall_during_the_build_cancels_the_camp_and_the_cost_comes_home_in_the_loot()
    {
        var army = Dispatched();
        var arrivesAt = ((ArmyLocation.InTransit)army.Location).Movement.ArrivesAt;
        var during = arrivesAt + TimeSpan.FromMinutes(4);

        var recalled = army.Recall(during, Home, SandShore);

        Assert.NotNull(recalled);
        Assert.Equal(BeachCamp.Cost, recalled!.Loot);
        Assert.Equal(2, recalled.Stacks.Single(s => s.Type == UnitType.CampBuilder).Count);
        var plan = Army.PlanCampBuild(recalled, arrivesAt + BeachCamp.BuildDuration + TimeSpan.FromHours(1), 1.0, siteStillFree: true);
        Assert.False(plan.Due);
    }

    [Fact]
    public void A_camp_mission_cannot_be_given_as_a_field_order()
    {
        var army = Dispatched();

        var result = Army.PlanFieldOrder(
            army, [], Site, Home, T0.AddMinutes(1), SandShore, isPremium: true, mission: ArmyMission.SetUpCamp);

        Assert.Equal(FieldOrderRejection.MissionNotAllowed, result.Rejection);
    }
}
