using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.TestSupport;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Per-player report read state: every report kind lists <c>read: false</c> until its player marks it, marking is
/// limited to the reports the caller is a party to, and "mark all" covers the caller's whole inbox in a world.
/// </summary>
public sealed class ReportReadEndpointsTests : IAsyncLifetime
{
    private const string OwnerA = "ulf-player";
    private const string OwnerB = "sigrid-player";

    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private HttpClient ClientOf(string owner)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        return client;
    }

    private async Task<Guid> NewWorldAsync() =>
        (await _factory.CreateWorldAsync($"w-{Guid.CreateVersion7():N}"[..20], 21, 60, cancellationToken: Ct)).Id;

    /// <summary>One report of every kind; <paramref name="a"/> is a party to all of them, <paramref name="b"/> to the battle, field and trade ones.</summary>
    private async Task<Planted> PlantAllAsync(Guid worldId, string a, string b)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var battle = new BattleReportEntity
        {
            OccurredAt = DateTimeOffset.UnixEpoch, WorldId = worldId, AttackerOwnerId = a, DefenderOwnerId = b,
        };
        var field = new FieldBattleReportEntity
        {
            OccurredAt = DateTimeOffset.UnixEpoch, WorldId = worldId, SideAOwnerId = a, SideBOwnerId = b,
        };
        var camp = new CampReportEntity
        {
            OccurredAt = DateTimeOffset.UnixEpoch, WorldId = worldId, Family = "wolfden", OwnerId = a,
        };
        var army = ArmyReportEntity.Create(
            worldId, a, SystemUserIds.Abandoned, ArmyReportKind.Stuck, DateTimeOffset.UnixEpoch, Guid.CreateVersion7(),
            new HexCoord(3, -2), ArmyMission.Move, [new UnitStack(UnitType.Axeman, 4)]);
        var trade = new TradeReportEntity
        {
            OfferId = Guid.CreateVersion7(), CompletedAt = DateTimeOffset.UnixEpoch, WorldId = worldId,
            PosterOwnerId = a, AcceptorOwnerId = b,
        };
        db.BattleReports.Add(battle);
        db.FieldBattleReports.Add(field);
        db.CampReports.Add(camp);
        db.ArmyReports.Add(army);
        db.TradeReports.Add(trade);
        await db.SaveChangesAsync(Ct);
        return new Planted(battle.Id, field.Id, camp.Id, army.Id, trade.Id);
    }

    private sealed record Planted(Guid Battle, Guid Field, Guid Camp, Guid Army, Guid Trade);

    private async Task<(bool Battle, bool Field, bool Camp, bool Army, bool Trade)> ReadFlagsAsync(HttpClient client, Guid worldId, Planted ids)
    {
        var battles = await client.GetFromJsonAsync<List<BattleReportResponse>>($"/api/v1/worlds/{worldId}/reports", SqliteApiFixture.StrictJson, Ct);
        var fields = await client.GetFromJsonAsync<List<FieldBattleReportResponse>>($"/api/v1/worlds/{worldId}/field-reports", SqliteApiFixture.StrictJson, Ct);
        var camps = await client.GetFromJsonAsync<List<CampReportResponse>>($"/api/v1/worlds/{worldId}/camp-reports", SqliteApiFixture.StrictJson, Ct);
        var armies = await client.GetFromJsonAsync<List<ArmyReportResponse>>($"/api/v1/worlds/{worldId}/army-reports", SqliteApiFixture.StrictJson, Ct);
        var trades = await client.GetFromJsonAsync<List<TradeReportResponse>>($"/api/v1/worlds/{worldId}/trade-reports", SqliteApiFixture.StrictJson, Ct);
        return (
            battles!.Single(r => r.Id == ids.Battle).Read,
            fields!.Single(r => r.Id == ids.Field).Read,
            camps!.Single(r => r.Id == ids.Camp).Read,
            armies!.Single(r => r.Id == ids.Army).Read,
            trades!.Single(r => r.Id == ids.Trade).Read);
    }

    [Fact]
    public async Task Every_kind_lists_unread_until_its_player_marks_it()
    {
        using var clientA = ClientOf(OwnerA);
        var worldId = await NewWorldAsync();
        var ids = await PlantAllAsync(worldId, OwnerA, OwnerB);

        Assert.Equal((false, false, false, false, false), await ReadFlagsAsync(clientA, worldId, ids));
    }

    [Theory]
    [InlineData("battle")]
    [InlineData("field")]
    [InlineData("camp")]
    [InlineData("army")]
    [InlineData("trade")]
    public async Task Marking_one_report_reads_it_for_the_caller_only(string kind)
    {
        using var clientA = ClientOf(OwnerA);
        using var clientB = ClientOf(OwnerB);
        var worldId = await NewWorldAsync();
        var ids = await PlantAllAsync(worldId, OwnerA, OwnerB);
        var id = kind switch
        {
            "battle" => ids.Battle, "field" => ids.Field, "camp" => ids.Camp, "army" => ids.Army, _ => ids.Trade,
        };

        var response = await clientA.PostAsync($"/api/v1/worlds/{worldId}/reports/{kind}/{id}/read", null, Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var a = await ReadFlagsAsync(clientA, worldId, ids);
        Assert.Equal(1, new[] { a.Battle, a.Field, a.Camp, a.Army, a.Trade }.Count(x => x));
        Assert.True(kind switch
        {
            "battle" => a.Battle, "field" => a.Field, "camp" => a.Camp, "army" => a.Army, _ => a.Trade,
        });
        if (kind is "battle" or "field" or "trade")
        {
            // The other party's side stays unread.
            var other = await ReadOtherPartyAsync(clientB, worldId, kind, id);
            Assert.False(other);
        }
    }

    private static async Task<bool> ReadOtherPartyAsync(HttpClient client, Guid worldId, string kind, Guid id) => kind switch
    {
        "battle" => (await client.GetFromJsonAsync<List<BattleReportResponse>>($"/api/v1/worlds/{worldId}/reports", SqliteApiFixture.StrictJson, Ct))!.Single(r => r.Id == id).Read,
        "field" => (await client.GetFromJsonAsync<List<FieldBattleReportResponse>>($"/api/v1/worlds/{worldId}/field-reports", SqliteApiFixture.StrictJson, Ct))!.Single(r => r.Id == id).Read,
        _ => (await client.GetFromJsonAsync<List<TradeReportResponse>>($"/api/v1/worlds/{worldId}/trade-reports", SqliteApiFixture.StrictJson, Ct))!.Single(r => r.Id == id).Read,
    };

    [Fact]
    public async Task A_player_cannot_mark_a_report_they_are_no_party_to()
    {
        using var clientB = ClientOf(OwnerB);
        var worldId = await NewWorldAsync();
        var ids = await PlantAllAsync(worldId, OwnerA, OwnerB);

        var response = await clientB.PostAsync($"/api/v1/worlds/{worldId}/reports/camp/{ids.Camp}/read", null, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        Assert.Null((await db.CampReports.AsNoTracking().SingleAsync(Ct)).ReadAt);
    }

    [Fact]
    public async Task Marking_an_unknown_report_is_not_found()
    {
        using var clientA = ClientOf(OwnerA);
        var worldId = await NewWorldAsync();

        var response = await clientA.PostAsync($"/api/v1/worlds/{worldId}/reports/battle/{Guid.CreateVersion7()}/read", null, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Marking_without_an_owner_id_is_a_bad_request()
    {
        using var anonymous = _factory.CreateClient();
        var worldId = await NewWorldAsync();

        Assert.Equal(HttpStatusCode.BadRequest,
            (await anonymous.PostAsync($"/api/v1/worlds/{worldId}/reports/battle/{Guid.CreateVersion7()}/read", null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await anonymous.PostAsync($"/api/v1/worlds/{worldId}/reports/read", null, Ct)).StatusCode);
    }

    [Fact]
    public async Task An_unknown_report_kind_is_a_bad_request()
    {
        using var clientA = ClientOf(OwnerA);
        var worldId = await NewWorldAsync();

        var response = await clientA.PostAsync($"/api/v1/worlds/{worldId}/reports/siege/{Guid.CreateVersion7()}/read", null, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Mark_all_reads_the_callers_whole_inbox_once()
    {
        using var clientA = ClientOf(OwnerA);
        using var clientB = ClientOf(OwnerB);
        var worldId = await NewWorldAsync();
        var ids = await PlantAllAsync(worldId, OwnerA, OwnerB);

        var first = await clientA.PostAsync($"/api/v1/worlds/{worldId}/reports/read", null, Ct);
        var second = await clientA.PostAsync($"/api/v1/worlds/{worldId}/reports/read", null, Ct);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(5, (await first.Content.ReadFromJsonAsync<MarkReadResponse>(SqliteApiFixture.StrictJson, Ct))!.MarkedRead);
        Assert.Equal(0, (await second.Content.ReadFromJsonAsync<MarkReadResponse>(SqliteApiFixture.StrictJson, Ct))!.MarkedRead);
        Assert.Equal((true, true, true, true, true), await ReadFlagsAsync(clientA, worldId, ids));
        Assert.False(await ReadOtherPartyAsync(clientB, worldId, "battle", ids.Battle));
    }

    [Fact]
    public async Task Fetching_one_battle_report_by_id_carries_the_viewers_read_state()
    {
        using var clientA = ClientOf(OwnerA);
        var worldId = await NewWorldAsync();
        var ids = await PlantAllAsync(worldId, OwnerA, OwnerB);
        Assert.False((await clientA.GetFromJsonAsync<BattleReportResponse>($"/api/v1/reports/{ids.Battle}", SqliteApiFixture.StrictJson, Ct))!.Read);

        await clientA.PostAsync($"/api/v1/worlds/{worldId}/reports/battle/{ids.Battle}/read", null, Ct);

        Assert.True((await clientA.GetFromJsonAsync<BattleReportResponse>($"/api/v1/reports/{ids.Battle}", SqliteApiFixture.StrictJson, Ct))!.Read);
    }
}
