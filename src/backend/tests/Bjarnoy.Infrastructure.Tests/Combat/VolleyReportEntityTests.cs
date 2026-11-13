using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Infrastructure.Tests.Combat;

/// <summary>The volley data of a report (powers, losses split into volley and fight) survives the entity mapping of all three report kinds.</summary>
public sealed class VolleyReportEntityTests
{
    [Fact]
    public void A_battle_report_keeps_its_volley_powers_and_the_volley_part_of_every_lines_losses()
    {
        var report = new BattleReport
        {
            Id = Guid.CreateVersion7(),
            OccurredAt = DateTimeOffset.UnixEpoch.AddHours(2),
            AttackerArmyId = Guid.CreateVersion7(),
            AttackerSettlementId = Guid.CreateVersion7(),
            DefenderSettlementId = Guid.CreateVersion7(),
            AttackerLines = [new BattleReportAttackerLine(UnitType.Skirmisher, 20, 12, 8, VolleyLost: 7)],
            DefenderLines = [new BattleReportDefenderLine(UnitType.Bowman, 10, 0, VolleyLost: 3)],
            LootTaken = ResourceAmounts.Zero,
            AttackPower = 130,
            DefensePower = 39,
            AttackerVolleyPower = 200,
            DefenderVolleyPower = 150,
            Winner = BattleWinner.Attacker,
            Seed = 4,
        };

        var back = BattleReportEntity.FromDomain(report).ToDomain();

        Assert.Equal(200, back.AttackerVolleyPower);
        Assert.Equal(150, back.DefenderVolleyPower);
        Assert.Equal(report.AttackerLines, back.AttackerLines);
        Assert.Equal(report.DefenderLines, back.DefenderLines);
    }

    [Fact]
    public void A_field_battle_report_keeps_its_volley_powers_and_loss_lines()
    {
        var plan = new FieldBattlePlan(
            SideALosses: [new UnitStack(UnitType.Skirmisher, 20)],
            SideASurvivors: [],
            SideBLosses: [new UnitStack(UnitType.Axeman, 7)],
            SideBSurvivors: [new UnitStack(UnitType.Axeman, 3), new UnitStack(UnitType.Bowman, 4)],
            LootTakenByWinner: ResourceAmounts.Zero,
            Winner: FieldBattleWinner.SideB,
            SideAPower: 200,
            SideBPower: 280,
            SideAWasDefending: false,
            SideBWasDefending: false)
        {
            SideAVolleyPower = 200,
            SideBVolleyPower = 80,
            SideBVolleyLosses = [new UnitStack(UnitType.Axeman, 3)],
        };

        var entity = FieldBattleReportEntity.FromDomain(
            Guid.CreateVersion7(), DateTimeOffset.UnixEpoch, new HexCoord(1, 2), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            plan, seed: 9);

        Assert.Equal(200, entity.SideAVolleyPower);
        Assert.Equal(80, entity.SideBVolleyPower);
        var axemen = entity.Lines.Single(l => l.Side == FieldBattleReportSide.SideB && l.IsLoss && l.UnitType == UnitType.Axeman);
        Assert.Equal(7, axemen.Count);
        Assert.Equal(3, axemen.VolleyCount);
        Assert.All(entity.Lines.Where(l => !l.IsLoss), l => Assert.Equal(0, l.VolleyCount));
    }

    [Fact]
    public void A_camp_report_keeps_its_volley_power_and_the_volley_kills_per_tier()
    {
        var camp = new Camp(new HexCoord(10, 0), CampFamilies.Wolfden, 1, TileOrientation.E);
        UnitStack[] army = [new(UnitType.Bowman, 100)];
        var garrison = CampGarrison.Full(CampStrength.Strong, 1);
        var plan = CampBattleResolver.Hunt(army, garrison, camp, 1, seed: 1, provisionsAtBattle: double.PositiveInfinity);
        var report = CampReport.From(
            Guid.CreateVersion7(), Guid.NewGuid(), CampReportKind.Hunt, DateTimeOffset.UnixEpoch, camp, 1, Guid.NewGuid(), Guid.NewGuid(),
            army, garrison, plan, seed: 1);

        var back = CampReportEntity.FromDomain(report).ToDomain();

        Assert.Equal(2000, back.ArmyVolleyPower);
        Assert.Equal(report.BeastLines, back.BeastLines);
        Assert.Equal(2, back.BeastLines.Single(l => l.Tier == BeastTier.Adult).VolleyLost);
    }
}
