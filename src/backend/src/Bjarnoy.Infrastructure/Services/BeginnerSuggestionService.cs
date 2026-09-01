using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>One candidate landing spot, ranked/filtered for a beginner (design doc §6, issue #132).</summary>
public sealed record SuggestedStartCandidate(Guid IslandId, int Q, int R, int Ring);

/// <param name="Candidates">
/// Up to the caller's requested count, nearest-to-<c>near</c>-first within
/// whichever ring/fallback pool they were drawn from.
/// </param>
/// <param name="Fallback">
/// True only on genuine total exhaustion (design doc §6): every island in the
/// world either has a graduated settlement on it or zero open plots. The
/// candidates in that case (if any) come from the plain unfiltered
/// nearest-open-plot search, beginner filtering dropped entirely — the same
/// state <c>FoundAsync</c>'s own <c>WorldFull</c> rejection is close to or
/// coincides with.
/// </param>
public sealed record SuggestedStartResult(IReadOnlyList<SuggestedStartCandidate> Candidates, bool Fallback);

/// <summary>
/// Beginner-area spawn segregation (design doc §6, issue #132): a
/// read-time-only ring/qualification bucketing of data <see cref="WorldService"/>
/// already persists — no change to <see cref="WorldGenerator"/>, no new
/// column on <see cref="IslandEntity"/>/<see cref="WorldEntity"/>.
/// </summary>
/// <remarks>
/// <para>
/// Three logically distinct in-process caches, matching the design doc's own
/// split by lifetime — a static ring assignment (indefinite; only a reseed
/// invalidates it), an <c>openPlots</c> map per world (invalidated on a
/// successful founding — see <see cref="InvalidateAfterFounding"/>, called
/// from <see cref="SettlementService.FoundAsync"/>), and a per-island
/// "qualifies" (no graduate) flag cached with an <see cref="MemoryCacheEntryOptions.AbsoluteExpiration"/>
/// at that island's own earliest <see cref="Settlement.ShieldExpiresAtUtc"/>
/// so a lapsing shield recomputes only the one island it belongs to.
/// </para>
/// <para>
/// Deliberately <em>not</em> unified with <see cref="SettlementService.FoundAsync"/>'s
/// own two-phase spacing check even though both use the same
/// <see cref="SettlementService.MinimumSpacing"/>/<see cref="Settlement.ClaimDiscsFor"/>
/// shape — that method validates one specific hex a player chose, this
/// validates every candidate on every island before any of them are ever
/// offered. Per #155's own reasoning (see <see cref="Settlement.Claims"/>'s
/// remarks), the two call sites apply the pattern independently.
/// </para>
/// </remarks>
public sealed class BeginnerSuggestionService(
    GameDbContext dbContext,
    TimeProvider timeProvider,
    IMemoryCache cache)
{
    /// <summary>Fixed ring count (design doc §6: "a small fixed ringCount (e.g. 6-8)").</summary>
    public const int RingCount = 6;

    /// <summary>
    /// Extra hexes of comfort margin added on top of
    /// <see cref="SettlementService.FoundingSafetyMargin"/> for a beginner
    /// suggestion specifically (design doc §6: "the same FoundingSafetyMargin,
    /// plus a little more on top for the new player's comfort").
    /// </summary>
    public const int BeginnerComfortMargin = 2;

    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly IMemoryCache _cache = cache;

    private static string RingCacheKey(Guid worldId) => $"beginner-ring:{worldId}";

    private static string OpenPlotsCacheKey(Guid worldId) => $"beginner-openplots:{worldId}";

    private static string QualifiesCacheKey(Guid worldId, Guid islandId) => $"beginner-qualifies:{worldId}:{islandId}";

    /// <summary>
    /// Called after a successful founding (<see cref="SettlementService.FoundAsync"/>):
    /// that island's open-plot count and graduation-risk state are both stale
    /// the instant a new settlement lands there, so both are dropped rather
    /// than left to a guessed TTL. <c>openPlots</c> is invalidated for the
    /// whole world rather than patched in place for just this one island —
    /// island counts are bounded (a few hundred worst case, per the design
    /// doc's own sizing note), so a full recompute on the next read is cheap
    /// enough not to need the doc's more surgical single-island patch.
    /// </summary>
    public void InvalidateAfterFounding(Guid worldId, Guid islandId)
    {
        _cache.Remove(OpenPlotsCacheKey(worldId));
        _cache.Remove(QualifiesCacheKey(worldId, islandId));
    }

    /// <summary>
    /// Called after an admin reseed (<c>WorldService.ReseedAsync</c>): every
    /// island id (and hence every per-island cache key) from the old map is
    /// gone, so the ring assignment and open-plot maps are dropped outright.
    /// Per-island "qualifies" entries are left to lapse on their own — they
    /// are keyed by an island id the reseed just deleted, so nothing will
    /// ever read them again.
    /// </summary>
    public void InvalidateAfterReseed(Guid worldId)
    {
        _cache.Remove(RingCacheKey(worldId));
        _cache.Remove(OpenPlotsCacheKey(worldId));
    }

    /// <summary>
    /// The design doc §6 ring walk: innermost-ring-first, unbounded (not
    /// capped at <see cref="RingCount"/>), only falling back to an unfiltered
    /// nearest-open-plot search on genuine total exhaustion. Null when the
    /// world itself does not exist.
    /// </summary>
    public async Task<SuggestedStartResult?> GetSuggestedStartAsync(
        Guid worldId, HexCoord near, int maxCandidates = 6, CancellationToken cancellationToken = default)
    {
        var world = await _dbContext.Worlds.AsNoTracking()
            .FirstOrDefaultAsync(w => w.Id == worldId, cancellationToken).ConfigureAwait(false);
        if (world is null)
        {
            return null;
        }

        var gameNow = world.ToClock().ToGameTime(_timeProvider.GetUtcNow());

        var islands = await _dbContext.Islands.AsNoTracking()
            .Where(i => i.WorldId == worldId)
            .Select(i => new { i.Id, i.CentreQ, i.CentreR })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        if (islands.Count == 0)
        {
            return new SuggestedStartResult([], Fallback: true);
        }

        var ringOf = await GetRingAssignmentsAsync(world, islands.Select(i => (i.Id, i.CentreQ, i.CentreR)), cancellationToken)
            .ConfigureAwait(false);
        var openPlots = await GetOpenPlotsAsync(worldId, cancellationToken).ConfigureAwait(false);
        var qualifies = await GetQualifyingIslandsAsync(
            worldId, gameNow, islands.Select(i => i.Id), cancellationToken).ConfigureAwait(false);

        // Innermost-ring-first, ascending over whichever ring numbers this
        // world's islands actually occupy — see the design doc's remarks on
        // why this is unbounded arithmetic, not capped at RingCount.
        var presentRings = ringOf.Values.Distinct().OrderBy(r => r).ToList();
        foreach (var ring in presentRings)
        {
            var candidates = islands
                .Where(i => ringOf[i.Id] == ring && qualifies.GetValueOrDefault(i.Id, true))
                .SelectMany(i => openPlots.GetValueOrDefault(i.Id, [])
                    .Select(p => new SuggestedStartCandidate(i.Id, p.Q, p.R, ring)))
                .ToList();

            if (candidates.Count > 0)
            {
                return new SuggestedStartResult(RankByDistance(candidates, near, maxCandidates), Fallback: false);
            }
        }

        // Genuine total exhaustion (design doc §6): every island either has a
        // graduate on it or zero open plots — fall back to a plain,
        // unfiltered nearest-open-plot search, beginner filtering dropped.
        var fallbackCandidates = islands
            .SelectMany(i => openPlots.GetValueOrDefault(i.Id, [])
                .Select(p => new SuggestedStartCandidate(i.Id, p.Q, p.R, ringOf.GetValueOrDefault(i.Id, 0))))
            .ToList();

        return new SuggestedStartResult(RankByDistance(fallbackCandidates, near, maxCandidates), Fallback: true);
    }

    private static IReadOnlyList<SuggestedStartCandidate> RankByDistance(
        List<SuggestedStartCandidate> candidates, HexCoord near, int maxCandidates) =>
        [
            .. candidates
                .OrderBy(c => near.DistanceTo(new HexCoord(c.Q, c.R)))
                .Take(Math.Max(0, maxCandidates)),
        ];

    /// <summary>
    /// Island → ring number (design doc §6: <c>ringOf(island) = HexCoord.Distance(Origin, island.Centre) / ringWidth</c>,
    /// <c>ringWidth = world.Radius / RingCount</c>). Cached indefinitely per
    /// world — this is a pure function of data fixed at world creation/generation,
    /// so nothing but a reseed (<see cref="InvalidateAfterReseed"/>) can ever
    /// change it.
    /// </summary>
    private async Task<Dictionary<Guid, int>> GetRingAssignmentsAsync(
        WorldEntity world, IEnumerable<(Guid Id, int CentreQ, int CentreR)> islands, CancellationToken cancellationToken)
    {
        var cacheKey = RingCacheKey(world.Id);
        if (_cache.TryGetValue<Dictionary<Guid, int>>(cacheKey, out var cached) && cached is not null)
        {
            return cached;
        }

        await Task.Yield(); // keep this async-shaped even though today's computation is pure/in-memory.
        cancellationToken.ThrowIfCancellationRequested();

        var ringWidth = Math.Max(1, world.Radius / RingCount);
        var result = islands.ToDictionary(
            i => i.Id,
            i => HexCoord.Distance(HexCoord.Origin, new HexCoord(i.CentreQ, i.CentreR)) / ringWidth);

        _cache.Set(cacheKey, result);
        return result;
    }

    /// <summary>
    /// Island → its still-open <see cref="TileCoordinate"/>-shaped start
    /// positions (design doc §6's <c>openPlots</c>, kept as the actual
    /// coordinates rather than a bare count so the ring walk can return them
    /// directly). Cached per world with no expiration — the only two events
    /// that can change it are a founding (<see cref="InvalidateAfterFounding"/>)
    /// and a reseed (<see cref="InvalidateAfterReseed"/>), both of which drop
    /// this cache entry explicitly rather than letting it go stale on a timer.
    /// </summary>
    private async Task<Dictionary<Guid, List<HexPoint>>> GetOpenPlotsAsync(
        Guid worldId, CancellationToken cancellationToken)
    {
        var cacheKey = OpenPlotsCacheKey(worldId);
        if (_cache.TryGetValue<Dictionary<Guid, List<HexPoint>>>(cacheKey, out var cached) && cached is not null)
        {
            return cached;
        }

        var islands = await _dbContext.Islands.AsNoTracking()
            .Where(i => i.WorldId == worldId)
            .Select(i => new { i.Id, i.StartPositions })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var settlements = await _dbContext.Settlements.AsNoTracking()
            .Where(s => s.WorldId == worldId)
            .Select(s => new
            {
                s.IslandId,
                s.CentreQ,
                s.CentreR,
                Buildings = s.Buildings.Select(b => new { b.Q, b.R, b.Type, b.Level }).ToList(),
            })
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        var settlementsByIsland = settlements.ToLookup(s => s.IslandId);

        var result = new Dictionary<Guid, List<HexPoint>>();
        foreach (var island in islands)
        {
            var neighbours = settlementsByIsland[island.Id].ToList();
            var open = new List<HexPoint>();

            foreach (var pos in island.StartPositions)
            {
                var coord = new HexCoord(pos.Q, pos.R);

                // Phase 1: the same cheap, tower-blind MinimumSpacing centre-
                // to-centre filter FoundAsync itself runs first.
                var tooCloseByPhase1 = neighbours.Any(n =>
                    coord.DistanceTo(new HexCoord(n.CentreQ, n.CentreR)) < SettlementService.MinimumSpacing);
                if (tooCloseByPhase1)
                {
                    continue;
                }

                // Phase 2: the live check against each neighbour's *actual*
                // current territory (towers included), same shape as
                // FoundAsync's own phase 2, plus a little extra margin for a
                // beginner's comfort specifically — see BeginnerComfortMargin.
                var withinRealTerritory = neighbours.Any(n =>
                {
                    var centre = new HexCoord(n.CentreQ, n.CentreR);
                    var buildings = n.Buildings
                        .Select(b => new PlacedBuilding(new HexCoord(b.Q, b.R), b.Type, b.Level))
                        .ToList();
                    return Settlement.ClaimDiscsFor(centre, buildings)
                        .Any(disc => disc.Centre.DistanceTo(coord)
                            <= disc.Radius + SettlementService.FoundingSafetyMargin + BeginnerComfortMargin);
                });

                if (!withinRealTerritory)
                {
                    open.Add(pos);
                }
            }

            result[island.Id] = open;
        }

        _cache.Set(cacheKey, result);
        return result;
    }

    /// <summary>
    /// Island → whether it still "qualifies" as beginner-only (design doc
    /// §6: no <em>graduated</em>, i.e. unshielded, settlement on it — a
    /// separate condition from <c>openPlots</c> having any capacity). Each
    /// island's entry is cached independently, with
    /// <see cref="MemoryCacheEntryOptions.AbsoluteExpiration"/> set to that
    /// island's own earliest <see cref="Settlement.ShieldExpiresAtUtc"/> among
    /// its still-shielded settlements — the one piece of this feature that
    /// changes by clock rather than by event — so only an island whose
    /// shield window is actually about to lapse ever gets recomputed. Once an
    /// island has a graduate, that is permanent (a graduated island never
    /// un-graduates) and is cached with no expiration at all; see
    /// <see cref="InvalidateAfterFounding"/> for the one other event (a new
    /// settlement landing there) that can change this island's answer.
    /// </summary>
    private async Task<Dictionary<Guid, bool>> GetQualifyingIslandsAsync(
        Guid worldId, DateTimeOffset now, IEnumerable<Guid> islandIds, CancellationToken cancellationToken)
    {
        var result = new Dictionary<Guid, bool>();
        var toCompute = new List<Guid>();

        foreach (var islandId in islandIds)
        {
            if (_cache.TryGetValue<bool>(QualifiesCacheKey(worldId, islandId), out var cached))
            {
                result[islandId] = cached;
            }
            else
            {
                toCompute.Add(islandId);
            }
        }

        if (toCompute.Count == 0)
        {
            return result;
        }

        var settlements = await _dbContext.Settlements.AsNoTracking()
            .Where(s => s.WorldId == worldId && toCompute.Contains(s.IslandId))
            .Select(s => new { s.IslandId, s.ShieldExpiresAtUtc })
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        var byIsland = settlements.ToLookup(s => s.IslandId);

        foreach (var islandId in toCompute)
        {
            var onIsland = byIsland[islandId].ToList();

            // A settlement with no ShieldExpiresAtUtc (yielded, or founded
            // before this feature existed) or one whose shield has already
            // lapsed both read as "graduated" — the design doc's Settlement.IsShielded
            // rule exactly.
            var hasGraduate = onIsland.Any(s => s.ShieldExpiresAtUtc is not { } expires || now >= expires);

            if (hasGraduate)
            {
                _cache.Set(QualifiesCacheKey(worldId, islandId), false);
                result[islandId] = false;
                continue;
            }

            var stillShielded = onIsland.Where(s => s.ShieldExpiresAtUtc.HasValue).ToList();
            if (stillShielded.Count > 0)
            {
                var earliestExpiry = stillShielded.Min(s => s.ShieldExpiresAtUtc!.Value);
                _cache.Set(QualifiesCacheKey(worldId, islandId), true, new MemoryCacheEntryOptions
                {
                    AbsoluteExpiration = earliestExpiry,
                });
            }
            else
            {
                // No settlements on this island at all yet — qualifies
                // trivially, and stays cached until a founding happens there
                // (InvalidateAfterFounding), at which point it is recomputed
                // against the settlement that just landed.
                _cache.Set(QualifiesCacheKey(worldId, islandId), true);
            }

            result[islandId] = true;
        }

        return result;
    }
}
