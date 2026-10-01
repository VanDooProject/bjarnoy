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
    [InlineData(UnitType.Spearman, 4, false)]
    [InlineData(UnitType.Spearman, 5, true)]
    [InlineData(UnitType.Axeman, 5, false)]
    [InlineData(UnitType.Axeman, 6, true)]
    public void A_unit_with_no_prerequisite_is_gated_only_by_longhouse_level(
        UnitType type, int longhouseLevel, bool expectedAvailable)
    {
        Assert.Equal(expectedAvailable, UnitCatalogue.IsAvailable(type, longhouseLevel));
    }

    [Fact]
    public void A_unit_with_a_prerequisite_needs_both_its_own_and_the_prerequisites_longhouse_level()
    {
        // Berserker itself needs longhouse 20, and Axeman (its prerequisite)
        // needs longhouse 6 — both must be satisfied, so a high-enough
        // longhouse alone is not tested here, only the composed rule.
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Berserker, 19));
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Berserker, 20));
    }

    [Fact]
    public void A_chained_prerequisite_recurses_through_every_link()
    {
        // Catapult requires Berserker, which requires Axeman. At longhouse 20
        // every link in the chain is satisfied.
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Catapult, 20));

        // Below 20 Berserker is not available, so neither is Catapult, even
        // though Axeman (the chain's first link, longhouse 6) is.
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Axeman, 19));
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Catapult, 19));
    }

    [Fact]
    public void Longship_requires_karve_to_be_available_first()
    {
        // The Karve is available from longhouse 8 (its Dockyard), but the Longship is an elite unit (longhouse 20).
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Karve, 8));
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Longship, 19));
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Longship, 20));
    }

    [Fact]
    public void A_land_unit_needs_an_archery_range_when_a_building_lookup_is_supplied()
    {
        // Bowman is the archer/siege slice of the roster — still gated on
        // ArcheryRange, unlike the basic melee units (see
        // A_basic_melee_unit_needs_a_barracks_when_a_building_lookup_is_supplied).

        // No buildingLevelOf lookup: old longhouse-only behavior, unaffected
        // by the new training-building gate.
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Bowman, 9));

        // With a lookup, an absent Archery Range blocks a land unit even
        // though the longhouse is high enough.
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Bowman, 9, _ => 0));
        Assert.True(UnitCatalogue.IsAvailable(
            UnitType.Bowman, 9, t => t == BuildingType.ArcheryRange ? 1 : 0));
    }

    [Fact]
    public void A_basic_melee_unit_needs_a_barracks_when_a_building_lookup_is_supplied()
    {
        // Spearman is the basic melee slice of the roster — gated on
        // Barracks, not ArcheryRange (which now only trains Bowman/Catapult).

        // No buildingLevelOf lookup: old longhouse-only behavior, unaffected
        // by the new training-building gate.
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Spearman, 5));

        // With a lookup, an absent Barracks blocks a land unit even though
        // the longhouse is high enough.
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Spearman, 5, _ => 0));
        Assert.True(UnitCatalogue.IsAvailable(
            UnitType.Spearman, 5, t => t == BuildingType.Barracks ? 1 : 0));
    }

    [Fact]
    public void A_ship_needs_a_dockyard_when_a_building_lookup_is_supplied()
    {
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Karve, 8));
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Karve, 8, _ => 0));
        Assert.True(UnitCatalogue.IsAvailable(
            UnitType.Karve, 8, t => t == BuildingType.Dockyard ? 1 : 0));
    }

    [Fact]
    public void A_civilian_with_no_matching_building_reported_is_unavailable()
    {
        // Thrall trains at a Barracks (same building as the basic melee
        // roster — see The_basic_melee_and_thrall_roster_requires_a_barracks
        // below), so a lookup that reports the longhouse but not a Barracks
        // still refuses it.
        Assert.False(UnitCatalogue.IsAvailable(
            UnitType.Thrall, 1, t => t == BuildingType.Longhouse ? 1 : 0));
    }

    [Fact]
    public void A_civilian_becomes_available_once_its_barracks_is_reported()
    {
        Assert.True(UnitCatalogue.IsAvailable(
            UnitType.Thrall, 1, t => t == BuildingType.Barracks ? 1 : 0));
    }

    [Fact]
    public void The_basic_melee_and_thrall_roster_requires_a_barracks()
    {
        // Barracks (BuildingType.Barracks) trains the basic melee slice of
        // the land roster plus Thrall; ArcheryRange keeps the archer/siege
        // slice (Bowman, Catapult), and Cart Workshop trains the rest of the
        // civilian roster (Provisioner, SettlerCrew). Documents that split
        // so a future roster change updates this test deliberately rather
        // than by accident.
        Assert.Equal(
            [UnitType.Thrall, UnitType.Spearman, UnitType.Axeman, UnitType.Berserker],
            Enum.GetValues<UnitType>()
                .Where(type => UnitCatalogue.Get(type).RequiredBuildingType == BuildingType.Barracks)
                .ToArray());
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

    [Fact]
    public void The_thrall_costs_no_iron_and_every_other_unit_costs_iron()
    {
        // docs/design/economy.md section 8: iron is an indirect gate for the army.
        Assert.Equal(0, UnitCatalogue.Get(UnitType.Thrall).TrainingCost.Iron);
        foreach (var type in UnitCatalogue.AllTypes.Where(t => t != UnitType.Thrall))
        {
            Assert.True(UnitCatalogue.Get(type).TrainingCost.Iron > 0, $"{type} costs no iron");
        }
    }

    [Fact]
    public void A_units_longhouse_gate_is_never_below_the_unlock_level_of_the_building_that_trains_it()
    {
        // The Thrall is the one exception: it has no Longhouse gate of its own (1), its Barracks (LH 5) is the gate.
        foreach (var type in UnitCatalogue.AllTypes.Where(t => t != UnitType.Thrall))
        {
            var definition = UnitCatalogue.Get(type);
            Assert.True(
                definition.RequiredLonghouseLevel >= BuildingCatalogue.UnlockLevel(definition.RequiredBuildingType),
                $"{type} (LH {definition.RequiredLonghouseLevel}) unlocks before its {definition.RequiredBuildingType} "
                + $"(LH {BuildingCatalogue.UnlockLevel(definition.RequiredBuildingType)})");
        }
    }

    [Theory]
    [InlineData(UnitType.Thrall, 1)]
    [InlineData(UnitType.Spearman, 5)]
    [InlineData(UnitType.Axeman, 6)]
    [InlineData(UnitType.Karve, 8)]
    [InlineData(UnitType.Bowman, 9)]
    [InlineData(UnitType.Provisioner, 10)]
    [InlineData(UnitType.SettlerCrew, 10)]
    [InlineData(UnitType.Berserker, 20)]
    [InlineData(UnitType.Catapult, 20)]
    [InlineData(UnitType.Longship, 20)]
    public void Unit_gates_follow_the_building_ladder(UnitType type, int longhouseLevel)
    {
        Assert.Equal(longhouseLevel, UnitCatalogue.Get(type).RequiredLonghouseLevel);
    }

    [Fact]
    public void Only_the_first_spearmen_run_on_the_longhouse_trickle_everything_else_waits_for_the_bog_ore_works()
    {
        // The Longhouse trickle is the only iron before the bog-ore works (LH 6): the Thrall needs none and the Barracks'
        // first Spearman (LH 5) is what the trickle carries; every other iron unit opens with or after the bog-ore works.
        var bogOre = BuildingCatalogue.UnlockLevel(BuildingType.BogOreWorks);
        foreach (var type in UnitCatalogue.AllTypes.Where(t => t is not (UnitType.Thrall or UnitType.Spearman)))
        {
            Assert.True(UnitCatalogue.Get(type).RequiredLonghouseLevel >= bogOre, $"{type} opens before the bog-ore works");
        }
    }

    [Fact]
    public void The_elite_units_open_where_the_hammerschmiede_does()
    {
        var hammer = BuildingCatalogue.UnlockLevel(BuildingType.Hammerschmiede);
        foreach (var type in new[] { UnitType.Berserker, UnitType.Catapult, UnitType.Longship })
        {
            Assert.Equal(hammer, UnitCatalogue.Get(type).RequiredLonghouseLevel);
        }
    }

    [Fact]
    public void A_unit_never_opens_before_its_prerequisite_unit()
    {
        foreach (var type in UnitCatalogue.AllTypes)
        {
            var definition = UnitCatalogue.Get(type);
            if (definition.RequiredUnitType is { } prerequisite)
            {
                Assert.True(definition.RequiredLonghouseLevel >= UnitCatalogue.Get(prerequisite).RequiredLonghouseLevel);
            }
        }
    }
}
