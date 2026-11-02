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
    public void Unknown_ramp_is_round_not_hexagonal()
    {
        // Every existing ramp test above walks the (d, 0) axis, where step
        // count and straight-line distance happen to agree — so none of them
        // can see the shape of the field at all. This one can: (4, 0) and
        // (2, 2) are both four steps from the origin, but (2, 2) lies between
        // two axes and is genuinely nearer in world space. A step-count ramp
        // gives them the same value, which is what puts six corners on every
        // contour and, once the client's edge shading is soft enough to show
        // it, a hexagon where the fog should read as a circle.
        var source = new FogVisionSource(HexCoord.Origin, ExploredRadius: 0, VisibleRadius: 0);
        var bounds = FogMaskLayout.WorldBounds(8);

        var mask = FogMaskGenerator.Generate(bounds, [source], new HashSet<HexCoord>(), Options);

        var alongAxis = mask[FogMaskLayout.ToTexel(new HexCoord(4, 0))].Unknown;
        var betweenAxes = mask[FogMaskLayout.ToTexel(new HexCoord(2, 2))].Unknown;

        Assert.Equal(4, HexCoord.Distance(HexCoord.Origin, new HexCoord(4, 0)));
        Assert.Equal(4, HexCoord.Distance(HexCoord.Origin, new HexCoord(2, 2)));
        Assert.True(
            betweenAxes < alongAxis,
            $"same step count should not mean the same ramp value: {betweenAxes} vs {alongAxis}");
    }

    [Fact]
    public void Unknown_ramp_is_a_function_of_straight_line_distance_alone()
    {
        // The stronger form of the test above, over every direction at once:
        // the baked value depends on euclidean distance and nothing else, so
        // the field is isotropic and its contours are circles. Radius 0 keeps
        // the ring out of it, leaving the ramp itself under test.
        var source = new FogVisionSource(HexCoord.Origin, ExploredRadius: 0, VisibleRadius: 0);
        var bounds = FogMaskLayout.WorldBounds(8);

        var mask = FogMaskGenerator.Generate(bounds, [source], new HashSet<HexCoord>(), Options);

        foreach (var hex in HexCoord.Origin.WithinRadius(8))
        {
            var distance = HexCoord.EuclideanDistance(hex, HexCoord.Origin);
            if (distance <= 0 || distance >= Options.UnknownMarginHexes)
            {
                continue;
            }

            var expected = (byte)Math.Round(255.0 * distance / Options.UnknownMarginHexes);
            Assert.Equal(expected, mask[FogMaskLayout.ToTexel(hex)].Unknown);
        }
    }

    [Fact]
    public void Explored_ring_is_never_clipped_by_the_round_ramp()
    {
        // Radii stay whole hexes while the ramp is measured in straight-line
        // units, which is only sound because every hex within a ring of
        // radius r sits at euclidean distance <= r. If that ever stopped
        // holding, hexes the player has explored would start picking up fog
        // at the ring's corners.
        const int radius = 5;
        var source = new FogVisionSource(HexCoord.Origin, ExploredRadius: radius, VisibleRadius: radius);
        var bounds = FogMaskLayout.WorldBounds(12);

        var mask = FogMaskGenerator.Generate(bounds, [source], new HashSet<HexCoord>(), Options);

        foreach (var hex in HexCoord.Origin.WithinRadius(radius))
        {
            Assert.Equal(0, mask[FogMaskLayout.ToTexel(hex)].Unknown);
            Assert.Equal(0, mask[FogMaskLayout.ToTexel(hex)].OutOfSight);
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

    // ---- Chunked generation (map-fog-v2.md §3) --------------------------------

    /// <summary>
    /// A world large enough to span several 64-texel chunks (radius 40:
    /// u in [-41, 42), v in [-81, 82) — chunks (-1..0) x (-2..1)), with vision
    /// sources placed on chunk seams and persisted history straddling them.
    /// </summary>
    private static (IReadOnlyList<FogVisionSource> Sources, HashSet<HexCoord> Explored) SeamWorld()
    {
        var sources = new List<FogVisionSource>
        {
            new(new HexCoord(0, 0), ExploredRadius: 3, VisibleRadius: 2),      // on the u = 0 and v = 0 seams
            new(new HexCoord(-1, 32), ExploredRadius: 4, VisibleRadius: 2),    // v = 2r + q = 63: the v = 64 seam
            new(new HexCoord(20, -20), ExploredRadius: 2, VisibleRadius: 1),
            new(new HexCoord(-30, 5), ExploredRadius: 5, VisibleRadius: 3),
            new(new HexCoord(35, -2), ExploredRadius: 3, VisibleRadius: 2),    // far from every other source
        };

        // History that crosses seams but is not a source ring: a walked strip.
        var explored = new HashSet<HexCoord>();
        for (var q = -6; q <= 6; q++)
        {
            explored.Add(new HexCoord(q, 30));
            explored.Add(new HexCoord(q, -30 - (q / 2)));
        }

        return (sources, explored);
    }

    /// <summary>The texel rectangle holding real world hexes (the padded WorldBounds ring excluded).</summary>
    private static bool InsideTightWorld(MaskBounds worldBounds, MaskTexel texel) =>
        texel.U >= worldBounds.MinU + 1 && texel.U <= worldBounds.MaxU - 2
        && texel.V >= worldBounds.MinV + 1 && texel.V <= worldBounds.MaxV - 2;

    [Fact]
    public void Every_chunk_equals_the_matching_window_of_the_whole_world_mask_so_there_are_no_seams()
    {
        const int radius = 40;
        var (sources, explored) = SeamWorld();
        var worldBounds = FogMaskLayout.WorldBounds(radius);
        var whole = FogMaskGenerator.Generate(worldBounds, sources, explored, Options);

        var (min, max) = FogChunkLayout.WorldChunkRange(radius);
        Assert.True((max.U - min.U + 1) * (max.V - min.V + 1) >= 6, "the test world must be multi-chunk");

        var compared = 0;
        for (var cv = min.V; cv <= max.V; cv++)
        {
            for (var cu = min.U; cu <= max.U; cu++)
            {
                var chunk = new FogChunkCoord(cu, cv);
                var bounds = FogChunkLayout.Bounds(chunk);

                // The real delivery path: halo-filtered sources, explored as a lookup.
                var halo = FogMaskGenerator.SourcesAffecting(bounds, sources, Options);
                var mask = FogMaskGenerator.GenerateWindow(bounds, halo, explored.Contains, Options);

                Assert.Equal(bounds, mask.Bounds);
                for (var v = bounds.MinV; v < bounds.MaxV; v++)
                {
                    for (var u = bounds.MinU; u < bounds.MaxU; u++)
                    {
                        var texel = new MaskTexel(u, v);
                        if (!InsideTightWorld(worldBounds, texel))
                        {
                            continue;
                        }

                        Assert.Equal(whole[texel], mask[texel]);
                        compared++;
                    }
                }
            }
        }

        // 81 x 163 texels of real world, every one of them compared.
        Assert.Equal(((2 * radius) + 1) * ((4 * radius) + 1), compared);
    }

    [Fact]
    public void The_source_halo_drops_far_sources_without_changing_a_single_texel()
    {
        var (sources, explored) = SeamWorld();
        var bounds = FogChunkLayout.Bounds(new FogChunkCoord(0, 1));

        var halo = FogMaskGenerator.SourcesAffecting(bounds, sources, Options);
        var withHalo = FogMaskGenerator.GenerateWindow(bounds, halo, explored.Contains, Options);
        var withAll = FogMaskGenerator.GenerateWindow(bounds, sources, explored.Contains, Options);

        Assert.True(halo.Count < sources.Count, "the halo must actually filter something");
        Assert.Equal(withAll.Cells, withHalo.Cells);
    }

    [Fact]
    public void A_source_just_outside_a_chunk_still_shades_its_edge_but_one_beyond_reach_does_not()
    {
        var chunk = new FogChunkCoord(0, 0);
        var bounds = FogChunkLayout.Bounds(chunk);

        // Texel u = 64 is the first column of chunk (1, 0); a hex there sits
        // one column outside. Radius 3 + margin 4 reaches back into the chunk.
        var near = new FogVisionSource(FogMaskLayout.ToHex(new MaskTexel(64, 0)), 3, 2);
        var far = new FogVisionSource(FogMaskLayout.ToHex(new MaskTexel(64 + 40, 0)), 3, 2);

        Assert.Contains(near, FogMaskGenerator.SourcesAffecting(bounds, [near, far], Options));
        Assert.DoesNotContain(far, FogMaskGenerator.SourcesAffecting(bounds, [near, far], Options));

        var mask = FogMaskGenerator.GenerateWindow(bounds, [near], _ => false, Options);
        Assert.True(mask[new MaskTexel(63, 0)].Unknown < 255, "edge column must be shaded by the neighbouring source");
    }

    [Fact]
    public void Explored_history_in_the_neighbouring_chunk_shades_this_chunks_interpolation_border()
    {
        // No sources at all: the only signal is one explored hex just across
        // the seam. The odd-parity texel next to it, on this side, must show it.
        var explored = FogMaskLayout.ToHex(new MaskTexel(64, 0));
        var bounds = FogChunkLayout.Bounds(new FogChunkCoord(0, 0));

        var mask = FogMaskGenerator.GenerateWindow(bounds, [], h => h == explored, Options);

        Assert.True(mask[new MaskTexel(63, 0)].Unknown < 255);
    }

    [Fact]
    public void Generating_from_a_lookup_equals_generating_from_a_set()
    {
        var (sources, explored) = SeamWorld();
        var bounds = FogMaskLayout.WorldBounds(12);

        var fromSet = FogMaskGenerator.Generate(bounds, sources, explored, Options);
        var fromLookup = FogMaskGenerator.Generate(bounds, sources, explored.Contains, Options);

        Assert.Equal(fromSet.Cells, fromLookup.Cells);
    }
}
