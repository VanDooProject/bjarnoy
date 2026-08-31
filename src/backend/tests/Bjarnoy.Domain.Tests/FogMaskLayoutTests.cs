using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class FogMaskLayoutTests
{
    [Fact]
    public void ToTexel_lands_every_hex_on_an_even_parity_texel()
    {
        foreach (var hex in HexCoord.Origin.WithinRadius(15))
        {
            var texel = FogMaskLayout.ToTexel(hex);
            Assert.True(FogMaskLayout.IsHexTexel(texel));
        }
    }

    [Fact]
    public void ToTexel_and_ToHex_round_trip()
    {
        foreach (var hex in HexCoord.Origin.WithinRadius(15))
        {
            var texel = FogMaskLayout.ToTexel(hex);
            Assert.Equal(hex, FogMaskLayout.ToHex(texel));
        }
    }

    [Theory]
    [InlineData(0, 0, 0, 0)]
    [InlineData(1, 0, 1, 1)]
    [InlineData(2, 0, 2, 2)]
    [InlineData(-3, 0, -3, -3)]
    public void ToTexel_matches_the_doubled_row_formula(int q, int r, int expectedU, int expectedV)
    {
        var texel = FogMaskLayout.ToTexel(new HexCoord(q, r));
        Assert.Equal(new MaskTexel(expectedU, expectedV), texel);
    }

    [Fact]
    public void Adjacent_hexes_never_land_on_the_same_texel()
    {
        var seen = new HashSet<MaskTexel>();
        foreach (var hex in HexCoord.Origin.WithinRadius(10))
        {
            Assert.True(seen.Add(FogMaskLayout.ToTexel(hex)));
        }
    }

    [Fact]
    public void DiagonalNeighboursForInterpolation_returns_four_distinct_even_parity_texels()
    {
        // An odd-parity texel sits between four hexes.
        var oddTexel = new MaskTexel(1, 0);
        Assert.False(FogMaskLayout.IsHexTexel(oddTexel));

        var neighbours = FogMaskLayout.DiagonalNeighboursForInterpolation(oddTexel).ToList();

        Assert.Equal(4, neighbours.Count);
        Assert.Equal(4, neighbours.Distinct().Count());
        Assert.All(neighbours, FogMaskLayout.IsHexTexel);
    }

    [Fact]
    public void WorldBounds_covers_every_hex_in_the_radius_plus_its_interpolation_neighbours()
    {
        const int radius = 12;
        var bounds = FogMaskLayout.WorldBounds(radius);

        foreach (var hex in HexCoord.Origin.WithinRadius(radius))
        {
            var texel = FogMaskLayout.ToTexel(hex);
            Assert.True(bounds.Contains(texel));

            foreach (var neighbour in FogMaskLayout.DiagonalNeighboursForInterpolation(texel))
            {
                Assert.True(bounds.Contains(neighbour));
            }
        }
    }

    [Fact]
    public void WorldBounds_rejects_a_negative_radius()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => FogMaskLayout.WorldBounds(-1));
    }

    [Fact]
    public void MaskBounds_width_and_height_match_the_half_open_range()
    {
        var bounds = new MaskBounds(-2, -5, 3, 4);

        Assert.Equal(5, bounds.Width);
        Assert.Equal(9, bounds.Height);
        Assert.True(bounds.Contains(new MaskTexel(-2, -5)));
        Assert.False(bounds.Contains(new MaskTexel(3, -5)));
        Assert.False(bounds.Contains(new MaskTexel(-2, 4)));
    }
}
