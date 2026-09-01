using Bjarnoy.Domain.Settlers;

namespace Bjarnoy.Domain.Tests.Settlers;

public class RenownTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Empty_account_starts_at_zero()
    {
        var account = RenownAccount.Empty(T0);

        Assert.Equal(0, account.Total);
        Assert.Equal(T0, account.SettledAt);
    }

    [Fact]
    public void SettleTo_accrues_points_per_level_per_hour()
    {
        var account = RenownAccount.Empty(T0);

        // 10 total building levels across every settlement, for 3 hours.
        var settled = account.SettleTo(T0.AddHours(3), totalBuildingLevels: 10);

        Assert.Equal(30, settled.Total);
        Assert.Equal(T0.AddHours(3), settled.SettledAt);
    }

    [Fact]
    public void SettleTo_is_a_no_op_when_now_has_not_advanced()
    {
        var account = RenownAccount.Empty(T0).SettleTo(T0.AddHours(5), totalBuildingLevels: 4);

        var resettled = account.SettleTo(T0.AddHours(2), totalBuildingLevels: 999);

        Assert.Equal(account.Total, resettled.Total);
        Assert.Equal(account.SettledAt, resettled.SettledAt);
    }

    [Fact]
    public void SettleTo_never_decays_even_with_zero_levels()
    {
        var account = RenownAccount.Empty(T0).SettleTo(T0.AddHours(1), totalBuildingLevels: 20);
        var before = account.Total;

        var settled = account.SettleTo(T0.AddHours(10), totalBuildingLevels: 0);

        Assert.Equal(before, settled.Total);
    }

    [Fact]
    public void SettleTo_accrues_repeatedly_across_multiple_calls()
    {
        var account = RenownAccount.Empty(T0);

        account = account.SettleTo(T0.AddHours(1), totalBuildingLevels: 5);
        account = account.SettleTo(T0.AddHours(2), totalBuildingLevels: 5);
        account = account.SettleTo(T0.AddHours(3), totalBuildingLevels: 20);

        // 5 (hour 1) + 5 (hour 2) + 20 (hour 3) = 30
        Assert.Equal(30, account.Total);
    }

    [Theory]
    [InlineData(1, 0)]
    [InlineData(2, 500)]
    [InlineData(3, 1000)]
    [InlineData(4, 2000)]
    [InlineData(5, 4000)]
    public void RequiredFor_follows_the_documented_escalating_curve(int settlementNumber, double expected)
    {
        Assert.Equal(expected, RenownThresholds.RequiredFor(settlementNumber));
    }

    [Fact]
    public void RequiredFor_settlement_zero_or_negative_is_zero()
    {
        Assert.Equal(0, RenownThresholds.RequiredFor(0));
        Assert.Equal(0, RenownThresholds.RequiredFor(-3));
    }

    [Fact]
    public void AllowsAnotherSettlement_is_false_below_threshold_and_true_at_or_above_it()
    {
        Assert.False(RenownThresholds.AllowsAnotherSettlement(existingSettlementCount: 1, renownTotal: 499));
        Assert.True(RenownThresholds.AllowsAnotherSettlement(existingSettlementCount: 1, renownTotal: 500));
        Assert.True(RenownThresholds.AllowsAnotherSettlement(existingSettlementCount: 1, renownTotal: 501));
    }

    [Fact]
    public void AllowsAnotherSettlement_scales_with_existing_settlement_count()
    {
        // Holding 2 settlements already, the 3rd needs 1000.
        Assert.False(RenownThresholds.AllowsAnotherSettlement(existingSettlementCount: 2, renownTotal: 999));
        Assert.True(RenownThresholds.AllowsAnotherSettlement(existingSettlementCount: 2, renownTotal: 1000));
    }
}
