using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Settlers;

/// <summary>
/// Setting up a beach camp: the numbers and the site rule the dispatch (<see cref="Army.PlanDispatch"/>) and the arrival
/// (<c>ArmyService</c>) share. See <c>docs/design/skirmish/beach-camp.md</c>.
/// </summary>
public static class BeachCamp
{
    /// <summary>Camp builders that set a camp up: exactly this many, and they are used up doing it.</summary>
    public const int RequiredBuilders = 2;

    /// <summary>
    /// What a camp costs, taken from the launching settlement at dispatch and carried in the army's <see cref="Army.Loot"/>
    /// until the camp is up (consumed) or the army comes home (deposited back).
    /// </summary>
    public static ResourceAmounts Cost { get; } = new(Wood: 200, Stone: 100, Food: 0, Iron: 0);

    /// <summary>How long the army stands on the site before the camp is up, at world speed 1.</summary>
    public static TimeSpan BuildDuration { get; } = TimeSpan.FromMinutes(10);

    /// <summary><see cref="BuildDuration"/> as it runs in a world: divided by the world's speed factor, like a building's.</summary>
    public static TimeSpan ScaledBuildDuration(double speedFactor) =>
        speedFactor == 1.0 ? BuildDuration : TimeSpan.FromTicks((long)(BuildDuration.Ticks / speedFactor));

    /// <summary>
    /// The site rule: a Sand hex on the shoreline (<see cref="Shoreline.IsShoreline"/>), not part of a giant, and free of
    /// anything else (<paramref name="isOccupied"/>: a building of any player, a settlement centre or a wildlife camp).
    /// There is no spacing rule: a camp may stand inside another player's realm.
    /// </summary>
    /// <returns><see cref="DispatchRejection.None"/> when the site is fine, else the first rule broken.</returns>
    public static DispatchRejection CheckSite(
        HexCoord hex, Func<HexCoord, Terrain> terrainAt, IGiantIndex? giants, Func<HexCoord, bool>? isOccupied)
    {
        ArgumentNullException.ThrowIfNull(terrainAt);

        if (terrainAt(hex) != Terrain.Sand || !Shoreline.IsShoreline(hex, terrainAt))
        {
            return DispatchRejection.CampSiteNotSandShore;
        }

        if ((giants ?? GiantIndex.Empty).TryGetGiant(hex, out _) || isOccupied?.Invoke(hex) == true)
        {
            return DispatchRejection.CampSiteNotFree;
        }

        return DispatchRejection.None;
    }
}
