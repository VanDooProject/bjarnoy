using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
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

    /// <summary>
    /// Training orders that may be queued at once. A separate, more generous
    /// limit from <see cref="MaxQueueLength"/>: build slots gate a scarce
    /// resource (hexes to build on), while training batches are just requests
    /// to spend resources over time, so there is no reason to make it as
    /// scarce.
    /// </summary>
    public const int MaxTrainingQueueLength = 5;

    public required Guid Id { get; init; }

    public required string Name { get; init; }

    /// <summary>Where the longhouse stands.</summary>
    public required HexCoord Centre { get; init; }

    public required ResourcePool Resources { get; init; }

    public IReadOnlyList<PlacedBuilding> Buildings { get; init; } = [];

    public IReadOnlyList<BuildOrder> Queue { get; init; } = [];

    /// <summary>Units standing at this settlement. Not armies in the field — see issue #40 phase 2+.</summary>
    public IReadOnlyList<UnitStack> Garrison { get; init; } = [];

    public IReadOnlyList<TrainingOrder> TrainingQueue { get; init; } = [];

    public int LonghouseLevel =>
        Buildings.FirstOrDefault(b => b.Type == BuildingType.Longhouse).Level;

    /// <summary>Food consumed per hour by everything currently in <see cref="Garrison"/>.</summary>
    public double UpkeepPerHour => TotalUpkeepPerHour(Garrison);

    /// <summary>
    /// Claim radius, driven by longhouse level (MECHANICS.md §2: borders grow
    /// when the anchor levels up).
    /// </summary>
    public int ClaimRadius => 1 + (LonghouseLevel / 2);

    /// <summary>Hexes this settlement has claimed.</summary>
    public bool Claims(HexCoord coord) => Centre.DistanceTo(coord) <= ClaimRadius;

    /// <summary>
    /// This settlement's leaderboard score (issue #43): the triangular number
    /// <c>L(L+1)/2</c> of each building's level, summed over <see cref="Buildings"/>.
    /// Rewards tall building over wide spam and needs no catalogue lookup or
    /// balance table — a per-<see cref="BuildingType"/> weight is the obvious
    /// later refinement, not a v1 concern.
    /// </summary>
    public int Score => Buildings.Sum(b => b.Level * (b.Level + 1) / 2);

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
        var dueBuilds = Queue.Where(o => o.IsComplete(now)).ToList();
        var dueTraining = TrainingQueue.Where(o => o.IsComplete(now)).ToList();

        var buildings = Buildings.ToList();
        var garrison = Garrison.ToList();
        var resources = Resources;

        // Build completions and training completions both change the rate
        // (buildings change gross production, a finished batch changes
        // upkeep), so they are merged into one chronological timeline rather
        // than applied as two separate passes — otherwise a training batch
        // that finished between two build completions would be rated as if
        // it existed the whole time, or not at all.
        var events = dueBuilds
            .Select(o => (Time: o.CompletesAt, Build: (BuildOrder?)o, Train: (TrainingOrder?)null))
            .Concat(dueTraining.Select(o => (Time: o.CompletesAt, Build: (BuildOrder?)null, Train: (TrainingOrder?)o)))
            .OrderBy(e => e.Time)
            .ToList();

        foreach (var (time, buildOrder, trainOrder) in events)
        {
            if (buildOrder is { } order)
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
            }
            else if (trainOrder is { } train)
            {
                // The whole batch lands in the garrison at once, at the
                // instant the last unit finishes — see TrainingOrder's
                // remarks for why a batch is not split as it partially
                // completes.
                AddToGarrison(garrison, train.UnitType, train.Count);
            }

            // Each completion changes the rate from its own instant, so a
            // building (or batch) finished an hour ago has applied for that
            // hour.
            var (production, capacity) = BuildingCatalogue.Totals(
                buildings.Select(b => (b.Type, b.Level)));
            resources = resources.WithRate(ApplyUpkeep(production * speedFactor, garrison), capacity, time);
        }

        var (finalProduction, finalCapacity) = BuildingCatalogue.Totals(buildings.Select(b => (b.Type, b.Level)));
        finalProduction *= speedFactor;

        // Starvation is checked every settle, not only when something
        // completed: a garrison can run its settlement out of food purely by
        // sitting there while nobody looks, with no order due at all.
        var deaths = ApplyStarvation(ref resources, garrison, finalProduction, finalCapacity, now);

        var changed = dueBuilds.Count > 0 || dueTraining.Count > 0 || deaths.Count > 0;
        if (!changed)
        {
            return new SettleResult(this, Changed: false, [], [], []);
        }

        var settled = this with
        {
            Buildings = buildings,
            Garrison = garrison,
            Queue = [.. Queue.Where(o => !o.IsComplete(now))],
            TrainingQueue = [.. TrainingQueue.Where(o => !o.IsComplete(now))],
            Resources = resources,
        };

        return new SettleResult(settled, Changed: true, dueBuilds, dueTraining, deaths);
    }

    /// <summary>
    /// Kills units when the garrison's upkeep has outrun production and the
    /// stock would otherwise go negative.
    /// </summary>
    /// <remarks>
    /// Simplification for v1 (issue #40 phase 1): rather than a gradual
    /// per-hour death rate, enough units are killed all at once, at the
    /// instant food would cross zero, to make the net food rate non-negative
    /// again. A more gradual timeline is future work per the design doc.
    /// Units are removed highest-upkeep-stack-first — proportional loss
    /// across every stack would be more "fair" but is unnecessary complexity
    /// for a first pass.
    /// </remarks>
    private static IReadOnlyList<UnitStack> ApplyStarvation(
        ref ResourcePool resources,
        List<UnitStack> garrison,
        ResourceAmounts grossProductionPerHour,
        ResourceAmounts capacity,
        DateTimeOffset now)
    {
        if (resources.RatePerHour.Food >= 0)
        {
            return [];
        }

        // How long, at the current (pre-starvation) rate, until the food
        // stock as of resources.SettledAt would hit zero.
        var hoursToZero = Math.Max(0, -resources.Stock.Food / resources.RatePerHour.Food);
        var crossingTime = resources.SettledAt.AddHours(hoursToZero);
        if (crossingTime > now)
        {
            // Still short by `now`, but not yet actually starving.
            return [];
        }

        // Settle to the crossing instant under the old rate first — the food
        // produced up to that moment is real and must not be lost or
        // retroactively rescaled by the rate change starvation is about to
        // cause.
        resources = resources.SettledTo(crossingTime);

        var deaths = new List<UnitStack>();
        while (garrison.Count > 0)
        {
            var netFood = grossProductionPerHour.Food - TotalUpkeepPerHour(garrison);
            if (netFood >= 0)
            {
                break;
            }

            var index = HighestUpkeepIndex(garrison);
            var stack = garrison[index];
            var perUnitUpkeep = UnitCatalogue.Get(stack.Type).UpkeepPerHour;
            var deficit = -netFood;
            var unitsToKill = perUnitUpkeep > 0
                ? Math.Min(stack.Count, (int)Math.Ceiling(deficit / perUnitUpkeep))
                : stack.Count;

            deaths.Add(new UnitStack(stack.Type, unitsToKill));

            if (unitsToKill >= stack.Count)
            {
                garrison.RemoveAt(index);
            }
            else
            {
                garrison[index] = stack with { Count = stack.Count - unitsToKill };
            }
        }

        var finalNetFood = grossProductionPerHour.Food - TotalUpkeepPerHour(garrison);
        resources = resources.WithRate(
            grossProductionPerHour with { Food = finalNetFood }, capacity, crossingTime);

        return deaths;
    }

    private static void AddToGarrison(List<UnitStack> garrison, UnitType type, int count)
    {
        var index = garrison.FindIndex(s => s.Type == type);
        if (index >= 0)
        {
            garrison[index] = garrison[index] with { Count = garrison[index].Count + count };
        }
        else
        {
            garrison.Add(new UnitStack(type, count));
        }
    }

    private static int HighestUpkeepIndex(List<UnitStack> garrison)
    {
        var bestIndex = 0;
        var bestUpkeep = UnitCatalogue.Get(garrison[0].Type).UpkeepPerHour;
        for (var i = 1; i < garrison.Count; i++)
        {
            var upkeep = UnitCatalogue.Get(garrison[i].Type).UpkeepPerHour;
            if (upkeep > bestUpkeep)
            {
                bestUpkeep = upkeep;
                bestIndex = i;
            }
        }

        return bestIndex;
    }

    private static double TotalUpkeepPerHour(IReadOnlyList<UnitStack> garrison) =>
        garrison.Sum(s => UnitCatalogue.Get(s.Type).UpkeepPerHour * s.Count);

    /// <summary>
    /// Folds garrison upkeep into gross building production as a food
    /// subtraction, producing the net rate the settlement actually settles
    /// by. See <see cref="ResourcePool"/>'s remarks on why the rate itself,
    /// unlike the stock, is allowed to go negative.
    /// </summary>
    private static ResourceAmounts ApplyUpkeep(ResourceAmounts productionPerHour, IReadOnlyList<UnitStack> garrison) =>
        productionPerHour with { Food = productionPerHour.Food - TotalUpkeepPerHour(garrison) };

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
    /// <param name="isCoastalWater">
    /// Whether <paramref name="coord"/> is shallow water (a sea hex with a
    /// land neighbour) — <see cref="World.TerrainSampler.IsCoastalWater"/>.
    /// Only a <see cref="BuildingDefinition.RequiresCoastalWater"/> building
    /// (the fishing hut) cares; <paramref name="terrain"/> alone can't say,
    /// since it reports plain <see cref="Terrain.Sea"/> either way.
    /// </param>
    public BuildDecision PlanBuild(
        BuildingType type,
        HexCoord coord,
        Terrain terrain,
        DateTimeOffset now,
        Guid orderId,
        double speedFactor = 1.0,
        bool isCoastalWater = false)
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

        var terrainOk = definition.RequiresCoastalWater
            ? isCoastalWater
            : definition.AllowsTerrain(terrain);
        if (!terrainOk)
        {
            return BuildDecision.Rejected(BuildRejection.TerrainNotAllowed);
        }

        // A settlement gets its one longhouse from founding (SettlementService.FoundAsync
        // builds it directly, never through here) — this only ever levels up the
        // longhouse a settlement already has, on the hex it already stands on.
        // Placing a second one is someone else's job (a future settlers mechanic).
        if (type == BuildingType.Longhouse && !occupied)
        {
            return BuildDecision.Rejected(BuildRejection.LonghousePlacementNotAllowed);
        }

        if (LonghouseLevel < definition.RequiredLonghouseLevel)
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
        var resources = Resources.WithRate(ApplyUpkeep(production * speedFactor, Garrison), capacity, now);

        return SetBuildingLevelResult.Accept(this with { Buildings = buildings, Resources = resources });
    }

    /// <summary>Net production (after garrison upkeep) and capacity implied by what currently stands.</summary>
    public (ResourceAmounts ProductionPerHour, ResourceAmounts Capacity) CurrentTotals(double speedFactor = 1.0)
    {
        var (production, capacity) = BuildingCatalogue.Totals(Buildings.Select(b => (b.Type, b.Level)));
        return (ApplyUpkeep(production * speedFactor, Garrison), capacity);
    }

    /// <summary>
    /// Decides whether <paramref name="count"/> of <paramref name="type"/> may
    /// be trained, and at what cost.
    /// </summary>
    /// <remarks>
    /// Call on an already-settled settlement, so the queue and stock reflect
    /// <paramref name="now"/> — mirrors <see cref="PlanBuild"/>.
    /// </remarks>
    public TrainDecision PlanTrain(UnitType type, int count, DateTimeOffset now, Guid orderId)
    {
        if (count <= 0)
        {
            return TrainDecision.Rejected(TrainRejection.InvalidCount);
        }

        if (!UnitCatalogue.IsAvailable(type, LonghouseLevel))
        {
            return TrainDecision.Rejected(TrainRejection.UnitNotAvailable);
        }

        if (TrainingQueue.Count >= MaxTrainingQueueLength)
        {
            return TrainDecision.Rejected(TrainRejection.TrainingQueueFull);
        }

        var definition = UnitCatalogue.Get(type);
        var totalCost = definition.TrainingCost * count;
        if (!Resources.CanAfford(totalCost, now))
        {
            return TrainDecision.Rejected(TrainRejection.NotEnoughResources);
        }

        return TrainDecision.Accept(new TrainingOrder
        {
            Id = orderId,
            UnitType = type,
            Count = count,
            StartedAt = now,
            PerUnitDuration = definition.TrainingDuration,
        });
    }

    /// <summary>
    /// Pays for <paramref name="order"/> (cost × batch size) and appends it to
    /// the training queue.
    /// </summary>
    public Settlement EnqueueTraining(TrainingOrder order, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(order);

        var definition = UnitCatalogue.Get(order.UnitType);
        var totalCost = definition.TrainingCost * order.Count;
        if (!Resources.TrySpend(totalCost, now, out var paid))
        {
            throw new InvalidOperationException(
                "Cannot enqueue training that is not affordable; call PlanTrain first.");
        }

        return this with { Resources = paid, TrainingQueue = [.. TrainingQueue, order] };
    }
}

/// <param name="Changed">
/// False when nothing was due and nobody starved, meaning the caller has
/// nothing to persist.
/// </param>
/// <param name="Completed">Build orders that finished during this settle.</param>
/// <param name="TrainingCompleted">Training batches that finished during this settle.</param>
/// <param name="Deaths">
/// Units starvation killed during this settle (see
/// <c>Settlement.ApplyStarvation</c>), grouped by type. Not surfaced via the
/// API yet — a caller that wants to log or report it can from here.
/// </param>
public sealed record SettleResult(
    Settlement Settlement,
    bool Changed,
    IReadOnlyList<BuildOrder> Completed,
    IReadOnlyList<TrainingOrder> TrainingCompleted,
    IReadOnlyList<UnitStack> Deaths);
