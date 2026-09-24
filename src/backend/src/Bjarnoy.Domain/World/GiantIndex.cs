namespace Bjarnoy.Domain.World;

/// <summary>
/// Coord -&gt; <see cref="Giant"/> lookup, built once per request from an
/// island's (or a world's) giant list, so the territory rule
/// (<c>Bjarnoy.Domain.Buildings.Territory</c>) never has to scan every
/// giant's footprint per hex it checks.
/// </summary>
public interface IGiantIndex
{
    /// <summary>True when <paramref name="coord"/> is part of some giant's 7-hex footprint.</summary>
    bool TryGetGiant(HexCoord coord, out Giant giant);
}

/// <inheritdoc cref="IGiantIndex"/>
public sealed class GiantIndex : IGiantIndex
{
    private readonly Dictionary<HexCoord, Giant> _byHex;

    public GiantIndex(IReadOnlyList<Giant> giants)
    {
        ArgumentNullException.ThrowIfNull(giants);

        _byHex = new Dictionary<HexCoord, Giant>(giants.Count * 7);
        foreach (var giant in giants)
        {
            foreach (var hex in Giant.Footprint(giant.Anchor))
            {
                _byHex[hex] = giant;
            }
        }
    }

    /// <summary>An index with no giants — every lookup misses. The safe default for a caller with no giant data on hand.</summary>
    public static readonly GiantIndex Empty = new([]);

    public bool TryGetGiant(HexCoord coord, out Giant giant) => _byHex.TryGetValue(coord, out giant);
}
