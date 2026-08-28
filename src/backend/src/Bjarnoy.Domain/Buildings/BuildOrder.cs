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

    public required DateTimeOffset StartedAt { get; init; }

    public required DateTimeOffset CompletesAt { get; init; }

    public bool IsComplete(DateTimeOffset now) => now >= CompletesAt;

    public TimeSpan RemainingAt(DateTimeOffset now)
    {
        var remaining = CompletesAt - now;
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
    QueueFull,
    LevelSkipped,
    AlreadyQueuedOnHex,
    MaxLevelReached,
}

/// <summary>The outcome of asking to build something.</summary>
public sealed record BuildDecision(BuildRejection Rejection, BuildOrder? Order = null)
{
    public bool Accepted => Rejection == BuildRejection.None && Order is not null;

    public static BuildDecision Rejected(BuildRejection reason) => new(reason);

    public static BuildDecision Accept(BuildOrder order) => new(BuildRejection.None, order);
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
