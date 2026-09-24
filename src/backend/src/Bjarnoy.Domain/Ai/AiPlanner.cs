using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Trade;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Ai;

/// <summary>
/// Turns one <see cref="AiSnapshot"/> into an ordered list of intents — see
/// <c>docs/design/ai-players.md</c>'s "Planner" section for the algorithm
/// this implements.
/// </summary>
/// <remarks>
/// <para>
/// Pure domain code: no database, no wall clock, no unseeded
/// <see cref="Random"/>. Every candidate the build step considers is
/// filtered through the real <see cref="Settlement.PlanBuild"/> (and every
/// training candidate through the real <see cref="Settlement.PlanTrain"/>),
/// so the planner can never propose something the same rules would refuse a
/// human player — it just decides which of the *legal* moves is worth
/// making. Because everything here is a pure function of its inputs,
/// <see cref="Plan"/> returns the same actions for the same snapshot and
/// seed every time, which is what makes it unit-testable without a database.
/// </para>
/// <para>
/// Builds are planned against a local, unpersisted copy of the settlement
/// (<see cref="Settlement.Enqueue"/> applied in memory only) so that a second
/// or third build candidate in the same tick sees the stock and free slots
/// the first one actually left behind, rather than double-spending resources
/// that only one accepted order could have used.
/// </para>
/// </remarks>
public static class AiPlanner
{
    /// <summary>At most this many build orders are planned in one tick — see the design doc's "Build" step.</summary>
    private const int MaxBuildsPerTick = 3;

    /// <summary>
    /// Below this net food rate (per hour, after garrison upkeep), a food
    /// producer's score gets the "stay fed" boost — see the design doc's
    /// "Stay fed" step. Small rather than zero, so the planner reacts before
    /// the settlement actually starves.
    /// </summary>
    private const double FoodSafetyMargin = 5.0;

    private const double FoodSafetyBoost = 100.0;
    private const double ObjectiveBoost = 8.0;
    private const double ScarcityBonus = 3.0;
    private const double StorageNearCapBonus = 4.0;
    private const double UpgradePreference = 0.5;

    /// <summary>Stock at or above this fraction of capacity counts as "near the cap" for the storage bonus.</summary>
    private const double StorageNearCapRatio = 0.85;

    /// <summary>A stock at ≥85% of capacity, on any of the four resources, triggers <see cref="StorageNearCapBonus"/>.</summary>
    private static readonly IReadOnlySet<BuildingType> StorageTypes =
        new HashSet<BuildingType> { BuildingType.StorageHouse, BuildingType.GreatStorehouse };

    private static readonly IReadOnlySet<BuildingType> MilitaryTrainingTypes =
        new HashSet<BuildingType> { BuildingType.Barracks, BuildingType.ArcheryRange, BuildingType.Dockyard };

    private static readonly IReadOnlySet<BuildingType> ShrineTypes = new HashSet<BuildingType>
    {
        BuildingType.ShrineOfThor, BuildingType.ShrineOfFreyja, BuildingType.ShrineOfUllr, BuildingType.ShrineOfNjord,
    };

    private static readonly IReadOnlySet<BuildingType> ProducerTypes = new HashSet<BuildingType>
    {
        BuildingType.Lumberjack, BuildingType.Quarry, BuildingType.Farm, BuildingType.FishingHut,
        BuildingType.MagicTower, BuildingType.PumpkinFarm, BuildingType.FisherHut, BuildingType.Sawmill,
    };

    private static readonly IReadOnlySet<BuildingType> FoodProducerTypes = new HashSet<BuildingType>
    {
        BuildingType.Farm, BuildingType.PumpkinFarm, BuildingType.FishingHut, BuildingType.FisherHut,
    };

    /// <summary>Fallback training order once every <see cref="AiProfile.PreferredUnits"/> entry has been tried — cheap, widely available land units.</summary>
    private static readonly IReadOnlyList<UnitType> FallbackUnits =
        [UnitType.Spearman, UnitType.Axeman, UnitType.Bowman, UnitType.Berserker, UnitType.Thrall];

    /// <summary>Total Defense × count over a garrison — the figure infrastructure uses to describe a neighbour's <see cref="AiNeighbour.EstimatedDefense"/>.</summary>
    public static double EstimateDefense(Settlement settlement)
    {
        ArgumentNullException.ThrowIfNull(settlement);
        return settlement.Garrison.Sum(s => UnitCatalogue.Get(s.Type).Defense * (double)s.Count);
    }

