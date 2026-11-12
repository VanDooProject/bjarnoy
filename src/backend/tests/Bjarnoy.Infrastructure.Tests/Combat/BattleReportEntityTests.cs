using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Tests.Combat;

/// <summary>A battle report with a ship fight survives storage: the line rows of every fight come back where they belong.</summary>
public sealed class BattleReportEntityTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly GameDbContext _dbContext;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public BattleReportEntityTests()
    {
        _connection.Open();
        _dbContext = new GameDbContext(new DbContextOptionsBuilder<GameDbContext>().UseSqlite(_connection).Options);
        _dbContext.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _dbContext.Dispose();
        _connection.Dispose();
    }

    private static BattleReport TwoFightReport(Guid attackerSettlementId, Guid defenderSettlementId) => new()
    {
        Id = Guid.CreateVersion7(),
        OccurredAt = DateTimeOffset.UnixEpoch.AddHours(5),
        AttackerArmyId = Guid.CreateVersion7(),
        AttackerSettlementId = attackerSettlementId,
        DefenderSettlementId = defenderSettlementId,
        AttackerLines = [new BattleReportAttackerLine(UnitType.Spearman, 20, 6, 14)],
        DefenderLines = [new BattleReportDefenderLine(UnitType.Axeman, 8, 0)],
        LootTaken = new ResourceAmounts(10, 20, 0, 5),
        AttackPower = 300,
        DefensePower = 200,
        Winner = BattleWinner.Attacker,
        Seed = 7,
        Siege = new BattleReportSiegeLine(new HexCoord(1, 2), BuildingType.Farm, 5, 1, false),
        ShipFight = new BattleReportShipFight(
            [new BattleReportAttackerLine(UnitType.Longship, 2, 1, 1), new BattleReportAttackerLine(UnitType.FireShip, 30, 4, 26)],
            [new BattleReportDefenderLine(UnitType.Longship, 2, 0)],
            120, 80, BattleWinner.Attacker),
        Drowned = [new UnitStack(UnitType.Spearman, 20)],
        FireShipsBurned = 20,
        FireSiege = new BattleReportSiegeLine(new HexCoord(5, 0), BuildingType.Dockyard, 3, 1, false),
    };

    [Fact]
    public async Task A_report_with_both_fights_round_trips_through_the_database()
    {
        var report = TwoFightReport(Guid.CreateVersion7(), Guid.CreateVersion7());
        _dbContext.BattleReports.Add(BattleReportEntity.FromDomain(report));
        await _dbContext.SaveChangesAsync(Ct);
        _dbContext.ChangeTracker.Clear();

        var stored = await new BattleReportService(_dbContext).GetAsync(report.Id, Ct);

        var back = stored!.ToDomain();
        Assert.Equal(report.AttackerLines, back.AttackerLines);
        Assert.Equal(report.DefenderLines, back.DefenderLines);
        // Line rows carry no order of their own, so compare as sets.
        Assert.Equal(
            report.ShipFight!.AttackerLines.OrderBy(l => l.Type), back.ShipFight!.AttackerLines.OrderBy(l => l.Type));
        Assert.Equal(report.ShipFight.DefenderLines, back.ShipFight.DefenderLines);
        Assert.Equal((120d, 80d, BattleWinner.Attacker), (back.ShipFight.AttackPower, back.ShipFight.DefensePower, back.ShipFight.Winner));
        Assert.Equal(report.Drowned, back.Drowned);
        Assert.Equal(20, back.FireShipsBurned);
        Assert.Equal(report.FireSiege, back.FireSiege);
        Assert.Equal(report.Siege, back.Siege);
    }

    [Fact]
    public async Task A_report_stored_without_a_ship_fight_reads_as_before()
    {
        var report = TwoFightReport(Guid.CreateVersion7(), Guid.CreateVersion7()) with
        {
            ShipFight = null, Drowned = [], FireShipsBurned = 0, FireSiege = null,
        };
        _dbContext.BattleReports.Add(BattleReportEntity.FromDomain(report));
        await _dbContext.SaveChangesAsync(Ct);
        _dbContext.ChangeTracker.Clear();

        var back = (await new BattleReportService(_dbContext).GetAsync(report.Id, Ct))!.ToDomain();

        Assert.Null(back.ShipFight);
        Assert.Empty(back.Drowned);
        Assert.Equal(0, back.FireShipsBurned);
        Assert.Null(back.FireSiege);
        Assert.Equal(report.AttackerLines, back.AttackerLines);
        Assert.Equal(report.DefenderLines, back.DefenderLines);
    }
}
