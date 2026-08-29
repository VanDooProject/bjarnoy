using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <see cref="LeaderboardService"/> against a real SQLite database (issue #43
/// PR 1: "no API yet — verified by service tests"). Worlds and settlements are
/// founded through the real HTTP surface, exactly like every other founding
/// test; only ownership and building levels — which PR 1 has no endpoint for
/// yet — are set directly through the DbContext.
/// </summary>
public sealed class LeaderboardServiceTests(SqliteApiFixture fixture) : IClassFixture<SqliteApiFixture>
{
    private readonly SqliteApiFixture _fixture = fixture;

    private CancellationToken Ct => TestContext.Current.CancellationToken;

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

    /// <summary>
    /// One founding plot per island — founding refuses two settlements too close
    /// together (<c>FoundingRejection.TooCloseToNeighbour</c>), which several
    /// start positions on the same island easily are, so each settlement in a
    /// test needs its own island.
    /// </summary>
    private async Task<Queue<(Guid IslandId, int Q, int R)>> GetPlotsAsync(HttpClient client, Guid worldId)
    {
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldId}/islands", SqliteApiFixture.StrictJson, Ct);

        return new Queue<(Guid, int, int)>(
            islands!
                .Where(i => i.StartPositions.Count > 0)
                .Select(i => (i.Id, i.StartPositions[0].Q, i.StartPositions[0].R)));
    }

    /// <summary>Founds a settlement (one level-1 longhouse) on the next free plot.</summary>
    private async Task<SettlementResponse> FoundSettlementAsync(
        HttpClient client, Guid worldId, Queue<(Guid IslandId, int Q, int R)> plots)
    {
        var (islandId, q, r) = plots.Dequeue();

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(islandId, q, r, UniqueName("settlement"), "Owner", UniqueName("owner")),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<SettlementResponse>(Ct);
    }

    /// <summary>Creates a real (non-system) user and assigns them as a settlement's owner.</summary>
    private async Task<Guid> AssignRealOwnerAsync(GameDbContext db, Guid settlementId, string? displayName = null)
    {
        var user = new UserEntity
        {
            UserName = UniqueName("user"),
            NormalizedUserName = UniqueName("user").ToLowerInvariant(),
            PasswordHash = "not-a-real-hash",
            DisplayName = displayName,
            CreatedAt = DateTimeOffset.UnixEpoch,
        };
        db.Users.Add(user);

        var settlement = await db.Settlements.SingleAsync(s => s.Id == settlementId, Ct);
        settlement.UserId = user.Id;

        await db.SaveChangesAsync(Ct);
        return user.Id;
    }

    /// <summary>Sets a settlement's single founding longhouse to <paramref name="level"/>.</summary>
    private async Task SetLonghouseLevelAsync(GameDbContext db, Guid settlementId, int level)
    {
        var longhouse = await db.PlacedBuildings.SingleAsync(b => b.SettlementId == settlementId, Ct);
        longhouse.Level = level;
        await db.SaveChangesAsync(Ct);
    }

    private async Task<List<LeaderboardEntryEntity>> GetBoardAsync(
        GameDbContext db, Guid worldId, LeaderboardScope scope, LeaderboardCategory category)
    {
        var snapshot = await db.LeaderboardSnapshots
            .Include(s => s.Entries)
            .SingleAsync(s => s.WorldId == worldId && s.Scope == scope && s.Category == category && !s.IsFinal, Ct);

        return [.. snapshot.Entries.OrderBy(e => e.Rank)];
    }

    [Fact]
    public async Task Settlements_of_different_owners_are_ranked_by_score_and_system_owners_are_excluded()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        var plots = await GetPlotsAsync(client, world.Id);

        var low = await FoundSettlementAsync(client, world.Id, plots);
        var mid = await FoundSettlementAsync(client, world.Id, plots);
        var high = await FoundSettlementAsync(client, world.Id, plots);
        // Left owned by the system Abandoned user (default for an anonymous founding).
        var abandoned = await FoundSettlementAsync(client, world.Id, plots);

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();

            await AssignRealOwnerAsync(db, low.Id);
            await AssignRealOwnerAsync(db, mid.Id);
            await AssignRealOwnerAsync(db, high.Id);

            // Triangular numbers: level 2 -> 3, level 5 -> 15, level 8 -> 36.
            await SetLonghouseLevelAsync(db, low.Id, 2);
            await SetLonghouseLevelAsync(db, mid.Id, 5);
            await SetLonghouseLevelAsync(db, high.Id, 8);

            Assert.NotEqual(Guid.Empty, abandoned.Id); // founded, just never assigned a real owner.
        }

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var leaderboards = scope.ServiceProvider.GetRequiredService<LeaderboardService>();
            await leaderboards.RefreshCurrentBoardsAsync(world.Id, Ct);
        }

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();

            var settlementBoard = await GetBoardAsync(
                db, world.Id, LeaderboardScope.Settlement, LeaderboardCategory.BiggestSettlement);
            Assert.Equal(3, settlementBoard.Count);
            Assert.DoesNotContain(settlementBoard, e => e.SubjectId == abandoned.Id);
            Assert.Collection(
                settlementBoard,
                e => Assert.Equal((high.Id, 36), (e.SubjectId, e.Value)),
                e => Assert.Equal((mid.Id, 15), (e.SubjectId, e.Value)),
                e => Assert.Equal((low.Id, 3), (e.SubjectId, e.Value)));
            Assert.Equal([1, 2, 3], settlementBoard.Select(e => e.Rank));
            Assert.All(settlementBoard, e => Assert.Null(e.PreviousRank));

            var userBoard = await GetBoardAsync(db, world.Id, LeaderboardScope.User, LeaderboardCategory.Score);
            Assert.Equal(3, userBoard.Count);
            Assert.Equal([36, 15, 3], userBoard.Select(e => e.Value));

            var watermark = await db.LeaderboardWatermarks.SingleAsync(w => w.WorldId == world.Id, Ct);
            Assert.Equal(_fixture.Factory.Time.GetUtcNow(), watermark.LastSnapshotAt);
        }
    }

    [Fact]
    public async Task Equal_scores_are_ranked_by_ascending_subject_id()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        var plots = await GetPlotsAsync(client, world.Id);

        var a = await FoundSettlementAsync(client, world.Id, plots);
        var b = await FoundSettlementAsync(client, world.Id, plots);

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            await AssignRealOwnerAsync(db, a.Id);
            await AssignRealOwnerAsync(db, b.Id);

            // Same level -> same score: the tie the ranking has to break by id.
            await SetLonghouseLevelAsync(db, a.Id, 4);
            await SetLonghouseLevelAsync(db, b.Id, 4);
        }

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var leaderboards = scope.ServiceProvider.GetRequiredService<LeaderboardService>();
            await leaderboards.RefreshCurrentBoardsAsync(world.Id, Ct);
        }

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var board = await GetBoardAsync(
                db, world.Id, LeaderboardScope.Settlement, LeaderboardCategory.BiggestSettlement);

            var expectedOrder = new[] { a.Id, b.Id }.OrderBy(id => id).ToList();
            Assert.Equal(expectedOrder, board.Select(e => e.SubjectId));
            Assert.Equal([1, 2], board.Select(e => e.Rank));
        }
    }

    [Fact]
    public async Task Rerunning_replaces_the_previous_snapshot_and_carries_previous_rank()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        var plots = await GetPlotsAsync(client, world.Id);

        var first = await FoundSettlementAsync(client, world.Id, plots);
        var second = await FoundSettlementAsync(client, world.Id, plots);

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            await AssignRealOwnerAsync(db, first.Id);
            await AssignRealOwnerAsync(db, second.Id);

            // "first" starts ahead...
            await SetLonghouseLevelAsync(db, first.Id, 5);  // score 15
            await SetLonghouseLevelAsync(db, second.Id, 2); // score 3
        }

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var leaderboards = scope.ServiceProvider.GetRequiredService<LeaderboardService>();
            await leaderboards.RefreshCurrentBoardsAsync(world.Id, Ct);
        }

        // Past the 15-minute staleness window, so the next call actually recomputes.
        _fixture.Factory.Time.Advance(TimeSpan.FromMinutes(20));

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            // ...then "second" overtakes it.
            await SetLonghouseLevelAsync(db, second.Id, 9); // score 45
        }

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var leaderboards = scope.ServiceProvider.GetRequiredService<LeaderboardService>();
            await leaderboards.RefreshCurrentBoardsAsync(world.Id, Ct);
        }

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();

            // Exactly one non-final snapshot per board — the superseded one was deleted, not accumulated.
            var snapshotCount = await db.LeaderboardSnapshots.CountAsync(
                s => s.WorldId == world.Id
                    && s.Scope == LeaderboardScope.Settlement
                    && s.Category == LeaderboardCategory.BiggestSettlement
                    && !s.IsFinal,
                Ct);
            Assert.Equal(1, snapshotCount);

            var board = await GetBoardAsync(
                db, world.Id, LeaderboardScope.Settlement, LeaderboardCategory.BiggestSettlement);

            var secondEntry = Assert.Single(board, e => e.SubjectId == second.Id);
            var firstEntry = Assert.Single(board, e => e.SubjectId == first.Id);

            Assert.Equal(1, secondEntry.Rank);
            Assert.Equal(2, secondEntry.PreviousRank); // was second, now first
            Assert.Equal(2, firstEntry.Rank);
            Assert.Equal(1, firstEntry.PreviousRank); // was first, now second
        }
    }

    [Fact]
    public async Task A_refresh_within_the_staleness_window_is_skipped()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        var plots = await GetPlotsAsync(client, world.Id);
        var settlement = await FoundSettlementAsync(client, world.Id, plots);

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            await AssignRealOwnerAsync(db, settlement.Id);
        }

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var leaderboards = scope.ServiceProvider.GetRequiredService<LeaderboardService>();
            await leaderboards.RefreshCurrentBoardsAsync(world.Id, Ct);
        }

        var firstComputedAt = await GetComputedAtAsync(world.Id);

        _fixture.Factory.Time.Advance(TimeSpan.FromMinutes(5));

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var leaderboards = scope.ServiceProvider.GetRequiredService<LeaderboardService>();
            await leaderboards.RefreshCurrentBoardsAsync(world.Id, Ct);
        }

        Assert.Equal(firstComputedAt, await GetComputedAtAsync(world.Id));
    }

    private async Task<DateTimeOffset> GetComputedAtAsync(Guid worldId)
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.LeaderboardSnapshots
            .Where(s => s.WorldId == worldId && s.Scope == LeaderboardScope.Settlement && !s.IsFinal)
            .Select(s => s.ComputedAt)
            .SingleAsync(Ct);
    }
}
