using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class HexOffsetsTests
{
    [Theory]
    [InlineData(0.0)]
    [InlineData(1.0)]
    [InlineData(5.55)]
    [InlineData(6.75)]
    public void Within_lists_exactly_the_offsets_inside_the_euclidean_radius_nearest_first(double radius)
    {
        var offsets = HexOffsets.Within(radius);

        // Brute force over a box that certainly covers the disc.
        var expected = HexCoord.Origin.WithinRadius(15)
            .Where(o => HexCoord.EuclideanDistance(o, HexCoord.Origin) <= radius)
            .ToHashSet();
        Assert.Equal(expected, offsets.Select(o => o.Offset).ToHashSet());
        Assert.Equal(offsets.Count, offsets.Select(o => o.Offset).Distinct().Count());
        Assert.All(offsets, o => Assert.Equal(HexCoord.EuclideanDistance(o.Offset, HexCoord.Origin), o.Distance));
        Assert.Equal(offsets.Select(o => o.Distance).Order(), offsets.Select(o => o.Distance));
        Assert.Equal(HexCoord.Origin, offsets[0].Offset);
    }

    [Fact]
    public void Within_is_not_the_hexagon_of_the_same_step_radius()
    {
        // 6 steps along an axis is 6.0 away, 6 steps between two axes (-3, 6) only 5.2: a 5.55 disc holds the second but not the first.
        var offsets = HexOffsets.Within(5.55).Select(o => o.Offset).ToHashSet();

        Assert.Contains(new HexCoord(-3, 6), offsets);
        Assert.DoesNotContain(new HexCoord(6, 0), offsets);
        Assert.DoesNotContain(new HexCoord(6, -1), offsets);
    }

    [Theory]
    [InlineData(5.55)]
    [InlineData(6.75)]
    public void ReachSteps_covers_every_offset_in_the_disc(double radius)
    {
        var steps = HexOffsets.ReachSteps(radius);

        Assert.True(HexOffsets.Within(radius).Max(o => HexCoord.Distance(o.Offset, HexCoord.Origin)) <= steps);
    }

    [Fact]
    public void Within_returns_the_same_shared_list_for_a_radius()
    {
        Assert.Same(HexOffsets.Within(5.55), HexOffsets.Within(5.55));
    }
}
