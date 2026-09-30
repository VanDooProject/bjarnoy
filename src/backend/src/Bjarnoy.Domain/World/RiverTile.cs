namespace Bjarnoy.Domain.World;

/// <summary>
/// A river hex's role in its path — see <c>docs/design/river-generation.md</c>
/// for how this is derived from a tile's inflow/outflow directions.
/// </summary>
public enum RiverTileShape
{
    /// <summary>The source tile of a river: no inflow, one outflow.</summary>
    Spring,

    /// <summary>Flows straight through: one inflow, one outflow 180° opposite it.</summary>
    Straight,

    /// <summary>One inflow, one outflow 60° off straight (a gentle curve).</summary>
    Bend,

    /// <summary>The Y tile: two rivers merging into one, capped at two inflows.</summary>
    Confluence,

    /// <summary>The last tile before the coast: one inflow, no outflow.</summary>
    Mouth,

    /// <summary>
    /// One inflow, one outflow 120° off straight — a sharper curve than
    /// <see cref="Bend"/>. Appended after the other four rather than sorted
    /// in next to <see cref="Bend"/>: this enum's numeric values are
    /// persisted as plain ints (<c>Persistence.RiverTileRecord.Shape</c>),
    /// so inserting a value in the middle would silently reinterpret every
    /// already-stored river tile's shape.
    /// </summary>
    Bend60,
}

/// <summary>
/// A river-art dressing for a <see cref="RiverTileShape.Straight"/>,
/// <see cref="RiverTileShape.Bend"/> or <see cref="RiverTileShape.Bend60"/>
/// hex, on top of the shape itself — see <see cref="TerrainSampler.RiverVariantAt"/>
/// and the frontend's mirroring <c>riverVariantAt</c>
/// (<c>src/frontend/src/lib/map/worldGenerator.ts</c>). Every other shape
/// (Spring/Confluence/Mouth) and every wasted/lava river tile only ever
/// resolves to <see cref="Plain"/> — the vendored art has no variant cuts for
/// them. Not persisted (unlike <see cref="RiverTileShape"/>): it is re-derived
/// from the hex's coordinate and shape the same way orientation/terrain
/// variants are, never stored on a <see cref="RiverTile"/> record.
/// </summary>
public enum RiverVariant
{
    /// <summary>The plain, undecorated channel — every shape's fallback.</summary>
    Plain,

    /// <summary>A wandering, S-curved channel — <see cref="RiverTileShape.Straight"/>/<see cref="RiverTileShape.Bend"/> only.</summary>
    Meander,

    /// <summary>A channel that splits around a mid-stream island — <see cref="RiverTileShape.Straight"/>/<see cref="RiverTileShape.Bend"/> only.</summary>
    Island,

    /// <summary>A full-half-circle loop — <see cref="RiverTileShape.Bend60"/> only.</summary>
    Loop,
}

/// <summary>
/// How wide the water is on a river hex. A river starts as a <see cref="Stream"/> (half the
/// river's width) and widens once: on a <see cref="Widen"/> tile, the one hex whose inflow(s)
/// are stream width and whose outflow is river width. Appended values only: persisted as an int
/// (<c>Persistence.RiverTileRecord.Width</c>), and a row stored before streams existed reads as
/// <see cref="River"/>, which is what every such tile was.
/// </summary>
public enum RiverWidth
{
    /// <summary>River width on every edge - every tile of a wasted (lava) island, and all tiles downstream of a widening.</summary>
    River = 0,

    /// <summary>Stream width on every edge (a spring and the run below it, until it widens).</summary>
    Stream = 1,

    /// <summary>
    /// Stream in, river out: the smallwide straight (<see cref="RiverTileShape.Straight"/>), the
    /// smallwide Y where two streams join (<see cref="RiverTileShape.Confluence"/>), or a straight
    /// <see cref="RiverTileShape.Mouth"/> whose river-width edge meets the sea.
    /// </summary>
    Widen = 2,
}

/// <summary>Which of the two Y assets a confluence renders with; see <see cref="RiverConfluence"/>.</summary>
public enum ConfluenceKind
{
    /// <summary>The narrow Y: the two tributaries 60 degrees apart, the trunk the third edge.</summary>
    Narrow,

    /// <summary>The wide Y: three arms 120 degrees apart.</summary>
    Wide,
}

/// <summary>
/// Which (in, in, out) triples the art can draw as a confluence - the single definition the
/// tracer's merge rule uses, mirrored by the frontend's <c>confluenceOrientationOf</c> and
/// checked against <c>src/shared/confluence-representability.json</c> on both sides.
/// </summary>
/// <remarks>
/// Directions are <see cref="TileOrientation"/> indices. Pixel-measured on the river and stream
/// Y families (see <c>docs/design/river-generation.md</c>): with <c>o</c> the outflow, the
/// narrow Y has its inflows at <c>o+2</c> and <c>o+3</c>, the wide Y at <c>o+2</c> and <c>o+4</c>.
/// There is no mirror image of the narrow Y.
/// </remarks>
public static class RiverConfluence
{
    public static ConfluenceKind? Classify(int inA, int inB, int outDirection)
    {
        if (inA == inB || inA == outDirection || inB == outDirection)
        {
            return null;
        }

        var a = (inA - outDirection + 6) % 6;
        var b = (inB - outDirection + 6) % 6;
        var lo = Math.Min(a, b);
        var hi = Math.Max(a, b);
        if (lo == 2 && hi == 3)
        {
            return ConfluenceKind.Narrow;
        }

        if (lo == 2 && hi == 4)
        {
            return ConfluenceKind.Wide;
        }

        return null;
    }

    public static bool IsRepresentable(int inA, int inB, int outDirection) => Classify(inA, inB, outDirection) is not null;
}

/// <summary>
/// A single hex of a generated river. <see cref="InDirections"/> holds one
/// entry for every shape but <see cref="RiverTileShape.Spring"/> (none) and
/// <see cref="RiverTileShape.Confluence"/> (exactly two); <see cref="OutDirection"/>
/// is <see langword="null"/> for <see cref="RiverTileShape.Mouth"/> and, in the
/// rare case where two rivers merge right at the coast, for a
/// <see cref="RiverTileShape.Confluence"/> too.
/// </summary>
/// <remarks>
/// Equality/hashing are hand-written rather than the record's own synthesized
/// members: those compare <see cref="InDirections"/> by reference (it's
/// typed as the interface <c>IReadOnlyList&lt;T&gt;</c>, and the concrete
/// <c>List&lt;T&gt;</c> instances two separate generations produce are never
/// the same object even with identical contents), which made two
/// <c>RiverTile</c>s with identical data compare unequal.
/// </remarks>
public readonly record struct RiverTile(
    HexCoord Coord,
    RiverTileShape Shape,
    IReadOnlyList<TileOrientation> InDirections,
    TileOrientation? OutDirection,
    RiverWidth Width = RiverWidth.River)
{
    public bool Equals(RiverTile other) =>
        Coord == other.Coord
        && Shape == other.Shape
        && Width == other.Width
        && OutDirection == other.OutDirection
        && InDirections.SequenceEqual(other.InDirections);

    public override int GetHashCode()
    {
        var hash = new HashCode();
        hash.Add(Coord);
        hash.Add(Shape);
        hash.Add(Width);
        hash.Add(OutDirection);
        foreach (var direction in InDirections)
        {
            hash.Add(direction);
        }

        return hash.ToHashCode();
    }
}