    /// <summary>Decides this tick's actions: builds, then a train, then a raid — see the type-level remarks.</summary>
    public static IReadOnlyList<AiAction> Plan(AiSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        var actions = new List<AiAction>();
        var working = snapshot.Settlement;
        var nextId = 0;

        var orderedHexes = snapshot.ClaimedHexes
            .OrderBy(h => h.Coord.Q)
            .ThenBy(h => h.Coord.R)
            .ToList();

        for (var i = 0; i < MaxBuildsPerTick; i++)
        {
            if (working.FreeSlots <= 0)
            {
                break;
            }

            var candidate = FindBestBuildCandidate(working, snapshot, orderedHexes, ref nextId);
            if (candidate is null)
            {
                break;
            }

            actions.Add(new AiBuild(candidate.Value.Type, candidate.Value.Coord));
            working = working.Enqueue(candidate.Value.Order, snapshot.Now);
        }

        var trainAction = PlanTraining(working, snapshot, ref nextId);
        if (trainAction is not null)
        {
            actions.Add(trainAction);
        }

        var raidAction = PlanRaid(working, snapshot);
        if (raidAction is not null)
        {
            actions.Add(raidAction);
        }

        return actions;
    }

    private readonly record struct BuildCandidate(BuildingType Type, HexCoord Coord, BuildOrder Order);

    private static BuildCandidate? FindBestBuildCandidate(
        Settlement working, AiSnapshot snapshot, IReadOnlyList<AiHex> orderedHexes, ref int nextId)
    {
        var netFood = working.CurrentTotals(snapshot.SpeedFactor).ProductionPerHour.Food;
        var starving = netFood < FoodSafetyMargin;
        var scarcest = ScarcestResource(working, snapshot.SpeedFactor);
        var nearCapacity = IsAnyStockNearCapacity(working, snapshot.Now);
        var openObjectives = snapshot.Objectives.Where(o => !o.IsMet(working)).ToList();

        BuildCandidate? best = null;
        var bestScore = double.NegativeInfinity;

        foreach (var hex in orderedHexes)
        {
            var standing = working.Buildings.FirstOrDefault(b => b.Coord == hex.Coord);
            var isOccupied = working.Buildings.Any(b => b.Coord == hex.Coord);
            var candidateTypes = isOccupied
                ? [standing.Type]
                : BuildingCatalogue.AllTypes.Where(t => t != BuildingType.Longhouse);

            foreach (var type in candidateTypes)
            {
                if (IsSkippedForEconomic(type, snapshot.Profile, openObjectives))
                {
                    continue;
                }

                var decision = working.PlanBuild(
                    type,
                    hex.Coord,
                    hex.Terrain,
                    snapshot.Now,
                    DeterministicId(snapshot.Seed, nextId++),
                    snapshot.SpeedFactor,
                    hex.IsCoastalWater,
                    maxWaitingOrders: 0,
                    riverShapeAt: hex.RiverShape);

                if (!decision.Accepted)
                {
                    continue;
                }

                var score = ScoreBuild(
                    type, isOccupied, decision.Order!, snapshot.Profile, openObjectives, starving, scarcest, nearCapacity);

                if (score > bestScore)
                {
                    bestScore = score;
                    best = new BuildCandidate(type, hex.Coord, decision.Order!);
                }
            }
        }

        return best;
    }

    /// <summary>
    /// Economic never touches a garrison-training building unless an open
    /// <see cref="AiObjectiveKind.GarrisonStrength"/> objective needs it —
    /// see the design doc's "Build" step.
    /// </summary>
    private static bool IsSkippedForEconomic(BuildingType type, AiProfile profile, IReadOnlyList<AiObjective> openObjectives)
    {
        if (profile.Military != 0 || !MilitaryTrainingTypes.Contains(type))
        {
            return false;
        }

        return !openObjectives.Any(o => o.Kind == AiObjectiveKind.GarrisonStrength);
    }

