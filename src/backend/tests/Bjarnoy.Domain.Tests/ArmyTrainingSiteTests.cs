using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// A land army leaves from and returns to the building that trained its slowest unit type
/// (<see cref="Army.TrainingSite"/>); the settlement centre only stays when that building is gone.
/// </summary>
public class ArmyTrainingSiteTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);
    private static readonly HexCoord Barracks = new(2, 0);
    private static readonly HexCoord Range = new(-2, 0);
    private static readonly HexCoord Workshop = new(0, 3);
    private static readonly HexCoord Target = new(4, 0);

    private static Terrain Grass(HexCoord _) => Terrain.Grass;

    private static Settlement Found(UnitStack[] garrison, params (HexCoord At, BuildingType Type)[] buildings)
    {
        const int longhouseLevel = 10;
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings =
            [
                new PlacedBuilding(Centre, BuildingType.Longhouse, longhouseLevel),
                .. buildings.Select(b => new PlacedBuilding(b.At, b.Type, 1)),
            ],
            Garrison = garrison,
            Resources = ResourcePool.Create(new ResourceAmounts(1_000_000, 1_000_000, 1_000_000, 1_000_000), production, capacity, T0),
        };
    }

    private static DispatchDecision Move(Settlement settlement, UnitStack[] units, ArmyMission mission = ArmyMission.Move) =>
        Army.PlanDispatch(settlement, units, 10, [], Target, T0, Guid.CreateVersion7(), Grass, mission);

    private static Bjarnoy.Domain.Movement.Movement MovementOf(Army army) => ((ArmyLocation.InTransit)army.Location).Movement;

    [Fact]
    public void Spearmen_depart_from_and_return_to_the_barracks()
    {
        UnitStack[] units = [new(UnitType.Spearman, 5)];
        var settlement = Found(units, (Barracks, BuildingType.Barracks));

        var decision = Move(settlement, units);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var movement = MovementOf(decision.Army!);
        Assert.Equal(Barracks, movement.Path[0]);
        Assert.Equal(Barracks, movement.ReturnPath[^1]);
    }

    [Fact]
    public void Settlers_depart_from_the_cart_workshop()
    {
        UnitStack[] units = [new(UnitType.Settler, 5)];
        var settlement = Found(units, (Barracks, BuildingType.Barracks), (Workshop, BuildingType.CartWorkshop));

        var decision = Move(settlement, units);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(Workshop, MovementOf(decision.Army!).Path[0]);
        Assert.Equal(Workshop, MovementOf(decision.Army!).ReturnPath[^1]);
    }

    [Fact]
    public void Mixed_army_departs_from_the_building_of_its_slowest_unit()
    {
        // Thrall speed 5 (Barracks), Bowman speed 4 (Archery Range): the bowman is slower.
        UnitStack[] units = [new(UnitType.Thrall, 1), new(UnitType.Bowman, 1)];
        var settlement = Found(units, (Barracks, BuildingType.Barracks), (Range, BuildingType.ArcheryRange));

        var decision = Move(settlement, units);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(Range, MovementOf(decision.Army!).Path[0]);
    }

    [Fact]
    public void Equal_speeds_fall_back_to_the_lowest_unit_type()
    {
        // Spearman and Bowman both walk at 4; Spearman has the lower enum value, so the Barracks wins.
        UnitStack[] units = [new(UnitType.Bowman, 5), new(UnitType.Spearman, 5)];
        var settlement = Found(units, (Barracks, BuildingType.Barracks), (Range, BuildingType.ArcheryRange));

        Assert.Equal(UnitCatalogue.Get(UnitType.Spearman).Speed, UnitCatalogue.Get(UnitType.Bowman).Speed);
        Assert.Equal(Barracks, Army.TrainingSite(Centre, settlement.Buildings, units));
        Assert.Equal(Barracks, MovementOf(Move(settlement, units).Army!).Path[0]);
    }

    [Fact]
    public void Without_the_training_building_the_army_uses_the_centre()
    {
        UnitStack[] units = [new(UnitType.Spearman, 5)];
        var settlement = Found(units, (Range, BuildingType.ArcheryRange));

        var decision = Move(settlement, units);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(Centre, MovementOf(decision.Army!).Path[0]);
        Assert.Equal(Centre, MovementOf(decision.Army!).ReturnPath[^1]);
    }

    [Fact]
    public void With_two_barracks_the_one_nearest_the_centre_wins()
    {
        UnitStack[] units = [new(UnitType.Spearman, 5)];
        var settlement = Found(units, (new HexCoord(4, 0), BuildingType.Barracks), (Barracks, BuildingType.Barracks));

        Assert.Equal(Barracks, Army.TrainingSite(Centre, settlement.Buildings, units));
    }

    [Fact]
    public void Equal_distance_barracks_break_ties_by_q_then_r()
    {
        UnitStack[] units = [new(UnitType.Spearman, 5)];
        var a = new HexCoord(3, 0);
        var b = new HexCoord(2, 1);
        Assert.Equal(Centre.DistanceTo(a), Centre.DistanceTo(b));
        var settlement = Found(units, (a, BuildingType.Barracks), (b, BuildingType.Barracks));

        Assert.Equal(b, Army.TrainingSite(Centre, settlement.Buildings, units));
    }

    [Fact]
    public void Recall_of_a_land_army_ends_at_its_training_building()
    {
        UnitStack[] units = [new(UnitType.Spearman, 5)];
        var settlement = Found(units, (Barracks, BuildingType.Barracks));
        var army = Move(settlement, units).Army!;
        var home = army.HomeHex(settlement.Centre, settlement.Buildings, Grass);
        Assert.Equal(Barracks, home);

        var recalled = army.Recall(T0.AddMinutes(10), home, Grass);

        Assert.NotNull(recalled);
        var movement = MovementOf(recalled!);
        Assert.True(movement.IsReturning);
        Assert.Equal(Barracks, movement.Path[^1]);
    }

    [Fact]
    public void Fleets_still_use_the_dockyard_not_the_barracks()
    {
        var dock = new HexCoord(3, 0);
        UnitStack[] units = [new(UnitType.Karve, 5)];
        var settlement = Found(units, (Barracks, BuildingType.Barracks), (dock, BuildingType.Dockyard));
        var army = new Army
        {
            Id = Guid.CreateVersion7(),
            SettlementId = settlement.Id,
            Stacks = units,
            Location = new ArmyLocation.AtHome(),
        };

        var home = army.HomeHex(settlement.Centre, settlement.Buildings, c => c.Q is >= 3 and <= 8 ? Terrain.Sea : Terrain.Grass);

        Assert.Equal(dock, home);
    }
}
