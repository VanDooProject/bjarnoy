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

    /// <summary>
    /// Wet moss ground (bogland): land, passable at twice the cost of grass. Not sampled from the seed like the
    /// others: it is placed per island by <see cref="BogGenerator"/> and stored with the island (<see cref="BogTile"/>).
    /// </summary>
    Bog = 5,

    /// <summary>
    /// A bog lake: water that is neither the sea nor land. Impassable to armies and ships alike, never coastal
    /// water, nothing is built on it. Placed by <see cref="BogGenerator"/> like <see cref="Bog"/>.
    /// </summary>
    Lake = 6,
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
        Terrain.Bog => "bog",
        Terrain.Lake => "lake",
        _ => throw new ArgumentOutOfRangeException(nameof(terrain), terrain, "Unknown terrain"),
    };

    /// <summary>Everything that is neither the sea nor a bog lake; the hexes that can be claimed.</summary>
    public static bool IsLand(this Terrain terrain) => terrain is not (Terrain.Sea or Terrain.Lake);

    /// <summary>Whether a unit of the given kind can be on this hex: land units on land, ships on open sea only (never a bog lake).</summary>
    public static bool IsTraversable(this Terrain terrain, bool isLandUnit) => isLandUnit ? terrain.IsLand() : terrain.IsSea();

    /// <summary>Open sea: the only water a ship sails on. A bog lake is water but not sea.</summary>
    public static bool IsSea(this Terrain terrain) => terrain == Terrain.Sea;
}
