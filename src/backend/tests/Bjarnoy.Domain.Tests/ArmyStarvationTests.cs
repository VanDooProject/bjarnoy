using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using static Bjarnoy.Domain.Tests.ArmyFieldRetreatTests;

namespace Bjarnoy.Domain.Tests;

/// <summary>An army that cannot get home stays where it is and starves when its provisions run out (<c>docs/design/troop-movement-range.md</c> §2a).</summary>
public sealed class ArmyStarvationTests
{
    // 10 spearmen burn 2.5 food per hour.
    private const double Upkeep = 2.5;
    private static readonly HexCoord Here = new(4, 0);

    // A wall column through q = 2 with no gate and no open end: nothing walks from the east to the west of it.
    private static readonly WallRules Sealed = new(h => h.Q == 2, _ => false, _ => false);

    private static Army StrandedAt(double provisions, double hoursOut = 6)
    {
        var at = T0.AddHours(hoursOut);
        return Marching(provisions).Strand(at, Here);
    }

    [Fact]
    public void A_marching_army_can_get_home_and_has_no_starvation_instant()
    {
        var army = Marching(200);

        Assert.False(army.CannotGetHome);
        Assert.Null(army.StarvesAt);
    }

    [Fact]
    public void A_stranded_army_stands_on_its_hex_and_starves_when_the_provisions_it_carried_run_out()
    {
        var at = T0.AddHours(6);
        var army = Marching(200).Strand(at, Here);

        Assert.True(army.CannotGetHome);
        var movement = MovementOf(army);
        Assert.True(movement.IsStranded);
        Assert.False(movement.IsReturning);
        Assert.Equal([Here], movement.Path);
        Assert.Equal(Here, army.PositionAt(Home, at.AddHours(1)));
        var carried = 200 - (Upkeep * 6);
        Assert.Equal(carried, army.Provisions, 6);
        Assert.Equal(at + TimeSpan.FromHours(carried / Upkeep), army.StarvesAt);
        Assert.Equal(army.StarvesAt, movement.TurnAroundAt);
        Assert.Equal(0, army.ProvisionsAt(army.StarvesAt!.Value), 6);
    }

    [Fact]
    public void A_stranded_army_with_nothing_to_eat_has_no_starvation_instant()
    {
        var army = StrandedAt(200) with { Stacks = [] };

        Assert.Null(army.StarvesAt);
        Assert.False(army.SettleTo(T0.AddDays(1000)).Starved);
    }

    [Fact]
    public void Settling_a_stranded_army_before_it_starves_changes_nothing()
    {
        var army = StrandedAt(200);

        var settled = army.SettleTo(army.StarvesAt!.Value.AddTicks(-1));

        Assert.False(settled.Changed);
        Assert.False(settled.Starved);
        Assert.Same(army, settled.Army);
    }

    [Fact]
    public void A_stranded_army_never_turns_around_however_long_it_waits()
    {
        var army = StrandedAt(200);

        var settled = army.SettleTo(army.StarvesAt!.Value.AddHours(-1));

        Assert.True(MovementOf(settled.Army).IsStranded);
        Assert.False(MovementOf(settled.Army).IsReturning);
        Assert.False(settled.ArrivedHome);
    }

    [Fact]
    public void Settling_a_stranded_army_at_or_after_the_starvation_instant_starves_it_and_records_the_walk()
    {
        var army = StrandedAt(200);
        var starvesAt = army.StarvesAt!.Value;

        var settled = army.SettleTo(starvesAt.AddHours(5));

        Assert.True(settled.Starved);
        Assert.True(settled.Changed);
        Assert.False(settled.ArrivedHome);
        var walked = Assert.Single(settled.Walked);
        Assert.Equal(starvesAt, walked.Until);
        Assert.True(army.SettleTo(starvesAt).Starved);
    }

