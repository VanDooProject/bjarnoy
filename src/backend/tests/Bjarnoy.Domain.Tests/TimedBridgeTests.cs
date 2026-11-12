using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary><see cref="TimedBridge"/>: the level a bridge hex stands at for any instant, from the stages its build and raze orders give it.</summary>
public sealed class TimedBridgeTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Hex = new(3, 0);
    private static readonly Guid Owner = Guid.NewGuid();

    private static TimedBridge Bridge(params (DateTimeOffset From, int Level)[] stages) =>
        new(Hex, Owner, false, [.. stages.Select(s => new BridgeStage(s.From, s.Level))]);

    [Fact]
    public void A_foundation_with_a_finished_order_stands_at_the_order_level_from_its_completion_instant()
    {
        var bridge = Bridge((DateTimeOffset.MinValue, 0), (T0.AddHours(1), 3));

        Assert.Null(bridge.StandingAt(T0));
        Assert.Equal(0, bridge.LevelAt(T0.AddHours(1).AddTicks(-1)));
        var standing = bridge.StandingAt(T0.AddHours(1));
        Assert.Equal(new StandingBridge(Hex, 3, Owner), standing);
        Assert.Equal(3, bridge.LevelAt(T0.AddDays(9)));
    }

    [Fact]
    public void An_upgrade_changes_the_level_only_from_its_completion_instant()
    {
        var bridge = Bridge((DateTimeOffset.MinValue, 1), (T0, 2));

        Assert.Equal(1, bridge.LevelAt(T0.AddMinutes(-1)));
        Assert.Equal(2, bridge.LevelAt(T0));
    }

    [Fact]
    public void A_raze_to_nothing_ends_the_bridge_and_a_raze_to_a_lower_level_keeps_it_standing()
    {
        var gone = Bridge((DateTimeOffset.MinValue, 3), (T0, 0));
        var lowered = Bridge((DateTimeOffset.MinValue, 3), (T0, 1));

        Assert.Equal(3, gone.LevelAt(T0.AddTicks(-1)));
        Assert.Null(gone.StandingAt(T0));
        Assert.Equal(1, lowered.LevelAt(T0));
    }

    [Fact]
    public void A_bridge_keeps_its_realm_and_owner_whatever_its_level()
    {
        var outside = new TimedBridge(Hex, Owner, true, [new BridgeStage(DateTimeOffset.MinValue, 4)]);

        Assert.Equal(new StandingBridge(Hex, 4, Owner, true), outside.StandingAt(T0));
    }
}
