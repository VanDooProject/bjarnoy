using Bjarnoy.Domain.Units;

namespace Bjarnoy.Domain.Buildings;

/// <summary>A batch of units being trained at a settlement.</summary>
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

    public required UnitType UnitType { get; init; }

    /// <summary>How many units this batch trains.</summary>
    public required int Count { get; init; }

    public required DateTimeOffset StartedAt { get; init; }

    /// <summary>Time to train a single unit; the batch trains one after another.</summary>
    public required TimeSpan PerUnitDuration { get; init; }

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
}

/// <summary>The outcome of asking to train units.</summary>
public sealed record TrainDecision(TrainRejection Rejection, TrainingOrder? Order = null)
{
    public bool Accepted => Rejection == TrainRejection.None && Order is not null;

    public static TrainDecision Rejected(TrainRejection reason) => new(reason);

    public static TrainDecision Accept(TrainingOrder order) => new(TrainRejection.None, order);
}
