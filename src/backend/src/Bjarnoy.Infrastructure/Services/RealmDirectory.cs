using System.Collections.Concurrent;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Primitives;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// A settlement's "realm" as the ownership/identity surface cares about it:
/// which world it is in, who its client-local founder was, and which account
/// (if any real one) now owns it. Backs three lookups that would otherwise be
/// a database round trip on every settlement-mutating request or every
/// anonymous-play read — <see cref="GetOwnershipAsync"/> (the ownership
/// endpoint filters), <see cref="FindByUserAsync"/> and
/// <see cref="FindByOwnerAsync"/> (the caller-realm resolver behind
/// <c>GET .../membership</c>, <c>.../fog-mask</c> and <c>.../plot-suggestion</c>).
/// </summary>
/// <remarks>
/// <para>
/// This process runs single-instance (the same assumption
/// <c>InMemoryPlotReservationStore</c> already makes) — a multi-instance
/// deployment would need this cache invalidated across instances (e.g. via a
/// pub/sub bus) rather than the single in-process <see cref="IMemoryCache"/>
/// this leans on.
/// </para>
/// <para>
/// Only <em>positive</em> lookups are cached — a settlement that does not (yet)
/// exist, or an owner/user with no realm in a world (yet), is never cached as
/// "not found". This is deliberate, not an oversight: a just-founded realm
/// must be visible on the very next read with no invalidation call of its own,
/// and the miss path (a real database query) is already the cold case these
/// callers pay for once per settlement/owner/user anyway.
/// </para>
/// <para>
/// Cache entries live for <see cref="SlidingExpiration"/> and are additionally
/// tied to a per-world <see cref="CancellationChangeToken"/>
/// (<see cref="InvalidateWorld"/>) — every write that can change a settlement's
/// realm (claiming it in <c>AuthService.RegisterAsync</c>, deleting it in
/// <c>WorldService.ReseedAsync</c>) cancels that world's token, which evicts
/// every entry for that world at once regardless of which of the three cache
/// keys it lives under.
/// </para>
/// </remarks>
public sealed class RealmDirectory(GameDbContext dbContext, IMemoryCache cache)
{
    /// <summary>
    /// How long a positive lookup is trusted before it would expire on its
    /// own even with no write ever invalidating it — a defence-in-depth
    /// ceiling on staleness, not the primary invalidation mechanism (that is
    /// <see cref="InvalidateWorld"/>, which fires synchronously on every
    /// write that matters).
    /// </summary>
    public static readonly TimeSpan SlidingExpiration = TimeSpan.FromMinutes(10);

    /// <summary>
    /// Hard ceiling on any one entry's lifetime, however often it is read —
    /// see <see cref="Cache{T}"/>.
    /// </summary>
    public static readonly TimeSpan AbsoluteExpiration = TimeSpan.FromMinutes(30);

    /// <summary>
    /// Bumped by every <see cref="InvalidateWorld"/>; a lookup only caches
    /// what it read if this didn't move while it was reading. See
    /// <see cref="InvalidateWorld"/> for the race this closes.
    /// </summary>
    private static long _generation;

    /// <summary>
    /// One <see cref="CancellationTokenSource"/> per world that has ever had a
    /// cache entry, shared by every <see cref="RealmDirectory"/> instance
    /// (this service is request-scoped, but the cache and its invalidation
    /// tokens must outlive any one request) — see this class's own remarks on
    /// the single-instance assumption that makes a plain static dictionary
    /// safe here.
    /// </summary>
    private static readonly ConcurrentDictionary<Guid, CancellationTokenSource> WorldTokens = new();

    private readonly GameDbContext _dbContext = dbContext;
    private readonly IMemoryCache _cache = cache;

    /// <summary>
    /// A settlement's real owner (<see cref="SettlementEntity.UserId"/>),
    /// client-local owner id (<see cref="SettlementEntity.OwnerId"/>) and
    /// world — the ownership-authorization endpoint filters'
    /// (<c>Bjarnoy.Api.Auth.OwnershipGate</c>) one lookup per mutation. Null
    /// if no such settlement exists (never cached — see this class's remarks).
    /// </summary>
    public async Task<(Guid UserId, string OwnerId, Guid WorldId)?> GetOwnershipAsync(
        Guid settlementId, CancellationToken cancellationToken = default)
    {
        var cacheKey = OwnershipCacheKey(settlementId);
        if (_cache.TryGetValue<(Guid UserId, string OwnerId, Guid WorldId)>(cacheKey, out var cached))
        {
            return cached;
        }

        var generation = Volatile.Read(ref _generation);
        var ownership = await _dbContext.Settlements
            .Where(s => s.Id == settlementId)
            .Select(s => new { s.UserId, s.OwnerId, s.WorldId })
            .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

        if (ownership is null)
        {
            return null;
        }

        var result = (ownership.UserId, ownership.OwnerId, ownership.WorldId);
        Cache(cacheKey, result, ownership.WorldId, generation);
        return result;
    }

