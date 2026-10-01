using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.World;

/// <summary>A hex disc a player currently has explored ground from: a settlement ring, a tower, an army's walked position.</summary>
public readonly record struct ExploredDisc(HexCoord Centre, int Radius);

/// <param name="Settlements">
/// The owner's own settlements in this world, buildings loaded — what the
/// vision sources below are built from.
/// </param>
/// <param name="VisionSources">
/// The settlement and tower <see cref="FogVisionSource"/>s the mask bakes its
/// two ramps from (armies contribute explored ground only, never a source —
/// §1c keeps their live vision out of the cached mask).
/// </param>
/// <param name="Discs">
/// Every disc of ground the owner currently explores: each settlement's and
/// tower's explored ring and each in-transit army's walked-over radius. OR-ed
/// into the persisted chunks (<see cref="ExploredAreaService"/>) and consulted
/// directly by <see cref="ExploredAreaService.ExploredAmongAsync"/>, so nothing
/// ever materialises "the explored set" of a world.
/// </param>
/// <param name="MergedChunks">
/// When the area was loaded with <c>persist: true</c>: the post-merge state of
/// every chunk the <paramref name="Discs"/> touch — what the database holds
/// now (or would, had a concurrent first insert not won the race), so a
/// caller reading the store next sees no older data. Empty otherwise.
/// </param>
public sealed record ExploredArea(
    Guid WorldId,
    string OwnerId,
    int WorldRadius,
    IReadOnlyList<SettlementEntity> Settlements,
    IReadOnlyList<FogVisionSource> VisionSources,
    IReadOnlyList<ExploredDisc> Discs,
    IReadOnlyDictionary<FogChunkCoord, ExploredChunkData> MergedChunks)
{
    public MaskBounds Bounds => FogMaskLayout.WorldBounds(WorldRadius);

    /// <summary>Whether <paramref name="hex"/> lies inside one of the owner's current discs (no persisted history consulted).</summary>
    public bool InCurrentDiscs(HexCoord hex)
    {
        foreach (var disc in Discs)
        {
            if (HexCoord.Distance(disc.Centre, hex) <= disc.Radius)
            {
                return true;
            }
        }

        return false;
    }
}

