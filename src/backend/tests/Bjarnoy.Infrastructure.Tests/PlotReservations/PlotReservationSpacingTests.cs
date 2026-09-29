using Bjarnoy.Domain.Buildings;
using Bjarnoy.Infrastructure.Services;
using Bjarnoy.Infrastructure.Services.PlotReservations;

namespace Bjarnoy.Infrastructure.Tests.PlotReservations;

/// <summary>
/// Pins the sizing relationship the whole reservation-disc design leans on:
/// two owners' pinned plots are always far enough apart that once either
/// founds, the other's plot still clears <c>SettlementService.FoundAsync</c>'s
/// own spacing rule against the brand-new settlement. If a future change to
/// <c>MaxClaimRadius</c>/<see cref="SettlementService.FoundingSafetyMargin"/>
/// ever inverts this chain, this test — not a confused player mid-signup —
/// is what should fail.
/// </summary>
public class PlotReservationSpacingTests
{
    [Fact]
    public void ReservationSpacing_exceeds_the_real_founding_minimum_spacing()
    {
        Assert.True(PlotReservationService.ReservationSpacing > SettlementService.MinimumSpacing);
    }

    [Fact]
    public void MinimumSpacing_exceeds_a_fresh_level_1_settlements_claim_radius_plus_safety_margin()
    {
        var freshClaimReach = Settlement.ClaimRadiusForLonghouseLevel(1) + SettlementService.FoundingSafetyMargin;

        Assert.True(SettlementService.MinimumSpacing > freshClaimReach);
    }

    [Fact]
    public void MinimumSpacing_is_7_as_derived_from_max_claim_radius()
    {
        // 2 * MaxClaimRadius + 1, where the Longhouse's claim radius stops at 3
        // (docs/design/economy.md section 5: territory then grows through
        // towers). Pinned so a change to MaxClaimRadius/MaxLevel is caught here
        // rather than only showing up as a mismatch against the frontend's own
        // (now-deleted) stale copy of this constant.
        Assert.Equal(7, SettlementService.MinimumSpacing);
    }

    [Fact]
    public void ReservationSpacing_is_9()
    {
        Assert.Equal(9, PlotReservationService.ReservationSpacing);
    }
}
