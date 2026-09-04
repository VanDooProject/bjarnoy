using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Shrines;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>
/// The tech tree, as data.
/// </summary>
/// <remarks>
/// Costs grow geometrically and production linearly, which is the usual shape
/// for this genre: each level is worth building but the next one always costs
/// more than the last one returned, so expansion stays a real decision rather
/// than an obvious one. The numbers are a starting point for balancing, not a
/// finished economy.
/// </remarks>
public static class BuildingCatalogue
{
    /// <summary>Highest level any building can currently reach.</summary>
    public const int MaxLevel = 10;

    /// <summary>What a settlement can store before it builds a storage house.</summary>
    public static ResourceAmounts BaseStorageCapacity { get; } = ResourceAmounts.Uniform(500);

    /// <summary>
    /// What a new settlement starts with — enough to put up the first
    /// production building without waiting (MECHANICS.md §9: the first
    /// interaction is a real move, not a countdown).
    /// </summary>
    public static ResourceAmounts FoundingStock { get; } =
        new(Wood: 300, Stone: 300, Food: 200, Iron: 0);

    public static IReadOnlyList<BuildingType> AllTypes { get; } =
        Enum.GetValues<BuildingType>();

    /// <summary>The definition for a level, or <see langword="null"/> if out of range.</summary>
    public static BuildingDefinition? TryGet(BuildingType type, int level)
    {
        if (level < 1 || level > MaxLevel)
        {
            return null;
        }

        return type switch
        {
            BuildingType.Longhouse => Longhouse(level),
            BuildingType.Lumberjack => Producer(type, level, Forest, new ResourceAmounts(Wood: 30, 0, 0, 0)),
            BuildingType.Quarry => Producer(type, level, Ridge, new ResourceAmounts(0, Stone: 24, 0, 0)),
            BuildingType.Farm => Producer(type, level, Grass, new ResourceAmounts(0, 0, Food: 36, 0)),
            BuildingType.StorageHouse => StorageHouse(level),
            BuildingType.Tower => Tower(level),
            BuildingType.FishingHut => FishingHut(level),
            BuildingType.MagicTower => Producer(type, level, Grass, new ResourceAmounts(0, 0, 0, Iron: 6)),
            BuildingType.PumpkinFarm => Producer(type, level, Grass, new ResourceAmounts(0, 0, Food: 36, 0)),
            BuildingType.ShrineOfThor => Shrine(type, level),
            BuildingType.ShrineOfFreyja => Shrine(type, level),
            BuildingType.GreatStorehouse => GreatStorehouse(level),
            BuildingType.ArcheryRange => ArcheryRange(level),
            BuildingType.Dockyard => Dockyard(level),
            BuildingType.Barracks => Barracks(level),
            BuildingType.FisherHut => FisherHut(level),
            // Grass qualifies terrain-wise, but only a hex that is itself a
            // Straight/Bend river tile is actually buildable — see
            // BuildingDefinition.RequiresRiverShape.
            BuildingType.Sawmill =>
                Producer(type, level, Grass, new ResourceAmounts(Wood: 26, 0, 0, 0))
                    with { RequiresRiverShape = SawmillRiverShapes },
            _ => null,
        };
    }

    public static BuildingDefinition Get(BuildingType type, int level) =>
        TryGet(type, level)
        ?? throw new ArgumentOutOfRangeException(
            nameof(level), level, $"{type} has no level {level} (valid: 1-{MaxLevel}).");

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

            var definition = TryGet(type, Math.Min(level, MaxLevel));
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
    /// (see <see cref="Boosts"/>) from <paramref name="terrainAt"/>.
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

        var production = ResourceAmounts.Zero;
        var capacity = BaseStorageCapacity;

        foreach (var building in buildings)
        {
            if (building.Level < 1)
            {
                continue;
            }

            var definition = TryGet(building.Type, Math.Min(building.Level, MaxLevel));
            if (definition is null)
            {
                continue;
            }

            production += definition.ProductionPerHour * BoostMultiplier(building.Type, building.Coord, terrainAt);
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
            // Refines what a neighbouring Lumberjack cuts — same boost shape,
            // same terrain, as a second demand on the forest ring rather than
            // a resource of its own.
            [BuildingType.Sawmill] = new(Forest, PerTilePercent: 0.10, CapPercent: 0.50),
        };

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

    /// <summary>Cost multiplier for a level: 1, 1.6, 2.56, …</summary>
    private static double CostFactor(int level) => Math.Pow(1.6, level - 1);

    private static TimeSpan Duration(double baseMinutes, int level) =>
        TimeSpan.FromMinutes(baseMinutes * Math.Pow(1.5, level - 1));

    private static BuildingDefinition Producer(
        BuildingType type,
        int level,
        IReadOnlySet<Terrain> terrain,
        ResourceAmounts perHourAtLevelOne) => new()
        {
            Type = type,
            Level = level,
            Cost = new ResourceAmounts(Wood: 100, Stone: 80, Food: 0, Iron: 0) * CostFactor(level),
            BuildDuration = Duration(4, level),
            // Linear in level: level 3 produces three times level 1.
            ProductionPerHour = perHourAtLevelOne * level,
            AllowedTerrain = terrain,
            RequiredLonghouseLevel = 1 + ((level - 1) / 2),
        };