/// <summary>
/// The shared source of truth behind a player's fog of war: which ground in a
/// world they have actually explored, per <c>docs/design/map-fog-v2.md</c>
/// §1e. Every fog-gated read — the fog chunks (<see cref="FogChunkService"/>),
/// <c>GET /settlements/{id}/view</c> and <c>GET /worlds/{worldId}/settlements</c>
/// — shares this one computation of "which hexes has this owner explored"
/// rather than reimplementing it, which would both duplicate the ring/tower/
/// army-vision logic and risk the readings of "explored" drifting apart.
/// </summary>
/// <remarks>
/// <para>
/// Explored ground is the owner's persisted history — sparse 64 x 64-texel
/// chunks (<see cref="PlayerExploredChunkEntity"/>, <see cref="PersistedExploredBitset"/>),
/// one row per touched chunk, a fully explored chunk stored as a flag — OR
/// the discs they explore from right now (settlement and tower rings,
/// in-transit armies at <see cref="FogVisionRadii.ArmyVisionRadiusHexes"/>).
/// Nothing here iterates the world or builds a set of it: writes group the
/// current discs' hexes by chunk and touch only those rows, reads fetch only
/// the chunks asked for.
/// </para>
/// </remarks>
public sealed class ExploredAreaService(GameDbContext dbContext, TimeProvider timeProvider)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;

    /// <summary>
    /// <see langword="null"/> only when <paramref name="worldId"/> itself
    /// doesn't exist — an owner with no settlements and no explored history
    /// yet gets back an area with no sources, matching "an all-fog mask is
    /// not a rejection".
    /// </summary>
    /// <param name="persist">
    /// Whether the current discs are OR-ed into the stored chunks and saved
    /// back. Only the fog chunk read (the one read that owns "exploring")
    /// passes <see langword="true"/>. The fog-gated settlement reads use the
    /// discs directly without saving: they are polled alongside the fog
    /// chunks, and a second writer racing it to insert a new player's first
    /// chunk row would hit the primary key and 500 the request.
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

        var settlements = await _dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.Buildings)
            .Where(s => s.WorldId == worldId && s.OwnerId == ownerId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        // In-transit armies only — an AtHome army stands in its own
        // settlement's already-explored ring, a Supporting one stands
        // wherever it's supporting, neither needs its own walked-ground
        // contribution.
        var travellingArmies = await _dbContext.Armies
            .AsNoTracking()
            .Include(a => a.Settlement)
            .Include(a => a.Stacks)
            .Where(a => !a.AtHome && !a.IsSupporting && a.Settlement != null
                && a.Settlement.WorldId == worldId && a.Settlement.OwnerId == ownerId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var now = _timeProvider.GetUtcNow();
        var sources = new List<FogVisionSource>();
        var discs = new List<ExploredDisc>();
        var ravensBySettlement = new Dictionary<Guid, int>();
        foreach (var settlement in settlements)
        {
            var domain = settlement.ToDomain();
            var level = domain.LonghouseLevel;
            // Odin's Ravens: extra rings on the claim's own disc and on every tower's.
            var ravens = domain.VisionBonusRings;
            ravensBySettlement[settlement.Id] = ravens;
            var centre = new HexCoord(settlement.CentreQ, settlement.CentreR);
            sources.Add(FogVisionRadii.ToVisionSource(centre, level, ravens));
            discs.Add(new ExploredDisc(centre, FogVisionRadii.ExploredRadius(level) + ravens));

            foreach (var tower in settlement.Buildings.Where(b => b.Type == BuildingType.Tower))
            {
                var towerCoord = new HexCoord(tower.Q, tower.R);
                sources.Add(FogVisionRadii.ToTowerVisionSource(towerCoord, tower.Level, ravens));
                discs.Add(new ExploredDisc(towerCoord, FogVisionRadii.TowerExploredRadius(tower.Level) + ravens));
            }
        }

        foreach (var armyEntity in travellingArmies)
        {
            var home = new HexCoord(armyEntity.Settlement!.CentreQ, armyEntity.Settlement.CentreR);
            var position = armyEntity.ToDomain().PositionAt(home, now);
            // The army's origin settlement's Ravens widen its walked-ground reveal too.
            var armyRavens = ravensBySettlement.GetValueOrDefault(armyEntity.SettlementId);
            discs.Add(new ExploredDisc(position, FogVisionRadii.ArmyVisionRadius(armyRavens)));
        }

        var merged = persist
            ? await MergeAndSaveAsync(worldId, ownerId, discs, now, cancellationToken).ConfigureAwait(false)
            : new Dictionary<FogChunkCoord, ExploredChunkData>();

        return new ExploredArea(worldId, ownerId, radius.Value, settlements, sources, discs, merged);
    }

    /// <summary>
    /// The stored chunks of <paramref name="ownerId"/> inside an inclusive
    /// chunk rectangle — a range scan on the primary key. Untouched chunks
    /// have no entry.
    /// </summary>
    public async Task<Dictionary<FogChunkCoord, ExploredChunkData>> LoadRectAsync(
        Guid worldId,
        string ownerId,
        FogChunkCoord min,
        FogChunkCoord max,
        CancellationToken cancellationToken = default)
    {
        var rows = await _dbContext.PlayerExploredChunks
            .AsNoTracking()
            .Where(c => c.WorldId == worldId && c.OwnerId == ownerId
                && c.ChunkU >= min.U && c.ChunkU <= max.U
                && c.ChunkV >= min.V && c.ChunkV <= max.V)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return rows.ToDictionary(r => new FogChunkCoord(r.ChunkU, r.ChunkV), ToData);
    }

    /// <summary>
    /// Which of <paramref name="candidates"/> the owner has explored — the
    /// fog gate for another realm's settlements and buildings. Answers from
    /// the current discs first, then reads only the stored chunks the rest
    /// fall in; the cost scales with the candidates, never with the world.
    /// </summary>
    public async Task<HashSet<HexCoord>> ExploredAmongAsync(
        ExploredArea area, IEnumerable<HexCoord> candidates, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(area);
        ArgumentNullException.ThrowIfNull(candidates);

        var explored = new HashSet<HexCoord>();
        var remaining = new HashSet<HexCoord>();
        foreach (var hex in candidates)
        {
            if (area.InCurrentDiscs(hex))
            {
                explored.Add(hex);
            }
            else
            {
                remaining.Add(hex);
            }
        }

        if (remaining.Count == 0)
        {
            return explored;
        }

        var wanted = PersistedExploredBitset.GroupByChunk(remaining);
        var rows = await LoadChunkRowsAsync(area.WorldId, area.OwnerId, wanted.Keys, tracked: false, cancellationToken)
            .ConfigureAwait(false);

        foreach (var (chunk, hexes) in wanted)
        {
            if (!rows.TryGetValue(chunk, out var row))
            {
                continue;
            }

            var data = ToData(row);
            foreach (var hex in hexes)
            {
                if (PersistedExploredBitset.Contains(chunk, data, hex))
                {
                    explored.Add(hex);
                }
            }
        }

        return explored;
    }

    /// <summary>
    /// ORs the discs' hexes into the stored chunks and saves what grew.
    /// Returns the post-merge state of every touched chunk.
    /// </summary>
    private async Task<Dictionary<FogChunkCoord, ExploredChunkData>> MergeAndSaveAsync(
        Guid worldId,
        string ownerId,
        List<ExploredDisc> discs,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var merged = new Dictionary<FogChunkCoord, ExploredChunkData>();
        if (discs.Count == 0)
        {
            return merged;
        }

        var wanted = PersistedExploredBitset.GroupByChunk(
            discs.SelectMany(d => d.Centre.WithinRadius(d.Radius)).Distinct());
        var rows = await LoadChunkRowsAsync(worldId, ownerId, wanted.Keys, tracked: true, cancellationToken)
            .ConfigureAwait(false);

        var inserting = false;
        foreach (var (chunk, hexes) in wanted)
        {
            var hasRow = rows.TryGetValue(chunk, out var row);
            var existing = hasRow ? ToData(row!) : ExploredChunkData.None;
            var next = PersistedExploredBitset.Merge(chunk, existing, hexes, out var grew);
            merged[chunk] = next;
            if (!grew)
            {
                continue;
            }

            if (!hasRow)
            {
                row = new PlayerExploredChunkEntity
                {
                    WorldId = worldId,
                    OwnerId = ownerId,
                    ChunkU = chunk.U,
                    ChunkV = chunk.V,
                };
                _dbContext.PlayerExploredChunks.Add(row);
                inserting = true;
            }

            row!.Bits = next.Bits;
            row.IsFull = next.IsFull;
            row.UpdatedAt = now;
        }

        if (!_dbContext.ChangeTracker.HasChanges())
        {
            return merged;
        }

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException) when (inserting)
        {
            // Two concurrent fog requests for a new player both saw no row
            // for a chunk and both inserted; the primary key let one win.
            // The loser's bits are the same ground (the store only ever
            // grows and both were computed from the same inputs), so
            // dropping this save loses nothing — the next poll merges into
            // the winner's row. `merged` above is what this request reports.
            foreach (var entry in _dbContext.ChangeTracker.Entries<PlayerExploredChunkEntity>().ToList())
            {
                entry.State = EntityState.Detached;
            }
        }

        return merged;
    }

    private async Task<Dictionary<FogChunkCoord, PlayerExploredChunkEntity>> LoadChunkRowsAsync(
        Guid worldId,
        string ownerId,
        IEnumerable<FogChunkCoord> chunks,
        bool tracked,
        CancellationToken cancellationToken)
    {
        var wanted = chunks.ToHashSet();
        if (wanted.Count == 0)
        {
            return [];
        }

        // Two IN lists (columns, rows) narrow the primary-key scan; the exact
        // pairs are filtered in memory. Rows only exist where the owner has
        // explored, so the over-fetch of the cross product is bounded by
        // their own history.
        var us = wanted.Select(c => c.U).Distinct().ToList();
        var vs = wanted.Select(c => c.V).Distinct().ToList();

        var query = _dbContext.PlayerExploredChunks
            .Where(c => c.WorldId == worldId && c.OwnerId == ownerId
                && us.Contains(c.ChunkU) && vs.Contains(c.ChunkV));
        if (!tracked)
        {
            query = query.AsNoTracking();
        }

        var rows = await query.ToListAsync(cancellationToken).ConfigureAwait(false);
        return rows
            .Where(r => wanted.Contains(new FogChunkCoord(r.ChunkU, r.ChunkV)))
            .ToDictionary(r => new FogChunkCoord(r.ChunkU, r.ChunkV));
    }

    private static ExploredChunkData ToData(PlayerExploredChunkEntity row) => new(row.Bits, row.IsFull);
}