    [Fact]
    public void An_army_stranded_with_no_provisions_left_starves_at_once()
    {
        // 10 food, 2.5 per hour: gone after 4 hours, the army is stranded after 6.
        var at = T0.AddHours(6);
        var army = Marching(10).Strand(at, Here);

        Assert.Equal(0, army.Provisions);
        Assert.Equal(at, army.StarvesAt);
        Assert.True(army.SettleTo(at).Starved);
    }

    [Fact]
    public void A_forced_retreat_with_no_way_home_strands_the_army_where_it_fought()
    {
        var army = Marching(200);
        var battleAt = T0.AddHours(6);

        var retreating = army.ForceFieldRetreat(battleAt, Here, Home, Strip, walls: Sealed);

        Assert.True(retreating.CannotGetHome);
        var movement = MovementOf(retreating);
        Assert.Equal([Here], movement.Path);
        Assert.False(movement.IsReturning);
        Assert.True(movement.RetreatImmune);
        Assert.Equal(battleAt, movement.DepartedAt);
        // It is not folded home by the pathless "return": long after, it still stands there.
        var later = retreating.SettleTo(battleAt.AddHours(10));
        Assert.False(later.ArrivedHome);
        Assert.Equal(Here, later.Army.PositionAt(Home, battleAt.AddHours(10)));
        Assert.Equal(army.ProvisionsAt(battleAt), retreating.Provisions, 6);
    }

    [Fact]
    public void A_forced_retreat_that_finds_a_way_home_is_not_stranded()
    {
        var retreating = Marching(200).ForceFieldRetreat(T0.AddHours(6), Here, Home, Strip);

        Assert.False(retreating.CannotGetHome);
        Assert.True(MovementOf(retreating).IsReturning);
    }

    [Fact]
    public void A_stranded_army_can_be_recalled_once_a_route_home_exists()
    {
        var army = StrandedAt(200);
        var now = T0.AddHours(10);

        var recalled = army.Recall(now, Home, Strip);

        Assert.NotNull(recalled);
        Assert.False(recalled.CannotGetHome);
        Assert.True(MovementOf(recalled).IsReturning);
        Assert.Equal(Here, MovementOf(recalled).Path[0]);
        Assert.Equal(Home, MovementOf(recalled).Path[^1]);
        Assert.Null(recalled.StarvesAt);
    }

    [Fact]
    public void A_stranded_army_cannot_be_recalled_while_the_wall_still_closes_the_way()
    {
        Assert.Null(StrandedAt(200).Recall(T0.AddHours(10), Home, Strip, walls: Sealed));
    }

    [Fact]
    public void A_stranded_army_takes_a_field_order_that_builds_a_normal_movement()
    {
        var army = StrandedAt(200);
        var now = T0.AddHours(10);

        var order = Army.PlanFieldOrder(army, [], new HexCoord(6, 1), Home, now, Strip, isPremium: false);

        Assert.True(order.Accepted, $"expected accept, got {order.Rejection}");
        Assert.False(order.Army!.CannotGetHome);
        Assert.False(MovementOf(order.Army).IsStranded);
        Assert.Equal(Here, MovementOf(order.Army).Path[0]);
    }

    [Fact]
    public void A_split_of_a_stranded_army_leaves_the_remainder_stranded_with_the_same_starvation_instant()
    {
        var army = StrandedAt(200);
        var now = T0.AddHours(10);

        var order = Army.PlanFieldOrder(
            army, [], new HexCoord(6, 1), Home, now, Strip, isPremium: false,
            requestedUnits: [new UnitStack(UnitType.Spearman, 4)], splitArmyId: Guid.CreateVersion7());

        Assert.True(order.Accepted, $"expected accept, got {order.Rejection}");
        Assert.True(order.Remainder!.CannotGetHome);
        Assert.True(Math.Abs((army.StarvesAt!.Value - order.Remainder.StarvesAt!.Value).TotalSeconds) < 1);
    }
}
