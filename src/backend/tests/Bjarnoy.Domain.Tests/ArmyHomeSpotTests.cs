using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// An army is sent from one garrison spot and only takes the units standing there; that spot is its home: it leaves from it,
/// and Recall brings it back to it (<c>docs/design/garrison.md</c>).
/// </summary>
public class ArmyHomeSpotTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);
    private static readonly HexCoord Tower = new(2, 0);
    private static readonly HexCoord Target = new(4, 0);

    private static Terrain Grass(HexCoord _) => Terrain.Grass;

    private static Settlement Found()
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
                new PlacedBuilding(Tower, BuildingType.Tower, 1),
            ],
            Resources = ResourcePool.Create(new ResourceAmounts(1_000_000, 1_000_000, 1_000_000, 1_000_000), production, capacity, T0),
        }
        .WithGarrisonAt(Centre, [new UnitStack(UnitType.Spearman, 10)])
        .WithGarrisonAt(Tower, [new UnitStack(UnitType.Spearman, 4), new UnitStack(UnitType.Bowman, 6)]);
    }

    private static DispatchDecision Send(Settlement settlement, HexCoord spot, params UnitStack[] units) =>
        Army.PlanDispatch(settlement, spot, units, 10, [], Target, T0, Guid.CreateVersion7(), Grass);

    private static Bjarnoy.Domain.Movement.Movement MovementOf(Army army) => ((ArmyLocation.InTransit)army.Location).Movement;

    [Fact]
    public void An_army_leaves_from_the_named_spot_and_that_spot_is_its_home()
    {
        var decision = Send(Found(), Tower, new UnitStack(UnitType.Spearman, 3));

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(Tower, MovementOf(decision.Army!).Path[0]);
        Assert.Equal(Tower, MovementOf(decision.Army!).ReturnPath[^1]);
        Assert.Equal(Tower, decision.Army!.HomeSpot);
    }

    [Fact]
    public void Only_the_units_standing_at_the_named_spot_leave()
    {
        var settlement = Found();

        var decision = Send(settlement, Tower, new UnitStack(UnitType.Spearman, 3));

        Assert.Equal(1, decision.Settlement!.GarrisonAt(Tower).Single(s => s.Type == UnitType.Spearman).Count);
        Assert.Equal(10, decision.Settlement.GarrisonAt(Centre).Single().Count);
        Assert.Equal(11, decision.Settlement.Garrison.Single(s => s.Type == UnitType.Spearman).Count);
    }

    [Fact]
    public void Units_standing_at_another_spot_cannot_be_sent_from_this_one()
    {
        // 10 spearmen stand at the centre and 4 at the tower: 5 cannot leave the tower, though the settlement holds 14.
        var decision = Send(Found(), Tower, new UnitStack(UnitType.Spearman, 5));

        Assert.Equal(DispatchRejection.InsufficientGarrison, decision.Rejection);
    }

    [Fact]
    public void A_hex_that_is_no_garrison_spot_is_refused()
    {
        var decision = Send(Found(), new HexCoord(1, 0), new UnitStack(UnitType.Spearman, 1));

        Assert.Equal(DispatchRejection.NotAGarrisonSpot, decision.Rejection);
    }

    [Fact]
    public void Recall_walks_the_army_back_to_its_home_spot()
    {
        var army = Send(Found(), Tower, new UnitStack(UnitType.Spearman, 3)).Army!;

        var recalled = army.Recall(T0.AddMinutes(10), army.HomeSpot, Grass);

        Assert.NotNull(recalled);
        Assert.Equal(Tower, MovementOf(recalled!).Path[^1]);
    }
}
