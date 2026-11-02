using System.Security.Cryptography;
using System.Text;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.Extensions.Caching.Memory;

namespace Bjarnoy.Infrastructure.World;

/// <summary>Why <see cref="FogChunkService.GetChunksAsync"/> found nothing to render.</summary>
public enum FogChunkRejection
{
    None = 0,
    WorldNotFound,
    InvalidRange,
    TooManyChunks,
}

/// <summary>One delivered chunk.</summary>
/// <param name="Coord">Chunk address on the <see cref="FogChunkLayout"/> grid.</param>
/// <param name="Version">
/// A stable hash of every input that affects this chunk's pixels, so it
/// changes exactly when the mask here would — and only then. <see cref="EmptyVersion"/>
/// for an empty chunk.
/// </param>
/// <param name="Png">
/// The chunk's RGBA8 mask (<see cref="FogChunkLayout.ChunkSize"/> square), or
/// <see langword="null"/> for an <em>empty</em> chunk: nothing explored and no
/// source in reach, which the client renders as fully unknown without any
/// image at all.
/// </param>
public sealed record FogChunk(FogChunkCoord Coord, string Version, byte[]? Png);

/// <param name="ETag">
/// A stable hash of the requested rectangle and every chunk's version,
/// quote-free (the caller wraps it for the HTTP header).
/// </param>
public sealed record FogChunksResult(
    FogChunkRejection Rejection, IReadOnlyList<FogChunk>? Chunks = null, string? ETag = null)
{
    public bool Accepted => Rejection == FogChunkRejection.None && Chunks is not null;
}

/// <summary>
/// Builds a player's fog mask per 64 x 64-texel chunk, per
/// <c>docs/design/map-fog-v2.md</c> §3, for a client's viewport rectangle.
/// </summary>
/// <remarks>
/// <para>
/// For each requested chunk: gather the vision sources within reach of it
/// (§3's source halo, <see cref="FogMaskGenerator.SourcesAffecting"/>), read
/// the explored history of the chunk and its eight neighbours (the neighbours
/// matter for the one-texel interpolation border — <see cref="FogMaskGenerator.GenerateWindow"/>),
/// and hash all of that into the chunk's version. The version keys a
/// server-side PNG cache, so a settlement founded on one side of a 4000-hex
/// world dirties only the chunks its ring and ramp reach; every other chunk
/// keeps its cache entry, and unchanged requests cost a dictionary lookup
/// per chunk, no distance transform, no PNG encode.
/// </para>
/// <para>
/// A chunk with no source in reach and no explored ground in or next to it
/// is <em>empty</em> and is never generated or encoded — at radius 4000 that
/// is nearly all of the map, all the time. The cache is a compute cache, not
/// an HTTP cache (§3): entries slide out after <see cref="CacheSlidingExpiration"/>
/// of disuse (a chunk PNG is a few hundred bytes to a few KB, so an active
/// player's working set is small next to any memory budget; no hard size cap
/// is configured because the process-wide <see cref="IMemoryCache"/> is
/// shared and a <c>SizeLimit</c> would force a size on every other entry).
/// The chunk grid is anchored at texel (0, 0) independent of the world's
/// radius, so an admin reseed needs no wholesale invalidation: any change it
/// makes to sources or history is already in the version.
/// </para>
/// <para>
/// Sources are the requesting player's own settlements and towers, not yet
/// the guild-wide union §1a describes. §1c's real-time army-vision bonus
/// stays out of this entirely, by design — only the ground an army has
/// actually walked over becomes permanent memory
/// (<see cref="ExploredAreaService"/>).
/// </para>
/// </remarks>
public sealed class FogChunkService(GameDbContext dbContext, IMemoryCache cache, TimeProvider timeProvider)
{
    /// <summary>The version of an empty (fully unknown, unencoded) chunk.</summary>
    public const string EmptyVersion = "0";

    /// <summary>
    /// The most chunks one request may ask for. 256 is a 16 x 16 window,
    /// 1024 x 1024 texels — a screen at the widest sensible zoom-out.
    /// </summary>
    public const int MaxChunksPerRequest = 256;

    /// <summary>How long a computed chunk is kept once nobody has asked for it again (§3's "Eviction").</summary>
    private static readonly TimeSpan CacheSlidingExpiration = TimeSpan.FromMinutes(10);

    private readonly IMemoryCache _cache = cache;
    private readonly ExploredAreaService _exploredArea = new(dbContext, timeProvider);

