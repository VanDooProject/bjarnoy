using Bjarnoy.Domain.Buildings;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The build ring is built by the client from the catalogue (<see cref="BuildingDefinition.RingCategory"/> and the placement fields), so
/// every building the ring may list has to say where it sits.
/// </summary>
public class BuildingRingCatalogueTests
{
    private static IEnumerable<BuildingDefinition> LevelOnes() =>
        Enum.GetValues<BuildingType>()
            .Select(type => BuildingCatalogue.TryGet(type, 1))
            .OfType<BuildingDefinition>();

    [Fact]
    public void Every_building_but_the_longhouse_is_listed_in_a_ring_category()
    {
        foreach (var definition in LevelOnes())
        {
            if (definition.Type == BuildingType.Longhouse)
            {
                Assert.Null(definition.RingCategory);
            }
            else
            {
                Assert.True(definition.RingCategory is not null, $"{definition.Type} has no ring category");
            }
        }
    }

    [Fact]
    public void Ring_positions_are_unique_within_a_category()
    {
        var duplicates = LevelOnes()
            .Where(d => d.RingCategory is not null)
            .GroupBy(d => (d.RingCategory, d.RingOrder))
            .Where(g => g.Count() > 1)
            .Select(g => $"{g.Key.RingCategory} #{g.Key.RingOrder}: {string.Join(", ", g.Select(d => d.Type))}")
            .ToList();

        Assert.Empty(duplicates);
    }

    [Theory]
    [InlineData(BuildingType.Tower, BuildingRingCategory.Defense)]
    [InlineData(BuildingType.Palisade, BuildingRingCategory.Defense)]
    [InlineData(BuildingType.Smithy, BuildingRingCategory.Military)]
    [InlineData(BuildingType.SiegeWorkshop, BuildingRingCategory.Military)]
    [InlineData(BuildingType.FishingHut, BuildingRingCategory.Water)]
    [InlineData(BuildingType.ShrineOfNjord, BuildingRingCategory.Water)]
    [InlineData(BuildingType.ShrineOfThor, BuildingRingCategory.Religion)]
    [InlineData(BuildingType.Hammerschmiede, BuildingRingCategory.Resource)]
    public void A_building_sits_in_its_ring_category(BuildingType type, BuildingRingCategory expected) =>
        Assert.Equal(expected, BuildingCatalogue.Get(type, 1).RingCategory);

    [Fact]
    public void Only_the_plain_palisade_is_the_walls_sea_end()
    {
        Assert.True(BuildingCatalogue.Get(BuildingType.Palisade, 1).AlsoOnCoastalWater);
        Assert.False(BuildingCatalogue.Get(BuildingType.PalisadeGate, 1).AlsoOnCoastalWater);
    }
}
