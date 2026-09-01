using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Infrastructure.Entities;

public enum WorldStatus
{
    Active = 0,
    Inactive = 1,
    Full = 2,
}

/// <summary>Why <see cref="WorldEntity.DetermineJoinability"/> refused a join.</summary>
public enum JoinableReason
{
    None = 0,
    WorldNotActive,
    JoinsClosed,
    NotStartedYet,
    Full,
}

/// <summary>Whether a world currently accepts new players, and why not if it doesn't.</summary>
public readonly record struct Joinability(bool Joinable, JoinableReason Reason);

/// <summary>
/// A game world: one sea, its islands, and the players in it.
/// </summary>
/// <remarks>
/// A world stores its <em>generation input</em>, not its output. Terrain is a
/// pure function of the seed and the parameters below (see
/// <see cref="TerrainSampler"/>), so there is no tile table: only hexes that
/// acquire state — an owner, a building — ever become rows.
/// </remarks>
public class WorldEntity
{
    /// <summary>UUIDv7, so primary keys are time-ordered and index well.</summary>
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public required string Name { get; set; }

    public int Seed { get; set; }

    public int Radius { get; set; }

    public int IslandCellSize { get; set; }

    public double IslandChance { get; set; }

    public double IslandMinRadius { get; set; }

    public double IslandMaxRadius { get; set; }

    public double BeachThreshold { get; set; }

    public double MountainThreshold { get; set; }

    public double MountainRockiness { get; set; }

    public double ForestRockiness { get; set; }

    public int MinimumIslandTiles { get; set; }

    public int MaxPlayers { get; set; }

    public WorldStatus Status { get; set; } = WorldStatus.Active;

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>What the world is doing: running, paused, locked, maintenance.</summary>
    public WorldRunState RunState { get; set; } = WorldRunState.Running;

    /// <summary>
    /// Wall-clock instant the world entered <see cref="RunState"/>. One of the
    /// only wall-clock timestamps in the schema — everything else is game time.
    /// </summary>
    public DateTimeOffset RunStateSince { get; set; }

    /// <summary>
    /// Total time subtracted from the game timeline: every completed freeze
    /// plus any grace credited. Stored as ticks because a TimeSpan column maps
    /// differently on each provider, and this has to compare equal on both.
    /// </summary>
    public long ClockOffsetTicks { get; set; }

    /// <summary>
    /// Multiplies build speed and resource production. Applied in
    /// <c>Bjarnoy.Domain.Economy</c>, not here and not through <see cref="GameClock"/> —
    /// that machine is a pause/maintenance mechanism with its own grace-period
    /// semantics, unrelated to this factor.
    /// </summary>
    public double SpeedFactor { get; set; } = 1.0;

    /// <summary>
    /// Admin-configurable base for the new-account shield (design doc §1,
    /// issue #132) — divided by <see cref="SpeedFactor"/> and clamped to
    /// <c>Settlement.MinShieldDays</c>/<c>MaxShieldDays</c> at founding time,
    /// same admin-tunable-per-world shape as <see cref="SpeedFactor"/> itself.
    /// Default of 7 mirrors Travian's ~5-day shield, scaled up slightly for
    /// this genre's slower early curve.
    /// </summary>
    public double BaseShieldDays { get; set; } = 7;

    /// <summary>World not joinable before this instant. Null means open immediately.</summary>
    public DateTimeOffset? StartsAt { get; set; }

    /// <summary>Admin stop-join toggle. Existing players are unaffected.</summary>
    public bool JoinsClosed { get; set; }

    /// <summary>Joins remain allowed; the endboss fires at this instant. Null means none scheduled.</summary>
    public DateTimeOffset? EndbossAt { get; set; }

    /// <summary>
    /// Set once the endboss has fired, so the background trigger that scans for
    /// due worlds does not fire it a second time.
    /// </summary>
    public DateTimeOffset? EndbossTriggeredAt { get; set; }

    public List<IslandEntity> Islands { get; set; } = [];

    public List<SettlementEntity> Settlements { get; set; } = [];

    /// <summary>The world's clock, which converts wall time to game time.</summary>
    public GameClock ToClock() =>
        new(RunState, RunStateSince, TimeSpan.FromTicks(ClockOffsetTicks));

    public void ApplyClock(GameClock clock)
    {
        RunState = clock.State;
        RunStateSince = clock.StateSince;
        ClockOffsetTicks = clock.AccumulatedOffset.Ticks;
    }

    /// <summary>
    /// Whether the world currently accepts a new player. Computed here once so
    /// callers (the public world DTO, the join endpoint) never re-derive it.
    /// </summary>
    public Joinability DetermineJoinability(int playerCount, DateTimeOffset now)
    {
        if (Status != WorldStatus.Active)
        {
            return new Joinability(false, JoinableReason.WorldNotActive);
        }

        if (JoinsClosed)
        {
            return new Joinability(false, JoinableReason.JoinsClosed);
        }

        if (StartsAt is { } startsAt && now < startsAt)
        {
            return new Joinability(false, JoinableReason.NotStartedYet);
        }

        if (playerCount >= MaxPlayers)
        {
            return new Joinability(false, JoinableReason.Full);
        }

        return new Joinability(true, JoinableReason.None);
    }

    /// <summary>Rebuilds the generation options this world was created from.</summary>
    public WorldGenerationOptions ToGenerationOptions() => new()
    {
        Seed = Seed,
        Radius = Radius,
        IslandCellSize = IslandCellSize,
        IslandChance = IslandChance,
        IslandMinRadius = IslandMinRadius,
        IslandMaxRadius = IslandMaxRadius,
        BeachThreshold = BeachThreshold,
        MountainThreshold = MountainThreshold,
        MountainRockiness = MountainRockiness,
        ForestRockiness = ForestRockiness,
        MinimumIslandTiles = MinimumIslandTiles,
    };

    public void ApplyGenerationOptions(WorldGenerationOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        Seed = options.Seed;
        Radius = options.Radius;
        IslandCellSize = options.IslandCellSize;
        IslandChance = options.IslandChance;
        IslandMinRadius = options.IslandMinRadius;
        IslandMaxRadius = options.IslandMaxRadius;
        BeachThreshold = options.BeachThreshold;
        MountainThreshold = options.MountainThreshold;
        MountainRockiness = options.MountainRockiness;
        ForestRockiness = options.ForestRockiness;
        MinimumIslandTiles = options.MinimumIslandTiles;
    }
}
