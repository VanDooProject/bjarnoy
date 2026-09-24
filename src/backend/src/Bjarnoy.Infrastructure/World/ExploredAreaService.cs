using System.Security.Cryptography;
using System.Text;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Bjarnoy.Infrastructure.World;

/// <param name="Settlements">
/// <paramref name="ownerId"/>'s own settlements in this world, buildings
/// loaded — what <see cref="FogMaskService"/> builds its vision sources from.
/// </param>
/// <param name="Hexes">
/// The decoded, persisted explored set — every hex <paramref name="ownerId"/>
/// has ever had a settlement ring, tower or in-transit army reach in this
/// world, merged with whatever was already on record. This is the same
/// ground the fog mask reveals, and the authority every fog-gated read
/// (<c>GET /settlements/{id}/view</c>, <c>GET /worlds/{worldId}/settlements</c>)
/// checks a rival's position against.
/// </param>
/// <param name="Bits">
/// The packed form of <paramref name="Hexes"/> (<see cref="PersistedExploredBitset.Encode"/>'s
/// shape) — already the freshly-merged, saved-back bitset, not a stale read.
/// </param>
/// <param name="Version">
/// A stable hash of <paramref name="Settlements"/> and <paramref name="Bits"/> —
/// identical to <see cref="FogMaskService"/>'s own PNG ETag, so a cache keyed
/// on it self-invalidates exactly when the mask would.
/// </param>
public sealed record ExploredArea(
    IReadOnlyList<SettlementEntity> Settlements,
    IReadOnlySet<HexCoord> Hexes,
    byte[] Bits,
    MaskBounds Bounds,
    string Version);

/// <summary>
/// The shared source of truth behind a player's fog of war: which ground in a
/// world they have actually explored, per <c>docs/design/map-fog-v2.md</c>
/// §1e. Extracted out of <see cref="FogMaskService"/> (which still owns the
/// PNG-baking half of that document) so every other read that must respect
/// fog — <c>GET /settlements/{id}/view</c> and the fog-gated
/// <c>GET /worlds/{worldId}/settlements</c> — shares the exact same
/// "which hexes has this owner explored" computation rather than
/// reimplementing it, which would both duplicate the ring/tower/army-vision
/// logic and risk the two readings of "explored" silently drifting apart.
/// </summary>
/// <remarks>
/// <para>
/// Computes a player's explored hexes from their own settlements' vision
/// rings (<see cref="FogVisionRadii.ExploredRadius"/>), their towers'
/// (<see cref="FogVisionRadii.TowerExploredRadius"/>) and their in-transit
/// armies' current walked-over ground
/// (<see cref="FogVisionRadii.ArmyVisionRadiusHexes"/> around
/// <see cref="Domain.Armies.Army.PositionAt"/>), OR-ed into the persisted
/// <see cref="Entities.PlayerExploredEntity"/> bitset
/// (<see cref="PersistedExploredBitset.Merge"/>) and saved back if it grew —
/// exactly what <see cref="FogMaskService.GeneratePlayerMaskAsync"/> used to
/// do inline before this extraction. Its output must stay byte-identical to
/// that prior behaviour; <c>FogMaskServiceTests</c> is what proves it.
/// </para>
/// <para>
/// The decoded hex set is cached in <see cref="IMemoryCache"/>, keyed by
/// <see cref="ExploredArea.Version"/> — the same version FogMaskService's own
/// PNG cache uses — so the cache self-invalidates the instant the underlying
/// settlement set or persisted history actually changes, with no separate
/// eviction call needed on any write path.
/// </para>
/// </remarks>
public sealed class ExploredAreaService(GameDbContext dbContext, IMemoryCache cache, TimeProvider timeProvider)
{
    /// <summary>
    /// How long a decoded explored set is kept once nobody has asked for it
    /// again — same policy, and same reasoning, as
    /// <see cref="FogMaskService"/>'s own PNG cache.
    /// </summary>
    private static readonly TimeSpan CacheSlidingExpiration = TimeSpan.FromMinutes(10);

    private readonly GameDbContext _dbContext = dbContext;
    private readonly IMemoryCache _cache = cache;
    private readonly TimeProvider _timeProvider = timeProvider;

