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
/// is <see langword="null"/> only for <see cref="RiverTileShape.Mouth"/>.
/// </summary>
public readonly record struct RiverTile(
    HexCoord Coord,
    RiverTileShape Shape,
    IReadOnlyList<TileOrientation> InDirections,
    TileOrientation? OutDirection);