    private static double ScoreBuild(
        BuildingType type,
        bool isUpgrade,
        BuildOrder order,
        AiProfile profile,
        IReadOnlyList<AiObjective> openObjectives,
        bool starving,
        TradeResource? scarcest,
        bool nearCapacity)
    {
        var score = RoleWeight(type, profile);

        if (starving && FoodProducerTypes.Contains(type))
        {
            score += FoodSafetyBoost;
        }

        foreach (var objective in openObjectives)
        {
            if (ObjectiveFavours(objective, type))
            {
                score += ObjectiveBoost;
            }
        }

        if (scarcest is { } resource && ProducerResource(type) == resource)
        {
            score += ScarcityBonus;
        }

        if (nearCapacity && StorageTypes.Contains(type))
        {
            score += StorageNearCapBonus;
        }

        if (isUpgrade)
        {
            score += UpgradePreference;
        }

        // A mild nudge toward the cheaper of two otherwise-similar
        // candidates — never enough to outweigh a role/objective/scarcity
        // difference, since the sum of a full cost is always in the
        // hundreds-to-thousands range and this scales it down heavily.
        var cost = BuildingCatalogue.Get(type, order.TargetLevel).Cost;
        score -= (cost.Wood + cost.Stone + cost.Food + cost.Iron) * 0.0005;

        return score;
    }

    private static bool ObjectiveFavours(AiObjective objective, BuildingType type) => objective.Kind switch
    {
        AiObjectiveKind.ReachLonghouseLevel => type == BuildingType.Longhouse,
        AiObjectiveKind.ReachBuildingLevel => objective.Building == type,
        AiObjectiveKind.ProductionRate => objective.Resource is { } resource && ProducerResource(type) == resource,
        AiObjectiveKind.GarrisonStrength => MilitaryTrainingTypes.Contains(type) || type == BuildingType.Tower,
        _ => false,
    };

    private static double RoleWeight(BuildingType type, AiProfile profile) => type switch
    {
        BuildingType.Longhouse => profile.Longhouse,
        BuildingType.StorageHouse or BuildingType.GreatStorehouse => profile.Storage,
        BuildingType.Tower => profile.Territory + profile.Defense,
        BuildingType.Barracks or BuildingType.ArcheryRange or BuildingType.Dockyard => profile.Military,
        // The iron producer straddles both roles — it is what a military
        // build-out actually needs iron for (see the design doc's
        // Aggressive row: "barracks, iron, axemen/berserkers"), so its score
        // averages the two weights rather than counting as a plain producer.
        // An Economic profile (Military 0) still values it a little for its
        // own economy weight; an Aggressive one values it more than a plain
        // producer, without it out-competing Barracks itself.
        BuildingType.MagicTower => (profile.Economy + profile.Military) / 2,
        _ when ShrineTypes.Contains(type) => profile.Faith,
        _ when ProducerTypes.Contains(type) => profile.Economy,
        _ => 0.0,
    };

    /// <summary>Which resource a producer building produces, or <see langword="null"/> for a non-producer.</summary>
    private static TradeResource? ProducerResource(BuildingType type) => type switch
    {
        BuildingType.Lumberjack or BuildingType.Sawmill => TradeResource.Wood,
        BuildingType.Quarry => TradeResource.Stone,
        BuildingType.Farm or BuildingType.PumpkinFarm or BuildingType.FishingHut or BuildingType.FisherHut => TradeResource.Food,
        BuildingType.MagicTower => TradeResource.Iron,
        _ => null,
    };

    /// <summary>The resource whose current production rate is lowest — the one a new producer should favour.</summary>
    private static TradeResource ScarcestResource(Settlement settlement, double speedFactor)
    {
        var rate = settlement.CurrentTotals(speedFactor).ProductionPerHour;
        var rates = new[]
        {
            (Resource: TradeResource.Wood, Rate: rate.Wood),
            (Resource: TradeResource.Stone, Rate: rate.Stone),
            (Resource: TradeResource.Food, Rate: rate.Food),
            (Resource: TradeResource.Iron, Rate: rate.Iron),
        };

        return rates.OrderBy(r => r.Rate).First().Resource;
    }

    private static bool IsAnyStockNearCapacity(Settlement settlement, DateTimeOffset now)
    {
        var stock = settlement.Resources.At(now);
        var capacity = settlement.Resources.Capacity;

        return NearCap(stock.Wood, capacity.Wood)
            || NearCap(stock.Stone, capacity.Stone)
            || NearCap(stock.Food, capacity.Food)
            || NearCap(stock.Iron, capacity.Iron);

        static bool NearCap(double stock, double capacity) => capacity > 0 && stock / capacity >= StorageNearCapRatio;
    }

