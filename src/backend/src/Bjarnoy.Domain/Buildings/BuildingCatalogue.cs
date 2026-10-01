using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Shrines;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>
/// The tech tree, as data.
/// </summary>
/// <remarks>
/// Cost, production and build time are all geometric in the level (the
/// Travian shape): cost ×1.30 per level (Longhouse ×1.34), production ×1.20,
/// build time ×1.33 (the Longhouse starts at 1.5 min, so level 2 takes about 2). Because cost outgrows output, a
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

    private const double LonghouseCostGrowth = 1.34;

    /// <summary>Production multiplier per level.</summary>
    private const double ProductionGrowth = 1.20;

    private const double BuildTimeGrowth = 1.33;

    /// <summary>
    /// The highest level <paramref name="type"/> can be built to
    /// (<c>docs/design/economy.md</c> §4): Longhouse 30; resource producers and
    /// Storage House 25; military/civic buildings and the mills 20; Tower and
    /// Great Storehouse 10; shrines 5. Unknown/removed types return 0.
    /// </summary>
    public static int MaxLevelFor(BuildingType type) => type switch
    {
        BuildingType.Longhouse => 30,
        BuildingType.Lumberjack or BuildingType.Quarry or BuildingType.ClayBrickworks
            or BuildingType.Farm or BuildingType.PumpkinFarm or BuildingType.FishingHut
            or BuildingType.StorageHouse => 25,
        BuildingType.Barracks or BuildingType.ArcheryRange or BuildingType.Dockyard
            or BuildingType.TownSquare or BuildingType.CartWorkshop or BuildingType.DruidHut
            or BuildingType.Smithy or BuildingType.Meadery or BuildingType.Sawmill
            or BuildingType.CropMill => 20,
        BuildingType.Tower or BuildingType.GreatStorehouse => 10,
        BuildingType.ShrineOfThor or BuildingType.ShrineOfFreyja
            or BuildingType.ShrineOfUllr or BuildingType.ShrineOfNjord => 5,
        _ => 0,
    };

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
    /// Longhouse's trickle covers the rest until lake ore. Computed on access
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
    /// Farm stays at LH 1 for now: the Reindeer Herder that replaces it as the
    /// starting food building arrives in a later change, which moves Farm to
    /// LH 4. Pumpkin Farm is at LH 4 already and stays soil-gated (see
    /// <see cref="Settlement.PlanBuild"/>'s islandSoil parameter).
    /// </para>
    /// </remarks>
    private static readonly IReadOnlyDictionary<BuildingType, int> UnlockLevels =
        new Dictionary<BuildingType, int>
        {
            [BuildingType.Lumberjack] = 1,
            [BuildingType.Quarry] = 1,
            [BuildingType.ClayBrickworks] = 1,
            [BuildingType.StorageHouse] = 1,
            [BuildingType.Farm] = 1,
            [BuildingType.FishingHut] = 2,
            [BuildingType.Tower] = 3,
            [BuildingType.PumpkinFarm] = 4,
            [BuildingType.Barracks] = 5,
            [BuildingType.TownSquare] = 6,
            [BuildingType.Dockyard] = 8,
            [BuildingType.ArcheryRange] = 9,
            [BuildingType.CartWorkshop] = 10,
            [BuildingType.Meadery] = 11,
            [BuildingType.DruidHut] = 12,
            [BuildingType.Smithy] = 15,
            [BuildingType.GreatStorehouse] = 15,
            [BuildingType.Sawmill] = 20,
            [BuildingType.CropMill] = 20,
            [BuildingType.ShrineOfUllr] = 25,
            [BuildingType.ShrineOfFreyja] = 25,
            [BuildingType.ShrineOfNjord] = 25,
            [BuildingType.ShrineOfThor] = 25,
        };

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
        BuildingType.Farm,
        BuildingType.PumpkinFarm,
        BuildingType.FishingHut,
    };

    /// <summary>
    /// A settlement may only place an additional storage house once one
    /// already stands at this level.
    /// </summary>
    public const int AdditionalStorageHouseLevel = 10;

    /// <summary>
    /// The Longhouse level needed to build <paramref name="type"/> at
    /// <paramref name="level"/>: <c>max(UnlockLevel(type), level)</c> — a
    /// building's level can never exceed the Longhouse's — except for the
    /// <see cref="StorageCappedProducers"/>, which only need their unlock
    /// level at every level (storage caps them instead). The Longhouse
    /// itself only ever needs level 1 (it is upgraded by having a standing
    /// Longhouse, not by a higher one).
    /// </summary>
    public static int RequiredLonghouseLevelFor(BuildingType type, int level) =>
        type == BuildingType.Longhouse ? 1
        : StorageCappedProducers.Contains(type) ? UnlockLevel(type)
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
    /// the military; Fishing Hut → Dockyard → Shrine of Njörd for the water;
    /// Lumberjack → Sawmill → Shrine of Ullr and Farm → Meadery / Crop Mill →
    /// Shrine of Freyja for the land; Town Square → Cart Workshop / Druid Hut
    /// for the civic line; Storage House → Great Storehouse for storage. See
    /// <c>docs/design/economy.md</c> §5.
    /// </para>
    /// <para>
    /// Storage House, Quarry, Clay Brickworks, Lumberjack, Tower, Town Square
    /// and Pumpkin Farm gate nothing on their own way in (Pumpkin Farm stays
    /// soil-gated only): Quarry needs a Mountain hex, and
    /// <see cref="World.WorldGenerator"/> does not guarantee one within reach
    /// of a starting position — anything behind a Quarry would be unreachable
    /// for an unlucky map roll rather than merely expensive.
    /// </para>
    /// </remarks>
    private static readonly IReadOnlyDictionary<BuildingType, IReadOnlyList<BuildingPrerequisite>> PrerequisiteTable =
        new Dictionary<BuildingType, IReadOnlyList<BuildingPrerequisite>>
        {
            [BuildingType.Barracks] = [new(BuildingType.Tower, 3)],
            [BuildingType.Dockyard] = [new(BuildingType.FishingHut, 5)],
            [BuildingType.ArcheryRange] = [new(BuildingType.Barracks, 5)],
            [BuildingType.CartWorkshop] = [new(BuildingType.TownSquare, 3)],
            [BuildingType.Meadery] = [new(BuildingType.Farm, 5)],
            [BuildingType.DruidHut] = [new(BuildingType.TownSquare, 5)],
            [BuildingType.Smithy] = [new(BuildingType.Barracks, 10)],
            [BuildingType.GreatStorehouse] = [new(BuildingType.StorageHouse, 15)],
            [BuildingType.Sawmill] = [new(BuildingType.Lumberjack, 10)],
            [BuildingType.CropMill] = [new(BuildingType.Farm, 10)],
            [BuildingType.ShrineOfUllr] = [new(BuildingType.Sawmill, 5)],
            [BuildingType.ShrineOfFreyja] = [new(BuildingType.CropMill, 5)],
            [BuildingType.ShrineOfNjord] = [new(BuildingType.Dockyard, 10)],
            [BuildingType.ShrineOfThor] = [new(BuildingType.Smithy, 5)],
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
            BuildingType.Lumberjack => Producer(type, level, Forest, new ResourceAmounts(Wood: 40, 0, 0, 0)),
            BuildingType.Quarry => Producer(type, level, Ridge, new ResourceAmounts(0, Stone: 40, 0, 0)),
            // Farm is the settlement's always-available staple, buildable on
            // any island regardless of soil. It stays at LH 1 until the
            // Reindeer Herder replaces it as the starting food building (a
            // later change moves Farm to LH 4).
            BuildingType.Farm => Producer(type, level, Grass, new ResourceAmounts(0, 0, Food: 40, 0)),
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
            BuildingType.PumpkinFarm => Producer(type, level, Grass, new ResourceAmounts(0, 0, Food: 44, 0)),
            BuildingType.ShrineOfThor => Shrine(type, level),
            BuildingType.ShrineOfFreyja => Shrine(type, level),
            BuildingType.ShrineOfUllr => Shrine(type, level),
            BuildingType.ShrineOfNjord => Shrine(type, level),
            BuildingType.GreatStorehouse => GreatStorehouse(level),
            BuildingType.ArcheryRange => ArcheryRange(level),
            BuildingType.Dockyard => Dockyard(level),
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
                Producer(type, level, Grass, ResourceAmounts.Zero, SmallBuildingCost, 4)
                    with
                    {
                        RequiresRiverShape = SawmillRiverShapes,
                        ExcludedRiverVariants = SawmillExcludedRiverVariants,
                    },
            // No production of its own yet — its mead is meant for a future
            // morale-boost mechanic, buildable now so it has a place in the
            // tech tree ahead of that mechanic landing.
            BuildingType.Meadery => Producer(type, level, Grass, ResourceAmounts.Zero, SmallBuildingCost, 4),
            BuildingType.TownSquare => TownSquare(level),
            // Same shape as Sawmill: behind a level-10 Farm at LH 20.
            //
            // No Food of its own, same reasoning as Sawmill above — boosts
            // every Farm within range instead. Not PumpkinFarm: a mill
            // grinds grain, and PumpkinFarm is a different crop (see
            // RadiusBoostTargets).
            BuildingType.CropMill =>
                Producer(type, level, Grass, ResourceAmounts.Zero, SmallBuildingCost, 4)
                    with { RequiresRiverShape = CropMillRiverShapes },
            // The Weaponsmith (display name; the type stays Smithy). No
            // production of its own — a troop-upgrade building only (costs and
            // effects not yet designed); the military line's capstone and the
            // feeder of the Shrine of Thor.
            BuildingType.Smithy =>
                Producer(type, level, SandOrGrass, ResourceAmounts.Zero, SmallBuildingCost, 4),
            BuildingType.DruidHut => DruidHut(level),
            BuildingType.CartWorkshop => CartWorkshop(level),
            BuildingType.ClayBrickworks => Producer(type, level, Grass, new ResourceAmounts(0, Stone: 36, 0, 0)),
            _ => null,
        };

        // Attached here rather than in each helper so the tech tree's shape
        // (unlock ladder + prerequisites) lives in exactly one place, and every
        // building goes through the same rule for which of its levels the
        // prerequisites gate.
        return definition is null
            ? null
            : definition with
            {
                Prerequisites = PrerequisitesFor(type, level),
                RequiredLonghouseLevel = RequiredLonghouseLevelFor(type, level),
            };
    }

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

        var production = ResourceAmounts.Zero;
        var capacity = BaseStorageCapacity;

        foreach (var (type, level) in buildings)
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

        var placed = buildings.Where(b => b.Level >= 1).ToList();

        // Radius-boost sources standing among these buildings, with their
        // level's percent/range already resolved once rather than per
        // boosted building below.
        var radiusBoosters = placed
            .Where(b => RadiusBoostTargets.ContainsKey(b.Type))
            .Select(b => (b.Coord, b.Type, Percent: RadiusBoostPercent(b.Level), Range: RadiusBoostRange(b.Level)))
            .ToList();

        var production = ResourceAmounts.Zero;
        var capacity = BaseStorageCapacity;

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
        _ => null,
    };

    private static readonly IReadOnlySet<Terrain> Forest = new HashSet<Terrain> { Terrain.Forest };
    private static readonly IReadOnlySet<Terrain> Ridge = new HashSet<Terrain> { Terrain.Mountain };
    private static readonly IReadOnlySet<Terrain> Grass = new HashSet<Terrain> { Terrain.Grass };
    private static readonly IReadOnlySet<Terrain> SandOrGrass = new HashSet<Terrain> { Terrain.Sand, Terrain.Grass };
    private static readonly IReadOnlySet<Terrain> Sea = new HashSet<Terrain> { Terrain.Sea };

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
            [BuildingType.FishingHut] = new(Sea, PerTilePercent: 0.10, CapPercent: 0.50),
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

    /// <summary>
    /// Build time at <paramref name="level"/>: <paramref name="baseMinutes"/> ·
    /// growth^(level−1), rounded to whole seconds.
    /// </summary>
    private static TimeSpan Duration(double baseMinutes, int level, double growth = BuildTimeGrowth) =>
        TimeSpan.FromSeconds(Math.Round(baseMinutes * 60.0 * Geometric(growth, level)));

    /// <summary>
    /// A level's total production: <paramref name="perHourAtLevelOne"/> ·
    /// 1.20^(level−1). It is the level's <em>total</em>, not an increment —
    /// <see cref="Totals(IEnumerable{(BuildingType Type, int Level)})"/> reads
    /// the current level's definition only.
    /// </summary>
    private static ResourceAmounts ProductionFor(ResourceAmounts perHourAtLevelOne, int level) =>
        perHourAtLevelOne * Geometric(ProductionGrowth, level);

    /// <summary>Level-1 cost of the small utility buildings (Sawmill, Crop Mill, Weaponsmith, Meadery).</summary>
    private static readonly ResourceAmounts SmallBuildingCost = new(Wood: 100, Stone: 80, Food: 0, Iron: 0);

    private static readonly ResourceAmounts LevelOneProducerCost = new(Wood: 50, Stone: 40, Food: 15, Iron: 0);

    /// <summary>Total capacity of a geometric storage building: <c>c1 · (g^L − 1) / (g − 1)</c> per resource.</summary>
    private static ResourceAmounts GeometricCapacity(double c1, double growth, int level) =>
        ResourceAmounts.Uniform(c1 * (Math.Pow(growth, level) - 1) / (growth - 1));

    private static BuildingDefinition Producer(
        BuildingType type,
        int level,
        IReadOnlySet<Terrain> terrain,
        ResourceAmounts perHourAtLevelOne,
        ResourceAmounts? costAtLevelOne = null,
        double minutesAtLevelOne = 3) => new()
        {
            Type = type,
            Level = level,
            Cost = (costAtLevelOne ?? LevelOneProducerCost) * CostFactor(level),
            BuildDuration = Duration(minutesAtLevelOne, level),
            // Geometric in level (x1.20 per level), the level's total.
            ProductionPerHour = ProductionFor(perHourAtLevelOne, level),
            AllowedTerrain = terrain,
        };

    private static BuildingDefinition Longhouse(int level) => new()
    {
        Type = BuildingType.Longhouse,
        Level = level,
        Cost = new ResourceAmounts(Wood: 120, Stone: 100, Food: 60, Iron: 0) * CostFactor(level, LonghouseCostGrowth),
        BuildDuration = Duration(1.5, level),
        // The anchor feeds its own settlement a little, so a new holding is
        // never completely stalled. Linear in level (unlike every other
        // producer): +15 wood, +12 stone, +15 food, +2 iron per level.
        ProductionPerHour = new ResourceAmounts(Wood: 15, Stone: 12, Food: 15, Iron: 2) * level,
        StorageCapacity = ResourceAmounts.Uniform(250) * level,
        AllowedTerrain = Grass,
        // The settlement's own centre-disc claim radius at this longhouse
        // level — see Settlement.ClaimRadius, which reads this back. The
        // Longhouse only grows the realm until towers are available: 2 at
        // level 1, 3 from level 2 on, and it stops there (the first Tower
        // unlocks at LH 3; from then on territory grows through towers, see
        // MaxTowers and docs/design/economy.md section 5).
        ClaimRadius = level == 1 ? 2 : 3,
        // A longhouse upgrade is the settlement's biggest single commitment —
        // it consumes every construction slot the settlement currently has,
        // blocking all other construction until it finishes (issue #158).
        OccupiesAllSlots = true,
    };

    private static BuildingDefinition StorageHouse(int level) => new()
    {
        Type = BuildingType.StorageHouse,
        Level = level,
        Cost = new ResourceAmounts(Wood: 80, Stone: 60, Food: 0, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(2.5, level),
        // Total at this level: 600 * (1.22^L - 1) / 0.22 per resource.
        StorageCapacity = GeometricCapacity(600, 1.22, level),
        AllowedTerrain = Grass,
    };

    private static BuildingDefinition Tower(int level) => new()
    {
        Type = BuildingType.Tower,
        Level = level,
        Cost = new ResourceAmounts(Wood: 120, Stone: 200, Food: 0, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(8, level),
        AllowedTerrain = SandOrGrass,
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
        Cost = LevelOneProducerCost * CostFactor(level),
        BuildDuration = Duration(3, level),
        ProductionPerHour = ProductionFor(new ResourceAmounts(0, 0, Food: 40, 0), level),
        RequiresCoastalWater = true,
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
    /// frontend's <c>ringCatalogue.ts</c> <c>RIVER_SHAPES_BY_TYPE</c>/
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
    /// except the Shrine of Njörd, whose art is a shrine on a skerry standing
    /// in the shallows: it is built directly on a coastal-water hex
    /// (<see cref="BuildingDefinition.RequiresCoastalWater"/>, the hex under it
    /// stays plain <see cref="World.Terrain.Sea"/>) like FishingHut/Dockyard
    /// and has no <see cref="BuildingDefinition.AllowedTerrain"/>. Every shrine
    /// unlocks at LH 25, each behind its own feeder building (see
    /// PrerequisiteTable), and has 5 levels.
    /// </summary>
    private static BuildingDefinition Shrine(BuildingType type, int level) => new()
    {
        Type = type,
        Level = level,
        Cost = new ResourceAmounts(Wood: 180, Stone: 140, Food: 60, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(12, level),
        AllowedTerrain = type == BuildingType.ShrineOfNjord ? new HashSet<Terrain>() : Grass,
        RequiresCoastalWater = type == BuildingType.ShrineOfNjord,
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
        Cost = new ResourceAmounts(Wood: 300, Stone: 260, Food: 0, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(10, level),
        // Total at this level: 2500 * (1.30^L - 1) / 0.30 per resource.
        StorageCapacity = GeometricCapacity(2500, 1.30, level),
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
        Cost = new ResourceAmounts(Wood: 140, Stone: 100, Food: 0, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(7, level),
        AllowedTerrain = SandOrGrass,
        // The deepest tier of the early military line (Tower -> Barracks ->
        // Archery Range), behind a level-5 Barracks.
    };

    // Same shape as FishingHut: RequiresCoastalWater rather than
    // AllowedTerrain, the hex under it stays Terrain.Sea. No production or
    // storage of its own — it trains the ship roster in place of the
    // Longhouse (see Units.UnitDefinition.RequiredBuildingType).
    //
    // Deferred follow-up, not implemented here: ships departing a fleet
    // should render from the Dockyard's own hex rather than the settlement
    // centre — that needs an Army/pathing rendering change out of scope for
    // this pass.
    private static BuildingDefinition Dockyard(int level) => new()
    {
        Type = BuildingType.Dockyard,
        Level = level,
        Cost = new ResourceAmounts(Wood: 200, Stone: 120, Food: 0, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(9, level),
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
        Cost = new ResourceAmounts(Wood: 130, Stone: 110, Food: 0, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(7, level),
        AllowedTerrain = SandOrGrass,
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
        Cost = new ResourceAmounts(Wood: 160, Stone: 140, Food: 40, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(8, level),
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
        Cost = new ResourceAmounts(Wood: 160, Stone: 110, Food: 80, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(9, level),
        AllowedTerrain = Grass,
    };

    /// <summary>
    /// Trains the civilian Provisioner/SettlerCrew half of the roster in
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
        Cost = new ResourceAmounts(Wood: 150, Stone: 110, Food: 0, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(7, level),
        AllowedTerrain = Grass,
    };
}