    /// <summary>
    /// <see langword="null"/> only when <paramref name="worldId"/> itself
    /// doesn't exist — an owner with no settlements and no explored history
    /// yet gets back an empty (never null) <see cref="ExploredArea.Hexes"/>,
    /// matching <see cref="FogMaskService"/>'s own "an all-fog mask is not a
    /// rejection" rule.
    /// </summary>
    /// <param name="persist">
    /// Whether newly explored ground is written back to
    /// <see cref="PlayerExploredEntity"/>. Only the fog mask (the one read
    /// that owns "exploring") passes <see langword="true"/>. The fog-gated
    /// settlement reads compute the same merged area in memory without
    /// saving: they are polled alongside the fog mask, and a second writer
    /// racing it to insert a new player's first row hit the
    /// <c>(WorldId, OwnerId)</c> unique index and 500'd the request.
    /// </param>
    public async Task<ExploredArea?> GetAsync(
        Guid worldId, string ownerId, bool persist = false, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);

        var radius = await _dbContext.Worlds
            .Where(w => w.Id == worldId)
            .Select(w => (int?)w.Radius)
            .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

        if (radius is null)
        {
            return null;
        }

        var bounds = FogMaskLayout.WorldBounds(radius.Value);

        var settlements = await _dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.Buildings)
            .Where(s => s.WorldId == worldId && s.OwnerId == ownerId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        // In-transit armies only — see FogMaskService's own remarks (an
        // AtHome army stands in its own settlement's already-explored ring,
        // a Supporting one stands wherever it's supporting, neither needs
        // its own walked-ground contribution).
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

            foreach (var tower in settlement.Buildings.Where(b => b.Type == BuildingType.Tower))
            {
                newlyWalked.AddRange(new HexCoord(tower.Q, tower.R)
                    .WithinRadius(FogVisionRadii.TowerExploredRadius(tower.Level)));
            }
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
        if (grew && persist)
        {
            var inserting = explored is null;
            if (explored is null)
            {
                explored = new PlayerExploredEntity { WorldId = worldId, OwnerId = ownerId };
                _dbContext.PlayerExplored.Add(explored);
            }

            explored.Bits = mergedBits;
            explored.UpdatedAt = now;
            try
            {
                await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            }
            catch (DbUpdateException) when (inserting)
            {
                // Two concurrent fog-mask requests for a brand-new player both
                // saw no row and both inserted; the unique index let one win.
                // The loser's bits are the same ground (the bitset only ever
                // grows, and both were computed from the same inputs), so
                // dropping this insert loses nothing — the next poll merges
                // into the winner's row.
                _dbContext.Entry(explored).State = EntityState.Detached;
            }
        }

        var version = ComputeVersion(settlements, mergedBits);
        var cacheKey = $"explored-area:{worldId}:{ownerId}:{version}";

        if (_cache.TryGetValue<HashSet<HexCoord>>(cacheKey, out var cachedHexes))
        {
            return new ExploredArea(settlements, cachedHexes!, mergedBits, bounds, version);
        }

        var hexes = PersistedExploredBitset.Decode(bounds, mergedBits);
        _cache.Set(cacheKey, hexes, new MemoryCacheEntryOptions { SlidingExpiration = CacheSlidingExpiration });

        return new ExploredArea(settlements, hexes, mergedBits, bounds, version);
    }

    /// <summary>
    /// A deterministic hash of the owner's current settlement set — id,
    /// position, longhouse level, and every standing Tower's own coord/level —
    /// plus the persisted explored bitset actually folded in. Sorted first so
    /// the same set always hashes the same way regardless of query order. This
    /// is byte-for-byte <see cref="FogMaskService"/>'s own former
    /// <c>ComputeETag</c> — moved here, not reimplemented, so the PNG's `ETag`
    /// and this service's cache/version key can never drift apart.
    /// </summary>
    private static string ComputeVersion(IReadOnlyCollection<SettlementEntity> settlements, byte[] persistedBits)
    {
        var version = string.Join(
            '|',
            settlements
                .Select(s => (s.Id, s.CentreQ, s.CentreR, Level: s.ToDomain().LonghouseLevel, Towers: s.Buildings
                    .Where(b => b.Type == BuildingType.Tower)
                    .OrderBy(b => b.Q).ThenBy(b => b.R)
                    .Select(b => $"{b.Q}:{b.R}:{b.Level}")))
                .OrderBy(s => s.Id)
                .Select(s => $"{s.Id}:{s.CentreQ}:{s.CentreR}:{s.Level}:[{string.Join(',', s.Towers)}]"));

        using var sha = SHA256.Create();
        sha.TransformBlock(Encoding.UTF8.GetBytes(version), 0, Encoding.UTF8.GetByteCount(version), null, 0);
        sha.TransformFinalBlock(persistedBits, 0, persistedBits.Length);

        return Convert.ToHexString(sha.Hash!)[..16];
    }
}