    private static AiAction? PlanTraining(Settlement working, AiSnapshot snapshot, ref int nextId)
    {
        var garrisonCount = working.Garrison.Sum(s => s.Count);
        var objectiveTarget = snapshot.Objectives
            .Where(o => o.Kind == AiObjectiveKind.GarrisonStrength && !o.IsMet(working))
            .Select(o => (int)o.Target)
            .DefaultIfEmpty(0)
            .Max();

        var target = Math.Max(snapshot.Profile.GarrisonPerLonghouseLevel * working.LonghouseLevel, objectiveTarget);
        var deficit = target - garrisonCount;
        if (deficit <= 0)
        {
            return null;
        }

        var netFood = working.CurrentTotals(snapshot.SpeedFactor).ProductionPerHour.Food;

        foreach (var unit in snapshot.Profile.PreferredUnits.Concat(FallbackUnits).Distinct())
        {
            // AI never trains settlers or ships — see the design doc's "Out
            // of scope" list (AI founding is a follow-up) and the "Train"
            // step's own rule.
            if (unit == UnitType.SettlerCrew || UnitCatalogue.Get(unit).Class == UnitClass.Ship)
            {
                continue;
            }

            var upkeepPerUnit = UnitCatalogue.Get(unit).UpkeepPerHour;
            var maxByFood = upkeepPerUnit > 0 ? (int)Math.Floor(netFood / upkeepPerUnit) : deficit;
            var maxCount = Math.Min(deficit, Math.Max(0, maxByFood));
            if (maxCount <= 0)
            {
                continue;
            }

            var (count, rejection) = LargestAffordableTrainCount(working, unit, maxCount, snapshot, ref nextId);
            if (count > 0)
            {
                return new AiTrain(unit, count);
            }

            // The training queue itself is full — no unit type will fare any
            // better this tick, so stop trying rather than burning through
            // every candidate for the same rejection.
            if (rejection == TrainRejection.TrainingQueueFull)
            {
                break;
            }
        }

        return null;
    }

    private static (int Count, TrainRejection Rejection) LargestAffordableTrainCount(
        Settlement working, UnitType unit, int maxCount, AiSnapshot snapshot, ref int nextId)
    {
        var probe = working.PlanTrain(
            unit, 1, snapshot.Now, DeterministicId(snapshot.Seed, nextId++), snapshot.HasShoreline,
            snapshot.SettlerCostMultiplier, snapshot.SpeedFactor);
        if (!probe.Accepted)
        {
            return (0, probe.Rejection);
        }

        var lo = 1;
        var hi = maxCount;
        var best = 1;

        while (lo <= hi)
        {
            var mid = lo + ((hi - lo) / 2);
            var decision = working.PlanTrain(
                unit, mid, snapshot.Now, DeterministicId(snapshot.Seed, nextId++), snapshot.HasShoreline,
                snapshot.SettlerCostMultiplier, snapshot.SpeedFactor);

            if (decision.Accepted)
            {
                best = mid;
                lo = mid + 1;
            }
            else
            {
                hi = mid - 1;
            }
        }

        return (best, TrainRejection.None);
    }

    private static AiAction? PlanRaid(Settlement working, AiSnapshot snapshot)
    {
        if (snapshot.Profile.AttackMargin is not { } margin || snapshot.HasArmyAway)
        {
            return null;
        }

        var offensiveStacks = working.Garrison.Where(IsOffensive).ToList();
        if (offensiveStacks.Count == 0)
        {
            return null;
        }

        var ownPower = offensiveStacks.Sum(s => UnitCatalogue.Get(s.Type).Attack * (double)s.Count);

        var target = snapshot.Neighbours
            .Where(n => n.EstimatedDefense * margin <= ownPower)
            .OrderBy(n => n.EstimatedDefense)
            .ThenBy(n => n.Centre.DistanceTo(working.Centre))
            .FirstOrDefault();

        return target is null ? null : new AiRaid(target.SettlementId, offensiveStacks);
    }

    /// <summary>A unit worth sending on a raid rather than keeping home — it hits harder than it defends.</summary>
    private static bool IsOffensive(UnitStack stack)
    {
        var definition = UnitCatalogue.Get(stack.Type);
        return definition.Attack > definition.Defense;
    }

    /// <summary>
    /// A deterministic order id, derived from <paramref name="seed"/> and a
    /// per-plan counter rather than <see cref="Guid.NewGuid"/> — these ids
    /// only ever identify an order inside this method's own local simulation
    /// (<see cref="Settlement.Enqueue"/>/<see cref="Settlement.PlanTrain"/>);
    /// the real executor mints its own when it actually places the order.
    /// </summary>
    private static Guid DeterministicId(int seed, int counter)
    {
        Span<byte> bytes = stackalloc byte[16];
        BitConverter.TryWriteBytes(bytes, seed);
        BitConverter.TryWriteBytes(bytes[4..], counter);
        return new Guid(bytes);
    }
}
