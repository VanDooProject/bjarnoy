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

/// <summary>Infra-level coverage for <see cref="FieldBattleReportService"/> (issue #206).</summary>
public sealed class FieldBattleReportServiceTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly GameDbContext _dbContext;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public FieldBattleReportServiceTests()
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

    private static FieldBattleReportEntity MakeReport(Guid sideASettlementId, Guid sideBSettlementId) =>
        FieldBattleReportEntity.FromDomain(
            Guid.CreateVersion7(),
            DateTimeOffset.UtcNow,
            new HexCoord(1, 2),
            Guid.CreateVersion7(),
            sideASettlementId,
            Guid.CreateVersion7(),
            sideBSettlementId,
            new FieldBattlePlan(
                SideALosses: [new UnitStack(UnitType.Axeman, 2)],
                SideASurvivors: [new UnitStack(UnitType.Axeman, 8)],
                SideBLosses: [new UnitStack(UnitType.Spearman, 5)],
                SideBSurvivors: [],
                LootTakenByWinner: new ResourceAmounts(10, 0, 0, 0),
                Winner: FieldBattleWinner.SideA,
                SideAPower: 400,
                SideBPower: 75,
                SideAWasDefending: false,
                SideBWasDefending: false),
            seed: 42);

    [Fact]
    public async Task GetAsync_returns_the_report_with_its_lines()
    {
        var settlementA = Guid.NewGuid();
        var settlementB = Guid.NewGuid();
        var report = MakeReport(settlementA, settlementB);
        _dbContext.FieldBattleReports.Add(report);
        await _dbContext.SaveChangesAsync(Ct);

        var service = new FieldBattleReportService(_dbContext);
        var loaded = await service.GetAsync(report.Id, Ct);

        Assert.NotNull(loaded);
        // SideALosses(1) + SideASurvivors(1) + SideBLosses(1) + SideBSurvivors(0, wiped out).
        Assert.Equal(3, loaded!.Lines.Count);
        Assert.Equal((int)FieldBattleWinner.SideA, loaded.Winner);
    }

    [Fact]
    public async Task GetAsync_returns_null_for_an_unknown_id()
    {
        var service = new FieldBattleReportService(_dbContext);
        var loaded = await service.GetAsync(Guid.NewGuid(), Ct);

        Assert.Null(loaded);
    }

    [Fact]
    public async Task GetForSettlementAsync_finds_reports_from_either_side_newest_first()
    {
        var settlementA = Guid.NewGuid();
        var settlementB = Guid.NewGuid();
        var settlementC = Guid.NewGuid();

        var older = MakeReport(settlementA, settlementB);
        older.OccurredAt = DateTimeOffset.UtcNow.AddHours(-1);
        var newer = MakeReport(settlementB, settlementC);
        newer.OccurredAt = DateTimeOffset.UtcNow;
        var unrelated = MakeReport(settlementC, Guid.NewGuid());
        _dbContext.FieldBattleReports.AddRange(older, newer, unrelated);
        await _dbContext.SaveChangesAsync(Ct);

        var service = new FieldBattleReportService(_dbContext);
        var results = await service.GetForSettlementAsync(settlementB, Ct);

        Assert.Equal(2, results.Count);
        Assert.Equal(newer.Id, results[0].Id);
        Assert.Equal(older.Id, results[1].Id);
    }
}
