using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>The bridges that open a world's wide rivers to a land army's pathfinding, read from the world's placed buildings.</summary>
public static class WorldBridges
{
    /// <summary>
    /// Every standing bridge (level 1 or more; a foundation does not open the river) of <paramref name="worldId"/> as a
    /// <see cref="BridgeIndex"/> — one query per request at each call site that builds a land route. Who a guarded (level 4) bridge also
    /// opens for is <see cref="WorldPalisades.FriendsAsync"/>'s rule, the palisade gates'.
    /// </summary>
    public static async Task<BridgeIndex> IndexAsync(
        GameDbContext db, Guid worldId, Func<HexCoord, Terrain> terrainAt, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(db);
        var rows = await db.PlacedBuildings
            .AsNoTracking()
            .Where(b => b.Settlement!.WorldId == worldId && b.Type == BuildingType.Bridge && b.Level >= 1)
            .Select(b => new { b.Q, b.R, b.Level, b.SettlementId, b.Settlement!.UserId })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        // Only a guarded bridge cares who the friends are, so a world without one skips the guild queries.
        var areFriends = rows.Any(r => r.Level >= BridgeIndex.GuardedLevel)
            ? await WorldPalisades.FriendsAsync(db, worldId, cancellationToken).ConfigureAwait(false)
            : null;

        return new BridgeIndex(
            rows.Select(r => new StandingBridge(new HexCoord(r.Q, r.R), r.Level, WorldPalisades.OwnerKeyOf(r.UserId, r.SettlementId))),
            terrainAt,
            areFriends);
    }

    /// <summary>
    /// The palisades and bridges of <paramref name="worldId"/> together, the one lookup each call site that builds a land route asks for
    /// and binds to the army's owner with <see cref="LandRouteIndex.ForOwner"/>.
    /// </summary>
    public static async Task<LandRouteIndex> RouteIndexAsync(
        GameDbContext db, Guid worldId, Func<HexCoord, Terrain> terrainAt, Func<HexCoord, bool> isWideRiver,
        CancellationToken cancellationToken = default)
    {
        var walls = await WorldPalisades.IndexAsync(db, worldId, terrainAt, isWideRiver, cancellationToken).ConfigureAwait(false);
        var bridges = await IndexAsync(db, worldId, terrainAt, cancellationToken).ConfigureAwait(false);
        return new LandRouteIndex(walls, bridges);
    }
}
