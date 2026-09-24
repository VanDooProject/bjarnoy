using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Ai;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The admin AI-players surface (docs/design/ai-players.md's "API" section):
/// the 401/403 matrix, taking a settlement over right now, listing every AI
/// jarl with its objectives, editing personality/objectives, and that a
/// settlement's own response carries <c>isAi</c>/<c>aiPersonality</c> once an
/// AI holds it.
/// </summary>
public sealed class AdminAiPlayersEndpointsTests : IAsyncLifetime
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

    /// <summary>Registers a fresh player, promotes it to Admin in the DB, then logs in to mint a token carrying the role.</summary>
    private async Task<string> CreateAdminTokenAsync(HttpClient client)
    {
        var userName = Unique("admin");
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == auth.User.Id, Ct);
            user.Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var loggedIn = await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, loggedIn.StatusCode);
        return (await loggedIn.ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
    }

    private async Task<string> CreatePlayerTokenAsync(HttpClient client)
    {
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("player"), "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        return (await registered.ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
    }

    /// <summary>Creates a world and founds an anonymous settlement on its first usable plot — takeover-eligible right away.</summary>
    private async Task<(Guid WorldId, SettlementResponse Settlement)> FoundAnonymousAsync(HttpClient client)
    {
        var world = await (await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), Seed: 21, Radius: 60), Ct))
            .ReadStrictAsync<WorldResponse>(Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);

        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", Unique("owner")),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (world.Id, await response.ReadStrictAsync<SettlementResponse>(Ct));
    }

    [Fact]
    public async Task Anonymous_and_player_callers_are_refused_the_admin_ai_players_surface()
    {
        using var anonymous = Client();
        var anonymousResponse = await anonymous.GetAsync("/api/v1/admin/ai-players", Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousResponse.StatusCode);

        using var player = Client();
        Authorize(player, await CreatePlayerTokenAsync(player));

        var playerResponse = await player.GetAsync("/api/v1/admin/ai-players", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, playerResponse.StatusCode);

        var playerTakeover = await player.PostJsonAsync(
            $"/api/v1/admin/settlements/{Guid.CreateVersion7()}/ai", new TakeOverSettlementRequest(), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, playerTakeover.StatusCode);

        var playerUpdate = await player.PutJsonAsync(
            $"/api/v1/admin/ai-players/{Guid.CreateVersion7()}", new UpdateAiPlayerRequest(), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, playerUpdate.StatusCode);
    }

    [Fact]
    public async Task Admin_can_take_over_an_anonymous_settlement_right_now()
    {
        using var client = Client();
        var (_, settlement) = await FoundAnonymousAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/ai", new TakeOverSettlementRequest("aggressive"), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var aiPlayer = await response.ReadStrictAsync<AiPlayerAdminResponse>(Ct);

        Assert.Equal("aggressive", aiPlayer.Personality);
        Assert.Equal(settlement.Id, aiPlayer.TakenOverSettlementId);
        Assert.NotEmpty(aiPlayer.Objectives);
        Assert.Single(aiPlayer.Settlements, s => s.Id == settlement.Id);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var entity = await db.Settlements.AsNoTracking().SingleAsync(s => s.Id == settlement.Id, Ct);
        Assert.Equal(aiPlayer.UserId, entity.UserId);
    }

    [Fact]
    public async Task Taking_over_an_unknown_settlement_is_a_404()
    {
        using var client = Client();
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{Guid.CreateVersion7()}/ai", new TakeOverSettlementRequest(), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Taking_over_an_already_claimed_settlement_is_a_409()
    {
        using var client = Client();
        var (_, settlement) = await FoundAnonymousAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var first = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/ai", new TakeOverSettlementRequest("economic"), Ct);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/ai", new TakeOverSettlementRequest("economic"), Ct);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task Taking_over_with_an_unknown_personality_is_a_400()
    {
        using var client = Client();
        var (_, settlement) = await FoundAnonymousAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/ai", new TakeOverSettlementRequest("berserk"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Taken_over_settlement_carries_isAi_and_aiPersonality()
    {
        using var client = Client();
        var (_, settlement) = await FoundAnonymousAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var takeover = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/ai", new TakeOverSettlementRequest("defensive"), Ct);
        Assert.Equal(HttpStatusCode.OK, takeover.StatusCode);

        var response = await client.GetAsync($"/api/v1/admin/settlements/{settlement.Id}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var after = await response.ReadStrictAsync<SettlementResponse>(Ct);

        Assert.True(after.IsAi);
        Assert.Equal("defensive", after.AiPersonality);
    }

    [Fact]
    public async Task A_freshly_founded_settlement_is_not_flagged_as_ai()
    {
        using var client = Client();
        var (_, settlement) = await FoundAnonymousAsync(client);

        Assert.False(settlement.IsAi);
        Assert.Null(settlement.AiPersonality);
    }

    [Fact]
    public async Task Admin_can_list_ai_players_with_objectives_and_settlements()
    {
        using var client = Client();
        var (_, settlement) = await FoundAnonymousAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var takeover = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/ai", new TakeOverSettlementRequest("economic"), Ct);
        var created = await takeover.ReadStrictAsync<AiPlayerAdminResponse>(Ct);

        var response = await client.GetAsync("/api/v1/admin/ai-players", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var list = await response.ReadStrictAsync<List<AiPlayerAdminResponse>>(Ct);

        var found = Assert.Single(list, a => a.UserId == created.UserId);
        Assert.Equal("economic", found.Personality);
        Assert.Single(found.Settlements, s => s.Id == settlement.Id);
        // A freshly taken-over Economic AI starts with an unmet "reach
        // longhouse level 10" default objective (AiProfiles.EconomicProfile).
        Assert.Contains(found.Objectives, o => o.Kind == "reachlonghouselevel" && !o.Met);
    }

    [Fact]
    public async Task Admin_can_replace_an_ai_players_personality_and_objectives()
    {
        using var client = Client();
        var (_, settlement) = await FoundAnonymousAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var takeover = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/ai", new TakeOverSettlementRequest("economic"), Ct);
        var created = await takeover.ReadStrictAsync<AiPlayerAdminResponse>(Ct);

        var response = await client.PutJsonAsync(
            $"/api/v1/admin/ai-players/{created.UserId}",
            new UpdateAiPlayerRequest(
                Personality: "aggressive",
                Objectives:
                [
                    new AiObjectiveRequest("garrisonstrength", Target: 25),
                    new AiObjectiveRequest("reachbuildinglevel", Building: "barracks", Target: 5),
                ]),
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.ReadStrictAsync<AiPlayerAdminResponse>(Ct);

        Assert.Equal("aggressive", updated.Personality);
        Assert.Equal(2, updated.Objectives.Count);
        Assert.Contains(updated.Objectives, o => o.Kind == "garrisonstrength" && o.Target == 25);
        Assert.Contains(updated.Objectives, o => o.Kind == "reachbuildinglevel" && o.Building == "barracks");

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var stored = await db.AiPlayers.AsNoTracking().SingleAsync(a => a.UserId == created.UserId, Ct);
        Assert.Equal(AiPersonality.Aggressive, stored.Personality);
        Assert.Equal(2, stored.Objectives.Count);
    }

    [Fact]
    public async Task Updating_an_unknown_ai_player_is_a_404()
    {
        using var client = Client();
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PutJsonAsync(
            $"/api/v1/admin/ai-players/{Guid.CreateVersion7()}",
            new UpdateAiPlayerRequest(Personality: "balanced"), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Updating_with_an_unknown_objective_kind_is_a_400()
    {
        using var client = Client();
        var (_, settlement) = await FoundAnonymousAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var takeover = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/ai", new TakeOverSettlementRequest("economic"), Ct);
        var created = await takeover.ReadStrictAsync<AiPlayerAdminResponse>(Ct);

        var response = await client.PutJsonAsync(
            $"/api/v1/admin/ai-players/{created.UserId}",
            new UpdateAiPlayerRequest(Objectives: [new AiObjectiveRequest("winTheGame", Target: 1)]), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Updating_a_reach_building_level_objective_without_a_building_is_a_400()
    {
        using var client = Client();
        var (_, settlement) = await FoundAnonymousAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var takeover = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/ai", new TakeOverSettlementRequest("economic"), Ct);
        var created = await takeover.ReadStrictAsync<AiPlayerAdminResponse>(Ct);

        var response = await client.PutJsonAsync(
            $"/api/v1/admin/ai-players/{created.UserId}",
            new UpdateAiPlayerRequest(Objectives: [new AiObjectiveRequest("reachbuildinglevel", Target: 5)]), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Updating_a_production_rate_objective_without_a_resource_is_a_400()
    {
        using var client = Client();
        var (_, settlement) = await FoundAnonymousAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var takeover = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/ai", new TakeOverSettlementRequest("economic"), Ct);
        var created = await takeover.ReadStrictAsync<AiPlayerAdminResponse>(Ct);

        var response = await client.PutJsonAsync(
            $"/api/v1/admin/ai-players/{created.UserId}",
            new UpdateAiPlayerRequest(Objectives: [new AiObjectiveRequest("productionrate", Target: 5)]), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Updating_with_a_non_positive_target_is_a_400()
    {
        using var client = Client();
        var (_, settlement) = await FoundAnonymousAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var takeover = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/ai", new TakeOverSettlementRequest("economic"), Ct);
        var created = await takeover.ReadStrictAsync<AiPlayerAdminResponse>(Ct);

        var response = await client.PutJsonAsync(
            $"/api/v1/admin/ai-players/{created.UserId}",
            new UpdateAiPlayerRequest(Objectives: [new AiObjectiveRequest("garrisonstrength", Target: 0)]), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
