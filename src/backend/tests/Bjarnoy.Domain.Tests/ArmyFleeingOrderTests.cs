using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using static Bjarnoy.Domain.Tests.ArmyFieldRetreatTests;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// An army fleeing after a lost field battle takes orders like any army in the field, and the order ends its flee protection
/// (<c>docs/design/troop-movement-range.md</c> §2a).
/// </summary>
public sealed class ArmyFleeingOrderTests
{
    private static Army Fleeing(out DateTimeOffset battleAt)
    {
        battleAt = T0.AddHours(6);
        return Marching(provisions: 400).ForceFieldRetreat(battleAt, new HexCoord(4, 0), Home, Strip);
    }

    [Fact]
    public void A_fleeing_army_on_its_way_home_takes_a_field_order_from_where_it_is()
    {
        var army = Fleeing(out var battleAt);
        var now = battleAt.AddHours(1);
        var reached = MovementOf(army).PositionAt(now);
        Assert.True(MovementOf(army).IsReturning);

        var result = Army.PlanFieldOrder(army, [], new HexCoord(6, 1), Home, now, Strip, isPremium: false);

        Assert.True(result.Accepted, result.Rejection.ToString());
        var ordered = MovementOf(result.Army!);
        Assert.False(ordered.IsReturning);
        Assert.Equal(now, ordered.DepartedAt);
        Assert.Equal(reached, ordered.Path[0]);
        Assert.Equal(new HexCoord(6, 1), ordered.Path[^1]);
        Assert.Equal(army.ProvisionsAt(now), result.Army!.ProvisionsAt(now), 6);
    }

    [Fact]
    public void The_order_ends_the_flee_protection()
    {
        var army = Fleeing(out var battleAt);
        var now = battleAt.AddHours(1);
        Assert.True(MovementOf(army).IsFieldBattleImmuneAt(now));

        var ordered = MovementOf(Army.PlanFieldOrder(army, [], new HexCoord(6, 1), Home, now, Strip, isPremium: false).Army!);

        Assert.Null(ordered.FieldBattleImmuneUntil);
        Assert.False(ordered.IsFleeing);
        Assert.False(ordered.IsFieldBattleImmuneAt(now));
    }

    [Fact]
    public void A_fleeing_army_on_its_way_home_moves_whole()
    {
        var army = Fleeing(out var battleAt);

        var result = Army.PlanFieldOrder(
            army, [], new HexCoord(6, 1), Home, battleAt.AddHours(1), Strip, isPremium: true,
            requestedUnits: [new UnitStack(UnitType.Spearman, 3)]);

        Assert.Equal(FieldOrderRejection.SplitRequiresStandingArmy, result.Rejection);
    }

    [Fact]
    public void An_army_returning_home_after_its_turn_around_still_takes_no_field_order()
    {
        var army = Marching(provisions: 400);
        var turned = army.SettleTo(MovementOf(army).TurnAroundAt.AddMinutes(1)).Army;
        Assert.True(MovementOf(turned).IsReturning);

        var result = Army.PlanFieldOrder(
            turned, [], new HexCoord(6, 1), Home, MovementOf(turned).DepartedAt.AddMinutes(30), Strip, isPremium: true);

        Assert.Equal(FieldOrderRejection.NoActiveJourney, result.Rejection);
    }

    [Fact]
    public void Recall_of_a_fleeing_army_already_walking_home_is_a_no_op()
    {
        var army = Fleeing(out var battleAt);

        Assert.Null(army.Recall(battleAt.AddHours(1), Home, Strip));
    }
}
