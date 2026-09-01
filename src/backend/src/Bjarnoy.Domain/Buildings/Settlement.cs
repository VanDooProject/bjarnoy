using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Combat;
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
    /// Claim radius of the settlement's own centre disc, driven by longhouse
    /// level (MECHANICS.md §2: borders grow when the anchor levels up). This
    /// is only the centre disc — the settlement's full claimed territory is
    /// the union of this and every placed Tower's own satellite disc; see
    /// <see cref="Claims"/> and <see cref="ClaimDiscs"/>.
    /// </summary>
    public int ClaimRadius => 1 + (LonghouseLevel / 2);

    /// <summary>
    /// The largest <see cref="ClaimRadius"/> the centre disc alone can ever
    /// reach (longhouse at <see cref="BuildingCatalogue.MaxLevel"/>). Kept
    /// distinct from <see cref="MaxTerritoryReach"/>, which additionally
    /// accounts for a satellite Tower disc and is the one
    /// <c>SettlementService.MinimumSpacing</c> actually derives from — this
    /// constant is retained for callers that only ever care about the centre
    /// disc's own worst case (e.g. doc comments describing longhouse-only
    /// growth).
    /// </summary>
    public const int MaxClaimRadius = 1 + (BuildingCatalogue.MaxLevel / 2);

    /// <summary>
    /// Extra radius a single <see cref="BuildingType.Tower"/>'s own satellite
    /// disc reaches outward from that tower's own hex (not the settlement
    /// centre), driven by the tower's own level. Half the growth rate of
    /// <see cref="ClaimRadius"/> (one hex of reach per two tower levels,
    /// versus one per two longhouse levels) and, deliberately, with no "+1"
    /// floor: <see cref="ClaimRadius"/>'s floor exists because a settlement
    /// always has *some* territory just for existing, but a tower can only
    /// ever be built on a hex the settlement's centre disc already reaches
    /// (see <see cref="CentreClaims"/>'s use in <see cref="PlanBuild"/>), so
    /// a freshly built level-1 tower needs no guaranteed reach of its own —
    /// it is a bonus on top of ground already held, not a second foothold.
    /// Product call: towers become a meaningfully sized expansion tool only
    /// once levelled up, rather than instantly doubling border growth per
    /// tower placed.
    /// </summary>
    public static int TowerClaimRadius(int towerLevel) => Math.Max(0, towerLevel) / 2;

    /// <summary>
    /// The largest <see cref="TowerClaimRadius"/> a single tower can ever
    /// reach (at <see cref="BuildingCatalogue.MaxLevel"/>).
    /// </summary>
    public const int MaxTowerClaimRadius = BuildingCatalogue.MaxLevel / 2;

    /// <summary>
    /// The farthest any hex of a settlement's territory can ever sit from its
    /// own <see cref="Centre"/>, once towers are accounted for: the centre
    /// disc's own worst case (<see cref="MaxClaimRadius"/>) plus the extra
    /// reach a max-level tower sitting right at that disc's own edge adds
    /// (<see cref="MaxTowerClaimRadius"/>). This bound is tight because a
    /// tower's own reach is always exactly one hop from <see cref="Centre"/>
    /// — new construction, towers included, is only ever placed inside the
    /// centre disc (see <see cref="CentreClaims"/>'s remarks on why that is
    /// the intended shape of the building-placement rule, not something a
    /// tower could ever reach beyond). So the farthest a tower can ever stand
    /// from centre is exactly <see cref="MaxClaimRadius"/>, and from there
    /// its own disc reaches <see cref="MaxTowerClaimRadius"/> further still.
    /// This, not the old single-disc <see cref="MaxClaimRadius"/>, is what
    /// <c>SettlementService.MinimumSpacing</c> must be derived from: two
    /// settlements' full territories (centre disc plus every tower satellite
    /// disc) can never overlap, at any level either reaches, once their
    /// centres are more than twice this apart.
    /// </summary>
    public const int MaxTerritoryReach = MaxClaimRadius + MaxTowerClaimRadius;

    /// <summary>
    /// Every disc that makes up this settlement's claimed territory: the
    /// centre disc first, then one satellite disc per standing
    /// <see cref="BuildingType.Tower"/>, centred on that tower's own
    /// <see cref="PlacedBuilding.Coord"/> rather than <see cref="Centre"/>.
    /// A tower at any level (including a level-0 foundation stub, which
    /// yields a zero-radius disc — harmless, since that hex is already
    /// claimed by construction) is included; <see cref="Claims"/> is simply
    /// "does any of these discs reach this hex".
    /// </summary>
    public IEnumerable<(HexCoord Centre, int Radius)> ClaimDiscs
    {
        get
        {
            yield return (Centre, ClaimRadius);
            foreach (var building in Buildings)
            {
                if (building.Type == BuildingType.Tower)
                {
                    yield return (building.Coord, TowerClaimRadius(building.Level));
                }
            }
        }
    }

    /// <summary>
    /// Hexes this settlement has claimed — the union of the centre disc and
    /// every Tower's own satellite disc (see <see cref="ClaimDiscs"/>), not
    /// just the centre disc alone. This is the "does this settlement own
    /// this ground at all" predicate for territory-facing concerns: display,
    /// the fleet shoreline check, ship-training's coastal gate, and — outside
    /// this codebase's own callers — the beginner-protection island-suggestion
    /// design (<c>docs/design/beginner-protection.md</c>, branch
    /// <c>claude/noob-shield-issue-132-zp7xi2</c>), whose live safety check
    /// calls this directly against each nearby settlement's real current
    /// buildings before ever offering a plot to a new player. Reading this
    /// union live is exactly how "several towers together read as an
    /// extended, stacked-looking realm" is meant to happen — from whatever
    /// towers already stand, however they're arranged, with no need for any
    /// of them to have been placed by reaching through one another. It is
    /// deliberately <em>not</em> what gates placing a new building — see
    /// <see cref="CentreClaims"/>.
    /// </summary>
    public bool Claims(HexCoord coord) => ClaimDiscs.Any(disc => disc.Centre.DistanceTo(coord) <= disc.Radius);

    /// <summary>
    /// Whether <paramref name="coord"/> sits inside the settlement's own
    /// centre disc — <em>not</em> the tower-extended union <see cref="Claims"/>
    /// computes. This, not <see cref="Claims"/>, is what
    /// <see cref="PlanBuild"/>/<see cref="PlaceBuilding"/> gate new
    /// construction (towers included) against.
    /// </summary>
    /// <remarks>
    /// Building placement is intentionally scoped to one disc, one hop from
    /// <see cref="Centre"/> — a tower is never itself a new foothold to build
    /// the next tower from. Combining several towers into a wider, stacked-
    /// looking realm is a real and intended effect, but it comes entirely
    /// from reading <see cref="Claims"/> live against whatever towers already
    /// stand (see that method's own remarks on the beginner-protection design
    /// that does exactly this) — never from letting placement itself reach
    /// beyond the centre disc. Chaining placement through a tower's own
    /// satellite disc was never part of that effect and stays out of scope
    /// here: it would also make <see cref="MaxTerritoryReach"/> (and the
    /// founding-time <c>SettlementService.MinimumSpacing</c> derived from it)
    /// impossible to size, since there would be no fixed worst-case reach to
    /// bound against. Keeping every new build pinned to the centre disc keeps
    /// a tower's own reach exactly one hop from <see cref="Centre"/>, which
    /// is what makes <see cref="MaxTerritoryReach"/>'s "one centre disc, one
    /// tower disc" bound exact.
    /// </remarks>
    public bool CentreClaims(HexCoord coord) => Centre.DistanceTo(coord) <= ClaimRadius;

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
    /// <param name="guestStacks">
    /// The combined stacks of every guest (<see cref="Armies.ArmyMission.Support"/>)
    /// army currently hosted here, aggregated by type (issue #40 phase 4 §2)
    /// — <see langword="null"/> or empty when none. <see cref="Settlement"/>
    /// has no knowledge of armies as an aggregate (and stays that way — see
    /// the type-level remarks) so the service layer (<c>ArmyService</c>/
    /// <c>SettlementService</c>) queries the guest <c>ArmyEntity</c> rows and
    /// passes their pooled stacks in here before calling this method. Guests
    /// count toward upkeep exactly like the home <see cref="Garrison"/> and
    /// share the very same starvation pass — a settlement that could
    /// previously feed itself can be starved purely by hosting guests, and a
    /// starving settlement kills guest units too, not only its own. Deaths
    /// are tallied separately in <see cref="SettleResult.GuestDeaths"/> (still
    /// pooled by type across every guest present) because
    /// <see cref="Settlement"/> only ever sees the pooled total, never
    /// individual guest armies — see <see cref="ApplyStarvation"/>'s remarks
    /// for how the split back to "home" vs "guest pool" works, and
    /// <c>SettlementService</c> for the second split, of the guest pool
    /// across the actual guest <c>ArmyEntity</c> rows.
    /// </param>
    /// <param name="terrainAt">
    /// Terrain lookup for a terrain-bound producer's neighbour-adjacency
    /// boost (<see cref="BuildingCatalogue.BoostMultiplier"/>).
    /// <see langword="null"/> (the default) settles with no boost applied —
    /// callers with no terrain source (e.g. tests exercising other rules)
    /// still get a correct, if unboosted, total.
    /// </param>
    public SettleResult SettleTo(
        DateTimeOffset now,
        double speedFactor = 1.0,
        IReadOnlyList<UnitStack>? guestStacks = null,
        Func<HexCoord, Terrain>? terrainAt = null)
    {
        guestStacks ??= [];

        var dueBuilds = Queue.Where(o => o.IsComplete(now)).ToList();
        var dueTraining = TrainingQueue.Where(o => o.IsComplete(now)).ToList();

        var buildings = Buildings.ToList();
        var garrison = Garrison.ToList();
        var guestPool = guestStacks.ToList();
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
            var (production, capacity) = BuildingCatalogue.Totals(buildings, terrainAt);
            resources = resources.WithRate(ApplyUpkeep(production * speedFactor, garrison, guestPool), capacity, time);
        }

        var (finalProduction, finalCapacity) = BuildingCatalogue.Totals(buildings, terrainAt);
        finalProduction *= speedFactor;

        // Starvation is checked every settle, not only when something
        // completed: a garrison (home or guest) can run its settlement out of
        // food purely by sitting there while nobody looks, with no order due
        // at all.
        var (deaths, guestDeaths) = ApplyStarvation(ref resources, garrison, guestPool, finalProduction, finalCapacity, now);

        // A guest army arriving or departing changes upkeep from outside this
        // settlement's own Queue/TrainingQueue timeline entirely — there is
        // no "event" above to trigger a rate refresh the way a build or
        // training completion does. So the net rate is always re-derived here
        // and compared against what is already stored: if a guest joined or
        // left since the last settle, the two disagree and this is the only
        // place that catches it. Comparing (rather than unconditionally
        // re-writing) keeps the "nothing due, nothing to persist" contract
        // intact for the overwhelming majority of settles where nothing
        // guest-related changed.
        var correctNetProduction = ApplyUpkeep(finalProduction, garrison, guestPool);
        var rateIsStale = !ApproximatelyEqual(resources.RatePerHour, correctNetProduction);
        if (rateIsStale)
        {
            resources = resources.WithRate(correctNetProduction, finalCapacity, now);
        }

        var changed = dueBuilds.Count > 0 || dueTraining.Count > 0 || deaths.Count > 0 || guestDeaths.Count > 0 || rateIsStale;
        if (!changed)
        {
            return new SettleResult(this, Changed: false, [], [], [], []);
        }

        var settled = this with
        {
            Buildings = buildings,
            Garrison = garrison,
            Queue = [.. Queue.Where(o => !o.IsComplete(now))],
            TrainingQueue = [.. TrainingQueue.Where(o => !o.IsComplete(now))],
            Resources = resources,
        };

        return new SettleResult(settled, Changed: true, dueBuilds, dueTraining, deaths, guestDeaths);
    }

    /// <summary>
    /// Kills units when the garrison's upkeep has outrun production and the
    /// stock would otherwise go negative.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Simplification for v1 (issue #40 phase 1): rather than a gradual
    /// per-hour death rate, enough units are killed all at once, at the
    /// instant food would cross zero, to make the net food rate non-negative
    /// again. A more gradual timeline is future work per the design doc.
    /// Units are removed highest-upkeep-type-first — proportional loss
    /// across every stack would be more "fair" but is unnecessary complexity
    /// for a first pass.
    /// </para>
    /// <para>
    /// Phase 4 (issue #40 §2) extends this to guests: <paramref name="garrison"/>
    /// and <paramref name="guestPool"/> are first merged, by type, into one
    /// pooled view — so which type dies first, and how many, is decided
    /// exactly as it always was, just against a bigger number. Only once the
    /// pooled per-type death counts are known are they split back between
    /// "home" and "guest pool", proportional to each side's own pre-starvation
    /// holding of that type (<see cref="ProportionalAllocator"/>), and the
    /// split applied to <paramref name="garrison"/>/<paramref name="guestPool"/>
    /// in place. This is a deliberate simplification: a home-heavy and a
    /// guest-heavy stack of the same type die in the same proportion as each
    /// other, rather than, say, always sacrificing guests first or last — a
    /// policy call issue #40 leaves to a future balance pass.
    /// </para>
    /// </remarks>
    private static (IReadOnlyList<UnitStack> HomeDeaths, IReadOnlyList<UnitStack> GuestDeaths) ApplyStarvation(
        ref ResourcePool resources,
        List<UnitStack> garrison,
        List<UnitStack> guestPool,
        ResourceAmounts grossProductionPerHour,
        ResourceAmounts capacity,
        DateTimeOffset now)
    {
        if (resources.RatePerHour.Food >= 0)
        {
            return ([], []);
        }

        // How long, at the current (pre-starvation) rate, until the food
        // stock as of resources.SettledAt would hit zero.
        var hoursToZero = Math.Max(0, -resources.Stock.Food / resources.RatePerHour.Food);
        var crossingTime = resources.SettledAt.AddHours(hoursToZero);
        if (crossingTime > now)
        {
            // Still short by `now`, but not yet actually starving.
            return ([], []);
        }

        // Settle to the crossing instant under the old rate first — the food
        // produced up to that moment is real and must not be lost or
        // retroactively rescaled by the rate change starvation is about to
        // cause.
        resources = resources.SettledTo(crossingTime);

        var pooled = MergeByType(garrison, guestPool);
        var pooledDeaths = new List<UnitStack>();
        while (pooled.Count > 0)
        {
            var netFood = grossProductionPerHour.Food - TotalUpkeepPerHour(pooled);
            if (netFood >= 0)
            {
                break;
            }

            var index = HighestUpkeepIndex(pooled);
            var stack = pooled[index];
            var perUnitUpkeep = UnitCatalogue.Get(stack.Type).UpkeepPerHour;
            var deficit = -netFood;
            var unitsToKill = perUnitUpkeep > 0
                ? Math.Min(stack.Count, (int)Math.Ceiling(deficit / perUnitUpkeep))
                : stack.Count;

            pooledDeaths.Add(new UnitStack(stack.Type, unitsToKill));

            if (unitsToKill >= stack.Count)
            {
                pooled.RemoveAt(index);
            }
            else
            {
                pooled[index] = stack with { Count = stack.Count - unitsToKill };
            }
        }

        var finalNetFood = grossProductionPerHour.Food - TotalUpkeepPerHour(pooled);
        resources = resources.WithRate(
            grossProductionPerHour with { Food = finalNetFood }, capacity, crossingTime);

        // Split each pooled death back between home and guest, and actually
        // apply it to the two real lists — see this method's remarks.
        var homeDeaths = new List<UnitStack>();
        var guestDeaths = new List<UnitStack>();
        foreach (var death in pooledDeaths)
        {
            var homeCount = CountOf(garrison, death.Type);
            var guestCount = CountOf(guestPool, death.Type);
            var split = ProportionalAllocator.Allocate(death.Count, [homeCount, guestCount]);

            if (split[0] > 0)
            {
                Reduce(garrison, death.Type, split[0]);
                homeDeaths.Add(new UnitStack(death.Type, split[0]));
            }

            if (split[1] > 0)
            {
                Reduce(guestPool, death.Type, split[1]);
                guestDeaths.Add(new UnitStack(death.Type, split[1]));
            }
        }

        return (homeDeaths, guestDeaths);
    }

    /// <summary>Merges two stack lists into a new one, aggregated by type — never mutates either input.</summary>
    private static List<UnitStack> MergeByType(IReadOnlyList<UnitStack> a, IReadOnlyList<UnitStack> b) =>
        a.Concat(b)
            .GroupBy(s => s.Type)
            .Select(g => new UnitStack(g.Key, g.Sum(s => s.Count)))
            .ToList();

    private static bool ApproximatelyEqual(ResourceAmounts a, ResourceAmounts b, double epsilon = 1e-9) =>
        Math.Abs(a.Wood - b.Wood) < epsilon
        && Math.Abs(a.Stone - b.Stone) < epsilon
        && Math.Abs(a.Food - b.Food) < epsilon
        && Math.Abs(a.Iron - b.Iron) < epsilon;

    private static int CountOf(List<UnitStack> stacks, UnitType type) =>
        stacks.FirstOrDefault(s => s.Type == type).Count;

    /// <summary>Removes <paramref name="count"/> of <paramref name="type"/> from <paramref name="stacks"/> in place, dropping the entry if it reaches zero.</summary>
    private static void Reduce(List<UnitStack> stacks, UnitType type, int count)
    {
        var index = stacks.FindIndex(s => s.Type == type);
        if (index < 0)
        {
            return;
        }

        var remaining = stacks[index].Count - count;
        if (remaining <= 0)
        {
            stacks.RemoveAt(index);
        }
        else
        {
            stacks[index] = stacks[index] with { Count = remaining };
        }
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
    /// Folds garrison (and, phase 4, guest) upkeep into gross building
    /// production as a food subtraction, producing the net rate the
    /// settlement actually settles by. See <see cref="ResourcePool"/>'s
    /// remarks on why the rate itself, unlike the stock, is allowed to go
    /// negative.
    /// </summary>
    private static ResourceAmounts ApplyUpkeep(
        ResourceAmounts productionPerHour, IReadOnlyList<UnitStack> garrison, IReadOnlyList<UnitStack> guestStacks) =>
        productionPerHour with
        {
            Food = productionPerHour.Food - TotalUpkeepPerHour(garrison) - TotalUpkeepPerHour(guestStacks),
        };

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
        if (!CentreClaims(coord))
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
    /// <remarks>
    /// A brand-new building (<paramref name="order"/> targets a hex nothing
    /// stands on yet) is staked out in <see cref="Buildings"/> immediately,
    /// at level 0 — the foundation. This is what lets any reader of the
    /// settlement's buildings (not just this settlement's own queue) already
    /// see it under construction, and is why <see cref="SettleTo"/>'s
    /// completion pass finds an existing entry at <c>order.Coord</c> to raise
    /// to <c>order.TargetLevel</c> rather than adding a new one. An upgrade
    /// order (the hex already holds the building at a lower level) gets no
    /// stub — the standing building already shows its current level.
    /// <see cref="CancelBuild"/> removes the stub again if the order never
    /// completes.
    /// </remarks>
    public Settlement Enqueue(BuildOrder order, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(order);

        var definition = BuildingCatalogue.Get(order.Type, order.TargetLevel);
        if (!Resources.TrySpend(definition.Cost, now, out var paid))
        {
            throw new InvalidOperationException(
                "Cannot enqueue a build that is not affordable; call PlanBuild first.");
        }

        var buildings = Buildings;
        if (!buildings.Any(b => b.Coord == order.Coord))
        {
            buildings = [.. buildings, new PlacedBuilding(order.Coord, order.Type, Level: 0)];
        }

        return this with { Resources = paid, Queue = [.. Queue, order], Buildings = buildings };
    }

    /// <summary>
    /// Refunds and removes a still-queued build order.
    /// </summary>
    /// <remarks>
    /// Call on an already-settled settlement (see <see cref="SettleTo"/>) —
    /// mirrors <see cref="PlanBuild"/>/<see cref="Enqueue"/>. A completed
    /// order is no longer in <see cref="Queue"/> by then, so this simply
    /// reports <see cref="CancelBuildRejection.OrderNotFound"/> rather than
    /// ever undoing a finished build. If <paramref name="orderId"/> was a
    /// brand-new building (<see cref="Enqueue"/>'s level-0 stub), that stub
    /// is removed from <see cref="Buildings"/> too; an upgrade order simply
    /// leaves the building at whatever level it already stands.
    /// </remarks>
    public CancelBuildResult CancelBuild(Guid orderId, DateTimeOffset now)
    {
        var order = Queue.FirstOrDefault(o => o.Id == orderId);
        if (order is null)
        {
            return CancelBuildResult.Rejected(CancelBuildRejection.OrderNotFound);
        }

        var definition = BuildingCatalogue.Get(order.Type, order.TargetLevel);
        var refunded = Resources.Deposit(definition.Cost, now);

        var buildings = order.TargetLevel == 1
            ? Buildings.Where(b => b.Coord != order.Coord).ToList()
            : Buildings;

        var settled = this with
        {
            Resources = refunded,
            Queue = [.. Queue.Where(o => o.Id != orderId)],
            Buildings = buildings,
        };

        return CancelBuildResult.Accept(settled);
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
    public SetBuildingLevelResult SetBuildingLevel(
        HexCoord coord, int level, DateTimeOffset now, double speedFactor = 1.0,
        IReadOnlyList<UnitStack>? guestStacks = null, Func<HexCoord, Terrain>? terrainAt = null)
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

        var (production, capacity) = BuildingCatalogue.Totals(buildings, terrainAt);
        var resources = Resources.WithRate(
            ApplyUpkeep(production * speedFactor, Garrison, guestStacks ?? []), capacity, now);

        return SetBuildingLevelResult.Accept(this with { Buildings = buildings, Resources = resources });
    }

    /// <summary>
    /// Admin god-mode "instant build": rewrites every still-pending order's
    /// <see cref="BuildOrder.CompletesAt"/> (and/or
    /// <see cref="TrainingOrder.CompletesAt"/>) to <paramref name="now"/>, so
    /// the very next <see cref="SettleTo"/> applies them through the ordinary
    /// completion path.
    /// </summary>
    /// <remarks>
    /// Deliberately does <em>not</em> settle or apply anything itself: the
    /// whole point is that an insta-built building lands through exactly the
    /// same code a naturally finished one does, including the per-completion
    /// rate recalculation and the chronological merge with training
    /// completions. Ties are broken by queue order, because
    /// <see cref="SettleTo"/>'s <c>OrderBy</c> is stable — so three queued
    /// levels on one hex still land 1, 2, 3 rather than in an arbitrary order.
    /// Orders already due are left alone (their real completion instant is
    /// what the rate history should keep).
    /// </remarks>
    public Settlement WithQueuesDueAt(DateTimeOffset now, bool builds = true, bool training = true) => this with
    {
        Queue = builds
            ? [.. Queue.Select(o => o.IsComplete(now) ? o : o with { CompletesAt = now })]
            : Queue,
        // A TrainingOrder's CompletesAt is derived, not stored (StartedAt plus
        // per-unit duration times count), so "due now" is expressed by
        // restarting the batch at now with no per-unit duration left to serve
        // — which also makes its live CompletedCount read as the full batch.
        TrainingQueue = training
            ? [.. TrainingQueue.Select(o => o.IsComplete(now)
                ? o
                : o with { StartedAt = now, PerUnitDuration = TimeSpan.Zero })]
            : TrainingQueue,
    };

    /// <summary>
    /// Admin god-mode: puts a building of <paramref name="type"/> at
    /// <paramref name="level"/> on <paramref name="coord"/>, whether or not
    /// anything already stands there, bypassing cost, queue and longhouse
    /// prerequisites — but not the rules that would leave the settlement in a
    /// shape the rest of the game cannot represent: the hex must be claimed,
    /// the level must exist in the catalogue, the terrain must suit the
    /// building, and the single longhouse can neither be duplicated nor moved.
    /// </summary>
    /// <remarks>
    /// Call on an already-settled settlement — same reasoning as
    /// <see cref="SetBuildingLevel"/>, which this generalises (that one only
    /// re-levels what already stands; this also places and re-types).
    /// </remarks>
    public AdminBuildingEditResult PlaceBuilding(
        HexCoord coord,
        BuildingType type,
        int level,
        Terrain terrain,
        bool isCoastalWater,
        DateTimeOffset now,
        double speedFactor = 1.0,
        IReadOnlyList<UnitStack>? guestStacks = null,
        Func<HexCoord, Terrain>? terrainAt = null)
    {
        if (!CentreClaims(coord))
        {
            return AdminBuildingEditResult.Rejected(AdminBuildingEditRejection.HexNotInSettlement);
        }

        var definition = BuildingCatalogue.TryGet(type, level);
        if (definition is null)
        {
            return AdminBuildingEditResult.Rejected(AdminBuildingEditRejection.InvalidLevel);
        }

        var buildings = Buildings.ToList();
        var index = buildings.FindIndex(b => b.Coord == coord);
        var standingHere = index >= 0 ? buildings[index].Type : (BuildingType?)null;

        // The longhouse is the settlement's anchor: its level drives the claim
        // radius every other rule reads, and founding places exactly one. So a
        // second one cannot be placed, and the one that exists cannot be
        // re-typed away or moved to another hex — only re-levelled in place.
        if ((type == BuildingType.Longhouse && standingHere != BuildingType.Longhouse)
            || (standingHere == BuildingType.Longhouse && type != BuildingType.Longhouse))
        {
            return AdminBuildingEditResult.Rejected(AdminBuildingEditRejection.LonghouseIsFixed);
        }

        var terrainOk = definition.RequiresCoastalWater ? isCoastalWater : definition.AllowsTerrain(terrain);
        if (!terrainOk)
        {
            return AdminBuildingEditResult.Rejected(AdminBuildingEditRejection.TerrainNotAllowed);
        }

        var placed = new PlacedBuilding(coord, type, level);
        if (index >= 0)
        {
            buildings[index] = placed;
        }
        else
        {
            buildings.Add(placed);
        }

        return AdminBuildingEditResult.Accept(WithBuildings(buildings, coord, now, speedFactor, guestStacks, terrainAt));
    }

    /// <summary>
    /// Admin god-mode: removes whatever stands on <paramref name="coord"/> —
    /// the counterpart to <see cref="PlaceBuilding"/>. The longhouse cannot be
    /// razed (see that method's remarks).
    /// </summary>
    public AdminBuildingEditResult RazeBuilding(
        HexCoord coord,
        DateTimeOffset now,
        double speedFactor = 1.0,
        IReadOnlyList<UnitStack>? guestStacks = null,
        Func<HexCoord, Terrain>? terrainAt = null)
    {
        var buildings = Buildings.ToList();
        var index = buildings.FindIndex(b => b.Coord == coord);
        if (index < 0)
        {
            return AdminBuildingEditResult.Rejected(AdminBuildingEditRejection.BuildingNotFound);
        }

        if (buildings[index].Type == BuildingType.Longhouse)
        {
            return AdminBuildingEditResult.Rejected(AdminBuildingEditRejection.LonghouseIsFixed);
        }

        buildings.RemoveAt(index);

        return AdminBuildingEditResult.Accept(WithBuildings(buildings, coord, now, speedFactor, guestStacks, terrainAt));
    }

    /// <summary>
    /// Admin god-mode: adds <paramref name="delta"/> units of
    /// <paramref name="type"/> to the garrison (or removes them, when
    /// negative), free of cost and training time, and re-rates food upkeep
    /// from <paramref name="now"/> onward exactly as a finished training batch
    /// would.
    /// </summary>
    /// <remarks>
    /// Call on an already-settled settlement, so the upkeep change applies
    /// from now rather than retroactively — the same rule
    /// <see cref="SetBuildingLevel"/> follows.
    /// </remarks>
    public AdminGarrisonEditResult AdjustGarrison(
        UnitType type,
        int delta,
        DateTimeOffset now,
        double speedFactor = 1.0,
        IReadOnlyList<UnitStack>? guestStacks = null,
        Func<HexCoord, Terrain>? terrainAt = null)
    {
        if (delta == 0)
        {
            return AdminGarrisonEditResult.Rejected(AdminGarrisonEditRejection.InvalidCount);
        }

        var garrison = Garrison.ToList();
        var index = garrison.FindIndex(s => s.Type == type);
        var standing = index >= 0 ? garrison[index].Count : 0;

        if (standing + delta < 0)
        {
            return AdminGarrisonEditResult.Rejected(AdminGarrisonEditRejection.NotEnoughUnits);
        }

        if (index >= 0)
        {
            var remaining = standing + delta;
            if (remaining == 0)
            {
                garrison.RemoveAt(index);
            }
            else
            {
                garrison[index] = garrison[index] with { Count = remaining };
            }
        }
        else
        {
            garrison.Add(new UnitStack(type, delta));
        }

        var (production, capacity) = BuildingCatalogue.Totals(Buildings, terrainAt);
        var resources = Resources.WithRate(
            ApplyUpkeep(production * speedFactor, garrison, guestStacks ?? []), capacity, now);

        return AdminGarrisonEditResult.Accept(this with { Garrison = garrison, Resources = resources });
    }

    /// <summary>
    /// Swaps in a new building list and re-rates production/capacity from
    /// <paramref name="now"/> — the shared tail of <see cref="PlaceBuilding"/>
    /// and <see cref="RazeBuilding"/>. Any queued order still aimed at
    /// <paramref name="editedCoord"/> is dropped: it was planned against a
    /// building that is no longer the one standing there, so letting it
    /// complete would silently overwrite the admin's edit.
    /// </summary>
    private Settlement WithBuildings(
        List<PlacedBuilding> buildings,
        HexCoord editedCoord,
        DateTimeOffset now,
        double speedFactor,
        IReadOnlyList<UnitStack>? guestStacks,
        Func<HexCoord, Terrain>? terrainAt)
    {
        var (production, capacity) = BuildingCatalogue.Totals(buildings, terrainAt);
        var resources = Resources.WithRate(
            ApplyUpkeep(production * speedFactor, Garrison, guestStacks ?? []), capacity, now);

        return this with
        {
            Buildings = buildings,
            Queue = [.. Queue.Where(o => o.Coord != editedCoord)],
            Resources = resources,
        };
    }

    /// <summary>Net production (after garrison and guest upkeep) and capacity implied by what currently stands.</summary>
    public (ResourceAmounts ProductionPerHour, ResourceAmounts Capacity) CurrentTotals(
        double speedFactor = 1.0, IReadOnlyList<UnitStack>? guestStacks = null, Func<HexCoord, Terrain>? terrainAt = null)
    {
        var (production, capacity) = BuildingCatalogue.Totals(Buildings, terrainAt);
        return (ApplyUpkeep(production * speedFactor, Garrison, guestStacks ?? []), capacity);
    }

    /// <summary>
    /// Decides whether <paramref name="count"/> of <paramref name="type"/> may
    /// be trained, and at what cost.
    /// </summary>
    /// <remarks>
    /// Call on an already-settled settlement, so the queue and stock reflect
    /// <paramref name="now"/> — mirrors <see cref="PlanBuild"/>.
    /// </remarks>
    /// <param name="hasShoreline">
    /// Whether this settlement's own claimed territory (<see cref="Claims"/>)
    /// includes at least one <see cref="World.Shoreline.IsShoreline"/> hex —
    /// computed by the caller (a real <c>TerrainSampler</c> in production),
    /// exactly the way <see cref="PlanBuild"/>'s <c>isCoastalWater</c> is.
    /// Only ever consulted for <see cref="UnitClass.Ship"/> unit types (issue
    /// #40 phase 6, design doc §8: ship training needs a coastal settlement,
    /// independent of any future Shipyard building); ignored for every other
    /// class.
    /// </param>
    /// <param name="speedFactor">
    /// The world's current <c>SpeedFactor</c> — divides per-unit training
    /// duration, the same way <see cref="PlanBuild"/> already divides build
    /// duration. Previously not applied here at all, which meant a world
    /// sped up for testing/admin purposes still trained units at the
    /// unscaled rate while every building finished faster.
    /// </param>
    public TrainDecision PlanTrain(
        UnitType type, int count, DateTimeOffset now, Guid orderId, bool hasShoreline = false, double speedFactor = 1.0)
    {
        if (count <= 0)
        {
            return TrainDecision.Rejected(TrainRejection.InvalidCount);
        }

        if (!UnitCatalogue.IsAvailable(type, LonghouseLevel))
        {
            return TrainDecision.Rejected(TrainRejection.UnitNotAvailable);
        }

        if (UnitCatalogue.Get(type).Class == UnitClass.Ship && !hasShoreline)
        {
            return TrainDecision.Rejected(TrainRejection.SettlementNotCoastal);
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

        var perUnitDuration = speedFactor == 1.0
            ? definition.TrainingDuration
            : TimeSpan.FromTicks((long)(definition.TrainingDuration.Ticks / speedFactor));

        return TrainDecision.Accept(new TrainingOrder
        {
            Id = orderId,
            UnitType = type,
            Count = count,
            StartedAt = now,
            PerUnitDuration = perUnitDuration,
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

    /// <summary>
    /// The settlement-side half of dispatching an army (issue #40 phase 2):
    /// checks the garrison actually holds every requested unit type in the
    /// requested count, that the requested provisions do not exceed what
    /// those units could carry, and that Food covers them — and if so,
    /// returns the settlement with those units and that food already
    /// removed. Route/food-range validation happens one layer up, in
    /// <see cref="Army.PlanDispatch"/>, which is what actually accepts or
    /// rejects a dispatch end to end — call this directly only when
    /// terrain/pathing is irrelevant (e.g. a unit test of the resource side
    /// alone).
    /// </summary>
    /// <remarks>
    /// Call on an already-settled settlement, so the garrison and stock
    /// reflect <paramref name="now"/> — mirrors <see cref="PlanBuild"/> and
    /// <see cref="PlanTrain"/>.
    /// </remarks>
    public SettlementDispatchDecision PlanDispatch(
        IReadOnlyList<UnitStack> requestedUnits, double provisions, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(requestedUnits);

        var normalised = requestedUnits
            .Where(s => s.Count > 0)
            .GroupBy(s => s.Type)
            .Select(g => new UnitStack(g.Key, g.Sum(s => s.Count)))
            .ToList();

        if (normalised.Count == 0)
        {
            return SettlementDispatchDecision.Rejected(DispatchRejection.NoUnitsRequested);
        }

        var garrison = Garrison.ToList();
        foreach (var stack in normalised)
        {
            var index = garrison.FindIndex(g => g.Type == stack.Type);
            if (index < 0 || garrison[index].Count < stack.Count)
            {
                return SettlementDispatchDecision.Rejected(DispatchRejection.InsufficientGarrison);
            }
        }

        if (provisions < 0)
        {
            return SettlementDispatchDecision.Rejected(DispatchRejection.ProvisionsExceedCarryCapacity);
        }

        var carryCapacity = normalised.Sum(s => UnitCatalogue.Get(s.Type).FoodCarryCapacity * s.Count);
        if (provisions > carryCapacity)
        {
            return SettlementDispatchDecision.Rejected(DispatchRejection.ProvisionsExceedCarryCapacity);
        }

        if (!Resources.TrySpend(new ResourceAmounts(Wood: 0, Stone: 0, Food: provisions, Iron: 0), now, out var paidResources))
        {
            return SettlementDispatchDecision.Rejected(DispatchRejection.InsufficientResources);
        }

        foreach (var stack in normalised)
        {
            var index = garrison.FindIndex(g => g.Type == stack.Type);
            var remaining = garrison[index].Count - stack.Count;
            if (remaining <= 0)
            {
                garrison.RemoveAt(index);
            }
            else
            {
                garrison[index] = garrison[index] with { Count = remaining };
            }
        }

        var updated = this with { Garrison = garrison, Resources = paidResources };
        return SettlementDispatchDecision.Accept(updated, normalised);
    }
}

/// <param name="Changed">
/// False when nothing was due and nobody starved, meaning the caller has
/// nothing to persist.
/// </param>
/// <param name="Completed">Build orders that finished during this settle.</param>
/// <param name="TrainingCompleted">Training batches that finished during this settle.</param>
/// <param name="Deaths">
/// Home-garrison units starvation killed during this settle (see
/// <c>Settlement.ApplyStarvation</c>), grouped by type. Not surfaced via the
/// API yet — a caller that wants to log or report it can from here.
/// </param>
/// <param name="GuestDeaths">
/// The guest side's pooled per-type share of the same starvation pass (issue
/// #40 phase 4 §2) — always empty when <c>SettleTo</c> was called with no
/// <c>guestStacks</c>. Still pooled across every guest army hosted here; the
/// service layer splits this further across the actual guest <c>ArmyEntity</c>
/// rows present — see <c>Settlement.SettleTo</c>'s remarks.
/// </param>
public sealed record SettleResult(
    Settlement Settlement,
    bool Changed,
    IReadOnlyList<BuildOrder> Completed,
    IReadOnlyList<TrainingOrder> TrainingCompleted,
    IReadOnlyList<UnitStack> Deaths,
    IReadOnlyList<UnitStack> GuestDeaths);
