using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>A building standing on a hex.</summary>
public readonly record struct PlacedBuilding(HexCoord Coord, BuildingType Type, int Level);

/// <summary>
/// A settlement's rules: what it holds, what stands in it, and what it may
/// build next.
/// </summary>
/// <remarks>
/// <para>
/// Pure and immutable — it takes its clock as a parameter and never reaches for
/// a singleton, so every rule here is testable without a host or a database.
/// The legacy <c>BuildHelper</c> could not be: it newed up its own repositories
/// in a field initialiser and read <c>BuildTechController.Instance</c> and
/// <c>Time.Now</c> as statics.
/// </para>
/// <para>
/// Both the resource stock and the build queue settle by clock. Reading a
/// settlement at time T tells you what it looks like at T without anything
/// having run in between.
/// </para>
/// </remarks>
public sealed record Settlement
{
    /// <summary>Orders that may be queued at once (MECHANICS.md: build slots).</summary>
    public const int MaxQueueLength = 3;

    public required Guid Id { get; init; }

    public required string Name { get; init; }

    /// <summary>Where the longhouse stands.</summary>
    public required HexCoord Centre { get; init; }

    public required ResourcePool Resources { get; init; }

    public IReadOnlyList<PlacedBuilding> Buildings { get; init; } = [];

    public IReadOnlyList<BuildOrder> Queue { get; init; } = [];

    public int LonghouseLevel =>
        Buildings.FirstOrDefault(b => b.Type == BuildingType.Longhouse).Level;

    /// <summary>
    /// Claim radius, driven by longhouse level (MECHANICS.md §2: borders grow
    /// when the anchor levels up).
    /// </summary>
    public int ClaimRadius => 1 + (LonghouseLevel / 2);

    /// <summary>Hexes this settlement has claimed.</summary>
    public bool Claims(HexCoord coord) => Centre.DistanceTo(coord) <= ClaimRadius;

    /// <summary>
    /// The settlement as of <paramref name="now"/>: every order whose time has
    /// come is applied, and production and capacity are recomputed from what is
    /// then standing.
    /// </summary>
    /// <remarks>
    /// The caller decides whether the result is worth persisting: when
    /// <see cref="SettleResult.Changed"/> is false nothing completed, the pool
    /// was never rolled forward, and there is nothing to write.
    /// </remarks>
    /// <param name="speedFactor">
    /// The world's current <c>SpeedFactor</c> — multiplies the production rate
    /// each completed building contributes from its own completion instant
    /// onward. A change in speed is never applied retroactively: history
    /// already settled under the old factor is untouched (see
    /// <c>SettlementService.RetuneSpeedAsync</c>, which settles every
    /// settlement under the old factor before the new one is persisted).
    /// </param>
    public SettleResult SettleTo(DateTimeOffset now, double speedFactor = 1.0)
    {
        var due = Queue.Where(o => o.IsComplete(now)).OrderBy(o => o.CompletesAt).ToList();
        if (due.Count == 0)
        {
            return new SettleResult(this, Changed: false, []);
        }

        var buildings = Buildings.ToList();
        var resources = Resources;

        foreach (var order in due)
        {
            var index = buildings.FindIndex(b => b.Coord == order.Coord);
            if (index >= 0)
            {
                buildings[index] = buildings[index] with { Type = order.Type, Level = order.TargetLevel };
            }
            else
            {
                buildings.Add(new PlacedBuilding(order.Coord, order.Type, order.TargetLevel));
            }

            // Each completion changes the rate from its own instant, so a
            // building finished an hour ago has been producing for that hour.
            var (production, capacity) = BuildingCatalogue.Totals(
                buildings.Select(b => (b.Type, b.Level)));
            resources = resources.WithRate(production * speedFactor, capacity, order.CompletesAt);
        }

        var settled = this with
        {
            Buildings = buildings,
            Queue = [.. Queue.Where(o => !o.IsComplete(now))],
            Resources = resources,
        };

        return new SettleResult(settled, Changed: true, due);
    }