    /// <summary>
    /// The earliest-founded settlement a real account holds in a world — a
    /// user can hold several via settler-convoy foundings
    /// (<c>SettlementService.FoundFromConvoyAsync</c>), so this is their
    /// "primary" one for identity purposes (e.g. resolving which browser-local
    /// <see cref="SettlementEntity.OwnerId"/> a freshly logged-in caller's fog
    /// mask and plot-suggestion history live under). Null if the user holds no
    /// realm in this world (never cached — see this class's remarks).
    /// </summary>
    public async Task<(Guid SettlementId, string OwnerId, Guid UserId)?> FindByUserAsync(
        Guid worldId, Guid userId, CancellationToken cancellationToken = default)
    {
        var cacheKey = RealmByUserCacheKey(worldId, userId);
        if (_cache.TryGetValue<(Guid SettlementId, string OwnerId, Guid UserId)>(cacheKey, out var cached))
        {
            return cached;
        }

        // Ordered client-side, not via an EF ORDER BY: SQLite's provider
        // cannot translate ORDER BY on a DateTimeOffset column (same
        // limitation UserActivityService's remarks note) — harmless here
        // since a user rarely holds more than a couple of settlements per
        // world (settler-convoy foundings), so this never pulls more than a
        // handful of rows.
        var generation = Volatile.Read(ref _generation);
        var found = await _dbContext.Settlements
            .Where(s => s.WorldId == worldId && s.UserId == userId)
            .Select(s => new { s.Id, s.OwnerId, s.UserId, s.FoundedAt })
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        var primary = found.OrderBy(s => s.FoundedAt).ThenBy(s => s.Id).FirstOrDefault();

        if (primary is null)
        {
            return null;
        }

        var result = (primary.Id, primary.OwnerId, primary.UserId);
        Cache(cacheKey, result, worldId, generation);
        return result;
    }

    /// <summary>
    /// The earliest-founded settlement a client-local browser id holds in a
    /// world — same "primary realm" shape as <see cref="FindByUserAsync"/>,
    /// keyed the other way round. This is what anonymous play (and a claimed
    /// realm's header-only fallback — see the caller-realm resolver) has
    /// always effectively been: <c>SettlementService.FindByOwnerAsync</c>
    /// scoped by <c>(worldId, ownerId)</c>, now cached.
    /// </summary>
    public async Task<(Guid SettlementId, string OwnerId, Guid UserId)?> FindByOwnerAsync(
        Guid worldId, string ownerId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);

        var cacheKey = RealmByOwnerCacheKey(worldId, ownerId);
        if (_cache.TryGetValue<(Guid SettlementId, string OwnerId, Guid UserId)>(cacheKey, out var cached))
        {
            return cached;
        }

        // Same client-side ordering as FindByUserAsync, and the same reason.
        var generation = Volatile.Read(ref _generation);
        var found = await _dbContext.Settlements
            .Where(s => s.WorldId == worldId && s.OwnerId == ownerId)
            .Select(s => new { s.Id, s.OwnerId, s.UserId, s.FoundedAt })
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        var primary = found.OrderBy(s => s.FoundedAt).ThenBy(s => s.Id).FirstOrDefault();

        if (primary is null)
        {
            return null;
        }

        var result = (primary.Id, primary.OwnerId, primary.UserId);
        Cache(cacheKey, result, worldId, generation);
        return result;
    }

    /// <summary>
    /// Flushes every cache entry recorded for <paramref name="worldId"/>,
    /// regardless of which of the three lookups above created it. Called
    /// after any write that can change a settlement's realm in that world:
    /// <c>AuthService.RegisterAsync</c> claiming settlements, and
    /// <c>WorldService.ReseedAsync</c> deleting them. A world nobody has ever
    /// looked up (no token registered yet) is a safe no-op.
    /// </summary>
    public static void InvalidateWorld(Guid worldId)
    {
        // Bumped before the token is cancelled, so a lookup whose database
        // read raced this invalidation (read the pre-write row, then reached
        // Cache after the old token was already gone) sees a changed
        // generation and skips caching — otherwise it would attach the stale
        // value to the world's *fresh* token and outlive the invalidation
        // meant to evict it. Invalidations are rare (a claiming register, a
        // reseed), so the occasional skipped cache fill this costs unrelated
        // worlds is negligible.
        Interlocked.Increment(ref _generation);
        if (WorldTokens.TryRemove(worldId, out var oldCts))
        {
            // Cancelled but deliberately not disposed: another request may be
            // registering an entry against this token right now, and a
            // disposed source would throw there. It holds no unmanaged
            // resources worth the race, so the GC reclaims it.
            oldCts.Cancel();
        }
    }

    private void Cache<T>(string cacheKey, T value, Guid worldId, long generation)
    {
        if (Volatile.Read(ref _generation) != generation)
        {
            return;
        }

        var cts = WorldTokens.GetOrAdd(worldId, static _ => new CancellationTokenSource());

        var entryOptions = new MemoryCacheEntryOptions
        {
            SlidingExpiration = SlidingExpiration,
            // Sliding alone would let a key that is polled constantly (the
            // fog mask, every few seconds) live forever; this caps it so a
            // missed invalidation can never be stale for longer than this.
            AbsoluteExpirationRelativeToNow = AbsoluteExpiration,
        };
        entryOptions.ExpirationTokens.Add(new CancellationChangeToken(cts.Token));

        _cache.Set(cacheKey, value, entryOptions);
    }

    private static string OwnershipCacheKey(Guid settlementId) => $"realm:ownership:{settlementId}";

    private static string RealmByUserCacheKey(Guid worldId, Guid userId) => $"realm:by-user:{worldId}:{userId}";

    private static string RealmByOwnerCacheKey(Guid worldId, string ownerId) => $"realm:by-owner:{worldId}:{ownerId}";
}
