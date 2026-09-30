namespace Bjarnoy.Domain.World;

/// <summary>
/// The bog as terrain: an island's <see cref="BogTile"/>s laid over the seed-derived terrain of its land. Terrain is
/// never sampled from the seed for a bog (see <see cref="Terrain.Bog"/>), so everything that asks "what is this hex?" after
/// generation asks through this overlay.
/// </summary>
public static class BogTerrain
{
    /// <summary>
    /// A copy of <paramref name="land"/> with every bog hex that is land in it replaced by <see cref="Terrain.Bog"/> or
    /// <see cref="Terrain.Lake"/>. Water that was sea (an enclosed pocket turned into a lake) is not in a land map and stays out of it.
    /// </summary>
    internal static Dictionary<HexCoord, Terrain> Overlay(Dictionary<HexCoord, Terrain> land, IReadOnlyList<BogTile> bogTiles)
    {
        if (bogTiles.Count == 0)
        {
            return land;
        }

        var copy = new Dictionary<HexCoord, Terrain>(land);
        foreach (var tile in bogTiles)
        {
            if (copy.ContainsKey(tile.Coord))
            {
                copy[tile.Coord] = tile.Terrain;
            }
        }

        return copy;
    }

    /// <summary>The hexes of plain bog moss (not a lake, shore, creek, mouth or spring): the only bog a camp stands on.</summary>
    internal static IReadOnlySet<HexCoord> PlainBog(IReadOnlyList<BogTile> bogTiles) =>
        bogTiles.Where(t => t.Kind == BogTileKind.Bog).Select(t => t.Coord).ToHashSet();

    /// <summary>
    /// The terrain lookup <paramref name="baseTerrain"/> would give, with the bog laid over it. <paramref name="overlay"/> maps a hex to
    /// <see cref="Terrain.Bog"/> or <see cref="Terrain.Lake"/>; a hex not in it is whatever the base says.
    /// </summary>
    public static Func<HexCoord, Terrain> Compose(Func<HexCoord, Terrain> baseTerrain, IReadOnlyDictionary<HexCoord, Terrain> overlay) =>
        overlay.Count == 0
            ? baseTerrain
            : coord => overlay.TryGetValue(coord, out var terrain) ? terrain : baseTerrain(coord);

    /// <summary>The overlay (Bog / Lake per hex) for a set of bog tiles.</summary>
    public static Dictionary<HexCoord, Terrain> OverlayOf(IEnumerable<BogTile> bogTiles)
    {
        var overlay = new Dictionary<HexCoord, Terrain>();
        foreach (var tile in bogTiles)
        {
            overlay[tile.Coord] = tile.Terrain;
        }

        return overlay;
    }
}