    private static BuildingDefinition Longhouse(int level) => new()
    {
        Type = BuildingType.Longhouse,
        Level = level,
        Cost = new ResourceAmounts(Wood: 200, Stone: 150, Food: 100, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(10, level),
        // The anchor feeds its own settlement a little, so a new holding is
        // never completely stalled.
        ProductionPerHour = new ResourceAmounts(Wood: 10, Stone: 8, Food: 10, Iron: 2) * level,
        StorageCapacity = ResourceAmounts.Uniform(250) * level,
        AllowedTerrain = Grass,
        RequiredLonghouseLevel = 1,
        // A longhouse upgrade is the settlement's biggest single commitment —
        // it consumes every construction slot the settlement currently has,
        // blocking all other construction until it finishes (issue #158).
        OccupiesAllSlots = true,
    };

    private static BuildingDefinition StorageHouse(int level) => new()
    {
        Type = BuildingType.StorageHouse,
        Level = level,
        Cost = new ResourceAmounts(Wood: 150, Stone: 120, Food: 0, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(6, level),
        StorageCapacity = ResourceAmounts.Uniform(1000) * level,
        AllowedTerrain = Grass,
        RequiredLonghouseLevel = 1 + ((level - 1) / 2),
    };

    private static BuildingDefinition Tower(int level) => new()
    {
        Type = BuildingType.Tower,
        Level = level,
        Cost = new ResourceAmounts(Wood: 120, Stone: 200, Food: 0, Iron: 10) * CostFactor(level),
        BuildDuration = Duration(8, level),
        AllowedTerrain = SandOrGrass,
        RequiredLonghouseLevel = 2 + ((level - 1) / 2),
    };

    // Same shape as the land Producers, but gated by RequiresCoastalWater
    // instead of AllowedTerrain — the hex under it stays Terrain.Sea.
    private static BuildingDefinition FishingHut(int level) => new()
    {
        Type = BuildingType.FishingHut,
        Level = level,
        Cost = new ResourceAmounts(Wood: 100, Stone: 80, Food: 0, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(4, level),
        ProductionPerHour = new ResourceAmounts(0, 0, Food: 30, 0) * level,
        RequiresCoastalWater = true,
        RequiredLonghouseLevel = 1 + ((level - 1) / 2),
    };

    /// <summary>
    /// A second, later coastal food producer alongside <see cref="FishingHut"/> —
    /// same shape (RequiresCoastalWater, the hex under it stays plain
    /// <see cref="World.Terrain.Sea"/>), just its own cost/production tier.
    /// </summary>
    private static BuildingDefinition FisherHut(int level) => new()
    {
        Type = BuildingType.FisherHut,
        Level = level,
        Cost = new ResourceAmounts(Wood: 100, Stone: 80, Food: 0, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(4, level),
        ProductionPerHour = new ResourceAmounts(0, 0, Food: 32, 0) * level,
        RequiresCoastalWater = true,
        RequiredLonghouseLevel = 1 + ((level - 1) / 2),
    };

    /// <summary>The only two river shapes the Sawmill's vendor art has a dedicated composite for — see <see cref="BuildingDefinition.RequiresRiverShape"/>.</summary>
    private static readonly IReadOnlySet<RiverTileShape> SawmillRiverShapes =
        new HashSet<RiverTileShape> { RiverTileShape.Straight, RiverTileShape.Bend };

    /// <summary>
    /// A shrine contributes no flat production or storage of its own — its
    /// favour (<see cref="ShrineCatalogue.Favour"/>) is a percentage bonus,
    /// folded into <see cref="Settlement.CurrentTotals"/> instead of summed
    /// here alongside the additive totals. Buildable on any land hex, like
    /// the anchor buildings before terrain was tightened to Grass-only —
    /// a shrine has no production to protect by terrain-gating it.
    /// </summary>
    private static BuildingDefinition Shrine(BuildingType type, int level) => new()
    {
        Type = type,
        Level = level,
        Cost = new ResourceAmounts(Wood: 180, Stone: 140, Food: 60, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(12, level),
        RequiredLonghouseLevel = 3 + ((level - 1) / 2),
    };

    /// <summary>
    /// A flat level-10-only late-game storage tier: both the Longhouse and
    /// the settlement's own <see cref="BuildingType.StorageHouse"/> must
    /// already be level 10 (see <see cref="Settlement.PlanBuild"/>'s
    /// <see cref="BuildingDefinition.RequiredBuildingType"/> check).
    /// </summary>
    private static BuildingDefinition GreatStorehouse(int level) => new()
    {
        Type = BuildingType.GreatStorehouse,
        Level = level,
        Cost = new ResourceAmounts(Wood: 300, Stone: 260, Food: 0, Iron: 0) * CostFactor(level),
        BuildDuration = Duration(10, level),
        StorageCapacity = ResourceAmounts.Uniform(2000) * level,
        AllowedTerrain = Grass,
        RequiredLonghouseLevel = 10,
        RequiredBuildingType = BuildingType.StorageHouse,
        RequiredBuildingLevel = 10,
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
        Cost = new ResourceAmounts(Wood: 140, Stone: 100, Food: 0, Iron: 20) * CostFactor(level),
        BuildDuration = Duration(7, level),
        AllowedTerrain = SandOrGrass,
        RequiredLonghouseLevel = 2 + ((level - 1) / 2),
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
        Cost = new ResourceAmounts(Wood: 200, Stone: 120, Food: 0, Iron: 20) * CostFactor(level),
        BuildDuration = Duration(9, level),
        RequiresCoastalWater = true,
        RequiredLonghouseLevel = 2 + ((level - 1) / 2),
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
        Cost = new ResourceAmounts(Wood: 130, Stone: 110, Food: 0, Iron: 15) * CostFactor(level),
        BuildDuration = Duration(7, level),
        AllowedTerrain = SandOrGrass,
        RequiredLonghouseLevel = 2 + ((level - 1) / 2),
    };
}
