using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;
using static Bjarnoy.Domain.Tests.ArmyFieldRetreatTests;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Walls built after an army set out block it too (<c>docs/design/troop-movement-range.md</c> §5): when the army finds such a wall
/// (<see cref="WallEncounters.FindEarliest"/>) and what it does then (<see cref="Army.RerouteAroundWall"/>). The scene is
/// <see cref="ArmyFieldRetreatTests"/>' grass strip, the army marching from <see cref="ArmyFieldRetreatTests.Home"/> east to
/// <see cref="ArmyFieldRetreatTests.Far"/>.
/// </summary>
public sealed class WallEncounterTests
{
    private static readonly HexCoord WallHex = new(5, 0);

    private static Func<HexCoord, DateTimeOffset?> WallAt(HexCoord hex, DateTimeOffset since) => h => h == hex ? since : null;

    private static DateTimeOffset EntryOf(Bjarnoy.Domain.Movement.Movement movement, HexCoord hex) =>
        movement.DepartedAt + TimeSpan.FromHours(movement.EdgeHours[IndexOf(movement.Path, hex)]);

    private static int IndexOf(IReadOnlyList<HexCoord> path, HexCoord hex) => path.ToList().IndexOf(hex);

    [Fact]
    public void A_wall_built_while_the_army_walks_is_found_when_it_stands()
    {
        var movement = MovementOf(Marching(provisions: 400));
        Assert.Contains(WallHex, movement.Path);
        var built = EntryOf(movement, WallHex).AddHours(-1);

        var encounter = WallEncounters.FindEarliest(movement, WallAt(WallHex, built), built.AddHours(5));

        Assert.Equal(new WallEncounter(built, WallHex, IndexOf(movement.Path, WallHex), OnReturnLeg: false), encounter);
    }

    [Fact]
    public void A_wall_that_stood_before_the_leg_began_is_found_at_the_start_of_the_leg()
    {
        var movement = MovementOf(Marching(provisions: 400));

        var encounter = WallEncounters.FindEarliest(movement, WallAt(WallHex, DateTimeOffset.MinValue), T0.AddHours(1));

        Assert.Equal(T0, encounter!.Value.At);
    }

    [Fact]
    public void A_wall_finished_after_the_army_entered_its_hex_or_after_now_is_not_in_the_way()
    {
        var movement = MovementOf(Marching(provisions: 400));
        var entry = EntryOf(movement, WallHex);

        Assert.Null(WallEncounters.FindEarliest(movement, WallAt(WallHex, entry), entry.AddHours(10)));
        Assert.Null(WallEncounters.FindEarliest(movement, WallAt(WallHex, entry.AddHours(-1)), entry.AddHours(-2)));
    }

    [Fact]
    public void A_wall_on_the_way_home_is_found_when_the_army_turns_around_at_the_earliest()
    {
        var movement = MovementOf(Marching(provisions: 400));
        var homeward = new HexCoord(2, 0);

        // The wall stands on the outbound route too, but the army passed it before it was built.
        var outboundEntry = EntryOf(movement, homeward);
        var encounter = WallEncounters.FindEarliest(movement, WallAt(homeward, outboundEntry.AddMinutes(1)), DateTimeOffset.MaxValue);

        Assert.Equal(movement.TurnAroundAt, encounter!.Value.At);
        Assert.True(encounter.Value.OnReturnLeg);
        Assert.Equal(homeward, encounter.Value.Hex);
    }

    [Fact]
    public void The_earliest_of_several_walls_wins()
    {
        var movement = MovementOf(Marching(provisions: 400));
        var near = new HexCoord(3, 0);
        var lead = EntryOf(movement, near) - T0;
        var farBuilt = T0 + (lead / 3);
        var nearBuilt = T0 + (lead * 2 / 3);

        var encounter = WallEncounters.FindEarliest(
            movement, h => h == near ? nearBuilt : h == WallHex ? farBuilt : null, DateTimeOffset.MaxValue);

        Assert.Equal(WallHex, encounter!.Value.Hex);
        Assert.Equal(farBuilt, encounter.Value.At);
    }

    [Fact]
    public void A_stranded_army_finds_no_wall()
    {
        var stranded = MovementOf(Marching(provisions: 400).Strand(T0.AddHours(1), new HexCoord(1, 0)));

        Assert.Null(WallEncounters.FindEarliest(stranded, _ => DateTimeOffset.MinValue, DateTimeOffset.MaxValue));
    }

    /// <summary>Route rules where every hex of <paramref name="walls"/> blocks (no gate, no half-open end).</summary>
    private static WallRules Blocking(IEnumerable<HexCoord> walls)
    {
        var set = walls.ToHashSet();
        return new WallRules(set.Contains, _ => false, _ => false);
    }

    /// <summary>A wall across the strip at q = 5 except its top row (r = 3), which a detour can still use.</summary>
    private static WallRules WallWithGap() => Blocking(Enumerable.Range(-3, 6).Select(r => new HexCoord(5, r)));

    private static WallRules SealedWall(int q) => Blocking(Enumerable.Range(-3, 7).Select(r => new HexCoord(q, r)));

    private static WallEncounter EncounterOn(Bjarnoy.Domain.Movement.Movement movement, HexCoord hex, DateTimeOffset at, bool onReturn = false) =>
        new(at, hex, IndexOf(movement.Path, hex), onReturn);

