namespace Bjarnoy.Domain.World;

/// <summary>
/// The hexes taken by the endgame map's sites (Utgard wall hexes of any level, Jötun watchtowers), built once per request from a world's
/// islands, so the build rule "an endgame site hex is not buildable" is a set lookup.
/// </summary>
public interface IEndgameSiteIndex
{
    /// <summary>True when an Utgard wall hex or a Jötun watchtower stands on <paramref name="coord"/>.</summary>
    bool IsSite(HexCoord coord);
}

/// <inheritdoc cref="IEndgameSiteIndex"/>
public sealed class EndgameSiteIndex : IEndgameSiteIndex
{
    private readonly HashSet<HexCoord> _hexes;

    public EndgameSiteIndex(IEnumerable<HexCoord> hexes)
    {
        ArgumentNullException.ThrowIfNull(hexes);
        _hexes = [.. hexes];
    }

    /// <summary>An index with no sites. The safe default for a caller with no endgame data on hand.</summary>
    public static readonly EndgameSiteIndex Empty = new([]);

    public bool IsSite(HexCoord coord) => _hexes.Contains(coord);
}
