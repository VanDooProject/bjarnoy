using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Ai;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The AI player system end to end (docs/design/ai-players.md, steps 3-4):
/// the takeover sweep, the owner-activity bump that keeps a played settlement
/// out of its reach, and the turn runner executing through the real
/// SettlementService/ArmyService methods.
/// </summary>
/// <remarks>
/// One factory per test method (<see cref="IAsyncLifetime"/>, not a shared
/// <see cref="IClassFixture{TFixture}"/>) rather than one database shared by
/// the whole class — deliberately, unlike <c>LeaderboardServiceTests</c>:
/// <c>AiTakeoverService.RunAsync</c>/<c>AiPlayerService.RunDueAsync</c> sweep
/// every world and every AI player in the database, not just the one a test
/// set up, so a shared database would make one test's leftover AI players
/// (and the shared clock's accumulated advances) leak into another test's
/// "exactly N acted" assertions.
/// </remarks>
public sealed class AiPlayersTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string UniqueName(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

    private async Task<WorldResponse> CreateWorldAsync(HttpClient client)
    {
        var response = await client.PostJsonAsync(
            "/api/v1/worlds",
            new CreateWorldRequest(UniqueName("world"), Seed: 4242, Radius: 40, MaxPlayers: 100),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<WorldResponse>(Ct);
    }

    private async Task<Queue<(Guid IslandId, int Q, int R)>> GetPlotsAsync(HttpClient client, Guid worldId)
    {
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldId}/islands", SqliteApiFixture.StrictJson, Ct);

        return new Queue<(Guid, int, int)>(
            islands!
                .Where(i => i.StartPositions.Count > 0)
                .Select(i => (i.Id, i.StartPositions[0].Q, i.StartPositions[0].R)));
    }

    /// <summary>Founds an anonymous settlement on the next free plot, under the given owner id.</summary>
    private async Task<SettlementResponse> FoundSettlementAsync(
        HttpClient client, Guid worldId, Queue<(Guid IslandId, int Q, int R)> plots, string ownerId)
    {
        var (islandId, q, r) = plots.Dequeue();

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(islandId, q, r, UniqueName("settlement"), "Owner", ownerId),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<SettlementResponse>(Ct);
    }

    private async Task SetLastOwnerActivityAsync(Guid settlementId, DateTimeOffset value)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var settlement = await db.Settlements.SingleAsync(s => s.Id == settlementId, Ct);
        settlement.LastOwnerActivityAt = value;
        await db.SaveChangesAsync(Ct);
    }

    /// <summary>Tops up a settlement's stock so a repeated small train/build request never fails on affordability alone.</summary>
    private async Task GrantAmpleStockAsync(Guid settlementId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var settlement = await db.Settlements.SingleAsync(s => s.Id == settlementId, Ct);
        settlement.StockWood = 100_000;
        settlement.StockStone = 100_000;
        settlement.StockFood = 100_000;
        settlement.StockIron = 100_000;
        await db.SaveChangesAsync(Ct);
    }

    private async Task<int> RunTakeoverSweepAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var takeovers = scope.ServiceProvider.GetRequiredService<AiTakeoverService>();
        return await takeovers.RunAsync(Ct);
    }

    private async Task<SettlementEntity> GetSettlementAsync(Guid settlementId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.Settlements.AsNoTracking().SingleAsync(s => s.Id == settlementId, Ct);
    }

    [Fact]
    public async Task An_anonymous_settlement_inactive_past_the_threshold_is_taken_over()
    {
        using var client = _factory.CreateClient();
        var world = await CreateWorldAsync(client);
        var plots = await GetPlotsAsync(client, world.Id);
        var ownerId = UniqueName("owner");
        var settlement = await FoundSettlementAsync(client, world.Id, plots, ownerId);

        await SetLastOwnerActivityAsync(settlement.Id, _factory.Time.GetUtcNow() - TimeSpan.FromDays(8));

        var takenOver = await RunTakeoverSweepAsync();
        Assert.Equal(1, takenOver);

        var entity = await GetSettlementAsync(settlement.Id);
        Assert.NotEqual(SystemUserIds.Abandoned, entity.UserId);
        Assert.StartsWith("ai:", entity.OwnerId, StringComparison.Ordinal);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var owner = await db.Users.SingleAsync(u => u.Id == entity.UserId, Ct);
            Assert.True(owner.IsSystem);

            var aiPlayer = await db.AiPlayers.SingleAsync(a => a.UserId == entity.UserId, Ct);
            Assert.Equal(settlement.Id, aiPlayer.TakenOverSettlementId);
            Assert.NotEmpty(aiPlayer.Objectives);
        }

        // The old client-local id no longer proves ownership: a mutating
        // request now gets refused.
        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
        var (q, r) = FreeHexNear(entity);
        var buildResponse = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds", new QueueBuildRequest("farm", q, r), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, buildResponse.StatusCode);
    }

    [Fact]
    public async Task An_anonymous_settlement_inactive_under_the_threshold_is_not_taken_over()
    {
        using var client = _factory.CreateClient();
        var world = await CreateWorldAsync(client);
        var plots = await GetPlotsAsync(client, world.Id);
        var settlement = await FoundSettlementAsync(client, world.Id, plots, UniqueName("owner"));

        await SetLastOwnerActivityAsync(settlement.Id, _factory.Time.GetUtcNow() - TimeSpan.FromDays(1));

        var takenOver = await RunTakeoverSweepAsync();
        Assert.Equal(0, takenOver);

        var entity = await GetSettlementAsync(settlement.Id);
        Assert.Equal(SystemUserIds.Abandoned, entity.UserId);
    }

    [Fact]
    public async Task A_registered_settlement_is_never_taken_over_no_matter_how_inactive()
    {
        using var client = _factory.CreateClient();
        var world = await CreateWorldAsync(client);
        var plots = await GetPlotsAsync(client, world.Id);
        var settlement = await FoundSettlementAsync(client, world.Id, plots, UniqueName("owner"));

        Guid realUserId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = new UserEntity
            {
                UserName = UniqueName("user"),
                NormalizedUserName = UniqueName("user").ToLowerInvariant(),
                PasswordHash = "not-a-real-hash",
                CreatedAt = _factory.Time.GetUtcNow(),
            };
            db.Users.Add(user);

            var entity = await db.Settlements.SingleAsync(s => s.Id == settlement.Id, Ct);
            entity.UserId = user.Id;
            entity.LastOwnerActivityAt = _factory.Time.GetUtcNow() - TimeSpan.FromDays(365);
            await db.SaveChangesAsync(Ct);
            realUserId = user.Id;
        }

        var takenOver = await RunTakeoverSweepAsync();
        Assert.Equal(0, takenOver);

        var after = await GetSettlementAsync(settlement.Id);
        Assert.Equal(realUserId, after.UserId);
    }

    [Fact]
    public async Task A_mutating_request_with_a_valid_owner_id_bumps_activity_respecting_the_throttle()
    {
        using var client = _factory.CreateClient();
        var world = await CreateWorldAsync(client);
        var plots = await GetPlotsAsync(client, world.Id);
        var ownerId = UniqueName("owner");
        var settlement = await FoundSettlementAsync(client, world.Id, plots, ownerId);

        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
        await GrantAmpleStockAsync(settlement.Id);

        var foundedActivity = (await GetSettlementAsync(settlement.Id)).LastOwnerActivityAt;

        // Move well past founding, then do one mutating request. Training
        // (rather than building) so repeated calls never run into the
        // single-construction-slot limit a fresh, non-premium settlement has.
        _factory.Time.Advance(TimeSpan.FromMinutes(30));
        var first = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/units", new TrainUnitsRequest("thrall", 1), Ct);
        Assert.Equal(HttpStatusCode.Accepted, first.StatusCode);

        var afterFirst = (await GetSettlementAsync(settlement.Id)).LastOwnerActivityAt;
        Assert.True(afterFirst > foundedActivity);
        Assert.Equal(_factory.Time.GetUtcNow(), afterFirst);

        // A second mutating request inside the throttle window (default 5
        // minutes) must not write again.
        _factory.Time.Advance(TimeSpan.FromMinutes(1));
        var second = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/units", new TrainUnitsRequest("thrall", 1), Ct);
        Assert.Equal(HttpStatusCode.Accepted, second.StatusCode);

        var afterSecond = (await GetSettlementAsync(settlement.Id)).LastOwnerActivityAt;
        Assert.Equal(afterFirst, afterSecond);

        // Past the throttle: the next accepted request writes again, keeping
        // this settlement out of the takeover sweep's reach indefinitely as
        // long as it is actually played.
        _factory.Time.Advance(TimeSpan.FromMinutes(10));
        var third = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/units", new TrainUnitsRequest("thrall", 1), Ct);
        Assert.Equal(HttpStatusCode.Accepted, third.StatusCode);

        var afterThird = (await GetSettlementAsync(settlement.Id)).LastOwnerActivityAt;
        Assert.Equal(_factory.Time.GetUtcNow(), afterThird);
        Assert.True(afterThird > afterFirst);

        var takenOver = await RunTakeoverSweepAsync();
        Assert.Equal(0, takenOver);
    }

    [Fact]
    public async Task RunDueAsync_queues_a_real_build_for_a_taken_over_settlement_and_reschedules_into_the_future()
    {
        using var client = _factory.CreateClient();
        var world = await CreateWorldAsync(client);
        var plots = await GetPlotsAsync(client, world.Id);
        var settlement = await FoundSettlementAsync(client, world.Id, plots, UniqueName("owner"));

        AiPlayerEntity aiPlayer;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var takeovers = scope.ServiceProvider.GetRequiredService<AiTakeoverService>();
            var result = await takeovers.TakeOverAsync(settlement.Id, AiPersonality.Balanced, Ct);
            Assert.True(result.Accepted);
            aiPlayer = result.AiPlayer!;
        }

        int firstActed;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var players = scope.ServiceProvider.GetRequiredService<AiPlayerService>();
            firstActed = await players.RunDueAsync(Ct);
        }

        Assert.Equal(1, firstActed);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var queue = await db.BuildOrders.Where(o => o.SettlementId == settlement.Id).ToListAsync(Ct);
            Assert.NotEmpty(queue);

            var refreshedAi = await db.AiPlayers.AsNoTracking().SingleAsync(a => a.UserId == aiPlayer.UserId, Ct);
            Assert.True(refreshedAi.NextActAt > _factory.Time.GetUtcNow());
        }

        // Running again right away (NextActAt has not arrived yet) must be a no-op.
        int queueCountBefore;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            queueCountBefore = await db.BuildOrders.CountAsync(o => o.SettlementId == settlement.Id, Ct);
        }

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var players = scope.ServiceProvider.GetRequiredService<AiPlayerService>();
            var secondActed = await players.RunDueAsync(Ct);
            Assert.Equal(0, secondActed);
        }

        await using (var scope2 = _factory.Services.CreateAsyncScope())
        {
            var db = scope2.ServiceProvider.GetRequiredService<GameDbContext>();
            var queueCountAfter = await db.BuildOrders.CountAsync(o => o.SettlementId == settlement.Id, Ct);
            Assert.Equal(queueCountBefore, queueCountAfter);
        }
    }

    [Fact]
    public async Task A_paused_world_takes_no_ai_actions()
    {
        using var client = _factory.CreateClient();
        var world = await CreateWorldAsync(client);
        var plots = await GetPlotsAsync(client, world.Id);
        var settlement = await FoundSettlementAsync(client, world.Id, plots, UniqueName("owner"));

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var takeovers = scope.ServiceProvider.GetRequiredService<AiTakeoverService>();
            var result = await takeovers.TakeOverAsync(settlement.Id, AiPersonality.Balanced, Ct);
            Assert.True(result.Accepted);

            var worlds = scope.ServiceProvider.GetRequiredService<WorldService>();
            await worlds.SetRunStateAsync(world.Id, WorldRunState.Paused, cancellationToken: Ct);
        }

        int acted;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var players = scope.ServiceProvider.GetRequiredService<AiPlayerService>();
            acted = await players.RunDueAsync(Ct);
        }

        Assert.Equal(0, acted);

        await using var checkScope = _factory.Services.CreateAsyncScope();
        var db = checkScope.ServiceProvider.GetRequiredService<GameDbContext>();
        Assert.Empty(await db.BuildOrders.Where(o => o.SettlementId == settlement.Id).ToListAsync(Ct));
    }

    [Fact]
    public async Task Ai_target_policy_only_returns_other_ai_owned_settlements()
    {
        using var client = _factory.CreateClient();
        var world = await CreateWorldAsync(client);
        var plots = await GetPlotsAsync(client, world.Id);

        var aiOne = await FoundSettlementAsync(client, world.Id, plots, UniqueName("owner"));
        var aiTwo = await FoundSettlementAsync(client, world.Id, plots, UniqueName("owner"));
        var human = await FoundSettlementAsync(client, world.Id, plots, UniqueName("owner"));
        var stillAnonymous = await FoundSettlementAsync(client, world.Id, plots, UniqueName("owner"));

        Guid aiOneUserId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var takeovers = scope.ServiceProvider.GetRequiredService<AiTakeoverService>();

            var first = await takeovers.TakeOverAsync(aiOne.Id, AiPersonality.Economic, Ct);
            Assert.True(first.Accepted);
            aiOneUserId = first.AiPlayer!.UserId;

            var second = await takeovers.TakeOverAsync(aiTwo.Id, AiPersonality.Aggressive, Ct);
            Assert.True(second.Accepted);

            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var humanUser = new UserEntity
            {
                UserName = UniqueName("user"),
                NormalizedUserName = UniqueName("user").ToLowerInvariant(),
                PasswordHash = "not-a-real-hash",
                CreatedAt = _factory.Time.GetUtcNow(),
            };
            db.Users.Add(humanUser);
            var humanEntity = await db.Settlements.SingleAsync(s => s.Id == human.Id, Ct);
            humanEntity.UserId = humanUser.Id;
            await db.SaveChangesAsync(Ct);
        }

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var policy = scope.ServiceProvider.GetRequiredService<AiTargetPolicy>();
            var centre = new Bjarnoy.Domain.World.HexCoord(0, 0);

            // A generous radius: this test only cares about which settlements
            // are excluded by ownership, not by distance.
            var neighbours = await policy.GetNeighboursAsync(world.Id, aiOneUserId, centre, Ct);

            var aiTwoEntity = await db.Settlements.AsNoTracking().SingleAsync(s => s.Id == aiTwo.Id, Ct);
            if (centre.DistanceTo(new Bjarnoy.Domain.World.HexCoord(aiTwoEntity.CentreQ, aiTwoEntity.CentreR)) <= AiTargetPolicy.SearchRadiusHexes)
            {
                Assert.Contains(neighbours, n => n.SettlementId == aiTwo.Id);
            }

            Assert.DoesNotContain(neighbours, n => n.SettlementId == aiOne.Id);
            Assert.DoesNotContain(neighbours, n => n.SettlementId == human.Id);
            Assert.DoesNotContain(neighbours, n => n.SettlementId == stillAnonymous.Id);
        }
    }

    /// <summary>A hex next to the settlement's centre with nothing built on it yet, for a build request.</summary>
    private static (int Q, int R) FreeHexNear(SettlementEntity settlement) =>
        (settlement.CentreQ + 1, settlement.CentreR);
}
