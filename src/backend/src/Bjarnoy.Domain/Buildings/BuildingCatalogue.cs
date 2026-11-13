using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Shrines;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>
/// The tech tree, as data.
/// </summary>
/// <remarks>
/// Cost and production are geometric in the level (the
/// Travian shape): cost ×1.30 per level (Longhouse ×1.34); build time follows its own curves, see <see cref="BuildTimes"/>. A producer's
/// production is increment-geometric: each level adds ×1.20 more than the one before
/// (<c>I1 · 1.20^(L−1)</c>), so its level total is <c>I1 · (1.20^L − 1) / 0.20</c>. Because cost outgrows output, a
/// producer's payback time rises about 8% per level — the next level is
/// always worth building, just less obviously. Buildings cost no iron. Each
/// building has its own maximum level (<see cref="MaxLevelFor"/>). The
/// numbers are tuned against the pacing simulator; see
/// <c>docs/design/economy.md</c>.
/// </remarks>
public static class BuildingCatalogue
{
    /// <summary>Highest level any building can reach (the Longhouse).</summary>
    public const int HighestMaxLevel = 30;

    /// <summary>Cost multiplier per level for every building except the Longhouse.</summary>
    private const double CostGrowth = 1.30;

    /// <summary>Storage House cost growth per level.</summary>
    private const double StorageHouseCostGrowth = 1.20;

    /// <summary>Great Storehouse cost growth per level.</summary>
    private const double GreatStorehouseCostGrowth = 1.23;

    private const double LonghouseCostGrowth = 1.34;

    /// <summary>Longhouse cost growth per level from level 11 on (levels 1 to 10 grow by <see cref="LonghouseCostGrowth"/>).</summary>
    private const double LonghouseLateCostGrowth = 1.60;

    private const int LonghouseLateCostFromLevel = 11;

    /// <summary>Cost growth per level of the five shrines.</summary>
    private const double ShrineCostGrowth = 2.140;

    /// <summary>Production multiplier per level.</summary>
    private const double ProductionGrowth = 1.20;

    /// <summary>A raze takes this share of the razed level's build time (<c>docs/design/construction-slots.md</c>, "Razing").</summary>
    public const double RazeTimeFactor = 0.75;

    /// <summary>A finished raze pays back one this-th of the razed level's cost, rounded down per resource.</summary>
    public const double RazeRefundDivisor = 3.0;

    /// <summary>
    /// The highest level <paramref name="type"/> can be built to
    /// (<c>docs/design/economy.md</c> §4): Longhouse 30; resource producers and
    /// Storage House 25 (the bog-ore works too); military/civic buildings and the mills (the Hammerschmiede too) 20; Great Storehouse 10; Tower 5; shrines 5; Palisade and Palisade Gate 3; Bridge 4; Siege Workshop 20. Unknown/removed types return 0.
    /// </summary>
    public static int MaxLevelFor(BuildingType type) => type switch
    {
        BuildingType.Longhouse => 30,
        BuildingType.Lumberjack or BuildingType.Quarry or BuildingType.ClayBrickworks
            or BuildingType.Farm or BuildingType.PumpkinFarm or BuildingType.FishingHut
            or BuildingType.ReindeerHerder or BuildingType.BogOreWorks or BuildingType.StorageHouse => 25,
        BuildingType.Barracks or BuildingType.ArcheryRange or BuildingType.Harbour or BuildingType.Shipyard
            or BuildingType.TownSquare or BuildingType.CartWorkshop or BuildingType.DruidHut
            or BuildingType.Smithy or BuildingType.Meadery or BuildingType.Sawmill
            or BuildingType.CropMill or BuildingType.Hammerschmiede => 20,
        BuildingType.GreatStorehouse => 10,
        BuildingType.Tower => 5,
        BuildingType.ShrineOfThor or BuildingType.ShrineOfFreyja
            or BuildingType.ShrineOfUllr or BuildingType.ShrineOfNjord
            or BuildingType.OdinStatue => 5,
        BuildingType.Palisade or BuildingType.PalisadeGate => 3,
        BuildingType.Bridge => 4,
        BuildingType.SiegeWorkshop => 20,
        BuildingType.BeachCamp => 1,
        _ => 0,
    };

    /// <summary>The shortest time a building outside the realm takes from its top level to gone in a 1x world.</summary>
    public static readonly TimeSpan MinDecayTime = TimeSpan.FromDays(7);

    /// <summary>The longest time a building outside the realm takes from its top level to gone in a 1x world.</summary>
    public static readonly TimeSpan MaxDecayTime = TimeSpan.FromDays(30);

    /// <summary>The world speed at and above which the decay bounds stop shrinking (the 100x bounds hold).</summary>
    public const double DecayBoundsMaxSpeed = 100;

    /// <summary>
    /// The shortest and longest time to gone in a world running at <paramref name="speedFactor"/>: on a log scale of speed
    /// (<c>t = clamp(ln s / ln 100, 0, 1)</c>) the minimum falls from 7 days at 1x to 1 hour at 100x
    /// (<c>168^(1-t)</c> hours) and the maximum from 30 days to 24 hours (<c>720^(1-t) * 24^t</c> hours).
    /// </summary>
    public static (TimeSpan Min, TimeSpan Max) DecayBounds(double speedFactor)
    {
        var t = speedFactor <= 1 ? 0.0 : Math.Min(1.0, Math.Log(speedFactor) / Math.Log(DecayBoundsMaxSpeed));
        return (
            TimeSpan.FromHours(Math.Pow(168, 1 - t)),
            TimeSpan.FromHours(Math.Pow(720, 1 - t) * Math.Pow(24, t)));
    }

