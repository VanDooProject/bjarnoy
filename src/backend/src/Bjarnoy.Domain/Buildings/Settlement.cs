using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Shrines;
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
    /// <summary>
    /// Waiting-queue depth for a premium settlement (issue #158) — orders
    /// queued behind whatever is already occupying every construction slot.
    /// Zero for non-premium and anonymous settlements
    /// (<c>SettlementService.QueueBuildAsync</c> passes 0 for those), which is
    /// how a client tells "queue is premium-locked" apart from "queue is
    /// full" — see <see cref="BuildRejection.NoFreeSlot"/>.
    /// </summary>
    public const int MaxWaitingOrders = 3;

    /// <summary>
    /// Default cap on simultaneously queued/building orders on one hex
    /// (issue #158 stage 1d). The domain supports a level chain per hex from
    /// day one, but the capability ships switched off — every call site
    /// passes this constant until a paid "stacking" tier is designed, at
    /// which point <c>SettlementService.QueueBuildAsync</c> is the one seam
    /// that needs to change.
    /// </summary>
    public const int DefaultMaxOrdersPerHex = 1;

    /// <summary>
    /// Training orders that may be queued at once. A separate, more generous
    /// limit from <see cref="MaxQueueLength"/>: build slots gate a scarce
    /// resource (hexes to build on), while training batches are just requests
    /// to spend resources over time, so there is no reason to make it as
    /// scarce.
    /// </summary>
    public const int MaxTrainingQueueLength = 5;

    /// <summary>
    /// The stacking cap on a shrine/rune bonus (issue #53): additive, then
    /// capped — no multiplicative chains, no diminishing returns in v1.
    /// </summary>
    public const double MaxEffectBonus = 0.5;

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

    /// <summary>
    /// Runes this settlement holds — slotted into a shrine (<see cref="RuneInstance.SlottedAt"/>
    /// is that shrine's hex) or sitting unslotted in storage.
    /// </summary>
    public IReadOnlyList<RuneInstance> Runes { get; init; } = [];

    public int LonghouseLevel =>
        Buildings.FirstOrDefault(b => b.Type == BuildingType.Longhouse).Level;

    /// <summary>Food consumed per hour by everything currently in <see cref="Garrison"/>.</summary>
    public double UpkeepPerHour => TotalUpkeepPerHour(Garrison);

    /// <summary>
    /// Claim radius of the settlement's own centre disc, driven by longhouse
    /// level (MECHANICS.md §2: borders grow when the anchor levels up). This
    /// is only the centre disc — the settlement's full claimed territory is
    /// the union of this and every placed Tower's own satellite disc; see
    /// <see cref="Claims"/> and <see cref="ClaimDiscs"/>. Backed by
    /// <see cref="BuildingDefinition.ClaimRadius"/> so the number lives in
    /// one place, alongside every other Longhouse stat.
    /// </summary>
    public int ClaimRadius => ClaimRadiusForLonghouseLevel(LonghouseLevel);

    /// <summary>
    /// <see cref="ClaimRadius"/> for an arbitrary longhouse level, clamped to
    /// at least 1 — a settlement with no standing Longhouse (level 0, e.g.
    /// mid-founding) still gets the level-1 radius rather than a lookup
    /// failure, matching this property's old <c>1 + (level / 2)</c> formula
    /// at level 0. Public so callers with only a raw longhouse level on hand
    /// (a lightweight DB projection, e.g. <c>SettlementService.GetClaimedSettlementsAsync</c>
    /// or <c>ArmyService</c>'s siege-arrival check) can compute the same
    /// number without a full <see cref="Settlement"/> instance.
    /// </summary>
    public static int ClaimRadiusForLonghouseLevel(int longhouseLevel) =>
        BuildingCatalogue.Get(BuildingType.Longhouse, Math.Max(1, longhouseLevel)).ClaimRadius;

    /// <summary>
    /// How many orders may build in parallel right now (issue #158):
    /// <c>2 + max(0, (longhouseLevel − 5) / 5)</c> — 2 slots at level 1–9, 3 at
    /// 10, 4 at 15, 5 at 20. The formula deliberately outlives today's
    /// <see cref="BuildingCatalogue.MaxLevel"/> of 10. A razed settlement
    /// (<see cref="LonghouseLevel"/> 0) still reads 2 — harmless, since every
    /// building needs <see cref="BuildingDefinition.RequiredLonghouseLevel"/>
    /// &gt;= 1 and nothing can be queued there anyway.
    /// </summary>
    public int ConstructionSlots => ConstructionSlotsFor(Buildings);

    private static int ConstructionSlotsFor(IReadOnlyList<PlacedBuilding> buildings)
    {
        var longhouseLevel = buildings.FirstOrDefault(b => b.Type == BuildingType.Longhouse).Level;
        return 2 + Math.Max(0, (longhouseLevel - 5) / 5);
    }

    /// <summary>Queued orders already under construction — see <see cref="BuildOrder.IsWaiting"/>.</summary>
    public IEnumerable<BuildOrder> ActiveOrders => Queue.Where(o => !o.IsWaiting);

    /// <summary>Queued orders still waiting for a construction slot (the premium queue).</summary>
    public IEnumerable<BuildOrder> WaitingOrders => Queue.Where(o => o.IsWaiting);

    /// <summary>How many construction slots <see cref="ActiveOrders"/> currently occupies.</summary>
    public int UsedSlots => UsedSlotsFor(Queue, ConstructionSlots);

    private static int EffectiveSlotCost(BuildOrder order, int constructionSlots)
    {
        var definition = BuildingCatalogue.Get(order.Type, order.TargetLevel);
        return definition.OccupiesAllSlots ? constructionSlots : definition.SlotCost;
    }

    private static int UsedSlotsFor(IReadOnlyList<BuildOrder> queue, int constructionSlots) =>
        queue.Where(o => !o.IsWaiting).Sum(o => EffectiveSlotCost(o, constructionSlots));

    /// <summary><see cref="ConstructionSlots"/> minus <see cref="UsedSlots"/>, floored at zero.</summary>
    public int FreeSlots => Math.Max(0, ConstructionSlots - UsedSlots);

    /// <summary>
    /// The cost of every <see cref="WaitingOrders"/> entry, summed —
    /// resources still physically sitting in <see cref="Resources"/> but
    /// earmarked and unspendable on anything else (issue #158 stage 1c).
    /// Derived, never stored.
    /// </summary>
    public ResourceAmounts ReservedResources =>
        WaitingOrders.Aggregate(ResourceAmounts.Zero, (sum, o) => sum + BuildingCatalogue.Get(o.Type, o.TargetLevel).Cost);

    /// <summary>
    /// What is actually free to spend at <paramref name="now"/> — the settled
    /// stock minus <see cref="ReservedResources"/>, floored at zero. Every
    /// voluntary spend (build, train, dispatch provisions, trade, guild fees)
    /// must check this instead of <c>Resources.At(now)</c> directly, or a
    /// reservation is not a reservation — see <see cref="CanAffordAvailable"/>
    /// and <see cref="TrySpendAvailable"/>.
    /// </summary>
    public ResourceAmounts AvailableResources(DateTimeOffset now) => (Resources.At(now) - ReservedResources).ClampToZero();

    /// <summary>Whether <paramref name="cost"/> is affordable out of <see cref="AvailableResources"/>.</summary>
    public bool CanAffordAvailable(ResourceAmounts cost, DateTimeOffset now) => AvailableResources(now).Covers(cost);

    /// <summary>
    /// Spends <paramref name="cost"/> against <see cref="Resources"/>, but
    /// only when <see cref="AvailableResources"/> covers it — the
    /// reservation-aware sibling of <see cref="ResourcePool.TrySpend"/>.
    /// <see cref="ResourcePool"/> itself stays reservation-unaware (it has no
    /// idea a queue exists); <see cref="Settlement"/> is the only type that
    /// can answer "available".
    /// </summary>
    public bool TrySpendAvailable(ResourceAmounts cost, DateTimeOffset now, out ResourcePool result)
    {
        if (!CanAffordAvailable(cost, now))
        {
            result = Resources;
            return false;
        }

        return Resources.TrySpend(cost, now, out result);
    }

    /// <summary>
    /// The largest <see cref="ClaimRadius"/> the centre disc alone can ever
    /// reach (longhouse at <see cref="BuildingCatalogue.MaxLevel"/>). This is
    /// deliberately <em>not</em> a bound on a settlement's full territory —
    /// once Towers are involved there is no such fixed ceiling (a long enough
    /// chain of towers, each built inside ground the last one's own disc
    /// opened up, can in principle reach arbitrarily far from
    /// <see cref="Centre"/>; see <see cref="Claims"/>'s remarks). This
    /// constant is only ever used as founding's cheap, longhouse-only
    /// pre-filter (<c>SettlementService.MinimumSpacing</c>'s "phase 1") — a
    /// fast distance check that quickly rejects the obviously-too-close case
    /// without needing to load anyone's building list, before the real,
    /// tower-aware check runs.
    /// </summary>
    public static readonly int MaxClaimRadius =
        BuildingCatalogue.Get(BuildingType.Longhouse, BuildingCatalogue.MaxLevel).ClaimRadius;

    /// <summary>
    /// Extra radius a single <see cref="BuildingType.Tower"/>'s own satellite
    /// disc reaches outward from that tower's own hex (not the settlement
    /// centre), driven by the tower's own level. Half the growth rate of
    /// <see cref="ClaimRadius"/> (one hex of reach per two tower levels,
    /// versus one per two longhouse levels) and, deliberately, with no "+1"
    /// floor: <see cref="ClaimRadius"/>'s floor exists because a settlement
    /// always has *some* territory just for existing, but a tower can only
    /// ever be built on ground the settlement already claims, so a freshly
    /// built level-1 tower needs no guaranteed reach of its own. Product
    /// call: towers become a meaningfully sized expansion tool only once
    /// levelled up, rather than instantly doubling border growth per tower
    /// placed.
    /// </summary>
    public static int TowerClaimRadius(int towerLevel) =>
        BuildingCatalogue.TryGet(BuildingType.Tower, towerLevel)?.ClaimRadius ?? 0;

    /// <summary>The largest a single tower's own satellite disc can ever reach on its own (at <see cref="BuildingCatalogue.MaxLevel"/>).</summary>
    public static readonly int MaxTowerClaimRadius =
        BuildingCatalogue.Get(BuildingType.Tower, BuildingCatalogue.MaxLevel).ClaimRadius;

    /// <summary>
    /// Every disc that makes up the claimed territory described by
    /// <paramref name="centre"/> and <paramref name="buildings"/>: the centre
    /// disc first (sized by whatever Longhouse level <paramref name="buildings"/>
    /// carries), then one satellite disc per standing
    /// <see cref="BuildingType.Tower"/> in it, centred on that tower's own
    /// <see cref="PlacedBuilding.Coord"/> rather than <paramref name="centre"/>.
    /// The static, data-only twin of the instance <see cref="ClaimDiscs"/> —
    /// exists so a caller that only has a settlement's raw
    /// centre/buildings (e.g. a lightweight DB projection, rather than a full
    /// <see cref="Settlement"/>) can still run the exact same union check;
    /// <c>SettlementService.FoundAsync</c>'s founding-time spacing check is
    /// exactly such a caller — see that method's remarks. A tower at any
    /// level (including a level-0 foundation stub, which yields a
    /// zero-radius disc — harmless, since that hex is already claimed by
    /// construction) is included.
    /// </summary>
    public static IEnumerable<(HexCoord Centre, int Radius)> ClaimDiscsFor(
        HexCoord centre, IReadOnlyList<PlacedBuilding> buildings)
    {
        ArgumentNullException.ThrowIfNull(buildings);

        var longhouseLevel = buildings.FirstOrDefault(b => b.Type == BuildingType.Longhouse).Level;
        yield return (centre, ClaimRadiusForLonghouseLevel(longhouseLevel));
        foreach (var building in buildings)
        {
            if (building.Type == BuildingType.Tower)
            {
                yield return (building.Coord, TowerClaimRadius(building.Level));
            }
        }
    }

    /// <summary>This settlement's own claim discs — <see cref="ClaimDiscsFor"/> applied to its own <see cref="Centre"/>/<see cref="Buildings"/>.</summary>
    public IEnumerable<(HexCoord Centre, int Radius)> ClaimDiscs => ClaimDiscsFor(Centre, Buildings);

    /// <summary>
    /// Hexes this settlement has claimed — the union of the centre disc and
    /// every Tower's own satellite disc (see <see cref="ClaimDiscs"/>), not
    /// just the centre disc alone. This is the settlement's <em>one</em>
    /// claim predicate: it is what gates placing a new building
    /// (<see cref="PlanBuild"/>/<see cref="PlaceBuilding"/>, another Tower
    /// included) exactly the same as it is what territory-facing concerns —
    /// display, the fleet shoreline check, ship-training's coastal gate —
    /// read.
    /// </summary>
    /// <remarks>
    /// <para>
    /// A new Tower may legitimately be built inside ground only an
    /// <em>existing</em> tower's own satellite disc reaches, not the centre
    /// disc — and from there its own disc can reach further still. Chaining
    /// several towers this way is intended, not a loophole: it is the actual
    /// mechanism behind "a settlement with enough towers reads as an
    /// extended, stacked-looking realm" — no separate "buildable" radius
    /// gates it back to the centre disc alone.
    /// </para>
    /// <para>
    /// Because chaining is allowed, a settlement's full territory has no
    /// fixed ceiling the way <see cref="ClaimRadius"/> alone does — there is
    /// no analogue of the old <c>MaxTerritoryReach</c> to derive a safe,
    /// static minimum founding distance from any more. That is why
    /// <c>SettlementService.FoundAsync</c>'s spacing check is two-phase
    /// instead: a cheap, longhouse-only pre-filter first
    /// (<c>SettlementService.MinimumSpacing</c>, derived from
    /// <see cref="MaxClaimRadius"/> alone), then a real call to this method
    /// (via <see cref="ClaimDiscsFor"/>) against each nearby settlement's
    /// actual current buildings, towers included, plus a small fixed safety
    /// margin — see that method's remarks. The beginner-protection
    /// island-suggestion design (<c>docs/design/beginner-protection.md</c>,
    /// branch <c>claude/noob-shield-issue-132-zp7xi2</c>) applies the same
    /// two-phase pattern independently, for the same reason, at its own call
    /// site — it is not unified with <c>FoundAsync</c>'s check, just built on
    /// the same idea.
    /// </para>
    /// </remarks>
    public bool Claims(HexCoord coord) => ClaimDiscs.Any(disc => disc.Centre.DistanceTo(coord) <= disc.Radius);

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

        var buildings = Buildings.ToList();
        var garrison = Garrison.ToList();
        var guestPool = guestStacks.ToList();
        var queue = Queue.ToList();
        var trainingQueue = TrainingQueue.ToList();
        var resources = Resources;

        var completedBuilds = new List<BuildOrder>();
        var completedTraining = new List<TrainingOrder>();
        var promotedAny = false;

        // Bounded loop: each iteration applies the single earliest still-due
        // completion (a building or a training batch — merged into one
        // chronological timeline so a batch that finished between two build
        // completions is rated as existing for exactly the right slice of
        // time, never the whole window or none of it), then immediately
        // promotes whatever the resulting free slot allows. Ordering within
        // an instant is normative: complete -> promote -> (after the loop)
        // starvation, so a promotion's food spend is visible to the
        // starvation pass at that same instant. Terminates because every
        // iteration removes exactly one order from Queue/TrainingQueue, both
        // finite.
        while (true)
        {
            var dueBuild = queue.Where(o => !o.IsWaiting && o.IsComplete(now)).OrderBy(o => o.CompletesAt).FirstOrDefault();
            var dueTrain = trainingQueue.Where(o => o.IsComplete(now)).OrderBy(o => o.CompletesAt).FirstOrDefault();

            if (dueBuild is null && dueTrain is null)
            {
                break;
            }

            var takeBuild = dueBuild is not null && (dueTrain is null || dueBuild.CompletesAt!.Value <= dueTrain.CompletesAt);

            DateTimeOffset eventTime;
            if (takeBuild)
            {
                var order = dueBuild!;
                eventTime = order.CompletesAt!.Value;

                var index = buildings.FindIndex(b => b.Coord == order.Coord);
                if (index >= 0)
                {
                    buildings[index] = buildings[index] with { Type = order.Type, Level = order.TargetLevel };
                }
                else
                {
                    buildings.Add(new PlacedBuilding(order.Coord, order.Type, order.TargetLevel));
                }

                queue.Remove(order);
                completedBuilds.Add(order);
            }
            else
            {
                var train = dueTrain!;
                eventTime = train.CompletesAt;

                // The whole batch lands in the garrison at once, at the
                // instant the last unit finishes — see TrainingOrder's
                // remarks for why a batch is not split as it partially
                // completes.
                AddToGarrison(garrison, train.UnitType, train.Count);
                trainingQueue.Remove(train);
                completedTraining.Add(train);
            }

            // Each completion changes the rate from its own instant, so a
            // building (or batch) finished an hour ago has applied for that
            // hour.
            var (production, capacity) = BoostedTotals(buildings, Runes, terrainAt);
            resources = resources.WithRate(ApplyUpkeep(production * speedFactor, garrison, guestPool), capacity, eventTime);

            // A build completion (or, harmlessly, a training one) may have
            // freed a construction slot — promote at this same instant, so
            // reading the settlement at any later time gives the same answer
            // whether this ran once or was replayed step by step.
            var soFar = this with
            {
                Buildings = buildings,
                Queue = queue,
                TrainingQueue = trainingQueue,
                Garrison = garrison,
                Resources = resources,
            };
            var (promoted, promotionChanged) = soFar.PromoteWaitingOrders(eventTime, speedFactor);
            if (promotionChanged)
            {
                promotedAny = true;
                buildings = promoted.Buildings.ToList();
                queue = promoted.Queue.ToList();
                resources = promoted.Resources;
            }
        }

        var (finalProduction, finalCapacity) = BoostedTotals(buildings, Runes, terrainAt);
        finalProduction *= speedFactor;

        // Starvation is checked every settle, not only when something
        // completed: a garrison (home or guest) can run its settlement out of
        // food purely by sitting there while nobody looks, with no order due
        // at all. Runs after every completion/promotion above, so a
        // promotion's food spend at this same instant is already reflected.
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

        // A raid dropping the stock below the reservations is handled at the
        // raid's own instant (Army.cs); this is the lazy-settle counterpart —
        // any settlement's stock can also simply decay below its reservations
        // over time from other spending paths going stale, so every settle
        // re-checks the tail of the waiting queue too.
        var beforeWaiting = queue.Count(o => o.IsWaiting);
        var afterDrop = (this with { Queue = queue, Resources = resources }).DropUnfundedOrders(now);
        queue = afterDrop.Queue.ToList();
        var droppedAny = queue.Count(o => o.IsWaiting) != beforeWaiting;

        var changed = completedBuilds.Count > 0 || completedTraining.Count > 0 || deaths.Count > 0
            || guestDeaths.Count > 0 || rateIsStale || promotedAny || droppedAny;
        if (!changed)
        {
            return new SettleResult(this, Changed: false, [], [], [], []);
        }

        var settled = this with
        {
            Buildings = buildings,
            Garrison = garrison,
            Queue = queue,
            TrainingQueue = trainingQueue,
            Resources = resources,
        };

        return new SettleResult(settled, Changed: true, completedBuilds, completedTraining, deaths, guestDeaths);
    }

    /// <summary>
    /// The one place a waiting order becomes a building order: takes
    /// head-of-queue waiting orders (FIFO by <see cref="BuildOrder.QueuedAt"/>,
    /// skipping any whose hex still has an earlier unfinished order ahead of
    /// it — the stage 1d same-hex contiguity rule) while their slot cost fits
    /// <see cref="FreeSlots"/>, spends each at <paramref name="now"/>, stamps
    /// <see cref="BuildOrder.StartedAt"/>/<see cref="BuildOrder.CompletesAt"/>
    /// from <see cref="BuildOrder.BaseDuration"/> scaled by
    /// <paramref name="speedFactor"/> (the factor in force <em>now</em>, not
    /// whatever was in force when the order was queued), and stakes the
    /// level-0 stub. Called from every path that can free a slot:
    /// <see cref="SettleTo"/> (after each completion), <see cref="CancelBuild"/>
    /// (cancelling a building order), and <see cref="WithQueuesDueAt"/>
    /// (admin instant build).
    /// </summary>
    /// <remarks>
    /// Deliberately does not skip ahead: if the head-of-line waiting order's
    /// slot cost does not fit the currently free slots, promotion stops there
    /// even if a smaller order further back would fit — a longhouse upgrade
    /// waiting for every slot is not jumped by a one-slot Farm behind it.
    /// </remarks>
    public (Settlement Settlement, bool Changed) PromoteWaitingOrders(DateTimeOffset now, double speedFactor = 1.0)
    {
        var queue = Queue.ToList();
        var buildings = Buildings.ToList();
        var resources = Resources;
        var constructionSlots = ConstructionSlotsFor(buildings);
        var changed = false;

        while (true)
        {
            var used = UsedSlotsFor(queue, constructionSlots);
            var free = Math.Max(0, constructionSlots - used);
            if (free <= 0)
            {
                break;
            }

            // Queue is already in FIFO/plan order (Enqueue only ever
            // appends), so list position — not QueuedAt — is the tiebreaker
            // that actually matters: two orders planned in the same instant
            // (identical QueuedAt, e.g. two requests landing in the same
            // tick) still have a real, distinguishable plan order here.
            var candidate = queue
                .Where(o => o.IsWaiting)
                .FirstOrDefault(o =>
                {
                    var index = queue.IndexOf(o);
                    return !queue.Any(other => other.Coord == o.Coord && other.Id != o.Id && queue.IndexOf(other) < index);
                });

            if (candidate is null)
            {
                break;
            }

            var definition = BuildingCatalogue.Get(candidate.Type, candidate.TargetLevel);
            var slotCost = definition.OccupiesAllSlots ? constructionSlots : definition.SlotCost;
            if (slotCost > free)
            {
                // Head-of-line blocking: the waiting queue is FIFO, not a
                // pool a smaller order can jump.
                break;
            }

            if (!resources.TrySpend(definition.Cost, now, out var paid))
            {
                // Reserved resources should already cover this — defensive
                // only (e.g. a caller settling with a stale/short stock).
                break;
            }

            resources = paid;

            var duration = speedFactor == 1.0
                ? candidate.BaseDuration
                : TimeSpan.FromTicks((long)(candidate.BaseDuration.Ticks / speedFactor));
            var started = candidate with { StartedAt = now, CompletesAt = now + duration };
            queue[queue.FindIndex(o => o.Id == candidate.Id)] = started;

            if (!buildings.Any(b => b.Coord == started.Coord))
            {
                buildings.Add(new PlacedBuilding(started.Coord, started.Type, Level: 0));
            }

            changed = true;
        }

        return changed
            ? (this with { Queue = queue, Buildings = buildings, Resources = resources }, true)
            : (this, false);
    }

    /// <summary>
    /// Walks <see cref="WaitingOrders"/> in queue order, accumulating each
    /// one's reserved cost against the settled stock at <paramref name="now"/>;
    /// at the first one the stock can no longer cover, drops it and every
    /// order behind it (issue #158: a raid taking the stock below the
    /// reservations, at the instant it happens). No refund — the resources
    /// were never deducted for a waiting order; the raider simply took them.
    /// Called at the tail of <see cref="SettleTo"/> and from the raid path
    /// (<c>Army.SettleArrival</c>).
    /// </summary>
    public Settlement DropUnfundedOrders(DateTimeOffset now)
    {
        // Queue (and so WaitingOrders, a filter over it) is already in
        // FIFO/plan order — see PromoteWaitingOrders' remarks.
        var waiting = WaitingOrders.ToList();
        if (waiting.Count == 0)
        {
            return this;
        }

        var stock = Resources.At(now);
        var running = ResourceAmounts.Zero;
        var keep = new HashSet<Guid>();
        var dropping = false;

        foreach (var order in waiting)
        {
            if (dropping)
            {
                continue;
            }

            var candidateTotal = running + BuildingCatalogue.Get(order.Type, order.TargetLevel).Cost;
            if (!stock.Covers(candidateTotal))
            {
                dropping = true;
                continue;
            }

            running = candidateTotal;
            keep.Add(order.Id);
        }

        if (!dropping)
        {
            return this;
        }

        return this with { Queue = [.. Queue.Where(o => !o.IsWaiting || keep.Contains(o.Id))] };
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
    /// <param name="maxWaitingOrders">
    /// How many orders may sit in the waiting queue at once — 0 for
    /// non-premium/anonymous play, <see cref="MaxWaitingOrders"/> for premium
    /// (<c>SettlementService.QueueBuildAsync</c> decides which, from the
    /// settlement's owning user).
    /// </param>
    /// <param name="maxOrdersPerHex">
    /// How many orders (building + waiting) may target one hex at once —
    /// <see cref="DefaultMaxOrdersPerHex"/> (1) everywhere today; the seam a
    /// future per-hex-stacking tier switches on (issue #158 stage 1d).
    /// </param>
    /// <param name="riverShapeAt">
    /// The shape of the river tile standing on <paramref name="coord"/>
    /// itself, or <see langword="null"/> if there is none there. Only a
    /// <see cref="BuildingDefinition.RequiresRiverShape"/> building (the
    /// Sawmill, built directly on a river tile) cares.
    /// </param>
    public BuildDecision PlanBuild(
        BuildingType type,
        HexCoord coord,
        Terrain terrain,
        DateTimeOffset now,
        Guid orderId,
        double speedFactor = 1.0,
        bool isCoastalWater = false,
        int maxWaitingOrders = 0,
        int maxOrdersPerHex = DefaultMaxOrdersPerHex,
        RiverTileShape? riverShapeAt = null)
    {
        if (!Claims(coord))
        {
            return BuildDecision.Rejected(BuildRejection.HexNotInSettlement);
        }

        // Queue is already in FIFO/plan order — see PromoteWaitingOrders' remarks.
        var ordersOnHex = Queue.Where(o => o.Coord == coord).ToList();
        if (ordersOnHex.Count >= maxOrdersPerHex)
        {
            return BuildDecision.Rejected(BuildRejection.AlreadyQueuedOnHex);
        }

        var existing = Buildings.FirstOrDefault(b => b.Coord == coord);
        var occupied = Buildings.Any(b => b.Coord == coord);

        // A hex holds one building type. What "already there" means for a
        // fresh order is either the standing building, or — once stacking is
        // switched on — whatever the last already-queued order on this hex
        // targets, so a level chain (Farm -> 2, then -> 3) computes against
        // the plan rather than what is standing today.
        var typeOnHex = ordersOnHex.Count > 0 ? ordersOnHex[^1].Type : (occupied ? existing.Type : (BuildingType?)null);
        if (typeOnHex is { } standingType && standingType != type)
        {
            // A hex holds one building; replacing means razing first.
            return BuildDecision.Rejected(BuildRejection.HexOccupied);
        }

        var baseLevel = ordersOnHex.Count > 0 ? ordersOnHex[^1].TargetLevel : (occupied ? existing.Level : 0);
        var targetLevel = baseLevel + 1;
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

        if (definition.RequiresRiverShape is { } requiredShapes
            && (riverShapeAt is not { } actualShape || !requiredShapes.Contains(actualShape)))
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

        if (definition.RequiredBuildingType is { } requiredType)
        {
            var requiredLevel = Buildings.FirstOrDefault(b => b.Type == requiredType).Level;
            if (requiredLevel < definition.RequiredBuildingLevel)
            {
                return BuildDecision.Rejected(BuildRejection.RequiredBuildingTooLow);
            }
        }

        // A voluntary spend — including a brand-new build order — must not
        // dip into what is already reserved for the waiting queue (issue #158
        // stage 1c).
        if (!CanAffordAvailable(definition.Cost, now))
        {
            return BuildDecision.Rejected(BuildRejection.NotEnoughResources);
        }

        var slotCost = definition.OccupiesAllSlots ? ConstructionSlots : definition.SlotCost;

        // A stacked order (maxOrdersPerHex > 1) can only ever start once
        // every earlier order already queued on this same hex is done — an
        // earlier one still present in ordersOnHex means it has not
        // completed, whether it is itself building or still waiting. Slots
        // alone are not enough: two levels of the same hex must never be
        // "under construction" at once, or completion order (and hence the
        // level a hex ends up at) stops being deterministic.
        var earlierOnHexUnfinished = ordersOnHex.Count > 0;
        var fitsNow = !earlierOnHexUnfinished && slotCost <= FreeSlots;

        if (!fitsNow && WaitingOrders.Count() >= maxWaitingOrders)
        {
            return BuildDecision.Rejected(maxWaitingOrders <= 0 ? BuildRejection.NoFreeSlot : BuildRejection.QueueFull);
        }

        if (fitsNow)
        {
            var duration = speedFactor == 1.0
                ? definition.BuildDuration
                : TimeSpan.FromTicks((long)(definition.BuildDuration.Ticks / speedFactor));

            return BuildDecision.Accept(new BuildOrder
            {
                Id = orderId,
                Type = type,
                TargetLevel = targetLevel,
                Coord = coord,
                QueuedAt = now,
                BaseDuration = definition.BuildDuration,
                StartedAt = now,
                CompletesAt = now + duration,
            });
        }

        return BuildDecision.Accept(new BuildOrder
        {
            Id = orderId,
            Type = type,
            TargetLevel = targetLevel,
            Coord = coord,
            QueuedAt = now,
            BaseDuration = definition.BuildDuration,
            StartedAt = null,
            CompletesAt = null,
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

        // A waiting order spends nothing and stakes no stub — its cost sits
        // reserved (see ReservedResources) but the building itself does not
        // exist yet in any form a hex-reader could see (issue #158).
        if (order.IsWaiting)
        {
            return this with { Queue = [.. Queue, order] };
        }

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
    public CancelBuildResult CancelBuild(Guid orderId, DateTimeOffset now, double speedFactor = 1.0)
    {
        var order = Queue.FirstOrDefault(o => o.Id == orderId);
        if (order is null)
        {
            return CancelBuildResult.Rejected(CancelBuildRejection.OrderNotFound);
        }

        // A waiting order never spent anything (its cost is only reserved) —
        // cancelling it just drops it, no refund, no stub to remove (it never
        // staked one).
        if (order.IsWaiting)
        {
            return CancelBuildResult.Accept(this with { Queue = [.. Queue.Where(o => o.Id != orderId)] });
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

        // Cancelling a building order frees a slot right now — promote
        // whatever is waiting immediately, or it would sit idle until the
        // next unrelated completion.
        var (promoted, _) = settled.PromoteWaitingOrders(now, speedFactor);

        return CancelBuildResult.Accept(promoted);
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

        var (production, capacity) = BoostedTotals(buildings, Runes, terrainAt);
        var resources = Resources.WithRate(
            ApplyUpkeep(production * speedFactor, Garrison, guestStacks ?? []), capacity, now);

        // Any order still targeting this hex was planned against the level
        // this admin edit just overwrote — letting it complete later would
        // silently clobber the edit (issue #158 stage 1b). No refund: same
        // rule as a raid dropping a waiting order or a catapult removing a
        // building outright.
        var queue = Queue.Where(o => o.Coord != coord).ToList();

        return SetBuildingLevelResult.Accept(this with { Buildings = buildings, Resources = resources, Queue = queue });
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
    public Settlement WithQueuesDueAt(DateTimeOffset now, bool builds = true, bool training = true)
    {
        var settlement = this;

        if (builds)
        {
            // God mode bypasses slot limits entirely, not just this once —
            // ordinary PromoteWaitingOrders is deliberately slot-gated (that
            // is the whole feature it exists for), so it cannot be reused
            // here: the still-building orders below are about to be marked
            // due in this very call, but PromoteWaitingOrders would see them
            // as still occupying their slots and refuse to promote anything
            // behind them. Every waiting order is instead spent and started
            // directly, ignoring FreeSlots, so instant build always empties
            // the whole queue in one pass — including the premium waiting
            // tail — never stalling on slot limits. maxWaitingOrders/
            // maxOrdersPerHex do not apply here either: this is an admin
            // bypass, not a new plan.
            var queue = settlement.Queue.ToList();
            var buildings = settlement.Buildings.ToList();
            var resources = settlement.Resources;

            for (var i = 0; i < queue.Count; i++)
            {
                var order = queue[i];
                if (order.IsComplete(now))
                {
                    continue;
                }

                if (order.IsWaiting)
                {
                    var definition = BuildingCatalogue.Get(order.Type, order.TargetLevel);
                    if (!resources.TrySpend(definition.Cost, now, out var paid))
                    {
                        // Defensive only: reserved resources should already
                        // cover this. Leave it waiting rather than starting
                        // an order that was never actually paid for.
                        continue;
                    }

                    resources = paid;
                    if (!buildings.Any(b => b.Coord == order.Coord))
                    {
                        buildings.Add(new PlacedBuilding(order.Coord, order.Type, Level: 0));
                    }

                    queue[i] = order with { StartedAt = now, CompletesAt = now };
                }
                else
                {
                    queue[i] = order with { CompletesAt = now };
                }
            }

            settlement = settlement with { Queue = queue, Buildings = buildings, Resources = resources };
        }

        if (training)
        {
            // A TrainingOrder's CompletesAt is derived, not stored (StartedAt
            // plus per-unit duration times count), so "due now" is expressed
            // by restarting the batch at now with no per-unit duration left
            // to serve — which also makes its live CompletedCount read as the
            // full batch.
            settlement = settlement with
            {
                TrainingQueue = [.. settlement.TrainingQueue.Select(o => o.IsComplete(now)
                    ? o
                    : o with { StartedAt = now, PerUnitDuration = TimeSpan.Zero })],
            };
        }

        return settlement;
    }

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
        if (!Claims(coord))
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

        var (production, capacity) = BoostedTotals(Buildings, Runes, terrainAt);
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
    /// <summary>
    /// Swaps in <paramref name="buildings"/> after catapult damage
    /// (<see cref="Combat.SiegeResolver.Resolve"/>) and re-rates
    /// production/capacity from <paramref name="now"/>, mirroring
    /// <see cref="WithBuildings"/>. Unlike an admin edit, a siege that merely
    /// reduces a level leaves any pending order for that hex alone — it still
    /// completes to whatever level it always would have. Only when the target
    /// was destroyed outright (<paramref name="targetCoord"/> no longer
    /// appears in <paramref name="buildings"/>) is the order dropped too
    /// (issue #158 stage 1b): without this, <see cref="SettleTo"/>'s
    /// completion pass would find nothing standing at that hex and add the
    /// finished building back — silently undoing the catapult shot.
    /// </summary>
    public Settlement WithSiegeDamage(
        IReadOnlyList<PlacedBuilding> buildings,
        HexCoord targetCoord,
        DateTimeOffset now,
        double speedFactor = 1.0,
        IReadOnlyList<UnitStack>? guestStacks = null,
        Func<HexCoord, Terrain>? terrainAt = null)
    {
        ArgumentNullException.ThrowIfNull(buildings);

        var (production, capacity) = BoostedTotals(buildings, Runes, terrainAt);
        var resources = Resources.WithRate(
            ApplyUpkeep(production * speedFactor, Garrison, guestStacks ?? []), capacity, now);

        var stillStanding = buildings.Any(b => b.Coord == targetCoord);
        var queue = stillStanding ? Queue : [.. Queue.Where(o => o.Coord != targetCoord)];

        return this with { Buildings = buildings, Queue = queue, Resources = resources };
    }

    private Settlement WithBuildings(
        List<PlacedBuilding> buildings,
        HexCoord editedCoord,
        DateTimeOffset now,
        double speedFactor,
        IReadOnlyList<UnitStack>? guestStacks,
        Func<HexCoord, Terrain>? terrainAt)
    {
        var (production, capacity) = BoostedTotals(buildings, Runes, terrainAt);
        var resources = Resources.WithRate(
            ApplyUpkeep(production * speedFactor, Garrison, guestStacks ?? []), capacity, now);

        return this with
        {
            Buildings = buildings,
            Queue = [.. Queue.Where(o => o.Coord != editedCoord)],
            Resources = resources,
        };
    }

    /// <summary>
    /// Net production (after garrison and guest upkeep) and capacity implied
    /// by what currently stands, shrine favour and slotted runes included.
    /// </summary>
    public (ResourceAmounts ProductionPerHour, ResourceAmounts Capacity) CurrentTotals(
        double speedFactor = 1.0, IReadOnlyList<UnitStack>? guestStacks = null, Func<HexCoord, Terrain>? terrainAt = null)
    {
        var (production, capacity) = BoostedTotals(Buildings, Runes, terrainAt);
        return (ApplyUpkeep(production * speedFactor, Garrison, guestStacks ?? []), capacity);
    }

    /// <summary>Adds an unslotted rune to storage — a raid's spoils, a hex find, an offering's reward.</summary>
    public Settlement GrantRune(RuneInstance rune)
    {
        ArgumentNullException.ThrowIfNull(rune);

        return this with { Runes = [.. Runes, rune with { SlottedAt = null }] };
    }

    /// <summary>
    /// Slots an unslotted rune into the shrine standing on
    /// <paramref name="shrineCoord"/>, and re-rates production/capacity from
    /// <paramref name="now"/> exactly as a normal build completion would —
    /// a slotted rune's boost must show up immediately, not only on the next
    /// unrelated settle.
    /// </summary>
    /// <remarks>
    /// v1 does not restrict which rune fits which god's shrine (issue #53's
    /// "Odin accepts any rune" rule is, for now, every shrine's rule) —
    /// domain-matching is deferred until there are enough gods for the choice
    /// to matter. Call on an already-settled settlement, same as
    /// <see cref="SetBuildingLevel"/>.
    /// </remarks>
    public SlotRuneResult SlotRune(
        Guid runeId,
        HexCoord shrineCoord,
        DateTimeOffset now,
        double speedFactor = 1.0,
        IReadOnlyList<UnitStack>? guestStacks = null,
        Func<HexCoord, Terrain>? terrainAt = null)
    {
        var rune = Runes.FirstOrDefault(r => r.Id == runeId);
        if (rune is null)
        {
            return SlotRuneResult.Rejected(SlotRuneRejection.RuneNotFound);
        }

        if (rune.SlottedAt is not null)
        {
            return SlotRuneResult.Rejected(SlotRuneRejection.RuneAlreadySlotted);
        }

        var shrine = Buildings.FirstOrDefault(b => b.Coord == shrineCoord);
        var occupied = Buildings.Any(b => b.Coord == shrineCoord);
        if (!occupied || BuildingCatalogue.GodOf(shrine.Type) is null || shrine.Level < 1)
        {
            // Level 0 is the foundation stub Enqueue places while the shrine
            // is still under construction (see BuildingCatalogue.Totals's own
            // level < 1 skip) — it grants no favour yet, so it isn't a shrine
            // to slot into.
            return SlotRuneResult.Rejected(SlotRuneRejection.NoShrineOnHex);
        }

        var slots = ShrineCatalogue.Slots(shrine.Level);
        var slottedCount = Runes.Count(r => r.SlottedAt == shrineCoord);
        if (slottedCount >= slots)
        {
            return SlotRuneResult.Rejected(SlotRuneRejection.ShrineSlotsFull);
        }

        var runes = Runes
            .Select(r => r.Id == runeId ? r with { SlottedAt = shrineCoord } : r)
            .ToList();

        return SlotRuneResult.Accept(WithRunes(runes, now, speedFactor, guestStacks, terrainAt));
    }

    /// <summary>
    /// Returns a slotted rune to storage, and re-rates production/capacity
    /// from <paramref name="now"/> — the counterpart to <see cref="SlotRune"/>.
    /// </summary>
    public UnslotRuneResult UnslotRune(
        Guid runeId,
        DateTimeOffset now,
        double speedFactor = 1.0,
        IReadOnlyList<UnitStack>? guestStacks = null,
        Func<HexCoord, Terrain>? terrainAt = null)
    {
        var rune = Runes.FirstOrDefault(r => r.Id == runeId);
        if (rune is null)
        {
            return UnslotRuneResult.Rejected(UnslotRuneRejection.RuneNotFound);
        }

        if (rune.SlottedAt is null)
        {
            return UnslotRuneResult.Rejected(UnslotRuneRejection.RuneNotSlotted);
        }

        var runes = Runes
            .Select(r => r.Id == runeId ? r with { SlottedAt = null } : r)
            .ToList();

        return UnslotRuneResult.Accept(WithRunes(runes, now, speedFactor, guestStacks, terrainAt));
    }

    /// <summary>
    /// Swaps in a new rune list and re-rates production/capacity from
    /// <paramref name="now"/> — the shared tail of <see cref="SlotRune"/> and
    /// <see cref="UnslotRune"/>, mirroring <see cref="WithBuildings"/>.
    /// </summary>
    private Settlement WithRunes(
        List<RuneInstance> runes,
        DateTimeOffset now,
        double speedFactor,
        IReadOnlyList<UnitStack>? guestStacks,
        Func<HexCoord, Terrain>? terrainAt)
    {
        var (production, capacity) = BoostedTotals(Buildings, runes, terrainAt);
        var resources = Resources.WithRate(
            ApplyUpkeep(production * speedFactor, Garrison, guestStacks ?? []), capacity, now);

        return this with { Runes = runes, Resources = resources };
    }

    /// <summary>
    /// The combined favour of every shrine standing, plus every rune slotted
    /// into one, capped at <see cref="MaxEffectBonus"/> per kind.
    /// </summary>
    private static ShrineEffect ActiveEffect(IEnumerable<PlacedBuilding> buildings, IReadOnlyList<RuneInstance> runes)
    {
        var total = ShrineEffect.Zero;

        foreach (var building in buildings)
        {
            // Level 0 is the foundation stub while a shrine is still under
            // construction — BuildingCatalogue.Totals skips it the same way;
            // ShrineCatalogue.Favour/Slots clamp their level argument to
            // [1,5], so without this check a stub would grant full level-1
            // favour and a rune slot before the shrine is actually built.
            if (building.Level < 1)
            {
                continue;
            }

            var god = BuildingCatalogue.GodOf(building.Type);
            if (god is null)
            {
                continue;
            }

            total += ShrineCatalogue.Favour(god.Value, building.Level);

            var slots = ShrineCatalogue.Slots(building.Level);
            foreach (var rune in runes.Where(r => r.SlottedAt == building.Coord).Take(slots))
            {
                total += RuneCatalogue.Effect(rune.Type, rune.Rarity);
            }
        }

        return total.Capped(MaxEffectBonus, MaxEffectBonus);
    }

    /// <summary>
    /// <see cref="BuildingCatalogue.Totals(IEnumerable{PlacedBuilding}, Func{HexCoord, Terrain}?)"/>,
    /// with shrine favour and slotted runes applied as a percentage on top —
    /// the multiplicative layer, evaluated after that method's own
    /// terrain-adjacency boost.
    /// </summary>
    private static (ResourceAmounts ProductionPerHour, ResourceAmounts Capacity) BoostedTotals(
        IEnumerable<PlacedBuilding> buildings, IReadOnlyList<RuneInstance> runes, Func<HexCoord, Terrain>? terrainAt)
    {
        var placed = buildings as IReadOnlyCollection<PlacedBuilding> ?? buildings.ToList();
        var (production, capacity) = BuildingCatalogue.Totals(placed, terrainAt);
        var effect = ActiveEffect(placed, runes);

        var boostedProduction = new ResourceAmounts(
            production.Wood * (1 + effect.ProductionBonus.Wood),
            production.Stone * (1 + effect.ProductionBonus.Stone),
            production.Food * (1 + effect.ProductionBonus.Food),
            production.Iron * (1 + effect.ProductionBonus.Iron));

        return (boostedProduction, capacity * (1 + effect.StorageBonus));
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
    /// <param name="costMultiplier">
    /// Multiplies the catalogue's flat per-unit cost (issue #55 §4: settler
    /// crews cost more the more settlements the player already holds — see
    /// <see cref="Settlers.Founding.CostMultiplier"/>). 1.0 for every ordinary
    /// unit; the caller (<c>SettlementService.TrainUnitsAsync</c>) is the one
    /// that knows how many settlements the owning player holds, so it
    /// computes this rather than <see cref="Settlement"/> reaching outside
    /// its own aggregate for it.
    /// </param>
    /// <param name="speedFactor">
    /// The world's current <c>SpeedFactor</c> — divides per-unit training
    /// duration, the same way <see cref="PlanBuild"/> already divides build
    /// duration. Previously not applied here at all, which meant a world
    /// sped up for testing/admin purposes still trained units at the
    /// unscaled rate while every building finished faster.
    /// </param>
    public TrainDecision PlanTrain(
        UnitType type, int count, DateTimeOffset now, Guid orderId, bool hasShoreline = false,
        double costMultiplier = 1.0, double speedFactor = 1.0)
    {
        if (count <= 0)
        {
            return TrainDecision.Rejected(TrainRejection.InvalidCount);
        }

        if (!UnitCatalogue.IsAvailable(type, LonghouseLevel, t => Buildings.FirstOrDefault(b => b.Type == t).Level))
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
        var totalCost = definition.TrainingCost * count * costMultiplier;
        // Issue #158 stage 1c: a reservation earmarked for the waiting build
        // queue must be unspendable on anything else, training included.
        if (!CanAffordAvailable(totalCost, now))
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
            CostMultiplier = costMultiplier,
        });
    }

    /// <summary>
    /// Pays for <paramref name="order"/> (cost × batch size × <see cref="TrainingOrder.CostMultiplier"/>)
    /// and appends it to the training queue.
    /// </summary>
    public Settlement EnqueueTraining(TrainingOrder order, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(order);

        var definition = UnitCatalogue.Get(order.UnitType);
        var totalCost = definition.TrainingCost * order.Count * order.CostMultiplier;
        if (!TrySpendAvailable(totalCost, now, out var paid))
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

        // Issue #158 stage 1c: provisions are a voluntary spend too — they
        // must not dip into what is reserved for the waiting build queue.
        if (!TrySpendAvailable(new ResourceAmounts(Wood: 0, Stone: 0, Food: provisions, Iron: 0), now, out var paidResources))
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
