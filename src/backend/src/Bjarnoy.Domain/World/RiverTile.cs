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
    TileOrientation? OutDirection)
{
    public bool Equals(RiverTile other) =>
        Coord == other.Coord
        && Shape == other.Shape
        && OutDirection == other.OutDirection
        && InDirections.SequenceEqual(other.InDirections);

    public override int GetHashCode()
    {
        var hash = new HashCode();
        hash.Add(Coord);
        hash.Add(Shape);
        hash.Add(OutDirection);
        foreach (var direction in InDirections)
        {
            hash.Add(direction);
        }

        return hash.ToHashCode();
    }
}
