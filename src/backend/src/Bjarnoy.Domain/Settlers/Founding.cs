using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Settlers;

/// <summary>
/// Settlement expansion (issue #55): the settler unit, the minimum-spacing rule a new settlement's hex must clear,
/// and the pure "how many settlers does founding need" constant every
/// other piece of this feature (dispatch validation, arrival resolution)
/// shares.
/// </summary>
public static class Founding
{
    /// <summary>
    /// Settlers that must stand together on the target hex to found a
    /// settlement — five settlers, so one founding party is a real
    /// investment. Exactly this many, not "at least": a dispatch requesting a
    /// different count is rejected outright (see
    /// <see cref="Armies.Army.PlanDispatch"/>'s <see cref="Armies.DispatchRejection.WrongSettlerCount"/>)
    /// so arrival never has to decide what to do with a leftover settler.
    /// </summary>
    public const int RequiredSettlers = 5;

    /// <summary>
    /// Whether <paramref name="target"/> clears the minimum-spacing rule
    /// (issue #55 §4) against every already-claimed settlement in the world —
    /// yours or another player's: at least <paramref name="minimumSpacing"/>
    /// hexes clear of each settlement's own claim border (its
    /// <see cref="Buildings.Settlement.ClaimRadius"/>), not merely clear of
    /// its centre. Also false when <paramref name="target"/> falls inside any
    /// settlement's claim outright (spacing distance would be negative).
    /// </summary>
    /// <param name="giants">
    /// This world's giant index (the territory rule), or
    /// <see langword="null"/> for none on hand. A giant hex is never
    /// foundable, full stop — checked first, independently of spacing.
    /// </param>
    public static bool IsHexFoundable(
        HexCoord target,
        IEnumerable<(HexCoord Centre, int ClaimRadius)> claimedSettlements,
        int minimumSpacing,
        IGiantIndex? giants = null)
    {
        ArgumentNullException.ThrowIfNull(claimedSettlements);

        if ((giants ?? GiantIndex.Empty).TryGetGiant(target, out _))
        {
            return false;
        }

        foreach (var (centre, claimRadius) in claimedSettlements)
        {
            if (target.DistanceTo(centre) - claimRadius < minimumSpacing)
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>
    /// A same-island neighbour's centre and buildings, as needed by
    /// <see cref="CheckSpacing"/>'s phase 2 (<see cref="Settlement.ClaimDiscsFor"/>).
    /// </summary>
    /// <param name="Centre">The neighbour's longhouse hex.</param>
    /// <param name="Buildings">What stands in it.</param>
    /// <param name="Discs">
    /// The neighbour's connected claim discs when its player's other settlements on the island are known
    /// (<see cref="ConnectedRealm.DiscsOf"/>: a tower can be connected through a sibling settlement). <see langword="null"/>
    /// resolves the neighbour alone (<see cref="Settlement.ClaimDiscsFor"/>).
    /// </param>
    public readonly record struct NeighbourSnapshot(
        HexCoord Centre,
        IReadOnlyList<PlacedBuilding> Buildings,
        IReadOnlyList<(HexCoord Centre, int Radius)>? Discs = null)
    {
        /// <summary>The neighbour's claim discs: <see cref="Discs"/> when known, else its own connected ones.</summary>
        public IEnumerable<(HexCoord Centre, int Radius)> ClaimDiscs => Discs ?? Settlement.ClaimDiscsFor(Centre, Buildings);
    }

    public enum SpacingVerdict
    {
        Ok,
        PlotTaken,
        TooClose,
    }

    /// <summary>
    /// The tower-aware, two-phase spacing check <c>SettlementService.FoundAsync</c>
    /// and the landing-page plot-suggestion service both need to agree on
    /// byte-for-byte: phase 1 is a cheap centre-to-centre distance filter
    /// against <paramref name="minimumSpacing"/>; phase 2 catches a neighbour
    /// whose real claimed territory (<see cref="Settlement.ClaimDiscsFor"/>,
    /// towers and any tower chain included) reaches further than phase 1's
    /// centre-only radius would suggest. <paramref name="safetyMargin"/> is
    /// added to every claim-disc radius in phase 2, same as <c>FoundAsync</c>'s
    /// own <c>FoundingSafetyMargin</c>.
    /// </summary>
    public static SpacingVerdict CheckSpacing(
        HexCoord candidate,
        IEnumerable<NeighbourSnapshot> sameIslandNeighbours,
        int minimumSpacing,
        int safetyMargin)
    {
        ArgumentNullException.ThrowIfNull(sameIslandNeighbours);

        foreach (var neighbour in sameIslandNeighbours)
        {
            var distance = candidate.DistanceTo(neighbour.Centre);
            if (distance == 0)
            {
                return SpacingVerdict.PlotTaken;
            }

            if (distance < minimumSpacing)
            {
                return SpacingVerdict.TooClose;
            }

            var withinRealTerritory = neighbour.ClaimDiscs
                .Any(disc => disc.Centre.DistanceTo(candidate) <= disc.Radius + safetyMargin);
            if (withinRealTerritory)
            {
                return SpacingVerdict.TooClose;
            }
        }

        return SpacingVerdict.Ok;
    }
}
