using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Settlers;

/// <summary>
/// Settlement expansion (issue #55): the settler-crew unit, its escalating
/// training cost, the minimum-spacing rule a new settlement's hex must clear,
/// and the pure "how many settler crews does founding need" constant every
/// other piece of this feature (dispatch validation, arrival resolution)
/// shares.
/// </summary>
public static class Founding
{
    /// <summary>
    /// Settler crews that must stand together on the target hex to found a
    /// settlement — the Travian "3 settlers" pattern this issue explicitly
    /// mirrors. Exactly this many, not "at least": a dispatch requesting a
    /// different count is rejected outright (see
    /// <see cref="Armies.Army.PlanDispatch"/>'s <see cref="Armies.DispatchRejection.WrongSettlerCrewCount"/>)
    /// so arrival never has to decide what to do with a leftover crew.
    /// </summary>
    public const int RequiredSettlerCrews = 3;

    /// <summary>
    /// How many settler crews one ship can carry across open water (issue #55
    /// §2 "by sea") — there is no general ferry/transport mechanic in this
    /// codebase (troop system design doc, explicitly deferred); this is a
    /// narrow, founding-only exception: a <see cref="UnitType.Karve"/> or
    /// <see cref="UnitType.Longship"/> mixed into a
    /// <see cref="Armies.ArmyMission.Found"/> dispatch alongside
    /// <see cref="UnitType.SettlerCrew"/> stacks is read as "the ships are
    /// carrying the crews", not as an illegal mixed-class dispatch — see
    /// <see cref="Armies.Army.PlanDispatch"/>.
    /// </summary>
    public static int ShipCapacity(UnitType shipType) => shipType switch
    {
        UnitType.Karve => 1,
        UnitType.Longship => 2,
        _ => 0,
    };

    /// <summary>
    /// Settler-crew training cost multiplier for a player who already holds
    /// <paramref name="existingSettlementCount"/> settlements (issue #55 §4):
    /// roughly doubles per settlement already held, Travian-style. Owning
    /// just the starting settlement (1) costs the catalogue's base price (×1)
    /// to train crews for a 2nd; owning 2 costs ×2 for a 3rd; owning 3 costs
    /// ×4 for a 4th; and so on. <paramref name="existingSettlementCount"/> of
    /// 0 (defensive only — every player who can train anything already has a
    /// first settlement) is also ×1, not a division by zero.
    /// </summary>
    public static double CostMultiplier(int existingSettlementCount) =>
        Math.Pow(2, Math.Max(0, existingSettlementCount - 1));

    public static ResourceAmounts ScaledSettlerCrewCost(int existingSettlementCount) =>
        UnitCatalogue.Get(UnitType.SettlerCrew).TrainingCost * CostMultiplier(existingSettlementCount);

    /// <summary>
    /// Whether <paramref name="target"/> clears the minimum-spacing rule
    /// (issue #55 §4) against every already-claimed settlement in the world —
    /// yours or another player's: at least <paramref name="minimumSpacing"/>
    /// hexes clear of each settlement's own claim border (its
    /// <see cref="Buildings.Settlement.ClaimRadius"/>), not merely clear of
    /// its centre. Also false when <paramref name="target"/> falls inside any
    /// settlement's claim outright (spacing distance would be negative).
    /// </summary>
    public static bool IsHexFoundable(
        HexCoord target,
        IEnumerable<(HexCoord Centre, int ClaimRadius)> claimedSettlements,
        int minimumSpacing)
    {
        ArgumentNullException.ThrowIfNull(claimedSettlements);

        foreach (var (centre, claimRadius) in claimedSettlements)
        {
            if (target.DistanceTo(centre) - claimRadius < minimumSpacing)
            {
                return false;
            }
        }

        return true;
    }
}
