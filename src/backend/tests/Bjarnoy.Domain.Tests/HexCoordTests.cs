using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class HexCoordTests
{
    [Fact]
    public void Neighbours_returns_exactly_six_hexes_all_at_distance_one()
    {
        var centre = new HexCoord(3, -7);

        var neighbours = centre.Neighbours();

        // The legacy Island.getNeighbors walked the 3x3 square and returned
        // eight, two of them at distance 2. Guard against reintroducing that.
        Assert.Equal(6, neighbours.Length);
        Assert.Equal(6, neighbours.Distinct().Count());
        Assert.All(neighbours, n => Assert.Equal(1, centre.DistanceTo(n)));
    }

    [Fact]
    public void Distance_is_symmetric_and_zero_to_self()
    {
        var a = new HexCoord(-4, 9);
        var b = new HexCoord(11, -2);

        Assert.Equal(0, a.DistanceTo(a));
        Assert.Equal(HexCoord.Distance(a, b), HexCoord.Distance(b, a));
    }

    [Theory]
    [InlineData(0, 0, 0)]
    [InlineData(1, 0, 1)]
    [InlineData(-3, 3, 3)]
    [InlineData(2, -5, 5)]
    [InlineData(4, 4, 8)]
    public void Distance_from_origin_matches_cube_distance(int q, int r, int expected)
    {
        Assert.Equal(expected, HexCoord.Origin.DistanceTo(new HexCoord(q, r)));
    }

    [Fact]
    public void Cube_axes_always_sum_to_zero()
    {
        foreach (var coord in HexCoord.Origin.WithinRadius(8))
        {
            Assert.Equal(0, coord.Q + coord.R + coord.S);
        }
    }

    [Theory]
    [InlineData(0, 3 * 0 * 1 + 1)]
    [InlineData(1, (3 * 1 * 2) + 1)]
    [InlineData(2, (3 * 2 * 3) + 1)]
    [InlineData(5, (3 * 5 * 6) + 1)]
    public void WithinRadius_yields_the_hex_number_for_that_radius(int radius, int expected)
    {
        var hexes = HexCoord.Origin.WithinRadius(radius).ToList();

        Assert.Equal(expected, hexes.Count);
        Assert.Equal(expected, hexes.Distinct().Count());
        Assert.All(hexes, h => Assert.True(HexCoord.Origin.DistanceTo(h) <= radius));
    }

    [Fact]
    public void WithinRadius_rejects_a_negative_radius()
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => HexCoord.Origin.WithinRadius(-1).ToList());
    }

    [Fact]
    public void OddQ_offset_conversion_round_trips_including_negative_columns()
    {
        foreach (var coord in HexCoord.Origin.WithinRadius(20))
        {
            Assert.Equal(coord, HexCoord.FromOddQ(coord.ToOddQ()));
        }
    }

    [Theory]
    [InlineData(0, 0, 0, 0)]
    [InlineData(1, 0, 1, 0)]
    [InlineData(2, 0, 2, 1)]
    [InlineData(-3, 0, -3, -2)]
    [InlineData(-4, 1, -4, -1)]
    public void ToOddQ_matches_the_frontends_axialToOddQ(int q, int r, int col, int row)
    {
        Assert.Equal(new OffsetCoord(col, row), new HexCoord(q, r).ToOddQ());
    }

    [Fact]
    public void Default_value_is_the_origin_and_compares_equal()
    {
        // The legacy EntityId-style byte[] wrapper threw on `default`; a record
        // struct must not.
        HexCoord defaulted = default;

        Assert.Equal(HexCoord.Origin, defaulted);
        Assert.Equal(HexCoord.Origin.GetHashCode(), defaulted.GetHashCode());
        Assert.Equal("(0|0)", defaulted.ToString());
    }

    [Fact]
    public void Addition_and_subtraction_are_inverses()
    {
        var a = new HexCoord(5, -2);
        var b = new HexCoord(-3, 7);

        Assert.Equal(a, a + b - b);
    }
}
