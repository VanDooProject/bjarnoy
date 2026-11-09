using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
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
/// <param name="LiveArmyDiscs">
/// The ground each in-transit army of the owner sees right now: the disc around its current hex (not the trail it walked).
/// Together with the settlement and tower sources' visible rings this is <see cref="SightDiscs"/>.
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
    IReadOnlyList<ExploredDisc> LiveArmyDiscs,
    IReadOnlyDictionary<FogChunkCoord, ExploredChunkData> MergedChunks)
{
    /// <summary>
    /// What the owner sees right now (<c>docs/design/map-fog-v2.md</c> §1g): the visible rings of the settlement and tower sources plus
    /// the live disc of every marching army.
    /// </summary>
    public IReadOnlyList<SightDisc> SightDiscs =>
    [
        .. VisionSources.Select(v => new SightDisc(v.Coord, v.VisibleRadius)),
        .. LiveArmyDiscs.Select(d => new SightDisc(d.Centre, d.Radius)),
    ];

    /// <summary>
    /// Whether <paramref name="hex"/> is ground the owner sees now, for the part of the visible area that needs no stored history
    /// (<c>docs/design/map-fog-v2.md</c> §1g): inside one of the current explored discs, or within
    /// <see cref="FogVisionRadii.SourceMistOpaqueMargin"/> (straight-line) of a current settlement or tower explored ring, or within
    /// <see cref="FogVisionRadii.ArmyMistOpaqueMargin"/> of a live army's vision radius, where the fog is not yet fully opaque.
    /// Stored explored ground without a current source has no ramp and gets no such widening.
    /// </summary>
    public bool IsVisibleNow(HexCoord hex)
    {
        if (InCurrentDiscs(hex))
        {
            return true;
        }

        foreach (var source in VisionSources)
        {
            if (HexCoord.EuclideanDistance(source.Coord, hex)
                <= source.ExploredRadius + FogVisionRadii.SourceMistOpaqueMargin + FogVisionRadii.ReachEpsilon)
            {
                return true;
            }
        }

        foreach (var army in LiveArmyDiscs)
        {
            if (HexCoord.EuclideanDistance(army.Centre, hex)
                <= army.Radius + FogVisionRadii.ArmyMistOpaqueMargin + FogVisionRadii.ReachEpsilon)
            {
                return true;
            }
        }

        return false;
    }

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
/// <c>GET /settlements/{id}/view</c>, <c>GET /worlds/{worldId}/settlements</c>
/// and the world's rival walls and buildings (a rival's building hex is delivered when it lies in the visible area, §1g:
/// <see cref="ExploredAreaService.VisibleAmongAsync"/>; its towers and Longhouse when any hex of their claim disc does) — shares this
/// one computation of "which hexes has this owner explored"
/// rather than reimplementing it, which would both duplicate the ring/tower/
/// army-vision logic and risk the readings of "explored" drifting apart.
/// </summary>
/// <remarks>
/// <para>
/// Explored ground is the owner's persisted history — sparse 64 x 64-texel
/// chunks (<see cref="PlayerExploredChunkEntity"/>, <see cref="PersistedExploredBitset"/>),
/// one row per touched chunk, a fully explored chunk stored as a flag — OR
/// the discs they explore from right now (settlement and tower rings,
/// in-transit armies at <see cref="FogVisionRadii.ArmyVisionRadius"/>).
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

        var world = await _dbContext.Worlds
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.Id == worldId, cancellationToken).ConfigureAwait(false);

        if (world is null)
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

        // Row timestamps below are bookkeeping and stay wall time; army movement times are game time.
        var now = _timeProvider.GetUtcNow();
        var gameNow = world.ToClock().ToGameTime(now);
        var sources = new List<FogVisionSource>();
        var discs = new List<ExploredDisc>();
        var ravensBySettlement = new Dictionary<Guid, int>();

        // A tower that is cut off from every longhouse of the player's realm on its island (ConnectedRealm) sees nothing: only
        // connected towers add vision and explored rings, the way only they claim ground.
        var realms = PlayerRealms.Resolve(settlements.Select(s => new PlayerRealms.Row(
            s.Id, s.UserId, s.OwnerId, s.IslandId, new HexCoord(s.CentreQ, s.CentreR),
            [.. s.Buildings.Select(b => new PlacedBuilding(new HexCoord(b.Q, b.R), b.Type, b.Level))])));
        foreach (var settlement in settlements)
        {
            var domain = settlement.ToDomain();
            var level = domain.LonghouseLevel;
            // Odin's Ravens: extra rings on the claim's own disc and on every tower's.
            var ravens = domain.VisionBonusRings;
            ravensBySettlement[settlement.Id] = ravens;
            var centre = new HexCoord(settlement.CentreQ, settlement.CentreR);
            // A settlement whose Longhouse is destroyed sees nothing around its centre (no source, no explored disc).
            if (FogVisionRadii.ToVisionSource(centre, level, ravens) is { } centreSource)
            {
                sources.Add(centreSource);
                discs.Add(new ExploredDisc(centre, centreSource.ExploredRadius));
            }

            foreach (var tower in settlement.Buildings.Where(b => b.Type == BuildingType.Tower))
            {
                var towerCoord = new HexCoord(tower.Q, tower.R);
                if (!realms[settlement.Id].IsTowerConnected(settlement.Id, towerCoord))
                {
                    continue;
                }

                sources.Add(FogVisionRadii.ToTowerVisionSource(towerCoord, tower.Level, ravens));
                discs.Add(new ExploredDisc(towerCoord, FogVisionRadii.TowerExploredRadius(tower.Level) + ravens));
            }
        }

        // Every hex an army has crossed on its active leg counts, not only the one it stands on: a poll that comes
        // late (server restart, closed browser) must not leave gaps in the trail. Hexes are deduped per radius, so
        // overlapping armies of one realm cost one disc per hex.
        var armyHexes = new HashSet<(HexCoord Hex, int Radius)>();
        var liveArmyDiscs = new List<ExploredDisc>();
        foreach (var armyEntity in travellingArmies)
        {
            var home = new HexCoord(armyEntity.Settlement!.CentreQ, armyEntity.Settlement.CentreR);
            // The army's origin settlement's Ravens widen its walked-ground reveal too.
            var domainArmy = armyEntity.ToDomain();
            var armyRadius = FogVisionRadii.ArmyVisionRadius(domainArmy.Stacks, ravensBySettlement.GetValueOrDefault(armyEntity.SettlementId));
            var reached = domainArmy.HexesReachedBy(home, gameNow);
            foreach (var hex in reached)
            {
                armyHexes.Add((hex, armyRadius));
            }

            // The last hex reached is where the army stands now: what it sees right now.
            liveArmyDiscs.Add(new ExploredDisc(reached[^1], armyRadius));
        }

        discs.AddRange(armyHexes.Select(h => new ExploredDisc(h.Hex, h.Radius)));

        var merged = persist
            ? await MergeAndSaveAsync(worldId, ownerId, discs, now, cancellationToken).ConfigureAwait(false)
            : new Dictionary<FogChunkCoord, ExploredChunkData>();

        return new ExploredArea(worldId, ownerId, world.Radius, settlements, sources, discs, liveArmyDiscs, merged);
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

        explored.UnionWith(await StoredExploredAmongAsync(area, remaining, cancellationToken).ConfigureAwait(false));
        return explored;
    }

    /// <summary>
    /// Which of <paramref name="candidates"/> lie in the owner's visible area (<c>docs/design/map-fog-v2.md</c> §1g): their stored
    /// explored ground plus what they see now, widened to where the fog is not yet fully opaque (<see cref="ExploredArea.IsVisibleNow"/>).
    /// The gate for another realm's buildings. One stored-chunk read covers every candidate the current sources do not answer.
    /// </summary>
    public async Task<HashSet<HexCoord>> VisibleAmongAsync(
        ExploredArea area, IEnumerable<HexCoord> candidates, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(area);
        ArgumentNullException.ThrowIfNull(candidates);

        var visible = new HashSet<HexCoord>();
        var remaining = new HashSet<HexCoord>();
        foreach (var hex in candidates)
        {
            if (area.IsVisibleNow(hex))
            {
                visible.Add(hex);
            }
            else
            {
                remaining.Add(hex);
            }
        }

        visible.UnionWith(await StoredExploredAmongAsync(area, remaining, cancellationToken).ConfigureAwait(false));
        return visible;
    }

    /// <summary>
    /// For each group of hexes (in the order given), the first one in the owner's visible area (see <see cref="VisibleAmongAsync"/>),
    /// or <see langword="null"/> when none is. Walks each group only up to its first visible hex, answers from the current sources
    /// first and reads the stored chunks once for everything left, so a whole realm's claim discs cost one query.
    /// </summary>
    public async Task<HexCoord?[]> FirstVisibleAmongAsync(
        ExploredArea area, IReadOnlyList<IReadOnlyList<HexCoord>> orderedGroups, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(area);
        ArgumentNullException.ThrowIfNull(orderedGroups);

        var first = new HexCoord?[orderedGroups.Count];
        var pending = new List<int>();
        for (var i = 0; i < orderedGroups.Count; i++)
        {
            foreach (var hex in orderedGroups[i])
            {
                if (area.IsVisibleNow(hex))
                {
                    first[i] = hex;
                    break;
                }
            }

            if (first[i] is null)
            {
                pending.Add(i);
            }
        }

        if (pending.Count == 0)
        {
            return first;
        }

        // Only a group with no hex visible by current sources reaches here, so none of these hexes is answered by them. One read of the
        // stored chunks any of them touches; a group none of whose chunks the owner has a row for is skipped without walking its hexes.
        var chunksOf = pending.ToDictionary(i => i, i => orderedGroups[i].Select(FogChunkLayout.ChunkOf).Distinct().ToList());
        var rows = await LoadChunkRowsAsync(
            area.WorldId, area.OwnerId, chunksOf.Values.SelectMany(c => c), tracked: false, cancellationToken).ConfigureAwait(false);
        var data = rows.ToDictionary(r => r.Key, r => ToData(r.Value));
        foreach (var i in pending)
        {
            if (!chunksOf[i].Any(data.ContainsKey))
            {
                continue;
            }

            foreach (var hex in orderedGroups[i])
            {
                var chunk = FogChunkLayout.ChunkOf(hex);
                if (data.TryGetValue(chunk, out var chunkData) && PersistedExploredBitset.Contains(chunk, chunkData, hex))
                {
                    first[i] = hex;
                    break;
                }
            }
        }

        return first;
    }

    /// <summary>The candidates that lie in the owner's stored explored chunks; the current sources are the caller's business.</summary>
    private async Task<HashSet<HexCoord>> StoredExploredAmongAsync(
        ExploredArea area, HashSet<HexCoord> remaining, CancellationToken cancellationToken)
    {
        var explored = new HashSet<HexCoord>();
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
    /// The ids of the world's islands the owner has "seen": an island counts when the owner has explored anything in
    /// at least one fog chunk its land touches (<see cref="IslandEntity.FogChunks"/>) — a chunk-level check, deliberately
    /// imprecise. A chunk counts when one of the current discs reaches into it or when the owner's persisted history has
    /// any explored texel there. <paramref name="alsoSeenIslandId"/> is counted as seen without any exploring (the island
    /// of a pre-founding plot suggestion). The cost scales with the islands' chunk lists and the discs, never the world.
    /// </summary>
    public async Task<HashSet<Guid>> SeenIslandIdsAsync(
        ExploredArea area, Guid? alsoSeenIslandId = null, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(area);

        var islands = await _dbContext.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == area.WorldId)
            .Select(i => new { i.Id, i.FogChunks })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var seen = new HashSet<Guid>();
        if (alsoSeenIslandId is { } pinned)
        {
            seen.Add(pinned);
        }

        var discChunks = FogChunkLayout.ChunksOf(area.Discs.SelectMany(d => d.Centre.WithinRadius(d.Radius))).ToHashSet();
        var remaining = new List<(Guid Id, List<FogChunkCoord> Chunks)>();
        foreach (var island in islands)
        {
            if (seen.Contains(island.Id))
            {
                continue;
            }

            if (island.FogChunks.Any(discChunks.Contains))
            {
                seen.Add(island.Id);
            }
            else if (island.FogChunks.Count > 0)
            {
                remaining.Add((island.Id, island.FogChunks));
            }
        }

        if (remaining.Count == 0)
        {
            return seen;
        }

        var rows = await LoadChunkRowsAsync(
            area.WorldId, area.OwnerId, remaining.SelectMany(r => r.Chunks), tracked: false, cancellationToken)
            .ConfigureAwait(false);
        var exploredChunks = rows
            .Where(r => r.Value.IsFull || (r.Value.Bits is not null && r.Value.Bits.Any(b => b != 0)))
            .Select(r => r.Key)
            .ToHashSet();

        foreach (var (id, chunks) in remaining)
        {
            if (chunks.Any(exploredChunks.Contains))
            {
                seen.Add(id);
            }
        }

        return seen;
    }

    /// <summary>
    /// ORs <paramref name="discs"/> into the owner's stored chunks and saves what grew (see <see cref="StageDiscsAsync"/>).
    /// Returns the post-merge state of every touched chunk.
    /// </summary>
    public Task<Dictionary<FogChunkCoord, ExploredChunkData>> MergeDiscsAsync(
        Guid worldId, string ownerId, IReadOnlyList<ExploredDisc> discs, CancellationToken cancellationToken = default)
        => MergeAndSaveAsync(worldId, ownerId, discs, _timeProvider.GetUtcNow(), cancellationToken);

    /// <summary>
    /// Like <see cref="MergeDiscsAsync"/> but only tracks the grown or new chunk rows on the context — the caller's own
    /// <c>SaveChanges</c> (inside its unit of work) persists them together with its other changes. A concurrent first insert
    /// of the same chunk then surfaces as a unique violation that <see cref="ConcurrentWriteExecutor"/> retries.
    /// </summary>
    public async Task<Dictionary<FogChunkCoord, ExploredChunkData>> StageDiscsAsync(
        Guid worldId, string ownerId, IReadOnlyList<ExploredDisc> discs, CancellationToken cancellationToken = default)
        => (await StageAsync(worldId, ownerId, discs, _timeProvider.GetUtcNow(), cancellationToken).ConfigureAwait(false)).Merged;

    /// <summary>
    /// Stages the ground every given army walked on the legs it finished (<see cref="ArmyEntity.WalkedLegs"/>, filled by
    /// <see cref="ArmyEntity.ApplyDomain"/> and <see cref="ArmyEntity.RecordWalkedToEnd"/>) as explored, at the army vision
    /// radius incl. its origin settlement's Ravens, and clears the lists. Call it right before the save that persists those armies.
    /// </summary>
    public async Task StageWalkedLegsAsync(IEnumerable<ArmyEntity> armies, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(armies);

        var walking = armies.Where(a => a.WalkedLegs.Count > 0).ToList();
        if (walking.Count == 0)
        {
            return;
        }

        var settlementIds = walking.Select(a => a.SettlementId).Distinct().ToList();
        var settlements = await _dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.Buildings)
            .Where(s => settlementIds.Contains(s.Id))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var byOwner = new Dictionary<(Guid WorldId, string OwnerId), HashSet<(HexCoord Hex, int Radius)>>();
        foreach (var army in walking)
        {
            var settlement = settlements.FirstOrDefault(s => s.Id == army.SettlementId);
            if (settlement is not null)
            {
                var radius = FogVisionRadii.ArmyVisionRadius(
                    army.Stacks.Select(s => new UnitStack(s.UnitType, s.Count)), settlement.ToDomain().VisionBonusRings);
                var key = (settlement.WorldId, settlement.OwnerId);
                if (!byOwner.TryGetValue(key, out var hexes))
                {
                    byOwner[key] = hexes = [];
                }

                foreach (var hex in army.WalkedLegs.SelectMany(l => l.Hexes))
                {
                    hexes.Add((hex, radius));
                }
            }

            army.WalkedLegs.Clear();
        }

        foreach (var ((worldId, ownerId), hexes) in byOwner)
        {
            await StageDiscsAsync(worldId, ownerId, [.. hexes.Select(h => new ExploredDisc(h.Hex, h.Radius))], cancellationToken)
                .ConfigureAwait(false);
        }
    }

    private async Task<Dictionary<FogChunkCoord, ExploredChunkData>> MergeAndSaveAsync(
        Guid worldId,
        string ownerId,
        IReadOnlyList<ExploredDisc> discs,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var (merged, inserting) = await StageAsync(worldId, ownerId, discs, now, cancellationToken).ConfigureAwait(false);

        if (!_dbContext.ChangeTracker.HasChanges())
        {
            return merged;
        }

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException ex) when (inserting && !_dbContext.UnitOfWorkActive
            && (ConcurrentWriteExecutor.IsExploredChunkInsertRace(ex) || !ConcurrentWriteExecutor.IsRetryable(ex)))
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

    /// <summary>ORs the discs' hexes into the tracked chunk rows (adding rows where there are none); nothing is saved.</summary>
    private async Task<(Dictionary<FogChunkCoord, ExploredChunkData> Merged, bool Inserting)> StageAsync(
        Guid worldId,
        string ownerId,
        IReadOnlyList<ExploredDisc> discs,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var merged = new Dictionary<FogChunkCoord, ExploredChunkData>();
        if (discs.Count == 0)
        {
            return (merged, false);
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

        return (merged, inserting);
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