    /// <summary>
    /// The chunks of the inclusive rectangle <c>[cuMin..cuMax] x [cvMin..cvMax]</c>,
    /// row by row. Chunks entirely outside the world are returned empty.
    /// </summary>
    public async Task<FogChunksResult> GetChunksAsync(
        Guid worldId,
        string ownerId,
        int cuMin,
        int cuMax,
        int cvMin,
        int cvMax,
        CancellationToken cancellationToken = default)
    {
        if (cuMax < cuMin || cvMax < cvMin)
        {
            return new FogChunksResult(FogChunkRejection.InvalidRange);
        }

        if (((long)(cuMax - cuMin) + 1) * ((long)(cvMax - cvMin) + 1) > MaxChunksPerRequest)
        {
            return new FogChunksResult(FogChunkRejection.TooManyChunks);
        }

        var area = await _exploredArea.GetAsync(worldId, ownerId, persist: true, cancellationToken).ConfigureAwait(false);
        if (area is null)
        {
            return new FogChunksResult(FogChunkRejection.WorldNotFound);
        }

        var (worldMin, worldMax) = FogChunkLayout.WorldChunkRange(area.WorldRadius);

        // History for the requested rectangle plus its one-chunk ring (the
        // interpolation border reads a texel into each neighbour), with this
        // request's own just-merged chunks laid over it.
        var history = await _exploredArea.LoadRectAsync(
            worldId,
            ownerId,
            new FogChunkCoord(cuMin - 1, cvMin - 1),
            new FogChunkCoord(cuMax + 1, cvMax + 1),
            cancellationToken).ConfigureAwait(false);
        foreach (var (chunk, data) in area.MergedChunks)
        {
            if (chunk.U >= cuMin - 1 && chunk.U <= cuMax + 1 && chunk.V >= cvMin - 1 && chunk.V <= cvMax + 1)
            {
                history[chunk] = data;
            }
        }

        var tokens = new Dictionary<FogChunkCoord, string>();
        string Token(FogChunkCoord c)
        {
            if (!history.TryGetValue(c, out var data) || data.IsEmpty)
            {
                return "-";
            }

            if (!tokens.TryGetValue(c, out var token))
            {
                token = data.IsFull ? "F" : Convert.ToHexString(SHA256.HashData(data.Bits!))[..16];
                tokens[c] = token;
            }

            return token;
        }

        bool IsExplored(HexCoord hex)
        {
            var texel = FogMaskLayout.ToTexel(hex);
            var chunk = FogChunkLayout.ChunkOf(texel);
            return history.TryGetValue(chunk, out var data) && PersistedExploredBitset.ContainsTexel(chunk, data, texel);
        }

        var chunks = new List<FogChunk>((cuMax - cuMin + 1) * (cvMax - cvMin + 1));
        for (var cv = cvMin; cv <= cvMax; cv++)
        {
            for (var cu = cuMin; cu <= cuMax; cu++)
            {
                var coord = new FogChunkCoord(cu, cv);
                var outsideWorld = cu < worldMin.U || cu > worldMax.U || cv < worldMin.V || cv > worldMax.V;
                var bounds = FogChunkLayout.Bounds(coord);
                var sources = outsideWorld ? [] : FogMaskGenerator.SourcesAffecting(bounds, area.VisionSources);

                var neighbourhood = new StringBuilder();
                var anyHistory = false;
                for (var dv = -1; dv <= 1; dv++)
                {
                    for (var du = -1; du <= 1; du++)
                    {
                        var token = Token(new FogChunkCoord(cu + du, cv + dv));
                        anyHistory |= token != "-";
                        neighbourhood.Append(token).Append(',');
                    }
                }

                if (outsideWorld || (sources.Count == 0 && !anyHistory))
                {
                    chunks.Add(new FogChunk(coord, EmptyVersion, null));
                    continue;
                }

                var version = ComputeVersion(sources, neighbourhood.ToString());
                var cacheKey = $"fog-chunk:{worldId}:{ownerId}:{cu}:{cv}:{version}";
                if (!_cache.TryGetValue<byte[]>(cacheKey, out var png))
                {
                    var mask = FogMaskGenerator.GenerateWindow(bounds, sources, IsExplored);
                    png = FogMaskPngEncoder.Encode(mask);
                    _cache.Set(cacheKey, png, new MemoryCacheEntryOptions { SlidingExpiration = CacheSlidingExpiration });
                }

                chunks.Add(new FogChunk(coord, version, png));
            }
        }

        return new FogChunksResult(FogChunkRejection.None, chunks, ComputeETag(cuMin, cuMax, cvMin, cvMax, chunks));
    }

    /// <summary>
    /// Hash of exactly the inputs that shape a chunk: the sources in reach
    /// (sorted, so query order can't matter) and the explored-history tokens
    /// of the chunk and its ring.
    /// </summary>
    private static string ComputeVersion(IReadOnlyList<FogVisionSource> sources, string historyTokens)
    {
        var canonical = string.Join(
            '|',
            sources
                .OrderBy(s => s.Coord.Q).ThenBy(s => s.Coord.R).ThenBy(s => s.ExploredRadius).ThenBy(s => s.VisibleRadius)
                .Select(s => $"{s.Coord.Q}:{s.Coord.R}:{s.ExploredRadius}:{s.VisibleRadius}"));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{canonical}#{historyTokens}")))[..16];
    }

    private static string ComputeETag(int cuMin, int cuMax, int cvMin, int cvMax, List<FogChunk> chunks)
    {
        var text = $"{cuMin}:{cuMax}:{cvMin}:{cvMax}|{string.Join(',', chunks.Select(c => c.Version))}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text)))[..16];
    }
}
