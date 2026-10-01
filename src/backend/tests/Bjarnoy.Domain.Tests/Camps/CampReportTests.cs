using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Camps;

public class CampReportTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly Camp Wolves = new(new HexCoord(3, 1), CampFamilies.Wolfden, 2, TileOrientation.E);

    private static CampReport Report(CampGarrison before, CampFightPlan plan, IReadOnlyList<UnitStack> sent) =>
        CampReport.From(
            Guid.CreateVersion7(), Guid.CreateVersion7(), CampReportKind.Hunt, T0, Wolves, 2,
            Guid.CreateVersion7(), Guid.CreateVersion7(), sent, before, plan, seed: 9);

    [Fact]
    public void Kind_values_are_the_stored_numbers()
    {
        Assert.Equal(0, (int)CampReportKind.Hunt);
        Assert.Equal(1, (int)CampReportKind.Ambush);
        Assert.Equal(2, (int)CampReportKind.Tower);
    }

    [Fact]
    public void A_won_hunt_reports_units_beasts_loot_and_the_clear()
    {
        var before = new CampGarrison(4, 9, 1);
        var sent = new[] { new UnitStack(UnitType.Axeman, 50), new UnitStack(UnitType.Spearman, 10) };
        var plan = CampBattleResolver.Hunt(sent, before, Wolves, 2, seed: 5);

        var report = Report(before, plan, sent);

        Assert.Equal(CampFightWinner.Army, report.Winner);
        Assert.True(report.CampCleared);
        Assert.Equal(plan.Loot, report.Loot);
        Assert.Equal(plan.ArmyPower, report.ArmyPower);
        Assert.Equal(plan.CampPower, report.CampPower);
        Assert.Equal(
            plan.ArmyLosses.Sum(s => s.Count),
            report.UnitLines.Sum(l => l.Lost));
        Assert.Equal([50, 10], report.UnitLines.Select(l => l.Sent));
        Assert.Equal(
            [(BeastTier.Young, 4, 4), (BeastTier.Adult, 9, 9), (BeastTier.Alpha, 1, 1)],
            report.BeastLines.Select(l => (l.Tier, l.Before, l.Lost)));
    }

    [Fact]
    public void A_lost_hunt_is_not_a_clear_and_takes_no_loot()
    {
        var before = new CampGarrison(4, 9, 1);
        var sent = new[] { new UnitStack(UnitType.Thrall, 3) };
        var plan = CampBattleResolver.Hunt(sent, before, Wolves, 2, seed: 5);

        var report = Report(before, plan, sent);

        Assert.Equal(CampFightWinner.Camp, report.Winner);
        Assert.False(report.CampCleared);
        Assert.True(report.Loot.IsZero);
        Assert.Equal(3, report.UnitLines.Single().Lost);
    }

    [Fact]
    public void A_pickup_at_an_empty_camp_lists_no_beasts_and_is_not_a_clear()
    {
        var sent = new[] { new UnitStack(UnitType.Axeman, 10) };
        var plan = CampBattleResolver.Hunt(
            sent, CampGarrison.Empty, Wolves, 2, seed: 5, leftover: new ResourceAmounts(0, 0, 100, 0));

        var report = Report(CampGarrison.Empty, plan, sent);

        Assert.Empty(report.BeastLines);
        Assert.False(report.CampCleared);
        Assert.Equal(100, report.Loot.Food);
    }
}
