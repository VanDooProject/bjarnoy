namespace Bjarnoy.Domain.World;

/// <summary>
/// A 7-hex world feature: one object covering an anchor hex and its six axial
/// neighbours (<see cref="Footprint"/>). Generated deterministically with the
/// rest of the world — see <see cref="GiantGenerator"/> — and persisted per
/// island the same way <see cref="RiverTile"/> is.
/// </summary>
/// <param name="Anchor">The centre hex of the 7-hex footprint.</param>
/// <param name="Family">
/// The tile-art family this giant renders as — e.g. <c>"giantmountain"</c>,
/// matching the frontend's demo-mode giant mountain family name.
/// </param>
/// <param name="Orientation">
/// The anchor tile's own orientation (<see cref="TerrainSampler.OrientationAt"/>),
/// so client and server agree on which of the art pack's six rotations the
/// giant renders with.
/// </param>
public readonly record struct Giant(HexCoord Anchor, string Family, TileOrientation Orientation)
{
    /// <summary>
    /// The 7 hexes this giant covers: the anchor first, then its six
    /// neighbours in <see cref="HexCoord.Neighbours"/> order.
    /// </summary>
    public static IReadOnlyList<HexCoord> Footprint(HexCoord anchor)
    {
        var footprint = new HexCoord[7];
        footprint[0] = anchor;
        var neighbours = anchor.Neighbours();
        for (var i = 0; i < neighbours.Length; i++)
        {
            footprint[i + 1] = neighbours[i];
        }

        return footprint;
    }
}
