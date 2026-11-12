using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using Bjarnoy.TestSupport;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Army reports ("army stuck", "army starved") belong to the player, not to a settlement: a player lists only their own
/// in a world and can open only their own by id.
/// </summary>
public sealed class ArmyReportEndpointsTests : IAsyncLifetime
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

    private async Task<Guid> FoundAsync(HttpClient client, Guid worldId, string owner)
    {
        var islands = await client.GetFullIslandsAsync(worldId, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];
        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", owner), Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.ReadStrictAsync<SettlementResponse>(Ct)).Id;
    }

    private async Task<Guid> PlantAsync(Guid worldId, string owner, ArmyReportKind kind, int troops)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var report = ArmyReportEntity.Create(
            worldId, owner, SystemUserIds.Abandoned, kind, DateTimeOffset.UnixEpoch.AddHours(troops), Guid.CreateVersion7(),
            new HexCoord(3, -2), ArmyMission.Move, [new UnitStack(UnitType.Axeman, troops)]);
        db.ArmyReports.Add(report);
        await db.SaveChangesAsync(Ct);
        return report.Id;
    }

    [Fact]
    public async Task A_player_lists_only_their_own_army_reports_newest_first_and_opens_only_their_own()
    {
        using var clientA = ClientOf(OwnerA);
        using var clientB = ClientOf(OwnerB);
        var world = await _factory.CreateWorldAsync($"w-{Guid.CreateVersion7():N}"[..20], 21, 60, cancellationToken: Ct);
        await FoundAsync(clientA, world.Id, OwnerA);
        var older = await PlantAsync(world.Id, OwnerA, ArmyReportKind.Stuck, troops: 4);
        var newer = await PlantAsync(world.Id, OwnerA, ArmyReportKind.Starved, troops: 9);
        var foreign = await PlantAsync(world.Id, OwnerB, ArmyReportKind.Starved, troops: 7);

        var own = await clientA.GetFromJsonAsync<List<ArmyReportResponse>>(
            $"/api/v1/worlds/{world.Id}/army-reports", SqliteApiFixture.StrictJson, Ct);
        var others = await clientB.GetFromJsonAsync<List<ArmyReportResponse>>(
            $"/api/v1/worlds/{world.Id}/army-reports", SqliteApiFixture.StrictJson, Ct);

        Assert.Equal([newer, older], own!.Select(r => r.Id));
        Assert.Equal("starved", own![0].Kind);
        Assert.Equal(new HexPointResponse(3, -2), own[0].Hex);
        Assert.Equal([new ArmyReportUnitLineResponse("axeman", 9)], own[0].Units);
        Assert.Equal([foreign], others!.Select(r => r.Id));

        Assert.Equal(HttpStatusCode.OK, (await clientA.GetAsync($"/api/v1/army-reports/{newer}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await clientB.GetAsync($"/api/v1/army-reports/{newer}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await clientA.GetAsync($"/api/v1/army-reports/{foreign}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await clientA.GetAsync($"/api/v1/army-reports/{Guid.CreateVersion7()}", Ct)).StatusCode);
    }

    [Fact]
    public async Task A_caller_with_no_owner_lists_no_army_reports()
    {
        using var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync($"w-{Guid.CreateVersion7():N}"[..20], 21, 60, cancellationToken: Ct);
        await PlantAsync(world.Id, OwnerA, ArmyReportKind.Starved, troops: 3);

        var list = await client.GetFromJsonAsync<List<ArmyReportResponse>>(
            $"/api/v1/worlds/{world.Id}/army-reports", SqliteApiFixture.StrictJson, Ct);

        Assert.Empty(list!);
    }
}
