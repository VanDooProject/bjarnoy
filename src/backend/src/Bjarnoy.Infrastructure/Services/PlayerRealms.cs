using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Loads and groups the settlements the chain rule resolves together (<see cref="ConnectedRealm"/>): all of one
/// player's settlements on one island. Every place that derives a claim or vision from towers goes through here so
/// they all agree.
/// </summary>
public static class PlayerRealms
{
    /// <summary>One settlement row as the grouping needs it.</summary>
    public readonly record struct Row(
        Guid Id, Guid UserId, string OwnerId, Guid IslandId, HexCoord Centre, IReadOnlyList<PlacedBuilding> Buildings);

    /// <summary>
    /// Who a settlement belongs to for the chain rule: its account, or, for anonymous play (all owned by the shared
    /// <see cref="SystemUserIds.Abandoned"/> user), its client-local owner id.
    /// </summary>
    public static string PlayerKey(Guid userId, string ownerId) =>
        userId == SystemUserIds.Abandoned ? "owner:" + ownerId : "user:" + userId;

    /// <summary>Resolves every settlement of <paramref name="rows"/> against its own player-and-island group.</summary>
    public static IReadOnlyDictionary<Guid, ConnectedRealm> Resolve(IEnumerable<Row> rows) =>
        ConnectedRealm.ResolveGroups(rows.Select(r =>
            ((PlayerKey(r.UserId, r.OwnerId), r.IslandId), new RealmSettlement(r.Id, r.Centre, r.Buildings))));

    /// <summary>Every settlement of the world, resolved.</summary>
    public static async Task<IReadOnlyDictionary<Guid, ConnectedRealm>> ForWorldAsync(
        GameDbContext dbContext, Guid worldId, CancellationToken cancellationToken)
    {
        var rows = await dbContext.Settlements
            .AsNoTracking()
            .Where(s => s.WorldId == worldId)
            .Select(s => new
            {
                s.Id,
                s.UserId,
                s.OwnerId,
                s.IslandId,
                s.CentreQ,
                s.CentreR,
                Buildings = s.Buildings.Select(b => new { b.Q, b.R, b.Type, b.Level }).ToList(),
            })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return Resolve(rows.Select(r => new Row(
            r.Id, r.UserId, r.OwnerId, r.IslandId, new HexCoord(r.CentreQ, r.CentreR),
            [.. r.Buildings.Select(b => new PlacedBuilding(new HexCoord(b.Q, b.R), b.Type, b.Level))])));
    }

    /// <summary>
    /// The settlements of <paramref name="worldId"/> that have a realm step due at <paramref name="now"/> (<see cref="RealmDecay.StepFor"/>:
    /// a building that left the realm, one the realm reaches again, one with a level to lose): one pass over the world's buildings,
    /// so the periodic sweep only loads the settlements it has to change.
    /// </summary>
    public static async Task<IReadOnlyList<Guid>> DueForRealmStepAsync(
        GameDbContext dbContext, Guid worldId, IGiantIndex giants, DateTimeOffset now, double speedFactor, CancellationToken cancellationToken)
    {
        var rows = await dbContext.Settlements
            .AsNoTracking()
            .Where(s => s.WorldId == worldId)
            .Select(s => new
            {
                s.Id,
                s.UserId,
                s.OwnerId,
                s.IslandId,
                s.CentreQ,
                s.CentreR,
                Buildings = s.Buildings.Select(b => new { b.Q, b.R, b.Type, b.Level, b.OutsideRealmSince }).ToList(),
            })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var settlements = rows.Select(r => new Row(
            r.Id, r.UserId, r.OwnerId, r.IslandId, new HexCoord(r.CentreQ, r.CentreR),
            [.. r.Buildings.Select(b => new PlacedBuilding(new HexCoord(b.Q, b.R), b.Type, b.Level, b.OutsideRealmSince))])).ToList();
        var realms = Resolve(settlements);

        return
        [
            .. settlements
                .Where(s => s.Buildings.Any(b => RealmDecay.StepFor(b, realms[s.Id], giants, now, speedFactor).IsDue))
                .Select(s => s.Id),
        ];
    }

