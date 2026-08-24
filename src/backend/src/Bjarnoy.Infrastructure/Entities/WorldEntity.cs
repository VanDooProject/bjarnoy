using Bjarnoy.Domain.World;

namespace Bjarnoy.Infrastructure.Entities;

public enum WorldStatus
{
    Active = 0,
    Inactive = 1,
    Full = 2,
}

/// <summary>
/// A game world: one sea, its islands, and the players in it.
/// </summary>
/// <remarks>
/// A world stores its <em>generation input</em>, not its output. Terrain is a
/// pure function of the seed and the parameters below (see
/// <see cref="TerrainSampler"/>), so there is no tile table: only hexes that
/// acquire state — an owner, a building — ever become rows.
/// </remarks>
public class WorldEntity
{
    /// <summary>UUIDv7, so primary keys are time-ordered and index well.</summary>
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public required string Name { get; set; }

    public int Seed { get; set; }

    public int Radius { get; set; }

    public int IslandCellSize { get; set; }

    public double IslandChance { get; set; }

    public double IslandMinRadius { get; set; }

    public double IslandMaxRadius { get; set; }

    public double BeachThreshold { get; set; }

    public double MountainThreshold { get; set; }

    public double MountainRockiness { get; set; }

    public double ForestRockiness { get; set; }

    public int MinimumIslandTiles { get; set; }

    public int MaxPlayers { get; set; }

    public WorldStatus Status { get; set; } = WorldStatus.Active;

    public DateTimeOffset CreatedAt { get; set; }

    public List<IslandEntity> Islands { get; set; } = [];

    /// <summary>Rebuilds the generation options this world was created from.</summary>
    public WorldGenerationOptions ToGenerationOptions() => new()
    {
        Seed = Seed,
        Radius = Radius,
        IslandCellSize = IslandCellSize,
        IslandChance = IslandChance,
        IslandMinRadius = IslandMinRadius,
        IslandMaxRadius = IslandMaxRadius,
        BeachThreshold = BeachThreshold,
        MountainThreshold = MountainThreshold,
        MountainRockiness = MountainRockiness,
        ForestRockiness = ForestRockiness,
        MinimumIslandTiles = MinimumIslandTiles,
    };

    public void ApplyGenerationOptions(WorldGenerationOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        Seed = options.Seed;
        Radius = options.Radius;
        IslandCellSize = options.IslandCellSize;
        IslandChance = options.IslandChance;
        IslandMinRadius = options.IslandMinRadius;
        IslandMaxRadius = options.IslandMaxRadius;
        BeachThreshold = options.BeachThreshold;
        MountainThreshold = options.MountainThreshold;
        MountainRockiness = options.MountainRockiness;
        ForestRockiness = options.ForestRockiness;
        MinimumIslandTiles = options.MinimumIslandTiles;
    }
}
