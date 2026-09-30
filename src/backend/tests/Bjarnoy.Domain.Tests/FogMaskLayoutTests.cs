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
        Assert.All(neighbours, n => Assert.True(FogMaskLayout.IsHexTexel(n)));
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

    /// <summary>
    /// The pre-chunking implementation, kept here verbatim as the oracle for
    /// the closed form: it walked every hex of the disc (48M at radius 4000).
    /// </summary>
    private static MaskBounds BruteForceWorldBounds(int radius)
    {
        int minU = int.MaxValue, minV = int.MaxValue, maxU = int.MinValue, maxV = int.MinValue;
        foreach (var hex in HexCoord.Origin.WithinRadius(radius))
        {
            var texel = FogMaskLayout.ToTexel(hex);
            minU = Math.Min(minU, texel.U);
            minV = Math.Min(minV, texel.V);
            maxU = Math.Max(maxU, texel.U);
            maxV = Math.Max(maxV, texel.V);
        }

        return new MaskBounds(minU - 1, minV - 1, maxU + 2, maxV + 2);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(7)]
    [InlineData(16)]
    [InlineData(31)]
    [InlineData(60)]
    [InlineData(101)]
    public void WorldBounds_closed_form_equals_the_brute_force_hex_walk(int radius)
    {
        Assert.Equal(BruteForceWorldBounds(radius), FogMaskLayout.WorldBounds(radius));
    }

    [Fact]
    public void WorldBounds_at_radius_4000_is_computed_without_walking_the_world()
    {
        var bounds = FogMaskLayout.WorldBounds(4000);

        Assert.Equal(new MaskBounds(-4001, -8001, 4002, 8002), bounds);
        Assert.Equal(8003, bounds.Width);
        Assert.Equal(16003, bounds.Height);
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
