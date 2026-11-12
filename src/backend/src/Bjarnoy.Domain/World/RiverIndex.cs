using System.Collections.Concurrent;

namespace Bjarnoy.Domain.World;

/// <summary>
/// A world's river tiles as the two lookups a land army's pathfinding needs
/// (<see cref="Movement.HexPathfinder.FindPath"/>'s <c>isRiver</c> and <c>isWideRiver</c>):
/// built from the persisted tiles; one instance per world is kept and shared (<c>WorldRivers</c>), so it is thread-safe.
/// </summary>
public sealed class RiverIndex
{
    private readonly Dictionary<HexCoord, RiverTile> _tiles;
    // Concurrent: one index per world is cached and shared by every request (WorldRivers).
    private readonly ConcurrentDictionary<HexCoord, bool> _wide = new();

    public RiverIndex(IEnumerable<RiverTile> tiles)
    {
        ArgumentNullException.ThrowIfNull(tiles);
        _tiles = [];
        foreach (var tile in tiles)
        {
            _tiles[tile.Coord] = tile;
        }
    }

    /// <summary>The tile on <paramref name="hex"/>, or <see langword="null"/>.</summary>
    public RiverTile? TileAt(HexCoord hex) => _tiles.TryGetValue(hex, out var tile) ? tile : null;

    /// <summary>True when a river tile stands on <paramref name="hex"/>.</summary>
    public bool IsRiver(HexCoord hex) => _tiles.ContainsKey(hex);

    /// <summary>True when the river tile on <paramref name="hex"/> is wide (impassable to a land army); the rule is <c>RiverGenerator.IsWideRiver</c> (at least two river-width arms), the one valley streams are generated against.</summary>
    public bool IsWide(HexCoord hex)
    {
        if (!_tiles.TryGetValue(hex, out var tile))
        {
            return false;
        }

        return _wide.GetOrAdd(hex, _ => RiverGenerator.IsWideRiver(tile, _tiles));
    }
}
