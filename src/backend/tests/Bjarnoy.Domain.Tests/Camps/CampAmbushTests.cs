using Bjarnoy.Domain.World;
using MovementRecord = Bjarnoy.Domain.Movement.Movement;

namespace Bjarnoy.Domain.Tests.Camps;

public class CampAmbushTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    // A strong L1 camp guards 3 hexes.
    private static Camp CampAt(int q, int r = 0, int level = 1) =>
        new(new HexCoord(q, r), CampFamilies.Wolfden, level, TileOrientation.E);

    private static (Camp, CampState) Pristine(Camp camp) => (camp, CampState.Pristine(camp, T0.AddDays(-10)));

    private static List<HexCoord> Line(int from, int to)
    {
        var step = from <= to ? 1 : -1;
        var hexes = new List<HexCoord>();
        for (var q = from; q != to + step; q += step)
        {
            hexes.Add(new HexCoord(q, 0));
        }

        return hexes;
    }

    private static List<double> Hours(int count) => [.. Enumerable.Range(0, count).Select(i => (double)i)];

    /// <summary>Out along q 0..20 at one hex per hour, home again from <paramref name="turnAt"/>.</summary>
    private static MovementRecord OutAndBack(double turnAtHours = 20, bool immune = false, bool returning = false) => new()
    {
        DepartedAt = T0,
        Path = Line(0, 20),
        CumulativeHours = Hours(21),
        ReturnPath = Line(20, 0),
        ReturnCumulativeHours = Hours(21),
        TurnAroundAt = T0.AddHours(turnAtHours),
        IsReturning = returning,
        RetreatImmune = immune,
    };

    private static CampAmbushHit? Find(
        MovementRecord m, IEnumerable<(Camp, CampState)> camps, HexCoord? exempt = null,
        DateTimeOffset? from = null, DateTimeOffset? until = null) =>
        CampAmbush.FindEarliest(m, camps, _ => false, exempt, from ?? T0.AddHours(-1), until ?? T0.AddDays(2));

    [Fact]
    public void Ambush_happens_at_the_first_hex_inside_the_guard_range()
    {
        var hit = Find(OutAndBack(), [Pristine(CampAt(10))]);

        Assert.NotNull(hit);
        Assert.Equal(T0.AddHours(7), hit.Value.At); // distance 3 at q = 7
        Assert.Equal(new HexCoord(7, 0), hit.Value.Hex);
    }

    [Fact]
    public void Earliest_camp_wins_across_several()
    {
        var hit = Find(OutAndBack(), [Pristine(CampAt(16)), Pristine(CampAt(10))]);
        Assert.Equal(new HexCoord(10, 0), hit!.Value.Camp.Coord);
    }

    [Fact]
    public void Simultaneous_entries_go_to_the_lowest_q_then_r()
    {
        var hit = Find(OutAndBack(), [Pristine(CampAt(10, 2)), Pristine(CampAt(10, -2)), Pristine(CampAt(10, 0))]);
        Assert.Equal(T0.AddHours(7), hit!.Value.At.AddHours(0));
        Assert.Equal(new HexCoord(10, -2), hit.Value.Camp.Coord);
    }

    [Fact]
    public void The_exempt_camp_is_skipped()
    {
        var hit = Find(OutAndBack(), [Pristine(CampAt(10))], exempt: new HexCoord(10, 0));
        Assert.Null(hit);
    }

    [Fact]
    public void A_calm_camp_does_not_ambush()
    {
        var camp = CampAt(10);
        var calm = CampState.Pristine(camp, T0.AddDays(-1)).AfterFight(camp, T0.AddHours(-1), new CampGarrison(2, 3, 0));
        // calm until T0 + 23h: the outbound entry at 7h is calm, the return entry at 27h would not be.
        Assert.Null(Find(OutAndBack(), [(camp, calm)], until: T0.AddHours(20)));
        Assert.Equal(T0.AddHours(27), Find(OutAndBack(), [(camp, calm)])!.Value.At);
    }

    [Fact]
    public void A_camp_whose_calm_ends_mid_march_ambushes_when_the_army_enters()
    {
        var camp = CampAt(10);
        var state = CampState.Pristine(camp, T0.AddDays(-1)).AfterFight(camp, T0.AddHours(-20), new CampGarrison(2, 3, 0));
        // calm until T0 + 4h; entry at 7h
        var hit = Find(OutAndBack(), [(camp, state)]);
        Assert.Equal(T0.AddHours(7), hit!.Value.At);
    }

    [Fact]
    public void A_weak_camp_does_not_ambush()
    {
        var weak = new Camp(new HexCoord(10, 0), CampFamilies.Harewarren, 1, TileOrientation.E);
        Assert.Null(Find(OutAndBack(), [(weak, CampState.Pristine(weak, T0.AddDays(-1)))]));
    }

    [Fact]
    public void A_cleared_camp_inside_a_realm_does_not_ambush()
    {
        var camp = CampAt(10);
        var cleared = CampState.Pristine(camp, T0.AddDays(-5)).AfterFight(camp, T0.AddDays(-4), CampGarrison.Empty);
        var hit = CampAmbush.FindEarliest(OutAndBack(), [(camp, cleared)], _ => true, null, T0.AddHours(-1), T0.AddDays(2));
        Assert.Null(hit);
    }

    [Fact]
    public void A_retreat_immune_movement_is_never_ambushed()
    {
        Assert.Null(Find(OutAndBack(immune: true), [Pristine(CampAt(10))]));
    }

    [Fact]
    public void Entries_at_or_before_from_were_already_processed()
    {
        var camps = new[] { Pristine(CampAt(10)) };
        Assert.Null(Find(OutAndBack(turnAtHours: 8), camps, from: T0.AddHours(7), until: T0.AddHours(8)));
        Assert.NotNull(Find(OutAndBack(), camps, from: T0.AddHours(6.9), until: T0.AddHours(7)));
    }

    [Fact]
    public void Entries_after_until_are_not_yet_happening()
    {
        Assert.Null(Find(OutAndBack(), [Pristine(CampAt(10))], until: T0.AddHours(6.5)));
    }

    [Fact]
    public void Starting_inside_the_range_ambushes_at_the_span_start()
    {
        var movement = OutAndBack();
        var hit = Find(movement, [Pristine(CampAt(2))]);
        Assert.Equal(T0, hit!.Value.At);
        Assert.Equal(new HexCoord(0, 0), hit.Value.Hex);
    }

    [Fact]
    public void Return_leg_is_timed_from_the_turn_around_and_can_ambush_a_camp_the_outbound_leg_missed()
    {
        // Camp near the destination's far side is only reached on the way home: out stops at q=5, camp at q=0 range 3.
        var camp = CampAt(-2);
        var movement = new MovementRecord
        {
            DepartedAt = T0,
            Path = Line(6, 10),
            CumulativeHours = Hours(5),
            ReturnPath = Line(10, -1),
            ReturnCumulativeHours = Hours(12),
            TurnAroundAt = T0.AddHours(10),
        };

        var hit = Find(movement, [Pristine(camp)]);

        // home leg starts at q=10 at T0+10h; q = 1 (distance 3 to -2) is reached after 9 steps.
        Assert.Equal(T0.AddHours(19), hit!.Value.At);
        Assert.Equal(new HexCoord(1, 0), hit.Value.Hex);
    }

    [Fact]
    public void A_returning_movement_walks_only_its_own_path()
    {
        var movement = OutAndBack(returning: true) with { ReturnPath = Line(20, 0) };
        // As the return leg itself, only Path counts (0..20); camp at 10 still enters at 7h.
        var hit = Find(movement, [Pristine(CampAt(10))]);
        Assert.Equal(T0.AddHours(7), hit!.Value.At);
    }

    [Fact]
    public void Staying_inside_one_range_is_a_single_entry_across_the_turn_around()
    {
        // The army stands in range at the destination and walks home through it: no second ambush window.
        var camp = CampAt(10);
        var movement = OutAndBack(turnAtHours: 25);
        var first = Find(movement, [Pristine(camp)]);
        Assert.Equal(T0.AddHours(7), first!.Value.At);
        var afterwards = Find(movement, [Pristine(camp)], from: T0.AddHours(7), until: T0.AddHours(30));
        Assert.Null(afterwards);
    }
}
