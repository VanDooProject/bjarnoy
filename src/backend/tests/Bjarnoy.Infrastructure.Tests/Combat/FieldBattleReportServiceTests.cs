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

    private static readonly Guid WorldId = Guid.NewGuid();

    /// <summary>A report between two settlements whose players are named after them ("owner-of-" + the settlement id).</summary>
    private static FieldBattleReportEntity MakeReport(Guid sideASettlementId, Guid sideBSettlementId)
    {
        var report = BuildReport(sideASettlementId, sideBSettlementId);
        report.WorldId = WorldId;
        report.SideAOwnerId = OwnerOf(sideASettlementId);
        report.SideBOwnerId = OwnerOf(sideBSettlementId);
        return report;
    }

    private static string OwnerOf(Guid settlementId) => $"owner-of-{settlementId}";

    private static FieldBattleReportEntity BuildReport(Guid sideASettlementId, Guid sideBSettlementId) =>
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
    public async Task GetForOwnerAsync_finds_reports_from_either_side_newest_first()
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
        var results = await service.GetForOwnerAsync(WorldId, OwnerOf(settlementB), Ct);

        Assert.Equal(2, results.Count);
        Assert.Equal(newer.Id, results[0].Id);
        Assert.Equal(older.Id, results[1].Id);

        // Another world's inbox of the same player stays separate.
        Assert.Empty(await service.GetForOwnerAsync(Guid.NewGuid(), OwnerOf(settlementB), Ct));
    }

    [Fact]
    public async Task GetSideNamesAsync_names_both_sides_and_skips_a_settlement_that_is_gone()
    {
        var world = new WorldEntity { Name = "Test", MaxPlayers = 100 };
        var user = new UserEntity { UserName = "u", NormalizedUserName = "U", PasswordHash = "hash" };
        var island = new IslandEntity
        {
            WorldId = world.Id, Index = 0, Name = "Isle", CentreQ = 0, CentreR = 0, StartPositions = [new HexPoint(0, 0)],
        };
        SettlementEntity Settle(string name, string owner, int centreQ) => new()
        {
            WorldId = world.Id, IslandId = island.Id, Name = name, OwnerName = owner,
            OwnerId = user.Id.ToString(), UserId = user.Id, CentreQ = centreQ, CentreR = 0,
        };
        var alpha = Settle("Alpha", "Ann", 0);
        var beta = Settle("Beta", "Ben", 5);
        _dbContext.AddRange(world, user, island, alpha, beta);
        var report = MakeReport(alpha.Id, beta.Id);
        var orphan = MakeReport(alpha.Id, Guid.NewGuid());
        _dbContext.FieldBattleReports.AddRange(report, orphan);
        await _dbContext.SaveChangesAsync(Ct);

        var names = await new FieldBattleReportService(_dbContext).GetSideNamesAsync([report, orphan], Ct);

        Assert.Equal(new FieldBattleSideName("Alpha", "Ann"), names[alpha.Id]);
        Assert.Equal(new FieldBattleSideName("Beta", "Ben"), names[beta.Id]);
        Assert.Equal(2, names.Count);
    }
}
