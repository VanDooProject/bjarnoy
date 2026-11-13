using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;

namespace Bjarnoy.Domain.Tests;

public class UnitCatalogueTests
{
    [Fact]
    public void The_camp_builder_has_the_settlers_stats_at_the_camp_price()
    {
        var builder = UnitCatalogue.Get(UnitType.CampBuilder);
        var settler = UnitCatalogue.Get(UnitType.Settler);

        Assert.Equal("campbuilder", UnitType.CampBuilder.ToWireName());
        Assert.Equal(UnitClass.Civilian, builder.Class);
        Assert.Equal(settler.VisionRadius, builder.VisionRadius);
        Assert.Equal(settler.Defense, builder.Defense);
        Assert.Equal(settler.Speed, builder.Speed);
        Assert.Equal(settler.FoodCarryCapacity, builder.FoodCarryCapacity);
        Assert.Equal(settler.CargoSlots, builder.CargoSlots);
        Assert.Equal(settler.UpkeepPerHour, builder.UpkeepPerHour);
        Assert.Equal(settler.RequiredLonghouseLevel, builder.RequiredLonghouseLevel);
        Assert.Equal(BuildingType.CartWorkshop, builder.RequiredBuildingType);
        Assert.Equal(new ResourceAmounts(Wood: 80, Stone: 40, Food: 40, Iron: 20), builder.TrainingCost);
        Assert.Equal(TimeSpan.FromMinutes(12), builder.TrainingDuration);
    }

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
    public void No_ship_needs_another_unit_first()
    {
        // The building level orders the ships now (docs/design/units-and-ships.md §1): the Karve is no prerequisite any more.
        foreach (var type in UnitCatalogue.AllTypes.Where(t => UnitCatalogue.Get(t).Class == UnitClass.Ship))
        {
            Assert.Null(UnitCatalogue.Get(type).RequiredUnitType);
        }
    }

    [Theory]
    [InlineData(UnitType.Faering, BuildingType.Harbour, 1, 1)]
    [InlineData(UnitType.Byrding, BuildingType.Harbour, 1, 1)]
    [InlineData(UnitType.Knarr, BuildingType.Harbour, 3, 1)]
    [InlineData(UnitType.Karve, BuildingType.Harbour, 5, 1)]
    [InlineData(UnitType.Snekkja, BuildingType.Shipyard, 1, 1)]
    [InlineData(UnitType.Skeid, BuildingType.Shipyard, 10, 20)]
    [InlineData(UnitType.FireRaft, BuildingType.Shipyard, 1, 1)]
    [InlineData(UnitType.FireHulk, BuildingType.Shipyard, 5, 12)]
    public void Every_ship_has_its_building_its_building_level_and_its_own_longhouse_gate(
        UnitType type, BuildingType building, int buildingLevel, int longhouseGate)
    {
        var definition = UnitCatalogue.Get(type);

        Assert.Equal(UnitClass.Ship, definition.Class);
        Assert.Equal(building, definition.RequiredBuildingType);
        Assert.Equal(buildingLevel, definition.RequiredBuildingLevel);
        Assert.Equal(longhouseGate, definition.RequiredLonghouseLevel);
    }

