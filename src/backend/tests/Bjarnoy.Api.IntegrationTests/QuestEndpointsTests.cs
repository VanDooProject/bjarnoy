using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Bjarnoy.TestSupport;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>Onboarding quest claims end to end (economy.md section 7).</summary>
public sealed class QuestEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private const string OwnerId = "ulf-player";

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private static string ClaimUrl(Guid settlementId, string questId) =>
        $"/api/v1/settlements/{settlementId}/quests/{questId}/claim";

    private async Task<SettlementResponse> FoundAsync(HttpClient client)
    {
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFullIslandsAsync(world.Id, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", OwnerId),
            Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", OwnerId);
        return await response.ReadStrictAsync<SettlementResponse>(Ct);
    }

    private Task<SettlementResponse?> GetAsync(HttpClient client, Guid id) =>
        client.GetFromJsonAsync<SettlementResponse>($"/api/v1/settlements/{id}", SqliteApiFixture.StrictJson, Ct);

    /// <summary>Upgrades the Longhouse to level 2 and lets the (about 2 minute) build finish.</summary>
    private async Task UpgradeLonghouseAsync(HttpClient client, SettlementResponse settlement)
    {
        var queued = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("longhouse", settlement.Q, settlement.R), Ct);
        Assert.Equal(HttpStatusCode.Accepted, queued.StatusCode);
        _factory.Time.Advance(TimeSpan.FromMinutes(10));
    }

    [Fact]
    public async Task A_fresh_settlement_lists_every_quest_open_and_unclaimed()
    {
        using var client = _factory.CreateClient();
        var settlement = await FoundAsync(client);

        Assert.Equal(Quests.All.Select(q => q.Id), settlement.Quests.Select(q => q.Id));
        Assert.All(settlement.Quests, q =>
        {
            Assert.False(q.Completed);
            Assert.False(q.Claimed);
        });
        Assert.Equal(250, settlement.Quests.Single(q => q.Id == "longhouse2").Reward.Wood);
        Assert.Equal(new QuestProgressResponse(0, 3), settlement.Quests.Single(q => q.Id == "tower3").Progress);
        Assert.Null(settlement.Quests.Single(q => q.Id == "hunt1").Progress);
    }

    [Fact]
    public async Task Claiming_an_unfinished_quest_is_refused()
    {
        using var client = _factory.CreateClient();
        var settlement = await FoundAsync(client);

        var response = await client.PostAsync(ClaimUrl(settlement.Id, "longhouse2"), null, Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync(Ct);
        Assert.Contains("NotCompleted", body);
        Assert.Contains("not completed", body);
    }

    [Fact]
    public async Task An_unknown_quest_is_refused()
    {
        using var client = _factory.CreateClient();
        var settlement = await FoundAsync(client);

        var response = await client.PostAsync(ClaimUrl(settlement.Id, "nope"), null, Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("UnknownQuest", await response.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task A_completed_quest_pays_once_and_the_second_claim_is_a_409()
    {
        using var client = _factory.CreateClient();
        var settlement = await FoundAsync(client);
        await UpgradeLonghouseAsync(client, settlement);

        var before = (await GetAsync(client, settlement.Id))!;
        Assert.True(before.Quests.Single(q => q.Id == "longhouse2").Completed);

        var claim = await client.PostAsync(ClaimUrl(settlement.Id, "longhouse2"), null, Ct);
        Assert.Equal(HttpStatusCode.OK, claim.StatusCode);
        var after = await claim.Content.ReadFromJsonAsync<SettlementResponse>(SqliteApiFixture.StrictJson, Ct);

        var quest = after!.Quests.Single(q => q.Id == "longhouse2");
        Assert.True(quest.Claimed);
        Assert.Equal(
            Math.Min(before.Resources.Stock.Wood + 250, after.Resources.Capacity.Wood), after.Resources.Stock.Wood, 1);
        Assert.Equal(
            Math.Min(before.Resources.Stock.Food + 150, after.Resources.Capacity.Food), after.Resources.Stock.Food, 1);

        var again = await client.PostAsync(ClaimUrl(settlement.Id, "longhouse2"), null, Ct);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Contains("AlreadyClaimed", await again.Content.ReadAsStringAsync(Ct));

        var reread = (await GetAsync(client, settlement.Id))!;
        Assert.True(reread.Quests.Single(q => q.Id == "longhouse2").Claimed);
        Assert.Equal(after.Resources.Stock.Wood, reread.Resources.Stock.Wood, 1);
    }

    [Fact]
    public async Task Someone_elses_owner_header_cannot_claim()
    {
        using var client = _factory.CreateClient();
        var settlement = await FoundAsync(client);
        await UpgradeLonghouseAsync(client, settlement);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", "someone-else");

        var response = await client.PostAsync(ClaimUrl(settlement.Id, "longhouse2"), null, Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", OwnerId);
        Assert.False((await GetAsync(client, settlement.Id))!.Quests.Single(q => q.Id == "longhouse2").Claimed);
    }

    [Fact]
    public async Task Only_the_players_first_settlement_has_quests()
    {
        using var client = _factory.CreateClient();
        var first = await FoundAsync(client);

        Guid secondId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var entity = await db.Settlements.AsNoTracking().FirstAsync(s => s.Id == first.Id, Ct);
            var centre = new HexCoord(first.Q + 40, first.R);
            var second = new SettlementEntity
            {
                WorldId = entity.WorldId,
                IslandId = entity.IslandId,
                Name = "Lillestad",
                OwnerName = entity.OwnerName,
                OwnerId = entity.OwnerId,
                UserId = entity.UserId,
                FoundedAt = entity.FoundedAt.AddMinutes(10),
            };
            var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
            second.ApplyDomain(new Settlement
            {
                Id = second.Id,
                Name = "Lillestad",
                Centre = centre,
                Buildings = [new PlacedBuilding(centre, BuildingType.Longhouse, 1)],
                Resources = ResourcePool.Create(BuildingCatalogue.FoundingStock, production, capacity, entity.SettledAt),
            });
            db.Settlements.Add(second);
            await db.SaveChangesAsync(Ct);
            secondId = second.Id;
        }

        var firstAgain = await GetAsync(client, first.Id);
        var secondRead = await GetAsync(client, secondId);
        Assert.Equal(Quests.All.Count, firstAgain!.Quests.Count);
        Assert.Empty(secondRead!.Quests);

        var refused = await client.PostAsync(ClaimUrl(secondId, "producers3"), null, Ct);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Contains("NotFirstSettlement", await refused.Content.ReadAsStringAsync(Ct));
    }
}
