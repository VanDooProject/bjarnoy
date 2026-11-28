using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Tests.Reports;

/// <summary>Coverage for <see cref="ReportReadService"/>: per-side read state across the five report tables.</summary>
public sealed class ReportReadServiceTests : IDisposable
{
    private static readonly DateTimeOffset T0 = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly Guid WorldId = Guid.NewGuid();
    private static readonly Guid OtherWorldId = Guid.NewGuid();

    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly GameDbContext _db;
    private readonly TestTimeProvider _clock = new(T0);
    private readonly ReportReadService _service;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public ReportReadServiceTests()
    {
        _connection.Open();
        _db = new GameDbContext(new DbContextOptionsBuilder<GameDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();
        _db.Worlds.AddRange(
            new WorldEntity { Id = WorldId, Name = "w1" },
            new WorldEntity { Id = OtherWorldId, Name = "w2" });
        _db.SaveChanges();
        _service = new ReportReadService(_db, _clock);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private async Task<BattleReportEntity> AddBattleAsync(string attacker, string defender, Guid? world = null)
    {
        var r = new BattleReportEntity { WorldId = world ?? WorldId, AttackerOwnerId = attacker, DefenderOwnerId = defender };
        _db.BattleReports.Add(r);
        await _db.SaveChangesAsync(Ct);
        return r;
    }

    private async Task<FieldBattleReportEntity> AddFieldAsync(string a, string b)
    {
        var r = new FieldBattleReportEntity { WorldId = WorldId, SideAOwnerId = a, SideBOwnerId = b };
        _db.FieldBattleReports.Add(r);
        await _db.SaveChangesAsync(Ct);
        return r;
    }

    private async Task<TradeReportEntity> AddTradeAsync(string poster, string acceptor)
    {
        var r = new TradeReportEntity { WorldId = WorldId, PosterOwnerId = poster, AcceptorOwnerId = acceptor };
        _db.TradeReports.Add(r);
        await _db.SaveChangesAsync(Ct);
        return r;
    }

    private async Task<CampReportEntity> AddCampAsync(string owner, Guid? world = null)
    {
        var r = new CampReportEntity { WorldId = world ?? WorldId, OwnerId = owner };
        _db.CampReports.Add(r);
        await _db.SaveChangesAsync(Ct);
        return r;
    }

    private async Task<ArmyReportEntity> AddArmyAsync(string owner)
    {
        var r = new ArmyReportEntity { WorldId = WorldId, OwnerId = owner };
        _db.ArmyReports.Add(r);
        await _db.SaveChangesAsync(Ct);
        return r;
    }

    [Fact]
    public async Task Mark_battle_read_marks_only_the_callers_side()
    {
        var r = await AddBattleAsync("att", "def");

        Assert.True(await _service.MarkReadAsync(WorldId, "att", InboxReportKind.Battle, r.Id, Ct));

        var row = await _db.BattleReports.AsNoTracking().SingleAsync(Ct);
        Assert.Equal(T0, row.AttackerReadAt);
        Assert.Null(row.DefenderReadAt);
    }

    [Fact]
    public async Task Mark_read_marks_both_sides_when_the_player_is_on_both()
    {
        var r = await AddBattleAsync("same", "same");

        Assert.True(await _service.MarkReadAsync(WorldId, "same", InboxReportKind.Battle, r.Id, Ct));

        var row = await _db.BattleReports.AsNoTracking().SingleAsync(Ct);
        Assert.Equal(T0, row.AttackerReadAt);
        Assert.Equal(T0, row.DefenderReadAt);
    }

    [Fact]
    public async Task Mark_read_by_non_party_wrong_world_or_unknown_id_is_false_and_changes_nothing()
    {
        var r = await AddBattleAsync("att", "def");

        Assert.False(await _service.MarkReadAsync(WorldId, "stranger", InboxReportKind.Battle, r.Id, Ct));
        Assert.False(await _service.MarkReadAsync(OtherWorldId, "att", InboxReportKind.Battle, r.Id, Ct));
        Assert.False(await _service.MarkReadAsync(WorldId, "att", InboxReportKind.Battle, Guid.NewGuid(), Ct));
        Assert.False(await _service.MarkReadAsync(WorldId, "att", InboxReportKind.Camp, r.Id, Ct));

        var row = await _db.BattleReports.AsNoTracking().SingleAsync(Ct);
        Assert.Null(row.AttackerReadAt);
        Assert.Null(row.DefenderReadAt);
    }

    [Fact]
    public async Task Marking_twice_keeps_the_first_read_time()
    {
        var r = await AddBattleAsync("att", "def");
        await _service.MarkReadAsync(WorldId, "att", InboxReportKind.Battle, r.Id, Ct);

        _clock.Advance(TimeSpan.FromHours(3));
        Assert.True(await _service.MarkReadAsync(WorldId, "att", InboxReportKind.Battle, r.Id, Ct));

        var row = await _db.BattleReports.AsNoTracking().SingleAsync(Ct);
        Assert.Equal(T0, row.AttackerReadAt);
    }

    [Fact]
    public async Task Mark_read_works_for_every_kind()
    {
        var field = await AddFieldAsync("a", "b");
        var trade = await AddTradeAsync("poster", "acceptor");
        var camp = await AddCampAsync("c");
        var army = await AddArmyAsync("d");

        Assert.True(await _service.MarkReadAsync(WorldId, "b", InboxReportKind.Field, field.Id, Ct));
        Assert.True(await _service.MarkReadAsync(WorldId, "acceptor", InboxReportKind.Trade, trade.Id, Ct));
        Assert.True(await _service.MarkReadAsync(WorldId, "c", InboxReportKind.Camp, camp.Id, Ct));
        Assert.True(await _service.MarkReadAsync(WorldId, "d", InboxReportKind.Army, army.Id, Ct));

        var f = await _db.FieldBattleReports.AsNoTracking().SingleAsync(Ct);
        Assert.Null(f.SideAReadAt);
        Assert.Equal(T0, f.SideBReadAt);
        var t = await _db.TradeReports.AsNoTracking().SingleAsync(Ct);
        Assert.Null(t.PosterReadAt);
        Assert.Equal(T0, t.AcceptorReadAt);
        Assert.Equal(T0, (await _db.CampReports.AsNoTracking().SingleAsync(Ct)).ReadAt);
        Assert.Equal(T0, (await _db.ArmyReports.AsNoTracking().SingleAsync(Ct)).ReadAt);
    }

    [Fact]
    public async Task Mark_all_read_marks_only_the_callers_sides_in_that_world()
    {
        await AddBattleAsync("me", "other");
        await AddBattleAsync("other", "me");
        await AddBattleAsync("me", "other", world: OtherWorldId);
        await AddFieldAsync("me", "other");
        await AddTradeAsync("other", "me");
        await AddCampAsync("me");
        await AddCampAsync("other");
        await AddCampAsync("me", world: OtherWorldId);
        await AddArmyAsync("me");

        var marked = await _service.MarkAllReadAsync(WorldId, "me", Ct);

        Assert.Equal(6, marked);
        var battles = await _db.BattleReports.AsNoTracking().ToListAsync(Ct);
        var mine = battles.Single(b => b.WorldId == WorldId && b.AttackerOwnerId == "me");
        Assert.NotNull(mine.AttackerReadAt);
        Assert.Null(mine.DefenderReadAt);
        var asDefender = battles.Single(b => b.DefenderOwnerId == "me");
        Assert.NotNull(asDefender.DefenderReadAt);
        Assert.Null(asDefender.AttackerReadAt);
        Assert.Null(battles.Single(b => b.WorldId != WorldId).AttackerReadAt);

        var camps = await _db.CampReports.AsNoTracking().ToListAsync(Ct);
        Assert.Null(camps.Single(c => c.OwnerId == "other").ReadAt);
        Assert.Null(camps.Single(c => c.WorldId != WorldId).ReadAt);
        Assert.NotNull(camps.Single(c => c.OwnerId == "me" && c.WorldId == WorldId).ReadAt);
    }

    [Fact]
    public async Task Mark_all_read_a_second_time_marks_nothing_and_keeps_times()
    {
        await AddBattleAsync("me", "other");
        await AddArmyAsync("me");
        Assert.Equal(2, await _service.MarkAllReadAsync(WorldId, "me", Ct));

        _clock.Advance(TimeSpan.FromHours(1));

        Assert.Equal(0, await _service.MarkAllReadAsync(WorldId, "me", Ct));
        Assert.Equal(T0, (await _db.ArmyReports.AsNoTracking().SingleAsync(Ct)).ReadAt);
    }

    [Theory]
    [InlineData("battle", InboxReportKind.Battle)]
    [InlineData("Field", InboxReportKind.Field)]
    [InlineData("CAMP", InboxReportKind.Camp)]
    [InlineData("army", InboxReportKind.Army)]
    [InlineData("trade", InboxReportKind.Trade)]
    public void TryParseKind_accepts_the_wire_names(string wire, InboxReportKind expected)
    {
        Assert.True(ReportReadService.TryParseKind(wire, out var kind));
        Assert.Equal(expected, kind);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("siege")]
    [InlineData("1")]
    public void TryParseKind_rejects_anything_else(string? wire) =>
        Assert.False(ReportReadService.TryParseKind(wire, out _));
}
