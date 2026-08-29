namespace Bjarnoy.Domain.World;

/// <summary>
/// Coastal-hex predicate (issue #40 phase 6, design doc §8 "Ships, land,
/// shorelines"). Shared by two callers with otherwise nothing in common: a
/// fleet <see cref="Armies.Army.PlanDispatch"/> attack needs to know whether
/// the *target* settlement's territory is reachable by ship, and
/// <see cref="Buildings.Settlement.PlanTrain"/> needs to know whether the
/// *training* settlement's own territory is, before it will let a
/// <see cref="Units.UnitClass.Ship"/> order be queued. Both only ever need a
/// hex's own terrain and its six neighbours — no map object, no settlement,
/// no database — so this lives as a standalone pure function rather than
/// bolted onto either caller.
/// </summary>
public static class Shoreline
{
    /// <summary>
    /// True when <paramref name="coord"/> is itself land and at least one of
    /// its six neighbours is <see cref="Terrain.Sea"/> — the hex a longship
    /// can beach a raiding party on. A sea hex is never itself a shoreline,
    /// even one entirely enclosed by land (a lagoon): "shoreline" means land a
    /// fleet can reach, not water a fleet can reach.
    /// </summary>
    public static bool IsShoreline(HexCoord coord, Func<HexCoord, Terrain> terrainAt)
    {
        ArgumentNullException.ThrowIfNull(terrainAt);

        if (!terrainAt(coord).IsLand())
        {
            return false;
        }

        foreach (var neighbour in coord.Neighbours())
        {
            if (terrainAt(neighbour) == Terrain.Sea)
            {
                return true;
            }
        }

        return false;
    }
}
