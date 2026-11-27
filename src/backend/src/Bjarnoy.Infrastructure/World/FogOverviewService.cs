using System.Security.Cryptography;
using System.Text;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.Extensions.Caching.Memory;

namespace Bjarnoy.Infrastructure.World;

/// <summary>Why <see cref="FogOverviewService.GetAsync"/> found nothing to render.</summary>
public enum FogOverviewRejection
{
    None = 0,
    WorldNotFound,
}

/// <param name="Factor">Detailed texels per overview texel, per axis.</param>
/// <param name="Bounds">The area the overview covers, in detailed texels.</param>
/// <param name="Width">Overview grid width in texels.</param>
/// <param name="Height">Overview grid height in texels.</param>
/// <param name="Version">Stable hash of every input that affects the overview's pixels (the HTTP ETag, quote-free).</param>
/// <param name="Png">The RGBA8 PNG of the <paramref name="Width"/> x <paramref name="Height"/> grid.</param>
public sealed record FogOverviewResult(
    FogOverviewRejection Rejection,
    int Factor = 0,
    MaskBounds Bounds = default,
    int Width = 0,
    int Height = 0,
    string? Version = null,
    byte[]? Png = null)
{
    public bool Accepted => Rejection == FogOverviewRejection.None && Png is not null;
}

/// <summary>
/// The coarse whole-world fog overview of one player, per <c>docs/design/map-fog-v2.md</c> §3 ("Overview"):
/// the client samples it wherever its detailed chunk window has no data. The PNG is cached by a hash of
/// the inputs, so an unchanged world costs a hash and a cache lookup.
/// </summary>
public sealed class FogOverviewService(GameDbContext dbContext, IMemoryCache cache, TimeProvider timeProvider)
{
    private static readonly TimeSpan CacheSlidingExpiration = TimeSpan.FromMinutes(10);

    private readonly IMemoryCache _cache = cache;
    private readonly ExploredAreaService _exploredArea = new(dbContext, timeProvider);

    public async Task<FogOverviewResult> GetAsync(Guid worldId, string ownerId, CancellationToken cancellationToken = default)
    {
        var area = await _exploredArea.GetAsync(worldId, ownerId, persist: true, cancellationToken).ConfigureAwait(false);
        if (area is null)
        {
            return new FogOverviewResult(FogOverviewRejection.WorldNotFound);
        }

        var (min, max) = FogChunkLayout.WorldChunkRange(area.WorldRadius);
        var history = await _exploredArea.LoadRectAsync(worldId, ownerId, min, max, cancellationToken).ConfigureAwait(false);
        foreach (var (chunk, data) in area.MergedChunks)
        {
            history[chunk] = data;
        }

        var factor = FogOverviewGenerator.FactorFor(area.WorldRadius);
        var bounds = FogOverviewGenerator.OverviewBounds(area.WorldRadius, factor);
        var width = bounds.Width / factor;
        var height = bounds.Height / factor;
        var version = ComputeVersion(factor, history, area.VisionSources);

        var cacheKey = $"fog-overview:{worldId}:{ownerId}:{version}";
        if (!_cache.TryGetValue<byte[]>(cacheKey, out var png))
        {
            var overview = FogOverviewGenerator.Generate(area.WorldRadius, history, area.VisionSources);
            png = FogMaskPngEncoder.Encode(overview.Grid);
            _cache.Set(cacheKey, png, new MemoryCacheEntryOptions { SlidingExpiration = CacheSlidingExpiration });
        }

        return new FogOverviewResult(FogOverviewRejection.None, factor, bounds, width, height, version, png);
    }

    /// <summary>
    /// Hash of exactly the inputs that shape the overview: both generator versions, the factor, the explored
    /// history (sorted chunk tokens) and the vision sources (sorted).
    /// </summary>
    private static string ComputeVersion(
        int factor, IReadOnlyDictionary<FogChunkCoord, ExploredChunkData> history, IReadOnlyList<FogVisionSource> sources)
    {
        var chunks = history
            .Where(kv => !kv.Value.IsEmpty)
            .OrderBy(kv => kv.Key.U).ThenBy(kv => kv.Key.V)
            .Select(kv => $"{kv.Key.U},{kv.Key.V}:{(kv.Value.IsFull ? "F" : Convert.ToHexString(SHA256.HashData(kv.Value.Bits!))[..16])}");
        var sourceTokens = sources
            .OrderBy(s => s.Coord.Q).ThenBy(s => s.Coord.R).ThenBy(s => s.VisibleRadius)
            .Select(s => $"({s.Coord.Q},{s.Coord.R},{s.VisibleRadius})");
        var canonical = $"v{FogMaskGenerator.Version}.{FogOverviewGenerator.Version}#{factor}#{string.Join('|', chunks)}#{string.Join('|', sourceTokens)}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)))[..16];
    }
}
