using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Guilds;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Guilds through the real HTTP stack: founding, membership, the
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
    /// is what guild membership logic keys off.
    /// </summary>
    private async Task<(AuthResponse Auth, Guid WorldId, Guid SettlementId)> RegisterWithSettlementAsync(HttpClient client)
    {
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);

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

        // The base cap is 10; the founder already counts as one member,
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

        var oneTooMany = await JoinWorldWithSettlementAsync(worldId);
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

        var member = await JoinWorldWithSettlementAsync(worldId);
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

        var officer = await JoinWorldWithSettlementAsync(worldId);
        Authorize(client, officer.AccessToken);
        await client.PostJsonAsync($"/api/v1/guilds/{guild.Id}/join", new { }, Ct);

        var member = await JoinWorldWithSettlementAsync(worldId);
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
    public async Task Guild_caps_are_the_fixed_base_plus_half_the_highest_member_longhouse_level()
    {
        using var client = Client();
        var (auth, worldId, settlementId) = await RegisterWithSettlementAsync(client);
        Authorize(client, auth.AccessToken);

        var guild = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "CAP", null), Ct))
            .ReadStrictAsync<GuildResponse>(Ct);

        var baseCaps = await client.GetFromJsonAsync<GuildCapsResponse>(
            $"/api/v1/guilds/{guild.Id}/caps", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(GuildRules.MemberCap(await LonghouseLevelAsync(settlementId)), baseCaps!.MemberCap);
        Assert.Equal(1, baseCaps.MaxActivePeaceTreaties);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var updated = await db.PlacedBuildings
                .Where(b => b.SettlementId == settlementId && b.Type == Bjarnoy.Domain.Buildings.BuildingType.Longhouse)
                .ExecuteUpdateAsync(u => u.SetProperty(b => b.Level, 6), Ct);
            Assert.Equal(1, updated);
        }

        var raised = await client.GetFromJsonAsync<GuildCapsResponse>(
            $"/api/v1/guilds/{guild.Id}/caps", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(13, raised!.MemberCap);
        Assert.Equal(1, raised.MaxActivePeaceTreaties);
    }

    private async Task<int> LonghouseLevelAsync(Guid settlementId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.PlacedBuildings
            .Where(b => b.SettlementId == settlementId && b.Type == Bjarnoy.Domain.Buildings.BuildingType.Longhouse)
            .Select(b => b.Level)
            .SingleAsync(Ct);
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

        var leaderB = await JoinWorldWithSettlementAsync(worldId);
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

        // A guild may hold exactly one active/pending treaty.
        var leaderB = await JoinWorldWithSettlementAsync(worldId);
        Authorize(client, leaderB.AccessToken);
        var guildB = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), "CP2", null), Ct))
            .ReadStrictAsync<GuildResponse>(Ct);

        var leaderC = await JoinWorldWithSettlementAsync(worldId);
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

    /// <summary>Founds a guild as <paramref name="leader"/> and returns it.</summary>
    private async Task<GuildResponse> FoundGuildAsync(HttpClient client, AuthResponse leader, string tag)
    {
        Authorize(client, leader.AccessToken);
        var worldId = await WorldOfAsync(leader.User.Id);
        return await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/guilds", new CreateGuildRequest(Unique("Hird"), tag, null), Ct))
            .ReadStrictAsync<GuildResponse>(Ct);
    }

    /// <summary>
    /// A fresh player with a real settlement in the world, on a client of its own (a client already authorised as someone else would found
    /// under that account and be refused), at least the minimum distance from every settlement already standing.
    /// </summary>
    private async Task<AuthResponse> JoinWorldWithSettlementAsync(Guid worldId)
    {
        using var fresh = Client();
        var islands = await fresh.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldId}/islands", SqliteApiFixture.StrictJson, Ct);

        List<(int Q, int R)> taken;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            taken = (await db.Settlements.AsNoTracking().Where(s => s.WorldId == worldId)
                    .Select(s => new { s.CentreQ, s.CentreR }).ToListAsync(Ct))
                .Select(s => (s.CentreQ, s.CentreR)).ToList();
        }

        static int Distance(int q1, int r1, int q2, int r2) =>
            (Math.Abs(q1 - q2) + Math.Abs(q1 + r1 - q2 - r2) + Math.Abs(r1 - r2)) / 2;

        var (islandId, q, r) = islands!
            .SelectMany(i => i.StartPositions.Select(p => (i.Id, p.Q, p.R)))
            .First(p => taken.All(t => Distance(t.Q, t.R, p.Q, p.R) >= 15));

        var ownerId = Unique("owner");
        var found = await fresh.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(islandId, q, r, Unique("Stad"), Unique("Jarl"), ownerId),
            Ct);
        Assert.True(found.IsSuccessStatusCode, await found.Content.ReadAsStringAsync(Ct));

        return await RegisterAsync(fresh, ownerId);
    }

    private async Task<Guid> WorldOfAsync(Guid userId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.Settlements.AsNoTracking().Where(s => s.UserId == userId).Select(s => s.WorldId).FirstAsync(Ct);
    }

    /// <summary>
    /// Moves each user's settlement next to the first user's, inside the fog the first user explores, so the world list shows them all.
    /// </summary>
    private async Task GatherSettlementsAsync(params AuthResponse[] players)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var anchor = await db.Settlements.FirstAsync(s => s.UserId == players[0].User.Id, Ct);
        for (var i = 1; i < players.Length; i++)
        {
            var moved = await db.Settlements.FirstAsync(s => s.UserId == players[i].User.Id, Ct);
            moved.CentreQ = anchor.CentreQ + i;
            moved.CentreR = anchor.CentreR;
        }

        await db.SaveChangesAsync(Ct);
    }

    private async Task<Dictionary<Guid, SettlementSummary>> ListAsSeenByAsync(HttpClient client, AuthResponse caller, Guid worldId)
    {
        Authorize(client, caller.AccessToken);
        var list = await client.GetFromJsonAsync<List<SettlementSummary>>(
            $"/api/v1/worlds/{worldId}/settlements", SqliteApiFixture.StrictJson, Ct);
        return list!.ToDictionary(s => s.Id);
    }

    private async Task<Guid> SettlementIdOfAsync(AuthResponse player)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.Settlements.AsNoTracking().Where(s => s.UserId == player.User.Id).Select(s => s.Id).FirstAsync(Ct);
    }

    [Fact]
    public async Task World_list_tells_own_guild_treaty_and_rival_settlements_apart()
    {
        using var client = Client();
        var (leaderA, worldId, _) = await RegisterWithSettlementAsync(client);
        var guildA = await FoundGuildAsync(client, leaderA, "RL1");

        var mateA = await JoinWorldWithSettlementAsync(worldId);
        Authorize(client, mateA.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await client.PostJsonAsync($"/api/v1/guilds/{guildA.Id}/join", new { }, Ct)).StatusCode);

        var leaderB = await JoinWorldWithSettlementAsync(worldId);
        var guildB = await FoundGuildAsync(client, leaderB, "RL2");

        var stranger = await JoinWorldWithSettlementAsync(worldId);

        Authorize(client, leaderA.AccessToken);
        var proposed = await (await client.PostJsonAsync(
            $"/api/v1/guilds/{guildA.Id}/treaties", new ProposeTreatyRequest(guildB.Id), Ct))
            .ReadStrictAsync<GuildTreatyResponse>(Ct);
        Authorize(client, leaderB.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await client.PostJsonAsync($"/api/v1/treaties/{proposed.Id}/accept", new { }, Ct)).StatusCode);

        await GatherSettlementsAsync(leaderA, mateA, leaderB, stranger);
        var own = await SettlementIdOfAsync(leaderA);
        var mate = await SettlementIdOfAsync(mateA);
        var treaty = await SettlementIdOfAsync(leaderB);
        var rival = await SettlementIdOfAsync(stranger);

        var seen = await ListAsSeenByAsync(client, leaderA, worldId);

        Assert.Equal(("mine", true), (seen[own].Relation, seen[own].Mine));
        Assert.Equal(("guild", false), (seen[mate].Relation, seen[mate].Mine));
        Assert.Equal(("treaty", false), (seen[treaty].Relation, seen[treaty].Mine));
        Assert.Equal(("rival", false), (seen[rival].Relation, seen[rival].Mine));

        // The treaty runs both ways.
        var fromTheOtherSide = await ListAsSeenByAsync(client, leaderB, worldId);
        Assert.Equal("treaty", fromTheOtherSide[own].Relation);
        Assert.Equal("treaty", fromTheOtherSide[mate].Relation);
    }

    [Fact]
    public async Task A_treaty_that_is_only_proposed_does_not_make_the_other_guild_an_ally()
    {
        using var client = Client();
        var (leaderA, worldId, _) = await RegisterWithSettlementAsync(client);
        var guildA = await FoundGuildAsync(client, leaderA, "RP1");
        var leaderB = await JoinWorldWithSettlementAsync(worldId);
        var guildB = await FoundGuildAsync(client, leaderB, "RP2");

        Authorize(client, leaderA.AccessToken);
        await client.PostJsonAsync($"/api/v1/guilds/{guildA.Id}/treaties", new ProposeTreatyRequest(guildB.Id), Ct);

        await GatherSettlementsAsync(leaderA, leaderB);
        var seen = await ListAsSeenByAsync(client, leaderA, worldId);

        Assert.Equal("rival", seen[await SettlementIdOfAsync(leaderB)].Relation);
    }

    [Fact]
    public async Task A_player_in_no_guild_sees_every_other_settlement_as_a_rival()
    {
        using var client = Client();
        var (leaderA, worldId, _) = await RegisterWithSettlementAsync(client);
        await FoundGuildAsync(client, leaderA, "RN1");
        var loner = await JoinWorldWithSettlementAsync(worldId);

        await GatherSettlementsAsync(loner, leaderA);
        var seen = await ListAsSeenByAsync(client, loner, worldId);

        Assert.Equal("mine", seen[await SettlementIdOfAsync(loner)].Relation);
        Assert.Equal("rival", seen[await SettlementIdOfAsync(leaderA)].Relation);
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