    [Fact]
    public void A_unit_needs_the_building_level_not_just_a_standing_building()
    {
        // Knarr: Harbour 3. A level-2 Harbour does not do, level 3 does, and a Shipyard is the wrong building.
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Knarr, 30, t => t == BuildingType.Harbour ? 2 : 0));
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Knarr, 30, t => t == BuildingType.Harbour ? 3 : 0));
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Knarr, 30, t => t == BuildingType.Shipyard ? 10 : 0));
        // Skeid: Shipyard 10 and its own Longhouse 20.
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Skeid, 19, t => t == BuildingType.Shipyard ? 10 : 0));
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Skeid, 20, t => t == BuildingType.Shipyard ? 9 : 0));
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Skeid, 20, t => t == BuildingType.Shipyard ? 10 : 0));
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
        // Barracks, not ArcheryRange (which now only trains the Bowman).

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
    public void A_ship_needs_its_harbour_or_shipyard_when_a_building_lookup_is_supplied()
    {
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Faering, 5));
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Faering, 5, _ => 0));
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Faering, 5, t => t == BuildingType.Harbour ? 1 : 0));
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Snekkja, 10, t => t == BuildingType.Harbour ? 5 : 0));
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Snekkja, 10, t => t == BuildingType.Shipyard ? 1 : 0));
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
        // the land roster plus Thrall; ArcheryRange keeps the archer
        // (Bowman), SiegeWorkshop the siege engines (Catapult, Ram), and Cart Workshop trains the rest of the
        // civilian roster (Provisioner, Settler). Documents that split
        // so a future roster change updates this test deliberately rather
        // than by accident.
        Assert.Equal(
            [UnitType.Thrall, UnitType.Spearman, UnitType.Axeman, UnitType.Berserker],
            Enum.GetValues<UnitType>()
                .Where(type => UnitCatalogue.Get(type).RequiredBuildingType == BuildingType.Barracks)
                .ToArray());
    }

    [Fact]
    public void The_catapult_and_the_ram_have_a_positive_siege_power_and_nothing_else_does()
    {
        // Only these contribute to SiegeResolver's building-damage math; ships do no damage to buildings on land.
        // Every other unit type is 0.
        foreach (var type in UnitCatalogue.AllTypes)
        {
            var definition = UnitCatalogue.Get(type);
            if (type is UnitType.Catapult or UnitType.Ram)
            {
                Assert.True(definition.SiegePower > 0, $"{type} must have a positive siege power");
            }
            else
            {
                Assert.Equal(0, definition.SiegePower);
            }
        }
    }

    [Fact]
    public void The_thrall_and_the_faering_cost_no_iron_and_every_other_unit_costs_iron()
    {
        // docs/design/economy.md section 8: iron is an indirect gate for the army. The Færing (40 / 10 / 10 / 0) is the scout boat.
        Assert.Equal(0, UnitCatalogue.Get(UnitType.Thrall).TrainingCost.Iron);
        Assert.Equal(0, UnitCatalogue.Get(UnitType.Faering).TrainingCost.Iron);
        foreach (var type in UnitCatalogue.AllTypes.Where(t => t is not (UnitType.Thrall or UnitType.Faering)))
        {
            Assert.True(UnitCatalogue.Get(type).TrainingCost.Iron > 0, $"{type} costs no iron");
        }
    }

    [Fact]
    public void A_units_earliest_longhouse_is_never_below_the_unlock_level_of_the_building_that_trains_it()
    {
        // A unit with no Longhouse gate of its own (1) is gated by its building: the earliest Longhouse is the highest of the
        // building's unlock, the building level it needs and its own gate (units-and-ships.md §1).
        foreach (var type in UnitCatalogue.AllTypes)
        {
            var definition = UnitCatalogue.Get(type);
            var earliest = Math.Max(
                definition.RequiredLonghouseLevel,
                BuildingCatalogue.RequiredLonghouseLevelFor(definition.RequiredBuildingType, definition.RequiredBuildingLevel));
            Assert.True(
                earliest >= BuildingCatalogue.UnlockLevel(definition.RequiredBuildingType),
                $"{type} (LH {definition.RequiredLonghouseLevel}) unlocks before its {definition.RequiredBuildingType} "
                + $"(LH {BuildingCatalogue.UnlockLevel(definition.RequiredBuildingType)})");
        }
    }

    [Theory]
    [InlineData(UnitType.Thrall, 1)]
    [InlineData(UnitType.Spearman, 5)]
    [InlineData(UnitType.Axeman, 6)]
    [InlineData(UnitType.Bowman, 9)]
    [InlineData(UnitType.Provisioner, 10)]
    [InlineData(UnitType.Settler, 10)]
    [InlineData(UnitType.Berserker, 20)]
    [InlineData(UnitType.Catapult, 20)]
    [InlineData(UnitType.Ram, 20)]
    [InlineData(UnitType.Skeid, 20)]
    [InlineData(UnitType.FireHulk, 12)]
    [InlineData(UnitType.Snekkja, 1)]
    [InlineData(UnitType.Karve, 1)]
    public void Unit_gates_follow_the_building_ladder(UnitType type, int longhouseLevel)
    {
        Assert.Equal(longhouseLevel, UnitCatalogue.Get(type).RequiredLonghouseLevel);
    }

    [Fact]
    public void Only_the_first_spearmen_run_on_the_longhouse_trickle_everything_else_waits_for_the_bog_ore_works()
    {
        // The Longhouse trickle is the only iron before the bog-ore works (LH 3): the Thrall needs none and the Barracks'
        // first Spearman (LH 5) is what the trickle carries; every other iron unit opens with or after the bog-ore works.
        var bogOre = BuildingCatalogue.UnlockLevel(BuildingType.BogOreWorks);
        foreach (var type in UnitCatalogue.AllTypes.Where(t => t is not (UnitType.Thrall or UnitType.Spearman)))
        {
            var definition = UnitCatalogue.Get(type);
            var earliest = Math.Max(
                definition.RequiredLonghouseLevel,
                BuildingCatalogue.RequiredLonghouseLevelFor(definition.RequiredBuildingType, definition.RequiredBuildingLevel));
            Assert.True(earliest >= bogOre, $"{type} opens before the bog-ore works");
        }
    }

    [Fact]
    public void The_elite_units_open_where_the_hammerschmiede_does()
    {
        var hammer = BuildingCatalogue.UnlockLevel(BuildingType.Hammerschmiede);
        foreach (var type in new[] { UnitType.Berserker, UnitType.Catapult, UnitType.Ram, UnitType.Skeid })
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

    [Fact]
    public void The_ram_is_a_slower_sturdier_catapult_with_the_same_siege_power()
    {
        var ram = UnitCatalogue.Get(UnitType.Ram);
        var catapult = UnitCatalogue.Get(UnitType.Catapult);

        Assert.Equal("ram", UnitType.Ram.ToWireName());
        Assert.Equal(UnitClass.Siege, ram.Class);
        Assert.Equal(10, ram.Attack);
        Assert.Equal(30, ram.Defense);
        Assert.Equal(1.0, ram.Speed);
        Assert.True(ram.Speed < catapult.Speed);
        Assert.Equal(catapult.SiegePower, ram.SiegePower);
        Assert.Equal(0, ram.CarryCapacity);
        Assert.Equal(1.5, ram.UpkeepPerHour);
        Assert.Equal(new ResourceAmounts(Wood: 400, Stone: 100, Food: 40, Iron: 150), ram.TrainingCost);
        Assert.Equal(TimeSpan.FromHours(1), ram.TrainingDuration);
        Assert.Equal(UnitType.Berserker, ram.RequiredUnitType);
        Assert.Equal(BuildingType.SiegeWorkshop, ram.RequiredBuildingType);
    }

    [Fact]
    public void The_siege_workshop_trains_the_ram_and_the_archery_range_does_not()
    {
        // The ram needs a Siege Workshop standing (its Berserker prerequisite a Barracks); an Archery Range, which keeps
        // the bowman and the catapult, is not enough.
        int Standing(BuildingType trains, BuildingType t) => t == trains || t == BuildingType.Barracks ? 1 : 0;

        Assert.False(UnitCatalogue.IsAvailable(UnitType.Ram, 20, t => Standing(BuildingType.ArcheryRange, t)));
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Ram, 20, t => Standing(BuildingType.SiegeWorkshop, t)));
        Assert.False(UnitCatalogue.IsAvailable(UnitType.Catapult, 20, t => Standing(BuildingType.ArcheryRange, t)));
        Assert.True(UnitCatalogue.IsAvailable(UnitType.Catapult, 20, t => Standing(BuildingType.SiegeWorkshop, t)));
    }

    [Fact]
    public void Siege_engines_carry_what_they_can_damage_and_nothing_else_does()
    {
        Assert.Equal(SiegeTargets.Towers | SiegeTargets.Buildings, UnitCatalogue.Get(UnitType.Catapult).SiegeTargets);
        Assert.Equal(SiegeTargets.Walls | SiegeTargets.Towers, UnitCatalogue.Get(UnitType.Ram).SiegeTargets);
        foreach (var type in UnitCatalogue.AllTypes.Where(t => UnitCatalogue.Get(t).SiegePower == 0))
        {
            Assert.Equal(SiegeTargets.None, UnitCatalogue.Get(type).SiegeTargets);
        }
    }

    [Fact]
    public void Ships_do_no_siege_damage()
    {
        foreach (var type in UnitCatalogue.AllTypes.Where(t => UnitCatalogue.Get(t).Class == UnitClass.Ship))
        {
            Assert.Equal(0, UnitCatalogue.Get(type).SiegePower);
            Assert.Equal(SiegeTargets.None, UnitCatalogue.Get(type).SiegeTargets);
        }
    }

    [Fact]
    public void The_fire_ship_has_its_starting_numbers_and_is_a_slotless_hull_without_attack()
    {
        var fireShip = UnitCatalogue.Get(UnitType.FireHulk);

        Assert.Equal(UnitClass.Ship, fireShip.Class);
        Assert.Equal(0, fireShip.Attack);
        Assert.Equal(25, fireShip.Defense);
        Assert.Equal(8, fireShip.Speed);
        Assert.Equal(0, fireShip.ShipSlots);
        Assert.Equal(0, fireShip.CarryCapacity);
        Assert.Equal(200, fireShip.FoodCarryCapacity);
        Assert.Equal(5, fireShip.UpkeepPerHour);
        Assert.Equal(6, fireShip.VisionRadius);
        Assert.Equal(new ResourceAmounts(Wood: 300, Stone: 60, Food: 40, Iron: 80), fireShip.TrainingCost);
        Assert.Equal(TimeSpan.FromMinutes(40), fireShip.TrainingDuration);
        Assert.Equal("firehulk", UnitType.FireHulk.ToWireName());
    }

    [Fact]
    public void The_fire_hulk_needs_longhouse_12_and_a_level_5_shipyard()
    {
        Assert.Null(UnitCatalogue.Get(UnitType.FireHulk).RequiredUnitType);
        Assert.False(UnitCatalogue.IsAvailable(UnitType.FireHulk, 11));
        Assert.True(UnitCatalogue.IsAvailable(UnitType.FireHulk, 12));
        Assert.False(UnitCatalogue.IsAvailable(UnitType.FireHulk, 12, _ => 0));
        Assert.False(UnitCatalogue.IsAvailable(UnitType.FireHulk, 12, t => t == BuildingType.Shipyard ? 4 : 0));
        Assert.True(UnitCatalogue.IsAvailable(UnitType.FireHulk, 12, t => t == BuildingType.Shipyard ? 5 : 0));
    }

    [Fact]
    public void Fire_damage_is_data_per_craft_and_only_fire_craft_have_it()
    {
        Assert.Equal(10, UnitCatalogue.Get(UnitType.FireHulk).FireCraftPerLevel);
        Assert.Equal(50, UnitCatalogue.Get(UnitType.FireRaft).FireCraftPerLevel);
        foreach (var type in UnitCatalogue.AllTypes.Where(t => t is not (UnitType.FireHulk or UnitType.FireRaft)))
        {
            Assert.Equal(0, UnitCatalogue.Get(type).FireCraftPerLevel);
        }
    }

    [Fact]
    public void The_byrding_and_the_knarr_carry_cargo_but_no_troops_and_the_karve_is_the_troop_transport()
    {
        Assert.Equal(0, UnitCatalogue.Get(UnitType.Byrding).ShipSlots);
        Assert.Equal(0, UnitCatalogue.Get(UnitType.Knarr).ShipSlots);
        Assert.Equal(160, UnitCatalogue.Get(UnitType.Byrding).CarryCapacity);
        Assert.Equal(600, UnitCatalogue.Get(UnitType.Knarr).CarryCapacity);
        Assert.Equal(10, UnitCatalogue.Get(UnitType.Karve).ShipSlots);
    }

    [Theory]
    [InlineData(UnitType.Faering, 0, 3, 8, 7, 0, 40, 0.25, 6)]
    [InlineData(UnitType.Byrding, 0, 10, 6, 5, 160, 150, 0.5, 20)]
    [InlineData(UnitType.Knarr, 0, 20, 4, 5, 600, 1200, 1, 50)]
    [InlineData(UnitType.Skeid, 90, 60, 11, 4, 120, 480, 3, 120)]
    [InlineData(UnitType.FireRaft, 0, 3, 5, 2, 0, 30, 1, 10)]
    public void The_new_ships_have_the_stats_of_the_units_and_ships_table(
        UnitType type, int attack, int defense, double speed, int vision, int loot, int provisions, double upkeep, int minutes)
    {
        var d = UnitCatalogue.Get(type);

        Assert.Equal(attack, d.Attack);
        Assert.Equal(defense, d.Defense);
        Assert.Equal(speed, d.Speed);
        Assert.Equal(vision, d.VisionRadius);
        Assert.Equal(loot, d.CarryCapacity);
        Assert.Equal(provisions, d.FoodCarryCapacity);
        Assert.Equal(upkeep, d.UpkeepPerHour);
        Assert.Equal(TimeSpan.FromMinutes(minutes), d.TrainingDuration);
    }

    [Fact]
    public void The_renamed_ships_keep_their_stored_numbers_and_the_new_ones_are_appended()
    {
        Assert.Equal(8, (int)UnitType.Snekkja);
        Assert.Equal(11, (int)UnitType.FireHulk);
        Assert.Equal(13, (int)UnitType.Faering);
        Assert.Equal(14, (int)UnitType.Byrding);
        Assert.Equal(15, (int)UnitType.Knarr);
        Assert.Equal(16, (int)UnitType.Skeid);
        Assert.Equal(17, (int)UnitType.FireRaft);
        Assert.Equal(13, (int)BuildingType.Harbour);
        Assert.Equal(35, (int)BuildingType.Shipyard);
        Assert.Equal("snekkja", UnitType.Snekkja.ToWireName());
        Assert.Equal("fireraft", UnitType.FireRaft.ToWireName());
        Assert.Equal("harbour", BuildingType.Harbour.ToWireName());
        Assert.Equal("shipyard", BuildingType.Shipyard.ToWireName());
    }
}
