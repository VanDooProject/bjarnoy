namespace Bjarnoy.Domain.World;

/// <summary>
/// Terrain kinds. The names are the contract with the renderer and the tile art
/// pack: they serialise to the lowercase strings of the frontend's
/// <c>Terrain</c> union in <c>src/frontend/src/lib/map/types.ts</c>.
/// </summary>
public enum Terrain
{
    Sea = 0,
    Sand = 1,
    Grass = 2,
    Forest = 3,
    Mountain = 4,
}

public static class TerrainExtensions
{
    /// <summary>The wire name for a terrain, as the frontend spells it.</summary>
    public static string ToWireName(this Terrain terrain) => terrain switch
    {
        Terrain.Sea => "sea",
        Terrain.Sand => "sand",
        Terrain.Grass => "grass",
        Terrain.Forest => "forest",
        Terrain.Mountain => "mountain",
        _ => throw new ArgumentOutOfRangeException(nameof(terrain), terrain, "Unknown terrain"),
    };

    /// <summary>Everything that is not open water; the hexes that can be claimed.</summary>
    public static bool IsLand(this Terrain terrain) => terrain != Terrain.Sea;
}
