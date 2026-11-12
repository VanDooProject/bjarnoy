using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.World;
using static Bjarnoy.Domain.Tests.ArmyFieldRetreatTests;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// An army without a home (its beach camp was destroyed and it could reach no other garrison spot): it cannot get home, so it
/// starves when its provisions run out; it cannot be recalled; it still takes field orders (<c>docs/design/troop-movement-range.md</c> §2a).
/// </summary>
public sealed class ArmyWithoutHomeTests
{
    // 10 spearmen burn 2.5 food per hour.
    private const double Upkeep = 2.5;
    private static readonly HexCoord Here = new(4, 0);
    private static readonly HexCoord Onward = new(6, 0);

    private static Army Homeless(double provisions) => Marching(provisions) with { SettlementId = null };

    private static Army StandingWithoutHome(double provisions, double hoursOut = 6) =>
        Homeless(provisions).Strand(T0.AddHours(hoursOut), Here);

    [Fact]
    public void An_army_without_a_home_cannot_get_home_even_while_it_still_marches()
    {
        var army = Homeless(200);

        Assert.False(army.HasHome);
        Assert.Null(army.Home);
        Assert.True(army.CannotGetHome);
        Assert.False(MovementOf(army).IsStranded);
        Assert.Equal(T0 + TimeSpan.FromHours(200 / Upkeep), army.StarvesAt);
    }

    [Fact]
    public void An_army_without_a_home_standing_where_it_was_starves_when_its_provisions_run_out()
    {
        var army = StandingWithoutHome(200);
        var carried = 200 - (Upkeep * 6);

        Assert.True(army.CannotGetHome);
        Assert.Equal(T0.AddHours(6) + TimeSpan.FromHours(carried / Upkeep), army.StarvesAt);
        Assert.False(army.SettleTo(army.StarvesAt!.Value.AddTicks(-1)).Changed);

        var starved = army.SettleTo(army.StarvesAt!.Value.AddHours(1));
        Assert.True(starved.Starved);
        Assert.False(starved.ArrivedHome);
    }

    [Fact]
    public void An_army_without_a_home_never_turns_around_it_stays_where_its_march_ends()
    {
        var army = Homeless(200);
        var arrives = MovementOf(army).ArrivesAt;

        var settled = army.SettleTo(arrives.AddHours(1));

        Assert.True(settled.Changed);
        Assert.False(settled.ArrivedHome);
        Assert.False(settled.Starved);
        var standing = MovementOf(settled.Army);
        Assert.True(standing.IsStranded);
        Assert.False(standing.IsReturning);
        Assert.Equal([Far], standing.Path);
        Assert.Equal(Far, settled.Army.PositionAt(Home, arrives.AddHours(2)));
        Assert.Equal(200 - (Upkeep * (arrives - T0).TotalHours), settled.Army.Provisions, 6);
    }

    [Fact]
    public void An_army_without_a_home_that_runs_out_of_food_on_the_way_starves_there()
    {
        // 1 food lasts 24 minutes, the march to the far end takes longer.
        var army = Homeless(1);
        Assert.True(army.StarvesAt < MovementOf(army).ArrivesAt);

        var settled = army.SettleTo(MovementOf(army).ArrivesAt);

        Assert.True(settled.Starved);
        Assert.Equal(army.StarvesAt, Assert.Single(settled.Walked).Until);
    }

    [Fact]
    public void An_army_without_a_home_cannot_be_recalled()
    {
        Assert.Null(Homeless(200).Recall(T0.AddHours(1), Home, Strip));
        Assert.Null(StandingWithoutHome(200).Recall(T0.AddHours(7), null, Strip));
    }

    [Fact]
    public void An_army_without_a_home_takes_a_field_order_and_plans_no_way_back()
    {
        var army = StandingWithoutHome(200);
        var now = T0.AddHours(7);

        var result = Army.PlanFieldOrder(army, [], Onward, null, now, Strip, isPremium: false);

        Assert.True(result.Accepted, result.Rejection.ToString());
        var movement = MovementOf(result.Army!);
        Assert.False(movement.IsStranded);
        Assert.Equal(Onward, movement.Path[^1]);
        Assert.Equal([Onward], movement.ReturnPath);
        Assert.Null(result.Army!.SettlementId);
    }

    [Fact]
    public void A_field_order_of_an_army_without_a_home_only_needs_the_food_to_get_there()
    {
        // 6 food at the order: enough for the two-hex walk on, not for any way back.
        var army = StandingWithoutHome(6 + (Upkeep * 6));

        var result = Army.PlanFieldOrder(army, [], Onward, null, T0.AddHours(6), Strip, isPremium: false);

        Assert.True(result.Accepted, result.Rejection.ToString());
    }

    [Fact]
    public void An_army_without_a_home_that_loses_a_fight_stays_where_it_fought()
    {
        var battleAt = T0.AddHours(6);

        var retreating = Homeless(200).ForceFieldRetreat(battleAt, Here, null, Strip);

        var movement = MovementOf(retreating);
        Assert.True(movement.IsStranded);
        Assert.Equal([Here], movement.Path);
        Assert.Equal(battleAt + Bjarnoy.Domain.Movement.Movement.FleeProtection, movement.FieldBattleImmuneUntil);
    }
}
