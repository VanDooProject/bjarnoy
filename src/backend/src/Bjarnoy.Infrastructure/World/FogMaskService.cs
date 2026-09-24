using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Bjarnoy.Infrastructure.World;

/// <summary>Why <see cref="FogMaskService.GeneratePlayerMaskAsync"/> found nothing to render.</summary>
public enum FogMaskRejection
{
    None = 0,
    WorldNotFound,
}

/// <param name="ETag">
/// A stable hash of the player's current settlement set, quote-free (the
/// caller wraps it for the actual HTTP header) — present whenever
/// <see cref="Accepted"/> is, so a conditional-GET caller can compare it
/// without decoding the PNG.
/// </param>
public sealed record FogMaskResult(FogMaskRejection Rejection, byte[]? Png = null, string? ETag = null)
{
    public bool Accepted => Rejection == FogMaskRejection.None && Png is not null;
}

/// <summary>
/// Builds a player's fog mask PNG from their own settlements, per
/// <c>docs/design/map-fog-v2.md</c> §2.3/§3.
/// </summary>
/// <remarks>
/// This is the single-player slice only: sources are the requesting player's
/// own settlements (<c>OwnerId</c> match), not yet the guild-wide union §1a
/// requires, and the whole world is baked in one call rather than per chunk
/// (§3) — no source halo, no per-chunk cache scoping. Each of those is real
/// follow-up work, deliberately left out of this slice rather than
/// half-implemented.
///
/// What *is* implemented here is §3's "compute cache, not HTTP cache" — the
/// expensive step (BFS distance transform + PNG encode) is cached
/// server-side, keyed by <see cref="ExploredAreaService"/>'s own
/// <see cref="ExploredArea.Version"/> (the player's current settlement set
/// plus their persisted explored history's own version, same shape as
/// <see cref="Bjarnoy.Infrastructure.Services.UserActivityService"/>'s
/// <see cref="IMemoryCache"/> use). A settlement founding, leveling, or
/// losing — or newly-explored ground — bumps that version automatically,
/// which naturally invalidates this cache too, no explicit eviction call
/// needed on write paths.
///
/// §1e's persisted explored history itself — a player's own
/// <see cref="Entities.PlayerExploredEntity"/> row loaded, OR-ed with
/// whatever their settlements' explored rings, towers and armies newly
/// cover, and saved back if it grew — now lives in
/// <see cref="ExploredAreaService"/>, shared with every other fog-gated
/// read (<c>GET /settlements/{id}/view</c>,
/// <c>GET /worlds/{worldId}/settlements</c>) rather than duplicated here.
/// §1c's real-time army-vision *bonus* stays out of this entirely, by
/// design — see <c>fogShader.ts</c>'s own remarks — only the ground an army
/// has actually walked over becomes permanent memory.
/// </remarks>
public sealed class FogMaskService(GameDbContext dbContext, IMemoryCache cache, TimeProvider timeProvider)
{
    /// <summary>
    /// How long a computed mask is kept once nobody has asked for it again —
    /// see §3's "Eviction" (an explicit policy must exist from the first
    /// implementation; a size cap is not added yet, since chunking (§3) is
    /// itself what bounds an entry's size, and that isn't implemented here).
    /// </summary>
    private static readonly TimeSpan CacheSlidingExpiration = TimeSpan.FromMinutes(10);

    private readonly IMemoryCache _cache = cache;

    // Not injected via DI: this service's own constructor signature is kept
    // stable (dbContext/cache/timeProvider, exactly as before this class's
    // shared explored-area computation moved out) so nothing registering or
    // constructing a FogMaskService directly — including FogMaskServiceTests —
    // needs to change. The two services share the same IMemoryCache
    // deliberately, same reasoning as UserActivityService's remarks.
    private readonly ExploredAreaService _exploredArea = new(dbContext, cache, timeProvider);

    public async Task<FogMaskResult> GeneratePlayerMaskAsync(
        Guid worldId, string ownerId, CancellationToken cancellationToken = default)
    {
        var area = await _exploredArea.GetAsync(worldId, ownerId, cancellationToken).ConfigureAwait(false);
        if (area is null)
        {
            return new FogMaskResult(FogMaskRejection.WorldNotFound);
        }

        var cacheKey = $"fog-mask:{worldId}:{ownerId}:{area.Version}";

        if (_cache.TryGetValue<byte[]>(cacheKey, out var cachedPng))
        {
            return new FogMaskResult(FogMaskRejection.None, cachedPng, area.Version);
        }

        var sources = area.Settlements
            .Select(s => FogVisionRadii.ToVisionSource(
                new HexCoord(s.CentreQ, s.CentreR), s.ToDomain().LonghouseLevel))
            .Concat(area.Settlements
                .SelectMany(s => s.Buildings.Where(b => b.Type == BuildingType.Tower))
                .Select(t => FogVisionRadii.ToTowerVisionSource(new HexCoord(t.Q, t.R), t.Level)))
            .ToList();

        var mask = FogMaskGenerator.Generate(area.Bounds, sources, area.Hexes);
        var png = FogMaskPngEncoder.Encode(mask);

        _cache.Set(cacheKey, png, new MemoryCacheEntryOptions { SlidingExpiration = CacheSlidingExpiration });

        return new FogMaskResult(FogMaskRejection.None, png, area.Version);
    }
}
