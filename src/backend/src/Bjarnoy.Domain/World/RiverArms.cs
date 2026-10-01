namespace Bjarnoy.Domain.World;

/// <summary>
/// Which river tiles are "wide" for movement: a land army cannot cross a wide river, only a
/// stream. C# twin of <c>isWideRiverTile</c>/<c>riverArms</c> in
/// <c>scripts/worldgen-preview/pathing-world.ts</c>, asserted against
/// <c>src/shared/river-pathing-golden.json</c> on both sides.
/// </summary>
/// <remarks>
/// Derived from arm widths, not from names: a tile is wide when at least two of its arms are
/// river width. An arm is river width when the water on it is a river: the upstream neighbour's
/// outflow for an in-arm (<see cref="RiverWidth.River"/>, <see cref="RiverWidth.Widen"/> and
/// <see cref="RiverWidth.RiverStream"/> tiles all flow out as river, a <see cref="RiverWidth.Stream"/>
/// tile as stream; a creek or lake upstream — no river tile there — is river width on a river
/// tile), the tile's own outflow for the out-arm (a mouth's sea side counts as its out-arm). So
/// river tiles (river in, river out) and riverstream Ys (river in, stream in, river out) are wide,
/// while a widen tile (stream in, river out), a stream-stream confluence and plain stream tiles
/// are not: those stay crossable.
/// </remarks>
public static class RiverArms
{
    /// <summary>Number of river-width and stream-width arms of <paramref name="tile"/>.</summary>
    public static (int River, int Stream) Count(RiverTile tile, Func<HexCoord, RiverTile?> riverAt)
    {
        ArgumentNullException.ThrowIfNull(riverAt);

        var river = 0;
        var stream = 0;
        void Add(bool isRiver)
        {
            if (isRiver)
            {
                river++;
            }
            else
            {
                stream++;
            }
        }

        var neighbours = tile.Coord.Neighbours();
        foreach (var direction in tile.InDirections)
        {
            var upstream = riverAt(neighbours[(int)direction]);
            Add(upstream is { } up ? FlowsOutAsRiver(up) : tile.Width is RiverWidth.River);
        }

        if (tile.OutDirection is not null || tile.Shape == RiverTileShape.Mouth)
        {
            Add(FlowsOutAsRiver(tile));
        }

        return (river, stream);
    }

    /// <summary>True when at least two of the tile's arms are river width (impassable to land armies).</summary>
    public static bool IsWide(RiverTile tile, Func<HexCoord, RiverTile?> riverAt) => Count(tile, riverAt).River >= 2;

    private static bool FlowsOutAsRiver(RiverTile tile) =>
        tile.Width is RiverWidth.River or RiverWidth.Widen or RiverWidth.RiverStream;
}
