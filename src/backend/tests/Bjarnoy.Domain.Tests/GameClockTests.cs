using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class GameClockTests
{
    private static readonly DateTimeOffset Wall = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void A_world_that_never_stopped_runs_on_wall_time()
    {
        var clock = GameClock.Running;

        Assert.Equal(Wall, clock.ToGameTime(Wall));
        Assert.Equal(Wall.AddHours(5), clock.ToGameTime(Wall.AddHours(5)));
        Assert.True(clock.AllowsCommands);
        Assert.False(clock.FreezesTime);
    }

    [Fact]
    public void Game_time_stands_still_while_paused()
    {
        var paused = GameClock.Running.Pause(Wall);

        Assert.Equal(Wall, paused.ToGameTime(Wall));
        Assert.Equal(Wall, paused.ToGameTime(Wall.AddHours(3)));
        Assert.Equal(Wall, paused.ToGameTime(Wall.AddDays(10)));
    }

    [Fact]
    public void A_pause_is_deducted_once_the_world_resumes()
    {
        var clock = GameClock.Running.Pause(Wall).Resume(Wall.AddHours(3));

        // Three wall hours passed, none of them game hours.
        Assert.Equal(Wall, clock.ToGameTime(Wall.AddHours(3)));
        Assert.Equal(Wall.AddHours(1), clock.ToGameTime(Wall.AddHours(4)));
        Assert.Equal(TimeSpan.FromHours(3), clock.AccumulatedOffset);
    }

    [Fact]
    public void Game_time_is_continuous_across_a_pause()
    {
        var running = GameClock.Running;
        var atPause = running.ToGameTime(Wall);

        var paused = running.Pause(Wall);
        var resumed = paused.Resume(Wall.AddHours(8));

        // The instant before the freeze, during it, and the instant it lifts
        // must all be the same game time — no jump in either direction.
        Assert.Equal(atPause, paused.ToGameTime(Wall.AddHours(4)));
        Assert.Equal(atPause, resumed.ToGameTime(Wall.AddHours(8)));
    }

    [Fact]
    public void Pauses_accumulate_across_several_stops()
    {
        var clock = GameClock.Running
            .Pause(Wall).Resume(Wall.AddHours(1))
            .Pause(Wall.AddHours(2)).Resume(Wall.AddHours(5));

        Assert.Equal(TimeSpan.FromHours(4), clock.AccumulatedOffset);
        Assert.Equal(Wall.AddHours(2), clock.ToGameTime(Wall.AddHours(6)));
    }

    [Fact]
    public void Pausing_twice_does_not_restart_the_freeze()
    {
        var clock = GameClock.Running.Pause(Wall).Pause(Wall.AddHours(2));

        // The second call must not move StateSince forward, or the first two
        // hours of the freeze would be counted as played.
        Assert.Equal(Wall, clock.StateSince);
        Assert.Equal(Wall, clock.ToGameTime(Wall.AddHours(2)));

        var resumed = clock.Resume(Wall.AddHours(3));
        Assert.Equal(TimeSpan.FromHours(3), resumed.AccumulatedOffset);
    }

    [Fact]
    public void Resuming_a_running_world_changes_nothing()
    {
        var clock = GameClock.Running;

        Assert.Equal(clock.AccumulatedOffset, clock.Resume(Wall.AddHours(5)).AccumulatedOffset);
    }

    [Fact]
    public void A_locked_world_keeps_time_but_refuses_commands()
    {
        var locked = GameClock.Running.Lock(Wall);

        Assert.False(locked.AllowsCommands);
        Assert.False(locked.FreezesTime);

        // Queued work still finishes; players simply cannot start more.
        Assert.Equal(Wall.AddHours(4), locked.ToGameTime(Wall.AddHours(4)));
    }

    [Fact]
    public void Unlocking_costs_no_time_because_none_was_frozen()
    {
        var clock = GameClock.Running.Lock(Wall).Resume(Wall.AddHours(6));

        Assert.Equal(TimeSpan.Zero, clock.AccumulatedOffset);
        Assert.Equal(Wall.AddHours(6), clock.ToGameTime(Wall.AddHours(6)));
    }

    [Fact]
    public void Maintenance_freezes_time_like_a_pause_but_reads_differently()
    {
        var maintenance = GameClock.Running.EnterMaintenance(Wall);

        Assert.True(maintenance.FreezesTime);
        Assert.False(maintenance.AllowsCommands);
        Assert.Equal(WorldRunState.Maintenance, maintenance.State);
        Assert.Equal(Wall, maintenance.ToGameTime(Wall.AddHours(2)));
    }

    [Fact]
    public void Resuming_from_maintenance_can_credit_grace_on_top_of_the_downtime()
    {
        var clock = GameClock.Running
            .EnterMaintenance(Wall)
            .Resume(Wall.AddHours(1), grace: TimeSpan.FromHours(2));

        // One hour down, two hours credited: everything is pushed back three.
        Assert.Equal(TimeSpan.FromHours(3), clock.AccumulatedOffset);
        Assert.Equal(Wall.AddHours(-2), clock.ToGameTime(Wall.AddHours(1)));
    }

    [Fact]
    public void Grace_can_be_credited_without_a_state_change_to_pay_back_an_outage()
    {
        // Nothing was paused — the process simply died for six hours, and the
        // world accrued through it. Handing the time back undoes that.
        var clock = GameClock.Running.AddGrace(TimeSpan.FromHours(6));

        Assert.Equal(WorldRunState.Running, clock.State);
        Assert.Equal(Wall.AddHours(-6), clock.ToGameTime(Wall));
    }

    [Fact]
    public void Negative_grace_is_refused_so_time_cannot_be_taken_away()
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => GameClock.Running.AddGrace(TimeSpan.FromHours(-1)));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => GameClock.Running.Pause(Wall).Resume(Wall, TimeSpan.FromHours(-1)));
    }

    [Fact]
    public void A_wall_clock_that_goes_backwards_cannot_rewind_game_time()
    {
        var paused = GameClock.Running.Pause(Wall);

        Assert.Equal(Wall.AddHours(-2), paused.ToGameTime(Wall.AddHours(-2)));

        var resumed = paused.Resume(Wall.AddHours(-5));
        Assert.Equal(TimeSpan.Zero, resumed.AccumulatedOffset);
    }

    [Fact]
    public void ToWallTime_lets_a_client_count_down_but_gives_no_answer_while_frozen()
    {
        var clock = GameClock.Running.Pause(Wall).Resume(Wall.AddHours(2));
        var deadline = Wall.AddHours(1);

        Assert.Equal(deadline.AddHours(2), clock.ToWallTime(deadline));
        Assert.Null(clock.Pause(Wall.AddHours(3)).ToWallTime(deadline));
    }

    [Fact]
    public void Transitioning_between_frozen_states_folds_the_elapsed_freeze()
    {
        var clock = GameClock.Running
            .Pause(Wall)
            .TransitionTo(WorldRunState.Maintenance, Wall.AddHours(2));

        Assert.Equal(TimeSpan.FromHours(2), clock.AccumulatedOffset);
        Assert.Equal(WorldRunState.Maintenance, clock.State);
    }
}

