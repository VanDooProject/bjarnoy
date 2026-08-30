using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Guilds;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Guilds through the real HTTP stack: founding, membership, the fee, the
/// board, and peace treaties. See docs/design/guild-alliance-system.md.
/// </summary>
public sealed class GuildEndpointsTests : IAsyncLifetime
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

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    /// <summary>Registers a fresh player. Guild endpoints need a real account, unlike founding a settlement.</summary>
    private async Task<AuthResponse> RegisterAsync(HttpClient client, string? existingOwnerId = null)
    {
        var response = await client.PostJsonAsync(
            "/api/v1/auth/register",
            new RegisterRequest(Unique("player"), "correct-horse-battery", existingOwnerId),
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.ReadStrictAsync<AuthResponse>(Ct);
    }

    /// <summary>
    /// Founds a settlement anonymously (as settlement founding still allows)
    /// under a fresh owner id, then registers a real account claiming it —
    /// the only way a settlement ends up owned by a real <c>UserId</c>, which
    /// is what guild membership/fee logic keys off.
    /// </summary>
    private async Task<(AuthResponse Auth, Guid WorldId, Guid SettlementId)> RegisterWithSettlementAsync(HttpClient client)
    {
        var world = await (await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), 21, 60), Ct))
            .ReadStrictAsync<WorldResponse>(Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var ownerId = Unique("owner");
        var settlement = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, Unique("Stad"), Unique("Jarl"), ownerId),
            Ct)).ReadStrictAsync<SettlementResponse>(Ct);

        var auth = await RegisterAsync(client, ownerId);
        return (auth, world.Id, settlement.Id);
    }

    /// <summary>
    /// Founds a settlement in an existing world, claimed by a fresh account.
    /// Picks the first start position no settlement already stands on (read
    /// straight from the database) so repeated calls against the same world
    /// never collide on a plot.
    /// </summary>
    private async Task<AuthResponse> JoinWorldWithSettlementAsync(HttpClient client, Guid worldId)
    {
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldId}/islands", SqliteApiFixture.StrictJson, Ct);

        HashSet<(int Q, int R)> taken;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            taken = (await db.Settlements.AsNoTracking()
                    .Where(s => s.WorldId == worldId)
                    .Select(s => new { s.CentreQ, s.CentreR })
                    .ToListAsync(Ct))
                .Select(s => (s.CentreQ, s.CentreR))
                .ToHashSet();
        }

        var (islandId, q, r) = islands!
            .SelectMany(i => i.StartPositions.Select(p => (i.Id, p.Q, p.R)))
            .First(p => !taken.Contains((p.Q, p.R)));

        var ownerId = Unique("owner");
        await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(islandId, q, r, Unique("Stad"), Unique("Jarl"), ownerId),
            Ct);

        return await RegisterAsync(client, ownerId);
    }

    /// <summary>Admin god-mode, used directly against the database like AuthEndpointsTests.SetStatusAsync.</summary>
    private async Task GrantResourcesAsync(Guid settlementId, ResourceAmounts delta)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var settlements = scope.ServiceProvider.GetRequiredService<
            Bjarnoy.Infrastructure.Services.SettlementService>();
        var result = await settlements.GrantResourcesAsync(settlementId, delta, Ct);
        Assert.True(result.Accepted);
    }

    [Fact]
    public async Task Founding_a_guild_makes_the_founder_its_leader()
    {
        using var client = Client();
        var (auth, worldId, _) = await RegisterWithSettlementAsync(client);
        Authorize(client, auth.AccessToken);

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds",
            new CreateGuildRequest(Unique("Hird"), "HRD", "A test guild."),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var guild = await response.ReadStrictAsync<GuildResponse>(Ct);

        Assert.Equal("copper", guild.FeeTier);
        Assert.Equal(1, guild.MemberCount);
        var leader = Assert.Single(guild.Members);
        Assert.Equal(auth.User.Id, leader.UserId);
        Assert.Equal("leader", leader.Role);
    }

    [Fact]
    public async Task A_player_already_in_a_guild_cannot_found_or_join_another()
    {
        using var client = Client();
        var (auth, worldId, _) = await RegisterWithSettlementAsync(client);
        Authorize(client, auth.AccessToken);

        await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "HR1", null), Ct);

        var second = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "HR2", null), Ct);

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Equal("AlreadyInAGuild", await second.RejectionAsync(Ct));
    }

    [Fact]
    public async Task Joining_is_refused_once_the_member_cap_is_reached()
    {
        using var client = Client();
        var (leaderAuth, worldId, _) = await RegisterWithSettlementAsync(client);
        Authorize(client, leaderAuth.AccessToken);

        var guild = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "CAP", null), Ct))
            .ReadStrictAsync<GuildResponse>(Ct);

        // Copper's base cap is 10; the founder already counts as one member,
        // so filling in 9 more (inserted directly — they need no settlement
        // of their own, since a member without one just contributes nothing
        // to the longhouse bonus) reaches the cap exactly.
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            for (var i = 0; i < 9; i++)
            {
                // Not Unique(): UUIDv7's leading hex digits are a millisecond
                // timestamp, so back-to-back calls in a tight loop like this
                // one can truncate to the same 20 characters. The loop index
                // is what actually guarantees distinctness here.
                var name = $"filler-{i}-{Guid.CreateVersion7():N}";
                var filler = new UserEntity
                {
                    UserName = name,
                    NormalizedUserName = name.ToLowerInvariant(),
                    PasswordHash = "TEST-FILLER-NO-LOGIN",
                    CreatedAt = DateTimeOffset.UtcNow,
                };
                db.Users.Add(filler);
                db.GuildMemberships.Add(new GuildMembershipEntity
                {
                    GuildId = guild.Id,
                    UserId = filler.Id,
                    Role = GuildRole.Member,
                    JoinedAt = DateTimeOffset.UtcNow,
                });
            }

            await db.SaveChangesAsync(Ct);
        }

        var oneTooMany = await JoinWorldWithSettlementAsync(client, worldId);
        Authorize(client, oneTooMany.AccessToken);
        var refused = await client.PostJsonAsync($"/api/v1/guilds/{guild.Id}/join", new { }, Ct);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("GuildFull", await refused.RejectionAsync(Ct));
    }

    [Fact]
    public async Task Leaving_as_the_only_member_disbands_the_guild()
    {
        using var client = Client();
        var (auth, worldId, _) = await RegisterWithSettlementAsync(client);
        Authorize(client, auth.AccessToken);

        var guild = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "SOL", null), Ct))
            .ReadStrictAsync<GuildResponse>(Ct);

        var leave = await client.PostJsonAsync($"/api/v1/guilds/{guild.Id}/leave", new { }, Ct);
        Assert.Equal(HttpStatusCode.OK, leave.StatusCode);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var disbanded = await db.Guilds.AsNoTracking().SingleAsync(g => g.Id == guild.Id, Ct);
        Assert.NotNull(disbanded.DisbandedAt);
    }

    [Fact]
    public async Task The_leader_cannot_leave_while_other_members_remain()
    {
        using var client = Client();
        var (leaderAuth, worldId, _) = await RegisterWithSettlementAsync(client);
        Authorize(client, leaderAuth.AccessToken);

        var guild = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "LDR", null), Ct))
            .ReadStrictAsync<GuildResponse>(Ct);

        var member = await JoinWorldWithSettlementAsync(client, worldId);
        Authorize(client, member.AccessToken);
        await client.PostJsonAsync($"/api/v1/guilds/{guild.Id}/join", new { }, Ct);

        Authorize(client, leaderAuth.AccessToken);
        var leave = await client.PostJsonAsync($"/api/v1/guilds/{guild.Id}/leave", new { }, Ct);

        Assert.Equal(HttpStatusCode.Conflict, leave.StatusCode);
        Assert.Equal("LeaderCannotLeave", await leave.RejectionAsync(Ct));
    }

    [Fact]
    public async Task An_officer_may_kick_a_member_but_not_another_officer()
    {
        using var client = Client();
        var (leaderAuth, worldId, _) = await RegisterWithSettlementAsync(client);
        Authorize(client, leaderAuth.AccessToken);

        var guild = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "KCK", null), Ct))
            .ReadStrictAsync<GuildResponse>(Ct);

        var officer = await JoinWorldWithSettlementAsync(client, worldId);
        Authorize(client, officer.AccessToken);
        await client.PostJsonAsync($"/api/v1/guilds/{guild.Id}/join", new { }, Ct);

        var member = await JoinWorldWithSettlementAsync(client, worldId);
        Authorize(client, member.AccessToken);
        await client.PostJsonAsync($"/api/v1/guilds/{guild.Id}/join", new { }, Ct);

        Authorize(client, leaderAuth.AccessToken);
        var promote = await client.PutJsonAsync(
            $"/api/v1/guilds/{guild.Id}/members/{officer.User.Id}/role",
            new SetGuildMemberRoleRequest("officer"),
            Ct);
        Assert.Equal(HttpStatusCode.OK, promote.StatusCode);

        Authorize(client, officer.AccessToken);
        var kickMember = await client.PostJsonAsync(
            $"/api/v1/guilds/{guild.Id}/members/{member.User.Id}/kick", new { }, Ct);
        Assert.Equal(HttpStatusCode.OK, kickMember.StatusCode);

        var kickLeader = await client.PostJsonAsync(
            $"/api/v1/guilds/{guild.Id}/members/{leaderAuth.User.Id}/kick", new { }, Ct);
        Assert.Equal(HttpStatusCode.Forbidden, kickLeader.StatusCode);
    }

    [Fact]
    public async Task Paying_the_fee_deducts_it_and_extends_when_the_member_is_next_overdue()
    {
        using var client = Client();
        var (auth, worldId, settlementId) = await RegisterWithSettlementAsync(client);

        // FoundingStock has no Iron; the Copper fee needs 50 of every
        // resource, so this test tops up just enough Iron for one payment
        // the way an admin would — the second payment below must still fail.
        await GrantResourcesAsync(settlementId, new ResourceAmounts(0, 0, 0, 50));

        Authorize(client, auth.AccessToken);
        var guild = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "FEE", null), Ct))
            .ReadStrictAsync<GuildResponse>(Ct);

        var paid = await client.PostJsonAsync($"/api/v1/guilds/{guild.Id}/fee-payment", new { }, Ct);
        Assert.Equal(HttpStatusCode.OK, paid.StatusCode);
        var member = await paid.ReadStrictAsync<GuildMemberResponse>(Ct);
        Assert.False(member.FeeOverdue);

        var settlementAfter = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlementId}", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(0, settlementAfter!.Resources.Stock.Iron);

        var secondPayment = await client.PostJsonAsync($"/api/v1/guilds/{guild.Id}/fee-payment", new { }, Ct);
        Assert.Equal(HttpStatusCode.Conflict, secondPayment.StatusCode);
        Assert.Equal("NotEnoughResources", await secondPayment.RejectionAsync(Ct));
    }

    [Fact]
    public async Task A_board_topic_carries_its_opening_post_and_accepts_replies()
    {
        using var client = Client();
        var (auth, worldId, _) = await RegisterWithSettlementAsync(client);
        Authorize(client, auth.AccessToken);

        var guild = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "BRD", null), Ct))
            .ReadStrictAsync<GuildResponse>(Ct);

        var topic = await (await client.PostJsonAsync(
            $"/api/v1/guilds/{guild.Id}/board/topics",
            new CreateGuildTopicRequest("Raid at dawn", "report", "We hit their eastern coast."),
            Ct)).ReadStrictAsync<GuildBoardTopicResponse>(Ct);

        Assert.Equal("report", topic.Kind);
        var opening = Assert.Single(topic.Posts);
        Assert.Equal("We hit their eastern coast.", opening.Body);

        var reply = await client.PostJsonAsync(
            $"/api/v1/guilds/{guild.Id}/board/topics/{topic.Id}/posts",
            new CreateGuildPostRequest("Good hunting."),
            Ct);
        Assert.Equal(HttpStatusCode.Created, reply.StatusCode);

        var fetched = await (await client.GetAsync(
            $"/api/v1/guilds/{guild.Id}/board/topics/{topic.Id}", Ct))
            .ReadStrictAsync<GuildBoardTopicResponse>(Ct);
        Assert.Equal(2, fetched.Posts.Count);
    }

    [Fact]
    public async Task A_peace_treaty_goes_from_proposed_to_active_and_can_be_broken()
    {
        using var client = Client();
        var (leaderA, worldId, _) = await RegisterWithSettlementAsync(client);
        Authorize(client, leaderA.AccessToken);
        var guildA = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "TRA", null), Ct))
            .ReadStrictAsync<GuildResponse>(Ct);

        var leaderB = await JoinWorldWithSettlementAsync(client, worldId);
        Authorize(client, leaderB.AccessToken);
        var guildB = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "TRB", null), Ct))
            .ReadStrictAsync<GuildResponse>(Ct);

        Authorize(client, leaderA.AccessToken);
        var proposed = await (await client.PostJsonAsync(
            $"/api/v1/guilds/{guildA.Id}/treaties", new ProposeTreatyRequest(guildB.Id), Ct))
            .ReadStrictAsync<GuildTreatyResponse>(Ct);
        Assert.Equal("proposed", proposed.Status);

        Authorize(client, leaderB.AccessToken);
        var accepted = await (await client.PostJsonAsync(
            $"/api/v1/treaties/{proposed.Id}/accept", new { }, Ct))
            .ReadStrictAsync<GuildTreatyResponse>(Ct);
        Assert.Equal("active", accepted.Status);

        var broken = await (await client.PostJsonAsync(
            $"/api/v1/treaties/{proposed.Id}/break", new { }, Ct))
            .ReadStrictAsync<GuildTreatyResponse>(Ct);
        Assert.Equal("broken", broken.Status);
    }

    [Fact]
    public async Task A_guild_cannot_propose_more_treaties_than_its_tier_allows()
    {
        using var client = Client();
        var (leaderA, worldId, _) = await RegisterWithSettlementAsync(client);
        Authorize(client, leaderA.AccessToken);
        var guildA = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "CP1", null), Ct))
            .ReadStrictAsync<GuildResponse>(Ct);

        // Copper allows exactly one active/pending treaty.
        var leaderB = await JoinWorldWithSettlementAsync(client, worldId);
        Authorize(client, leaderB.AccessToken);
        var guildB = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "CP2", null), Ct))
            .ReadStrictAsync<GuildResponse>(Ct);

        var leaderC = await JoinWorldWithSettlementAsync(client, worldId);
        Authorize(client, leaderC.AccessToken);
        var guildC = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "CP3", null), Ct))
            .ReadStrictAsync<GuildResponse>(Ct);

        Authorize(client, leaderA.AccessToken);
        var first = await client.PostJsonAsync(
            $"/api/v1/guilds/{guildA.Id}/treaties", new ProposeTreatyRequest(guildB.Id), Ct);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await client.PostJsonAsync(
            $"/api/v1/guilds/{guildA.Id}/treaties", new ProposeTreatyRequest(guildC.Id), Ct);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Equal("TreatyCapReached", await second.RejectionAsync(Ct));
    }

    [Fact]
    public async Task Mutating_routes_refuse_an_unauthenticated_caller()
    {
        using var client = Client();
        var response = await client.PostJsonAsync(
            "/api/v1/worlds/" + Guid.NewGuid() + "/guilds",
            new CreateGuildRequest("Nope", "NOP", null),
            Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