    /// <summary>
    /// Decides whether <paramref name="type"/> may be built on
    /// <paramref name="coord"/>, and at what cost.
    /// </summary>
    /// <remarks>
    /// Call on an already-settled settlement, so the queue and stock reflect
    /// <paramref name="now"/>.
    /// </remarks>
    /// <param name="speedFactor">
    /// The world's current <c>SpeedFactor</c> — divides the base build
    /// duration, so a factor of 2 finishes a build in half the time.
    /// </param>
    public BuildDecision PlanBuild(
        BuildingType type,
        HexCoord coord,
        Terrain terrain,
        DateTimeOffset now,
        Guid orderId,
        double speedFactor = 1.0)
    {
        if (!Claims(coord))
        {
            return BuildDecision.Rejected(BuildRejection.HexNotInSettlement);
        }

        if (Queue.Count >= MaxQueueLength)
        {
            return BuildDecision.Rejected(BuildRejection.QueueFull);
        }

        if (Queue.Any(o => o.Coord == coord))
        {
            return BuildDecision.Rejected(BuildRejection.AlreadyQueuedOnHex);
        }

        var existing = Buildings.FirstOrDefault(b => b.Coord == coord);
        var occupied = Buildings.Any(b => b.Coord == coord);

        if (occupied && existing.Type != type)
        {
            // A hex holds one building; replacing means razing first.
            return BuildDecision.Rejected(BuildRejection.HexOccupied);
        }

        var targetLevel = occupied ? existing.Level + 1 : 1;
        if (targetLevel > BuildingCatalogue.MaxLevel)
        {
            return BuildDecision.Rejected(BuildRejection.MaxLevelReached);
        }

        var definition = BuildingCatalogue.TryGet(type, targetLevel);
        if (definition is null)
        {
            return BuildDecision.Rejected(BuildRejection.UnknownBuildingLevel);
        }

        if (!definition.AllowsTerrain(terrain))
        {
            return BuildDecision.Rejected(BuildRejection.TerrainNotAllowed);
        }

        // The longhouse is its own prerequisite at level 1, so founding works.
        var longhouse = LonghouseLevel;
        if (!(type == BuildingType.Longhouse && targetLevel == 1)
            && longhouse < definition.RequiredLonghouseLevel)
        {
            return BuildDecision.Rejected(BuildRejection.LonghouseTooLow);
        }

        if (!Resources.CanAfford(definition.Cost, now))
        {
            return BuildDecision.Rejected(BuildRejection.NotEnoughResources);
        }

        var duration = speedFactor == 1.0
            ? definition.BuildDuration
            : TimeSpan.FromTicks((long)(definition.BuildDuration.Ticks / speedFactor));

        return BuildDecision.Accept(new BuildOrder
        {
            Id = orderId,
            Type = type,
            TargetLevel = targetLevel,
            Coord = coord,
            StartedAt = now,
            CompletesAt = now + duration,
        });
    }

    /// <summary>
    /// Pays for <paramref name="order"/> and appends it to the queue.
    /// </summary>
    public Settlement Enqueue(BuildOrder order, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(order);

        var definition = BuildingCatalogue.Get(order.Type, order.TargetLevel);
        if (!Resources.TrySpend(definition.Cost, now, out var paid))
        {
            throw new InvalidOperationException(
                "Cannot enqueue a build that is not affordable; call PlanBuild first.");
        }

        return this with { Resources = paid, Queue = [.. Queue, order] };
    }

    /// <summary>
    /// Admin god-mode: sets an already-placed building's level directly,
    /// bypassing cost and queueing, and recomputes production/capacity exactly
    /// as a normal build completion would.
    /// </summary>
    /// <remarks>
    /// Call on an already-settled settlement (see <see cref="SettleTo"/>) so
    /// the rate change is stamped from "now" rather than retroactively
    /// changing output already accrued — the same rule <see cref="SettleTo"/>
    /// itself follows per completed order.
    /// </remarks>
    public SetBuildingLevelResult SetBuildingLevel(HexCoord coord, int level, DateTimeOffset now, double speedFactor = 1.0)
    {
        var buildings = Buildings.ToList();
        var index = buildings.FindIndex(b => b.Coord == coord);
        if (index < 0)
        {
            return SetBuildingLevelResult.Rejected(SetBuildingLevelRejection.BuildingNotFound);
        }

        var type = buildings[index].Type;
        if (BuildingCatalogue.TryGet(type, level) is null)
        {
            return SetBuildingLevelResult.Rejected(SetBuildingLevelRejection.InvalidLevel);
        }

        buildings[index] = buildings[index] with { Level = level };

        var (production, capacity) = BuildingCatalogue.Totals(buildings.Select(b => (b.Type, b.Level)));
        var resources = Resources.WithRate(production * speedFactor, capacity, now);

        return SetBuildingLevelResult.Accept(this with { Buildings = buildings, Resources = resources });
    }

    /// <summary>Production and capacity implied by what currently stands.</summary>
    public (ResourceAmounts ProductionPerHour, ResourceAmounts Capacity) CurrentTotals(double speedFactor = 1.0)
    {
        var (production, capacity) = BuildingCatalogue.Totals(Buildings.Select(b => (b.Type, b.Level)));
        return (production * speedFactor, capacity);
    }
}

/// <param name="Changed">
/// False when nothing was due, meaning the caller has nothing to persist.
/// </param>
/// <param name="Completed">Orders that finished during this settle.</param>
public sealed record SettleResult(
    Settlement Settlement,
    bool Changed,
    IReadOnlyList<BuildOrder> Completed);
