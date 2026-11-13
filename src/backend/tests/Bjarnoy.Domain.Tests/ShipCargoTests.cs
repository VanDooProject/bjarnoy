using Bjarnoy.Domain.Units;

namespace Bjarnoy.Domain.Tests;

public class ShipCargoTests
{
    [Theory]
    [InlineData(UnitType.Karve, 10)]
    [InlineData(UnitType.Snekkja, 20)]
    [InlineData(UnitType.Spearman, 0)]
    public void Ships_offer_the_documented_slots(UnitType type, int expected)
    {
        Assert.Equal(expected, UnitCatalogue.Get(type).ShipSlots);
    }

    [Theory]
    [InlineData(UnitType.Thrall, 1)]
    [InlineData(UnitType.Spearman, 1)]
    [InlineData(UnitType.Skirmisher, 1)]
    [InlineData(UnitType.Settler, 1)]
    [InlineData(UnitType.Bowman, 2)]
    [InlineData(UnitType.Axeman, 2)]
    [InlineData(UnitType.Provisioner, 2)]
    [InlineData(UnitType.Berserker, 3)]
    [InlineData(UnitType.Catapult, 10)]
    [InlineData(UnitType.Ram, 10)]
    [InlineData(UnitType.Karve, 0)]
    [InlineData(UnitType.Snekkja, 0)]
    public void Units_take_the_documented_slots(UnitType type, int expected)
    {
        Assert.Equal(expected, UnitCatalogue.Get(type).CargoSlots);
    }

    [Fact]
    public void Offered_and_needed_slots_are_counted_per_unit()
    {
        UnitStack[] stacks = [new(UnitType.Karve, 2), new(UnitType.Snekkja, 1), new(UnitType.Axeman, 3), new(UnitType.Ram, 1)];

        Assert.Equal(40, ShipCargo.SlotsOffered(stacks));
        Assert.Equal(16, ShipCargo.SlotsNeeded(stacks));
        Assert.Equal(2, ShipCargo.Ships(stacks).Count);
        Assert.Equal(2, ShipCargo.Passengers(stacks).Count);
    }

    [Fact]
    public void Pace_of_a_fleet_ignores_its_passengers()
    {
        Assert.Equal(8, ShipCargo.Pace([new(UnitType.Karve, 1), new(UnitType.Snekkja, 1), new(UnitType.Ram, 1)]));
        Assert.Equal(1.0, ShipCargo.Pace([new(UnitType.Spearman, 1), new(UnitType.Ram, 1)]));
        Assert.Equal(0, ShipCargo.Pace([]));
    }

    [Fact]
    public void A_fire_ship_is_a_ship_that_offers_no_slots_and_sets_the_pace_of_a_fleet_it_sails_with()
    {
        UnitStack[] stacks = [new(UnitType.Snekkja, 1), new(UnitType.FireHulk, 10)];

        Assert.True(ShipCargo.IsShip(UnitType.FireHulk));
        Assert.Equal(20, ShipCargo.SlotsOffered(stacks));
        Assert.Equal(8, ShipCargo.Pace(stacks));
        Assert.Equal(2, ShipCargo.Ships(stacks).Count);
    }

    [Fact]
    public void DropOverflow_keeps_everyone_when_the_ships_left_can_carry_them()
    {
        var (kept, drowned) = ShipCargo.DropOverflow([new(UnitType.Karve, 1)], [new(UnitType.Spearman, 10)]);

        Assert.Equal([new UnitStack(UnitType.Spearman, 10)], kept);
        Assert.Empty(drowned);
    }

    [Fact]
    public void DropOverflow_drowns_the_biggest_units_first_until_the_rest_fit()
    {
        // One Karve left (10 slots) for ram (10) + 3 berserkers (9) + 4 spearmen (4) = 23.
        var (kept, drowned) = ShipCargo.DropOverflow(
            [new(UnitType.Karve, 1)],
            [new(UnitType.Spearman, 4), new(UnitType.Berserker, 3), new(UnitType.Ram, 1)]);

        // Overflow 13: the ram (10) goes first, then one berserker (3).
        Assert.Equal(
            [new UnitStack(UnitType.Berserker, 1), new UnitStack(UnitType.Ram, 1)],
            drowned.OrderBy(d => d.Type).ToList());
        Assert.Equal(
            [new UnitStack(UnitType.Spearman, 4), new UnitStack(UnitType.Berserker, 2)],
            kept.ToList());
    }

    [Fact]
    public void DropOverflow_drowns_everyone_when_no_ship_is_left()
    {
        var (kept, drowned) = ShipCargo.DropOverflow([], [new(UnitType.Spearman, 3), new(UnitType.Axeman, 2)]);

        Assert.Empty(kept);
        Assert.Equal(5, drowned.Sum(s => s.Count));
    }
}
