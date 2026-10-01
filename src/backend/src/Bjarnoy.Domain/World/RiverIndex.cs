namespace Bjarnoy.Domain.World;

/// <summary>
/// A world's river tiles as the two lookups a land army's pathfinding needs
/// (<see cref="Movement.HexPathfinder.FindPath"/>'s <c>isRiver</c> and <c>isWideRiver</c>):
/// built once per request from the persisted tiles, like the terrain sampler.
/// </summary>
public sealed class RiverIndex
{
    private readonly Dictionary<HexCoord, RiverTile> _tiles;
    private readonly Dictionary<HexCoord, bool> _wide = [];

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

    /// <summary>True when the river tile on <paramref name="hex"/> is wide (impassable to a land army); see <see cref="RiverArms"/>.</summary>
    public bool IsWide(HexCoord hex)
    {
        if (!_tiles.TryGetValue(hex, out var tile))
        {
            return false;
        }

        if (!_wide.TryGetValue(hex, out var wide))
        {
            wide = RiverArms.IsWide(tile, TileAt);
            _wide[hex] = wide;
        }

        return wide;
    }
}
