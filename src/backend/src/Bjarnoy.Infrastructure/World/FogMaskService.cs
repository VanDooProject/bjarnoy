using System.Security.Cryptography;
using System.Text;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
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
/// What *is* implemented here is §3's "compute cache, not HTTP cache" —
/// the expensive step (BFS distance transform + PNG encode) is cached
/// server-side, keyed by the player's current settlement set plus their
/// persisted explored history's own version, same shape as
/// <see cref="Bjarnoy.Infrastructure.Services.UserActivityService"/>'s
/// <see cref="IMemoryCache"/> use. A settlement founding, leveling, or
/// losing — or newly-explored ground, see below — bumps the version key
/// automatically, which naturally invalidates — no explicit eviction call
/// needed on write paths.
///
/// Also implements §1e's persisted explored history: a player's own
/// <see cref="Entities.PlayerExploredEntity"/> row is loaded, OR-ed with
/// whatever their settlements' explored rings and any of their armies'
/// current walked-over ground (<see cref="FogVisionRadii.ArmyVisionRadiusHexes"/>
/// around each in-transit army's live position — <see cref="Domain.Armies.Army.PositionAt"/>,
/// server-authoritative, no new plumbing needed) newly cover, and saved back
/// if it grew. §1c's real-time army-vision *bonus* stays out of this
/// entirely, by design — see <c>fogShader.ts</c>'s own remarks — only the
/// ground an army has actually walked over becomes permanent memory here.
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

    private readonly GameDbContext _dbContext = dbContext;
    private readonly IMemoryCache _cache = cache;
    private readonly TimeProvider _timeProvider = timeProvider;

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

        var bounds = FogMaskLayout.WorldBounds(radius.Value);

        var settlements = await _dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.Buildings)
            .Where(s => s.WorldId == worldId && s.OwnerId == ownerId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        // In-transit armies only — an AtHome army is standing in its own
        // settlement's already-explored ring, and a Supporting one stands at
        // whatever it's supporting, neither of which needs its own walked-
        // ground contribution (see this class's own remarks). Settlement is
        // included for PositionAt's `home` parameter.
        var travellingArmies = await _dbContext.Armies
            .AsNoTracking()
            .Include(a => a.Settlement)
            .Include(a => a.Stacks)
            .Where(a => !a.AtHome && !a.IsSupporting && a.Settlement != null
                && a.Settlement.WorldId == worldId && a.Settlement.OwnerId == ownerId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var now = _timeProvider.GetUtcNow();
        var newlyWalked = new List<HexCoord>();
        foreach (var settlement in settlements)
        {
            var level = settlement.ToDomain().LonghouseLevel;
            newlyWalked.AddRange(new HexCoord(settlement.CentreQ, settlement.CentreR)
                .WithinRadius(FogVisionRadii.ExploredRadius(level)));
        }

        foreach (var armyEntity in travellingArmies)
        {
            var home = new HexCoord(armyEntity.Settlement!.CentreQ, armyEntity.Settlement.CentreR);
            var position = armyEntity.ToDomain().PositionAt(home, now);
            newlyWalked.AddRange(position.WithinRadius(FogVisionRadii.ArmyVisionRadiusHexes));
        }

        var explored = await _dbContext.PlayerExplored
            .FirstOrDefaultAsync(e => e.WorldId == worldId && e.OwnerId == ownerId, cancellationToken)
            .ConfigureAwait(false);

        var mergedBits = PersistedExploredBitset.Merge(bounds, explored?.Bits, newlyWalked, out var grew);
        if (grew)
        {
            if (explored is null)
            {
                explored = new PlayerExploredEntity { WorldId = worldId, OwnerId = ownerId };
                _dbContext.PlayerExplored.Add(explored);
            }

            explored.Bits = mergedBits;
            explored.UpdatedAt = now;
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }

        var eTag = ComputeETag(settlements, mergedBits);
        var cacheKey = $"fog-mask:{worldId}:{ownerId}:{eTag}";

        if (_cache.TryGetValue<byte[]>(cacheKey, out var cachedPng))
        {
            return new FogMaskResult(FogMaskRejection.None, cachedPng, eTag);
        }

        var sources = settlements
            .Select(s => FogVisionRadii.ToVisionSource(
                new HexCoord(s.CentreQ, s.CentreR), s.ToDomain().LonghouseLevel))
            .ToList();

        var persistedExplored = PersistedExploredBitset.Decode(bounds, mergedBits);
        var mask = FogMaskGenerator.Generate(bounds, sources, persistedExplored);
        var png = FogMaskPngEncoder.Encode(mask);

        _cache.Set(cacheKey, png, new MemoryCacheEntryOptions { SlidingExpiration = CacheSlidingExpiration });

        return new FogMaskResult(FogMaskRejection.None, png, eTag);
    }

    /// <summary>
    /// A deterministic hash of the player's current settlement set — id,
    /// position, and longhouse level (the only inputs
    /// <see cref="FogVisionRadii.ToVisionSource"/> reads) — sorted first so
    /// the same set always hashes the same way regardless of query order —
    /// plus the persisted explored bitset actually baked into this mask.
    /// Doubles as the cache key's version component and the HTTP `ETag`, per
    /// §1a Option B's <c>(playerId, sorted [settlementId, q, r, level])</c>
    /// cache key, extended for §1e's persisted layer. The bitset only ever
    /// grows (see <see cref="PersistedExploredBitset.Merge"/>), so this
    /// doesn't reintroduce §1c's "busts the cache every movement tick"
    /// problem — an army merely standing somewhere already-walked changes
    /// nothing here.
    /// </summary>
    private static string ComputeETag(IReadOnlyCollection<Entities.SettlementEntity> settlements, byte[] persistedBits)
    {
        var version = string.Join(
            '|',
            settlements
                .Select(s => (s.Id, s.CentreQ, s.CentreR, Level: s.ToDomain().LonghouseLevel))
                .OrderBy(s => s.Id)
                .Select(s => $"{s.Id}:{s.CentreQ}:{s.CentreR}:{s.Level}"));

        using var sha = SHA256.Create();
        sha.TransformBlock(Encoding.UTF8.GetBytes(version), 0, Encoding.UTF8.GetByteCount(version), null, 0);
        sha.TransformFinalBlock(persistedBits, 0, persistedBits.Length);

        return Convert.ToHexString(sha.Hash!)[..16];
    }
}
