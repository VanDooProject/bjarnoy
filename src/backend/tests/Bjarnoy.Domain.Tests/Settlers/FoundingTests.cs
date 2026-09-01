using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Settlers;

public class FoundingTests
{
    [Theory]
    [InlineData(0, 1)]
    [InlineData(1, 1)]
    [InlineData(2, 2)]
    [InlineData(3, 4)]
    [InlineData(4, 8)]
    public void CostMultiplier_roughly_doubles_per_existing_settlement(int existingCount, double expected)
    {
        Assert.Equal(expected, Founding.CostMultiplier(existingCount));
    }

    [Fact]
    public void ScaledSettlerCrewCost_applies_the_multiplier_to_the_catalogue_base_cost()
    {
        var baseCost = UnitCatalogue.Get(UnitType.SettlerCrew).TrainingCost;

        var scaled = Founding.ScaledSettlerCrewCost(existingSettlementCount: 3);

        Assert.Equal(baseCost.Wood * 4, scaled.Wood);
        Assert.Equal(baseCost.Iron * 4, scaled.Iron);
    }

    [Theory]
    [InlineData(UnitType.Karve, 1)]
    [InlineData(UnitType.Longship, 2)]
    [InlineData(UnitType.Spearman, 0)]
    public void ShipCapacity_matches_the_documented_figures(UnitType type, int expected)
    {
        Assert.Equal(expected, Founding.ShipCapacity(type));
    }

    [Fact]
    public void IsHexFoundable_is_true_when_no_settlement_is_claimed_nearby()
    {
        var target = new HexCoord(50, 50);

        Assert.True(Founding.IsHexFoundable(target, [], minimumSpacing: 3));
    }

    [Fact]
    public void IsHexFoundable_is_false_inside_another_settlements_claim()
    {
        var settlements = new[] { (Centre: new HexCoord(0, 0), ClaimRadius: 3) };

        // Distance 2, inside the claim radius entirely.
        Assert.False(Founding.IsHexFoundable(new HexCoord(2, 0), settlements, minimumSpacing: 3));
    }

    [Fact]
    public void IsHexFoundable_is_false_within_the_spacing_buffer_past_the_border()
    {
        var settlements = new[] { (Centre: new HexCoord(0, 0), ClaimRadius: 3) };

        // Distance 5: 2 hexes clear of the border, less than the required 3.
        Assert.False(Founding.IsHexFoundable(new HexCoord(5, 0), settlements, minimumSpacing: 3));
    }

    [Fact]
    public void IsHexFoundable_is_true_exactly_at_the_spacing_buffer()
    {
        var settlements = new[] { (Centre: new HexCoord(0, 0), ClaimRadius: 3) };

        // Distance 6: exactly 3 hexes clear of the border.
        Assert.True(Founding.IsHexFoundable(new HexCoord(6, 0), settlements, minimumSpacing: 3));
    }

    [Fact]
    public void IsHexFoundable_checks_every_settlement_not_just_the_nearest()
    {
        var settlements = new[]
        {
            (Centre: new HexCoord(0, 0), ClaimRadius: 1),
            (Centre: new HexCoord(20, 0), ClaimRadius: 3),
        };

        // Clear of the first settlement but inside the spacing buffer of the second.
        Assert.False(Founding.IsHexFoundable(new HexCoord(18, 0), settlements, minimumSpacing: 3));
    }
}
