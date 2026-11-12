using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Api.Worlds;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.TestSupport;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The island list without its big parts, and the cached, chunked endpoints that serve them: <c>/terrain-chunks</c> (river and bog
/// tiles) and <c>/start-positions</c>.
/// </summary>
public sealed class IslandTerrainEndpointsTests(SqliteApiFixture fixture) : IClassFixture<SqliteApiFixture>
{
    private readonly SqliteApiFixture _fixture = fixture;

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string UniqueName(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

    // Seed 2 places wasted islands (see WorldEndpointsTests); at radius 600 it is also well beyond one 64-island chunk.
    private Task<WorldEntity> CreateWorldAsync(int seed = 2, int radius = 600) =>
        _fixture.Factory.CreateWorldAsync(UniqueName("terrain"), seed, radius, 100, cancellationToken: Ct);

    // The records hold lists, which compare by reference: compare their JSON instead.
    private static string Serialize<T>(T value) => JsonSerializer.Serialize(value, SqliteApiFixture.StrictJson);

    private async Task<List<IslandEntity>> StoredIslandsAsync(Guid worldId, bool includeWasted)
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.Islands.AsNoTracking()
            .Where(i => i.WorldId == worldId && (includeWasted || !i.IsWasted))
            .OrderBy(i => i.Index)
            .ToListAsync(Ct);
    }

    private async Task RevealWastedAsync(Guid worldId)
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var world = await db.Worlds.SingleAsync(w => w.Id == worldId, Ct);
        world.EndbossTriggeredAt = _fixture.Factory.Time.GetUtcNow();
        await db.SaveChangesAsync(Ct);
    }

    private async Task<List<TerrainChunkResponse>> ReadAllChunksAsync(HttpClient client, Guid worldId)
    {
        var manifest = (await client.GetFromJsonAsync<TerrainChunkManifestResponse>(
            $"/api/v1/worlds/{worldId}/terrain-chunks", SqliteApiFixture.StrictJson, Ct))!;
        var chunks = new List<TerrainChunkResponse>();
        foreach (var info in manifest.Chunks)
        {
            chunks.Add((await client.GetFromJsonAsync<TerrainChunkResponse>(
                $"/api/v1/worlds/{worldId}/terrain-chunks/{info.Index}", SqliteApiFixture.StrictJson, Ct))!);
        }

        return chunks;
    }

    [Fact]
    public async Task The_island_list_no_longer_carries_tiles_or_start_positions()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(radius: 300);

        var body = await client.GetStringAsync($"/api/v1/worlds/{world.Id}/islands", Ct);
        using var json = JsonDocument.Parse(body);

        var first = json.RootElement.EnumerateArray().First();
        Assert.False(first.TryGetProperty("riverTiles", out _));
        Assert.False(first.TryGetProperty("bogTiles", out _));
        Assert.False(first.TryGetProperty("startPositions", out _));
        foreach (var kept in new[] { "id", "index", "name", "q", "r", "tileCount", "giants", "wasted", "camps", "utgardWalls", "jotunTowers" })
        {
            Assert.True(first.TryGetProperty(kept, out _), $"the island list must still carry '{kept}'");
        }
    }

    [Fact]
    public async Task The_chunks_together_hold_exactly_the_river_and_bog_tiles_the_islands_have()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync();
        var stored = await StoredIslandsAsync(world.Id, includeWasted: false);
        Assert.True(stored.Count > IslandPayloads.TerrainChunkSize, "the fixture world must need more than one chunk");

        var manifest = (await client.GetFromJsonAsync<TerrainChunkManifestResponse>(
            $"/api/v1/worlds/{world.Id}/terrain-chunks", SqliteApiFixture.StrictJson, Ct))!;
        var chunks = await ReadAllChunksAsync(client, world.Id);

        Assert.Equal(IslandPayloads.TerrainChunkSize, manifest.ChunkSize);
        Assert.Equal((stored.Count + IslandPayloads.TerrainChunkSize - 1) / IslandPayloads.TerrainChunkSize, manifest.ChunkCount);
        Assert.Equal(manifest.ChunkCount, manifest.Chunks.Count);
        Assert.Equal(Enumerable.Range(0, manifest.ChunkCount), chunks.Select(c => c.Chunk));
        Assert.All(chunks.Take(chunks.Count - 1), c => Assert.Equal(IslandPayloads.TerrainChunkSize, c.Islands.Count));

        // Island order is the stored Index order, the same rows the old island list was made from.
        var served = chunks.SelectMany(c => c.Islands).ToList();
        Assert.Equal(stored.Select(i => i.Id), served.Select(i => i.Id));
        for (var i = 0; i < stored.Count; i++)
        {
            Assert.Equal(Serialize(stored[i].RiverTiles.Select(RiverTileResponse.From)), Serialize(served[i].RiverTiles));
            Assert.Equal(Serialize(stored[i].BogTiles.Select(BogTileResponse.From)), Serialize(served[i].BogTiles));
        }

        Assert.Contains(served, i => i.RiverTiles.Count > 0);
        Assert.Contains(served, i => i.BogTiles.Count > 0);
    }

    [Fact]
    public async Task Start_positions_are_every_islands_stored_plots()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(radius: 300);
        var stored = await StoredIslandsAsync(world.Id, includeWasted: false);

        var served = (await client.GetFromJsonAsync<List<IslandStartPositionsResponse>>(
            $"/api/v1/worlds/{world.Id}/start-positions", SqliteApiFixture.StrictJson, Ct))!;

        Assert.Equal(stored.Select(i => i.Id), served.Select(s => s.Id));
        for (var i = 0; i < stored.Count; i++)
        {
            Assert.Equal(
                Serialize(stored[i].StartPositions.Select(p => new TileCoordinate(p.Q, p.R))),
                Serialize(served[i].StartPositions));
        }

        Assert.Contains(served, s => s.StartPositions.Count > 0);
    }

    [Fact]
    public async Task Wasted_islands_are_hidden_from_the_chunks_and_start_positions_until_the_endboss_triggers()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(radius: 300);
        var visible = await StoredIslandsAsync(world.Id, includeWasted: false);
        var all = await StoredIslandsAsync(world.Id, includeWasted: true);
        Assert.True(all.Count > visible.Count, "expected the fixture seed to actually place wasted islands");

        var hiddenChunks = await ReadAllChunksAsync(client, world.Id);
        var hiddenStarts = (await client.GetFromJsonAsync<List<IslandStartPositionsResponse>>(
            $"/api/v1/worlds/{world.Id}/start-positions", SqliteApiFixture.StrictJson, Ct))!;
        Assert.Equal(visible.Select(i => i.Id), hiddenChunks.SelectMany(c => c.Islands).Select(i => i.Id));
        Assert.Equal(visible.Select(i => i.Id), hiddenStarts.Select(s => s.Id));

        await RevealWastedAsync(world.Id);

        var revealedChunks = await ReadAllChunksAsync(client, world.Id);
        var revealedStarts = (await client.GetFromJsonAsync<List<IslandStartPositionsResponse>>(
            $"/api/v1/worlds/{world.Id}/start-positions", SqliteApiFixture.StrictJson, Ct))!;
        Assert.Equal(all.Select(i => i.Id), revealedChunks.SelectMany(c => c.Islands).Select(i => i.Id));
        Assert.Equal(all.Select(i => i.Id), revealedStarts.Select(s => s.Id));
    }

    [Fact]
    public async Task A_chunk_is_sent_gzipped_with_a_strong_etag_and_revalidates_with_304()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(radius: 300);
        var url = $"/api/v1/worlds/{world.Id}/terrain-chunks/0";

        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.AcceptEncoding.Add(new StringWithQualityHeaderValue("gzip"));
        using var response = await client.SendAsync(request, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("gzip", response.Content.Headers.ContentEncoding);
        Assert.Equal("application/json; charset=utf-8", response.Content.Headers.ContentType?.ToString());
        Assert.Equal("no-cache", response.Headers.CacheControl?.ToString());
        var etag = response.Headers.ETag;
        Assert.NotNull(etag);
        Assert.False(etag.IsWeak);

        // The manifest names the same tag the chunk is served with.
        var manifest = (await client.GetFromJsonAsync<TerrainChunkManifestResponse>(
            $"/api/v1/worlds/{world.Id}/terrain-chunks", SqliteApiFixture.StrictJson, Ct))!;
        Assert.Equal(etag.Tag, manifest.Chunks[0].ETag);

        await using (var gzip = new GZipStream(await response.Content.ReadAsStreamAsync(Ct), CompressionMode.Decompress))
        {
            var chunk = await JsonSerializer.DeserializeAsync<TerrainChunkResponse>(gzip, SqliteApiFixture.StrictJson, Ct);
            Assert.Equal(0, chunk!.Chunk);
        }

        using var revalidate = new HttpRequestMessage(HttpMethod.Get, url);
        revalidate.Headers.AcceptEncoding.Add(new StringWithQualityHeaderValue("gzip"));
        revalidate.Headers.IfNoneMatch.Add(etag);
        using var notModified = await client.SendAsync(revalidate, Ct);
        Assert.Equal(HttpStatusCode.NotModified, notModified.StatusCode);
        Assert.Equal(etag.Tag, notModified.Headers.ETag?.Tag);

        using var stale = new HttpRequestMessage(HttpMethod.Get, url);
        stale.Headers.IfNoneMatch.Add(new EntityTagHeaderValue("\"something-else\""));
        using var changed = await client.SendAsync(stale, Ct);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
    }

    [Fact]
    public async Task A_client_that_does_not_accept_gzip_gets_the_same_json_uncompressed()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(radius: 300);

        using var gzipRequest = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/worlds/{world.Id}/start-positions");
        gzipRequest.Headers.AcceptEncoding.Add(new StringWithQualityHeaderValue("gzip"));
        using var gzipped = await client.SendAsync(gzipRequest, Ct);
        await using var gzip = new GZipStream(await gzipped.Content.ReadAsStreamAsync(Ct), CompressionMode.Decompress);
        using var expected = new MemoryStream();
        await gzip.CopyToAsync(expected, Ct);

        using var plainRequest = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/worlds/{world.Id}/start-positions");
        plainRequest.Headers.AcceptEncoding.Add(new StringWithQualityHeaderValue("identity"));
        using var plain = await client.SendAsync(plainRequest, Ct);

        Assert.Equal(HttpStatusCode.OK, plain.StatusCode);
        Assert.Empty(plain.Content.Headers.ContentEncoding);
        Assert.Equal(expected.ToArray(), await plain.Content.ReadAsByteArrayAsync(Ct));
    }

    [Fact]
    public async Task Unknown_worlds_and_chunks_answer_404()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(radius: 300);

        var unknown = Guid.CreateVersion7();
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/worlds/{unknown}/terrain-chunks", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/worlds/{unknown}/terrain-chunks/0", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/worlds/{unknown}/start-positions", Ct)).StatusCode);

        var manifest = (await client.GetFromJsonAsync<TerrainChunkManifestResponse>(
            $"/api/v1/worlds/{world.Id}/terrain-chunks", SqliteApiFixture.StrictJson, Ct))!;
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/worlds/{world.Id}/terrain-chunks/{manifest.ChunkCount}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/worlds/{world.Id}/terrain-chunks/-1", Ct)).StatusCode);
    }
}
