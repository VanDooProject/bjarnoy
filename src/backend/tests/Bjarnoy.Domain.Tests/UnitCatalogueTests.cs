using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;

namespace Bjarnoy.Domain.Tests;

public class UnitCatalogueTests
{
    [Fact]
    public void Every_unit_type_has_a_definition()
    {
        foreach (var type in UnitCatalogue.AllTypes)
        {
            var definition = UnitCatalogue.TryGet(type);

            Assert.NotNull(definition);
            Assert.Equal(type, definition.Type);
            Assert.True(definition.TrainingCost.IsNonNegative);
            Assert.True(definition.TrainingDuration > TimeSpan.Zero);
            Assert.True(definition.UpkeepPerHour >= 0);
        }
    }

    [Theory]
    [InlineData(UnitType.Thrall, 1, true)]
    [InlineData(UnitType.Spearman, 1, true)]
    [InlineData(UnitType.Axeman, 2, false)]
    [InlineData(UnitType.Axeman, 3, true)]
    public void A_unit_with_no_prerequisite_is_gated_only_by_longhouse_level(
        UnitType type, int longhouseLevel, bool expectedAvailable)
    {
        Assert.Equal(expectedAvailable, UnitCatalogue.IsAvailable(type, longhouseLevel));
    }

    [Fact]
    public void A_unit_with_a_prerequisite_needs_both_its_own_and_the_prerequisites_longhouse_level()
    {
        // Berserker itself needs longhouse 6, but Axeman (its prerequisite)
        // needs longhouse 3 — both must be satisfied, so a high-enough
        // longhouse alone is not tested here, only the composed rule.
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Berserker, 5));
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Berserker, 6));
    }

    [Fact]
    public void A_chained_prerequisite_recurses_through_every_link()
    {
        // Catapult requires Berserker, which requires Axeman. At longhouse 10
        // every link in the chain is satisfied.
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Catapult, 10));

        // At longhouse 6, Berserker itself is available (needs 6) but
        // Catapult additionally needs longhouse 10 for itself.
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Catapult, 6));
    }

    [Fact]
    public void Longship_requires_karve_to_be_available_first()
    {
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Longship, 7));
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Longship, 8));
    }

    [Fact]
    public void A_land_unit_needs_an_archery_range_when_a_building_lookup_is_supplied()
    {
        // No buildingLevelOf lookup: old longhouse-only behavior, unaffected
        // by the new training-building gate.
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Spearman, 1));

        // With a lookup, an absent Archery Range blocks a land unit even
        // though the longhouse is high enough.
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Spearman, 1, _ => 0));
        Assert.True(UnitCatalogue.IsAvailable(
            UnitType.Spearman, 1, t => t == BuildingType.ArcheryRange ? 1 : 0));
    }

    [Fact]
    public void A_ship_needs_a_dockyard_when_a_building_lookup_is_supplied()
    {
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Karve, 5));
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Karve, 5, _ => 0));
        Assert.True(UnitCatalogue.IsAvailable(
            UnitType.Karve, 5, t => t == BuildingType.Dockyard ? 1 : 0));
    }

    [Fact]
    public void A_civilian_only_needs_the_longhouse_even_with_a_building_lookup()
    {
        // Thrall defaults to RequiredBuildingType = Longhouse, so a lookup
        // that reports no Archery Range/Dockyard still allows it as long as
        // the longhouse itself is reported standing.
        Assert.True(UnitCatalogue.IsAvailable(
            UnitType.Thrall, 1, t => t == BuildingType.Longhouse ? 1 : 0));
    }

    [Fact]
    public void No_unit_requires_a_barracks_yet()
    {
        // Barracks (BuildingType.Barracks) has no unit-training hook of its
        // own — ArcheryRange already owns the land combat/siege roster's
        // RequiredBuildingType gate. Documents that scope boundary so a
        // future change wiring Barracks into training updates this test
        // deliberately rather than by accident.
        Assert.DoesNotContain(
            Enum.GetValues<UnitType>(),
            type => UnitCatalogue.Get(type).RequiredBuildingType == BuildingType.Barracks);
    }

    [Fact]
    public void The_catapult_has_a_positive_siege_power_and_nothing_else_does()
    {
        // Only the Catapult contributes to SiegeResolver's building-damage
        // math (issue #40 phase 5) — every other unit type is 0.
        foreach (var type in UnitCatalogue.AllTypes)
        {
            var definition = UnitCatalogue.Get(type);
            if (type == UnitType.Catapult)
            {
                Assert.True(definition.SiegePower > 0, "the Catapult must have a positive siege power");
            }
            else
            {
                Assert.Equal(0, definition.SiegePower);
            }
        }
    }
}