    /// <summary>
    /// How long a building with <paramref name="maxLevel"/> levels takes from its top level to gone once the realm no longer
    /// reaches it (<c>docs/design/economy.md</c> section 5): <paramref name="maxLevel"/> x 24 hours divided by the world's
    /// <paramref name="speedFactor"/>, clamped to <see cref="DecayBounds"/> of that speed (7 to 30 days at 1x).
    /// </summary>
    public static TimeSpan DecayTimeToGone(int maxLevel, double speedFactor = 1.0)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(maxLevel, 1);
        var (min, max) = DecayBounds(speedFactor);
        var time = TimeSpan.FromHours(24.0 * maxLevel / Math.Max(speedFactor, 1e-9));
        return time < min ? min : time > max ? max : time;
    }

    /// <summary>The time a <paramref name="type"/> outside the realm takes from its top level to gone (<see cref="DecayTimeToGone(int)"/> of its max level).</summary>
    public static TimeSpan DecayTimeToGone(BuildingType type, double speedFactor = 1.0) => DecayTimeToGone(MaxLevelFor(type), speedFactor);

    /// <summary>One level of a building with <paramref name="maxLevel"/> levels is lost every this long outside the realm: its <see cref="DecayTimeToGone(int)"/> divided by <paramref name="maxLevel"/>.</summary>
    public static TimeSpan DecayInterval(int maxLevel, double speedFactor = 1.0) => DecayTimeToGone(maxLevel, speedFactor) / maxLevel;

    /// <summary>One level of a <paramref name="type"/> outside the realm is lost every this long (<see cref="DecayInterval(int)"/> of its max level).</summary>
    public static TimeSpan DecayInterval(BuildingType type, double speedFactor = 1.0) => DecayInterval(MaxLevelFor(type), speedFactor);

    /// <summary>Whether a <paramref name="type"/> outside the realm decays: every building does except the Longhouse and the beach camp, which make the realm.</summary>
    public static bool Decays(BuildingType type) => type is not (BuildingType.Longhouse or BuildingType.BeachCamp);

    /// <summary>What a settlement can store before it builds a storage house.</summary>
    public static ResourceAmounts BaseStorageCapacity { get; } = ResourceAmounts.Uniform(500);

    /// <summary>How far below its starting storage capacity a new settlement's stock sits.</summary>
    public const double FoundingHeadroom = 50;

    /// <summary>
    /// What a new settlement starts with: its starting storage nearly full —
    /// base capacity plus the level-1 Longhouse's own storage, less
    /// <see cref="FoundingHeadroom"/> — so the first builds never wait
    /// (docs/design/economy.md, T1: the first ten minutes are a run of real
    /// moves, not a countdown). No iron: the first unit needs none, and the
    /// first iron comes from the bog-ore works. Computed on access
    /// rather than in a static initializer, since the Longhouse definition
    /// reads tables declared further down this class.
    /// </summary>
    public static ResourceAmounts FoundingStock =>
        (BaseStorageCapacity + Get(BuildingType.Longhouse, 1).StorageCapacity - ResourceAmounts.Uniform(FoundingHeadroom))
        with { Iron = 0 };

    public static IReadOnlyList<BuildingType> AllTypes { get; } =
        [.. Enum.GetValues<BuildingType>().Where(t => MaxLevelFor(t) > 0)];

    /// <summary>
    /// The Longhouse level each non-Longhouse building unlocks at — the unlock
    /// ladder from <c>docs/design/economy.md</c> §5, in one table. A building's
    /// level can never exceed the Longhouse level either, except for the
    /// producers (<see cref="StorageCappedProducers"/>), which storage caps
    /// instead — see <see cref="RequiredLonghouseLevelFor"/>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// LH 1: Lumberjack, Quarry, Clay Brickworks, Storage House and Farm.
    /// Stone has two sources at LH 1 because world generation does not
    /// guarantee a Mountain near a start, so Clay Brickworks is the
    /// no-mountain stone source, not an upgrade. Early levels unlock about one
    /// building each; the late game comes in tiers (LH 15, 20, 25).
    /// </para>
    /// <para>
    /// The Reindeer Herder is the starting food building (LH 1). Farm and Pumpkin
    /// Farm both unlock at LH 4 behind a level-3 Herder; Pumpkin Farm stays
    /// soil-gated (see <see cref="Settlement.PlanBuild"/>'s islandSoil parameter).
    /// </para>
    /// </remarks>
    private static readonly IReadOnlyDictionary<BuildingType, int> UnlockLevels =
        new Dictionary<BuildingType, int>
        {
            [BuildingType.Lumberjack] = 1,
            [BuildingType.Quarry] = 1,
            [BuildingType.ClayBrickworks] = 1,
            [BuildingType.StorageHouse] = 1,
            [BuildingType.ReindeerHerder] = 1,
            [BuildingType.FishingHut] = 2,
            [BuildingType.Tower] = 3,
            [BuildingType.Farm] = 4,
            [BuildingType.PumpkinFarm] = 4,
            [BuildingType.Barracks] = 5,
            [BuildingType.BogOreWorks] = 3,
            [BuildingType.TownSquare] = 6,
            [BuildingType.Palisade] = 7,
            [BuildingType.PalisadeGate] = 7,
            [BuildingType.Bridge] = 7,
            [BuildingType.Harbour] = 5,
            [BuildingType.Shipyard] = 10,
            [BuildingType.ArcheryRange] = 9,
            [BuildingType.CartWorkshop] = 10,
            [BuildingType.Meadery] = 11,
            [BuildingType.DruidHut] = 12,
            [BuildingType.Smithy] = 15,
            [BuildingType.GreatStorehouse] = 15,
            [BuildingType.SiegeWorkshop] = 18,
            [BuildingType.Sawmill] = 20,
            [BuildingType.CropMill] = 20,
            [BuildingType.Hammerschmiede] = 20,
            [BuildingType.ShrineOfUllr] = 25,
            [BuildingType.ShrineOfFreyja] = 25,
            [BuildingType.ShrineOfNjord] = 25,
            [BuildingType.ShrineOfThor] = 25,
            [BuildingType.OdinStatue] = 25,
        };

    /// <summary>
    /// Buildings that can no longer be placed anew while their type, art and numbers stay: the Quarry is switched off for now.
    /// Quarries already standing (or queued) in a saved world keep producing and upgrading —
    /// <see cref="Settlement.PlanBuild"/> only refuses a level-1 order (<see cref="BuildRejection.NewPlacementDisabled"/>).
    /// </summary>
    public static IReadOnlySet<BuildingType> NewPlacementDisabled { get; } = new HashSet<BuildingType>
    {
        BuildingType.Quarry,

        // Never placed by a player: a camp builder sets it down as a settlement's centre, and it has a single level.
        BuildingType.BeachCamp,
    };

    /// <summary>What a beach camp stores of each resource: the whole of its capacity (no <see cref="BaseStorageCapacity"/> on top).</summary>
    public const double BeachCampStorage = 2000;

    /// <summary>The base storage a building set gets: none for a beach camp, which stores exactly <see cref="BeachCampStorage"/>.</summary>
    private static ResourceAmounts BaseCapacityFor(bool hasBeachCamp) =>
        hasBeachCamp ? ResourceAmounts.Zero : BaseStorageCapacity;

    /// <summary>
    /// The Longhouse level <paramref name="type"/> unlocks at (1 for the
    /// Longhouse itself and for unknown types).
    /// </summary>
    public static int UnlockLevel(BuildingType type) =>
        UnlockLevels.TryGetValue(type, out var unlock) ? unlock : 1;

    /// <summary>
    /// The buildings whose level is capped by storage instead of by the
    /// Longhouse: a level whose cost exceeds the settlement's storage capacity
    /// can never be afforded, so storage is the natural brake. An active
    /// player's production must be able to run ahead of the Longhouse (see
    /// <c>docs/design/economy.md</c>), otherwise the casual player catches up
    /// once the active one stalls at the cap.
    /// </summary>
    public static IReadOnlySet<BuildingType> StorageCappedProducers { get; } = new HashSet<BuildingType>
    {
        BuildingType.Lumberjack,
        BuildingType.Quarry,
        BuildingType.ClayBrickworks,
        BuildingType.ReindeerHerder,
        BuildingType.Farm,
        BuildingType.PumpkinFarm,
        BuildingType.FishingHut,
        BuildingType.BogOreWorks,
    };

    /// <summary>
    /// The buildings whose level is not capped by the Longhouse level: the
    /// <see cref="StorageCappedProducers"/> and the Storage House (which
    /// needs only its unlock level at every level, storage itself being what
    /// limits the rest).
    /// </summary>
    public static IReadOnlySet<BuildingType> LonghouseUncappedTypes { get; } =
        new HashSet<BuildingType>(StorageCappedProducers) { BuildingType.StorageHouse };

    /// <summary>The Storage House level the n-th Great Storehouse needs, n of them standing at this level.</summary>
    public const int GreatStorehouseStorageHouseLevel = 25;

    /// <summary>
    /// The Longhouse level needed to build <paramref name="type"/> at
    /// <paramref name="level"/>: <c>max(UnlockLevel(type), level)</c> — a
    /// building's level can never exceed the Longhouse's — except for the
    /// <see cref="LonghouseUncappedTypes"/> (the storage-capped producers and the
    /// Storage House), which only need their unlock level at every level
    /// (storage caps them instead). The Longhouse
    /// itself only ever needs level 1 (it is upgraded by having a standing
    /// Longhouse, not by a higher one).
    /// </summary>
    public static int RequiredLonghouseLevelFor(BuildingType type, int level) =>
        type == BuildingType.Longhouse ? 1
        : LonghouseUncappedTypes.Contains(type) ? UnlockLevel(type)
        : Math.Max(UnlockLevel(type), level);

    /// <summary>
    /// Which buildings a settlement must already have standing before it may
    /// place another — the tech tree's shape, in one table. At most one
    /// feeder building per entry (Shrine of Freyja et al. each have their own).
    /// </summary>
    /// <remarks>
    /// <para>
    /// Every entry must be met, not any one of them. The lines are: Tower →
    /// Barracks → Archery Range → Weaponsmith (Smithy) → Shrine of Thor for
    /// the military; Fishing Hut → Harbour → Shipyard, and Harbour → Shrine of Njörd for the water;
    /// Lumberjack → Sawmill → Shrine of Ullr and Reindeer Herder → Farm → Meadery / Crop Mill →
    /// Shrine of Freyja for the land; Town Square → Cart Workshop / Druid Hut
    /// for the civic line; Storage House → Great Storehouse for storage. See
    /// <c>docs/design/economy.md</c> §5.
    /// </para>
    /// <para>
    /// Storage House, Quarry, Clay Brickworks, Lumberjack, Reindeer Herder,
    /// Tower and Town Square need nothing standing before them: Quarry needs a Mountain hex, and
    /// <see cref="World.WorldGenerator"/> does not guarantee one within reach
    /// of a starting position — anything behind a Quarry would be unreachable
    /// for an unlucky map roll rather than merely expensive.
    /// </para>
    /// </remarks>
    private static readonly IReadOnlyDictionary<BuildingType, IReadOnlyList<BuildingPrerequisite>> PrerequisiteTable =
        new Dictionary<BuildingType, IReadOnlyList<BuildingPrerequisite>>
        {
            [BuildingType.Farm] = [new(BuildingType.ReindeerHerder, 3)],
            [BuildingType.PumpkinFarm] = [new(BuildingType.ReindeerHerder, 3)],
            [BuildingType.Barracks] = [new(BuildingType.Tower, 3)],
            [BuildingType.Palisade] = [new(BuildingType.Tower, 5)],
            [BuildingType.PalisadeGate] = [new(BuildingType.Tower, 5)],
            [BuildingType.Bridge] = [new(BuildingType.TownSquare, 1)],
            [BuildingType.Harbour] = [new(BuildingType.FishingHut, 3)],
            [BuildingType.Shipyard] = [new(BuildingType.Harbour, 5)],
            [BuildingType.ArcheryRange] = [new(BuildingType.Barracks, 5)],
            [BuildingType.SiegeWorkshop] = [new(BuildingType.ArcheryRange, 3)],
            [BuildingType.CartWorkshop] = [new(BuildingType.TownSquare, 3)],
            [BuildingType.BogOreWorks] = [new(BuildingType.ClayBrickworks, 3)],
            [BuildingType.Meadery] = [new(BuildingType.Farm, 5)],
            [BuildingType.DruidHut] = [new(BuildingType.TownSquare, 5)],
            [BuildingType.Smithy] = [new(BuildingType.Barracks, 10)],
            [BuildingType.GreatStorehouse] = [new(BuildingType.StorageHouse, 25)],
            [BuildingType.Sawmill] = [new(BuildingType.Lumberjack, 10)],
            [BuildingType.CropMill] = [new(BuildingType.Farm, 10)],
            [BuildingType.Hammerschmiede] = [new(BuildingType.BogOreWorks, 10)],
            [BuildingType.ShrineOfUllr] = [new(BuildingType.Sawmill, 5)],
            [BuildingType.ShrineOfFreyja] = [new(BuildingType.CropMill, 5)],
            [BuildingType.ShrineOfNjord] = [new(BuildingType.Harbour, 10)],
            [BuildingType.ShrineOfThor] = [new(BuildingType.Smithy, 5)],
            // A settlement holds only one shrine, so Odin cannot ask for
            // another one as a feeder; the Druid Hut is the civic line's end.
            [BuildingType.OdinStatue] = [new(BuildingType.DruidHut, 10)],
        };

    /// <summary>
    /// The prerequisites attached to one level's definition. Prerequisites gate
    /// <em>placing</em> a building, so they sit on level 1 only — the level
    /// whose construction they gate — and
    /// <see cref="RequiredLonghouseLevelFor"/> governs the rest of its ladder.
    /// </summary>
    private static IReadOnlyList<BuildingPrerequisite> PrerequisitesFor(BuildingType type, int level)
    {
        if (level != 1 || !PrerequisiteTable.TryGetValue(type, out var prerequisites))
        {
            return [];
        }

        return prerequisites;
    }

    /// <summary>The definition for a level, or <see langword="null"/> if out of range.</summary>
    public static BuildingDefinition? TryGet(BuildingType type, int level)
    {
        if (level < 1 || level > MaxLevelFor(type))
        {
            return null;
        }

        var definition = type switch
        {
            BuildingType.Longhouse => Longhouse(level),
            BuildingType.BeachCamp => BeachCamp(level),
            BuildingType.Lumberjack => Producer(type, level, Forest, new ResourceAmounts(Wood: 8, 0, 0, 0), new ResourceAmounts(Wood: 16, Stone: 49, Food: 30, Iron: 0), brickFreeLevels: StartBrickFreeLevels),
            BuildingType.Quarry => Producer(type, level, Ridge, new ResourceAmounts(0, Stone: 8, 0, 0), new ResourceAmounts(Wood: 55, Stone: 8, Food: 33, Iron: 0)),
            // The starting food building: any grass, any island, LH 1. No
            // terrain boost, like Farm (a herd is not a concentrating resource).
            BuildingType.ReindeerHerder => Producer(type, level, Grass, new ResourceAmounts(0, 0, Food: 8, 0), new ResourceAmounts(Wood: 52, Stone: 36, Food: 7, Iron: 0), brickFreeLevels: StartBrickFreeLevels),
            // Buildable on any island regardless of soil, from LH 4 behind a
            // level-3 Reindeer Herder (it and PumpkinFarm are one tech-tree
            // card, split into two types only by their soil rule).
            BuildingType.Farm => Producer(type, level, Grass, new ResourceAmounts(0, 0, Food: 12, 0), new ResourceAmounts(Wood: 57, Stone: 29, Food: 9, Iron: 0)),
            BuildingType.StorageHouse => StorageHouse(level),
            BuildingType.Tower => Tower(level),
            BuildingType.FishingHut => FishingHut(level),
            // The bonus crop: only buildable on a Pumpkin-soil island
            // (Settlement.PlanBuild's islandSoil parameter, from
            // World.TerrainSampler.SoilAt) — not a free player choice, and
            // not gated the other way (Farm stays buildable everywhere).
            // Yields more than Farm: an indirect fertility signal via the
            // production curve rather than a separate bonus multiplier —
            // that's what makes a Pumpkin-soil island "more fertile".
            BuildingType.PumpkinFarm => Producer(type, level, Grass, new ResourceAmounts(0, 0, Food: 13, 0), new ResourceAmounts(Wood: 55, Stone: 33, Food: 8, Iron: 0)),
            BuildingType.ShrineOfThor => Shrine(type, level),
            BuildingType.ShrineOfFreyja => Shrine(type, level),
            BuildingType.ShrineOfUllr => Shrine(type, level),
            BuildingType.ShrineOfNjord => Shrine(type, level),
            BuildingType.OdinStatue => Shrine(type, level),
            BuildingType.GreatStorehouse => GreatStorehouse(level),
            BuildingType.Palisade or BuildingType.PalisadeGate => PalisadeHex(type, level),
            BuildingType.Bridge => BridgeHex(level),
            BuildingType.ArcheryRange => ArcheryRange(level),
            BuildingType.SiegeWorkshop => SiegeWorkshop(level),
            BuildingType.Harbour => Harbour(level),
            BuildingType.Shipyard => Shipyard(level),
            BuildingType.Barracks => Barracks(level),
            // Grass qualifies terrain-wise, but only a hex that is itself a
            // Straight/Bend river tile is actually buildable — see
            // BuildingDefinition.RequiresRiverShape. Unlocks at LH 20 behind
            // a level-10 Lumberjack (see PrerequisiteTable).
            //
            // No Wood of its own — a radius-boost producer instead (see
            // RadiusBoostTargets/RadiusBoostPercent/RadiusBoostRange): it
            // raises every Lumberjack within its level's range by a
            // percentage of that Lumberjack's own production, applied in
            // Totals(IEnumerable{PlacedBuilding}, Func{HexCoord,Terrain}?).
            BuildingType.Sawmill =>
                Producer(type, level, Grass, ResourceAmounts.Zero, new ResourceAmounts(Wood: 41500, Stone: 59500, Food: 5950, Iron: 0), growth: 1.313)
                    with
                    {
                        RequiresRiverShape = SawmillRiverShapes,
                        ExcludedRiverVariants = SawmillExcludedRiverVariants,
                    },
            // No production of its own yet — its mead is meant for a future
            // morale-boost mechanic, buildable now so it has a place in the
            // tech tree ahead of that mechanic landing.
            BuildingType.Meadery => Producer(type, level, Grass, ResourceAmounts.Zero, new ResourceAmounts(Wood: 860, Stone: 470, Food: 230, Iron: 0), growth: 1.30),
            BuildingType.TownSquare => TownSquare(level),
            // Same shape as Sawmill: behind a level-10 Farm at LH 20.
            //
            // No Food of its own, same reasoning as Sawmill above — boosts
            // every Farm within range instead. Not PumpkinFarm: a mill
            // grinds grain, and PumpkinFarm is a different crop (see
            // RadiusBoostTargets).
            BuildingType.CropMill =>
                Producer(type, level, Grass, ResourceAmounts.Zero, new ResourceAmounts(Wood: 59500, Stone: 41500, Food: 5950, Iron: 0), growth: 1.313)
                    with { RequiresRiverShape = CropMillRiverShapes },
            // The Weaponsmith (display name; the type stays Smithy). No
            // production of its own — a troop-upgrade building only (costs and
            // effects not yet designed); the military line's capstone and the
            // feeder of the Shrine of Thor.
            BuildingType.Smithy =>
                Producer(type, level, Grass, ResourceAmounts.Zero, new ResourceAmounts(Wood: 4100, Stone: 5100, Food: 1000, Iron: 0), growth: 1.486),
            BuildingType.DruidHut => DruidHut(level),
            BuildingType.CartWorkshop => CartWorkshop(level),
            // The start's stone source: on plain bog moss (the landing spots guarantee bog in reach), not on grass.
            BuildingType.ClayBrickworks =>
                Producer(type, level, Bog, new ResourceAmounts(0, Stone: 8, 0, 0), new ResourceAmounts(Wood: 52, Stone: 10, Food: 33, Iron: 0), brickFreeLevels: 1)
                    with { RequiresBogKind = PlainBogOnly },
            // Iron, on plain bog moss only (not a shore, mouth, creek or lake). Its own P1 is tuned in the Economy lab
            // (docs/design/economy.md section 8); terrain boost in Boosts, the Hammerschmiede's radius boost below.
            BuildingType.BogOreWorks =>
                Producer(type, level, Bog, new ResourceAmounts(0, 0, 0, Iron: BogOreWorksIronAtLevelOne), new ResourceAmounts(Wood: 42, Stone: 34, Food: 20, Iron: 0))
                    with { RequiresBogKind = PlainBogOnly },
            // A hammer mill on a bog creek. Like the Sawmill it produces nothing and raises the producers within its range
            // (RadiusBoostTargets): the bog-ore works. TODO(art): bog-creek Hammerschmiede - for now the frontend draws the
            // river hammer mill on the creek.
            BuildingType.Hammerschmiede =>
                Producer(type, level, Bog, ResourceAmounts.Zero, new ResourceAmounts(Wood: 59000, Stone: 37500, Food: 10500, Iron: 0), growth: 1.313)
                    with { RequiresBogKind = CreekOnly },
            _ => null,
        };

        // Attached here rather than in each helper so the tech tree's shape
        // (unlock ladder + prerequisites) lives in exactly one place, and every
        // building goes through the same rule for which of its levels the
        // prerequisites gate.
        if (definition is null)
        {
            return null;
        }

        var ring = RingPlacements.TryGetValue(type, out var placement) ? placement : default;
        return definition with
        {
            Cost = NiceRound(definition.Cost),
            Prerequisites = PrerequisitesFor(type, level),
            RequiredLonghouseLevel = RequiredLonghouseLevelFor(type, level),
            RingCategory = ring.Category,
            RingOrder = ring.Order,
        };
    }

    /// <summary>
    /// Where each building sits in the build ring: its category and its position within it. The client builds its ring from this
    /// (filtering by the hex's terrain, bog kind and river), so a new building is added here only. The Longhouse is never listed;
    /// the Quarry is listed but <see cref="NewPlacementDisabled"/> keeps it off the ring.
    /// </summary>
    private static readonly IReadOnlyDictionary<BuildingType, (BuildingRingCategory? Category, int Order)> RingPlacements =
        new Dictionary<BuildingType, (BuildingRingCategory? Category, int Order)>
        {
            [BuildingType.ReindeerHerder] = (BuildingRingCategory.Resource, 0),
            [BuildingType.Farm] = (BuildingRingCategory.Resource, 1),
            [BuildingType.PumpkinFarm] = (BuildingRingCategory.Resource, 2),
            [BuildingType.Sawmill] = (BuildingRingCategory.Resource, 3),
            [BuildingType.CropMill] = (BuildingRingCategory.Resource, 4),
            [BuildingType.Meadery] = (BuildingRingCategory.Resource, 5),
            [BuildingType.Lumberjack] = (BuildingRingCategory.Resource, 6),
            [BuildingType.Quarry] = (BuildingRingCategory.Resource, 7),
            [BuildingType.ClayBrickworks] = (BuildingRingCategory.Resource, 8),
            [BuildingType.BogOreWorks] = (BuildingRingCategory.Resource, 9),
            [BuildingType.Hammerschmiede] = (BuildingRingCategory.Resource, 10),
            [BuildingType.ArcheryRange] = (BuildingRingCategory.Military, 0),
            [BuildingType.SiegeWorkshop] = (BuildingRingCategory.Military, 1),
            [BuildingType.Barracks] = (BuildingRingCategory.Military, 2),
            [BuildingType.Smithy] = (BuildingRingCategory.Military, 3),
            [BuildingType.StorageHouse] = (BuildingRingCategory.Logistics, 0),
            [BuildingType.GreatStorehouse] = (BuildingRingCategory.Logistics, 1),
            [BuildingType.TownSquare] = (BuildingRingCategory.Logistics, 2),
            [BuildingType.CartWorkshop] = (BuildingRingCategory.Logistics, 3),
            [BuildingType.DruidHut] = (BuildingRingCategory.Logistics, 4),
            [BuildingType.Tower] = (BuildingRingCategory.Defense, 0),
            [BuildingType.Palisade] = (BuildingRingCategory.Defense, 1),
            [BuildingType.PalisadeGate] = (BuildingRingCategory.Defense, 2),
            [BuildingType.Bridge] = (BuildingRingCategory.Defense, 3),
            [BuildingType.ShrineOfThor] = (BuildingRingCategory.Religion, 0),
            [BuildingType.ShrineOfFreyja] = (BuildingRingCategory.Religion, 1),
            [BuildingType.ShrineOfUllr] = (BuildingRingCategory.Religion, 2),
            [BuildingType.OdinStatue] = (BuildingRingCategory.Religion, 3),
            [BuildingType.FishingHut] = (BuildingRingCategory.Water, 0),
            [BuildingType.Harbour] = (BuildingRingCategory.Water, 1),
            [BuildingType.Shipyard] = (BuildingRingCategory.Water, 2),
            [BuildingType.ShrineOfNjord] = (BuildingRingCategory.Water, 3),
        };

    public static BuildingDefinition Get(BuildingType type, int level) =>
        TryGet(type, level)
        ?? throw new ArgumentOutOfRangeException(
            nameof(level), level, $"{type} has no level {level} (valid: 1-{MaxLevelFor(type)}).");

    /// <summary>
    /// Total production and storage a completed set of buildings contributes.
    /// </summary>
    /// <remarks>
    /// Summed from the current level of each building rather than accumulated
    /// as buildings finish, so the settlement's rate is always a function of
    /// what is standing — a razed or captured building simply stops counting.
    /// This overload has no position, so it never applies a
    /// <see cref="TerrainBoost"/> — it exists for callers that total a
    /// building set with no hex to look neighbours up from (e.g. founding,
    /// which only ever totals a fresh Longhouse). <see cref="Totals(IEnumerable{PlacedBuilding}, Func{HexCoord, Terrain}?)"/>
    /// is the terrain-aware overload real settlement production goes through.
    /// </remarks>
    public static (ResourceAmounts ProductionPerHour, ResourceAmounts Capacity) Totals(
        IEnumerable<(BuildingType Type, int Level)> buildings)
    {
        ArgumentNullException.ThrowIfNull(buildings);

        var list = buildings as IReadOnlyCollection<(BuildingType Type, int Level)> ?? buildings.ToList();
        var production = ResourceAmounts.Zero;
        var capacity = BaseCapacityFor(list.Any(b => b.Type == BuildingType.BeachCamp && b.Level >= 1));

        foreach (var (type, level) in list)
        {
            if (level < 1)
            {
                continue;
            }

            var definition = TryGet(type, Math.Min(level, MaxLevelFor(type)));
            if (definition is null)
            {
                continue;
            }

            production += definition.ProductionPerHour;
            capacity += definition.StorageCapacity;
        }

        return (production, capacity);
    }

    /// <summary>
    /// Total production and storage a completed set of placed buildings
    /// contributes, applying each terrain-bound producer's adjacency boost
    /// (see <see cref="Boosts"/>) from <paramref name="terrainAt"/> and each
    /// radius-boost producer's (Sawmill, Crop Mill — see
    /// <see cref="RadiusBoostTargets"/>) reach over its own neighbourhood.
    /// </summary>
    /// <param name="terrainAt">
    /// Terrain of any hex on the map, land or sea, in or out of the
    /// settlement's claim. <see langword="null"/> disables boosts entirely
    /// (every building totals as if it had no matching neighbours) — callers
    /// that have no terrain source can still get a total this way.
    /// </param>
    public static (ResourceAmounts ProductionPerHour, ResourceAmounts Capacity) Totals(
        IEnumerable<PlacedBuilding> buildings, Func<HexCoord, Terrain>? terrainAt)
    {
        ArgumentNullException.ThrowIfNull(buildings);

        // A building outside the realm has no function: it neither produces nor boosts nor stores (PlacedBuilding.IsFunctioning).
        var placed = buildings.Where(b => b.Level >= 1 && b.IsFunctioning).ToList();

        // Radius-boost sources standing among these buildings, with their
        // level's percent/range already resolved once rather than per
        // boosted building below.
        var radiusBoosters = placed
            .Where(b => RadiusBoostTargets.ContainsKey(b.Type))
            .Select(b => (b.Coord, b.Type, Percent: RadiusBoostPercent(b.Level), Range: RadiusBoostRange(b.Level)))
            .ToList();

        var production = ResourceAmounts.Zero;
        var capacity = BaseCapacityFor(placed.Any(b => b.Type == BuildingType.BeachCamp));

        foreach (var building in placed)
        {
            var definition = TryGet(building.Type, Math.Min(building.Level, MaxLevelFor(building.Type)));
            if (definition is null)
            {
                continue;
            }

            var radiusBoostPercent = radiusBoosters
                .Where(b => RadiusBoostTargets[b.Type].Contains(building.Type)
                    && b.Coord.DistanceTo(building.Coord) <= b.Range)
                .Sum(b => b.Percent);

            var multiplier = BoostMultiplier(building.Type, building.Coord, terrainAt) * (1.0 + radiusBoostPercent / 100.0);
            production += definition.ProductionPerHour * multiplier;
            capacity += definition.StorageCapacity;
        }

        return (production, capacity);
    }

    /// <summary>
    /// How much a matching neighbour hex is worth, and how high that can add
    /// up, for one <see cref="BuildingType"/>. Adding a future terrain-bound
    /// building to this boost (a hypothetical mine boosted by Mountain, say)
    /// is a one-line data entry, not new code.
    /// </summary>
    public sealed record TerrainBoost(IReadOnlySet<Terrain> Matching, double PerTilePercent, double CapPercent);

    /// <summary>
    /// How many Towers a settlement with a Longhouse at
    /// <paramref name="longhouseLevel"/> may hold: none below LH 3 (where the
    /// Tower unlocks), then <c>1 + max(0, (LH − 5) / 2)</c> with integer
    /// division — 1 for LH 3-6, 2 at LH 7, 3 at LH 9, … 13 at LH 29-30.
    /// Counts standing towers and queued new-tower orders alike, see
    /// <see cref="Settlement.PlanBuild"/>. The tech tree shows only the first
    /// unlock (LH 3); this limit is surfaced where a tower is placed.
    /// </summary>
    public static int MaxTowers(int longhouseLevel) =>
        longhouseLevel < 3 ? 0 : 1 + Math.Max(0, (longhouseLevel - 5) / 2);

    /// <summary>
    /// Percent added to a defending garrison's power for a given Tower level
    /// (issue #40 phase 3), applied by <see cref="Bjarnoy.Domain.Combat.BattleResolver.Resolve"/>.
    /// </summary>
    /// <remarks>
    /// A placeholder balance figure — flat 5% per level, no Tower at all
    /// meaning no bonus — not a tuned number. Revisit alongside a real combat
    /// balancing pass.
    /// </remarks>
    public static double TowerDefenseBonusPercent(int towerLevel) => Math.Max(0, towerLevel) * 5.0;

    /// <summary>The god a shrine <see cref="BuildingType"/> is raised to, or <see langword="null"/> if it is not a shrine.</summary>
    public static GodType? GodOf(BuildingType type) => type switch
    {
        BuildingType.ShrineOfThor => GodType.Thor,
        BuildingType.ShrineOfFreyja => GodType.Freyja,
        BuildingType.ShrineOfUllr => GodType.Ullr,
        BuildingType.ShrineOfNjord => GodType.Njord,
        BuildingType.OdinStatue => GodType.Odin,
        _ => null,
    };

    private static readonly IReadOnlySet<Terrain> Forest = new HashSet<Terrain> { Terrain.Forest };
    private static readonly IReadOnlySet<Terrain> Ridge = new HashSet<Terrain> { Terrain.Mountain };
    private static readonly IReadOnlySet<Terrain> Grass = new HashSet<Terrain> { Terrain.Grass };
    private static readonly IReadOnlySet<Terrain> Sea = new HashSet<Terrain> { Terrain.Sea };
    private static readonly IReadOnlySet<Terrain> Bog = new HashSet<Terrain> { Terrain.Bog };

    /// <summary>Bog and lake hexes: what boosts a bog-ore works (the bog around it, its creeks and lakes) and a lake fishing hut (the lake).</summary>
    private static readonly IReadOnlySet<Terrain> BogOrLake = new HashSet<Terrain> { Terrain.Bog, Terrain.Lake };

    /// <summary>The water a Fishing Hut counts: inland-lake water counts like the sea.</summary>
    private static readonly IReadOnlySet<Terrain> FishingWater = new HashSet<Terrain> { Terrain.Sea, Terrain.Lake, Terrain.InlandLake };

    private static readonly IReadOnlySet<BogTileKind> PlainBogOnly = new HashSet<BogTileKind> { BogTileKind.Bog };
    private static readonly IReadOnlySet<BogTileKind> CreekOnly = new HashSet<BogTileKind> { BogTileKind.Creek };
    private static readonly IReadOnlySet<BogTileKind> HalfShoreOnly = new HashSet<BogTileKind> { BogTileKind.Half };

    /// <summary>Iron per hour a level-1 bog-ore works adds (its increment I1, the level total follows <see cref="ProductionFor"/>) (<c>docs/design/economy.md</c> section 8); the Economy lab numbers are in that page.</summary>
    public const double BogOreWorksIronAtLevelOne = 4;

    /// <summary>
    /// Terrain-bound producers boosted by their matching neighbour terrain.
    /// Deliberately excludes <see cref="BuildingType.Farm"/> and
    /// <see cref="BuildingType.PumpkinFarm"/> — they work a fixed field, not
    /// a resource that concentrates nearby the way trees, ore and fish do.
    /// </summary>
    private static readonly IReadOnlyDictionary<BuildingType, TerrainBoost> Boosts =
        new Dictionary<BuildingType, TerrainBoost>
        {
            [BuildingType.Lumberjack] = new(Forest, PerTilePercent: 0.10, CapPercent: 0.50),
            [BuildingType.Quarry] = new(Ridge, PerTilePercent: 0.10, CapPercent: 0.50),
            // The hut itself already stands on coastal water; more open sea
            // around it (rather than the land it backs onto) is what makes a
            // fishing spot better.
            // A lake Fishing Hut (on a half shore) counts the lake hexes around it the way the coastal one counts sea.
            [BuildingType.FishingHut] = new(FishingWater, PerTilePercent: 0.10, CapPercent: 0.50),
            // The bog around a bog-ore works: any bog hex (moss, shore, creek, spring, mouth) or lake water.
            [BuildingType.BogOreWorks] = new(BogOrLake, PerTilePercent: 0.10, CapPercent: 0.50),
            // Sawmill no longer has an entry here — it produces nothing of
            // its own to boost with terrain any more, see RadiusBoostTargets
            // below for its replacement mechanic (boosting Lumberjack
            // instead of being boosted by Forest).
        };

    /// <summary>
    /// Which building type a radius-boost producer (Sawmill, Crop Mill)
    /// raises the production of, within <see cref="RadiusBoostRange"/> rings
    /// of itself — applied in
    /// <see cref="Totals(IEnumerable{PlacedBuilding}, Func{HexCoord, Terrain}?)"/>.
    /// Crop Mill grinds grain, so it only boosts Farm — PumpkinFarm is a
    /// different crop (see <see cref="BuildingType.PumpkinFarm"/>'s own doc
    /// comment: the Pumpkin-soil-only bonus, not the staple a mill grinds).
    /// </summary>
    private static readonly IReadOnlyDictionary<BuildingType, IReadOnlySet<BuildingType>> RadiusBoostTargets =
        new Dictionary<BuildingType, IReadOnlySet<BuildingType>>
        {
            [BuildingType.Sawmill] = new HashSet<BuildingType> { BuildingType.Lumberjack },
            [BuildingType.CropMill] = new HashSet<BuildingType> { BuildingType.Farm },
            [BuildingType.Hammerschmiede] = new HashSet<BuildingType> { BuildingType.BogOreWorks },
        };

    /// <summary>
    /// Percent a radius-boost building (Sawmill, Crop Mill) at
    /// <paramref name="level"/> adds to each boosted building's own
    /// production within its range — linear from 5% at level 1 to 100% at
    /// level 20 (the mills' maximum level).
    /// </summary>
    public static double RadiusBoostPercent(int level) =>
        5.0 + (Math.Clamp(level, 1, RadiusBoostMaxLevel) - 1) * (95.0 / (RadiusBoostMaxLevel - 1));

    private const int RadiusBoostMaxLevel = 20;

    /// <summary>
    /// How many rings out a radius-boost building's boost reaches at
    /// <paramref name="level"/>: 1 ring at levels 1-4, growing by one ring
    /// every 4 levels after (5 rings at level 17-20) — a flat step per design
    /// ("no curve over range"), not a smoothly growing radius.
    /// </summary>
    public static int RadiusBoostRange(int level) =>
        1 + (Math.Clamp(level, 1, RadiusBoostMaxLevel) - 1) / 4;

    /// <summary>
    /// The production multiplier <paramref name="type"/> earns at
    /// <paramref name="coord"/>: 1.0 (no change) for a building with no
    /// entry in <see cref="Boosts"/>, or for a <see langword="null"/>
    /// <paramref name="terrainAt"/>; otherwise 1.0 plus 10% per direct
    /// neighbour hex (see <see cref="HexCoord.Neighbours"/>) matching the
    /// building's boost terrain, capped at 50% (5 of 6 neighbours) so a
    /// perfect hex is a nice-to-have rather than mandatory.
    /// </summary>
    public static double BoostMultiplier(BuildingType type, HexCoord coord, Func<HexCoord, Terrain>? terrainAt)
    {
        if (terrainAt is null || !Boosts.TryGetValue(type, out var boost))
        {
            return 1.0;
        }

        var matching = coord.Neighbours().Count(neighbour => boost.Matching.Contains(terrainAt(neighbour)));
        return 1.0 + Math.Min(matching * boost.PerTilePercent, boost.CapPercent);
    }

    /// <summary><c>growth^(level−1)</c>: 1 at level 1.</summary>
    private static double Geometric(double growth, int level) => Math.Pow(growth, level - 1);

    /// <summary>Cost multiplier for a level: 1, 1.3, 1.69, …</summary>
    private static double CostFactor(int level, double growth = CostGrowth) => Geometric(growth, level);

    /// <summary>Longhouse cost multiplier: 1.34^(L-1) up to level 10, then 1.34^9 * 1.60^(L-10).</summary>
    private static double LonghouseCostFactor(int level) =>
        level < LonghouseLateCostFromLevel
            ? CostFactor(level, LonghouseCostGrowth)
            : CostFactor(LonghouseLateCostFromLevel - 1, LonghouseCostGrowth) * Math.Pow(LonghouseLateCostGrowth, level - (LonghouseLateCostFromLevel - 1));

    /// <summary>One building's build-time parameters, see <see cref="BuildTimes"/>.</summary>
    /// <param name="TopMinutes">Build time at the building's max level, in minutes.</param>
    /// <param name="LevelOneMinutes">Tech curve only: the level-1 time in minutes; <see langword="null"/> for the early curve.</param>
    private readonly record struct BuildTimeCurve(double TopMinutes, double? LevelOneMinutes = null);

    private static BuildTimeCurve Early(double topHours) => new(topHours * 60);

    private static BuildTimeCurve Tech(double levelOneMinutes, double topHours) => new(topHours * 60, levelOneMinutes);

    /// <summary>
    /// The build-time table, in one place (<c>docs/design/economy.md</c> section 9). Two curve kinds, in minutes, rounded to whole seconds:
    /// <list type="bullet">
    /// <item><b>Early curve</b> (Longhouse, resource producers, Storage House): 1 min at level 1, 8^(1/2) = 2.83 min at level 2, 8 min at
    /// level 3, then doubling (16, 32, 64 min) up to level <see cref="EarlyKneeLevel"/> (6), and from there a log-like tail
    /// (<see cref="Bend"/> with k = <see cref="EarlyTailShape"/>) up to the top-level time at the building's max level.</item>
    /// <item><b>Tech curve</b> (every other building): a level-1 time set by the building's place in the tech tree, then a straight line
    /// to the top-level time at its max level.</item>
    /// </list>
    /// </summary>
    private static readonly IReadOnlyDictionary<BuildingType, BuildTimeCurve> BuildTimes = new Dictionary<BuildingType, BuildTimeCurve>
    {
        [BuildingType.Longhouse] = Early(26),
        [BuildingType.Lumberjack] = Early(20),
        [BuildingType.ReindeerHerder] = Early(20),
        [BuildingType.Quarry] = Early(22),
        [BuildingType.ClayBrickworks] = Early(22),
        [BuildingType.Farm] = Early(22),
        [BuildingType.PumpkinFarm] = Early(22),
        [BuildingType.FishingHut] = Early(22),
        [BuildingType.BogOreWorks] = Early(24),
        [BuildingType.StorageHouse] = Early(20),
        [BuildingType.Tower] = Tech(10, 12),
        [BuildingType.Barracks] = Tech(15, 22),
        [BuildingType.TownSquare] = Tech(20, 22),
        [BuildingType.Palisade] = Tech(10, 1),
        [BuildingType.PalisadeGate] = Tech(10, 1),
        [BuildingType.Bridge] = Tech(30, 3),
        [BuildingType.Harbour] = Tech(30, 24),
        [BuildingType.Shipyard] = Tech(30, 24),
        [BuildingType.ArcheryRange] = Tech(45, 22),
        [BuildingType.CartWorkshop] = Tech(60, 22),
        [BuildingType.Meadery] = Tech(60, 24),
        [BuildingType.DruidHut] = Tech(90, 24),
        [BuildingType.Smithy] = Tech(120, 24),
        [BuildingType.GreatStorehouse] = Tech(120, 30),
        [BuildingType.SiegeWorkshop] = Tech(180, 24),
        [BuildingType.Sawmill] = Tech(240, 24),
        [BuildingType.CropMill] = Tech(240, 24),
        [BuildingType.Hammerschmiede] = Tech(240, 24),
        [BuildingType.ShrineOfThor] = Tech(360, 24),
        [BuildingType.ShrineOfFreyja] = Tech(360, 24),
        [BuildingType.ShrineOfUllr] = Tech(360, 24),
        [BuildingType.ShrineOfNjord] = Tech(360, 24),
        [BuildingType.OdinStatue] = Tech(360, 24),
    };

    /// <summary>The level where the early curve's doubling ends and its log-like tail starts.</summary>
    private const int EarlyKneeLevel = 6;

    /// <summary>The early curve's tail shape (<see cref="Bend"/> k).</summary>
    private const double EarlyTailShape = 3;

    /// <summary>
    /// Maps u in [0, 1] to [0, 1]: k &gt; 0 bends it like a log (fast first, flat at the top), k &lt; 0 like an exponential,
    /// k = 0 is the straight line.
    /// </summary>
    public static double Bend(double u, double k)
    {
        if (Math.Abs(k) < 1e-6)
        {
            return u;
        }

        return k > 0
            ? Math.Log(1 + k * u) / Math.Log(1 + k)
            : (Math.Exp(-k * u) - 1) / (Math.Exp(-k) - 1);
    }

    /// <summary>Build time of <paramref name="type"/> at <paramref name="level"/> (see <see cref="BuildTimes"/>), rounded to whole seconds.</summary>
    public static TimeSpan BuildTime(BuildingType type, int level)
    {
        var curve = BuildTimes[type];
        var max = MaxLevelFor(type);
        double minutes;
        if (curve.LevelOneMinutes is { } levelOne)
        {
            var u = max <= 1 ? 0.0 : (level - 1.0) / (max - 1);
            minutes = levelOne + (curve.TopMinutes - levelOne) * Bend(u, 0);
        }
        else if (level <= 3)
        {
            minutes = Math.Pow(8, (level - 1) / 2.0);
        }
        else if (level <= EarlyKneeLevel)
        {
            minutes = 8 * Math.Pow(2, level - 3);
        }
        else
        {
            var kneeMinutes = 8 * Math.Pow(2, EarlyKneeLevel - 3);
            minutes = kneeMinutes + (curve.TopMinutes - kneeMinutes) * Bend((level - EarlyKneeLevel) / (double)(max - EarlyKneeLevel), EarlyTailShape);
        }

        return TimeSpan.FromSeconds(Math.Round(minutes * 60.0, MidpointRounding.AwayFromZero));
    }

    /// <summary>
    /// A level's total production, increment-geometric: level L adds
    /// <paramref name="incrementAtLevelOne"/> · 1.20^(L−1) on top of the levels below it, so the total is
    /// <c>I1 · (1.20^L − 1) / 0.20</c> (the shape of <see cref="GeometricCapacity"/>). It is the level's <em>total</em> —
    /// <see cref="Totals(IEnumerable{(BuildingType Type, int Level)})"/> reads
    /// the current level's definition only.
    /// </summary>
    private static ResourceAmounts ProductionFor(ResourceAmounts incrementAtLevelOne, int level) =>
        incrementAtLevelOne * ((Math.Pow(ProductionGrowth, level) - 1) / (ProductionGrowth - 1));

    /// <summary>The levels (1 to this) at which the start buildings — Longhouse, Tower, Lumberjack, Reindeer Herder — cost no stone.</summary>
    private const int StartBrickFreeLevels = 5;

    /// <summary>
    /// A building cost rounded the way a player reads it, per resource: below 100 to a whole number, 100 to 999 to the nearest 10,
    /// and from four digits on to <c>5 · 10^(digits − 3)</c> (1,000 to 9,999 to 50, 10,000 to 99,999 to 500, ...).
    /// </summary>
    public static double NiceRound(double value)
    {
        if (value < 100)
        {
            return Math.Round(value, MidpointRounding.AwayFromZero);
        }

        var digits = (int)Math.Floor(Math.Log10(value)) + 1;
        var step = digits == 3 ? 10.0 : 5.0 * Math.Pow(10, digits - 3);
        return Math.Round(value / step, MidpointRounding.AwayFromZero) * step;
    }

    /// <summary><see cref="NiceRound(double)"/> of every resource of a cost.</summary>
    public static ResourceAmounts NiceRound(ResourceAmounts cost) =>
        new(NiceRound(cost.Wood), NiceRound(cost.Stone), NiceRound(cost.Food), NiceRound(cost.Iron));

    // Level-1 costs are per building (wood / stone / food, never iron). The late buildings' growth per level is chosen so the
    // building's top level costs about 40% (the shrines and Druid Hut 50%, the Great Storehouse is set by what a settlement can store) of a Longhouse 30, and its level 1 is about a quarter of the
    // Longhouse upgrade at the level it unlocks at.

    /// <summary>Total capacity of a geometric storage building: <c>c1 · (g^L − 1) / (g − 1)</c> per resource.</summary>
    private static ResourceAmounts GeometricCapacity(double c1, double growth, int level) =>
        ResourceAmounts.Uniform(c1 * (Math.Pow(growth, level) - 1) / (growth - 1));

    private static BuildingDefinition Producer(
        BuildingType type,
        int level,
        IReadOnlySet<Terrain> terrain,
        ResourceAmounts perHourAtLevelOne,
        ResourceAmounts costAtLevelOne,
        int brickFreeLevels = 0,
        double growth = CostGrowth) => new()
        {
            Type = type,
            Level = level,
            Cost = BrickFree(costAtLevelOne * CostFactor(level, growth) * ProducerEarlyDiscount(type, level), level, brickFreeLevels),
            BuildDuration = BuildTime(type, level),
            // Increment-geometric in level (each level adds x1.20 more than the last), the level's total.
            ProductionPerHour = ProductionFor(perHourAtLevelOne, level),
            AllowedTerrain = terrain,
        };

    /// <summary>
    /// The first three levels of a resource producer (<see cref="StorageCappedProducers"/>) cost 60%, 75% and 90% of the
    /// formula cost (applied before rounding); later levels and the late buildings pay the full formula.
    /// </summary>
    private static double ProducerEarlyDiscount(BuildingType type, int level) =>
        StorageCappedProducers.Contains(type)
            ? level switch { 1 => 0.6, 2 => 0.75, 3 => 0.9, _ => 1.0 }
            : 1.0;

    /// <summary>The cost without its stone while <paramref name="level"/> is within <paramref name="brickFreeLevels"/>.</summary>
    private static ResourceAmounts BrickFree(ResourceAmounts cost, int level, int brickFreeLevels) =>
        level <= brickFreeLevels ? cost with { Stone = 0 } : cost;

    private static BuildingDefinition Longhouse(int level) => new()
    {
        Type = BuildingType.Longhouse,
        Level = level,
        Cost = BrickFree(new ResourceAmounts(Wood: 120, Stone: 100, Food: 60, Iron: 0) * LonghouseCostFactor(level), level, StartBrickFreeLevels),
        BuildDuration = BuildTime(BuildingType.Longhouse, level),
        // The anchor feeds its own settlement a little, so a new holding is
        // never completely stalled. Linear in level (unlike every other
        // producer): +15 wood and +15 food per level, no stone and no iron.
        ProductionPerHour = new ResourceAmounts(Wood: 15, Stone: 0, Food: 15, Iron: 0) * level,
        StorageCapacity = ResourceAmounts.Uniform(250) * level,
        // Grass, or the shore sand a settlement founded from the sea stands on (docs/design/skirmish/realm-takeover.md): the
        // upgrade re-checks the hex, so a sand-founded Longhouse could not be levelled while this was grass only. The
        // Longhouse is never placed anew (PlanBuild refuses a second one), so this only keeps the founded one upgradable.
        AllowedTerrain = new HashSet<Terrain> { Terrain.Grass, Terrain.Sand },
        // The settlement's own centre-disc claim radius at this longhouse
        // level — see Settlement.ClaimRadius, which reads this back. The
        // Longhouse only grows the realm until towers are available: 2 at
        // level 1, 3 from level 2 on, and it stops there (the first Tower
        // unlocks at LH 3; from then on territory grows through towers, see
        // MaxTowers and docs/design/economy.md section 5).
        ClaimRadius = level == 1 ? 2 : 3,
        // A longhouse upgrade is the settlement's biggest single commitment —
        // it consumes 90 % (rounded down) of the construction slots the
        // settlement currently has, leaving the rest for other construction.
        OccupiesMostSlots = true,
    };

    /// <summary>
    /// A beach camp: one level, no production, a flat <see cref="BeachCampStorage"/> of each resource and no claim beyond its own
    /// hex (<see cref="BuildingDefinition.ClaimRadius"/> 0). Placed by a camp builder, never through the build ring.
    /// </summary>
    private static BuildingDefinition BeachCamp(int level) => new()
    {
        Type = BuildingType.BeachCamp,
        Level = level,
        Cost = ResourceAmounts.Zero,
        BuildDuration = TimeSpan.Zero,
        ProductionPerHour = ResourceAmounts.Zero,
        StorageCapacity = ResourceAmounts.Uniform(BeachCampStorage),
        AllowedTerrain = new HashSet<Terrain> { Terrain.Sand },
        ClaimRadius = 0,
    };

    private static BuildingDefinition StorageHouse(int level) => new()
    {
        Type = BuildingType.StorageHouse,
        Level = level,
        Cost = new ResourceAmounts(Wood: 90, Stone: 50, Food: 0, Iron: 0) * CostFactor(level, StorageHouseCostGrowth),
        BuildDuration = BuildTime(BuildingType.StorageHouse, level),
        // Total at this level: 300 * (1.22^L - 1) / 0.22 per resource.
        StorageCapacity = GeometricCapacity(300, 1.22, level),
        AllowedTerrain = Grass,
    };

    private static BuildingDefinition Tower(int level) => new()
    {
        Type = BuildingType.Tower,
        Level = level,
        Cost = BrickFree(new ResourceAmounts(Wood: 140, Stone: 200, Food: 30, Iron: 0) * CostFactor(level), level, StartBrickFreeLevels),
        BuildDuration = BuildTime(BuildingType.Tower, level),
        // Stands on grass, sand, forest or plain bog moss (the palisade's rule); the tower replaces the tile under it.
        AllowedTerrain = new HashSet<Terrain> { Terrain.Grass, Terrain.Sand, Terrain.Forest },
        AlsoOnBogKinds = PlainBogOnly,
        // Unlocks at LH 3, later than the first producers on purpose: a tower
        // extends the realm, so opening it at the very first longhouse level
        // made expansion the obvious first move rather than a decision. It is
        // also the entry point to the military line — Barracks needs a
        // level-3 Tower before it can go up (see PrerequisiteTable). How many
        // towers a settlement may hold follows its Longhouse level, see
        // MaxTowers.
        // This tower's own satellite-disc claim radius, centred on the tower
        // rather than the settlement — see Settlement.ClaimDiscsFor, which
        // reads this back for every standing Tower. One hex of reach per
        // tower level, starting at level 1 (see Settlement.TowerClaimRadius's
        // remarks for why there is still no separate "+1" floor).
        ClaimRadius = level,
    };

    // Same shape as the land Producers, but gated by RequiresCoastalWater
    // instead of AllowedTerrain — the hex under it stays Terrain.Sea.
    private static BuildingDefinition FishingHut(int level) => new()
    {
        Type = BuildingType.FishingHut,
        Level = level,
        Cost = new ResourceAmounts(Wood: 49, Stone: 39, Food: 7, Iron: 0) * CostFactor(level) * ProducerEarlyDiscount(BuildingType.FishingHut, level),
        BuildDuration = BuildTime(BuildingType.FishingHut, level),
        ProductionPerHour = ProductionFor(new ResourceAmounts(0, 0, Food: 16, 0), level),
        RequiresCoastalWater = true,
        // Also on a lake's half shore (three water edges), drawn with the lake art.
        LakeShoreKinds = HalfShoreOnly,
        // And on an inland lake that borders land.
        AlsoOnInlandLakeShore = true,
    };

    /// <summary>
    /// A river building may only stand where its art matches the hex's river
    /// art: Sawmill on Straight/the gentler 60°-off Bend/the tight 60°
    /// Bend60, Crop Mill on Straight only. River art variants
    /// (bend180_island/meander, bend120_island/meander) count as their base
    /// shape; bend60_loop does not allow a Sawmill — see
    /// <see cref="SawmillExcludedRiverVariants"/>. See
    /// <see cref="BuildingDefinition.RequiresRiverShape"/>/
    /// <see cref="BuildingDefinition.ExcludedRiverVariants"/> and the
    /// frontend's <c>placementRules.ts</c> (served as <c>requiresRiverShapes</c>)/
    /// <c>riverBuildingAllowedHere</c>, which mirror this same rule for the
    /// placement UI.
    /// </summary>
    private static readonly IReadOnlySet<RiverTileShape> SawmillRiverShapes =
        new HashSet<RiverTileShape> { RiverTileShape.Straight, RiverTileShape.Bend, RiverTileShape.Bend60 };

    /// <summary>
    /// The Sawmill's waterwheel reads from the bank of a plain Bend60
    /// hairpin — the vendor art has no composite for
    /// <see cref="RiverVariant.Loop"/>'s full-half-circle channel, so a
    /// Bend60 hex showing that variant is refused even though
    /// <see cref="RiverTileShape.Bend60"/> itself is in
    /// <see cref="SawmillRiverShapes"/>. Straight/Bend's own variants
    /// (Meander/Island) have a matching Sawmill composite at every one of
    /// their shape's own orientations, so only Loop is excluded here.
    /// </summary>
    private static readonly IReadOnlySet<RiverVariant> SawmillExcludedRiverVariants =
        new HashSet<RiverVariant> { RiverVariant.Loop };

    /// <summary>
    /// Unlike the Sawmill, the Crop Mill's vendor art only has a Straight-
    /// river composite — its waterwheel stands directly in the current. See
    /// <see cref="SawmillRiverShapes"/>'s doc comment for the general rule.
    /// </summary>
    private static readonly IReadOnlySet<RiverTileShape> CropMillRiverShapes =
        new HashSet<RiverTileShape> { RiverTileShape.Straight };

    /// <summary>
    /// A shrine contributes no flat production or storage of its own — its
    /// favour (<see cref="ShrineCatalogue.Favour"/>) is a percentage bonus,
    /// folded into <see cref="Settlement.CurrentTotals"/> instead of summed
    /// here alongside the additive totals. Grass-only, like Farm/PumpkinFarm —
    /// except the Shrine of Ullr, the god of the hunt, which stands in the
    /// forest (a grove shrine), and the Shrine of Njörd, whose art is a shrine on a skerry standing
    /// in the shallows: it is built directly on a coastal-water hex
    /// (<see cref="BuildingDefinition.RequiresCoastalWater"/>, the hex under it
    /// stays plain <see cref="World.Terrain.Sea"/>) like FishingHut/Harbour
    /// and has no <see cref="BuildingDefinition.AllowedTerrain"/>. Every shrine
    /// unlocks at LH 25, each behind its own feeder building (see
    /// PrerequisiteTable), and has 5 levels.
    /// </summary>
    private static BuildingDefinition Shrine(BuildingType type, int level) => new()
    {
        Type = type,
        Level = level,
        Cost = new ResourceAmounts(Wood: 475000, Stone: 505000, Food: 150000, Iron: 0) * CostFactor(level, ShrineCostGrowth),
        BuildDuration = BuildTime(type, level),
        AllowedTerrain = type switch
        {
            BuildingType.ShrineOfNjord => new HashSet<Terrain>(),
            BuildingType.ShrineOfUllr => Forest,
            _ => Grass,
        },
        RequiresCoastalWater = type == BuildingType.ShrineOfNjord,
    };

    /// <summary>
    /// One hex of the wall (<c>docs/design/economy.md</c> section 5), the same definition for the plain palisade and the gate:
    /// 540 wood, 150 stone and 40 food at level 1, then the standard cost growth (x1.30 per level), three levels; build time on the tech curve (<see cref="BuildTimes"/>). It stands
    /// on grass, forest, sand or plain bog moss, or as the wall's sea end on a coastal-water hex (<see cref="BuildingDefinition.AlsoOnCoastalWater"/>;
    /// the gate is refused there by <see cref="Palisades.PalisadeRules"/>). Unlocks at LH 7 behind a level-5 Tower; no production,
    /// storage or claim of its own.
    /// </summary>
    // TODO(docs/design/economy.md section 5): fire takes a level off a wall hex at a time until it is gone; nothing burns walls yet.
    private static BuildingDefinition PalisadeHex(BuildingType type, int level) => new()
    {
        Type = type,
        Level = level,
        Cost = new ResourceAmounts(Wood: 540, Stone: 150, Food: 40, Iron: 0) * CostFactor(level),
        BuildDuration = BuildTime(type, level),
        AllowedTerrain = new HashSet<Terrain> { Terrain.Grass, Terrain.Forest, Terrain.Sand },
        // Only the plain palisade is the wall's sea end; a gate never is (Palisades.PalisadeRules), so it is not offered on the water.
        AlsoOnCoastalWater = type == BuildingType.Palisade,
        AlsoOnBogKinds = PlainBogOnly,
    };

    /// <summary>
    /// Wood, stone, food and iron of each bridge level, spelled out per level (no cost growth): wood-heavy, stone from
    /// level 3, no iron (<c>docs/design/economy.md</c> section 5).
    /// </summary>
    private static readonly ResourceAmounts[] BridgeCosts =
    [
        new ResourceAmounts(Wood: 120, Stone: 0, Food: 20, Iron: 0),
        new ResourceAmounts(Wood: 220, Stone: 0, Food: 30, Iron: 0),
        new ResourceAmounts(Wood: 380, Stone: 160, Food: 40, Iron: 0),
        new ResourceAmounts(Wood: 660, Stone: 340, Food: 60, Iron: 0),
    ];

    /// <summary>
    /// The bridge over a wide river hex (<c>docs/design/economy.md</c> section 5): it stands on the river tile itself (grass, forest or
    /// sand under it), on a Straight, Bend or Bend60 tile only (<see cref="BuildingDefinition.RequiresRiverShape"/>; any river art
    /// variant, the bridge swaps it for the plain channel). <see cref="Settlement.PlanBuild"/> additionally requires the tile to be a wide
    /// river and the island not wasted. Unlocks at LH 7 behind a level-1 Town Square; no production, storage or claim of its own.
    /// </summary>
    private static BuildingDefinition BridgeHex(int level) => new()
    {
        Type = BuildingType.Bridge,
        Level = level,
        Cost = BridgeCosts[level - 1],
        BuildDuration = BuildTime(BuildingType.Bridge, level),
        AllowedTerrain = new HashSet<Terrain> { Terrain.Grass, Terrain.Forest, Terrain.Sand },
        RequiresRiverShape = SawmillRiverShapes,
    };

    /// <summary>
    /// A late-game storage tier (LH 15, 10 levels) behind a level-15
    /// <see cref="BuildingType.StorageHouse"/> (see
    /// <see cref="Settlement.PlanBuild"/>'s
    /// <see cref="BuildingDefinition.Prerequisites"/> check). Like every other
    /// building, that prerequisite gates level 1 only.
    /// </summary>
    private static BuildingDefinition GreatStorehouse(int level) => new()
    {
        Type = BuildingType.GreatStorehouse,
        Level = level,
        Cost = new ResourceAmounts(Wood: 4500, Stone: 3000, Food: 0, Iron: 0) * CostFactor(level, GreatStorehouseCostGrowth),
        BuildDuration = BuildTime(BuildingType.GreatStorehouse, level),
        // Total at this level: 50000 * (1.25^L - 1) / 0.25 per resource.
        StorageCapacity = GeometricCapacity(50000, 1.25, level),
        AllowedTerrain = Grass,
    };

    /// <summary>
    /// Trains the archer/siege slice of the land roster — Bowman, Catapult —
    /// in place of the Longhouse (see
    /// <see cref="Units.UnitDefinition.RequiredBuildingType"/>);
    /// <see cref="Barracks"/> trains the basic melee slice instead. No
    /// production or storage of its own, and — unlike <see cref="Tower"/> —
    /// no combat bonus; that is explicitly deferred.
    /// </summary>
    private static BuildingDefinition ArcheryRange(int level) => new()
    {
        Type = BuildingType.ArcheryRange,
        Level = level,
        Cost = new ResourceAmounts(Wood: 470, Stone: 200, Food: 58, Iron: 0) * CostFactor(level),
        BuildDuration = BuildTime(BuildingType.ArcheryRange, level),
        AllowedTerrain = Grass,
        // The deepest tier of the early military line (Tower -> Barracks ->
        // Archery Range), behind a level-5 Barracks.
    };

    /// <summary>
    /// Trains the siege engines, catapult and battering ram (<see cref="Units.UnitDefinition.RequiredBuildingType"/>); the ram is the only engine that
    /// breaches walls (<c>docs/design/economy.md</c> section 5). Twenty levels, no production, storage or combat bonus of its own. The tunable defaults
    /// mirror <see cref="ArcheryRange"/> one tier up: wood and stone costs about 1.6 times higher (buildings cost no iron), a slightly longer build.
    /// </summary>
    private static BuildingDefinition SiegeWorkshop(int level) => new()
    {
        Type = BuildingType.SiegeWorkshop,
        Level = level,
        Cost = new ResourceAmounts(Wood: 26500, Stone: 13000, Food: 2200, Iron: 0) * CostFactor(level, 1.379),
        BuildDuration = BuildTime(BuildingType.SiegeWorkshop, level),
        AllowedTerrain = Grass,
    };

    // Same shape as FishingHut: RequiresCoastalWater rather than
    // AllowedTerrain, the hex under it stays Terrain.Sea. No production or
    // storage of its own — it trains the ship roster in place of the
    // Longhouse (see Units.UnitDefinition.RequiredBuildingType).
    //
    // When the settlement centre is inland, fleets depart from and return to
    // the Harbour's hex (see Army.FleetAnchor).
    private static BuildingDefinition Harbour(int level) => new()
    {
        Type = BuildingType.Harbour,
        Level = level,
        Cost = new ResourceAmounts(Wood: 410, Stone: 99, Food: 33, Iron: 0) * CostFactor(level),
        BuildDuration = BuildTime(BuildingType.Harbour, level),
        RequiresCoastalWater = true,
    };

    // The Shipyard: the second half of the old Dockyard (docs/design/units-and-ships.md §1). Stands in coastal water like the Harbour, costs and builds like it (economy.md),
    // trains the warships and the fire craft, and is a garrison spot for every ship.
    private static BuildingDefinition Shipyard(int level) => new()
    {
        Type = BuildingType.Shipyard,
        Level = level,
        Cost = new ResourceAmounts(Wood: 410, Stone: 99, Food: 33, Iron: 0) * CostFactor(level),
        BuildDuration = BuildTime(BuildingType.Shipyard, level),
        RequiresCoastalWater = true,
    };

    /// <summary>
    /// Trains the basic melee slice of the land roster — Spearman, Axeman,
    /// Berserker — in place of the Longhouse (see
    /// <see cref="Units.UnitDefinition.RequiredBuildingType"/>);
    /// <see cref="ArcheryRange"/> keeps the archer/siege slice. Otherwise a
    /// garrison building with no production/storage of its own and no combat
    /// bonus (deferred). Buildable/leveling like <see cref="Tower"/> and
    /// <see cref="ArcheryRange"/>, same terrain and cost tier.
    /// </summary>
    private static BuildingDefinition Barracks(int level) => new()
    {
        Type = BuildingType.Barracks,
        Level = level,
        Cost = new ResourceAmounts(Wood: 100, Stone: 78, Food: 43, Iron: 0) * CostFactor(level),
        BuildDuration = BuildTime(BuildingType.Barracks, level),
        AllowedTerrain = Grass,
        // The middle rung of the military line: needs a level-3 Tower
        // standing first (see PrerequisiteTable) and gates Archery Range in
        // turn, so raising an army is a mid-game commitment rather than
        // something a settlement can start with.
    };

    /// <summary>
    /// No production or storage yet — a civic building that will later
    /// become a prerequisite or grant a boost (a settler-cap increase is the
    /// leading idea), buildable now so it has a place in the tech tree
    /// ahead of that mechanic landing.
    /// </summary>
    private static BuildingDefinition TownSquare(int level) => new()
    {
        Type = BuildingType.TownSquare,
        Level = level,
        Cost = new ResourceAmounts(Wood: 120, Stone: 130, Food: 44, Iron: 0) * CostFactor(level),
        BuildDuration = BuildTime(BuildingType.TownSquare, level),
        AllowedTerrain = Grass,
    };

    /// <summary>
    /// No production or storage yet — its ring of runestones is meant for a
    /// future favour/rune mechanic (see <see cref="BuildingType.ShrineOfThor"/>'s
    /// "slotted runes" reference), buildable now so it has a place in the
    /// tech tree ahead of that mechanic landing.
    /// </summary>
    private static BuildingDefinition DruidHut(int level) => new()
    {
        Type = BuildingType.DruidHut,
        Level = level,
        Cost = new ResourceAmounts(Wood: 1050, Stone: 640, Food: 780, Iron: 0) * CostFactor(level, 1.619),
        BuildDuration = BuildTime(BuildingType.DruidHut, level),
        // A sacred grove: the druid hut stands in the forest, not on grass.
        AllowedTerrain = Forest,
    };

    /// <summary>
    /// Trains the civilian Provisioner/Settler half of the roster in
    /// place of the Longhouse (see
    /// <see cref="Units.UnitDefinition.RequiredBuildingType"/>) — the basic
    /// melee/archer/ship split's shape, applied to the civilian line.
    /// Purely a training gate, no storage of its own — a settlement's yard
    /// isn't where resources are kept. Behind a standing
    /// <see cref="BuildingType.TownSquare"/> (see <see cref="PrerequisiteTable"/>).
    /// </summary>
    private static BuildingDefinition CartWorkshop(int level) => new()
    {
        Type = BuildingType.CartWorkshop,
        Level = level,
        Cost = new ResourceAmounts(Wood: 680, Stone: 230, Food: 75, Iron: 0) * CostFactor(level),
        BuildDuration = BuildTime(BuildingType.CartWorkshop, level),
        AllowedTerrain = Grass,
    };
}
