using Bjarnoy.Domain.Buildings;

namespace Bjarnoy.Domain.World;

/// <summary>
/// What a world's settlements cover and hold, built once per request: whether a hex lies inside any realm
/// (a settlement's claim — its centre disc plus one disc per tower) and whether a building stands on it.
/// The wildlife camp rules read both: an empty camp inside a realm never refills, and a building on a
/// camp's hex removes the camp from the map.
/// </summary>
public sealed class RealmIndex
{
    private readonly List<(HexCoord Centre, int Radius)> _discs = [];
    private readonly HashSet<HexCoord> _buildings = [];

    /// <summary>An index with no settlements: no hex is inside a realm and none holds a building.</summary>
    public static RealmIndex Empty { get; } = new();

    /// <summary>Adds one settlement: its claim discs (<see cref="Settlement.ClaimDiscsFor"/>) and its standing buildings.</summary>
    public RealmIndex Add(HexCoord centre, IReadOnlyList<PlacedBuilding> buildings)
    {
        ArgumentNullException.ThrowIfNull(buildings);

        _discs.AddRange(Settlement.ClaimDiscsFor(centre, buildings));
        foreach (var building in buildings)
        {
            _buildings.Add(building.Coord);
        }

        return this;
    }

    /// <summary>True when any settlement's claim disc covers <paramref name="coord"/>.</summary>
    public bool InsideRealm(HexCoord coord)
    {
        foreach (var (centre, radius) in _discs)
        {
            if (centre.DistanceTo(coord) <= radius)
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>True when a standing building (of any settlement) occupies <paramref name="coord"/>. PlacedBuilding coordinates are absolute world hexes.</summary>
    public bool HasBuilding(HexCoord coord) => _buildings.Contains(coord);
}
