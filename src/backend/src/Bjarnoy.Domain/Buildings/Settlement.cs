using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.Shrines;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>
/// A building standing on a hex. <paramref name="OutsideRealmSince"/> is the game instant the hex stopped being inside the
/// player's realm (<c>docs/design/economy.md</c> section 5, "Buildings outside the realm decay"), or <see langword="null"/>
/// while it is inside: a building with a value there has no function (<see cref="IsFunctioning"/>) and loses a level every
/// <see cref="BuildingCatalogue.DecayInterval(BuildingType, double)"/>. Only <see cref="Settlement.ApplyRealmState"/> sets or clears it.
/// </summary>
public readonly record struct PlacedBuilding(HexCoord Coord, BuildingType Type, int Level, DateTimeOffset? OutsideRealmSince = null)
{
    /// <summary>Whether the hex is inside the realm, so the building produces, boosts and trains.</summary>
    public bool IsFunctioning => OutsideRealmSince is null;
}

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
    /// Training parts that may be queued in one building at once. A separate, more generous limit from
    /// <see cref="MaxQueueLength"/>: build slots gate a scarce resource (hexes to build on), while training parts are just
    /// requests to spend resources over time.
    /// </summary>
    public const int MaxTrainingPartsPerBuilding = 5;

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

    /// <summary>
    /// The units standing at this settlement, one entry per spot and unit type (<see cref="SpotStack"/>). Not armies in the
    /// field. Read through <see cref="GarrisonSpots"/>/<see cref="GarrisonAt"/> and written through
    /// <see cref="WithGarrisonAt"/>/<see cref="AddToGarrisonAt"/>; <see cref="Garrison"/> is their total.
    /// </summary>
    public IReadOnlyList<SpotStack> SpotStacks { get; init; } = [];

    /// <summary>
    /// Whether the centre (the Longhouse hex) can harbour ships: it is sand and a shoreline hex. The domain knows no terrain,
    /// so the infrastructure fills this when it builds the settlement; never persisted.
    /// </summary>
    public bool CentreHarboursShips { get; init; }

    /// <summary>
    /// Everything standing at this settlement, pooled by type over all its garrison spots (what upkeep, the quests and the
    /// fight read). Writes go through <see cref="WithGarrisonAt"/>.
    /// </summary>
    public IReadOnlyList<UnitStack> Garrison => TotalOf(SpotStacks);

    /// <summary>
    /// The garrison spots: the Longhouse hex first, then every standing Tower and Dockyard by Q, then R — one entry each, empty
    /// ones included. A tower outside the realm is still a building and still a spot; a foundation still under construction
    /// (level 0) is not standing yet.
    /// </summary>
    public IReadOnlyList<GarrisonSpot> GarrisonSpots
    {
        get
        {
            var coords = new List<(HexCoord Coord, GarrisonSpotKind Kind)> { (Centre, IsBeachCamp ? GarrisonSpotKind.BeachCamp : GarrisonSpotKind.Longhouse) };
            coords.AddRange(Buildings
                .Where(b => b.Type is BuildingType.Tower or BuildingType.Dockyard && b.Level >= 1 && b.Coord != Centre)
                .OrderBy(b => b.Coord.Q).ThenBy(b => b.Coord.R)
                .Select(b => (b.Coord, b.Type == BuildingType.Tower ? GarrisonSpotKind.Tower : GarrisonSpotKind.Dock)));

            return
            [
                .. coords.Select(c =>
                {
                    var (land, ships) = GarrisonSpot.Rule(c.Kind, CentreHarboursShips);
                    return new GarrisonSpot(c.Coord, c.Kind, GarrisonAt(c.Coord), land, ships);
                }),
            ];
        }
    }

    /// <summary>The garrison spot at <paramref name="coord"/>, or <see langword="null"/> when that hex is none.</summary>
    public GarrisonSpot? SpotAt(HexCoord coord) => GarrisonSpots.FirstOrDefault(s => s.Coord == coord);

    /// <summary>The units standing at <paramref name="coord"/> (empty when none, or when it is no spot).</summary>
    public IReadOnlyList<UnitStack> GarrisonAt(HexCoord coord) =>
        [.. SpotStacks.Where(s => s.Coord == coord && s.Count > 0).OrderBy(s => (int)s.Type).Select(s => new UnitStack(s.Type, s.Count))];

    /// <summary>This settlement with the units at <paramref name="coord"/> replaced by <paramref name="stacks"/>.</summary>
    public Settlement WithGarrisonAt(HexCoord coord, IEnumerable<UnitStack> stacks)
    {
        ArgumentNullException.ThrowIfNull(stacks);

        return this with
        {
            SpotStacks =
            [
                .. SpotStacks.Where(s => s.Coord != coord),
                .. stacks.Where(s => s.Count > 0).GroupBy(s => s.Type)
                    .Select(g => new SpotStack(coord, g.Key, g.Sum(s => s.Count))),
            ],
        };
    }

    /// <summary>This settlement with <paramref name="stacks"/> added to the units standing at <paramref name="coord"/>.</summary>
    public Settlement AddToGarrisonAt(HexCoord coord, IEnumerable<UnitStack> stacks) =>
        WithGarrisonAt(coord, GarrisonAt(coord).Concat(stacks));

    /// <summary>
    /// The nearest spot (by hex distance from <paramref name="from"/>, ties by Q, then R) that can hold every one of
    /// <paramref name="stacks"/>; <see langword="null"/> when there is none.
    /// </summary>
    public GarrisonSpot? NearestSpotFor(HexCoord from, IEnumerable<UnitStack> stacks)
    {
        var list = stacks.ToList();
        return GarrisonSpots
            .Where(s => s.HoldsAll(list))
            .OrderBy(s => s.Coord.DistanceTo(from)).ThenBy(s => s.Coord.Q).ThenBy(s => s.Coord.R)
            .FirstOrDefault();
    }

    /// <summary>
    /// Splits off the units standing at a coordinate that is no longer a garrison spot (its Tower or Dockyard was destroyed,
    /// however that happened) and returns this settlement without them, plus what stood there. The one place such a garrison is
    /// found; the infrastructure marches each group to a new spot when it persists the settlement.
    /// </summary>
    public (Settlement Settlement, IReadOnlyList<OrphanedGarrison> Orphaned) TakeOrphanedGarrisons()
    {
        var spots = GarrisonSpots.Select(s => s.Coord).ToHashSet();
        var orphans = SpotStacks.Where(s => s.Count > 0 && !spots.Contains(s.Coord)).ToList();
        if (orphans.Count == 0)
        {
            return (this, []);
        }

        var groups = orphans
            .GroupBy(s => s.Coord)
            .OrderBy(g => g.Key.Q).ThenBy(g => g.Key.R)
            .Select(g => new OrphanedGarrison(
                g.Key, [.. g.OrderBy(s => (int)s.Type).Select(s => new UnitStack(s.Type, s.Count))]))
            .ToList();
        return (this with { SpotStacks = [.. SpotStacks.Where(s => spots.Contains(s.Coord))] }, groups);
    }

    /// <summary>This settlement with the garrison at <paramref name="orphans"/> put back (a march that found no spot to go to).</summary>
    public Settlement WithOrphanedGarrison(OrphanedGarrison orphan) =>
        this with { SpotStacks = [.. SpotStacks, .. orphan.Stacks.Select(s => new SpotStack(orphan.From, s.Type, s.Count))] };

    /// <summary>Pools <paramref name="stacks"/> by type, ordered by unit type.</summary>
    internal static List<UnitStack> TotalOf(IEnumerable<SpotStack> stacks) =>
        [.. stacks.Where(s => s.Count > 0).GroupBy(s => s.Type).OrderBy(g => (int)g.Key).Select(g => new UnitStack(g.Key, g.Sum(s => s.Count)))];

    public IReadOnlyList<TrainingOrder> TrainingQueue { get; init; } = [];

    /// <summary>
    /// Runes this settlement holds — slotted into a shrine (<see cref="RuneInstance.SlottedAt"/>
    /// is that shrine's hex) or sitting unslotted in storage.
    /// </summary>
    public IReadOnlyList<RuneInstance> Runes { get; init; } = [];

    /// <summary>
    /// The Town Square feast in progress, if any (<see cref="Feasts"/>). One at
    /// a time per settlement; it does not occupy a construction slot.
    /// </summary>
    public Feast? Feast { get; init; }

    /// <summary>
    /// Renown from feasts that have ended but not yet been moved onto the
    /// owner's account. <see cref="SettleTo"/> ends a due feast into this
    /// figure, so no settle path can lose it; the infrastructure layer's
    /// <c>RenownService</c> then transfers it and zeroes it in one save, which
    /// is what makes the credit happen exactly once.
    /// </summary>
    public double PendingFeastRenown { get; init; }

    /// <summary>
    /// Bitmask of the onboarding quests whose reward was already claimed
    /// (<see cref="Quest.Mask"/>). Set once per quest, which is what makes the
    /// reward pay exactly once.
    /// </summary>
    public int ClaimedQuests { get; init; }

    /// <summary>
    /// Whether this settlement has ever dispatched an army with
    /// <see cref="ArmyMission.Hunt"/> (starting the attack counts; winning is not
    /// required). An event rather than state derivable from the settlement, so it
    /// is persisted; it completes the onboarding quest <c>hunt1</c>.
    /// </summary>
    public bool HuntStarted { get; init; }

    /// <summary>
    /// Whether this settlement ever had at least <see cref="TroopsTrainedThreshold"/>
    /// fighting land units in its home garrison. Latches true the first time and never
    /// goes back (see <see cref="WithQuestLatches"/>), so the onboarding quest
    /// <c>spearmen5</c> stays completed after the troops leave or die, and <c>hunt1</c>
    /// unlocks without the player having to claim anything.
    /// </summary>
    public bool TroopsTrained { get; init; }

    /// <summary>Fighting land units in the garrison that latch <see cref="TroopsTrained"/>.</summary>
    public const int TroopsTrainedThreshold = 5;

    /// <summary>
    /// This settlement with its persisted quest latches (<see cref="TroopsTrained"/>)
    /// brought up to date with the current <see cref="Garrison"/>; returns the same
    /// instance when nothing changes. Call wherever the domain settles or changes the
    /// garrison and the result is persisted.
    /// </summary>
    public Settlement WithQuestLatches() =>
        !TroopsTrained && FightingLandUnitCount >= TroopsTrainedThreshold
            ? this with { TroopsTrained = true }
            : this;

    /// <summary>
    /// How many completed resource producers stand here (queued orders do not
    /// count — <see cref="Buildings"/> only holds finished buildings).
    /// </summary>
    public int ProducerCount => Buildings.Count(b => Quests.IsProducer(b.Type));

    /// <summary>
    /// How many fighting land units stand in the home <see cref="Garrison"/>: every
    /// unit whose class is neither <see cref="UnitClass.Civilian"/> nor
    /// <see cref="UnitClass.Ship"/>. Completes the onboarding quest <c>spearmen5</c>.
    /// </summary>
    public int FightingLandUnitCount => Garrison
        .Where(g => UnitCatalogue.Get(g.Type).Class is not (UnitClass.Civilian or UnitClass.Ship))
        .Sum(g => g.Count);

    /// <summary>The level of the standing Town Square (0 when there is none).</summary>
    public int TownSquareLevel =>
        Buildings.Where(b => b.Type == BuildingType.TownSquare && b.IsFunctioning).Select(b => b.Level).DefaultIfEmpty(0).Max();

    public int LonghouseLevel =>
        Buildings.FirstOrDefault(b => b.Type == BuildingType.Longhouse).Level;

    /// <summary>
    /// Whether this is a beach camp: a <see cref="BuildingType.BeachCamp"/> stands at the <see cref="Centre"/> (one hex, a stock
    /// and a garrison, no production). It has no Longhouse, so <see cref="LonghouseLevel"/> stays 0 and nothing that asks for a
    /// Longhouse is satisfied by it.
    /// </summary>
    public bool IsBeachCamp => HasBeachCampAt(Buildings, Centre);

    /// <summary>Whether a <see cref="BuildingType.BeachCamp"/> stands at <paramref name="centre"/> among <paramref name="buildings"/>.</summary>
    public static bool HasBeachCampAt(IEnumerable<PlacedBuilding> buildings, HexCoord centre) =>
        buildings.Any(b => b.Type == BuildingType.BeachCamp && b.Coord == centre && b.Level >= 1);

    /// <summary>The level of the highest standing Tower (0 when there is none). Completes the onboarding quest <c>tower3</c>.</summary>
    public int TowerLevel => HighestLevelOf(BuildingType.Tower);

    /// <summary>
    /// The level of this settlement's best building of <paramref name="type"/>,
    /// or 0 when it has none. A settlement may hold several buildings of one
    /// type (two storage houses, a second tower), so a prerequisite asking for
    /// "a storage house at level 10" is answered by the highest one rather
    /// than by whichever happens to come first in coordinate order. A building outside the realm has no function and
    /// does not count.
    /// </summary>
    private int HighestLevelOf(BuildingType type) =>
        Buildings.Where(b => b.Type == type && b.IsFunctioning).Select(b => b.Level).DefaultIfEmpty(0).Max();

    /// <summary>Food consumed per hour by everything currently in <see cref="Garrison"/>.</summary>
    public double UpkeepPerHour => TotalUpkeepPerHour(Garrison);

    /// <summary>
    /// Claim radius of the settlement's own centre disc, driven by longhouse
    /// level: 2 at level 1 and 3 from level 2 on. The Longhouse only grows the
    /// realm until towers are available and stops there — from LH 3, when the
    /// first Tower unlocks, territory grows only through towers (see
    /// <see cref="BuildingCatalogue.MaxTowers"/> and
    /// <c>docs/design/economy.md</c> section 5). This
    /// is only the centre disc — the settlement's full claimed territory is
    /// the union of this and every placed Tower's own satellite disc; see
    /// <see cref="Claims"/> and <see cref="ClaimDiscs"/>. Backed by
    /// <see cref="BuildingDefinition.ClaimRadius"/> so the number lives in
    /// one place, alongside every other Longhouse stat. 0 when the Longhouse is destroyed (see <see cref="LonghouseDisc"/>).
    /// </summary>
    public int ClaimRadius => ClaimRadiusForLonghouseLevel(LonghouseLevel);

    /// <summary>
    /// <see cref="ClaimRadius"/> for an arbitrary longhouse level, capped at
    /// <see cref="BuildingCatalogue.MaxLevelFor"/> (a corrupted/out-of-range level is clamped down instead of throwing — the
    /// same defensive clamp <c>SettlementEntity.ToDomain</c> applies). Level 0 is a settlement whose Longhouse was destroyed
    /// (every settlement is founded with a level-1 Longhouse, so there is no other level-0 state): it has no claim, so this
    /// reads 0. A radius of 0 is <em>not</em> a disc — <see cref="LonghouseDisc"/> is the one place that decides whether
    /// there is a centre disc at all; this number is for callers that only measure distance from the centre (founding's
    /// spacing, <c>SettlementService.GetClaimedSettlementsAsync</c>). Public so callers with only a raw longhouse level on
    /// hand (a lightweight DB projection) can compute the same number without a full <see cref="Settlement"/>.
    /// </summary>
    public static int ClaimRadiusForLonghouseLevel(int longhouseLevel) =>
        longhouseLevel <= 0
            ? 0
            : BuildingCatalogue.Get(BuildingType.Longhouse, Math.Min(longhouseLevel, BuildingCatalogue.MaxLevelFor(BuildingType.Longhouse))).ClaimRadius;

    /// <summary>
    /// The settlement's Longhouse (centre) claim disc, or <see langword="null"/> when it has none: a settlement whose
    /// Longhouse is destroyed (level 0) has no claim at all, not even its centre hex. The one place that decides this —
    /// <see cref="ConnectedRealm"/> and <see cref="Combat.FieldBattleResolver.ClaimAt"/> both read it.
    /// </summary>
    public static (HexCoord Centre, int Radius)? LonghouseDisc(HexCoord centre, int longhouseLevel) =>
        longhouseLevel <= 0 ? null : (centre, ClaimRadiusForLonghouseLevel(longhouseLevel));

    /// <summary>
    /// The claim disc of a settlement's centre: for a beach camp (<paramref name="isBeachCamp"/>) always its own hex only (radius
    /// 0, fixed, never grows); otherwise <see cref="LonghouseDisc"/>. The one place callers read a settlement's centre claim.
    /// </summary>
    public static (HexCoord Centre, int Radius)? CentreDisc(HexCoord centre, int longhouseLevel, bool isBeachCamp) =>
        isBeachCamp ? (centre, 0) : LonghouseDisc(centre, longhouseLevel);

    /// <summary>
    /// How many towers the whole (linked) realm may hold: this settlement's limit (<see cref="BuildingCatalogue.MaxTowers"/>) plus
    /// the other members' limits.
    /// </summary>
    public int TowerLimit => BuildingCatalogue.MaxTowers(LonghouseLevel) + (Linked?.OtherTowerLimit ?? 0);

    /// <summary>
    /// The towers counting against <see cref="TowerLimit"/>: the realm's connected standing and queued towers, this settlement's
    /// and the other members'. Only connected towers count (<see cref="ConnectedRealm"/>): a cut-off tower claims nothing and
    /// does not use up the limit.
    /// </summary>
    public int TowersHeld(ConnectedRealm connected)
    {
        ArgumentNullException.ThrowIfNull(connected);

        return connected.CountConnected(
            Buildings.Where(b => b.Type == BuildingType.Tower).Select(b => b.Coord)
                .Concat(Queue.Where(o => o.Type == BuildingType.Tower).Select(o => o.Coord)))
            + (Linked?.OtherTowerCount ?? 0);
    }

    /// <summary>
    /// How many orders may build in parallel right now (issue #158):
    /// <c>max(2, longhouseLevel)</c> — 2 slots at level 1–2, then one more per level
    /// (3 at level 3, 10 at level 10, 30 at 30). A razed settlement
    /// (<see cref="LonghouseLevel"/> 0) still reads 2 — harmless, since every
    /// building needs <see cref="BuildingDefinition.RequiredLonghouseLevel"/>
    /// &gt;= 1 and nothing can be queued there anyway.
    /// </summary>
    public int ConstructionSlots => OwnConstructionSlots + (Linked?.OtherConstructionSlots ?? 0);

    /// <summary>This settlement's own slots, from its own Longhouse only — <see cref="ConstructionSlots"/> without the linked realm.</summary>
    public int OwnConstructionSlots => ConstructionSlotsFor(Buildings);

    /// <summary>
    /// The linked-realm view this settlement is read through, or <see langword="null"/> (the default: it stands alone). Set by the
    /// group-settle algorithm for the duration of one settle; never persisted (<c>ToDomain</c> leaves it null, <c>ApplyDomain</c>
    /// ignores it).
    /// </summary>
    public LinkedQueueContext? Linked { get; init; }

    /// <summary>The earliest instant an active (non-waiting) build order or a training batch completes, or <see langword="null"/> when none is running.</summary>
    public DateTimeOffset? NextCompletionAt
    {
        get
        {
            DateTimeOffset? next = null;
            foreach (var at in Queue.Where(o => !o.IsWaiting && o.CompletesAt is not null).Select(o => o.CompletesAt!.Value)
                .Concat(TrainingQueue.Select(t => t.CompletesAt)))
            {
                if (next is null || at < next)
                {
                    next = at;
                }
            }

            return next;
        }
    }

    private static int ConstructionSlotsFor(IReadOnlyList<PlacedBuilding> buildings)
    {
        // A beach camp has no Longhouse and builds nothing of its own: no slots, so it adds none to a linked realm.
        if (!buildings.Any(b => b.Type == BuildingType.Longhouse) && buildings.Any(b => b.Type == BuildingType.BeachCamp))
        {
            return 0;
        }

        var longhouseLevel = buildings.FirstOrDefault(b => b.Type == BuildingType.Longhouse).Level;
        return Math.Max(2, longhouseLevel);
    }

    /// <summary>
    /// Slots a Longhouse order occupies out of <paramref name="constructionSlots"/>: 90 %, rounded down, at least 1
    /// (level 10: 9 of 10). The rest stay free for other construction.
    /// </summary>
    public static int LonghouseSlotCost(int constructionSlots) => Math.Max(1, constructionSlots * 9 / 10);

    /// <summary>Queued orders already under construction — see <see cref="BuildOrder.IsWaiting"/>.</summary>
    public IEnumerable<BuildOrder> ActiveOrders => Queue.Where(o => !o.IsWaiting);

    /// <summary>Queued orders still waiting for a construction slot (the premium queue).</summary>
    public IEnumerable<BuildOrder> WaitingOrders => Queue.Where(o => o.IsWaiting);

    /// <summary>How many construction slots <see cref="ActiveOrders"/> currently occupies.</summary>
    public int UsedSlots => UsedSlotsFor(Linked is null ? Queue : [.. Queue, .. Linked.OtherQueue], ConstructionSlots);

    private static int EffectiveSlotCost(BuildOrder order, int constructionSlots)
    {
        var definition = BuildingCatalogue.Get(order.Type, order.LevelInWork);
        return definition.OccupiesMostSlots ? LonghouseSlotCost(constructionSlots) : definition.SlotCost;
    }

    private static int UsedSlotsFor(IReadOnlyList<BuildOrder> queue, int constructionSlots) =>
        queue.Where(o => !o.IsWaiting).Sum(o => EffectiveSlotCost(o, constructionSlots));

    /// <summary><see cref="ConstructionSlots"/> minus <see cref="UsedSlots"/>, floored at zero.</summary>
    public int FreeSlots => Math.Max(0, ConstructionSlots - UsedSlots);

    /// <summary>Own waiting orders plus, in a linked realm, the other members' waiting orders (FIFO order).</summary>
    public IEnumerable<BuildOrder> GroupWaitingOrders =>
        Linked is null ? WaitingOrders : WaitingOrders.Concat(Linked.OtherQueue.Where(o => o.IsWaiting));

    /// <summary>
    /// The cost of every <see cref="GroupWaitingOrders"/> entry, summed —
    /// resources still physically sitting in <see cref="Resources"/> but
    /// earmarked and unspendable on anything else (issue #158 stage 1c).
    /// Derived, never stored.
    /// </summary>
    public ResourceAmounts ReservedResources =>
        GroupWaitingOrders.Aggregate(ResourceAmounts.Zero, (sum, o) => sum + o.Cost);

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
    /// reach (longhouse at its maximum level). This is
    /// deliberately <em>not</em> a bound on a settlement's full territory —
    /// once Towers are involved there is no such fixed ceiling (a long enough
    /// chain of towers, each built inside ground the last one's own disc
    /// opened up, can in principle reach arbitrarily far from
    /// <see cref="Centre"/>; see <see cref="Claims"/>'s remarks). This value
    /// is only ever used as founding's cheap, longhouse-only pre-filter
    /// (<c>SettlementService.MinimumSpacing</c>'s "phase 1") — a
    /// fast distance check that quickly rejects the obviously-too-close case
    /// without needing to load anyone's building list, before the real,
    /// tower-aware check runs.
    /// </summary>
    public static readonly int MaxClaimRadius =
        BuildingCatalogue.Get(BuildingType.Longhouse, BuildingCatalogue.MaxLevelFor(BuildingType.Longhouse)).ClaimRadius;

    /// <summary>
    /// Extra radius a single <see cref="BuildingType.Tower"/>'s own satellite
    /// disc reaches outward from that tower's own hex (not the settlement
    /// centre), driven by the tower's own level: one hex of reach per tower
    /// level, starting at level 1. Deliberately still has no "+1" floor the
    /// way <see cref="ClaimRadius"/> does: <see cref="ClaimRadius"/>'s floor
    /// exists because a settlement always has *some* territory just for
    /// existing, but a tower can only ever be built on ground the settlement
    /// already claims, so a level-0 foundation stub needs no guaranteed reach
    /// of its own — it simply reads 0 rather than a level-1-sized floor. A
    /// non-positive level (no tower, or a level-0 foundation stub —
    /// see <see cref="ClaimDiscsFor"/>'s remarks) returns 0 rather than
    /// looking anything up; a level above <see cref="BuildingCatalogue.MaxLevelFor"/> of a tower
    /// (a corrupted/out-of-range DB row) is clamped down to it instead of
    /// silently returning 0 — the same defensive clamp <see cref="ClaimRadiusForLonghouseLevel"/>
    /// applies for the Longhouse side of this same concern.
    /// </summary>
    public static int TowerClaimRadius(int towerLevel) =>
        towerLevel <= 0
            ? 0
            : BuildingCatalogue.Get(BuildingType.Tower, Math.Min(towerLevel, BuildingCatalogue.MaxLevelFor(BuildingType.Tower))).ClaimRadius;

    /// <summary>The largest a single tower's own satellite disc can ever reach on its own (at its maximum level).</summary>
    public static readonly int MaxTowerClaimRadius =
        BuildingCatalogue.Get(BuildingType.Tower, BuildingCatalogue.MaxLevelFor(BuildingType.Tower)).ClaimRadius;

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
    /// level that is connected to a longhouse (<see cref="ConnectedRealm"/>) is
    /// included; a cut-off tower, and a level-0 foundation stub, claim nothing.
    /// </summary>
    public static IEnumerable<(HexCoord Centre, int Radius)> ClaimDiscsFor(
        HexCoord centre, IReadOnlyList<PlacedBuilding> buildings)
    {
        ArgumentNullException.ThrowIfNull(buildings);

        // The chain rule (ConnectedRealm): a tower only claims while it is connected to a longhouse. With only this one
        // settlement known, the longhouse here is the only one that can connect it; callers that know the player's other
        // settlements on the island resolve the whole realm instead (ConnectedRealm.Resolve / DiscsOf).
        var self = new RealmSettlement(Guid.Empty, centre, buildings);
        return ConnectedRealm.Resolve([self]).DiscsOf(Guid.Empty);
    }

    /// <summary>
    /// This settlement as the chain rule sees it, for <see cref="ConnectedRealm.Resolve"/> alongside the same player's other
    /// settlements on the island.
    /// </summary>
    public RealmSettlement AsRealmSettlement() => new(Id, Centre, Buildings);

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
    /// The giant-aware sibling of <see cref="Claims(HexCoord)"/>
    /// (<see cref="Territory.Claims"/>): identical for a plain hex, but a
    /// hex belonging to a <see cref="World.Giant"/>'s footprint is only
    /// claimed when every hex of that footprint is covered by
    /// <see cref="ClaimDiscs"/>. Every place that gates "is this hex in the
    /// settlement's territory" on player-visible ground (building,
    /// combat, shoreline) should use this, not the plain
    /// <see cref="Claims(HexCoord)"/> — that one stays reserved for founding
    /// spacing checks, which are deliberately disc-only.
    /// </summary>
    public bool Claims(HexCoord coord, World.IGiantIndex giants) => Territory.Claims(ClaimDiscs, coord, giants);

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
        var spotStacks = SpotStacks.ToList();
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
                if (order.IsRaze)
                {
                    // A raze takes one level off; at 0 the building is gone. A hex that is no longer standing (destroyed
                    // meanwhile) has nothing to lower. Never raises: a siege may already have taken the level lower.
                    if (index >= 0 && order.TargetLevel >= 1)
                    {
                        buildings[index] = buildings[index] with { Level = Math.Min(buildings[index].Level, order.TargetLevel) };
                    }
                    else if (index >= 0)
                    {
                        buildings.RemoveAt(index);
                    }
                }
                else if (index >= 0)
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
                // It joins the nearest spot that can hold it, measured from the building that trained it.
                var batch = new[] { new UnitStack(train.UnitType, train.Count) };
                var standing = this with { Buildings = buildings, SpotStacks = spotStacks };
                var spot = standing.NearestSpotFor(train.BuildingCoord, batch)?.Coord ?? Centre;
                spotStacks = [.. standing.AddToGarrisonAt(spot, batch).SpotStacks];
                trainingQueue.Remove(train);
                completedTraining.Add(train);
            }

            // Each completion changes the rate from its own instant, so a
            // building (or batch) finished an hour ago has applied for that
            // hour.
            var (production, capacity) = BoostedTotals(buildings, Runes, terrainAt);
            resources = resources.WithRate(ApplyUpkeep(production * speedFactor, TotalOf(spotStacks), guestPool), capacity, eventTime);

            // A finished raze pays its refund after the re-rate, so it is capped by the storage left standing.
            if (takeBuild && dueBuild!.IsRaze)
            {
                // A member of a linked realm leaves the refund to LinkedStore, which pays it into the pooled stock.
                if (Linked is null)
                {
                    resources = resources.Deposit(dueBuild.Refund, eventTime);
                }

                if (dueBuild.TargetLevel == 0)
                {
                    // Queued training of the removed building is refunded in full, as for a destroyed building.
                    var cleared = (this with { Buildings = buildings, Queue = queue, TrainingQueue = trainingQueue, Resources = resources })
                        .CancelTrainingAt(new HashSet<HexCoord> { dueBuild.Coord }, eventTime);
                    trainingQueue = cleared.TrainingQueue.ToList();
                    resources = cleared.Resources;
                }
            }

            // A build completion (or, harmlessly, a training one) may have
            // freed a construction slot — promote at this same instant, so
            // reading the settlement at any later time gives the same answer
            // whether this ran once or was replayed step by step.
            var soFar = this with
            {
                Buildings = buildings,
                Queue = queue,
                TrainingQueue = trainingQueue,
                SpotStacks = spotStacks,
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
        IReadOnlyList<UnitStack> deaths = [];
        IReadOnlyList<UnitStack> guestDeaths = [];
        if (Linked is null)
        {
            var pooledGarrison = TotalOf(spotStacks);
            (deaths, guestDeaths) = ApplyStarvation(ref resources, pooledGarrison, guestPool, finalProduction, finalCapacity, now);
            if (deaths.Count > 0)
            {
                spotStacks = [.. TakeDeathsProRata(spotStacks, deaths)];
            }
        }

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
        var correctNetProduction = ApplyUpkeep(finalProduction, TotalOf(spotStacks), guestPool);
        var rateIsStale = Linked is null && !ApproximatelyEqual(resources.RatePerHour, correctNetProduction);
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

        // A feast whose time has come ends into PendingFeastRenown, whichever
        // caller happens to settle the settlement first.
        var feast = Feast;
        var pendingRenown = PendingFeastRenown;
        var feastEnded = feast is not null && feast.IsComplete(now);
        if (feastEnded)
        {
            pendingRenown += feast!.RenownGain;
            feast = null;
        }

        var changed = completedBuilds.Count > 0 || completedTraining.Count > 0 || deaths.Count > 0
            || guestDeaths.Count > 0 || rateIsStale || promotedAny || droppedAny || feastEnded;
        if (!changed)
        {
            // A settlement whose garrison already holds the troops (seeded, admin-set)
            // but was never latched still has to persist the latch.
            var latched = WithQuestLatches();
            return new SettleResult(latched, Changed: !ReferenceEquals(latched, this), [], [], [], []);
        }

        var settled = (this with
        {
            Buildings = buildings,
            SpotStacks = spotStacks,
            Queue = queue,
            TrainingQueue = trainingQueue,
            Resources = resources,
            Feast = feast,
            PendingFeastRenown = pendingRenown,
        }).WithQuestLatches();

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
        if (Linked is not null)
        {
            // A linked realm promotes as a group (LinkedStore), never member by member.
            return (this, false);
        }

        var constructionSlots = ConstructionSlotsFor(Buildings);
        var current = this;
        var changed = false;

        while (NextPromotable(current.Queue, constructionSlots) is { } candidate)
        {
            // Reserved resources should already cover this — defensive only (e.g. a caller settling with a stale/short stock).
            if (current.StartWaitingOrder(candidate.Id, now, speedFactor) is not { } started)
            {
                break;
            }

            current = started;
            changed = true;
        }

        return (current, changed);
    }

    /// <summary>
    /// The waiting order that may start next out of <paramref name="fifoQueue"/> (the whole queue in FIFO/plan order): the first
    /// waiting order with no earlier order on its hex (stage 1d contiguity), provided its slot cost fits the free slots
    /// (head-of-line: a smaller order behind it never jumps). <see langword="null"/> when none may start.
    /// </summary>
    internal static BuildOrder? NextPromotable(IReadOnlyList<BuildOrder> fifoQueue, int constructionSlots)
    {
        var free = Math.Max(0, constructionSlots - UsedSlotsFor(fifoQueue, constructionSlots));
        if (free <= 0)
        {
            return null;
        }

        // List position — not QueuedAt — is the tiebreaker that actually matters: two orders planned in the same instant
        // (identical QueuedAt) still have a real, distinguishable plan order here.
        var candidate = fifoQueue
            .Where(o => o.IsWaiting)
            .FirstOrDefault(o =>
            {
                var index = IndexOfOrder(fifoQueue, o);
                return !fifoQueue.Any(other => other.Coord == o.Coord && other.Id != o.Id && IndexOfOrder(fifoQueue, other) < index);
            });

        if (candidate is null)
        {
            return null;
        }

        var slotCost = EffectiveSlotCost(candidate, constructionSlots);

        // Head-of-line blocking: the waiting queue is FIFO, not a pool a smaller order can jump.
        return slotCost > free ? null : candidate;
    }

    private static int IndexOfOrder(IReadOnlyList<BuildOrder> queue, BuildOrder order)
    {
        for (var i = 0; i < queue.Count; i++)
        {
            if (ReferenceEquals(queue[i], order) || queue[i].Equals(order))
            {
                return i;
            }
        }

        return -1;
    }

    /// <summary>
    /// Starts one waiting order: spends its cost from <see cref="Resources"/> at <paramref name="now"/>, stamps
    /// <see cref="BuildOrder.StartedAt"/>/<see cref="BuildOrder.CompletesAt"/> scaled by <paramref name="speedFactor"/> and stakes
    /// the level-0 stub. <see langword="null"/> when the order is not waiting or the stock cannot pay. Does no slot check — the
    /// caller picked the order (<see cref="NextPromotable"/>).
    /// </summary>
    public Settlement? StartWaitingOrder(Guid orderId, DateTimeOffset now, double speedFactor = 1.0)
    {
        var index = Queue.ToList().FindIndex(o => o.Id == orderId && o.IsWaiting);
        if (index < 0)
        {
            return null;
        }

        var order = Queue[index];
        if (!Resources.TrySpend(order.Cost, now, out var paid))
        {
            return null;
        }

        var started = order with { StartedAt = now, CompletesAt = now + ScaledBuildDuration(order.BaseDuration, speedFactor) };
        var queue = Queue.ToList();
        queue[index] = started;

        var buildings = Buildings.ToList();
        if (!order.IsRaze && !buildings.Any(b => b.Coord == started.Coord))
        {
            buildings.Add(new PlacedBuilding(started.Coord, started.Type, Level: 0));
        }

        return this with { Queue = queue, Buildings = buildings, Resources = paid };
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
        if (Linked is not null)
        {
            // Group drop happens in LinkedStore.
            return this;
        }

        // Queue (and so WaitingOrders, a filter over it) is already in FIFO/plan order — see PromoteWaitingOrders' remarks.
        var waiting = WaitingOrders.ToList();
        if (waiting.Count == 0)
        {
            return this;
        }

        var keep = FundedWaitingOrderIds(waiting, Resources.At(now));
        if (keep.Count == waiting.Count)
        {
            return this;
        }

        return this with { Queue = [.. Queue.Where(o => !o.IsWaiting || keep.Contains(o.Id))] };
    }

    /// <summary>
    /// The prefix of <paramref name="waitingFifo"/> whose accumulated costs <paramref name="stock"/> covers; the first order it
    /// cannot cover and every order behind it are left out.
    /// </summary>
    internal static IReadOnlySet<Guid> FundedWaitingOrderIds(IEnumerable<BuildOrder> waitingFifo, ResourceAmounts stock)
    {
        var running = ResourceAmounts.Zero;
        var keep = new HashSet<Guid>();

        foreach (var order in waitingFifo)
        {
            var candidateTotal = running + order.Cost;
            if (!stock.Covers(candidateTotal))
            {
                break;
            }

            running = candidateTotal;
            keep.Add(order.Id);
        }

        return keep;
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
        var pooledDeaths = StarvationKills(grossProductionPerHour.Food, pooled);

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

    /// <summary>
    /// Kills, highest-upkeep type first, until <paramref name="grossFoodPerHour"/> covers the upkeep of what is left. Removes the
    /// dead from <paramref name="pooled"/> in place and returns them (one entry per kill step).
    /// </summary>
    internal static List<UnitStack> StarvationKills(double grossFoodPerHour, List<UnitStack> pooled)
    {
        var pooledDeaths = new List<UnitStack>();
        while (pooled.Count > 0)
        {
            var netFood = grossFoodPerHour - TotalUpkeepPerHour(pooled);
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

        return pooledDeaths;
    }

    /// <summary>This settlement with <paramref name="deaths"/> removed from its home garrison.</summary>
    internal Settlement WithHomeDeaths(IReadOnlyList<UnitStack> deaths) =>
        this with { SpotStacks = TakeDeathsProRata(SpotStacks, deaths) };

    /// <summary>
    /// <paramref name="stacks"/> after <paramref name="deaths"/> (pooled per type over the whole settlement): each type's deaths
    /// are split across the spots proportional to each spot's count of that type (<see cref="ProportionalAllocator"/>).
    /// </summary>
    private static List<SpotStack> TakeDeathsProRata(IReadOnlyList<SpotStack> stacks, IReadOnlyList<UnitStack> deaths)
    {
        var result = stacks.ToList();
        foreach (var death in deaths.GroupBy(d => d.Type).Select(g => new UnitStack(g.Key, g.Sum(d => d.Count))))
        {
            var indices = Enumerable.Range(0, result.Count).Where(i => result[i].Type == death.Type).ToList();
            var split = ProportionalAllocator.Allocate(death.Count, [.. indices.Select(i => result[i].Count)]);
            for (var k = 0; k < indices.Count; k++)
            {
                result[indices[k]] = result[indices[k]] with { Count = result[indices[k]].Count - split[k] };
            }
        }

        result.RemoveAll(s => s.Count <= 0);
        return result;
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
    /// <param name="riverVariantAt">
    /// The river-art variant (<see cref="World.RiverVariant"/>) standing on
    /// <paramref name="coord"/>'s own river tile, defaulting to
    /// <see cref="World.RiverVariant.Plain"/> when there is no river there
    /// at all (meaningless in that case — <paramref name="riverShapeAt"/>
    /// being <see langword="null"/> already refuses any
    /// <see cref="BuildingDefinition.RequiresRiverShape"/> building before
    /// this is even checked). Only <see cref="BuildingDefinition.ExcludedRiverVariants"/>
    /// cares — today just the Sawmill refusing a Bend60 hex's
    /// <see cref="World.RiverVariant.Loop"/> variant.
    /// </param>
    /// <param name="shrineGodsElsewhereOnIsland">
    /// Which gods already have a standing shrine somewhere on this
    /// settlement's island, at a hex other than <paramref name="coord"/> —
    /// spanning every settlement on the island, not just this one. Only a
    /// Shrine <paramref name="type"/> (<see cref="BuildingCatalogue.GodOf"/>)
    /// cares; the caller computes this from the island's other settlements
    /// (<c>SettlementService.QueueBuildAsync</c>), since a lone
    /// <see cref="Settlement"/> has no notion of its siblings.
    /// </param>
    /// <param name="islandSoil">
    /// Which crop this settlement's island grows (<see cref="SoilType"/>) —
    /// only <see cref="BuildingType.PumpkinFarm"/> cares: it's only buildable
    /// on a Pumpkin-soil island, the bonus a "more fertile" island unlocks.
    /// <see cref="BuildingType.Farm"/> stays buildable everywhere regardless
    /// of soil. The caller resolves this once from the island's centre
    /// (<c>SettlementService.QueueBuildAsync</c>, <see cref="TerrainSampler.SoilAt"/>).
    /// </param>
    /// <param name="realm">
    /// This settlement together with the same player's other settlements on its island, resolved by the chain rule
    /// (<see cref="ConnectedRealm"/>): the hex has to lie inside the realm's connected discs, and only connected towers count
    /// against the tower limit. <see langword="null"/> resolves this settlement alone. When given, it must contain this
    /// settlement in its current state.
    /// </param>
    /// <param name="giants">
    /// This island's giant index (the territory rule), or
    /// <see langword="null"/> for a world with no giants on hand. A hex
    /// belonging to a giant's footprint is always refused — checked before
    /// (and independently of) the claim check, since a giant hex is never
    /// buildable even for the settlement whose claim fully encloses it.
    /// </param>
    /// <param name="camps">
    /// The world's <em>blocking</em> wildlife camps, or <see langword="null"/> for a caller
    /// with none on hand. A hex holding one is refused
    /// (<see cref="BuildRejection.HexOccupiedByCamp"/>), checked right after the
    /// giant rule and before the claim check. The index decides what blocks: the caller
    /// (<c>SettlementService.LoadCampIndexAsync</c>) lists only camps that still have beasts at the
    /// build instant, plus Fenrir's brood always, so a cleared camp's hex is buildable under its
    /// ground's normal rules.
    /// </param>
    /// <param name="endgameSites">
    /// The world's endgame sites (Utgard wall hexes, Jötun watchtowers), or <see langword="null"/> for a caller with none on hand. A hex
    /// holding one is refused (<see cref="BuildRejection.HexOccupiedByEndgameSite"/>), checked right after the camp rule.
    /// </param>
    /// <param name="bogKindAt">
    /// What kind of bog tile stands on <paramref name="coord"/> (plain moss, shore, creek, ...), or <see langword="null"/>
    /// when it is not bog. Only the buildings with a <see cref="BuildingDefinition.RequiresBogKind"/> (bog-ore works, Clay
    /// Brickworks, Hammerschmiede) or <see cref="BuildingDefinition.LakeShoreKinds"/> (the Fishing Hut) care.
    /// </param>
    /// <param name="palisades">
    /// The wall hexes already standing around <paramref name="coord"/> in the world (any settlement's, a standing foundation included) and the
    /// terrain lookup for their neighbours. Only a <see cref="BuildingType.Palisade"/> or <see cref="BuildingType.PalisadeGate"/> cares: the
    /// placement rules (<see cref="Palisades.PalisadeRules.CanPlace"/>) read it, together with this settlement's own walls and queued wall
    /// orders. <see langword="null"/> means no other wall is known.
    /// </param>
    /// <param name="isWideRiverAt">
    /// Whether the river tile on <paramref name="coord"/> is a wide river (<c>RiverIndex.IsWide</c>: impassable to a land army). Only a
    /// <see cref="BuildingType.Bridge"/> cares: streams are already passable, so it is refused there
    /// (<see cref="BuildRejection.BridgeNeedsWideRiver"/>).
    /// </param>
    /// <param name="onRiverTile">
    /// Whether any river tile (of any width) stands on <paramref name="coord"/>. Every building but the river ones
    /// (<see cref="BuildingDefinition.RequiresRiverShape"/>), the bridge and the walls is refused there
    /// (<see cref="BuildRejection.TerrainNotAllowed"/>).
    /// </param>
    /// <param name="onWastedIsland">
    /// Whether <paramref name="coord"/> lies on a wasted (lava) island, where no bridge is built. Only a <see cref="BuildingType.Bridge"/> cares.
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
        RiverTileShape? riverShapeAt = null,
        RiverVariant riverVariantAt = RiverVariant.Plain,
        IReadOnlySet<GodType>? shrineGodsElsewhereOnIsland = null,
        SoilType? islandSoil = null,
        World.IGiantIndex? giants = null,
        World.ICampIndex? camps = null,
        World.BogTileKind? bogKindAt = null,
        Palisades.PalisadeLayout? palisades = null,
        bool isWideRiverAt = false,
        bool onWastedIsland = false,
        World.IEndgameSiteIndex? endgameSites = null,
        ConnectedRealm? realm = null,
        bool onRiverTile = false)
    {
        var giantIndex = giants ?? World.GiantIndex.Empty;
        var connected = realm ?? ConnectedRealm.Resolve([AsRealmSettlement()]);
        if (giantIndex.TryGetGiant(coord, out _))
        {
            return BuildDecision.Rejected(BuildRejection.HexOccupiedByGiant);
        }

        // The index lists blocking camps only (guarded ones and Fenrir's brood); a cleared camp is not in it.
        if ((camps ?? World.CampIndex.Empty).TryGetCamp(coord, out _))
        {
            return BuildDecision.Rejected(BuildRejection.HexOccupiedByCamp);
        }

        if ((endgameSites ?? World.EndgameSiteIndex.Empty).IsSite(coord))
        {
            return BuildDecision.Rejected(BuildRejection.HexOccupiedByEndgameSite);
        }

        if (!Territory.Claims(connected.AllDiscs, coord, giantIndex))
        {
            return BuildDecision.Rejected(BuildRejection.HexNotInSettlement);
        }

        // Queue is already in FIFO/plan order — see PromoteWaitingOrders' remarks.
        var ordersOnHex = Queue.Where(o => o.Coord == coord).ToList();
        if (ordersOnHex.Count >= maxOrdersPerHex || ordersOnHex.Any(o => o.IsRaze))
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

        // A type with no definition at all (the removed Magic Tower) is never
        // buildable — refused before any level arithmetic.
        if (BuildingCatalogue.MaxLevelFor(type) == 0)
        {
            return BuildDecision.Rejected(BuildRejection.UnknownBuildingLevel);
        }

        var baseLevel = ordersOnHex.Count > 0 ? ordersOnHex[^1].TargetLevel : (occupied ? existing.Level : 0);
        var targetLevel = baseLevel + 1;
        if (targetLevel > BuildingCatalogue.MaxLevelFor(type))
        {
            return BuildDecision.Rejected(BuildRejection.MaxLevelReached);
        }

        var definition = BuildingCatalogue.TryGet(type, targetLevel);
        if (definition is null)
        {
            return BuildDecision.Rejected(BuildRejection.UnknownBuildingLevel);
        }

        // A type switched off for placement (the Quarry) can still be levelled where it already stands (baseLevel > 0).
        if (baseLevel == 0 && BuildingCatalogue.NewPlacementDisabled.Contains(type))
        {
            return BuildDecision.Rejected(BuildRejection.NewPlacementDisabled);
        }

        if (!definition.AllowsHex(terrain, isCoastalWater, bogKindAt))
        {
            return BuildDecision.Rejected(BuildRejection.TerrainNotAllowed);
        }

        // A river hex (any width or shape: stream, widening, spring, confluence, mouth, bend, straight) takes no ordinary building: only the
        // river buildings (RequiresRiverShape, checked below) and the bridge stand on one. A wall keeps its own, more specific refusal.
        if (onRiverTile && definition.RequiresRiverShape is null
            && type is not (BuildingType.Bridge or BuildingType.Palisade or BuildingType.PalisadeGate))
        {
            return BuildDecision.Rejected(BuildRejection.TerrainNotAllowed);
        }

        if (definition.RequiresRiverShape is { } requiredShapes)
        {
            if (riverShapeAt is not { } actualShape || !requiredShapes.Contains(actualShape))
            {
                return BuildDecision.Rejected(BuildRejection.TerrainNotAllowed);
            }

            if (definition.ExcludedRiverVariants?.Contains(riverVariantAt) == true)
            {
                return BuildDecision.Rejected(BuildRejection.TerrainNotAllowed);
            }
        }

        // A bridge only spans a wide river: its shape was checked above (spring, confluence and mouth are refused as terrain), and
        // streams are passable already. A wasted island has no bridges.
        if (type == BuildingType.Bridge)
        {
            if (onWastedIsland)
            {
                return BuildDecision.Rejected(BuildRejection.TerrainNotAllowed);
            }

            if (!isWideRiverAt)
            {
                return BuildDecision.Rejected(BuildRejection.BridgeNeedsWideRiver);
            }
        }

        // A new wall hex must keep every wall hex drawable: no branch, a gate only on a straight, no river, the sea end on exactly
        // one land wall (Palisades.PalisadeRules). Raising a standing wall hex a level is never refused for this.
        if (type is BuildingType.Palisade or BuildingType.PalisadeGate && baseLevel == 0)
        {
            var wallRefusal = PalisadeRefusalFor(type, coord, terrain, riverShapeAt is not null, bogKindAt, palisades);
            if (wallRefusal is not null)
            {
                return BuildDecision.Rejected(wallRefusal.Value);
            }
        }

        // A settlement holds at most one shrine in total, of any god. A
        // queued new shrine already stakes a level-0 stub in Buildings, but the
        // queue is counted too so the answer doesn't hang on that. Levelling
        // the shrine standing on this same coord is not "another" one. A linked
        // realm holds one shrine in total, so the other members' count too.
        if (BuildingCatalogue.GodOf(type) is not null
            && (Buildings.Any(b => BuildingCatalogue.GodOf(b.Type) is not null && b.Coord != coord)
                || Queue.Any(o => BuildingCatalogue.GodOf(o.Type) is not null && o.Coord != coord)
                || (Linked?.OtherBuildings.Any(b => BuildingCatalogue.GodOf(b.Type) is not null) ?? false)
                || (Linked?.OtherQueue.Any(o => BuildingCatalogue.GodOf(o.Type) is not null) ?? false)))
        {
            return BuildDecision.Rejected(BuildRejection.SettlementAlreadyHasShrine);
        }

        // Each of the four gods gets at most one shrine per island — raised
        // by whichever settlement gets there first, anywhere on it, not just
        // this one (see shrineGodsElsewhereOnIsland's own doc comment). A
        // level-up of this settlement's own shrine at this same coord isn't
        // "elsewhere", so the caller excludes coord from the set it builds.
        if (BuildingCatalogue.GodOf(type) is { } god
            && shrineGodsElsewhereOnIsland is not null
            && shrineGodsElsewhereOnIsland.Contains(god))
        {
            return BuildDecision.Rejected(BuildRejection.ShrineGodAlreadyOnIsland);
        }

        // Farm is the settlement's always-available staple — never gated.
        // PumpkinFarm is the bonus crop a Pumpkin-soil island additionally
        // unlocks (see SoilType), which is what makes such an island "more
        // fertile" rather than just different. Only gates a *new*
        // PumpkinFarm (!occupied); leveling up one already standing here is
        // always allowed, so a settlement from before this rule existed
        // never gets bricked by its own earlier build.
        if (!occupied && type == BuildingType.PumpkinFarm
            && islandSoil is { } soil && soil == SoilType.Wheat)
        {
            return BuildDecision.Rejected(BuildRejection.WrongCropForIslandSoil);
        }

        // A settlement gets its one longhouse from founding (SettlementService.FoundAsync
        // builds it directly, never through here) — this only ever levels up the
        // longhouse a settlement already has, on the hex it already stands on.
        // Placing a second one is someone else's job (a future settlers mechanic).
        if (type == BuildingType.Longhouse && !occupied)
        {
            return BuildDecision.Rejected(BuildRejection.LonghousePlacementNotAllowed);
        }

        // A linked realm is one realm: the best Longhouse of the group counts.
        if (Math.Max(LonghouseLevel, Linked?.GroupLonghouseLevel ?? 0) < definition.RequiredLonghouseLevel)
        {
            return BuildDecision.Rejected(BuildRejection.LonghouseTooLow);
        }

        // Towers are the only way to grow the realm once the Longhouse stops
        // (ClaimRadius), so their number follows the Longhouse level. Only a
        // *new* tower counts against the limit (baseLevel 0: nothing standing
        // or queued on this hex) — upgrading one is always allowed. A queued
        // new tower already stakes a level-0 stub in Buildings, so towers are
        // counted by distinct hex across standing buildings and queued orders.
        if (type == BuildingType.Tower && baseLevel == 0)
        {
            if (TowersHeld(connected) >= TowerLimit)
            {
                return BuildDecision.Rejected(BuildRejection.TowerLimitReached);
            }
        }

        // Storage houses keep their Longhouse cap, and an additional one is only
        // allowed once enough of them stand high enough
        // (BuildingCatalogue.AdditionalStorageHouseRequirement). Only a *new*
        // storage house counts (baseLevel 0) — upgrading one is never refused.
        if (type == BuildingType.StorageHouse && baseLevel == 0)
        {
            // A linked realm counts all of its storage houses, in every member.
            var storageHexes = Buildings.Where(b => b.Type == BuildingType.StorageHouse).Select(b => b.Coord)
                .Concat(Queue.Where(o => o.Type == BuildingType.StorageHouse).Select(o => o.Coord))
                .Concat(Linked?.OtherBuildings.Where(b => b.Type == BuildingType.StorageHouse).Select(b => b.Coord) ?? [])
                .Concat(Linked?.OtherQueue.Where(o => o.Type == BuildingType.StorageHouse).Select(o => o.Coord) ?? [])
                .Distinct()
                .Count();
            var (needCount, needLevel) = BuildingCatalogue.AdditionalStorageHouseRequirement(storageHexes);
            if (storageHexes >= 1
                && Buildings.Count(b => b.Type == BuildingType.StorageHouse && b.Level >= needLevel)
                    + (Linked?.OtherBuildings.Count(b => b.Type == BuildingType.StorageHouse && b.Level >= needLevel) ?? 0) < needCount)
            {
                return BuildDecision.Rejected(BuildRejection.StorageHouseTooLow);
            }
        }

        // Every prerequisite must be met, and each is judged against the
        // settlement's *highest-level* building of that type — not the first
        // one in coordinate order, which would let a second, lower building of
        // the same type (or a level-0 foundation stub sorting first) decide the
        // answer.
        foreach (var prerequisite in definition.Prerequisites)
        {
            // A linked realm is one realm: a prerequisite standing in another member counts.
            var highest = Math.Max(
                HighestLevelOf(prerequisite.Type),
                Linked?.OtherBuildings.Where(b => b.Type == prerequisite.Type && b.IsFunctioning).Select(b => b.Level).DefaultIfEmpty(0).Max() ?? 0);
            if (highest < prerequisite.Level)
            {
                return BuildDecision.Rejected(BuildRejection.RequiredBuildingTooLow, prerequisite);
            }
        }

        // A voluntary spend — including a brand-new build order — must not
        // dip into what is already reserved for the waiting queue (issue #158
        // stage 1c).
        if (!CanAffordAvailable(definition.Cost, now))
        {
            return BuildDecision.Rejected(BuildRejection.NotEnoughResources);
        }

        return StartOrQueue(
            new BuildOrder
            {
                Id = orderId,
                Type = type,
                TargetLevel = targetLevel,
                Coord = coord,
                QueuedAt = now,
                BaseDuration = definition.BuildDuration,
            },
            definition,
            earlierOnHexUnfinished: ordersOnHex.Count > 0,
            now, speedFactor, maxWaitingOrders);
    }

    /// <summary>
    /// Asks to raze one level of the building on <paramref name="coord"/> (<c>docs/design/construction-slots.md</c>, "Razing"):
    /// the level takes <see cref="BuildingCatalogue.RazeTimeFactor"/> of its build time and as many construction slots as
    /// building it took, costs nothing, and goes through the queue like a build. The building keeps working at its current
    /// level until the order completes (<see cref="SettleTo"/>).
    /// </summary>
    public BuildDecision PlanRaze(
        HexCoord coord,
        DateTimeOffset now,
        Guid orderId,
        double speedFactor = 1.0,
        int maxWaitingOrders = 0,
        int maxOrdersPerHex = 1)
    {
        var existing = Buildings.FirstOrDefault(b => b.Coord == coord);
        if (!Buildings.Any(b => b.Coord == coord) || existing.Level < 1)
        {
            return BuildDecision.Rejected(BuildRejection.NoBuildingOnHex);
        }

        if (existing.Type == BuildingType.Longhouse)
        {
            return BuildDecision.Rejected(BuildRejection.LonghouseCannotBeRazed);
        }

        // A raze is an order on its hex like any other: the maxOrdersPerHex rule applies, and a raze never stacks behind a
        // queued order (the level it would lower is not known yet).
        var ordersOnHex = Queue.Where(o => o.Coord == coord).ToList();
        if (ordersOnHex.Count > 0 || ordersOnHex.Count >= maxOrdersPerHex)
        {
            return BuildDecision.Rejected(BuildRejection.AlreadyQueuedOnHex);
        }

        var definition = BuildingCatalogue.Get(existing.Type, existing.Level);
        var baseDuration = TimeSpan.FromTicks((long)(definition.BuildDuration.Ticks * BuildingCatalogue.RazeTimeFactor));

        return StartOrQueue(
            new BuildOrder
            {
                Id = orderId,
                Type = existing.Type,
                TargetLevel = existing.Level - 1,
                Kind = BuildOrderKind.Raze,
                Coord = coord,
                QueuedAt = now,
                BaseDuration = baseDuration,
            },
            definition,
            earlierOnHexUnfinished: false,
            now, speedFactor, maxWaitingOrders);
    }

    /// <summary>
    /// The slot logic shared by <see cref="PlanBuild"/> and <see cref="PlanRaze"/>: the order starts now when its slot cost
    /// (<paramref name="slotDefinition"/>, the level in work) fits the free slots, waits in the premium queue when there is room
    /// for it, and is refused otherwise.
    /// </summary>
    private BuildDecision StartOrQueue(
        BuildOrder draft,
        BuildingDefinition slotDefinition,
        bool earlierOnHexUnfinished,
        DateTimeOffset now,
        double speedFactor,
        int maxWaitingOrders)
    {
        var slotCost = slotDefinition.OccupiesMostSlots ? LonghouseSlotCost(ConstructionSlots) : slotDefinition.SlotCost;

        // A stacked order (maxOrdersPerHex > 1) can only ever start once
        // every earlier order already queued on this same hex is done — an
        // earlier one still present in ordersOnHex means it has not
        // completed, whether it is itself building or still waiting. Slots
        // alone are not enough: two levels of the same hex must never be
        // "under construction" at once, or completion order (and hence the
        // level a hex ends up at) stops being deterministic.
        var fitsNow = !earlierOnHexUnfinished && slotCost <= FreeSlots;

        if (!fitsNow && GroupWaitingOrders.Count() >= maxWaitingOrders)
        {
            return BuildDecision.Rejected(maxWaitingOrders <= 0 ? BuildRejection.NoFreeSlot : BuildRejection.QueueFull);
        }

        if (fitsNow)
        {
            return BuildDecision.Accept(draft with
            {
                StartedAt = now,
                CompletesAt = now + ScaledBuildDuration(draft.BaseDuration, speedFactor),
            });
        }

        return BuildDecision.Accept(draft with { StartedAt = null, CompletesAt = null });
    }

    /// <summary>
    /// The placement rule of a new palisade or gate hex against every wall known: the world's (<paramref name="layout"/>) and this
    /// settlement's own standing, foundation and queued ones.
    /// </summary>
    private BuildRejection? PalisadeRefusalFor(
        BuildingType type, HexCoord coord, Terrain terrain, bool onRiver, World.BogTileKind? bogKind, Palisades.PalisadeLayout? layout)
    {
        var walls = layout is null ? [] : new HashSet<HexCoord>(layout.Walls);
        var gates = layout is null ? [] : new HashSet<HexCoord>(layout.Gates);
        foreach (var (hex, hexType) in Buildings.Select(b => (b.Coord, b.Type)).Concat(Queue.Select(o => (o.Coord, o.Type))))
        {
            if (hexType is BuildingType.Palisade or BuildingType.PalisadeGate)
            {
                walls.Add(hex);
                if (hexType == BuildingType.PalisadeGate)
                {
                    gates.Add(hex);
                }
            }
        }

        walls.Remove(coord);
        gates.Remove(coord);

        var known = layout?.TerrainAt;
        var context = new Palisades.PalisadePlacementContext(
            hex => hex == coord ? terrain : known?.Invoke(hex) ?? Terrain.Grass,
            hex => onRiver && hex == coord,
            hex => hex == coord && bogKind == World.BogTileKind.Bog);

        return Palisades.PalisadeRules.CanPlace(coord, new Palisades.WallSet(walls, gates), context, type == BuildingType.PalisadeGate) switch
        {
            null => null,
            Palisades.PalisadeRefusal.Branch => BuildRejection.PalisadeWouldBranch,
            Palisades.PalisadeRefusal.GateNotStraight => BuildRejection.GateNotOnStraight,
            Palisades.PalisadeRefusal.Occupied => BuildRejection.HexOccupied,
            _ => BuildRejection.TerrainNotAllowed,
        };
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

        if (!Resources.TrySpend(order.Cost, now, out var paid))
        {
            throw new InvalidOperationException(
                "Cannot enqueue a build that is not affordable; call PlanBuild first.");
        }

        var buildings = Buildings;
        if (!order.IsRaze && !buildings.Any(b => b.Coord == order.Coord))
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

        // A raze cost nothing, so there is nothing to refund, and the building it was lowering stays as it is.
        var refunded = Resources.Deposit(order.Cost, now);

        var buildings = !order.IsRaze && order.TargetLevel == 1
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
                    if (!resources.TrySpend(order.Cost, now, out var paid))
                    {
                        // Defensive only: reserved resources should already
                        // cover this. Leave it waiting rather than starting
                        // an order that was never actually paid for.
                        continue;
                    }

                    resources = paid;
                    if (!order.IsRaze && !buildings.Any(b => b.Coord == order.Coord))
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
        Func<HexCoord, Terrain>? terrainAt = null,
        World.IGiantIndex? giants = null,
        World.BogTileKind? bogKindAt = null,
        Palisades.PalisadeLayout? palisades = null,
        ConnectedRealm? realm = null)
    {
        var giantIndex = giants ?? World.GiantIndex.Empty;
        if (giantIndex.TryGetGiant(coord, out _))
        {
            return AdminBuildingEditResult.Rejected(AdminBuildingEditRejection.HexOccupiedByGiant);
        }

        if (!Territory.Claims((realm ?? ConnectedRealm.Resolve([AsRealmSettlement()])).AllDiscs, coord, giantIndex))
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

        if (!definition.AllowsHex(terrain, isCoastalWater, bogKindAt))
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
        HexCoord spot,
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

        if (SpotAt(spot) is not { } target || !target.Holds(type))
        {
            return AdminGarrisonEditResult.Rejected(AdminGarrisonEditRejection.NoFittingSpot);
        }

        var standing = target.Stacks.Where(s => s.Type == type).Sum(s => s.Count);
        if (standing + delta < 0)
        {
            return AdminGarrisonEditResult.Rejected(AdminGarrisonEditRejection.NotEnoughUnits);
        }

        var edited = WithGarrisonAt(spot, target.Stacks.Where(s => s.Type != type).Append(new UnitStack(type, standing + delta)));

        var (production, capacity) = BoostedTotals(Buildings, Runes, terrainAt);
        var resources = Resources.WithRate(
            ApplyUpkeep(production * speedFactor, edited.Garrison.ToList(), guestStacks ?? []), capacity, now);

        return AdminGarrisonEditResult.Accept((edited with { Resources = resources }).WithQuestLatches());
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

        var updated = this with { Buildings = buildings, Queue = queue, Resources = resources };
        return stillStanding ? updated : updated.CancelTrainingAt(new HashSet<HexCoord> { targetCoord }, now);
    }

    /// <summary>
    /// A wildlife camp burns the tower on <paramref name="coord"/> (<c>docs/design/wildlife-camps.md</c>, "Strong camps
    /// attack"): the standing tower, or the stub of one still under construction, is removed together with every build
    /// order on the hex, and nothing is refunded (an unfinished tower's cost is lost). Call on an already-settled
    /// settlement. Returns this unchanged when no tower stands on the hex.
    /// </summary>
    public Settlement BurnTower(
        HexCoord coord,
        DateTimeOffset now,
        double speedFactor = 1.0,
        IReadOnlyList<UnitStack>? guestStacks = null,
        Func<HexCoord, Terrain>? terrainAt = null)
    {
        if (!Buildings.Any(b => b.Coord == coord && b.Type == BuildingType.Tower))
        {
            return this;
        }

        var burned = WithSiegeDamage(
            [.. Buildings.Where(b => b.Coord != coord)], coord, now, speedFactor, guestStacks, terrainAt);

        // The dropped orders may have held construction slots: let the head of the waiting queue take them now.
        return burned.PromoteWaitingOrders(now, speedFactor).Settlement;
    }

    /// <summary>
    /// Brings every building's realm state up to <paramref name="now"/> (<c>docs/design/economy.md</c> section 5, "Buildings
    /// outside the realm decay"): the one function the realm-change hooks, the lazy read and the periodic sweep all call.
    /// </summary>
    /// <remarks>
    /// <para>
    /// A building is inside the realm when its hex is claimed by <paramref name="realm"/> (<see cref="Territory.Claims"/>, the test
    /// <see cref="PlanBuild"/> uses); the Longhouse is always inside and never decays. A building that just left the realm gets
    /// <see cref="PlacedBuilding.OutsideRealmSince"/> = <paramref name="now"/> and stops functioning at once. One that is back
    /// inside has it cleared: levels already lost stay lost, the partial progress towards the next loss is dropped. One that is
    /// still outside loses <c>floor(elapsed / <see cref="BuildingCatalogue.DecayInterval(BuildingType, double)"/>)</c> levels, and
    /// <see cref="PlacedBuilding.OutsideRealmSince"/> advances by the intervals consumed so a later call never counts them again;
    /// a building that reaches level 0 is removed together with every order queued on its hex. A level-0 foundation has no level
    /// to lose and is left as it is.
    /// </para>
    /// <para>
    /// Call on an already-settled settlement and persist the result when <c>Changed</c>. <paramref name="realm"/> must contain this
    /// settlement in its current state.
    /// </para>
    /// </remarks>
    public (Settlement Settlement, bool Changed) ApplyRealmState(
        ConnectedRealm realm,
        DateTimeOffset now,
        double speedFactor = 1.0,
        IReadOnlyList<UnitStack>? guestStacks = null,
        Func<HexCoord, Terrain>? terrainAt = null,
        World.IGiantIndex? giants = null)
    {
        ArgumentNullException.ThrowIfNull(realm);

        var giantIndex = giants ?? World.GiantIndex.Empty;
        var buildings = Buildings.ToList();
        var removed = new HashSet<HexCoord>();
        var leaving = new List<PlacedBuilding>();
        var foundations = new HashSet<HexCoord>();
        var changed = false;
        var functionChanged = false;

        for (var i = 0; i < buildings.Count; i++)
        {
            var building = buildings[i];
            var step = RealmDecay.StepFor(building, realm, giantIndex, now, speedFactor);
            switch (step.Kind)
            {
                case RealmStepKind.LeaveRealm:
                    buildings[i] = building with { OutsideRealmSince = now };
                    functionChanged = true;
                    leaving.Add(building);
                    break;
                case RealmStepKind.CancelFoundation:
                    foundations.Add(building.Coord);
                    break;
                case RealmStepKind.ReturnToRealm:
                    buildings[i] = building with { OutsideRealmSince = null };
                    functionChanged = true;
                    break;
                case RealmStepKind.Decay when step.LevelsLost >= building.Level:
                    removed.Add(building.Coord);
                    break;
                case RealmStepKind.Decay:
                    buildings[i] = building with
                    {
                        Level = building.Level - step.LevelsLost,
                        OutsideRealmSince = building.OutsideRealmSince + BuildingCatalogue.DecayInterval(building.Type, speedFactor) * step.LevelsLost,
                    };
                    break;
                default:
                    continue;
            }

            changed = true;
        }

        if (!changed)
        {
            return (this, false);
        }

        buildings.RemoveAll(b => removed.Contains(b.Coord));
        var queue = removed.Count == 0 ? Queue : [.. Queue.Where(o => !removed.Contains(o.Coord))];
        var resources = Resources;
        if (functionChanged)
        {
            var (production, capacity) = BoostedTotals(buildings, Runes, terrainAt);
            resources = resources.WithRate(ApplyUpkeep(production * speedFactor, Garrison, guestStacks ?? []), capacity, now);
        }

        var updated = this with { Buildings = buildings, Queue = queue, Resources = resources };

        // What leaving the realm cancels (docs/design/economy.md section 5): queued upgrades and foundations on the hex, refunded by
        // the ordinary cancel; queued training of the buildings that left the realm or are gone, refunded in full.
        foreach (var coord in leaving.Select(b => b.Coord).Concat(foundations))
        {
            foreach (var order in updated.Queue.Where(o => o.Coord == coord).ToList())
            {
                updated = updated.CancelBuild(order.Id, now, speedFactor).Settlement ?? updated;
            }
        }

        if (foundations.Count > 0)
        {
            updated = updated with { Buildings = [.. updated.Buildings.Where(b => !(foundations.Contains(b.Coord) && b.Level < 1))] };
        }

        updated = updated.CancelTrainingAt(leaving.Select(b => b.Coord).Concat(removed).ToHashSet(), now);

        // Dropped orders may have held construction slots: let the head of the waiting queue take them now.
        return (updated.PromoteWaitingOrders(now, speedFactor).Settlement, true);
    }

    /// <summary>
    /// Cancels and refunds in full (cost x count x cost multiplier) every queued training part of the buildings on
    /// <paramref name="coords"/>: they left the realm, are gone or no longer train.
    /// </summary>
    private Settlement CancelTrainingAt(IReadOnlySet<HexCoord> coords, DateTimeOffset now)
    {
        var resources = Resources;
        var kept = new List<TrainingOrder>();
        foreach (var order in TrainingQueue)
        {
            if (coords.Contains(order.BuildingCoord))
            {
                resources = resources.Deposit(UnitCatalogue.Get(order.UnitType).TrainingCost * order.Count, now);
            }
            else
            {
                kept.Add(order);
            }
        }

        return kept.Count == TrainingQueue.Count ? this : this with { TrainingQueue = kept, Resources = resources };
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

        return (this with
        {
            Buildings = buildings,
            Queue = [.. Queue.Where(o => o.Coord != editedCoord)],
            Resources = resources,
        }).CancelTrainingAt(new HashSet<HexCoord> { editedCoord }, now);
    }

    /// <summary>
    /// Net production (after garrison and guest upkeep) and capacity implied
    /// by what currently stands, shrine favour and slotted runes included.
    /// </summary>
    public (ResourceAmounts ProductionPerHour, ResourceAmounts Capacity) CurrentTotals(
        double speedFactor = 1.0, IReadOnlyList<UnitStack>? guestStacks = null, Func<HexCoord, Terrain>? terrainAt = null)
    {
        var (production, capacity) = GrossTotals(speedFactor, terrainAt);
        return (ApplyUpkeep(production, Garrison, guestStacks ?? []), capacity);
    }

    /// <summary>Boosted production and capacity of what stands (runes and terrain included), production times <paramref name="speedFactor"/>, before any upkeep.</summary>
    internal (ResourceAmounts GrossProduction, ResourceAmounts Capacity) GrossTotals(double speedFactor, Func<HexCoord, Terrain>? terrainAt)
    {
        var (production, capacity) = BoostedTotals(Buildings, Runes, terrainAt);
        return (production * speedFactor, capacity);
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
        if (!occupied || BuildingCatalogue.GodOf(shrine.Type) is null || shrine.Level < 1 || !shrine.IsFunctioning)
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
            if (building.Level < 1 || !building.IsFunctioning)
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

        return total.Capped(MaxEffectBonus, MaxEffectBonus, MaxEffectBonus);
    }

    /// <summary>
    /// A catalogue build duration as it actually runs here: divided by the
    /// world's speed factor and multiplied by <see cref="BuildTimeFactor"/>.
    /// </summary>
    private TimeSpan ScaledBuildDuration(TimeSpan baseDuration, double speedFactor)
    {
        var wisdom = BuildTimeFactor;
        return speedFactor == 1.0 && wisdom == 1.0
            ? baseDuration
            : TimeSpan.FromTicks((long)(baseDuration.Ticks * wisdom / speedFactor));
    }

    /// <summary>
    /// The multiplier on every new build order's duration from Odin's Wisdom:
    /// <c>1 − 0.02 · level</c> of the standing Odin Statue (0.90 at level 5),
    /// 1.0 without one. Applied where an order starts — at planning for an
    /// order that starts at once, at promotion for a waiting one — so the level
    /// at that moment counts and an order already running is never rescaled.
    /// </summary>
    public double BuildTimeFactor => 1.0 - ActiveEffect(Buildings, []).BuildTimeReduction;

    /// <summary>
    /// Extra rings of fog vision from Odin's Ravens (<c>2 · level</c> of the
    /// standing Odin Statue, 10 at level 5; 0 without one), added to the
    /// settlement's own vision disc, to each tower's and to its travelling
    /// armies' (<see cref="World.FogVisionRadii"/>).
    /// </summary>
    public int VisionBonusRings => ActiveEffect(Buildings, []).VisionBonusRings;

    /// <summary>
    /// This settlement's current attack bonus, as a percentage — the
    /// attacker-side counterpart to <see cref="BuildingCatalogue.TowerDefenseBonusPercent"/>,
    /// sourced from standing shrine favour and slotted runes (Thor for land
    /// units, Njörd for ships — see <see cref="Shrines.ShrineCatalogue.Favour"/>).
    /// </summary>
    public double AttackBonusPercent(UnitClass unitClass)
    {
        var effect = ActiveEffect(Buildings, Runes);
        return (unitClass == UnitClass.Ship ? effect.ShipAttackBonus : effect.LandAttackBonus) * 100;
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
    /// <param name="speedFactor">
    /// The world's current <c>SpeedFactor</c> — divides per-unit training
    /// duration, the same way <see cref="PlanBuild"/> already divides build
    /// duration. Previously not applied here at all, which meant a world
    /// sped up for testing/admin purposes still trained units at the
    /// unscaled rate while every building finished faster.
    /// </param>
    /// <param name="newOrderId">Makes the id of each part; one part is created per building that gets units.</param>
    /// <param name="buildingCoord">
    /// The building the player orders from: it must hold a building of the unit's required type. Alone it takes the whole order
    /// for <see cref="TrainingSplit.Here"/>.
    /// </param>
    /// <param name="isPremium">Whether the owner is premium; <see cref="TrainingSplit.Fastest"/> needs it.</param>
    public TrainDecision PlanTrain(
        UnitType type, int count, DateTimeOffset now, Func<Guid> newOrderId, HexCoord buildingCoord,
        TrainingSplit split = TrainingSplit.Here, bool isPremium = false, bool hasShoreline = false,
        double speedFactor = 1.0)
    {
        if (count <= 0)
        {
            return TrainDecision.Rejected(TrainRejection.InvalidCount);
        }

        if (split == TrainingSplit.Fastest && !isPremium)
        {
            return TrainDecision.Rejected(TrainRejection.PremiumRequired);
        }

        if (!UnitCatalogue.IsAvailable(type, LonghouseLevel, t => HighestLevelOf(t)))
        {
            // The same check counting every building: the unit is only missing because its training building stands
            // outside the realm.
            return TrainDecision.Rejected(
                UnitCatalogue.IsAvailable(type, LonghouseLevel, t => Buildings.Where(b => b.Type == t).Select(b => b.Level).DefaultIfEmpty(0).Max())
                    ? TrainRejection.BuildingOutsideRealm
                    : TrainRejection.UnitNotAvailable);
        }

        if (UnitCatalogue.Get(type).Class == UnitClass.Ship && !hasShoreline)
        {
            return TrainDecision.Rejected(TrainRejection.SettlementNotCoastal);
        }

        var definition = UnitCatalogue.Get(type);
        var requested = Buildings.Where(b => b.Coord == buildingCoord).Cast<PlacedBuilding?>().FirstOrDefault();
        if (requested is not { } here || here.Type != definition.RequiredBuildingType)
        {
            return TrainDecision.Rejected(TrainRejection.WrongBuilding);
        }

        var candidates = split == TrainingSplit.Here
            ? new List<PlacedBuilding> { here }
            : Buildings.Where(b => b.Type == definition.RequiredBuildingType).ToList();
        candidates.RemoveAll(b => b.Level < 1 || !b.IsFunctioning);
        if (candidates.Count == 0)
        {
            return TrainDecision.Rejected(TrainRejection.BuildingOutsideRealm);
        }

        var slots = candidates
            .Where(b => TrainingQueue.Count(o => o.BuildingCoord == b.Coord) < MaxTrainingPartsPerBuilding)
            .Select(b => new TrainingSlot(
                b.Coord,
                b.Level,
                TrainingQueue.Where(o => o.BuildingCoord == b.Coord).Select(o => o.CompletesAt).Append(now).Max(),
                UnitCatalogue.TrainingTime(type, b.Level, speedFactor)))
            .ToList();
        if (slots.Count == 0)
        {
            return TrainDecision.Rejected(TrainRejection.TrainingQueueFull);
        }

        var totalCost = definition.TrainingCost * count;
        // Issue #158 stage 1c: a reservation earmarked for the waiting build
        // queue must be unspendable on anything else, training included.
        if (!CanAffordAvailable(totalCost, now))
        {
            return TrainDecision.Rejected(TrainRejection.NotEnoughResources);
        }

        var shares = split switch
        {
            TrainingSplit.Evenly => TrainingPlanner.Evenly(slots, count),
            TrainingSplit.Fastest => TrainingPlanner.Fastest(slots, count, now),
            _ => [(slots[0], count)],
        };

        return TrainDecision.Accept([.. shares.Select(share => new TrainingOrder
        {
            Id = newOrderId(),
            BuildingCoord = share.Slot.Coord,
            UnitType = type,
            Count = share.Units,
            StartedAt = share.Slot.Start,
            PerUnitDuration = share.Slot.UnitTime,
        })]);
    }

    /// <summary>
    /// Pays for <paramref name="orders"/> (the parts of one <see cref="PlanTrain"/> decision; cost × units,
    /// charged once) and appends them to the training queue.
    /// </summary>
    public Settlement EnqueueTraining(IReadOnlyList<TrainingOrder> orders, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(orders);

        var totalCost = orders
            .GroupBy(o => o.UnitType)
            .Aggregate(ResourceAmounts.Zero, (sum, g) => sum + UnitCatalogue.Get(g.Key).TrainingCost * g.Sum(o => o.Count));
        if (!TrySpendAvailable(totalCost, now, out var paid))
        {
            throw new InvalidOperationException(
                "Cannot enqueue training that is not affordable; call PlanTrain first.");
        }

        return this with { Resources = paid, TrainingQueue = [.. TrainingQueue, .. orders] };
    }

    /// <summary>
    /// Decides whether a Town Square feast may start now (<see cref="Feasts"/>):
    /// a Town Square must stand, no other feast may be running, and the
    /// available stock must cover the cost, which is set by the Town Square's
    /// level. Call on an already-settled settlement — mirrors
    /// <see cref="PlanTrain"/>.
    /// </summary>
    /// <param name="speedFactor">
    /// The world's <c>SpeedFactor</c> — divides the feast's duration the same
    /// way it divides build and training times.
    /// </param>
    public FeastDecision PlanFeast(DateTimeOffset now, double speedFactor = 1.0)
    {
        var townSquare = TownSquareLevel;
        if (townSquare <= 0)
        {
            return FeastDecision.Rejected(FeastRejection.NoTownSquare);
        }

        if (Feast is { } running && !running.IsComplete(now))
        {
            return FeastDecision.Rejected(FeastRejection.AlreadyRunning);
        }

        if (!CanAffordAvailable(Feasts.CostFor(townSquare), now))
        {
            return FeastDecision.Rejected(FeastRejection.NotEnoughResources);
        }

        var duration = speedFactor == 1.0
            ? Feasts.Duration
            : TimeSpan.FromTicks((long)(Feasts.Duration.Ticks / speedFactor));

        return FeastDecision.Accept(new Feast(now, now + duration, Feasts.RenownFor(townSquare)));
    }

    /// <summary>Whether the onboarding quest <paramref name="quest"/> was already claimed.</summary>
    public bool HasClaimed(Quest quest) => (ClaimedQuests & quest.Mask) != 0;

    /// <summary>
    /// Decides whether the onboarding quest <paramref name="questId"/> may be
    /// claimed: it must exist, not be claimed yet, and its condition must hold.
    /// Any completed quest may be claimed, in any order. Call on an
    /// already-settled settlement — mirrors <see cref="PlanFeast"/>.
    /// </summary>
    public QuestDecision PlanClaimQuest(string? questId)
    {
        if (Quests.Find(questId) is not { } quest)
        {
            return QuestDecision.Rejected(QuestRejection.UnknownQuest);
        }

        if (HasClaimed(quest))
        {
            return QuestDecision.Rejected(QuestRejection.AlreadyClaimed);
        }

        return quest.IsCompleted(this)
            ? QuestDecision.Accept(quest)
            : QuestDecision.Rejected(QuestRejection.NotCompleted);
    }

    /// <summary>
    /// Pays <paramref name="quest"/>'s reward into the stock, clamped to
    /// storage capacity, and marks it claimed. Call <see cref="PlanClaimQuest"/> first.
    /// </summary>
    public Settlement ClaimQuest(Quest quest, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(quest);

        if (HasClaimed(quest) || !quest.IsCompleted(this))
        {
            throw new InvalidOperationException("Cannot claim a quest that is claimed or not completed; call PlanClaimQuest first.");
        }

        return this with
        {
            Resources = Resources.Deposit(quest.Reward, now),
            ClaimedQuests = ClaimedQuests | quest.Mask,
        };
    }

    /// <summary>Pays for <paramref name="feast"/> and starts it. Call <see cref="PlanFeast"/> first.</summary>
    public Settlement StartFeast(Feast feast, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(feast);

        if (!TrySpendAvailable(Feasts.CostFor(TownSquareLevel), now, out var paid))
        {
            throw new InvalidOperationException("Cannot start a feast that is not affordable; call PlanFeast first.");
        }

        // A finished feast still sitting here (nothing settled first) must not
        // be overwritten with its renown unpaid.
        var carried = Feast is { } finished && finished.IsComplete(now) ? finished.RenownGain : 0;

        return this with { Resources = paid, Feast = feast, PendingFeastRenown = PendingFeastRenown + carried };
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
        HexCoord fromSpot, IReadOnlyList<UnitStack> requestedUnits, double provisions, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(requestedUnits);

        if (SpotAt(fromSpot) is null)
        {
            return SettlementDispatchDecision.Rejected(DispatchRejection.NotAGarrisonSpot);
        }

        var normalised = requestedUnits
            .Where(s => s.Count > 0)
            .GroupBy(s => s.Type)
            .Select(g => new UnitStack(g.Key, g.Sum(s => s.Count)))
            .ToList();

        if (normalised.Count == 0)
        {
            return SettlementDispatchDecision.Rejected(DispatchRejection.NoUnitsRequested);
        }

        var atSpot = GarrisonAt(fromSpot);
        foreach (var stack in normalised)
        {
            if (atSpot.Where(g => g.Type == stack.Type).Sum(g => g.Count) < stack.Count)
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

        var left = atSpot
            .Select(g => g with { Count = g.Count - normalised.Where(n => n.Type == g.Type).Sum(n => n.Count) })
            .Where(g => g.Count > 0);
        var updated = WithGarrisonAt(fromSpot, left) with { Resources = paidResources };
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

/// <summary>
/// What a <see cref="Settlement"/> needs to know about the other members of its linked realm while a group settle treats them as
/// one realm (<see cref="Settlement.Linked"/>). Never persisted.
/// </summary>
/// <param name="OtherConstructionSlots">Sum of the other members' own construction slots.</param>
/// <param name="OtherQueue">The other members' build queues, merged in FIFO order.</param>
/// <param name="GroupLonghouseLevel">The highest Longhouse level in the linked realm.</param>
/// <param name="OtherTowerLimit">Sum of the other members' tower limits.</param>
/// <param name="OtherTowerCount">The other members' towers counting against the limit (connected standing plus queued).</param>
/// <param name="OtherBuildings">The other members' standing buildings, read for build prerequisites.</param>
public sealed record LinkedQueueContext(
    int OtherConstructionSlots,
    IReadOnlyList<BuildOrder> OtherQueue,
    int GroupLonghouseLevel,
    int OtherTowerLimit,
    int OtherTowerCount,
    IReadOnlyList<PlacedBuilding> OtherBuildings);
