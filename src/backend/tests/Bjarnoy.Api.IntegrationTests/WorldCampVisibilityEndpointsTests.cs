using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Bjarnoy.TestSupport;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The camp data cutoff (docs/design/wildlife-camps.md, "Which islands' camps are sent"): <c>GET /worlds/{id}/islands</c>
/// fills <c>camps</c> and <c>GET /worlds/{id}/camps</c> lists camp states only for islands the caller has seen part of —
/// explored anything in a fog chunk the island's land touches — and the pinned plot suggestion's island counts as seen.
/// Islands are planted with one camp each and an island chunk list under the test's control.
/// </summary>
public sealed class WorldCampVisibilityEndpointsTests : IAsyncLifetime
{
    /// <summary>A chunk far outside any test world: no vision disc ever reaches it.</summary>
    private static readonly FogChunkCoord FarChunk = new(900, 900);

    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private static CampRecord CampOf(IslandEntity island) => new(1000 + island.Index, 0, CampFamilies.Bearrapids, 2, (int)TileOrientation.NE);

    /// <summary>
    /// A world whose every island carries one planted camp; <paramref name="chunksOf"/> decides the island's chunk list
    /// (the generated one when it returns null).
    /// </summary>
    private async Task<(Guid WorldId, List<IslandEntity> Islands)> WorldWithCampsAsync(
        Func<IslandEntity, List<FogChunkCoord>?> chunksOf)
    {
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 80, cancellationToken: Ct);
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var islands = await db.Islands.Where(i => i.WorldId == world.Id).OrderBy(i => i.Index).ToListAsync(Ct);
        foreach (var island in islands)
        {
            island.Camps = [CampOf(island)];
            island.FogChunks = chunksOf(island) ?? island.FogChunks;
        }

