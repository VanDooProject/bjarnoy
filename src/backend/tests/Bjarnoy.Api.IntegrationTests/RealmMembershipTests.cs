using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The server sends the chain-rule realm (<c>SettlementResponse.Realm</c>) because the live client cannot rebuild it, and
/// <c>SettlementSummary.Mine</c> tells the caller which listed settlements are theirs.
/// </summary>
public sealed class RealmMembershipTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private static HttpClient As(HttpClient client, string ownerId)
    {
        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
        return client;
    }

    private async Task<SettlementResponse> FoundAsync(HttpClient client, Guid worldId, string ownerId)
    {
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldId}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId),
            Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<SettlementResponse>(Ct);
    }

    /// <summary>Plants an anonymous player's settlement (longhouse level 1 plus level-1 towers) directly, bypassing founding rules.</summary>
    private async Task<Guid> PlantAsync(
        Guid worldId, Guid islandId, string ownerId, int centreQ, int centreR, params HexCoord[] towers)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            UserId = SystemUserIds.Abandoned,
            Name = Unique("plant"),
            OwnerName = "Planted",
            OwnerId = ownerId,
            CentreQ = centreQ,
            CentreR = centreR,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = [new PlacedBuildingEntity { Q = centreQ, R = centreR, Type = BuildingType.Longhouse, Level = 1 }],
        };
        foreach (var t in towers)
        {
            settlement.Buildings.Add(new PlacedBuildingEntity { Q = t.Q, R = t.R, Type = BuildingType.Tower, Level = 1 });
        }

        db.Settlements.Add(settlement);
        await db.SaveChangesAsync(Ct);
        return settlement.Id;
    }

    private async Task AddTowersAsync(Guid settlementId, params HexCoord[] towers)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var entity = await db.Settlements.Include(s => s.Buildings).FirstAsync(s => s.Id == settlementId, Ct);
        foreach (var t in towers)
        {
            entity.Buildings.Add(new PlacedBuildingEntity { Q = t.Q, R = t.R, Type = BuildingType.Tower, Level = 1 });
        }

        await db.SaveChangesAsync(Ct);
    }

    private static async Task<SettlementResponse> GetAsync(HttpClient client, Guid id)
    {
        var response = await client.GetAsync($"/api/v1/settlements/{id}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.ReadStrictAsync<SettlementResponse>(Ct);
    }

    [Fact]
    public async Task The_realm_lists_every_settlement_of_the_player_with_the_connected_tower_discs_and_no_cut_off_one()
    {
        using var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 80, cancellationToken: Ct);
        var owner = Unique("owner");
        As(client, owner);
        var a = await FoundAsync(client, world.Id, owner);
        var centreA = new HexCoord(a.Q, a.R);
        var longhouseRadius = Settlement.ClaimRadiusForLonghouseLevel(1);
        var towerRadius = Settlement.TowerClaimRadius(1);

        // A's tower stands on the edge of A's longhouse disc; B lies beyond the tower's disc so that B's own tower, reached only
        // through A's tower, is connected (and B's cut-off tower, far from everything, is not).
        var towerA = new HexCoord(centreA.Q + longhouseRadius, centreA.R);
        var reach = new HexCoord(towerA.Q + towerRadius, towerA.R);
        var centreB = new HexCoord(reach.Q + longhouseRadius + 1, reach.R);
        var towerB = reach;
        var cutOff = new HexCoord(centreB.Q + 30, centreB.R);
        await AddTowersAsync(a.Id, towerA);
        var bId = await PlantAsync(world.Id, a.IslandId, owner, centreB.Q, centreB.R, towerB, cutOff);

        var readA = await GetAsync(client, a.Id);
        var readB = await GetAsync(client, bId);

        Assert.Equal([a.Id, bId], readA.Realm.Select(m => m.SettlementId));
        Assert.Equal([bId, a.Id], readB.Realm.Select(m => m.SettlementId));

        var discsA = readA.Realm.Single(m => m.SettlementId == a.Id).Discs;
        Assert.Equal(new ClaimDiscResponse(centreA.Q, centreA.R, longhouseRadius), discsA[0]);
        Assert.Contains(new ClaimDiscResponse(towerA.Q, towerA.R, towerRadius), discsA);

        var discsB = readA.Realm.Single(m => m.SettlementId == bId).Discs;
        Assert.Equal(new ClaimDiscResponse(centreB.Q, centreB.R, longhouseRadius), discsB[0]);
        Assert.Contains(new ClaimDiscResponse(towerB.Q, towerB.R, towerRadius), discsB);
        Assert.DoesNotContain(discsB, d => d.Q == cutOff.Q && d.R == cutOff.R);
        Assert.Equal(2, discsB.Count);
    }

    [Fact]
    public async Task Another_players_settlement_on_the_same_island_is_never_in_the_realm()
    {
        using var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 80, cancellationToken: Ct);
        var owner = Unique("owner");
        As(client, owner);
        var a = await FoundAsync(client, world.Id, owner);
        var bId = await PlantAsync(world.Id, a.IslandId, owner, a.Q + 8, a.R);
        var rivalOwner = Unique("rival");
        var rivalId = await PlantAsync(world.Id, a.IslandId, rivalOwner, a.Q + 4, a.R + 4);

        var readA = await GetAsync(client, a.Id);
        Assert.Equal([a.Id, bId], readA.Realm.Select(m => m.SettlementId));
        Assert.DoesNotContain(readA.Realm, m => m.SettlementId == rivalId);

        As(client, rivalOwner);
        var rivalRead = await GetAsync(client, rivalId);
        Assert.Equal([rivalId], rivalRead.Realm.Select(m => m.SettlementId));
    }

    [Fact]
    public async Task The_world_list_marks_the_callers_settlements_as_mine_and_an_explored_rival_as_not()
    {
        using var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 80, cancellationToken: Ct);
        var owner = Unique("owner");
        As(client, owner);
        var a = await FoundAsync(client, world.Id, owner);
        var bId = await PlantAsync(world.Id, a.IslandId, owner, a.Q + 8, a.R);
        var rivalId = await PlantAsync(world.Id, a.IslandId, Unique("rival"), a.Q + 4, a.R);

        var list = await client.GetFromJsonAsync<List<SettlementSummary>>(
            $"/api/v1/worlds/{world.Id}/settlements", SqliteApiFixture.StrictJson, Ct);

        Assert.NotNull(list);
        Assert.True(list.Single(s => s.Id == a.Id).Mine);
        Assert.True(list.Single(s => s.Id == bId).Mine);
        Assert.False(list.Single(s => s.Id == rivalId).Mine);
    }
}
