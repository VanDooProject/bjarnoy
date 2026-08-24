namespace Bjarnoy.Domain.World;

/// <summary>A single classified hex.</summary>
public readonly record struct GeneratedTile(HexCoord Coord, Terrain Terrain);

/// <summary>
/// A connected landmass found in a generated world, with the facts about it that
/// a client cannot derive from the seed on its own.
/// </summary>
public sealed record GeneratedIsland
{
    /// <summary>
    /// Stable index within the world, assigned in a deterministic scan order so
    /// the same seed always numbers islands the same way.
    /// </summary>
    public required int Index { get; init; }

    public required string Name { get; init; }

    /// <summary>Every land hex of this island.</summary>
    public required IReadOnlyList<HexCoord> Tiles { get; init; }

    /// <summary>
    /// The hex nearest the island's average position — what the world map points
    /// a label at, and what fleet travel times are measured between.
    /// </summary>
    public required HexCoord Centre { get; init; }

    /// <summary>
    /// Buildable plots for founding a first settlement, best first. Empty for an
    /// island whose terrain never satisfies the rules.
    /// </summary>
    public required IReadOnlyList<HexCoord> StartPositions { get; init; }

    public int TileCount => Tiles.Count;
}

/// <summary>The result of generating a world: its islands and the sea they sit in.</summary>
public sealed record GeneratedWorld
{
    public required WorldGenerationOptions Options { get; init; }

    public required IReadOnlyList<GeneratedIsland> Islands { get; init; }

    /// <summary>Total land hexes across all islands, discarded ones included.</summary>
    public required int LandTileCount { get; init; }
}