        await db.SaveChangesAsync(Ct);
        return (world.Id, islands);
    }

    private HttpClient ClientFor(string? owner)
    {
        var client = _factory.CreateClient();
        if (owner is not null)
        {
            client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        }

        return client;
    }

    private async Task<SettlementResponse> FoundAsync(HttpClient client, Guid worldId, IslandEntity island, string owner)
    {
        var plot = island.StartPositions[0];
        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", owner), Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<SettlementResponse>(Ct);
    }

    private static async Task<List<FullIslandResponse>> IslandsAsync(HttpClient client, Guid worldId) =>
        (await client.GetFullIslandsAsync(worldId, Ct))!;

    private static async Task<List<CampStateResponse>> CampStatesAsync(HttpClient client, Guid worldId) =>
        (await client.GetFromJsonAsync<List<CampStateResponse>>(
            $"/api/v1/worlds/{worldId}/camps", SqliteApiFixture.StrictJson, Ct))!;

    [Fact]
    public async Task An_island_whose_chunk_the_caller_explored_ships_its_camps_and_the_others_ship_none()
    {
        var (worldId, planted) = await WorldWithCampsAsync(_ => null);
        var home = planted.First(i => i.StartPositions.Count > 0);
        // Every other island is moved out of reach, so only the home island can have been seen.
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            foreach (var other in await db.Islands.Where(i => i.WorldId == worldId && i.Id != home.Id).ToListAsync(Ct))
            {
                other.FogChunks = [FarChunk];
            }

            await db.SaveChangesAsync(Ct);
        }

        var owner = Unique("owner");
        using var client = ClientFor(owner);
        await FoundAsync(client, worldId, home, owner);

        var islands = await IslandsAsync(client, worldId);
        var homeResponse = Assert.Single(islands, i => i.Id == home.Id);
        var camp = Assert.Single(homeResponse.Camps);
        Assert.Equal((home.Index + 1000, 0), (camp.Q, camp.R));
        Assert.All(islands.Where(i => i.Id != home.Id), i => Assert.Empty(i.Camps));
        // The island listing itself is not cut: every (non-wasted) island is still there with its start positions.
        Assert.Equal(islands.Count, islands.Select(i => i.Id).Distinct().Count());
        Assert.Equal(home.StartPositions.Count, homeResponse.StartPositions.Count);

        var states = await CampStatesAsync(client, worldId);
        var state = Assert.Single(states);
        Assert.Equal((home.Index + 1000, 0), (state.Q, state.R));
    }

    [Fact]
    public async Task An_island_the_caller_has_not_explored_ships_no_camps_but_stays_in_the_listing()
    {
        var (worldId, planted) = await WorldWithCampsAsync(_ => [FarChunk]);
        var home = planted.First(i => i.StartPositions.Count > 0);
        var owner = Unique("owner");
        using var client = ClientFor(owner);
        await FoundAsync(client, worldId, home, owner);

        var islands = await IslandsAsync(client, worldId);

        Assert.Contains(islands, i => i.Id == home.Id && i.StartPositions.Count > 0);
        Assert.All(islands, i => Assert.Empty(i.Camps));
        Assert.Empty(await CampStatesAsync(client, worldId));
    }

    [Fact]
    public async Task An_island_with_no_stored_chunk_list_ships_no_camps_even_when_the_caller_stands_on_it()
    {
        var (worldId, planted) = await WorldWithCampsAsync(_ => []);
        var home = planted.First(i => i.StartPositions.Count > 0);
        var owner = Unique("owner");
        using var client = ClientFor(owner);
        await FoundAsync(client, worldId, home, owner);

        Assert.All(await IslandsAsync(client, worldId), i => Assert.Empty(i.Camps));
        Assert.Empty(await CampStatesAsync(client, worldId));
    }

    [Fact]
    public async Task A_persisted_explored_chunk_of_the_owner_counts_as_seen()
    {
        var (worldId, planted) = await WorldWithCampsAsync(_ => [FarChunk]);
        var home = planted.First(i => i.StartPositions.Count > 0);
        var owner = Unique("owner");
        using var client = ClientFor(owner);
        await FoundAsync(client, worldId, home, owner);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var bits = new byte[512];
            bits[0] = 1;
            db.PlayerExploredChunks.Add(new PlayerExploredChunkEntity
            {
                WorldId = worldId, OwnerId = owner, ChunkU = FarChunk.U, ChunkV = FarChunk.V,
                Bits = bits, UpdatedAt = DateTimeOffset.UnixEpoch,
            });
            await db.SaveChangesAsync(Ct);
        }

        // Every island shares the far chunk, so every one counts as seen now.
        var islands = await IslandsAsync(client, worldId);
        Assert.All(islands, i => Assert.Single(i.Camps));
        Assert.Equal(islands.Count, (await CampStatesAsync(client, worldId)).Count);
    }

    [Fact]
    public async Task Another_players_explored_chunk_does_not_reveal_camps()
    {
        var (worldId, planted) = await WorldWithCampsAsync(_ => [FarChunk]);
        var home = planted.First(i => i.StartPositions.Count > 0);
        var owner = Unique("owner");
        using var client = ClientFor(owner);
        await FoundAsync(client, worldId, home, owner);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            db.PlayerExploredChunks.Add(new PlayerExploredChunkEntity
            {
                WorldId = worldId, OwnerId = Unique("rival"), ChunkU = FarChunk.U, ChunkV = FarChunk.V,
                IsFull = true, UpdatedAt = DateTimeOffset.UnixEpoch,
            });
            await db.SaveChangesAsync(Ct);
        }

        Assert.All(await IslandsAsync(client, worldId), i => Assert.Empty(i.Camps));
    }

    [Fact]
    public async Task A_caller_without_a_realm_gets_no_camps()
    {
        var (worldId, _) = await WorldWithCampsAsync(_ => null);
        using var anonymous = ClientFor(null);

        Assert.All(await IslandsAsync(anonymous, worldId), i => Assert.Empty(i.Camps));
        Assert.Empty(await CampStatesAsync(anonymous, worldId));
    }

    [Fact]
    public async Task The_island_of_the_pinned_plot_suggestion_counts_as_seen()
    {
        var (worldId, _) = await WorldWithCampsAsync(_ => [FarChunk]);
        using var visitor = ClientFor(Unique("visitor"));

        Assert.All(await IslandsAsync(visitor, worldId), i => Assert.Empty(i.Camps));

        var suggestion = await (await visitor.GetAsync($"/api/v1/worlds/{worldId}/plot-suggestion", Ct))
            .ReadStrictAsync<PlotSuggestionResponse>(Ct);

        var islands = await IslandsAsync(visitor, worldId);
        Assert.Single(islands.Single(i => i.Id == suggestion.IslandId).Camps);
        Assert.All(islands.Where(i => i.Id != suggestion.IslandId), i => Assert.Empty(i.Camps));
        var states = await CampStatesAsync(visitor, worldId);
        Assert.Single(states);
    }

    [Fact]
    public async Task A_camp_state_carries_the_camps_orientation()
    {
        var (worldId, planted) = await WorldWithCampsAsync(_ => null);
        var home = planted.First(i => i.StartPositions.Count > 0);
        var owner = Unique("owner");
        using var client = ClientFor(owner);
        await FoundAsync(client, worldId, home, owner);

        var state = Assert.Single(await CampStatesAsync(client, worldId), c => c.Q == 1000 + home.Index);
        var listed = Assert.Single(Assert.Single(await IslandsAsync(client, worldId), i => i.Id == home.Id).Camps);

        Assert.Equal(TileOrientation.NE.ToWireName(), state.Orientation);
        Assert.Equal(listed.Orientation, state.Orientation);
    }
}
