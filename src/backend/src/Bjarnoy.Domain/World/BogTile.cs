namespace Bjarnoy.Domain.World;

/// <summary>
/// What a bog hex is. The numeric values are persisted (<c>Persistence.BogTileRecord.Kind</c>) and
/// go over the wire by name, so only ever append.
/// </summary>
/// <remarks>
/// The kinds follow the art set of <c>VanDooProject/3D_assets</c> <c>docs/bog-tiles.md</c>: bog moss
/// (<c>bog</c>), open water (<c>boglake</c>), the three shores (<c>boglake_inlet/shore/half</c>, one
/// to three contiguous water edges), the lake mouth (<c>boglake_mouth</c>: inlet plus the creek on
/// the opposite edge), the creeks (<c>bogcreek</c> straight and <c>bogcreek_bend</c>, told apart by
/// their in/out directions) and the creek spring (<c>bogcreek_spring</c>).
/// </remarks>
public enum BogTileKind
{
    /// <summary>Plain bog moss.</summary>
    Bog = 0,

    /// <summary>Open lake water. Terrain <see cref="Terrain.Lake"/>.</summary>
    Lake = 1,

    /// <summary>A shore with exactly one water edge.</summary>
    Inlet = 2,

    /// <summary>A shore with two adjacent water edges.</summary>
    Shore = 3,

    /// <summary>A shore with three adjacent water edges.</summary>
    Half = 4,

    /// <summary>A shore with one water edge whose creek arrives (or leaves) on the opposite edge: the creek's only way into a lake.</summary>
    Mouth = 5,

    /// <summary>A creek crossing: straight, or a 60-degree-off-straight bend (in and out two direction indices apart).</summary>
    Creek = 6,

    /// <summary>The end of a creek where it wells up (a spawned river's source): one out direction, no inflow.</summary>
    CreekSpring = 7,
}

/// <summary>
/// A single hex of an island's bogland: the moss, a lake tile, a shore, a creek or a mouth. Every
/// tile that is not <see cref="Terrain.Lake"/> is <see cref="Terrain.Bog"/> terrain.
/// </summary>
/// <remarks>
/// <see cref="InDirections"/> and <see cref="OutDirection"/> are the flow of a creek, a mouth or a
/// spring, as direction indices exactly like <see cref="RiverTile"/>: the direction from this hex
/// to the neighbour the water comes from / goes to. A mouth that takes a creek's water into the lake
/// has its creek side as inflow and the lake side (the water edge) as outflow; an outflow mouth
/// is the mirror. <see cref="WaterEdges"/> lists the directions of the lake neighbours of a shore or
/// mouth (a contiguous run, in ascending cyclic order). Equality is by content, like <see cref="RiverTile"/>.
/// </remarks>
public readonly record struct BogTile(
    HexCoord Coord,
    BogTileKind Kind,
    IReadOnlyList<TileOrientation> InDirections,
    TileOrientation? OutDirection,
    IReadOnlyList<TileOrientation> WaterEdges)
{
    public bool Equals(BogTile other) =>
        Coord == other.Coord
        && Kind == other.Kind
        && OutDirection == other.OutDirection
        && InDirections.SequenceEqual(other.InDirections)
        && WaterEdges.SequenceEqual(other.WaterEdges);

    public override int GetHashCode()
    {
        var hash = new HashCode();
        hash.Add(Coord);
        hash.Add(Kind);
        hash.Add(OutDirection);
        foreach (var direction in InDirections)
        {
            hash.Add(direction);
        }

        foreach (var direction in WaterEdges)
        {
            hash.Add(direction);
        }

        return hash.ToHashCode();
    }

    /// <summary>The terrain this hex reads as: <see cref="Terrain.Lake"/> for lake water, <see cref="Terrain.Bog"/> for everything else.</summary>
    public Terrain Terrain => Kind == BogTileKind.Lake ? Terrain.Lake : Terrain.Bog;
}
