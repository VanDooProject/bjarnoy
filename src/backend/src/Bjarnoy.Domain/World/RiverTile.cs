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

    /// <summary>One inflow, one outflow in any other direction.</summary>
    Bend,

    /// <summary>The Y tile: two rivers merging into one, capped at two inflows.</summary>
    Confluence,

    /// <summary>The last tile before the coast: one inflow, no outflow.</summary>
    Mouth,
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
