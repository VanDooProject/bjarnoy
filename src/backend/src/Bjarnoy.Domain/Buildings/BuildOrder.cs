using Bjarnoy.Domain.Economy;
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

    /// <summary>
    /// The level the building stands at once this order completes: one above the standing level for a build, one below it for a raze
    /// (0 = the building is removed).
    /// </summary>
    public required int TargetLevel { get; init; }

    /// <summary>Whether this order builds a level or razes one.</summary>
    public BuildOrderKind Kind { get; init; } = BuildOrderKind.Build;

    /// <summary>True for a raze order (<see cref="BuildOrderKind.Raze"/>).</summary>
    public bool IsRaze => Kind == BuildOrderKind.Raze;

    /// <summary>
    /// The catalogue level this order works on: the level being built, or the level being razed. Its definition gives the
    /// slot cost, the duration and the refund.
    /// </summary>
    public int LevelInWork => IsRaze ? TargetLevel + 1 : TargetLevel;

    /// <summary>What this order costs up front: the level's cost for a build, nothing for a raze.</summary>
    public ResourceAmounts Cost => IsRaze ? ResourceAmounts.Zero : BuildingCatalogue.Get(Type, TargetLevel).Cost;

    /// <summary>What finishing a raze pays back: a third of the razed level's cost, rounded down per resource. Zero for a build.</summary>
    public ResourceAmounts Refund => IsRaze ? RefundOf(BuildingCatalogue.Get(Type, LevelInWork).Cost) : ResourceAmounts.Zero;

    // Divides rather than multiplies by 1/3: 300 * (1.0 / 3) is 99.99999999999999 and would floor to 99.
    private static ResourceAmounts RefundOf(ResourceAmounts cost) => new ResourceAmounts(
        cost.Wood / BuildingCatalogue.RazeRefundDivisor,
        cost.Stone / BuildingCatalogue.RazeRefundDivisor,
        cost.Food / BuildingCatalogue.RazeRefundDivisor,
        cost.Iron / BuildingCatalogue.RazeRefundDivisor).Floor();

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

/// <summary>What a <see cref="BuildOrder"/> does to its hex.</summary>
public enum BuildOrderKind
{
    Build = 0,
    Raze = 1,
}

public static class BuildOrderKindExtensions
{
    /// <summary>The lowercase wire name (<c>"build"</c> / <c>"raze"</c>).</summary>
    public static string ToWireName(this BuildOrderKind kind) => kind switch
    {
        BuildOrderKind.Raze => "raze",
        _ => "build",
    };
}

/// <summary>Why a build was refused.</summary>
public enum BuildRejection
{
    None = 0,
    UnknownBuildingLevel,
    TerrainNotAllowed,
    HexNotInSettlement,

    /// <summary>The hex belongs to a giant's 7-hex footprint — never buildable, regardless of claim (the territory rule).</summary>
    HexOccupiedByGiant,
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
    RequiredBuildingTooLow,

    /// <summary>
    /// A shrine to this god already stands somewhere else on the island —
    /// never a second one to the same god (see <see cref="BuildingCatalogue.GodOf"/>).
    /// </summary>
    ShrineGodAlreadyOnIsland,

    /// <summary>
    /// A shrine (of any god, see <see cref="BuildingCatalogue.GodOf"/>) was
    /// ordered on a new hex while this settlement already holds one — standing
    /// or queued. A settlement raises at most one shrine in total; levelling
    /// the existing shrine is never refused for this reason.
    /// </summary>
    SettlementAlreadyHasShrine,

    /// <summary>
    /// PumpkinFarm was ordered on a Wheat-soil island — it's the bonus crop
    /// only a Pumpkin-soil island (<see cref="World.SoilType"/>) unlocks;
    /// Farm stays buildable everywhere regardless of soil. See
    /// <see cref="Settlement.PlanBuild"/>'s islandSoil parameter.
    /// </summary>
    WrongCropForIslandSoil,

    /// <summary>No construction slot is free, and there is no waiting-queue room either (the non-premium wall).</summary>
    NoFreeSlot,

    /// <summary>
    /// A new Tower was ordered while the settlement already holds (standing
    /// plus queued) as many as its Longhouse level allows — see
    /// <see cref="BuildingCatalogue.MaxTowers"/>. Upgrading an existing tower
    /// is never refused for this reason.
    /// </summary>
    TowerLimitReached,

    /// <summary>
    /// A new Great Storehouse was ordered while the settlement does not hold one more Storage House at level
    /// <see cref="BuildingCatalogue.GreatStorehouseStorageHouseLevel"/> than it has Great Storehouses (standing plus queued):
    /// the n-th Great Storehouse needs n maxed Storage Houses. Upgrading one is never refused for this reason.
    /// </summary>
    GreatStorehouseNeedsStorageHouses,

    /// <summary>
    /// A wildlife camp stands on the hex — never buildable while the camp is there. Every camp
    /// counts as guarded for now (no clearing yet), see <c>docs/design/wildlife-camps.md</c>.
    /// </summary>
    HexOccupiedByCamp,

    /// <summary>
    /// A palisade (or gate) would leave some wall hex with three or more wall neighbours: walls never branch
    /// (<see cref="Palisades.PalisadeRules"/>).
    /// </summary>
    PalisadeWouldBranch,

    /// <summary>
    /// A gate was ordered where its piece would not resolve to a straight (or where placing it would turn a neighbouring gate): a gate only
    /// stands between two opposite wall hexes.
    /// </summary>
    GateNotOnStraight,

    /// <summary>
    /// A bridge was ordered on a river hex that is not a wide river (a stream, or a river tile the army already crosses): bridges are
    /// for the impassable wide rivers only.
    /// </summary>
    BridgeNeedsWideRiver,

    /// <summary>
    /// A new building of a type that is switched off for placement (<see cref="BuildingCatalogue.NewPlacementDisabled"/>, currently the
    /// Quarry) was ordered. Upgrading one that already stands is never refused for this reason.
    /// </summary>
    NewPlacementDisabled,

    /// <summary>
    /// An Utgard wall hex or a Jötun watchtower stands on the hex — never buildable (<c>docs/design/endgame.md</c>). Rubble of a
    /// breached wall counts: the hex stays taken.
    /// </summary>
    HexOccupiedByEndgameSite,

    /// <summary>A raze was ordered on a hex with no building (nothing stands there, or only a level-0 foundation).</summary>
    NoBuildingOnHex,

    /// <summary>A raze was ordered on the Longhouse, which can never be razed.</summary>
    LonghouseCannotBeRazed,
}

/// <summary>The outcome of asking to build something.</summary>
/// <param name="MissingPrerequisite">
/// Set only for <see cref="BuildRejection.RequiredBuildingTooLow"/>: the first
/// prerequisite (in catalogue order) the settlement does not meet, so the
/// caller can name the building that is missing rather than only report that
/// one is.
/// </param>
public sealed record BuildDecision(
    BuildRejection Rejection,
    BuildOrder? Order = null,
    BuildingPrerequisite? MissingPrerequisite = null)
{
    public bool Accepted => Rejection == BuildRejection.None && Order is not null;

    public static BuildDecision Rejected(BuildRejection reason) => new(reason);

    public static BuildDecision Rejected(BuildRejection reason, BuildingPrerequisite missing) =>
        new(reason, null, missing);

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
