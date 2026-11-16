namespace Bjarnoy.Domain.World;

/// <summary>A hex disc a player currently sees: <paramref name="Radius"/> hexes around <paramref name="Centre"/>, centre included.</summary>
public readonly record struct SightDisc(HexCoord Centre, int Radius);

/// <summary>
/// "Is this hex in sight" for a viewer, per <c>docs/design/map-fog-v2.md</c> §1g: the union of the discs the viewer's settlements,
/// towers and marching armies currently see.
/// </summary>
public static class Sight
{
    /// <summary>Whether <paramref name="hex"/> lies inside any of <paramref name="discs"/>.</summary>
    public static bool Contains(IEnumerable<SightDisc> discs, HexCoord hex)
    {
        ArgumentNullException.ThrowIfNull(discs);
        foreach (var disc in discs)
        {
            if (HexCoord.Distance(disc.Centre, hex) <= disc.Radius)
            {
                return true;
            }
        }

        return false;
    }
}
