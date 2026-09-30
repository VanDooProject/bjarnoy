using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.World;
using SkiaSharp;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The wire contract of <c>GET /worlds/{id}/fog-chunks</c> (map-fog-v2.md §3):
/// one batched call per viewport rectangle, JSON with a base64 PNG per
/// non-empty chunk, ETag over the rectangle.
/// </summary>
public sealed class FogChunkEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private static string Url(Guid worldId, int cuMin, int cuMax, int cvMin, int cvMax) =>
        $"/api/v1/worlds/{worldId}/fog-chunks?cuMin={cuMin}&cuMax={cuMax}&cvMin={cvMin}&cvMax={cvMax}";

    private async Task<(Guid WorldId, SettlementResponse Settlement, string Owner)> FoundedAsync()
    {
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 80, cancellationToken: Ct);
        var owner = Unique("owner");

        using var client = _factory.CreateClient();
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];
        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", owner),
            Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (world.Id, await response.ReadStrictAsync<SettlementResponse>(Ct), owner);
    }

    private static HttpRequestMessage Get(string url, string owner, string? ifNoneMatch = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Add("X-Owner-Id", owner);
        if (ifNoneMatch is not null)
        {
            request.Headers.TryAddWithoutValidation("If-None-Match", ifNoneMatch);
        }

        return request;
    }

    [Fact]
    public async Task Answers_a_rectangle_with_one_entry_per_chunk_and_a_png_only_where_the_player_has_something()
    {
        var (worldId, settlement, owner) = await FoundedAsync();
        var home = FogChunkLayout.ChunkOf(new HexCoord(settlement.Q, settlement.R));
        using var client = _factory.CreateClient();

        var response = await client.SendAsync(
            Get(Url(worldId, home.U - 3, home.U + 3, home.V - 3, home.V + 3), owner), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        var body = await response.ReadStrictAsync<FogChunksResponse>(Ct);

        Assert.Equal(FogChunkLayout.ChunkSize, body.ChunkSize);
        Assert.Equal((home.U - 3, home.U + 3, home.V - 3, home.V + 3), (body.CuMin, body.CuMax, body.CvMin, body.CvMax));
        Assert.Equal(49, body.Chunks.Count);
        Assert.Equal(body.Chunks.Select(c => (c.Cu, c.Cv)).Distinct().Count(), body.Chunks.Count);

        var homeChunk = body.Chunks.Single(c => c.Cu == home.U && c.Cv == home.V);
        Assert.NotNull(homeChunk.Png);
        Assert.NotEqual(FogChunkService.EmptyVersion, homeChunk.Version);

        var png = Convert.FromBase64String(homeChunk.Png!);
        using var bitmap = SKBitmap.Decode(png);
        Assert.Equal(FogChunkLayout.ChunkSize, bitmap.Width);
        Assert.Equal(FogChunkLayout.ChunkSize, bitmap.Height);

        // The settlement's own hex reads fully revealed in the decoded chunk.
        var texel = FogMaskLayout.ToTexel(new HexCoord(settlement.Q, settlement.R));
        var bounds = FogChunkLayout.Bounds(home);
        var pixel = bitmap.GetPixel(texel.U - bounds.MinU, texel.V - bounds.MinV);
        Assert.Equal(0, pixel.Red);
        Assert.Equal(0, pixel.Green);

        // Chunks with nothing in reach are empty: no PNG, the "0" version.
        Assert.Contains(body.Chunks, c => c.Png is null && c.Version == "0");
    }

    [Fact]
    public async Task Repeating_the_request_with_its_etag_is_a_304_and_a_change_breaks_the_etag()
    {
        var (worldId, settlement, owner) = await FoundedAsync();
        var home = FogChunkLayout.ChunkOf(new HexCoord(settlement.Q, settlement.R));
        using var client = _factory.CreateClient();
        var url = Url(worldId, home.U, home.U, home.V, home.V);

        var first = await client.SendAsync(Get(url, owner), Ct);
        var eTag = first.Headers.ETag?.ToString();
        Assert.False(string.IsNullOrEmpty(eTag));

        var second = await client.SendAsync(Get(url, owner, eTag), Ct);
        Assert.Equal(HttpStatusCode.NotModified, second.StatusCode);

        var stale = await client.SendAsync(Get(url, owner, "\"not-the-etag\""), Ct);
        Assert.Equal(HttpStatusCode.OK, stale.StatusCode);
    }

    [Fact]
    public async Task Another_owner_gets_only_empty_chunks_for_the_same_rectangle()
    {
        var (worldId, settlement, _) = await FoundedAsync();
        var home = FogChunkLayout.ChunkOf(new HexCoord(settlement.Q, settlement.R));
        using var client = _factory.CreateClient();

        var response = await client.SendAsync(
            Get(Url(worldId, home.U, home.U, home.V, home.V), Unique("stranger")), Ct);

        var body = await response.ReadStrictAsync<FogChunksResponse>(Ct);
        var chunk = Assert.Single(body.Chunks);
        Assert.Null(chunk.Png);
        Assert.Equal("0", chunk.Version);
    }

    [Fact]
    public async Task Rejects_an_inverted_rectangle_and_one_over_the_chunk_cap_as_validation_problems()
    {
        var (worldId, _, owner) = await FoundedAsync();
        using var client = _factory.CreateClient();

        var inverted = await client.SendAsync(Get(Url(worldId, 2, 1, 0, 0), owner), Ct);
        var tooMany = await client.SendAsync(Get(Url(worldId, 0, 16, 0, 16), owner), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, inverted.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
    }

    [Fact]
    public async Task Requires_an_owner_id()
    {
        var (worldId, _, _) = await FoundedAsync();
        using var client = _factory.CreateClient();

        var response = await client.GetAsync(Url(worldId, 0, 0, 0, 0), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
