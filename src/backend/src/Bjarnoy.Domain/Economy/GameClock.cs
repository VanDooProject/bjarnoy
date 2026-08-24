namespace Bjarnoy.Domain.Economy;

/// <summary>
/// What a world is currently doing. Two independent things can be suspended —
/// the passage of game time, and the acceptance of new commands — and the
/// useful states are the combinations.
/// </summary>
public enum WorldRunState
{
    /// <summary>Normal play. Time advances, commands are accepted.</summary>
    Running = 0,

    /// <summary>
    /// Fully stopped. Nothing accrues, nothing completes, nothing can be
    /// queued. Used to hold a round between sessions.
    /// </summary>
    Paused = 1,

    /// <summary>
    /// Time advances and queued work still completes, but no new commands are
    /// accepted. Used to wind a round down, or to stop the world changing shape
    /// while something is being migrated behind it.
    /// </summary>
    Locked = 2,

    /// <summary>
    /// Stopped for operational work. Mechanically the same freeze as
    /// <see cref="Paused"/>; kept distinct so it can be surfaced to players as
    /// maintenance rather than as a game event, and because resuming from it
    /// normally credits grace on top of the elapsed downtime.
    /// </summary>
    Maintenance = 3,
}

/// <summary>
/// Maps wall-clock time to <em>game time</em>, the timeline the world actually
/// runs on, excluding any spans in which it was not running.
/// </summary>
/// <remarks>
/// <para>
/// Everything in this game is settled lazily from a timestamp — resources
/// accrue as a function of elapsed time, and a build completes when its instant
/// has passed. That is what makes downtime harmless: nothing ticks, so no tick
/// can be missed, and a process that was dead for six hours comes back to a
/// world that is exactly as far along as the clock says.
/// </para>
/// <para>
/// The flip side is that a pause cannot be implemented by stopping a worker,
/// because there is no worker to stop. Six hours of unplanned downtime and six
/// hours of deliberate pause look identical to a timestamp. So a pause is
/// expressed as a change of <em>clock</em>, not a change of rules: every
/// timestamp the domain stores — <see cref="ResourcePool.SettledAt"/>, a build
/// order's completion — is a <em>game</em> instant, and this type is the only
/// thing that knows about wall time. Freezing the clock makes every lazy
/// computation downstream measure zero elapsed hours, without any of them
/// knowing that a pause exists.
/// </para>
/// <para>
/// Game time is monotonic and continuous across a freeze, so a build with eight
/// minutes left when the world stops still has eight minutes left when it comes
/// back, however long the stop lasted.
/// </para>
/// <para>
/// <see cref="AccumulatedOffset"/> is also the lever for compensating an
/// <em>outage</em>, which is the opposite problem: there the world kept
/// accruing while players could not act. Adding grace pushes game time back, so
/// the unearned progress is handed back as real time.
/// </para>
/// </remarks>
public readonly record struct GameClock
{
    /// <summary>A world that has always been running: game time equals wall time.</summary>
    public static GameClock Running => new(WorldRunState.Running, DateTimeOffset.UnixEpoch, TimeSpan.Zero);

    public GameClock(WorldRunState state, DateTimeOffset stateSince, TimeSpan accumulatedOffset)
    {
        if (accumulatedOffset < TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(
                nameof(accumulatedOffset),
                accumulatedOffset,
                "The offset only ever grows; a negative one would run game time ahead of wall time.");
        }

        State = state;
        StateSince = stateSince;
        AccumulatedOffset = accumulatedOffset;
    }

    public WorldRunState State { get; }

    /// <summary>Wall-clock instant the world entered <see cref="State"/>.</summary>
    public DateTimeOffset StateSince { get; }

    /// <summary>
    /// Total wall time subtracted from the game timeline — every completed
    /// freeze, plus any grace credited.
    /// </summary>
    public TimeSpan AccumulatedOffset { get; }

    /// <summary>Whether game time is currently standing still.</summary>
    public bool FreezesTime => State is WorldRunState.Paused or WorldRunState.Maintenance;

    /// <summary>Whether players may start anything new.</summary>
    public bool AllowsCommands => State == WorldRunState.Running;

    /// <summary>
    /// The game instant corresponding to a wall-clock instant. Constant while
    /// frozen — which is the entire mechanism.
    /// </summary>
    public DateTimeOffset ToGameTime(DateTimeOffset wallNow)
    {
        if (FreezesTime)
        {
            // Clamped rather than trusted: a wall reading from before the freeze
            // must not produce a game time after it.
            var frozenAt = wallNow < StateSince ? wallNow : StateSince;
            return frozenAt - AccumulatedOffset;
        }

        return wallNow - AccumulatedOffset;
    }

    /// <summary>
    /// The wall-clock instant a game instant will be reached, assuming the world
    /// keeps running until then.
    /// </summary>
    /// <remarks>
    /// Lets a client count a build down against its own clock. Null while
    /// frozen, because a frozen world genuinely has no answer — the countdown is
    /// suspended, not merely postponed.
    /// </remarks>
    public DateTimeOffset? ToWallTime(DateTimeOffset gameInstant) =>
        FreezesTime ? null : gameInstant + AccumulatedOffset;

    /// <summary>
    /// Moves to <paramref name="next"/>, folding any elapsed freeze into
    /// <see cref="AccumulatedOffset"/> so the timeline stays continuous.
    /// </summary>
    /// <param name="grace">
    /// Extra time credited on top of the freeze, pushing every deadline further
    /// out. The usual reason is maintenance that ran long, or an outage the
    /// players should not pay for.
    /// </param>
    public GameClock TransitionTo(WorldRunState next, DateTimeOffset wallNow, TimeSpan grace = default)
    {
        if (grace < TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(
                nameof(grace), grace, "Grace cannot be negative; it only ever gives time back.");
        }

        // Re-entering the same state is not a transition: the freeze is still
        // running, so its elapsed time must not be folded in yet, and its start
        // must not be reset. Folding here would deduct the freeze twice — once
        // now and again on resume — and resetting StateSince would forget the
        // part already served.
        var isReentry = next == State;

        var frozen = !isReentry && FreezesTime && wallNow > StateSince
            ? wallNow - StateSince
            : TimeSpan.Zero;

        return new GameClock(
            next,
            isReentry ? StateSince : wallNow,
            AccumulatedOffset + frozen + grace);
    }

    /// <summary>Stops the world completely.</summary>
    public GameClock Pause(DateTimeOffset wallNow) => TransitionTo(WorldRunState.Paused, wallNow);

    /// <summary>Stops the world for operational work.</summary>
    public GameClock EnterMaintenance(DateTimeOffset wallNow) =>
        TransitionTo(WorldRunState.Maintenance, wallNow);

    /// <summary>Keeps time running but stops accepting new commands.</summary>
    public GameClock Lock(DateTimeOffset wallNow) => TransitionTo(WorldRunState.Locked, wallNow);

    /// <summary>Returns to normal play, optionally crediting <paramref name="grace"/>.</summary>
    public GameClock Resume(DateTimeOffset wallNow, TimeSpan grace = default) =>
        TransitionTo(WorldRunState.Running, wallNow, grace);

    /// <summary>
    /// Credits time without changing state — for compensating an outage the
    /// world was never paused for.
    /// </summary>
    public GameClock AddGrace(TimeSpan grace)
    {
        if (grace < TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(
                nameof(grace), grace, "Grace cannot be negative; it only ever gives time back.");
        }

        return new GameClock(State, StateSince, AccumulatedOffset + grace);
    }

    /// <summary>How long the current freeze has lasted, or zero if time is running.</summary>
    public TimeSpan CurrentFreezeDuration(DateTimeOffset wallNow) =>
        FreezesTime && wallNow > StateSince ? wallNow - StateSince : TimeSpan.Zero;
}
