namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// A landmass in a world. Persisted — unlike terrain — because its extent comes
/// from a flood fill over the whole map, which a client cannot do hex by hex,
/// and because it carries a name and start positions that must not change.
/// </summary>
public class IslandEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid WorldId { get; set; }

    public WorldEntity? World { get; set; }

    /// <summary>Deterministic index within the world; stable for a given seed.</summary>
    public int Index { get; set; }

    public required string Name { get; set; }

    public int CentreQ { get; set; }

    public int CentreR { get; set; }

    public int TileCount { get; set; }

    /// <summary>
    /// Free founding plots, best first, as a flat <c>q,r</c> list.
    /// </summary>
    /// <remarks>
    /// Stored as a single column rather than a row per plot: the list is read as
    /// a whole when a player is placed and never queried by coordinate, so a
    /// join table would cost more than it earns. See
    /// <see cref="Persistence.HexListConverter"/> for the encoding.
    /// </remarks>
    public List<HexPoint> StartPositions { get; set; } = [];

    /// <summary>
    /// This island's rivers, one entry per river tile — see
    /// <c>Bjarnoy.Domain.World.RiverGenerator</c>.
    /// </summary>
    /// <remarks>
    /// Persisted for the same reason <see cref="StartPositions"/> is: it
    /// comes from a whole-island pass over the flood-filled tile set (and,
    /// for river paths, every other river on the island), not something a
    /// client — or even the server on a later request — can derive hex by
    /// hex from the seed alone. Stored as a single column, same reasoning as
    /// <see cref="StartPositions"/>. See
    /// <see cref="Persistence.RiverTileListConverter"/> for the encoding.
    /// </remarks>
    public List<RiverTileRecord> RiverTiles { get; set; } = [];

    /// <summary>
    /// This island's 7-hex giant features — see
    /// <c>Bjarnoy.Domain.World.GiantGenerator</c>.
    /// </summary>
    /// <remarks>
    /// Persisted for the same reason <see cref="RiverTiles"/> is: generation
    /// scores every candidate anchor against the whole island (mountains,
    /// rivers, start positions, the other chosen giants), which a client — or
    /// even the server on a later request — cannot re-derive hex by hex from
    /// the seed alone. Stored as a single column, same reasoning as
    /// <see cref="StartPositions"/>. See
    /// <see cref="Persistence.GiantListConverter"/> for the encoding.
    /// </remarks>
    public List<GiantRecord> Giants { get; set; } = [];

    /// <summary>
    /// True for an island generated from the wasted-island terrain layer —
    /// see <c>Bjarnoy.Domain.World.GeneratedIsland.IsWasted</c>. Hidden from
    /// the islands list until the world's endboss triggers; defaults to
    /// <see langword="false"/> so every existing island stays a plain green
    /// one. Existing worlds only ever gain wasted islands on reseed.
    /// </summary>
    public bool IsWasted { get; set; }
}

/// <summary>
/// A stored giant. Kept separate from the domain's <c>Giant</c> for the same
/// reason <see cref="HexPoint"/> is kept separate from <c>HexCoord</c> —
/// <c>Orientation</c> is the domain's <c>TileOrientation</c> by its plain
/// numeric index, not the enum itself, so this type (and its converter)
/// never has to change shape when the domain enum does.
/// </summary>
public readonly record struct GiantRecord(int Q, int R, string Family, int Orientation);

/// <summary>A stored hex coordinate. Kept separate from the domain's
/// <c>HexCoord</c> so persistence concerns never leak into the game rules.</summary>
public readonly record struct HexPoint(int Q, int R);

/// <summary>
/// A stored river tile. Kept separate from the domain's <c>RiverTile</c> for
/// the same reason <see cref="HexPoint"/> is kept separate from
/// <c>HexCoord</c> — <c>Shape</c>/<c>InDirections</c>/<c>OutDirection</c> are
/// the domain's <c>RiverTileShape</c>/<c>TileOrientation</c> values by their
/// plain numeric index, not the enums themselves, so this type (and its
/// converter) never has to change shape when the domain enums do.
/// </summary>
public readonly record struct RiverTileRecord(int Q, int R, int Shape, IReadOnlyList<int> InDirections, int? OutDirection)
{
    public bool Equals(RiverTileRecord other) =>
        Q == other.Q
        && R == other.R
        && Shape == other.Shape
        && OutDirection == other.OutDirection
        && InDirections.SequenceEqual(other.InDirections);

    public override int GetHashCode()
    {
        var hash = new HashCode();
        hash.Add(Q);
        hash.Add(R);
        hash.Add(Shape);
        hash.Add(OutDirection);
        foreach (var direction in InDirections)
        {
            hash.Add(direction);
        }

        return hash.ToHashCode();
    }
}
