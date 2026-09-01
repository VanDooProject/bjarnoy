using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Services;

namespace Bjarnoy.Infrastructure.Tests;

/// <summary>
/// Property-style regression coverage for
/// <see cref="SettlementService.MinimumSpacing"/>: two settlements founded
/// exactly that far apart, each maxed out (longhouse and every tower at
/// <see cref="BuildingCatalogue.MaxLevel"/>, each tower placed at the worst
/// possible spot — right at the edge of its own settlement's centre disc, on
/// the axis toward the other settlement), must never end up with any hex
/// claimed by both. This is the worst case
/// <c>SettlementService.MinimumSpacing</c> is sized against (see
/// <see cref="Settlement.MaxTerritoryReach"/>'s own remarks); a bug in either
/// the spacing formula or the union-claim geometry itself would show up here
/// as an overlapping hex.
/// </summary>
/// <remarks>
/// Deliberately a pure domain-level test rather than an HTTP/DB integration
/// test in the style of <c>SettlementEndpointsTests.cs</c>'s own
/// <c>MinimumSpacing</c> regression coverage: driving two settlements to
/// max longhouse *and* max tower level through the real build queue would
/// need real terrain satisfying <c>BuildingType.Tower</c>'s
/// <c>SandOrGrass</c> requirement at exactly the worst-case offset from each
/// centre, which a generated world does not reliably offer at any given
/// seed. Constructing the two <see cref="Settlement"/> values directly is
/// just as faithful a check of the actual invariant (no DB or terrain
/// generator is consulted by <see cref="Settlement.Claims"/> or
/// <see cref="Settlement.ClaimDiscs"/> either) and is deterministic.
/// </remarks>
public class SettlementTerritorySpacingTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private static Settlement MaxedSettlement(HexCoord centre, HexCoord towerCoord)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, BuildingCatalogue.MaxLevel)]);

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Maxed",
            Centre = centre,
            Buildings =
            [
                new PlacedBuilding(centre, BuildingType.Longhouse, BuildingCatalogue.MaxLevel),
                new PlacedBuilding(towerCoord, BuildingType.Tower, BuildingCatalogue.MaxLevel),
            ],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(0), production, capacity, T0),
        };
    }

    [Fact]
    public void Two_maxed_settlements_founded_at_MinimumSpacing_never_have_overlapping_territory()
    {
        var centreA = new HexCoord(0, 0);
        var centreB = new HexCoord(SettlementService.MinimumSpacing, 0);

        // Worst case: each settlement's one tower sits right at its own
        // centre disc's edge, on the straight line toward the other
        // settlement — the closest a tower (and therefore its own satellite
        // disc) can ever get to the neighbour while still only ever being
        // buildable inside the centre disc (Settlement.CentreClaims).
        var towerA = new HexCoord(Settlement.MaxClaimRadius, 0);
        var towerB = new HexCoord(centreB.Q - Settlement.MaxClaimRadius, 0);

        var settlementA = MaxedSettlement(centreA, towerA);
        var settlementB = MaxedSettlement(centreB, towerB);

        // Sanity: the towers really are inside their own settlement's centre
        // disc (i.e. this is a legally buildable placement, not a hypothetical
        // one) — this is what makes the scenario the true worst case rather
        // than an unreachable one.
        Assert.True(settlementA.CentreClaims(towerA));
        Assert.True(settlementB.CentreClaims(towerB));

        // Brute-force the actual invariant over a generous bounding box
        // around both settlements, rather than only trusting the disc-radius
        // arithmetic: no hex may be claimed by both.
        var minQ = Math.Min(centreA.Q, centreB.Q) - Settlement.MaxTerritoryReach - 2;
        var maxQ = Math.Max(centreA.Q, centreB.Q) + Settlement.MaxTerritoryReach + 2;
        var span = Settlement.MaxTerritoryReach + 2;

        var overlaps = new List<HexCoord>();
        for (var q = minQ; q <= maxQ; q++)
        {
            for (var r = -span; r <= span; r++)
            {
                var coord = new HexCoord(q, r);
                if (settlementA.Claims(coord) && settlementB.Claims(coord))
                {
                    overlaps.Add(coord);
                }
            }
        }

        Assert.True(overlaps.Count == 0, $"Overlapping hexes at MinimumSpacing ({SettlementService.MinimumSpacing}): {string.Join(", ", overlaps)}");
    }

    [Fact]
    public void One_hex_closer_than_MinimumSpacing_can_overlap_at_the_same_worst_case()
    {
        // Confirms MinimumSpacing is tight, not just sufficient: one hex
        // closer and the same worst-case tower placement does overlap,
        // so MinimumSpacing could not safely be any smaller.
        var centreA = new HexCoord(0, 0);
        var centreB = new HexCoord(SettlementService.MinimumSpacing - 1, 0);

        var towerA = new HexCoord(Settlement.MaxClaimRadius, 0);
        var towerB = new HexCoord(centreB.Q - Settlement.MaxClaimRadius, 0);

        var settlementA = MaxedSettlement(centreA, towerA);
        var settlementB = MaxedSettlement(centreB, towerB);

        // The two tower discs now meet exactly at their shared edge.
        var midpoint = new HexCoord((towerA.Q + towerB.Q) / 2, 0);
        Assert.True(settlementA.Claims(midpoint));
        Assert.True(settlementB.Claims(midpoint));
    }
}
