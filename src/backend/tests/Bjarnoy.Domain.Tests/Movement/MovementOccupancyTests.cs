using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Movement;

public class MovementOccupancyTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private static Bjarnoy.Domain.Movement.Movement MakeMovement(
        DateTimeOffset departedAt, IReadOnlyList<HexCoord> path, IReadOnlyList<double> cumulativeHours) =>
        new()
        {
            DepartedAt = departedAt,
            Path = path,
            CumulativeHours = cumulativeHours,
            ReturnPath = path,
            ReturnCumulativeHours = cumulativeHours,
            TurnAroundAt = departedAt,
        };

    [Fact]
    public void Every_hex_except_the_last_has_a_closed_window_bounded_by_the_next_cumulative_hour()
    {
        var movement = MakeMovement(
            T0,
            [new HexCoord(0, 0), new HexCoord(1, 0), new HexCoord(2, 0)],
            [0, 1, 2]);

        var occupancy = MovementOccupancy.Compute(movement);

        Assert.Equal(T0, occupancy[0].Start);
        Assert.Equal(T0.AddHours(1), occupancy[0].End);
        Assert.Equal(T0.AddHours(1), occupancy[1].Start);
        Assert.Equal(T0.AddHours(2), occupancy[1].End);
    }

    [Fact]
    public void The_last_hex_of_any_path_has_an_open_ended_window()
    {
        var movement = MakeMovement(
            T0,
            [new HexCoord(0, 0), new HexCoord(1, 0), new HexCoord(2, 0)],
            [0, 1, 2]);

        var occupancy = MovementOccupancy.Compute(movement);

        Assert.Null(occupancy[^1].End);
    }

    [Fact]
    public void A_one_hex_stationary_holding_position_path_is_also_open_ended_from_departure()
    {
        var movement = MakeMovement(T0, [new HexCoord(5, 5)], [0]);

        var occupancy = MovementOccupancy.Compute(movement);

        Assert.Single(occupancy);
        Assert.Equal(T0, occupancy[0].Start);
        Assert.Null(occupancy[0].End);
    }

    [Fact]
    public void An_open_ended_blockade_is_repeatedly_intercepted_by_later_arrivals()
    {
        // Army A holds hex (3,0) forever starting at T0.
        var blockade = MakeMovement(T0, [new HexCoord(3, 0)], [0]);

        // Army B passes through the same hex hours later, long after T0.
        var passerBy = MakeMovement(
            T0.AddHours(10),
            [new HexCoord(2, 0), new HexCoord(3, 0), new HexCoord(4, 0)],
            [0, 1, 2]);

        var meeting = MovementOccupancy.EarliestMeeting(blockade, passerBy);

        Assert.NotNull(meeting);
        Assert.Equal(new HexCoord(3, 0), meeting!.Value.Hex);
        Assert.Equal(T0.AddHours(11), meeting.Value.At);

        // A second, later passer-by is intercepted again — the blockade's
        // window never closes, so this is not a one-shot detection.
        var secondPasserBy = MakeMovement(
            T0.AddHours(100),
            [new HexCoord(2, 0), new HexCoord(3, 0), new HexCoord(4, 0)],
            [0, 1, 2]);

        var secondMeeting = MovementOccupancy.EarliestMeeting(blockade, secondPasserBy);
        Assert.NotNull(secondMeeting);
        Assert.Equal(T0.AddHours(101), secondMeeting.Value.At);
    }

    [Fact]
    public void A_forced_retreat_walking_straight_through_a_blockade_hex_is_excluded_via_exclude_hex()
    {
        // The retreating army's own home hex should not itself trigger a new
        // interception even though it might coincide with a blockade
        // elsewhere on the map — callers pass home hex as excludeHex for the
        // retreating side.
        var blockadeHex = new HexCoord(3, 0);
        var blockade = MakeMovement(T0, [blockadeHex], [0]);

        var retreat = MakeMovement(
            T0.AddHours(5),
            [new HexCoord(2, 0), blockadeHex],
            [0, 1]);

        var meetingExcluded = MovementOccupancy.EarliestMeeting(blockade, retreat, excludeHexB: blockadeHex);
        Assert.Null(meetingExcluded);

        var meetingNotExcluded = MovementOccupancy.EarliestMeeting(blockade, retreat);
        Assert.NotNull(meetingNotExcluded);
    }

    [Fact]
    public void Overtaking_on_the_same_route_is_detected_as_a_meeting_on_the_shared_hex()
    {
        // Slow army departs first, moving 1 hex per 2 hours.
        var slow = MakeMovement(
            T0,
            [new HexCoord(0, 0), new HexCoord(1, 0), new HexCoord(2, 0)],
            [0, 2, 4]);

        // Faster army departs an hour later on the same route, moving twice
        // as fast, and catches up to (overtakes) the slow army mid-route.
        var fast = MakeMovement(
            T0.AddHours(1),
            [new HexCoord(0, 0), new HexCoord(1, 0), new HexCoord(2, 0)],
            [0, 1, 2]);

        // Exclude their shared home hex (0,0) — arrivals/departures there
        // aren't an interception (issue #206 §5) — isolating the actual
        // overtake further along the route.
        var meeting = MovementOccupancy.EarliestMeeting(
            slow, fast, excludeHexA: new HexCoord(0, 0), excludeHexB: new HexCoord(0, 0));

        Assert.NotNull(meeting);
        // Fast reaches hex (1,0) at T0+2h, exactly as slow arrives there too
        // — the earliest shared hex after departure.
        Assert.Equal(new HexCoord(1, 0), meeting!.Value.Hex);
        Assert.Equal(T0.AddHours(2), meeting.Value.At);
    }

    [Fact]
    public void Two_armies_crossing_the_same_edge_in_opposite_directions_never_meet()
    {
        // Edge-swap: A goes (0,0)->(1,0), B goes (1,0)->(0,0) at the same
        // instants. They cross paths on the edge but never share a hex at an
        // overlapping time.
        var a = MakeMovement(T0, [new HexCoord(0, 0), new HexCoord(1, 0)], [0, 1]);
        var b = MakeMovement(T0, [new HexCoord(1, 0), new HexCoord(0, 0)], [0, 1]);

        var meeting = MovementOccupancy.EarliestMeeting(a, b);

        Assert.Null(meeting);
    }

    [Fact]
    public void Non_overlapping_time_windows_on_the_same_hex_do_not_meet()
    {
        // a passes through (0,0) only during its closed window [T0, T0+1h)
        // before moving on to (1,0); b only ever visits (0,0), long after a
        // has left it, so the two never actually share the hex in time.
        var a = MakeMovement(T0, [new HexCoord(0, 0), new HexCoord(1, 0)], [0, 1]);
        var b = MakeMovement(T0.AddHours(5), [new HexCoord(0, 0)], [0]);

        var meeting = MovementOccupancy.EarliestMeeting(a, b);

        Assert.Null(meeting);
    }
}
