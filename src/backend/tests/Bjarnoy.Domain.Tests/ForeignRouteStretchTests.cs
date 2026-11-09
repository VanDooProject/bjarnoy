using Leg = Bjarnoy.Domain.Movement.Movement;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Sight and the visible stretch of a foreign army's route (<c>docs/design/map-fog-v2.md</c> §1g).</summary>
public sealed class ForeignRouteStretchTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    /// <summary>Ten hexes along r = 0 (q = 0..9), centres on whole hours, edges on the half hour.</summary>
    private static Leg MakeLeg(DateTimeOffset? departedAt = null)
    {
        var path = Enumerable.Range(0, 10).Select(q => new HexCoord(q, 0)).ToList();
        double[] hours = [.. Enumerable.Range(0, 10).Select(i => (double)i)];
        double[] edges = [.. Enumerable.Range(0, 10).Select(i => i == 0 ? 0 : i - 0.5)];
        return Leg.Create(departedAt ?? T0, path, hours, edges, [.. path.AsEnumerable().Reverse()], hours, edges, 100, 1);
    }

    private static Func<HexCoord, bool> SightOf(int fromQ, int toQ) => hex => hex.Q >= fromQ && hex.Q <= toQ;

    [Fact]
    public void Sight_contains_a_hex_inside_any_disc_and_nothing_else()
    {
        SightDisc[] discs = [new(new HexCoord(0, 0), 2), new(new HexCoord(10, 0), 1)];

        Assert.True(Sight.Contains(discs, new HexCoord(2, 0)));
        Assert.True(Sight.Contains(discs, new HexCoord(11, 0)));
        Assert.False(Sight.Contains(discs, new HexCoord(3, 0)));
        Assert.False(Sight.Contains([], new HexCoord(0, 0)));
    }

    [Fact]
    public void The_stretch_reaches_two_hexes_ahead_and_nothing_behind_the_leg_start()
    {
        // 4.2 h: on hex 4, the leg it travels starts at hex 4.
        var stretch = ForeignRouteStretch.Clip(MakeLeg(), T0.AddHours(4.2), _ => true);

        Assert.Equal([new HexCoord(4, 0), new HexCoord(5, 0), new HexCoord(6, 0)], stretch.Path);
    }

    [Fact]
    public void Past_the_edge_but_before_the_next_centre_the_stretch_starts_at_the_hex_being_left()
    {
        // 4.7 h: stands on hex 5 (edge crossed at 4.5) but the marker is still drawn between the centres of hex 4 and 5.
        var stretch = ForeignRouteStretch.Clip(MakeLeg(), T0.AddHours(4.7), _ => true);

        Assert.Equal([new HexCoord(4, 0), new HexCoord(5, 0), new HexCoord(6, 0), new HexCoord(7, 0)], stretch.Path);
    }

    [Fact]
    public void The_stretch_ends_after_the_first_hex_out_of_sight()
    {
        // 4.2 h: hexes up to q = 5 are in sight; hex 6 is the one extra, hex 7 stays unknown.
        var stretch = ForeignRouteStretch.Clip(MakeLeg(), T0.AddHours(4.2), SightOf(0, 5));

        Assert.Equal([new HexCoord(4, 0), new HexCoord(5, 0), new HexCoord(6, 0)], stretch.Path);

        var tight = ForeignRouteStretch.Clip(MakeLeg(), T0.AddHours(4.2), SightOf(0, 4));
        Assert.Equal([new HexCoord(4, 0), new HexCoord(5, 0)], tight.Path);
    }

    [Fact]
    public void The_stretch_is_rebased_to_its_own_start_and_keeps_the_schedule()
    {
        var stretch = ForeignRouteStretch.Clip(MakeLeg(), T0.AddHours(4.2), _ => true);

        Assert.Equal(T0.AddHours(4), stretch.DepartedAt);
        Assert.Equal(T0.AddHours(6), stretch.ArrivesAt);
        Assert.Equal([0d, 1d, 2d], stretch.CumulativeHours);
        Assert.Equal([0d, 0.5, 1.5], stretch.EdgeHours);
    }

    [Fact]
    public void The_stretch_stops_at_the_end_of_the_leg()
    {
        var stretch = ForeignRouteStretch.Clip(MakeLeg(), T0.AddHours(8.2), _ => true);

        Assert.Equal([new HexCoord(8, 0), new HexCoord(9, 0)], stretch.Path);
        Assert.Equal(T0.AddHours(9), stretch.ArrivesAt);
    }

    [Fact]
    public void A_departing_army_starts_at_the_first_hex()
    {
        var stretch = ForeignRouteStretch.Clip(MakeLeg(), T0.AddHours(-1), _ => true);

        Assert.Equal([new HexCoord(0, 0), new HexCoord(1, 0), new HexCoord(2, 0)], stretch.Path);
        Assert.Equal(T0, stretch.DepartedAt);
    }

    [Fact]
    public void The_rebased_stretch_places_the_army_where_the_full_leg_does()
    {
        var movement = MakeLeg();
        foreach (var hours in new[] { 0.0, 2.3, 4.2, 4.7, 7.9 })
        {
            var now = T0.AddHours(hours);
            var stretch = ForeignRouteStretch.Clip(movement, now, _ => true);
            var rebased = Leg.Create(
                stretch.DepartedAt, stretch.Path, stretch.CumulativeHours, stretch.EdgeHours,
                stretch.Path, stretch.CumulativeHours, stretch.EdgeHours, 100, 1);

            Assert.Equal(movement.PositionAt(now), rebased.PositionAt(now));
        }
    }
}
