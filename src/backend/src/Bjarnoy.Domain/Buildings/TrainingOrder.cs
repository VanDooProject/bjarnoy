using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>A batch of units being trained in one building of a settlement.</summary>
/// <remarks>
/// <para>
/// Mirrors <see cref="BuildOrder"/>'s "settled by clock, not by a background
/// worker" shape, but a batch has to drip out one unit at a time rather than
/// complete atomically — a 10-unit order that is 40% done by <c>now</c> should
/// show 4 units trained, not 0. <see cref="CompletedCount"/> derives that
/// purely from <see cref="StartedAt"/>, <see cref="PerUnitDuration"/> and
/// <see cref="Count"/>.
/// </para>
/// <para>
/// <see cref="Settlement.SettleTo"/> deliberately keeps the whole order in the
/// queue until every unit in it is done, rather than splitting it into a
/// "delivered so far" remainder each settle — the display-only
/// <see cref="CompletedCount"/> already gives the UI a live count, and
/// splitting the order would mean rewriting <see cref="StartedAt"/> and
/// re-deriving a new id on every settle for no behavioural gain in this PR.
/// A future phase could make training resumable mid-batch across a
/// cancellation; that is not needed yet.
/// </para>
/// </remarks>
public sealed record TrainingOrder
{
    public required Guid Id { get; init; }

    /// <summary>The hex of the building that trains this part. One building trains its parts one after another.</summary>
    public required HexCoord BuildingCoord { get; init; }

    public required UnitType UnitType { get; init; }

    /// <summary>How many units this batch trains.</summary>
    public required int Count { get; init; }

    /// <summary>
    /// When the first unit starts: now, or later when the building still trains earlier parts. A future value means the part is queued.
    /// </summary>
    public required DateTimeOffset StartedAt { get; init; }

    /// <summary>Time to train a single unit (fixed when ordered, from the building's level); the batch trains one after another.</summary>
    public required TimeSpan PerUnitDuration { get; init; }

    /// <summary>
    /// Cost multiplier actually charged for this batch, on top of the
    /// catalogue's flat per-unit <see cref="UnitDefinition.TrainingCost"/>
    /// (issue #55 §4: settler training escalates per settlement the
    /// player already holds — see
    /// <see cref="Settlers.Founding.CostMultiplier"/>). 1.0 for every
    /// ordinary unit. Set once by <see cref="Settlement.PlanTrain"/> and must
    /// be passed unchanged to <see cref="Settlement.EnqueueTraining"/> so the
    /// two agree on what was actually affordable — not persisted to the
    /// infrastructure layer's training-order entity: once paid for, nothing
    /// downstream needs to know the multiplier that produced the charge.
    /// </summary>
    public double CostMultiplier { get; init; } = 1.0;

    /// <summary>The instant the last unit in the batch finishes.</summary>
    public DateTimeOffset CompletesAt =>
        StartedAt + TimeSpan.FromTicks(PerUnitDuration.Ticks * Count);

    public bool IsComplete(DateTimeOffset now) => now >= CompletesAt;

    /// <summary>
    /// How many units of the batch are done as of <paramref name="now"/> —
    /// for display while the order is still queued. Not reflected in the
    /// garrison until the whole batch completes (see the type-level remarks).
    /// </summary>
    public int CompletedCount(DateTimeOffset now)
    {
        if (now <= StartedAt || PerUnitDuration <= TimeSpan.Zero)
        {
            return now <= StartedAt ? 0 : Count;
        }

        var elapsed = now - StartedAt;
        var completed = (int)(elapsed.Ticks / PerUnitDuration.Ticks);
        return Math.Clamp(completed, 0, Count);
    }

    public TimeSpan RemainingAt(DateTimeOffset now)
    {
        var remaining = CompletesAt - now;
        return remaining > TimeSpan.Zero ? remaining : TimeSpan.Zero;
    }
}

/// <summary>Why a training request was refused.</summary>
public enum TrainRejection
{
    None = 0,
    UnitNotAvailable,
    TrainingQueueFull,
    NotEnoughResources,
    InvalidCount,

    /// <summary>
    /// A <see cref="Units.UnitClass.Ship"/> unit type was requested at a
    /// settlement that claims no shoreline hex (issue #40 phase 6, design doc
    /// §8) — see <see cref="Settlement.PlanTrain"/>'s <c>hasShoreline</c>
    /// parameter. Independent of any future Shipyard building requirement.
    /// </summary>
    SettlementNotCoastal,

    /// <summary>
    /// The building the unit is trained in stands outside the realm and has no function until the realm reaches it again
    /// (<c>docs/design/economy.md</c> section 5, "Buildings outside the realm decay").
    /// </summary>
    BuildingOutsideRealm,

    /// <summary>The requested hex holds no building of the type that trains the unit.</summary>
    WrongBuilding,

    /// <summary>The "fastest" split is a premium feature.</summary>
    PremiumRequired,
}

/// <summary>How an order is spread over the buildings that can train the unit.</summary>
public enum TrainingSplit
{
    /// <summary>Only the requested building.</summary>
    Here = 0,

    /// <summary>Over all functioning buildings of the type that have room, the count divided evenly (remainder to the highest levels).</summary>
    Evenly,

    /// <summary>Premium: split so every part finishes as early as possible, counting each building's backlog and speed.</summary>
    Fastest,
}

/// <summary>The outcome of asking to train units: one part per building that gets units.</summary>
public sealed record TrainDecision(TrainRejection Rejection, IReadOnlyList<TrainingOrder> Orders)
{
    public bool Accepted => Rejection == TrainRejection.None && Orders.Count > 0;

    public static TrainDecision Rejected(TrainRejection reason) => new(reason, []);

    public static TrainDecision Accept(IReadOnlyList<TrainingOrder> orders) => new(TrainRejection.None, orders);
}
