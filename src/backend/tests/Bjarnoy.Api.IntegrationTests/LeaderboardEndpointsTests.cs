using System.Net;
using System.Net.Http.Headers;
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
/// The leaderboard read API (issue #43 PR 2): board directory, board pages
/// with keyset paging and tie-break order, <c>/me</c>, and the anonymous vs.
/// authenticated split.
/// </summary>
public sealed class LeaderboardEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private HttpClient Client() => _factory.CreateClient();

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    private async Task<Guid> CreateWorldAsync()
    {
        var world = await _factory.CreateWorldAsync(
            Unique("world"), seed: 4242, radius: 60, maxPlayers: 100, cancellationToken: Ct);
        return world.Id;
    }

    private async Task<Queue<(Guid IslandId, int Q, int R)>> GetPlotsAsync(HttpClient client, Guid worldId)
    {
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldId}/islands", SqliteApiFixture.StrictJson, Ct);

        return new Queue<(Guid, int, int)>(
            islands!.Where(i => i.StartPositions.Count > 0)
                .Select(i => (i.Id, i.StartPositions[0].Q, i.StartPositions[0].R)));
    }

    /// <summary>Founds a settlement (one level-1 longhouse) owned by <paramref name="ownerId"/> on the next free plot.</summary>
    private async Task<SettlementResponse> FoundSettlementAsync(
        HttpClient client, Guid worldId, Queue<(Guid IslandId, int Q, int R)> plots, string ownerId)
    {
        var (islandId, q, r) = plots.Dequeue();
        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(islandId, q, r, Unique("settlement"), "Owner", ownerId),
            Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<SettlementResponse>(Ct);
    }

    /// <summary>Registers a real account and claims any settlement still carrying <paramref name="ownerId"/>.</summary>
    private async Task<(Guid UserId, string AccessToken)> RegisterAndClaimAsync(HttpClient client, string ownerId)
    {
        var userName = Unique("player");
        var response = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery", ownerId), Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var auth = await response.ReadStrictAsync<AuthResponse>(Ct);
        return (auth.User.Id, auth.AccessToken);
    }

    private async Task SetLonghouseLevelAsync(Guid settlementId, int level)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var longhouse = await db.PlacedBuildings.SingleAsync(b => b.SettlementId == settlementId, Ct);
        longhouse.Level = level;
        await db.SaveChangesAsync(Ct);
    }

    private async Task RefreshBoardsAsync(Guid worldId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var leaderboards = scope.ServiceProvider.GetRequiredService<LeaderboardService>();
        await leaderboards.RefreshCurrentBoardsAsync(worldId, Ct);
    }

    private async Task CloseDueWindowsAsync(Guid worldId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var leaderboards = scope.ServiceProvider.GetRequiredService<LeaderboardService>();
        await leaderboards.CloseDueWindowsAsync(worldId, Ct);
    }

    [Fact]
    public void The_background_aggregation_timer_is_off_so_it_cannot_race_explicit_refreshes()
    {
        Assert.DoesNotContain(
            _factory.Services.GetServices<Microsoft.Extensions.Hosting.IHostedService>(),
            s => s is Bjarnoy.Api.Hosting.WeeklyAggregationHostedService);
    }

    [Fact]
    public async Task Directory_reports_dark_reserved_boards_and_lights_up_once_computed()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();

        var before = await client.GetFromJsonAsync<LeaderboardDirectoryResponse>(
            $"/api/v1/worlds/{worldId}/leaderboards", SqliteApiFixture.StrictJson, Ct);

        Assert.Empty(before!.WeeklyWindows);
        Assert.Equal(8, before.Boards.Count);

        AssertDark(before.Boards, "user", "score", "notComputedYet");
        AssertDark(before.Boards, "settlement", "biggestSettlement", "notComputedYet");
        AssertDark(before.Boards, "user", "weeklyScoreGained", "noWeeklyWindowsYet");
        AssertDark(before.Boards, "user", "weeklyFightsWon", "noBattleSystemYet");
        AssertDark(before.Boards, "user", "weeklyFightsLost", "noBattleSystemYet");
        AssertDark(before.Boards, "user", "weeklyResourcesLooted", "noBattleSystemYet");
        AssertDark(before.Boards, "user", "biggestArmy", "noArmySystemYet");
        AssertDark(before.Boards, "guild", "score", "noGuildSystemYet");

        var plots = await GetPlotsAsync(client, worldId);
        var ownerId = Unique("owner");
        var settlement = await FoundSettlementAsync(client, worldId, plots, ownerId);
        await RegisterAndClaimAsync(client, ownerId);
        await SetLonghouseLevelAsync(settlement.Id, 3);
        await RefreshBoardsAsync(worldId);

        var after = await client.GetFromJsonAsync<LeaderboardDirectoryResponse>(
            $"/api/v1/worlds/{worldId}/leaderboards", SqliteApiFixture.StrictJson, Ct);

        var userScore = Assert.Single(after!.Boards, b => b.Scope == "user" && b.Category == "score");
        Assert.True(userScore.Available);
        Assert.Null(userScore.Reason);
        Assert.Equal(1, userScore.EntryCount);
        Assert.NotNull(userScore.ComputedAt);

        // The permanently-dark reserved boards are unaffected by the refresh.
        AssertDark(after.Boards, "guild", "score", "noGuildSystemYet");
        AssertDark(after.Boards, "user", "weeklyFightsWon", "noBattleSystemYet");
    }

    private static void AssertDark(
        IReadOnlyList<LeaderboardBoardInfoResponse> boards, string scope, string category, string reason)
    {
        var board = Assert.Single(boards, b => b.Scope == scope && b.Category == category);
        Assert.False(board.Available);
        Assert.Equal(reason, board.Reason);
        Assert.Null(board.ComputedAt);
        Assert.Null(board.EntryCount);
    }

    [Fact]
    public async Task Directory_carries_the_callers_rank_per_board_and_nothing_for_anonymous()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();
        var plots = await GetPlotsAsync(client, worldId);

        // A stronger rival first, then the caller: the caller must come out second on both boards.
        var rivalOwner = Unique("rival");
        var rival = await FoundSettlementAsync(client, worldId, plots, rivalOwner);
        await RegisterAndClaimAsync(client, rivalOwner);
        await SetLonghouseLevelAsync(rival.Id, 9);

        var myOwner = Unique("mine");
        var mine = await FoundSettlementAsync(client, worldId, plots, myOwner);
        var (_, token) = await RegisterAndClaimAsync(client, myOwner);
        await SetLonghouseLevelAsync(mine.Id, 4);
        await RefreshBoardsAsync(worldId);

        var anonymous = await client.GetFromJsonAsync<LeaderboardDirectoryResponse>(
            $"/api/v1/worlds/{worldId}/leaderboards", SqliteApiFixture.StrictJson, Ct);
        Assert.All(anonymous!.Boards, b => Assert.Null(b.MyRank));

        Authorize(client, token);
        var directory = await client.GetFromJsonAsync<LeaderboardDirectoryResponse>(
            $"/api/v1/worlds/{worldId}/leaderboards", SqliteApiFixture.StrictJson, Ct);

        Assert.Equal(2, Assert.Single(directory!.Boards, b => b.Scope == "user" && b.Category == "score").MyRank);
        Assert.Equal(
            2, Assert.Single(directory.Boards, b => b.Scope == "settlement" && b.Category == "biggestSettlement").MyRank);

        // Dark boards never carry a rank, even for a signed-in caller.
        Assert.All(directory.Boards.Where(b => !b.Available), b => Assert.Null(b.MyRank));
    }

    [Fact]
    public async Task Directory_has_no_rank_for_a_caller_without_an_entry()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();
        await BuildUserBoardAsync(client, worldId, [5]);

        // A registered player who owns nothing in this world.
        var (_, token) = await RegisterAndClaimAsync(client, Unique("nobody"));
        Authorize(client, token);

        var directory = await client.GetFromJsonAsync<LeaderboardDirectoryResponse>(
            $"/api/v1/worlds/{worldId}/leaderboards", SqliteApiFixture.StrictJson, Ct);
        Assert.All(directory!.Boards, b => Assert.Null(b.MyRank));
    }

    /// <summary>Registers a fresh account, applies <paramref name="premium"/>/<paramref name="admin"/> in the DB, and logs in so the token carries the role.</summary>
    private async Task<string> TierTokenAsync(HttpClient client, bool premium = false, bool admin = false)
    {
        var userName = Unique("tier");
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == auth.User.Id, Ct);
            user.IsPremium = premium;
            if (admin)
            {
                user.Role = UserRole.Admin;
            }

            await db.SaveChangesAsync(Ct);
        }

        var loggedIn = await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, loggedIn.StatusCode);
        return (await loggedIn.ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
    }

    private static string WindowUrl(Guid worldId, DateTimeOffset periodStart) =>
        $"/api/v1/worlds/{worldId}/leaderboards/user/weeklyScoreGained?periodStart={Uri.EscapeDataString(periodStart.ToString("O"))}";

    private async Task<LeaderboardDirectoryResponse> DirectoryAsync(HttpClient client, Guid worldId) =>
        (await client.GetFromJsonAsync<LeaderboardDirectoryResponse>(
            $"/api/v1/worlds/{worldId}/leaderboards", SqliteApiFixture.StrictJson, Ct))!;

    /// <summary>A world with <paramref name="closedWindows"/> closed weekly windows on the weekly score board.</summary>
    private async Task<Guid> WorldWithClosedWindowsAsync(HttpClient client, int closedWindows)
    {
        var worldId = await CreateWorldAsync();
        await BuildUserBoardAsync(client, worldId, [5]);
        _factory.Time.Advance((LeaderboardService.WeeklyWindowLength * closedWindows) + TimeSpan.FromMinutes(1));
        await CloseDueWindowsAsync(worldId);
        return worldId;
    }

    [Fact]
    public async Task Week_history_lists_no_windows_for_anonymous_and_free_players()
    {
        using var client = Client();
        var worldId = await WorldWithClosedWindowsAsync(client, 2);

        Assert.Empty((await DirectoryAsync(client, worldId)).WeeklyWindows);

        Authorize(client, await TierTokenAsync(client));
        Assert.Empty((await DirectoryAsync(client, worldId)).WeeklyWindows);
    }

    [Fact]
    public async Task Week_history_lists_the_newest_four_windows_for_premium_and_all_for_admin()
    {
        using var client = Client();
        var worldId = await WorldWithClosedWindowsAsync(client, 6);

        Authorize(client, await TierTokenAsync(client, premium: true));
        var premium = (await DirectoryAsync(client, worldId)).WeeklyWindows;
        Assert.Equal(4, premium.Count);
        Assert.Equal(premium.OrderBy(w => w.PeriodStart), premium);

        Authorize(client, await TierTokenAsync(client, admin: true));
        var admin = (await DirectoryAsync(client, worldId)).WeeklyWindows;
        Assert.Equal(6, admin.Count);
        Assert.Equal(admin.Skip(2), premium);
    }

    [Fact]
    public async Task A_past_window_needs_an_account_and_premium_unless_admin()
    {
        using var client = Client();
        var worldId = await WorldWithClosedWindowsAsync(client, 6);

        Authorize(client, await TierTokenAsync(client, admin: true));
        var windows = (await DirectoryAsync(client, worldId)).WeeklyWindows;
        var oldest = windows[0].PeriodStart;
        var newest = windows[^1].PeriodStart;
        client.DefaultRequestHeaders.Authorization = null;

        // Anonymous: 401, even for the newest window.
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(WindowUrl(worldId, newest), Ct)).StatusCode);

        // Free: 403.
        Authorize(client, await TierTokenAsync(client));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(WindowUrl(worldId, newest), Ct)).StatusCode);

        // Premium: the newest four are open, an older one is 403.
        Authorize(client, await TierTokenAsync(client, premium: true));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(WindowUrl(worldId, windows[2].PeriodStart), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(WindowUrl(worldId, newest), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(WindowUrl(worldId, oldest), Ct)).StatusCode);

        // Admin: every window.
        Authorize(client, await TierTokenAsync(client, admin: true));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(WindowUrl(worldId, oldest), Ct)).StatusCode);
    }

    [Fact]
    public async Task The_current_weekly_board_stays_open_to_everyone()
    {
        using var client = Client();
        var worldId = await WorldWithClosedWindowsAsync(client, 1);

        var response = await client.GetAsync($"/api/v1/worlds/{worldId}/leaderboards/user/weeklyScoreGained", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True((await response.ReadStrictAsync<LeaderboardBoardResponse>(Ct)).Available);
    }

    [Fact]
    public async Task Unknown_scope_or_category_is_a_bad_request()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();

        var response = await client.GetAsync($"/api/v1/worlds/{worldId}/leaderboards/nonsense/score", Ct);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var response2 = await client.GetAsync($"/api/v1/worlds/{worldId}/leaderboards/user/nonsense", Ct);
        Assert.Equal(HttpStatusCode.BadRequest, response2.StatusCode);
    }

    [Fact]
    public async Task Unknown_world_is_a_404_everywhere()
    {
        using var client = Client();
        var unknownWorld = Guid.CreateVersion7();

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/worlds/{unknownWorld}/leaderboards", Ct)).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/worlds/{unknownWorld}/leaderboards/user/score", Ct)).StatusCode);
    }

    [Fact]
    public async Task A_dark_board_page_is_200_with_no_entries_rather_than_404()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();

        var response = await client.GetAsync($"/api/v1/worlds/{worldId}/leaderboards/guild/score", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var board = await response.ReadStrictAsync<LeaderboardBoardResponse>(Ct);
        Assert.False(board.Available);
        Assert.Equal("noGuildSystemYet", board.Reason);
        Assert.Empty(board.Items);
        Assert.Null(board.NextAfterRank);
    }

    /// <summary>
    /// Founds <paramref name="levels"/>.Length settlements, each owned by a
    /// distinct real account, at the given longhouse levels, then refreshes
    /// the boards.
    /// </summary>
    private async Task<List<(SettlementResponse Settlement, Guid UserId)>> BuildUserBoardAsync(
        HttpClient client, Guid worldId, int[] levels)
    {
        var plots = await GetPlotsAsync(client, worldId);
        var settlements = new List<(SettlementResponse, Guid)>();

        foreach (var level in levels)
        {
            var ownerId = Unique("owner");
            var settlement = await FoundSettlementAsync(client, worldId, plots, ownerId);
            var (userId, _) = await RegisterAndClaimAsync(client, ownerId);
            await SetLonghouseLevelAsync(settlement.Id, level);
            settlements.Add((settlement, userId));
        }

        await RefreshBoardsAsync(worldId);
        return settlements;
    }

    [Fact]
    public async Task Board_page_keyset_pagination_walks_every_entry_exactly_once_in_rank_order()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();
        // Triangular numbers -> distinct scores 55, 45, 36, 28, 21 for levels 10..6.
        await BuildUserBoardAsync(client, worldId, [10, 9, 8, 7, 6]);

        var seenRanks = new List<int>();
        var afterRank = 0;
        for (var guard = 0; guard < 10; guard++)
        {
            var page = await client.GetFromJsonAsync<LeaderboardBoardResponse>(
                $"/api/v1/worlds/{worldId}/leaderboards/user/score?afterRank={afterRank}&pageSize=2",
                SqliteApiFixture.StrictJson, Ct);

            Assert.True(page!.Available);
            if (page.Items.Count == 0)
            {
                Assert.Null(page.NextAfterRank);
                break;
            }

            Assert.True(page.Items.Count <= 2);
            seenRanks.AddRange(page.Items.Select(i => i.Rank));
            Assert.Equal(page.Items[^1].Rank, page.NextAfterRank);
            afterRank = page.NextAfterRank!.Value;
        }

        Assert.Equal([1, 2, 3, 4, 5], seenRanks);
    }

    [Fact]
    public async Task Board_page_breaks_ties_by_ascending_subject_id_and_reports_delta()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();
        var settlements = await BuildUserBoardAsync(client, worldId, [4, 4]);

        var page = await client.GetFromJsonAsync<LeaderboardBoardResponse>(
            $"/api/v1/worlds/{worldId}/leaderboards/user/score", SqliteApiFixture.StrictJson, Ct);

        Assert.Equal(2, page!.Items.Count);
        var expectedOrder = settlements.Select(s => s.UserId).Order().ToList();
        Assert.Equal(expectedOrder, page.Items.Select(i => i.SubjectId));
        Assert.All(page.Items, i => Assert.Null(i.PreviousRank));
        Assert.All(page.Items, i => Assert.Null(i.Delta));
    }

    [Fact]
    public async Task Me_requires_authentication()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();

        var response = await client.GetAsync($"/api/v1/worlds/{worldId}/leaderboards/user/score/me", Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_returns_a_window_around_the_callers_rank()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();
        // 7 users -> the target (rank 4, middle) has a full radius-3 window on both sides.
        var settlements = await BuildUserBoardAsync(client, worldId, [10, 9, 8, 7, 6, 5, 4]);
        var target = settlements[3].Settlement; // level 7 -> rank 4.

        Authorize(client, await FindTokenForOwnerAsync(target.Id));

        var me = await client.GetFromJsonAsync<LeaderboardMeResponse>(
            $"/api/v1/worlds/{worldId}/leaderboards/user/score/me", SqliteApiFixture.StrictJson, Ct);

        Assert.Equal(4, me!.MyRank);
        Assert.Equal(7, me.Items.Count); // radius 3 both sides, all in range 1..7.
        Assert.Equal([1, 2, 3, 4, 5, 6, 7], me.Items.Select(i => i.Rank));
    }

    /// <summary>Looks up the access token of the account owning <paramref name="settlementId"/>, minting a fresh login.</summary>
    private async Task<string> FindTokenForOwnerAsync(Guid settlementId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var settlement = await db.Settlements.SingleAsync(s => s.Id == settlementId, Ct);
        var user = await db.Users.SingleAsync(u => u.Id == settlement.UserId, Ct);

        var tokens = scope.ServiceProvider.GetRequiredService<Bjarnoy.Api.Auth.JwtTokenService>();
        return tokens.CreateAccessToken(user);
    }

    [Fact]
    public async Task Me_is_404_when_the_caller_has_no_entry_on_the_board()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();
        // A user with no settlement in this world at all.
        var (_, token) = await RegisterAndClaimAsync(client, Unique("unclaimed"));
        Authorize(client, token);

        var response = await client.GetAsync($"/api/v1/worlds/{worldId}/leaderboards/user/score/me", Ct);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Me_for_settlement_scope_defaults_to_the_callers_own_settlement()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();
        var plots = await GetPlotsAsync(client, worldId);
        var ownerId = Unique("owner");
        var settlement = await FoundSettlementAsync(client, worldId, plots, ownerId);
        var (_, token) = await RegisterAndClaimAsync(client, ownerId);
        await SetLonghouseLevelAsync(settlement.Id, 5);
        // A second settlement so the board has more than one entry.
        var otherOwnerId = Unique("owner");
        var other = await FoundSettlementAsync(client, worldId, plots, otherOwnerId);
        await RegisterAndClaimAsync(client, otherOwnerId);
        await SetLonghouseLevelAsync(other.Id, 2);
        await RefreshBoardsAsync(worldId);

        Authorize(client, token);
        var me = await client.GetFromJsonAsync<LeaderboardMeResponse>(
            $"/api/v1/worlds/{worldId}/leaderboards/settlement/biggestSettlement/me",
            SqliteApiFixture.StrictJson, Ct);

        Assert.Equal(1, me!.MyRank); // higher level -> higher score -> rank 1.
        Assert.Contains(me.Items, i => i.SubjectId == settlement.Id);
    }

    [Fact]
    public async Task Me_for_settlement_scope_refuses_a_settlement_the_caller_does_not_own()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();
        var plots = await GetPlotsAsync(client, worldId);

        var myOwnerId = Unique("owner");
        var mine = await FoundSettlementAsync(client, worldId, plots, myOwnerId);
        var (_, myToken) = await RegisterAndClaimAsync(client, myOwnerId);

        var theirOwnerId = Unique("owner");
        var someoneElses = await FoundSettlementAsync(client, worldId, plots, theirOwnerId);
        await RegisterAndClaimAsync(client, theirOwnerId);
        await RefreshBoardsAsync(worldId);

        Authorize(client, myToken);
        var response = await client.GetAsync(
            $"/api/v1/worlds/{worldId}/leaderboards/settlement/biggestSettlement/me?subjectId={someoneElses.Id}",
            Ct);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Me_for_settlement_scope_404s_for_an_unknown_settlement_id()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();
        var plots = await GetPlotsAsync(client, worldId);
        var myOwnerId = Unique("owner");
        await FoundSettlementAsync(client, worldId, plots, myOwnerId);
        var (_, token) = await RegisterAndClaimAsync(client, myOwnerId);

        Authorize(client, token);
        var response = await client.GetAsync(
            $"/api/v1/worlds/{worldId}/leaderboards/settlement/biggestSettlement/me?subjectId={Guid.CreateVersion7()}",
            Ct);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Directory_returns_closed_windows_once_the_first_one_closes_and_lights_up_weekly_score_gained()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();
        var (settlement, _) = (await BuildUserBoardAsync(client, worldId, [5]))[0]; // score 15

        var before = await client.GetFromJsonAsync<LeaderboardDirectoryResponse>(
            $"/api/v1/worlds/{worldId}/leaderboards", SqliteApiFixture.StrictJson, Ct);
        Assert.Empty(before!.WeeklyWindows);
        AssertDark(before.Boards, "user", "weeklyScoreGained", "noWeeklyWindowsYet");

        _factory.Time.Advance(LeaderboardService.WeeklyWindowLength + TimeSpan.FromMinutes(1));
        await CloseDueWindowsAsync(worldId);

        // Closed windows are listed for premium callers (week history is a premium feature).
        Authorize(client, await TierTokenAsync(client, premium: true));
        var after = await client.GetFromJsonAsync<LeaderboardDirectoryResponse>(
            $"/api/v1/worlds/{worldId}/leaderboards", SqliteApiFixture.StrictJson, Ct);
        var window = Assert.Single(after!.WeeklyWindows);
        Assert.Equal(window.PeriodStart + LeaderboardService.WeeklyWindowLength, window.PeriodEnd);

        var weeklyBoard = Assert.Single(after.Boards, b => b.Scope == "user" && b.Category == "weeklyScoreGained");
        Assert.True(weeklyBoard.Available);
        Assert.Null(weeklyBoard.Reason);
        Assert.Equal(1, weeklyBoard.EntryCount);
        Assert.NotEqual(Guid.Empty, settlement.Id); // sanity: settlement was actually founded.
    }

    [Fact]
    public async Task Board_page_with_period_start_returns_the_matching_final_weekly_snapshot()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();
        await BuildUserBoardAsync(client, worldId, [5]); // score 15

        _factory.Time.Advance(LeaderboardService.WeeklyWindowLength + TimeSpan.FromMinutes(1));
        await CloseDueWindowsAsync(worldId);

        // Naming a past window is week history: premium only.
        Authorize(client, await TierTokenAsync(client, premium: true));
        var directory = await client.GetFromJsonAsync<LeaderboardDirectoryResponse>(
            $"/api/v1/worlds/{worldId}/leaderboards", SqliteApiFixture.StrictJson, Ct);
        var window = Assert.Single(directory!.WeeklyWindows);

        var page = await client.GetFromJsonAsync<LeaderboardBoardResponse>(
            $"/api/v1/worlds/{worldId}/leaderboards/user/weeklyScoreGained?periodStart={Uri.EscapeDataString(window.PeriodStart.ToString("O"))}",
            SqliteApiFixture.StrictJson, Ct);

        Assert.True(page!.Available);
        Assert.True(page.IsFinal);
        Assert.Equal(window.PeriodStart, page.PeriodStart);
        Assert.Equal(window.PeriodEnd, page.PeriodEnd);
        var entry = Assert.Single(page.Items);
        Assert.Equal(15, entry.Value);

        // The "current" (no periodStart) read falls back to the same, most recently closed window.
        var current = await client.GetFromJsonAsync<LeaderboardBoardResponse>(
            $"/api/v1/worlds/{worldId}/leaderboards/user/weeklyScoreGained", SqliteApiFixture.StrictJson, Ct);
        Assert.True(current!.IsFinal);
        Assert.Equal(window.PeriodStart, current.PeriodStart);
    }

    [Fact]
    public async Task Weekly_stats_endpoint_pages_newest_window_first()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync();
        var settlements = await BuildUserBoardAsync(client, worldId, [5]);
        var userId = settlements[0].UserId;

        // Three consecutive closed windows for the same user.
        _factory.Time.Advance((LeaderboardService.WeeklyWindowLength * 3) + TimeSpan.FromMinutes(1));
        await CloseDueWindowsAsync(worldId);

        var firstPage = await client.GetFromJsonAsync<WeeklyStatsPageResponse>(
            $"/api/v1/worlds/{worldId}/stats/users/{userId}/weekly?pageSize=2", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(2, firstPage!.Items.Count);
        Assert.NotNull(firstPage.NextCursor);
        // Newest first: the most recent window's period starts latest.
        Assert.True(firstPage.Items[0].PeriodStart > firstPage.Items[1].PeriodStart);

        var secondPage = await client.GetFromJsonAsync<WeeklyStatsPageResponse>(
            $"/api/v1/worlds/{worldId}/stats/users/{userId}/weekly?pageSize=2&cursor={firstPage.NextCursor}",
            SqliteApiFixture.StrictJson, Ct);
        Assert.Single(secondPage!.Items);
        Assert.Null(secondPage.NextCursor);
        Assert.True(firstPage.Items[^1].PeriodStart > secondPage.Items[0].PeriodStart);
    }
}
