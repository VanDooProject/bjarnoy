using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>A wildlife camp of a world with its stored (or pristine) state.</summary>
/// <param name="Camp">Family, rolled level and hex, from the island's <c>Camps</c> column.</param>
/// <param name="IslandId">The island the camp was generated on.</param>
/// <param name="State">The camp's <c>camp_states</c> row, or <see cref="CampState.Pristine"/> when it has none.</param>
public sealed record WorldCamp(Camp Camp, Guid IslandId, CampState State);

/// <summary>
/// Reads and writes wildlife camp state (<c>docs/design/wildlife-camps.md</c>, "State and API"): which camps a world
/// has, their lazily settled garrisons, and the realm/building facts the camp rules need. Every question
/// about a camp is a pure function in the domain (<see cref="CampState"/>); this only loads the inputs.
/// </summary>
public sealed class CampService(GameDbContext dbContext)
{
    private readonly GameDbContext _dbContext = dbContext;

    /// <summary>
    /// Every camp of <paramref name="worldId"/> (optionally one island's), joined with its state row.
    /// <paramref name="now"/> only dates the pristine state of a camp without a row; <paramref name="includeWasted"/>
    /// false leaves out the camps of wasted islands.
    /// </summary>
    public async Task<IReadOnlyList<WorldCamp>> LoadCampsAsync(
        Guid worldId,
        DateTimeOffset now,
        Guid? islandId = null,
        bool includeWasted = true,
        CancellationToken cancellationToken = default)
    {
        var islands = await _dbContext.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId && (islandId == null || i.Id == islandId) && (includeWasted || !i.IsWasted))
            .Select(i => new { i.Id, i.Camps })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var states = await _dbContext.CampStates
            .AsNoTracking()
            .Where(s => s.WorldId == worldId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        var stateByHex = states.ToDictionary(s => new HexCoord(s.Q, s.R), s => s.ToDomain());

        return
        [
            .. islands.SelectMany(i => i.Camps.Select(c =>
            {
                var camp = new Camp(new HexCoord(c.Q, c.R), c.Family, c.Level, (TileOrientation)c.Orientation);
                return new WorldCamp(
                    camp, i.Id, stateByHex.TryGetValue(camp.Coord, out var state) ? state : CampState.Pristine(camp, now));
            })),
        ];
    }

    /// <summary>The camp standing on <paramref name="coord"/> in <paramref name="worldId"/> with its state, or null when there is none.</summary>
    public async Task<WorldCamp?> FindCampAsync(
        Guid worldId, HexCoord coord, DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var camps = await LoadCampsAsync(worldId, now, cancellationToken: cancellationToken).ConfigureAwait(false);
        return camps.FirstOrDefault(c => c.Camp.Coord == coord);
    }

    /// <summary>
    /// The world's realms and buildings (<see cref="RealmIndex"/>), built from every settlement's centre and
    /// standing buildings.
    /// </summary>
    public async Task<RealmIndex> LoadRealmAsync(Guid worldId, CancellationToken cancellationToken = default)
    {
        var settlements = await _dbContext.Settlements
            .AsNoTracking()
            .Where(s => s.WorldId == worldId)
            .Select(s => new
            {
                s.CentreQ,
                s.CentreR,
                Buildings = s.Buildings.Select(b => new { b.Q, b.R, b.Type, b.Level }).ToList(),
            })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var realm = new RealmIndex();
        foreach (var settlement in settlements)
        {
            realm.Add(
                new HexCoord(settlement.CentreQ, settlement.CentreR),
                [.. settlement.Buildings.Select(b => new PlacedBuilding(new HexCoord(b.Q, b.R), b.Type, b.Level))]);
        }

        return realm;
    }

    /// <summary>
    /// The camps that block building at <paramref name="now"/> (<see cref="CampIndex.Blocking"/>): guarded camps and
    /// Fenrir's brood. A cleared camp's hex is buildable.
    /// </summary>
    public async Task<ICampIndex> LoadBlockingIndexAsync(
        Guid worldId, DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var camps = await LoadCampsAsync(worldId, now, cancellationToken: cancellationToken).ConfigureAwait(false);
        if (camps.Count == 0)
        {
            return CampIndex.Empty;
        }

        var realm = await LoadRealmAsync(worldId, cancellationToken).ConfigureAwait(false);
        return CampIndex.Blocking(camps.Select(c => (c.Camp, c.State)), now, realm.InsideRealm);
    }

    /// <summary>
    /// Stores <paramref name="state"/> as the camp's row (insert or update); the caller saves changes, so the
    /// write commits together with whatever else the fight changed.
    /// </summary>
    public async Task UpsertStateAsync(
        Guid worldId, HexCoord coord, CampState state, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(state);

        var existing = await _dbContext.CampStates
            .FindAsync([worldId, coord.Q, coord.R], cancellationToken).ConfigureAwait(false);
        if (existing is null)
        {
            _dbContext.CampStates.Add(CampStateEntity.FromDomain(worldId, coord, state));
        }
        else
        {
            existing.ApplyDomain(state);
        }
    }
}
