using System.Security.Cryptography;
using System.Text;
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
/// requires, there is no persisted-explored-history input (§1e) yet, and the
/// whole world is baked in one call rather than per chunk (§3) — no source
/// halo, no per-chunk cache scoping. Each of those is real follow-up work,
/// deliberately left out of this slice rather than half-implemented.
///
/// What *is* implemented here is §3's "compute cache, not HTTP cache" —
/// the expensive step (BFS distance transform + PNG encode) is cached
/// server-side, keyed by the player's current settlement set, same shape as
/// <see cref="Bjarnoy.Infrastructure.Services.UserActivityService"/>'s
/// <see cref="IMemoryCache"/> use. A
/// settlement founding, leveling, or losing bumps the version key
/// automatically (it is derived from the settlements themselves, not a
/// separately-tracked counter), which naturally invalidates — no explicit
/// eviction call needed on write paths.
/// </remarks>
public sealed class FogMaskService(GameDbContext dbContext, IMemoryCache cache)
{
    /// <summary>
    /// How long a computed mask is kept once nobody has asked for it again —
    /// see §3's "Eviction" (an explicit policy must exist from the first
    /// implementation; a size cap is not added yet, since chunking (§3) is
    /// itself what bounds an entry's size, and that isn't implemented here).
    /// </summary>
    private static readonly TimeSpan CacheSlidingExpiration = TimeSpan.FromMinutes(10);

    private readonly GameDbContext _dbContext = dbContext;
    private readonly IMemoryCache _cache = cache;

    public async Task<FogMaskResult> GeneratePlayerMaskAsync(
        Guid worldId, string ownerId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);

        var radius = await _dbContext.Worlds
            .Where(w => w.Id == worldId)
            .Select(w => (int?)w.Radius)
            .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

        if (radius is null)
        {
            return new FogMaskResult(FogMaskRejection.WorldNotFound);
        }

        var settlements = await _dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.Buildings)
            .Where(s => s.WorldId == worldId && s.OwnerId == ownerId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var eTag = ComputeETag(settlements);
        var cacheKey = $"fog-mask:{worldId}:{ownerId}:{eTag}";

        if (_cache.TryGetValue<byte[]>(cacheKey, out var cachedPng))
        {
            return new FogMaskResult(FogMaskRejection.None, cachedPng, eTag);
        }

        var sources = settlements
            .Select(s => FogVisionRadii.ToVisionSource(
                new HexCoord(s.CentreQ, s.CentreR), s.ToDomain().LonghouseLevel))
            .ToList();

        var bounds = FogMaskLayout.WorldBounds(radius.Value);
        var mask = FogMaskGenerator.Generate(bounds, sources, new HashSet<HexCoord>());
        var png = FogMaskPngEncoder.Encode(mask);

        _cache.Set(cacheKey, png, new MemoryCacheEntryOptions { SlidingExpiration = CacheSlidingExpiration });

        return new FogMaskResult(FogMaskRejection.None, png, eTag);
    }

    /// <summary>
    /// A deterministic hash of the player's current settlement set — id,
    /// position, and longhouse level (the only inputs
    /// <see cref="FogVisionRadii.ToVisionSource"/> reads) — sorted first so
    /// the same set always hashes the same way regardless of query order.
    /// Doubles as the cache key's version component and the HTTP `ETag`, per
    /// §1a Option B's <c>(playerId, sorted [settlementId, q, r, level])</c>
    /// cache key.
    /// </summary>
    private static string ComputeETag(IReadOnlyCollection<Entities.SettlementEntity> settlements)
    {
        var version = string.Join(
            '|',
            settlements
                .Select(s => (s.Id, s.CentreQ, s.CentreR, Level: s.ToDomain().LonghouseLevel))
                .OrderBy(s => s.Id)
                .Select(s => $"{s.Id}:{s.CentreQ}:{s.CentreR}:{s.Level}"));

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(version));
        return Convert.ToHexString(hash)[..16];
    }
}
