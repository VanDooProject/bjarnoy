using System.Net;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Round trips through the real HTTP stack, the real EF model and a real
/// database.
/// </summary>
public sealed class WorldEndpointsTests(SqliteApiFixture fixture) : IClassFixture<SqliteApiFixture>
{
    private readonly SqliteApiFixture _fixture = fixture;

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string UniqueName(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

    private async Task<WorldEntity> CreateWorldAsync(
        int seed = 4242,
        int radius = 30,
        int maxPlayers = 100) =>
        await _fixture.Factory.CreateWorldAsync(UniqueName("world"), seed, radius, maxPlayers, cancellationToken: Ct);

    [Fact]
    public async Task POST_to_the_removed_player_facing_create_route_no_longer_matches_anything()
    {
        // World creation moved to admin-only (POST /api/v1/admin/worlds) —
        // this route must no longer exist at all, not just require auth.
        using var client = _fixture.CreateClient();

        var response = await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(UniqueName("kettil"), Seed: 7, Radius: 30), Ct);

        Assert.True(
            response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed,
            $"expected 404 or 405 for a route with no POST handler, got {(int)response.StatusCode}");
    }

    [Fact]
    public async Task A_created_world_is_readable_and_listed()
    {
        using var client = _fixture.CreateClient();
        var created = await CreateWorldAsync();

        var fetched = await client.GetFromJsonAsync<WorldResponse>(
            $"/api/v1/worlds/{created.Id}", SqliteApiFixture.StrictJson, Ct);

        Assert.NotNull(fetched);
        Assert.Equal(created.Id, fetched.Id);
        Assert.Equal(created.Islands.Count, fetched.IslandCount);

        var all = await client.GetFromJsonAsync<List<WorldSummaryResponse>>(
            "/api/v1/worlds", SqliteApiFixture.StrictJson, Ct);

        Assert.Contains(all!, w => w.Id == created.Id);
    }

    [Fact]
    public async Task Listed_worlds_omit_seed_generation_radius_and_movement()
    {
        using var client = _fixture.CreateClient();
        var created = await CreateWorldAsync(maxPlayers: 5);

        var response = await client.GetAsync("/api/v1/worlds", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Strict deserialisation into WorldSummaryResponse: an extra property
        // in the JSON fails the test, same guarantee WorldJoinEndpointsTests
        // asserts for the /joinable picker.
        var worlds = await response.ReadStrictAsync<IReadOnlyList<WorldSummaryResponse>>(Ct);
        var listed = Assert.Single(worlds, w => w.Id == created.Id);

        Assert.Equal(created.Name, listed.Name);
        Assert.Equal(5, listed.MaxPlayers);
        Assert.Equal(0, listed.PlayerCount);
        Assert.Equal(5, listed.FreeSlots);
        Assert.True(listed.Joinable);

        var body = await response.Content.ReadAsStringAsync(Ct);
        Assert.DoesNotContain("\"seed\"", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"radius\"", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"generation\"", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"movement\"", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task An_unknown_world_is_a_404()
    {
        using var client = _fixture.CreateClient();

        var response = await client.GetAsync($"/api/v1/worlds/{Guid.CreateVersion7()}", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("world_not_found", await response.ErrorCodeAsync(Ct));
    }

    [Fact]
    public async Task Islands_come_back_indexed_named_and_with_start_positions()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(seed: 21, radius: 45);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);

        Assert.NotNull(islands);
        Assert.Equal(world.Islands.Count, islands.Count);
        Assert.Equal(Enumerable.Range(0, islands.Count), islands.Select(i => i.Index));
        Assert.All(islands, i => Assert.False(string.IsNullOrWhiteSpace(i.Name)));
        Assert.All(islands, i => Assert.True(i.TileCount > 0));

        // Start positions survive the round trip through the text-encoded column.
        Assert.Contains(islands, i => i.StartPositions.Count > 0);
    }

    [Fact]
    public async Task River_tiles_survive_the_round_trip_through_the_text_encoded_column()
    {
        using var client = _fixture.CreateClient();
        // Seed/radius known (Bjarnoy.Domain.Tests.RiverGenerationTests) to produce
        // several rivers, so this doesn't depend on getting lucky with the default.
        var world = await CreateWorldAsync(seed: 2024, radius: 40);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);

        Assert.NotNull(islands);
        var riverTiles = islands.SelectMany(i => i.RiverTiles).ToList();
        Assert.NotEmpty(riverTiles);

        var spring = riverTiles.First(t => t.Shape == "spring");
        Assert.Empty(spring.InDirections);
        Assert.NotNull(spring.OutDirection);

        var mouth = riverTiles.First(t => t.Shape == "mouth");
        Assert.Single(mouth.InDirections);
        Assert.Null(mouth.OutDirection);
    }

    [Fact]
    public async Task Giants_survive_the_round_trip_through_the_text_encoded_column()
    {
        using var client = _fixture.CreateClient();
        // Seed/radius known (Bjarnoy.Domain.Tests.GiantGenerationTests) to
        // place two giants on one island, so this doesn't depend on getting
        // lucky with the default.
        var world = await CreateWorldAsync(client, seed: 55, radius: 90);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);

        Assert.NotNull(islands);
        var giants = islands.SelectMany(i => i.Giants).ToList();
        Assert.NotEmpty(giants);
        Assert.All(giants, g => Assert.Equal("giantmountain", g.Family));
        Assert.All(giants, g => Assert.Contains(g.Orientation, new[] { "E", "NE", "NW", "W", "SW", "SE" }));
    }