    /// <summary>
    /// The realm <paramref name="settled"/> belongs to: its own current state (<paramref name="settled"/>, which may be newer
    /// than the stored row) together with the same player's other settlements on the island.
    /// </summary>
    public static async Task<ConnectedRealm> ForSettlementAsync(
        GameDbContext dbContext, SettlementEntity entity, Settlement settled, CancellationToken cancellationToken)
    {
        var siblings = await SiblingsAsync(dbContext, entity, cancellationToken).ConfigureAwait(false);
        return ConnectedRealm.Resolve([settled.AsRealmSettlement(), .. siblings]);
    }

    /// <summary>
    /// The realm of the stored settlement <paramref name="settlementId"/>, or null when it does not exist.
    /// </summary>
    public static async Task<ConnectedRealm?> ForStoredSettlementAsync(
        GameDbContext dbContext, Guid settlementId, CancellationToken cancellationToken)
    {
        var entity = await dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.Buildings)
            .FirstOrDefaultAsync(s => s.Id == settlementId, cancellationToken).ConfigureAwait(false);
        if (entity is null)
        {
            return null;
        }

        var self = new RealmSettlement(
            entity.Id,
            new HexCoord(entity.CentreQ, entity.CentreR),
            [.. entity.Buildings.Select(b => new PlacedBuilding(new HexCoord(b.Q, b.R), b.Type, b.Level))]);
        var siblings = await SiblingsAsync(dbContext, entity, cancellationToken).ConfigureAwait(false);
        return ConnectedRealm.Resolve([self, .. siblings]);
    }

    /// <summary>
    /// Every settlement of the player <paramref name="entity"/> belongs to on its island (itself included): the set the chain
    /// rule resolves together and the linked realms (<see cref="LinkedGroups"/>) are formed from. <paramref name="tracked"/>
    /// loads the rows into the change tracker (a write path) instead of read-only.
    /// </summary>
    public static IQueryable<SettlementEntity> PlayerIslandSet(GameDbContext dbContext, SettlementEntity entity, bool tracked)
    {
        var worldId = entity.WorldId;
        var islandId = entity.IslandId;
        var userId = entity.UserId;
        var ownerId = entity.OwnerId;
        var anonymous = userId == SystemUserIds.Abandoned;
        var query = dbContext.Settlements
            .Where(s => s.WorldId == worldId && s.IslandId == islandId
                && (anonymous ? s.UserId == userId && s.OwnerId == ownerId : s.UserId == userId));
        return tracked ? query : query.AsNoTracking();
    }

    /// <summary>Read-only <see cref="PlayerIslandSet"/>.</summary>
    public static IQueryable<SettlementEntity> GroupOf(GameDbContext dbContext, SettlementEntity entity) =>
        PlayerIslandSet(dbContext, entity, tracked: false);

    /// <summary>The same player's other settlements on <paramref name="entity"/>'s island, as stored.</summary>
    public static async Task<IReadOnlyList<RealmSettlement>> SiblingsAsync(
        GameDbContext dbContext, SettlementEntity entity, CancellationToken cancellationToken)
    {
        var rows = await GroupOf(dbContext, entity)
            .Where(s => s.Id != entity.Id)
            .Select(s => new
            {
                s.Id,
                s.CentreQ,
                s.CentreR,
                Buildings = s.Buildings.Select(b => new { b.Q, b.R, b.Type, b.Level }).ToList(),
            })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return
        [
            .. rows.Select(r => new RealmSettlement(
                r.Id,
                new HexCoord(r.CentreQ, r.CentreR),
                [.. r.Buildings.Select(b => new PlacedBuilding(new HexCoord(b.Q, b.R), b.Type, b.Level))])),
        ];
    }
}