    [Fact]
    public void An_outbound_army_walks_around_the_new_wall_to_its_target()
    {
        var army = Marching(provisions: 400);
        var movement = MovementOf(army);
        var at = EntryOf(movement, WallHex).AddMinutes(-30);

        var result = army.RerouteAroundWall(EncounterOn(movement, WallHex, at), Home, Strip, walls: WallWithGap());

        Assert.Null(result.StuckAt);
        var rerouted = MovementOf(result.Army);
        Assert.False(rerouted.IsReturning);
        Assert.Equal(at, rerouted.DepartedAt);
        Assert.Equal(movement.PositionAt(at), rerouted.Path[0]);
        Assert.Equal(Far, rerouted.Path[^1]);
        Assert.DoesNotContain(rerouted.Path, h => h.Q == 5 && h.R < 3);
        Assert.Equal(army.ProvisionsAt(at), result.Army.ProvisionsAt(at), 6);
        Assert.True(rerouted.TurnAroundAt >= rerouted.ArrivesAt);
    }

    [Fact]
    public void An_outbound_army_whose_food_no_longer_covers_the_detour_turns_home_at_once()
    {
        // Food for the straight round trip and barely more.
        var straight = MovementOf(Marching(provisions: 400));
        var upkeep = Marching(provisions: 400).TotalUpkeepPerHour;
        var army = Marching(provisions: (straight.CumulativeHours[^1] * 2 * upkeep) + 1);
        var movement = MovementOf(army);
        var at = EntryOf(movement, WallHex).AddMinutes(-30);

        var result = army.RerouteAroundWall(EncounterOn(movement, WallHex, at), Home, Strip, walls: WallWithGap());

        Assert.Null(result.StuckAt);
        var home = MovementOf(result.Army);
        Assert.True(home.IsReturning);
        Assert.Equal(at, home.DepartedAt);
        Assert.Equal(Home, home.Path[^1]);
    }

    [Fact]
    public void An_outbound_army_with_no_way_past_stops_before_the_wall_drops_its_target_and_still_goes_home_later()
    {
        var army = Marching(provisions: 400) with { Mission = ArmyMission.Attack, TargetSettlementId = Guid.NewGuid() };
        var movement = MovementOf(army);
        var at = EntryOf(movement, WallHex).AddMinutes(-30);

        var result = army.RerouteAroundWall(EncounterOn(movement, WallHex, at), Home, Strip, walls: SealedWall(5));

        Assert.Equal(new HexCoord(4, 0), result.StuckAt);
        Assert.Equal(ArmyMission.Move, result.Army.Mission);
        Assert.Null(result.Army.TargetSettlementId);
        var standing = MovementOf(result.Army);
        Assert.False(standing.IsStranded);
        Assert.Equal(movement.DepartedAt, standing.DepartedAt);
        Assert.Equal(new HexCoord(4, 0), standing.Path[^1]);
        Assert.Equal(Home, standing.ReturnPath[^1]);
        Assert.True(standing.TurnAroundAt >= at);
        Assert.Equal(army.ProvisionsAt(at), result.Army.ProvisionsAt(at), 6);
    }

    [Fact]
    public void An_outbound_army_walled_in_on_both_sides_is_stranded_before_the_wall()
    {
        var army = Marching(provisions: 400);
        var movement = MovementOf(army);
        var at = EntryOf(movement, WallHex).AddMinutes(-30);
        var both = Blocking(Enumerable.Range(-3, 7).SelectMany(r => new[] { new HexCoord(5, r), new HexCoord(1, r) }));

        var result = army.RerouteAroundWall(EncounterOn(movement, WallHex, at), Home, Strip, walls: both);

        Assert.Equal(new HexCoord(4, 0), result.StuckAt);
        Assert.True(result.Army.CannotGetHome);
        var stranded = MovementOf(result.Army);
        Assert.Equal(new HexCoord(4, 0), stranded.Path[^1]);
        Assert.Equal(new HexCoord(4, 0), stranded.PositionAt(stranded.ArrivesAt));
        Assert.Equal(result.Army.StarvesAt, stranded.TurnAroundAt);
        Assert.Equal(army.ProvisionsAt(at), result.Army.ProvisionsAt(at), 6);
    }

    [Fact]
    public void An_army_on_its_way_home_takes_another_way_home_and_a_fleeing_one_stays_protected()
    {
        var army = Marching(provisions: 400).ForceFieldRetreat(T0.AddHours(6), new HexCoord(8, 0), Home, Strip);
        var movement = MovementOf(army);
        var blocked = new HexCoord(3, 0);
        var at = EntryOf(movement, blocked).AddMinutes(-30);
        var rules = Blocking(Enumerable.Range(-3, 6).Select(r => new HexCoord(3, r)));

        var result = army.RerouteAroundWall(EncounterOn(movement, blocked, at, onReturn: true), Home, Strip, walls: rules);

        Assert.Null(result.StuckAt);
        var home = MovementOf(result.Army);
        Assert.True(home.IsReturning);
        Assert.Equal(at, home.DepartedAt);
        Assert.Equal(Home, home.Path[^1]);
        Assert.DoesNotContain(home.Path, h => h.Q == 3 && h.R < 3);
        Assert.Equal(movement.FieldBattleImmuneUntil, home.FieldBattleImmuneUntil);
    }

    [Fact]
    public void An_army_on_its_way_home_with_no_way_past_is_stranded_before_the_wall()
    {
        var army = Marching(provisions: 400).ForceFieldRetreat(T0.AddHours(6), new HexCoord(8, 0), Home, Strip);
        var movement = MovementOf(army);
        var blocked = new HexCoord(3, 0);
        var at = EntryOf(movement, blocked).AddMinutes(-30);

        var result = army.RerouteAroundWall(
            EncounterOn(movement, blocked, at, onReturn: true), Home, Strip, walls: SealedWall(3));

        Assert.Equal(new HexCoord(4, 0), result.StuckAt);
        Assert.True(result.Army.CannotGetHome);
        Assert.Equal(new HexCoord(4, 0), MovementOf(result.Army).Path[^1]);
    }
}