/// <summary>
/// The point of the clock: the lazy machinery keeps working untouched, because
/// it only ever sees game instants.
/// </summary>
public class PausedWorldTests
{
    private static readonly DateTimeOffset Wall = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Resources_do_not_accrue_while_the_world_is_paused()
    {
        var clock = GameClock.Running;
        var pool = ResourcePool.Create(
            ResourceAmounts.Zero,
            ResourceAmounts.Uniform(100),
            ResourceAmounts.Uniform(100_000),
            clock.ToGameTime(Wall));

        var paused = clock.Pause(Wall.AddHours(1));

        // An hour of play, then a week of pause: still one hour of production.
        Assert.Equal(100, pool.At(paused.ToGameTime(Wall.AddHours(1))).Wood, 6);
        Assert.Equal(100, pool.At(paused.ToGameTime(Wall.AddDays(7))).Wood, 6);

        var resumed = paused.Resume(Wall.AddDays(7));
        Assert.Equal(200, pool.At(resumed.ToGameTime(Wall.AddDays(7).AddHours(1))).Wood, 6);
    }

    [Fact]
    public void A_build_keeps_its_remaining_time_across_a_pause()
    {
        var clock = GameClock.Running;
        var completesAt = clock.ToGameTime(Wall).AddMinutes(10);
        var order = new BuildOrder
        {
            Id = Guid.CreateVersion7(),
            Type = BuildingType.Farm,
            TargetLevel = 1,
            Coord = new HexCoord(1, 0),
            StartedAt = clock.ToGameTime(Wall),
            CompletesAt = completesAt,
        };

        // Two minutes in, the world pauses for a day.
        var paused = clock.Pause(Wall.AddMinutes(2));
        Assert.False(order.IsComplete(paused.ToGameTime(Wall.AddDays(1))));
        Assert.Equal(
            TimeSpan.FromMinutes(8), order.RemainingAt(paused.ToGameTime(Wall.AddDays(1))));

        // On resume it still needs its eight minutes, no more and no less.
        var resumed = paused.Resume(Wall.AddDays(1));
        Assert.False(order.IsComplete(resumed.ToGameTime(Wall.AddDays(1).AddMinutes(7))));
        Assert.True(order.IsComplete(resumed.ToGameTime(Wall.AddDays(1).AddMinutes(8))));
    }

    [Fact]
    public void A_locked_world_still_finishes_what_was_already_queued()
    {
        var clock = GameClock.Running.Lock(Wall);
        var order = new BuildOrder
        {
            Id = Guid.CreateVersion7(),
            Type = BuildingType.Farm,
            TargetLevel = 1,
            Coord = new HexCoord(1, 0),
            StartedAt = clock.ToGameTime(Wall),
            CompletesAt = clock.ToGameTime(Wall).AddMinutes(10),
        };

        Assert.True(order.IsComplete(clock.ToGameTime(Wall.AddMinutes(11))));
        Assert.False(clock.AllowsCommands);
    }

    [Fact]
    public void Grace_after_an_outage_hands_back_the_progress_players_could_not_use()
    {
        var clock = GameClock.Running;
        var pool = ResourcePool.Create(
            ResourceAmounts.Zero,
            ResourceAmounts.Uniform(100),
            ResourceAmounts.Uniform(100_000),
            clock.ToGameTime(Wall));

        // The process was dead for six hours; the timestamp does not know that.
        Assert.Equal(600, pool.At(clock.ToGameTime(Wall.AddHours(6))).Wood, 6);

        var compensated = clock.AddGrace(TimeSpan.FromHours(6));
        Assert.Equal(0, pool.At(compensated.ToGameTime(Wall.AddHours(6))).Wood, 6);
    }
}
