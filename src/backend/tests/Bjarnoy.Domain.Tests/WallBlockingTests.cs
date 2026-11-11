using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// <see cref="WallBlocking.FirstBlockingIn"/>: the instant a wall hex begins to block one army (<c>docs/design/troop-movement-range.md</c> §5),
/// on open grass. The army set out at <see cref="T0"/>.
/// </summary>
public sealed class WallBlockingTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly Guid Builder = Guid.NewGuid();
    private static readonly Guid Marcher = Guid.NewGuid();

    // A plain line (0,1)..(0,3) whose end (0,0) has stood since long before the army set out.
    private static readonly HexCoord End = new(0, 0);
    private static readonly HexCoord Next = new(0, -1);

    private static TimedWall Plain(HexCoord hex, DateTimeOffset from, DateTimeOffset? until = null) =>
        new(new StandingWall(hex, IsGate: false, Builder), from, until);

    private static IEnumerable<TimedWall> Line(DateTimeOffset from) =>
        Enumerable.Range(0, 4).Select(r => Plain(new HexCoord(0, r), from));

    private static WallBlocking Blocking(IEnumerable<TimedWall> walls, Func<Guid, Guid, bool>? areFriends = null) =>
        new(new WallTimeline(walls), _ => Terrain.Grass, _ => false, areFriends);

    [Fact]
    public void A_half_open_end_blocks_from_the_instant_the_next_piece_beside_it_stands()
    {
        var blocking = Blocking(Line(T0.AddHours(-10)).Append(Plain(Next, T0.AddHours(2))));

        Assert.Equal(T0.AddHours(2), blocking.FirstBlockingIn(End, Marcher, T0, T0.AddHours(6), T0, T0.AddHours(3)));

        // Entered before the next piece stood: never in the way. The new end beside it is half open and blocks nobody.
        Assert.Null(blocking.FirstBlockingIn(End, Marcher, T0, T0.AddHours(2), T0, T0.AddHours(3)));
        Assert.Null(blocking.FirstBlockingIn(Next, Marcher, T0, T0.AddHours(6), T0, T0.AddHours(3)));
    }

    [Fact]
    public void An_end_that_stays_an_end_never_blocks_and_a_middle_piece_blocks_from_its_own_instant()
    {
        var blocking = Blocking(Line(T0.AddHours(-10)).Append(Plain(new HexCoord(0, 4), T0.AddHours(1))));

        Assert.Null(blocking.FirstBlockingIn(End, Marcher, T0, T0.AddHours(6), T0, T0.AddHours(6)));
        // (0,3) was the far end until (0,4) stood beside it.
        Assert.Equal(T0.AddHours(1), blocking.FirstBlockingIn(new HexCoord(0, 3), Marcher, T0, T0.AddHours(6), T0, T0.AddHours(6)));
        // A middle piece that stood before the leg blocks from the start of the leg.
        Assert.Equal(T0, blocking.FirstBlockingIn(new HexCoord(0, 1), Marcher, T0, T0.AddHours(6), T0, T0.AddHours(6)));
    }

    [Fact]
    public void A_razed_wall_blocks_only_while_it_stands()
    {
        var blocking = Blocking([Plain(new HexCoord(5, 0), T0.AddHours(1), until: T0.AddHours(3))]);

        Assert.Equal(T0.AddHours(1), blocking.FirstBlockingIn(new HexCoord(5, 0), Marcher, T0, T0.AddHours(6), T0, T0.AddHours(6)));
        Assert.Null(blocking.FirstBlockingIn(new HexCoord(5, 0), Marcher, T0.AddHours(3), T0.AddHours(6), T0.AddHours(3), T0.AddHours(6)));
    }

    [Fact]
    public void A_gate_that_closed_without_an_instant_blocks_only_from_the_settle_instant_and_a_new_hostile_gate_from_its_own()
    {
        var old = new TimedWall(new StandingWall(new HexCoord(3, 0), IsGate: true, Builder), T0.AddHours(-10));
        var fresh = new TimedWall(new StandingWall(new HexCoord(6, 0), IsGate: true, Builder), T0.AddHours(2));
        var own = new TimedWall(new StandingWall(new HexCoord(8, 0), IsGate: true, Marcher), T0.AddHours(2));
        var blocking = Blocking([old, fresh, own], areFriends: (_, _) => false);
        var settledTo = T0.AddHours(5);

        // The friendship that opened the old gate ended some time before the settle: an army that passed it before then is not rewound.
        Assert.Null(blocking.FirstBlockingIn(old.Wall.Coord, Marcher, T0, T0.AddHours(4), T0, settledTo));
        Assert.Equal(settledTo, blocking.FirstBlockingIn(old.Wall.Coord, Marcher, T0, T0.AddHours(7), T0, settledTo));
        Assert.Equal(T0.AddHours(2), blocking.FirstBlockingIn(fresh.Wall.Coord, Marcher, T0, T0.AddHours(7), T0, settledTo));
        Assert.Null(blocking.FirstBlockingIn(own.Wall.Coord, Marcher, T0, T0.AddHours(7), T0, settledTo));
    }

    [Fact]
    public void The_rules_that_found_the_wall_block_it_at_that_instant_for_the_re_route()
    {
        var blocking = Blocking(Line(T0.AddHours(-10)).Append(Plain(Next, T0.AddHours(2))));
        var at = blocking.FirstBlockingIn(End, Marcher, T0, T0.AddHours(6), T0, T0.AddHours(3))!.Value;

        var rules = blocking.IndexAt(at).ForOwner(Marcher)!;
        Assert.True(rules.Blocked(End) && !rules.HalfOpen(End));
        Assert.True(blocking.IndexAt(at.AddTicks(-1)).IsHalfOpen(End));
    }

    [Fact]
    public void The_pre_check_skips_own_gates_and_pieces_whose_neighbourhood_did_not_change_since_the_route_was_planned()
    {
        var ownGate = new TimedWall(new StandingWall(new HexCoord(3, 0), IsGate: true, Marcher), T0.AddHours(1));
        var foreignGate = new TimedWall(new StandingWall(new HexCoord(6, 0), IsGate: true, Builder), T0.AddHours(-10));
        var timeline = new WallTimeline(Line(T0.AddHours(-10)).Append(Plain(Next, T0.AddHours(2))).Append(ownGate).Append(foreignGate));
        var now = T0.AddHours(3);

        // An own gate never blocks its owner's army, even one built after it set out: no terrain, river or guild read for it.
        Assert.False(timeline.MayBlock(ownGate.Wall.Coord, Marcher, T0, now));
        // Another owner's gate may have closed without a timestamp.
        Assert.True(timeline.MayBlock(foreignGate.Wall.Coord, Marcher, T0, now));
        // The old end (0,0) changed when (0,-1) stood beside it; the far end (0,3) did not change since long before.
        Assert.True(timeline.MayBlock(End, Marcher, T0, now));
        Assert.False(timeline.MayBlock(new HexCoord(0, 3), Marcher, T0, now));
        // Planned after the change, or asked before it: nothing to look at.
        Assert.False(timeline.MayBlock(End, Marcher, T0.AddHours(2), now));
        Assert.False(timeline.MayBlock(End, Marcher, T0, T0.AddHours(1)));
        Assert.False(timeline.MayBlock(new HexCoord(9, 9), Marcher, T0, now));
    }
}
