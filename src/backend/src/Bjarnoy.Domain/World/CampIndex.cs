namespace Bjarnoy.Domain.World;

/// <summary>
/// Coord -&gt; <see cref="Camp"/> lookup, built once per request from a world's camp
/// list, so the build rule "a camp hex is not buildable" is a dictionary hit per hex.
/// </summary>
public interface ICampIndex
{
    /// <summary>True when a wildlife camp stands on <paramref name="coord"/>.</summary>
    bool TryGetCamp(HexCoord coord, out Camp camp);
}

/// <inheritdoc cref="ICampIndex"/>
public sealed class CampIndex : ICampIndex
{
    private readonly Dictionary<HexCoord, Camp> _byHex;

    public CampIndex(IReadOnlyList<Camp> camps)
    {
        ArgumentNullException.ThrowIfNull(camps);

        _byHex = new Dictionary<HexCoord, Camp>(camps.Count);
        foreach (var camp in camps)
        {
            _byHex[camp.Coord] = camp;
        }
    }

    /// <summary>An index with no camps — every lookup misses. The safe default for a caller with no camp data on hand.</summary>
    public static readonly CampIndex Empty = new([]);

    public bool TryGetCamp(HexCoord coord, out Camp camp) => _byHex.TryGetValue(coord, out camp);
}
