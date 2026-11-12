using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// <see cref="PlacedBuilding.StandingSince"/>: the instant a palisade or gate becomes a standing wall, which is when armies already marching
/// start to react to it (<c>docs/design/troop-movement-range.md</c> §5).
/// </summary>
public sealed class WallStandingSinceTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);
    private static readonly HexCoord WallHex = new(3, 0);

    private static Settlement With(PlacedBuilding wall, BuildOrder order)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 5)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 5), wall],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(1_000_000), production, capacity, T0),
            Queue = [order],
        };
    }

    private static BuildOrder Order(BuildingType type, int targetLevel, DateTimeOffset completesAt) => new()
    {
        Id = Guid.CreateVersion7(),
        Type = type,
        TargetLevel = targetLevel,
        Coord = WallHex,
        QueuedAt = T0,
        BaseDuration = completesAt - T0,
        StartedAt = T0,
        CompletesAt = completesAt,
    };

    private static PlacedBuilding WallAfter(Settlement settlement, DateTimeOffset at) =>
        settlement.SettleTo(at).Settlement.Buildings.Single(b => b.Coord == WallHex);

    [Fact]
    public void A_foundation_raised_to_level_one_stands_from_the_instant_its_order_completed()
    {
        var done = T0.AddHours(2);
        var settlement = With(new PlacedBuilding(WallHex, BuildingType.Palisade, 0), Order(BuildingType.Palisade, 1, done));

        var wall = WallAfter(settlement, T0.AddHours(5));

        Assert.Equal(1, wall.Level);
        Assert.Equal(done, wall.StandingSince);
    }

    [Fact]
    public void An_upgrade_keeps_the_instant_the_wall_first_stood()
    {
        var stood = T0.AddHours(-10);
        var settlement = With(
            new PlacedBuilding(WallHex, BuildingType.Palisade, 1, StandingSince: stood), Order(BuildingType.Palisade, 2, T0.AddHours(1)));

        Assert.Equal(stood, WallAfter(settlement, T0.AddHours(2)).StandingSince);
    }

    [Fact]
    public void A_gate_turned_into_a_palisade_stands_as_a_wall_from_the_conversion()
    {
        var done = T0.AddHours(1);
        var settlement = With(
            new PlacedBuilding(WallHex, BuildingType.PalisadeGate, 1, StandingSince: T0.AddHours(-10)), Order(BuildingType.Palisade, 1, done));

        Assert.Equal(done, WallAfter(settlement, T0.AddHours(2)).StandingSince);
    }

    [Fact]
    public void Other_buildings_record_nothing()
    {
        var settlement = With(new PlacedBuilding(WallHex, BuildingType.Farm, 0), Order(BuildingType.Farm, 1, T0.AddHours(1)));

        Assert.Null(WallAfter(settlement, T0.AddHours(2)).StandingSince);
    }
}
