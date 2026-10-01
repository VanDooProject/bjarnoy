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

    /// <summary>
    /// <see cref="WorldGenerationOptions.IslandMaxReach"/> and <see cref="WorldGenerationOptions.IslandMinGap"/>
    /// (the island-density change). Worlds created before them were migrated to 0, the legacy
    /// rule (one-ring reach budget, no min gap), so their terrain does not change.
    /// </summary>
    public double IslandMaxReach { get; set; }

    public double IslandMinGap { get; set; }

    public double IslandMinWidth { get; set; }

    public double IslandMaxWidth { get; set; }

    public double BeachThreshold { get; set; }

    public double MountainThreshold { get; set; }

    public double MountainRockiness { get; set; }

    public double ForestRockiness { get; set; }

    public int MinimumIslandTiles { get; set; }

    /// <summary>
    /// Island-shape parameters of the v3 generator (spine distance field with
    /// fractal coasts, see <c>docs/design/river-generation.md</c>). New worlds
    /// get <see cref="WorldGenerationOptions"/>'s own C# defaults; the migration
    /// that introduced them reset every existing row to those defaults, so the
    /// old lobe-chain columns are gone.
    /// </summary>
    public int IslandMinSegments { get; set; }

    public int IslandMaxSegments { get; set; }

    public double IslandMinElongation { get; set; }

    public double IslandMaxElongation { get; set; }

    public double IslandMinBend { get; set; }

    public double IslandMaxBend { get; set; }

    public double IslandCoastWarp { get; set; }

    public double IslandCoastWarpScale { get; set; }

    public double IslandCoastNoise { get; set; }

    public double IslandCoastNoiseScale { get; set; }

    public double IslandSmallShare { get; set; }

    public double IslandLargeShare { get; set; }

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

    /// <summary>World not joinable before this instant. Null means open immediately.</summary>
    public DateTimeOffset? StartsAt { get; set; }

    /// <summary>Admin stop-join toggle. Existing players are unaffected.</summary>
    public bool JoinsClosed { get; set; }

    /// <summary>
    /// Opt-in per world for the frozen isles; when enabled, frozen isles will
    /// spawn in the far north of the world and carry plenty of ground
    /// treasures — that generation is not implemented yet, today the flag
    /// only tells clients to load the frozen art pack (<c>frozen-*</c> atlas
    /// pages).
    /// </summary>
    public bool FrozenIslesEnabled { get; set; }

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
        IslandMaxReach = IslandMaxReach,
        IslandMinGap = IslandMinGap,
        IslandMinWidth = IslandMinWidth,
        IslandMaxWidth = IslandMaxWidth,
        BeachThreshold = BeachThreshold,
        MountainThreshold = MountainThreshold,
        MountainRockiness = MountainRockiness,
        ForestRockiness = ForestRockiness,
        MinimumIslandTiles = MinimumIslandTiles,
        IslandMinSegments = IslandMinSegments,
        IslandMaxSegments = IslandMaxSegments,
        IslandMinElongation = IslandMinElongation,
        IslandMaxElongation = IslandMaxElongation,
        IslandMinBend = IslandMinBend,
        IslandMaxBend = IslandMaxBend,
        IslandCoastWarp = IslandCoastWarp,
        IslandCoastWarpScale = IslandCoastWarpScale,
        IslandCoastNoise = IslandCoastNoise,
        IslandCoastNoiseScale = IslandCoastNoiseScale,
        IslandSmallShare = IslandSmallShare,
        IslandLargeShare = IslandLargeShare,
    };

    public void ApplyGenerationOptions(WorldGenerationOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        Seed = options.Seed;
        Radius = options.Radius;
        IslandCellSize = options.IslandCellSize;
        IslandChance = options.IslandChance;
        IslandMaxReach = options.IslandMaxReach;
        IslandMinGap = options.IslandMinGap;
        IslandMinWidth = options.IslandMinWidth;
        IslandMaxWidth = options.IslandMaxWidth;
        BeachThreshold = options.BeachThreshold;
        MountainThreshold = options.MountainThreshold;
        MountainRockiness = options.MountainRockiness;
        ForestRockiness = options.ForestRockiness;
        MinimumIslandTiles = options.MinimumIslandTiles;
        IslandMinSegments = options.IslandMinSegments;
        IslandMaxSegments = options.IslandMaxSegments;
        IslandMinElongation = options.IslandMinElongation;
        IslandMaxElongation = options.IslandMaxElongation;
        IslandMinBend = options.IslandMinBend;
        IslandMaxBend = options.IslandMaxBend;
        IslandCoastWarp = options.IslandCoastWarp;
        IslandCoastWarpScale = options.IslandCoastWarpScale;
        IslandCoastNoise = options.IslandCoastNoise;
        IslandCoastNoiseScale = options.IslandCoastNoiseScale;
        IslandSmallShare = options.IslandSmallShare;
        IslandLargeShare = options.IslandLargeShare;
    }
}
