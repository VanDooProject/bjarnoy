using Bjarnoy.Domain.Economy;
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

    /// <summary>What a settlement can store before it builds a warehouse.</summary>
    public static ResourceAmounts BaseStorageCapacity { get; } = ResourceAmounts.Uniform(500);

    /// <summary>
    /// What a new settlement starts with — enough to put up the first
    /// production building without waiting (MECHANICS.md §9: the first
    /// interaction is a real move, not a countdown).
    /// </summary>
    public static ResourceAmounts FoundingStock { get; } =
        new(Wood: 300, Stone: 300, Grain: 200, Silver: 0);

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
            BuildingType.LumberCamp => Producer(type, level, Forest, new ResourceAmounts(Wood: 30, 0, 0, 0)),
            BuildingType.Quarry => Producer(type, level, Ridge, new ResourceAmounts(0, Stone: 24, 0, 0)),
            BuildingType.Farm => Producer(type, level, Grass, new ResourceAmounts(0, 0, Grain: 36, 0)),
            BuildingType.Warehouse => Warehouse(level),
            BuildingType.Watchtower => Watchtower(level),
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

    private static readonly IReadOnlySet<Terrain> Forest = new HashSet<Terrain> { Terrain.Forest };
    private static readonly IReadOnlySet<Terrain> Ridge = new HashSet<Terrain> { Terrain.Mountain };
    private static readonly IReadOnlySet<Terrain> Grass = new HashSet<Terrain> { Terrain.Grass };

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
            Cost = new ResourceAmounts(Wood: 100, Stone: 80, Grain: 0, Silver: 0) * CostFactor(level),
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
        Cost = new ResourceAmounts(Wood: 200, Stone: 150, Grain: 100, Silver: 0) * CostFactor(level),
        BuildDuration = Duration(10, level),
        // The anchor feeds its own settlement a little, so a new holding is
        // never completely stalled.
        ProductionPerHour = new ResourceAmounts(Wood: 10, Stone: 8, Grain: 10, Silver: 2) * level,
        StorageCapacity = ResourceAmounts.Uniform(250) * level,
        RequiredLonghouseLevel = 1,
    };

    private static BuildingDefinition Warehouse(int level) => new()
    {
        Type = BuildingType.Warehouse,
        Level = level,
        Cost = new ResourceAmounts(Wood: 150, Stone: 120, Grain: 0, Silver: 0) * CostFactor(level),
        BuildDuration = Duration(6, level),
        StorageCapacity = ResourceAmounts.Uniform(1000) * level,
        RequiredLonghouseLevel = 1 + ((level - 1) / 2),
    };

    private static BuildingDefinition Watchtower(int level) => new()
    {
        Type = BuildingType.Watchtower,
        Level = level,
        Cost = new ResourceAmounts(Wood: 120, Stone: 200, Grain: 0, Silver: 10) * CostFactor(level),
        BuildDuration = Duration(8, level),
        RequiredLonghouseLevel = 2 + ((level - 1) / 2),
    };
}
