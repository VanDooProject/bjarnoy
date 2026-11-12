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
    /// Every bridge hex of <paramref name="worldId"/> with the levels it stands at over time (<see cref="TimedBridge"/>), the one read of the
    /// world's bridges that route planning (<see cref="IndexAsync"/>) uses:
    /// <list type="bullet">
    /// <item>a placed bridge at its stored level since always (a foundation, level 0, does not open the river);</item>
    /// <item>every build or raze order with a completion instant changes the level from that instant, whether or not its owner's settlement
    /// was settled since (the order is applied lazily, the bridge opens or closes for every army from then): a build order to its target
    /// level, a raze to its target level (0: gone; a raze never raises, as <c>Settlement.SettleTo</c>). An order still to complete is in the
    /// list too, with its future instant, so a caller filters by the time it asks about. A bridge of a level that matters for routing
    /// (<see cref="BridgeIndex.CrossingCost"/> differs by level) is read at the level the finished order reaches.</item>
    /// </list>
    /// A world with no bridge returns an empty list.
    /// </summary>
    public static async Task<IReadOnlyList<TimedBridge>> TimelineAsync(GameDbContext db, Guid worldId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(db);
        var rows = await db.PlacedBuildings
            .AsNoTracking()
            .Where(b => b.Settlement!.WorldId == worldId && b.Type == BuildingType.Bridge)
            .Select(b => new { b.Q, b.R, b.Level, b.SettlementId, b.Settlement!.UserId, OutsideRealm = b.OutsideRealmSince != null })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var orders = await db.BuildOrders
            .AsNoTracking()
            .Where(o => o.Settlement!.WorldId == worldId && o.Type == BuildingType.Bridge && o.CompletesAt != null)
            .Select(o => new { o.Q, o.R, o.Kind, o.TargetLevel, o.SettlementId, o.Settlement!.UserId, o.CompletesAt })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var rowAt = rows.ToDictionary(r => new HexCoord(r.Q, r.R));
        var ordersAt = orders.GroupBy(o => new HexCoord(o.Q, o.R)).ToDictionary(g => g.Key, g => g.OrderBy(o => o.CompletesAt).ToList());
        var timeline = new List<TimedBridge>();
        foreach (var coord in rowAt.Keys.Union(ordersAt.Keys))
        {
            rowAt.TryGetValue(coord, out var row);
            ordersAt.TryGetValue(coord, out var hexOrders);
            var level = row?.Level ?? 0;
            List<BridgeStage> stages = [new(DateTimeOffset.MinValue, level)];
            foreach (var order in hexOrders ?? [])
            {
                // As Settlement.SettleTo applies it: a build sets the level, a raze lowers it (never raises) and to 0 takes the bridge down.
                level = order.Kind == BuildOrderKind.Raze ? (order.TargetLevel >= 1 ? Math.Min(level, order.TargetLevel) : 0) : order.TargetLevel;
                stages.Add(new BridgeStage(order.CompletesAt!.Value, level));
            }

            if (stages.All(s => s.Level < 1))
            {
                continue;
            }

            var owner = row is not null
                ? WorldPalisades.OwnerKeyOf(row.UserId, row.SettlementId)
                : WorldPalisades.OwnerKeyOf(hexOrders![0].UserId, hexOrders[0].SettlementId);
            timeline.Add(new TimedBridge(coord, owner, row?.OutsideRealm ?? false, stages));
        }

        return timeline;
    }

    /// <summary>
    /// Every bridge of <paramref name="worldId"/> standing at <paramref name="now"/> (level 1 or more; a foundation does not open the river)
    /// as a <see cref="BridgeIndex"/> (<see cref="TimelineAsync"/>) — one read per request at each call site that builds a land route. A
    /// bridge whose build order completed by <paramref name="now"/> counts even when its owner's settlement was not settled since, one whose
    /// raze order completed does not. Who a guarded (level 4) bridge also opens for is <see cref="WorldPalisades.FriendsAsync"/>'s rule, the
    /// palisade gates'.
    /// </summary>
    public static async Task<BridgeIndex> IndexAsync(
        GameDbContext db, Guid worldId, Func<HexCoord, Terrain> terrainAt, DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var timeline = await TimelineAsync(db, worldId, cancellationToken).ConfigureAwait(false);
        return await IndexAtAsync(db, worldId, timeline, now, terrainAt, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>The bridges of <paramref name="timeline"/> standing at <paramref name="at"/> as a <see cref="BridgeIndex"/>, with the world's friendships for its guarded ones.</summary>
    public static async Task<BridgeIndex> IndexAtAsync(
        GameDbContext db, Guid worldId, IReadOnlyList<TimedBridge> timeline, DateTimeOffset at, Func<HexCoord, Terrain> terrainAt,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(timeline);
        var standing = timeline.Select(b => b.StandingAt(at)).OfType<StandingBridge>().ToList();

        // Only a guarded bridge cares who the friends are, so a world without one skips the guild queries.
        var areFriends = standing.Any(b => b.Level >= BridgeIndex.GuardedLevel)
            ? await WorldPalisades.FriendsAsync(db, worldId, cancellationToken).ConfigureAwait(false)
            : null;

        return new BridgeIndex(standing, terrainAt, areFriends);
    }

    /// <summary>
    /// The palisades and bridges (those standing at <paramref name="now"/>, see <see cref="WorldPalisades.IndexAsync"/> and <see cref="IndexAsync"/>) of <paramref name="worldId"/> together, the one lookup each call site that builds a land route asks for
    /// and binds to the army's owner with <see cref="LandRouteIndex.ForOwner"/>.
    /// </summary>
    public static async Task<LandRouteIndex> RouteIndexAsync(
        GameDbContext db, Guid worldId, Func<HexCoord, Terrain> terrainAt, Func<HexCoord, bool> isWideRiver, DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        var walls = await WorldPalisades.IndexAsync(db, worldId, terrainAt, isWideRiver, now, cancellationToken).ConfigureAwait(false);
        var bridges = await IndexAsync(db, worldId, terrainAt, now, cancellationToken).ConfigureAwait(false);
        return new LandRouteIndex(walls, bridges);
    }
}