    [Fact]
    public async Task Islands_of_an_unknown_world_are_a_404()
    {
        using var client = _fixture.CreateClient();

        var response = await client.GetAsync($"/api/v1/worlds/{Guid.CreateVersion7()}/islands", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("world_not_found", await response.ErrorCodeAsync(Ct));
    }

    [Fact]
    public async Task Tiles_are_returned_for_the_requested_rectangle()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(seed: 7, radius: 30);

        var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{world.Id}/tiles?qMin=-5&qMax=5&rMin=-5&rMax=5",
            SqliteApiFixture.StrictJson,
            Ct);

        Assert.NotNull(chunk);
        Assert.Equal(world.Id, chunk.WorldId);
        Assert.Equal(11 * 11, chunk.Tiles.Count);
        Assert.All(chunk.Tiles, t => Assert.Contains(
            t.Terrain, new[] { "sea", "sand", "grass", "forest", "mountain" }));
        Assert.All(chunk.Tiles, t => Assert.InRange(t.Q, -5, 5));
        Assert.All(chunk.Tiles, t => Assert.InRange(t.R, -5, 5));
    }

    [Fact]
    public async Task Tiles_for_the_same_window_are_stable_across_requests()
    {
        using var client = _fixture.CreateClient();
        // Radius bumped 30->32: after the island-shape retune, seed 99 at
        // radius 30 no longer places any island at all.
        var world = await CreateWorldAsync(seed: 99, radius: 32);
        const string url = "/api/v1/worlds/{0}/tiles?qMin=-8&qMax=8&rMin=-8&rMax=8";

        var first = await client.GetFromJsonAsync<TileChunkResponse>(
            string.Format(null, url, world.Id), SqliteApiFixture.StrictJson, Ct);
        var second = await client.GetFromJsonAsync<TileChunkResponse>(
            string.Format(null, url, world.Id), SqliteApiFixture.StrictJson, Ct);

        // Terrain is regenerated from the stored seed on each call rather than
        // read from a table, so this is the test that the seed round trips.
        Assert.Equal(first!.Tiles, second!.Tiles);
    }

    [Fact]
    public async Task An_oversized_tile_request_is_rejected_rather_than_served()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync();

        var response = await client.GetAsync(
            $"/api/v1/worlds/{world.Id}/tiles?qMin=-500&qMax=500&rMin=-500&rMax=500", Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_inverted_tile_range_is_rejected()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync();

        var response = await client.GetAsync(
            $"/api/v1/worlds/{world.Id}/tiles?qMin=5&qMax=-5&rMin=0&rMax=1", Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Tiles_of_an_unknown_world_are_a_404()
    {
        using var client = _fixture.CreateClient();

        var response = await client.GetAsync(
            $"/api/v1/worlds/{Guid.CreateVersion7()}/tiles?qMin=0&qMax=1&rMin=0&rMax=1", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("world_not_found", await response.ErrorCodeAsync(Ct));
    }

    [Fact]
    public async Task Fog_mask_of_an_unknown_world_is_a_404_with_world_not_found()
    {
        using var client = _fixture.CreateClient();

        var request = new HttpRequestMessage(
            HttpMethod.Get, $"/api/v1/worlds/{Guid.CreateVersion7()}/fog-mask");
        request.Headers.Add("X-Owner-Id", "test-owner");

        var response = await client.SendAsync(request, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("world_not_found", await response.ErrorCodeAsync(Ct));
    }

    [Fact]
    public async Task The_health_endpoints_answer()
    {
        using var client = _fixture.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/alive", Ct)).StatusCode);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/settlement")]
    [InlineData("/some/deep/client/side/route")]
    public async Task Client_side_routes_are_served_the_spa_shell(string path)
    {
        using var client = _fixture.CreateClient();

        // The frontend routes in HTML5 history mode, so the server must answer
        // a URL it has no endpoint for with the app shell and let the client
        // router take it from there.
        var response = await client.GetAsync(path, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains(
            BjarnoyApiFactory.SpaStubMarker,
            await response.Content.ReadAsStringAsync(Ct),
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_unmatched_api_route_is_a_404_and_never_the_spa_shell()
    {
        using var client = _fixture.CreateClient();

        var response = await client.GetAsync("/api/v1/does-not-exist", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        // The SPA fallback would answer with text/html; a JSON client must not
        // have to parse an HTML page to discover it mistyped a route.
        Assert.NotEqual("text/html", response.Content.Headers.ContentType?.MediaType);
    }
}
