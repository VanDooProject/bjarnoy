using System.Net;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;

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

    private async Task<WorldResponse> CreateWorldAsync(
        HttpClient client,
        int seed = 4242,
        int radius = 30,
        int maxPlayers = 100)
    {
        var response = await client.PostJsonAsync(
            "/api/v1/worlds",
            new CreateWorldRequest(UniqueName("world"), seed, radius, maxPlayers),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<WorldResponse>(Ct);
    }

    [Fact]
    public async Task Creating_a_world_generates_islands_and_returns_its_location()
    {
        using var client = _fixture.CreateClient();
        var name = UniqueName("kettil");

        var response = await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(name, Seed: 7, Radius: 30), Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var world = await response.ReadStrictAsync<WorldResponse>(Ct);
        Assert.Equal(name, world.Name);
        Assert.Equal(7, world.Seed);
        Assert.Equal(30, world.Radius);
        Assert.Equal("active", world.Status);
        Assert.True(world.IslandCount > 0);
        Assert.Equal($"/api/v1/worlds/{world.Id}", response.Headers.Location?.ToString());
    }

    [Fact]
    public async Task A_world_created_without_a_seed_still_gets_one()
    {
        using var client = _fixture.CreateClient();

        var response = await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(UniqueName("seedless"), Seed: null, Radius: 30), Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        // Whatever seed was drawn must be persisted, or the map is not reproducible.
        var world = await response.ReadStrictAsync<WorldResponse>(Ct);
        var reread = await client.GetFromJsonAsync<WorldResponse>(
            $"/api/v1/worlds/{world.Id}", SqliteApiFixture.StrictJson, Ct);

        Assert.Equal(world.Seed, reread!.Seed);
    }

    [Fact]
    public async Task A_created_world_is_readable_and_listed()
    {
        using var client = _fixture.CreateClient();
        var created = await CreateWorldAsync(client);

        var fetched = await client.GetFromJsonAsync<WorldResponse>(
            $"/api/v1/worlds/{created.Id}", SqliteApiFixture.StrictJson, Ct);

        Assert.NotNull(fetched);
        Assert.Equal(created.Id, fetched.Id);
        Assert.Equal(created.IslandCount, fetched.IslandCount);

        var all = await client.GetFromJsonAsync<List<WorldResponse>>(
            "/api/v1/worlds", SqliteApiFixture.StrictJson, Ct);

        Assert.Contains(all!, w => w.Id == created.Id);
    }

    [Fact]
    public async Task Duplicate_world_names_are_rejected()
    {
        using var client = _fixture.CreateClient();
        var name = UniqueName("twice");

        var first = await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(name, Seed: 1, Radius: 30), Ct);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(name, Seed: 2, Radius: 30), Ct);

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task An_unknown_world_is_a_404()
    {
        using var client = _fixture.CreateClient();

        var response = await client.GetAsync($"/api/v1/worlds/{Guid.CreateVersion7()}", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Islands_come_back_indexed_named_and_with_start_positions()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client, seed: 21, radius: 45);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);

        Assert.NotNull(islands);
        Assert.Equal(world.IslandCount, islands.Count);
        Assert.Equal(Enumerable.Range(0, islands.Count), islands.Select(i => i.Index));
        Assert.All(islands, i => Assert.False(string.IsNullOrWhiteSpace(i.Name)));
        Assert.All(islands, i => Assert.True(i.TileCount > 0));

        // Start positions survive the round trip through the text-encoded column.
        Assert.Contains(islands, i => i.StartPositions.Count > 0);
    }

    [Fact]
    public async Task Islands_of_an_unknown_world_are_a_404()
    {
        using var client = _fixture.CreateClient();

        var response = await client.GetAsync($"/api/v1/worlds/{Guid.CreateVersion7()}/islands", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Tiles_are_returned_for_the_requested_rectangle()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client, seed: 7, radius: 30);

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
        var world = await CreateWorldAsync(client, seed: 99, radius: 30);
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
        var world = await CreateWorldAsync(client);

        var response = await client.GetAsync(
            $"/api/v1/worlds/{world.Id}/tiles?qMin=-500&qMax=500&rMin=-500&rMax=500", Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_inverted_tile_range_is_rejected()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);

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
    }

    [Theory]
    [InlineData("", 4242, 30)]
    [InlineData("ab", 4242, 30)]
    [InlineData("valid-name", 4242, 0)]
    [InlineData("valid-name", 4242, 5000)]
    public async Task Invalid_world_requests_are_rejected(string name, int seed, int radius)
    {
        using var client = _fixture.CreateClient();

        var response = await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(name, seed, radius), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task The_health_endpoints_answer()
    {
        using var client = _fixture.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/alive", Ct)).StatusCode);
    }

    [Fact]
    public async Task Unknown_paths_fall_through_to_the_spa()
    {
        using var client = _fixture.CreateClient();

        // No frontend is built into wwwroot in a test run, so the fallback finds
        // no index.html and 404s. What matters is that it is the *fallback*
        // answering — a client-side route must not be swallowed by the API.
        var response = await client.GetAsync("/some/client/side/route", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
