using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>
/// The giant-aware territory rule: a settlement's claim discs cover a plain
/// hex exactly as before, but a hex that belongs to a <see cref="Giant"/>'s
/// 7-hex footprint is only claimed when <em>every</em> hex of that footprint
/// is covered by the claim — a claim that merely touches or partially
/// overlaps a giant claims none of it. See the "giants" feature's territory
/// rule.
/// </summary>
public static class Territory
{
    /// <summary>
    /// Whether <paramref name="coord"/> is claimed by the union of
    /// <paramref name="discs"/>, honouring the giant rule above.
    /// </summary>
    public static bool Claims(
        IEnumerable<(HexCoord Centre, int Radius)> discs,
        HexCoord coord,
        IGiantIndex giants)
    {
        ArgumentNullException.ThrowIfNull(discs);
        ArgumentNullException.ThrowIfNull(giants);

        var discList = discs as IReadOnlyList<(HexCoord Centre, int Radius)> ?? discs.ToList();

        if (giants.TryGetGiant(coord, out var giant))
        {
            return IsFullyCovered(discList, giant);
        }

        return CoveredByAnyDisc(discList, coord);
    }

    /// <summary>Whether every one of <paramref name="giant"/>'s 7 footprint hexes falls inside some disc of <paramref name="discs"/>.</summary>
    public static bool IsFullyCovered(IReadOnlyList<(HexCoord Centre, int Radius)> discs, Giant giant)
    {
        ArgumentNullException.ThrowIfNull(discs);

        foreach (var hex in Giant.Footprint(giant.Anchor))
        {
            if (!CoveredByAnyDisc(discs, hex))
            {
                return false;
            }
        }

        return true;
    }

    private static bool CoveredByAnyDisc(IReadOnlyList<(HexCoord Centre, int Radius)> discs, HexCoord coord)
    {
        foreach (var disc in discs)
        {
            if (disc.Centre.DistanceTo(coord) <= disc.Radius)
            {
                return true;
            }
        }

        return false;
    }
}
