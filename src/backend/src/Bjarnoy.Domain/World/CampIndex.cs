namespace Bjarnoy.Domain.World;

/// <summary>
/// Coord -&gt; <see cref="Camp"/> lookup, built once per request from a world's camp
/// list, so the build rule "a guarded camp hex is not buildable" is a dictionary hit per hex.
/// The build rule treats every camp in the index as blocking; <see cref="Blocking"/> builds an
/// index of just the camps that are.
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

    /// <summary>
    /// The index of camps that block building at <paramref name="now"/>: every camp that still has beasts
    /// (<see cref="CampState.GarrisonAt"/> with its realm test), plus Fenrir's brood always. A cleared camp is left out,
    /// so its hex is buildable under its ground's normal rules.
    /// </summary>
    /// <param name="camps">Each camp with its stored state (<see cref="CampState.Pristine"/> when it has no row).</param>
    /// <param name="insideRealm">Whether a hex lies inside any settlement's claim.</param>
    public static CampIndex Blocking(
        IEnumerable<(Camp Camp, CampState State)> camps,
        DateTimeOffset now,
        Func<HexCoord, bool> insideRealm)
    {
        ArgumentNullException.ThrowIfNull(camps);
        ArgumentNullException.ThrowIfNull(insideRealm);

        return new CampIndex([.. camps
            .Where(c => c.Camp.Family == CampFamilies.Fenrirbrood
                || !c.State.IsEmptyAt(c.Camp, now, insideRealm(c.Camp.Coord)))
            .Select(c => c.Camp)]);
    }
}
