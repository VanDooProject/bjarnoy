using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Api.Worlds;

/// <summary>A response body serialized and gzip-compressed once, with the strong entity tag of those bytes.</summary>
public sealed record GzipPayload(byte[] Gzip, string ETag)
{
    public static GzipPayload Create<T>(T value, JsonSerializerOptions options)
    {
        var json = JsonSerializer.SerializeToUtf8Bytes(value, options);
        using var buffer = new MemoryStream(json.Length / 8 + 64);
        using (var gzip = new GZipStream(buffer, CompressionLevel.Optimal, leaveOpen: true))
        {
            gzip.Write(json);
        }

        var bytes = buffer.ToArray();
        var etag = $"\"{Convert.ToHexString(SHA256.HashData(bytes))[..32].ToLowerInvariant()}\"";
        return new GzipPayload(bytes, etag);
    }

    /// <summary>The uncompressed JSON, for a client that does not accept gzip.</summary>
    public byte[] Decompress()
    {
        using var source = new MemoryStream(Gzip);
        using var gzip = new GZipStream(source, CompressionMode.Decompress);
        using var result = new MemoryStream();
        gzip.CopyTo(result);
        return result.ToArray();
    }
}

/// <summary>The terrain of a world's islands cut into <see cref="IslandPayloads.TerrainChunkSize"/>-island chunks, each ready to send.</summary>
public sealed record TerrainChunks(IReadOnlyList<GzipPayload> Chunks)
{
    public TerrainChunkManifestResponse Manifest() => new(
        IslandPayloads.TerrainChunkSize,
        Chunks.Count,
        [.. Chunks.Select((c, i) => new TerrainChunkInfo(i, c.ETag))]);
}

/// <summary>
/// The big, rarely changing parts of a world's islands — river, bog and inland-lake tiles, start positions — serialized and compressed once per
/// world and kept (<see cref="PerWorldCache{T}"/>), so serving them reads no island data and does no serialization. They only change
/// when a world is reseeded (<see cref="WorldIslandCaches.Invalidate"/>), which clears them.
/// </summary>
/// <remarks>
/// Wasted islands are hidden until the world's endboss has triggered, so every payload exists in two variants
/// (<c>wastedRevealed</c> false/true); chunking happens after that filter.
/// </remarks>
public static class IslandPayloads
{
    /// <summary>Islands per terrain chunk (by <see cref="Bjarnoy.Infrastructure.Entities.IslandEntity.Index"/> order).</summary>
    public const int TerrainChunkSize = 64;

    private static readonly PerWorldCache<TerrainChunks> TerrainHidden = WorldIslandCaches.Register(new PerWorldCache<TerrainChunks>());
    private static readonly PerWorldCache<TerrainChunks> TerrainRevealed = WorldIslandCaches.Register(new PerWorldCache<TerrainChunks>());
    private static readonly PerWorldCache<GzipPayload> StartsHidden = WorldIslandCaches.Register(new PerWorldCache<GzipPayload>());
    private static readonly PerWorldCache<GzipPayload> StartsRevealed = WorldIslandCaches.Register(new PerWorldCache<GzipPayload>());

    public static Task<TerrainChunks> TerrainAsync(
        DbContextOptions<GameDbContext> dbOptions, JsonSerializerOptions json, Guid worldId, bool wastedRevealed, CancellationToken cancellationToken) =>
        (wastedRevealed ? TerrainRevealed : TerrainHidden).GetAsync(
            worldId, () => LoadTerrainAsync(dbOptions, json, worldId, wastedRevealed), cancellationToken);

    public static Task<GzipPayload> StartPositionsAsync(
        DbContextOptions<GameDbContext> dbOptions, JsonSerializerOptions json, Guid worldId, bool wastedRevealed, CancellationToken cancellationToken) =>
        (wastedRevealed ? StartsRevealed : StartsHidden).GetAsync(
            worldId, () => LoadStartPositionsAsync(dbOptions, json, worldId, wastedRevealed), cancellationToken);

    // The cached task outlives the request that started it, so it reads through a DbContext of its own, not the request's.
    private static async Task<TerrainChunks> LoadTerrainAsync(DbContextOptions<GameDbContext> dbOptions, JsonSerializerOptions json, Guid worldId, bool wastedRevealed)
    {
        var rows = await WorldIslandCaches.LoadAsync(dbOptions, db => db.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId && (wastedRevealed || !i.IsWasted))
            .OrderBy(i => i.Index)
            .Select(i => new { i.Id, i.RiverTiles, i.BogTiles, i.InlandLakeTiles })
            .ToListAsync(CancellationToken.None)).ConfigureAwait(false);

        var chunks = new List<GzipPayload>((rows.Count + TerrainChunkSize - 1) / TerrainChunkSize);
        for (var from = 0; from < rows.Count; from += TerrainChunkSize)
        {
            var islands = rows.Skip(from).Take(TerrainChunkSize)
                .Select(r => IslandTerrainResponse.From(r.Id, r.RiverTiles, r.BogTiles, r.InlandLakeTiles))
                .ToList();
            chunks.Add(GzipPayload.Create(new TerrainChunkResponse(chunks.Count, islands), json));
        }

        return new TerrainChunks(chunks);
    }

    private static async Task<GzipPayload> LoadStartPositionsAsync(DbContextOptions<GameDbContext> dbOptions, JsonSerializerOptions json, Guid worldId, bool wastedRevealed)
    {
        var rows = await WorldIslandCaches.LoadAsync(dbOptions, db => db.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId && (wastedRevealed || !i.IsWasted))
            .OrderBy(i => i.Index)
            .Select(i => new { i.Id, i.StartPositions })
            .ToListAsync(CancellationToken.None)).ConfigureAwait(false);

        // The stored list as is, like the island list always carried it (not FoundableStartPositions).
        IReadOnlyList<IslandStartPositionsResponse> response =
            [.. rows.Select(r => new IslandStartPositionsResponse(r.Id, [.. r.StartPositions.Select(p => new TileCoordinate(p.Q, p.R))]))];
        return GzipPayload.Create(response, json);
    }
}
