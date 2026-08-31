using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class FogMaskGeneratorTests
{
    private static readonly FogMaskOptions Options = new()
    {
        UnknownMarginHexes = 4,
        OutOfSightMarginHexes = 2,
    };

    [Fact]
    public void No_sources_and_no_history_bakes_a_fully_fogged_mask()
    {
        var bounds = FogMaskLayout.WorldBounds(3);

        var mask = FogMaskGenerator.Generate(bounds, [], new HashSet<HexCoord>(), Options);

        foreach (var hex in HexCoord.Origin.WithinRadius(3))
        {
            var cell = mask[FogMaskLayout.ToTexel(hex)];
            Assert.Equal(255, cell.Unknown);
            Assert.Equal(255, cell.OutOfSight);
        }
    }

    [Fact]
    public void A_source_hex_is_fully_revealed_and_fully_visible()
    {
        var source = new FogVisionSource(HexCoord.Origin, ExploredRadius: 3, VisibleRadius: 1);
        var bounds = FogMaskLayout.WorldBounds(6);

        var mask = FogMaskGenerator.Generate(bounds, [source], new HashSet<HexCoord>(), Options);

        var cell = mask[FogMaskLayout.ToTexel(HexCoord.Origin)];
        Assert.Equal(0, cell.Unknown);
        Assert.Equal(0, cell.OutOfSight);
    }

    [Fact]
    public void Unknown_ramp_saturates_to_fully_fogged_beyond_the_margin()
    {
        var source = new FogVisionSource(HexCoord.Origin, ExploredRadius: 1, VisibleRadius: 0);
        var bounds = FogMaskLayout.WorldBounds(10);

        var mask = FogMaskGenerator.Generate(bounds, [source], new HashSet<HexCoord>(), Options);

        // Well past ExploredRadius (1) + UnknownMarginHexes (4).
        var far = new HexCoord(9, 0);
        var cell = mask[FogMaskLayout.ToTexel(far)];
        Assert.Equal(255, cell.Unknown);
    }

    [Fact]
    public void Unknown_ramp_is_monotonic_with_distance_past_the_ring()
    {
        var source = new FogVisionSource(HexCoord.Origin, ExploredRadius: 0, VisibleRadius: 0);
        var bounds = FogMaskLayout.WorldBounds(6);

        var mask = FogMaskGenerator.Generate(bounds, [source], new HashSet<HexCoord>(), Options);

        byte? previous = null;
        for (var d = 0; d <= Options.UnknownMarginHexes + 1; d++)
        {
            var hex = new HexCoord(d, 0);
            var value = mask[FogMaskLayout.ToTexel(hex)].Unknown;
            if (previous is not null)
            {
                Assert.True(value >= previous, $"ramp decreased at distance {d}: {value} < {previous}");
            }

            previous = value;
        }
    }

    [Fact]
    public void Two_sources_take_the_nearer_ones_ramp_value()
    {
        var near = new FogVisionSource(new HexCoord(-3, 0), ExploredRadius: 0, VisibleRadius: 0);
        var far = new FogVisionSource(new HexCoord(20, 0), ExploredRadius: 0, VisibleRadius: 0);
        var bounds = FogMaskLayout.WorldBounds(8);
        var target = HexCoord.Origin;

        // Sanity: the near source alone must produce a non-saturated ramp
        // value here, or this test can't tell "picked the merge" apart from
        // "both happen to saturate to 255."
        Assert.True(
            FogMaskGenerator
                .Generate(bounds, [near], new HashSet<HexCoord>(), Options)[FogMaskLayout.ToTexel(target)]
                .Unknown is > 0 and < 255);

        var withBoth = FogMaskGenerator.Generate(bounds, [near, far], new HashSet<HexCoord>(), Options);
        var withNearOnly = FogMaskGenerator.Generate(bounds, [near], new HashSet<HexCoord>(), Options);

        Assert.Equal(
            withNearOnly[FogMaskLayout.ToTexel(target)].Unknown,
            withBoth[FogMaskLayout.ToTexel(target)].Unknown);
    }

    [Fact]
    public void Persisted_history_forces_unknown_to_zero_even_far_from_any_source()
    {
        var bounds = FogMaskLayout.WorldBounds(6);
        var farHex = new HexCoord(6, 0);
        var history = new HashSet<HexCoord> { farHex };

        var mask = FogMaskGenerator.Generate(bounds, [], history, Options);

        Assert.Equal(0, mask[FogMaskLayout.ToTexel(farHex)].Unknown);
    }

    [Fact]
    public void Persisted_history_does_not_affect_the_out_of_sight_channel()
    {
        // §1e: history changes what counts as "explored at all" (unknown
        // ramp), not "currently visible" (out-of-sight ramp) — walking
        // through a hex once doesn't keep it lit forever.
        var bounds = FogMaskLayout.WorldBounds(6);
        var farHex = new HexCoord(6, 0);
        var history = new HashSet<HexCoord> { farHex };

        var mask = FogMaskGenerator.Generate(bounds, [], history, Options);

        Assert.Equal(255, mask[FogMaskLayout.ToTexel(farHex)].OutOfSight);
    }

    [Fact]
    public void Interpolation_texel_averages_its_four_hex_neighbours()
    {
        var source = new FogVisionSource(HexCoord.Origin, ExploredRadius: 5, VisibleRadius: 5);
        var bounds = FogMaskLayout.WorldBounds(6);

        var mask = FogMaskGenerator.Generate(bounds, [source], new HashSet<HexCoord>(), Options);

        var oddTexel = FogMaskLayout.ToTexel(HexCoord.Origin) with { U = FogMaskLayout.ToTexel(HexCoord.Origin).U + 1 };
        Assert.False(FogMaskLayout.IsHexTexel(oddTexel));

        var neighbours = FogMaskLayout.DiagonalNeighboursForInterpolation(oddTexel)
            .Select(n => mask[n])
            .ToList();
        var expectedUnknown = (byte)neighbours.Average(c => c.Unknown);

        var actual = mask[oddTexel];
        Assert.InRange(actual.Unknown, (byte)Math.Max(0, expectedUnknown - 1), (byte)Math.Min(255, expectedUnknown + 1));
    }

    [Fact]
    public void Same_hex_always_gets_the_same_noise_seed()
    {
        var bounds = FogMaskLayout.WorldBounds(4);

        var first = FogMaskGenerator.Generate(bounds, [], new HashSet<HexCoord>(), Options);
        var second = FogMaskGenerator.Generate(bounds, [], new HashSet<HexCoord>(), Options);

        foreach (var hex in HexCoord.Origin.WithinRadius(4))
        {
            var texel = FogMaskLayout.ToTexel(hex);
            Assert.Equal(first[texel].NoiseSeed, second[texel].NoiseSeed);
        }
    }
}
