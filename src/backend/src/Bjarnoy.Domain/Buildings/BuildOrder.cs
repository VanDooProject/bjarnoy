using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>An entry in a settlement's build queue.</summary>
/// <remarks>
/// Like the resource pool, a queue entry is settled by reading a clock rather
/// than by a background worker: an order is complete when
/// <see cref="CompletesAt"/> has passed. The legacy equivalent carried an
/// explicit <c>eQueueProcessingState</c> that a <c>QueueObserverService</c> had
/// to advance, which meant the truth of "is it built" depended on whether that
/// service had run.
/// </remarks>
public sealed record BuildOrder
{
    public required Guid Id { get; init; }

    public required BuildingType Type { get; init; }

    /// <summary>The level this order produces when it completes.</summary>
    public required int TargetLevel { get; init; }

    /// <summary>The hex the building stands on.</summary>
    public required HexCoord Coord { get; init; }

    /// <summary>
    /// When the player ordered this — the stable sort/FIFO key for waiting
    /// orders (<see cref="IsWaiting"/>), and for the same-hex contiguity rule
    /// once <c>maxOrdersPerHex &gt; 1</c> is switched on. Never changes once set.
    /// </summary>
    public required DateTimeOffset QueuedAt { get; init; }

    /// <summary>
    /// The catalogue's unscaled build duration for this order's level —
    /// consulted only while <see cref="IsWaiting"/>, since a waiting order
    /// must be timed by the speed factor in force when it actually starts,
    /// not the one in force when it was queued
    /// (<c>Settlement.PromoteWaitingOrders</c>). Once started,
    /// <see cref="StartedAt"/>/<see cref="CompletesAt"/> are authoritative and
    /// this becomes vestigial.
    /// </summary>
    public required TimeSpan BaseDuration { get; init; }

    /// <summary><see langword="null"/> while waiting for a construction slot — see <see cref="IsWaiting"/>.</summary>
    public DateTimeOffset? StartedAt { get; init; }

    /// <summary>
    /// A stored value, stamped once at promotion from the speed factor in
    /// force at that instant — never derived from <see cref="StartedAt"/> and
    /// <see cref="BaseDuration"/>, or a later world speed retune would
    /// silently move every in-flight order's completion. <see langword="null"/>
    /// while <see cref="IsWaiting"/>.
    /// </summary>
    public DateTimeOffset? CompletesAt { get; init; }

    /// <summary>True when this order has not yet started — waiting for a free construction slot in the premium queue.</summary>
    public bool IsWaiting => StartedAt is null;

    public bool IsComplete(DateTimeOffset now) => CompletesAt is { } c && now >= c;

    public TimeSpan RemainingAt(DateTimeOffset now)
    {
        if (CompletesAt is not { } c)
        {
            return TimeSpan.Zero;
        }

        var remaining = c - now;
        return remaining > TimeSpan.Zero ? remaining : TimeSpan.Zero;
    }
}

/// <summary>Why a build was refused.</summary>
public enum BuildRejection
{
    None = 0,
    UnknownBuildingLevel,
    TerrainNotAllowed,
    HexNotInSettlement,
    HexOccupied,
    NotEnoughResources,
    LonghouseTooLow,

    /// <summary>The premium waiting queue itself is full — a slot never freed up, but the player could still queue if it had room.</summary>
    QueueFull,
    LevelSkipped,

    /// <summary>The hex is already at its <c>maxOrdersPerHex</c> limit of queued/building orders.</summary>
    AlreadyQueuedOnHex,
    MaxLevelReached,
    LonghousePlacementNotAllowed,

    /// <summary>No construction slot is free, and there is no waiting-queue room either (the non-premium wall).</summary>
    NoFreeSlot,
}

/// <summary>The outcome of asking to build something.</summary>
public sealed record BuildDecision(BuildRejection Rejection, BuildOrder? Order = null)
{
    public bool Accepted => Rejection == BuildRejection.None && Order is not null;

    public static BuildDecision Rejected(BuildRejection reason) => new(reason);

    public static BuildDecision Accept(BuildOrder order) => new(BuildRejection.None, order);
}

/// <summary>Why cancelling a queued build order was refused.</summary>
public enum CancelBuildRejection
{
    None = 0,
    OrderNotFound,
}

/// <summary>The outcome of cancelling a queued build order.</summary>
public sealed record CancelBuildResult(CancelBuildRejection Rejection, Settlement? Settlement = null)
{
    public bool Accepted => Rejection == CancelBuildRejection.None && Settlement is not null;

    public static CancelBuildResult Rejected(CancelBuildRejection reason) => new(reason);

    public static CancelBuildResult Accept(Settlement settlement) => new(CancelBuildRejection.None, settlement);
}

/// <summary>Why an admin's direct building-level set was refused.</summary>
public enum SetBuildingLevelRejection
{
    None = 0,
    BuildingNotFound,
    InvalidLevel,
}

/// <summary>The outcome of an admin setting a placed building's level directly.</summary>
public sealed record SetBuildingLevelResult(SetBuildingLevelRejection Rejection, Settlement? Settlement = null)
{
    public bool Accepted => Rejection == SetBuildingLevelRejection.None && Settlement is not null;

    public static SetBuildingLevelResult Rejected(SetBuildingLevelRejection reason) => new(reason);

    public static SetBuildingLevelResult Accept(Settlement settlement) => new(SetBuildingLevelRejection.None, settlement);
}
