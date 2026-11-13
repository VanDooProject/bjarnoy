using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Services;

namespace Bjarnoy.Infrastructure.Tests.Services;

/// <summary>
/// The marches that put units at a new garrison spot: choosing the nearest spot that fits by route, the land troops of a fleet
/// folded into a dock, and the food a walk takes from the stock.
/// </summary>
public class GarrisonRelocationTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly Guid SettlementId = Guid.CreateVersion7();

    // Grass for Q <= 2, sea beyond: a coast between (2,*) and (3,*).
    private static Terrain Coast(HexCoord c) => c.Q <= 2 ? Terrain.Grass : Terrain.Sea;

    private static GarrisonRelocation.Routing Routing(Func<HexCoord, Terrain> terrain) =>
        new(terrain, 1.0, _ => false, _ => false, null);

    private static GarrisonRelocation.Candidate Spot(int q, int r, GarrisonSpotKind kind)
    {
        var (land, ships) = kind switch
        {
            GarrisonSpotKind.Dock => (false, true),
            _ => (true, false),
        };
        return new GarrisonRelocation.Candidate(SettlementId, new GarrisonSpot(new HexCoord(q, r), kind, [], land, ships));
    }

    [Fact]
    public void Land_units_march_to_the_nearest_tower_or_longhouse_by_route()
    {
        List<UnitStack> stacks = [new UnitStack(UnitType.Spearman, 5)];
        var spots = new[] { Spot(0, 0, GarrisonSpotKind.Longhouse), Spot(-6, 0, GarrisonSpotKind.Tower) };

        var found = GarrisonRelocation.NearestMarch(stacks, new HexCoord(-5, 0), spots, T0, Routing(_ => Terrain.Grass), Guid.CreateVersion7());

        Assert.NotNull(found);
        Assert.Equal(new HexCoord(-6, 0), found.Value.Target.Spot.Coord);
        var army = found.Value.March.Army;
        Assert.Equal(new HexCoord(-6, 0), army.HomeSpot);
        var movement = Assert.IsType<ArmyLocation.InTransit>(army.Location).Movement;
        Assert.True(movement.IsReturning);
        Assert.Equal(new HexCoord(-5, 0), movement.Path[0]);
        Assert.Equal(new HexCoord(-6, 0), movement.Path[^1]);
    }

    [Fact]
    public void Ships_never_march_to_a_tower_or_an_inland_longhouse_only_to_a_dock()
    {
        List<UnitStack> ships = [new UnitStack(UnitType.Karve, 2)];
        var landSpots = new[] { Spot(0, 0, GarrisonSpotKind.Longhouse), Spot(1, 0, GarrisonSpotKind.Tower) };
        var withDock = landSpots.Append(Spot(8, 0, GarrisonSpotKind.Dock)).ToList();

        var none = GarrisonRelocation.NearestMarch(ships, new HexCoord(5, 0), landSpots, T0, Routing(Coast), Guid.CreateVersion7());
        var found = GarrisonRelocation.NearestMarch(ships, new HexCoord(5, 0), withDock, T0, Routing(Coast), Guid.CreateVersion7());

        Assert.Null(none);
        Assert.Equal(new HexCoord(8, 0), found!.Value.Target.Spot.Coord);
    }

    [Fact]
    public void A_spot_that_cannot_be_reached_is_skipped_for_the_next_nearest()
    {
        List<UnitStack> stacks = [new UnitStack(UnitType.Spearman, 5)];
        // The nearer tower stands on an island of its own: no land route reaches it.
        Terrain Islands(HexCoord c) => c.Q is >= 10 and <= 12 ? Terrain.Grass : c.Q <= 2 ? Terrain.Grass : Terrain.Sea;
        var spots = new[] { Spot(11, 0, GarrisonSpotKind.Tower), Spot(-3, 0, GarrisonSpotKind.Tower) };

        var found = GarrisonRelocation.NearestMarch(stacks, new HexCoord(0, 0), spots, T0, Routing(Islands), Guid.CreateVersion7());

        Assert.Equal(new HexCoord(-3, 0), found!.Value.Target.Spot.Coord);
    }

    [Fact]
    public void The_walk_takes_the_food_it_needs_from_the_stock_up_to_what_the_units_carry()
    {
        List<UnitStack> stacks = [new UnitStack(UnitType.Spearman, 5)];
        var found = GarrisonRelocation.NearestMarch(
            stacks, new HexCoord(-5, 0), [Spot(0, 0, GarrisonSpotKind.Longhouse)], T0, Routing(_ => Terrain.Grass), Guid.CreateVersion7())!.Value.March;
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);

        var rich = ResourcePool.Create(ResourceAmounts.Uniform(1_000), production, capacity with { Food = 1_000 }, T0);
        var (fed, afterRich) = GarrisonRelocation.WithWalkFood(found, rich, T0);

        Assert.True(found.FoodNeeded > 0);
        Assert.Equal(Math.Min(found.FoodNeeded, found.Army.TotalFoodCarryCapacity), fed.Provisions, 6);
        Assert.Equal(rich.At(T0).Food - fed.Provisions, afterRich.At(T0).Food, 6);
        Assert.Equal(rich.At(T0).Wood, afterRich.At(T0).Wood, 6); // only food is taken
    }

    [Fact]
    public void A_stock_with_less_food_than_the_walk_needs_still_sends_the_units_with_what_it_has()
    {
        List<UnitStack> stacks = [new UnitStack(UnitType.Spearman, 5)];
        var found = GarrisonRelocation.NearestMarch(
            stacks, new HexCoord(-5, 0), [Spot(0, 0, GarrisonSpotKind.Longhouse)], T0, Routing(_ => Terrain.Grass), Guid.CreateVersion7())!.Value.March;
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        var stock = found.FoodNeeded / 4;

        var poor = ResourcePool.Create(new ResourceAmounts(0, 0, stock, 0), production, capacity with { Food = 1_000 }, T0);
        var (fed, after) = GarrisonRelocation.WithWalkFood(found, poor, T0);

        Assert.Equal(stock, fed.Provisions, 6);
        Assert.Equal(0, after.At(T0).Food, 6);
        Assert.IsType<ArmyLocation.InTransit>(fed.Location);
    }

    [Fact]
    public void The_land_troops_of_a_fleet_walk_from_the_land_hex_beside_the_dock_to_the_nearest_tower_or_longhouse()
    {
        var dock = new HexCoord(3, 0);
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        var settlement = new Settlement
        {
            Id = SettlementId,
            Name = "Bjornstad",
            Centre = new HexCoord(-4, 0),
            Buildings =
            [
                new PlacedBuilding(new HexCoord(-4, 0), BuildingType.Longhouse, 1),
                new PlacedBuilding(new HexCoord(1, 2), BuildingType.Tower, 1),
                new PlacedBuilding(dock, BuildingType.Harbour, 1),
            ],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(1_000), production, capacity, T0),
        };
        List<UnitStack> landing = [new UnitStack(UnitType.Spearman, 6)];

        var found = GarrisonRelocation.LandingMarch(settlement, dock, landing, T0, Routing(Coast), Guid.CreateVersion7());

        Assert.NotNull(found);
        Assert.Equal(new HexCoord(1, 2), found.Value.Target.Spot.Coord); // nearer than the longhouse five hexes away
        var army = found.Value.March.Army;
        Assert.Equal(SettlementId, army.SettlementId);
        Assert.Equal(new HexCoord(1, 2), army.HomeSpot);
        var start = Assert.IsType<ArmyLocation.InTransit>(army.Location).Movement.Path[0];
        Assert.Contains(start, dock.Neighbours());
        Assert.Equal(Terrain.Grass, Coast(start));
    }

    [Fact]
    public void A_dock_with_no_land_beside_it_gives_the_troops_no_walk()
    {
        var dock = new HexCoord(8, 0);
        var settlement = new Settlement
        {
            Id = SettlementId,
            Name = "Bjornstad",
            Centre = new HexCoord(0, 0),
            Buildings = [new PlacedBuilding(new HexCoord(0, 0), BuildingType.Longhouse, 1), new PlacedBuilding(dock, BuildingType.Harbour, 1)],
            Resources = ResourcePool.Create(ResourceAmounts.Zero, ResourceAmounts.Zero, ResourceAmounts.Uniform(10), T0),
        };

        var found = GarrisonRelocation.LandingMarch(
            settlement, dock, [new UnitStack(UnitType.Spearman, 6)], T0, Routing(Coast), Guid.CreateVersion7());

        Assert.Null(found);
    }
}
