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
}

/// <summary>A stored hex coordinate. Kept separate from the domain's
/// <c>HexCoord</c> so persistence concerns never leak into the game rules.</summary>
public readonly record struct HexPoint(int Q, int R);
