using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class FogVisionRadiiTests
{
    // Golden values against the frontend formulas this ports
    // (WorldModel.ts:80,87,361-380): borderRadius = 2 + floor(level/2),
    // visibleRadius = borderRadius + 1, exploredRadius = borderRadius + 3.
    [Theory]
    [InlineData(0, 2, 3, 5)]
    [InlineData(1, 2, 3, 5)]
    [InlineData(2, 3, 4, 6)]
    [InlineData(3, 3, 4, 6)]
    [InlineData(10, 7, 8, 10)]
    public void Radii_match_the_frontends_formulas(
        int longhouseLevel, int expectedBorder, int expectedVisible, int expectedExplored)
    {
        Assert.Equal(expectedBorder, FogVisionRadii.BorderRadius(longhouseLevel));
        Assert.Equal(expectedVisible, FogVisionRadii.VisibleRadius(longhouseLevel));
        Assert.Equal(expectedExplored, FogVisionRadii.ExploredRadius(longhouseLevel));
    }

    [Fact]
    public void Explored_radius_is_always_wider_than_visible_radius()
    {
        for (var level = 0; level <= 30; level++)
        {
            Assert.True(FogVisionRadii.ExploredRadius(level) > FogVisionRadii.VisibleRadius(level));
        }
    }

    [Fact]
    public void Radii_never_shrink_as_level_increases()
    {
        var previousBorder = FogVisionRadii.BorderRadius(0);
        for (var level = 1; level <= 30; level++)
        {
            var border = FogVisionRadii.BorderRadius(level);
            Assert.True(border >= previousBorder);
            previousBorder = border;
        }
    }

    [Fact]
    public void Rejects_a_negative_level()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => FogVisionRadii.BorderRadius(-1));
    }

    [Fact]
    public void ToVisionSource_carries_the_coord_and_computed_radii()
    {
        var coord = new HexCoord(4, -1);

        var source = FogVisionRadii.ToVisionSource(coord, longhouseLevel: 3);

        Assert.Equal(coord, source.Coord);
        Assert.Equal(FogVisionRadii.ExploredRadius(3), source.ExploredRadius);
        Assert.Equal(FogVisionRadii.VisibleRadius(3), source.VisibleRadius);
    }
}
