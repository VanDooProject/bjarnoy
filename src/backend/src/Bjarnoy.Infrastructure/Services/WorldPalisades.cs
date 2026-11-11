using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Guilds;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Palisades;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>The palisade hexes a land army's pathfinding and a new wall's placement rules need, read from the world's placed buildings.</summary>
public static class WorldPalisades
{
    /// <summary>
    /// The key two armies share when they have the same owner: the owning account, or the settlement itself for an anonymous one (every
    /// anonymous settlement is owned by the one shared <see cref="SystemUserIds.Abandoned"/> user, which must not make them allies).
    /// </summary>
    public static Guid OwnerKeyOf(Guid userId, Guid settlementId) =>
        userId == SystemUserIds.Abandoned ? settlementId : userId;

    /// <summary>
    /// Every wall hex of <paramref name="worldId"/> with the instant it stands from (<see cref="TimedWall.StandingFrom"/>), the one read of the
    /// world's walls that route planning (<see cref="IndexAsync"/>) and the re-routing of armies already marching (<c>ArmyService</c>) share:
    /// <list type="bullet">
    /// <item>a standing palisade or gate (level 1 or more) from its <see cref="PlacedBuildingEntity.StandingSince"/>, or since always when
    /// that was not recorded;</item>
    /// <item>a build order that raises a palisade or gate to a standing wall (or turns one kind into the other) from its
    /// <see cref="BuildOrderEntity.CompletesAt"/>, whether or not its owner's settlement was settled since (the order's completion is
    /// applied lazily, but the wall stands for every army from then); an order still to complete is in the list too, with its future
    /// instant, so a caller filters by the time it asks about;</item>
    /// <item>the standing Utgard wall hexes of the world's wasted islands (<c>islands.UtgardWalls</c>, level 1 or more; a breached
    /// level-0 hex is passable) since always, owned by <see cref="EndgameRules.JotnarOwnerKey"/>.</item>
    /// </list>
    /// Three small queries; a world with no wall returns an empty list.
    /// </summary>
    public static async Task<IReadOnlyList<TimedWall>> TimelineAsync(GameDbContext db, Guid worldId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(db);
        var rows = await db.PlacedBuildings
            .AsNoTracking()
            .Where(b => b.Settlement!.WorldId == worldId
                && (b.Type == BuildingType.Palisade || b.Type == BuildingType.PalisadeGate))
            .Select(b => new { b.Q, b.R, b.Type, b.Level, b.SettlementId, b.Settlement!.UserId, OutsideRealm = b.OutsideRealmSince != null, b.StandingSince })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var orders = await db.BuildOrders
            .AsNoTracking()
            .Where(o => o.Settlement!.WorldId == worldId
                && (o.Type == BuildingType.Palisade || o.Type == BuildingType.PalisadeGate)
                && o.Kind == BuildOrderKind.Build
                && o.TargetLevel >= 1
                && o.CompletesAt != null)
            .Select(o => new { o.Q, o.R, o.Type, o.SettlementId, o.Settlement!.UserId, o.CompletesAt })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var utgardWalls = await db.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId && i.IsWasted)
            .Select(i => i.UtgardWalls)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var walls = new Dictionary<HexCoord, TimedWall>();
        var outsideRealm = rows.Where(r => r.OutsideRealm).Select(r => new HexCoord(r.Q, r.R)).ToHashSet();
        foreach (var row in rows.Where(r => r.Level >= 1))
        {
            var coord = new HexCoord(row.Q, row.R);
            walls[coord] = new TimedWall(
                new StandingWall(coord, row.Type == BuildingType.PalisadeGate, OwnerKeyOf(row.UserId, row.SettlementId), row.OutsideRealm),
                row.StandingSince ?? DateTimeOffset.MinValue);
        }

        // An order on a hex that already stands as the same kind of wall is an upgrade and changes nothing for an army.
        foreach (var order in orders.OrderBy(o => o.CompletesAt))
        {
            var coord = new HexCoord(order.Q, order.R);
            var isGate = order.Type == BuildingType.PalisadeGate;
            if (walls.TryGetValue(coord, out var standing) && standing.Wall.IsGate == isGate)
            {
                continue;
            }

            walls[coord] = new TimedWall(
                new StandingWall(coord, isGate, OwnerKeyOf(order.UserId, order.SettlementId), outsideRealm.Contains(coord)),
                order.CompletesAt!.Value);
        }

        foreach (var wall in utgardWalls.SelectMany(w => w).Where(w => w.Level >= 1))
        {
            var coord = new HexCoord(wall.Q, wall.R);
            walls.TryAdd(coord, new TimedWall(new StandingWall(coord, wall.IsGate, EndgameRules.JotnarOwnerKey), DateTimeOffset.MinValue));
        }

        return [.. walls.Values];
    }

    /// <summary>
    /// Every wall hex of <paramref name="worldId"/> standing at <paramref name="now"/> (<see cref="TimelineAsync"/>) as a <see cref="PalisadeIndex"/>
    /// — one read per request at each call site that builds a land route, like <see cref="WorldRivers.IndexAsync"/>. A wall whose build order
    /// completed by <paramref name="now"/> counts even when its owner's settlement was not settled since.
    /// </summary>
    public static async Task<PalisadeIndex> IndexAsync(
        GameDbContext db, Guid worldId, Func<HexCoord, Terrain> terrainAt, Func<HexCoord, bool> isWideRiver, DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        var timeline = await TimelineAsync(db, worldId, cancellationToken).ConfigureAwait(false);
        return await IndexAtAsync(db, worldId, timeline, now, terrainAt, isWideRiver, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>The walls of <paramref name="timeline"/> standing at <paramref name="at"/> as a <see cref="PalisadeIndex"/>, with the world's friendships for its gates.</summary>
    public static async Task<PalisadeIndex> IndexAtAsync(
        GameDbContext db, Guid worldId, IReadOnlyList<TimedWall> timeline, DateTimeOffset at, Func<HexCoord, Terrain> terrainAt,
        Func<HexCoord, bool> isWideRiver, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(timeline);
        var standing = timeline.Where(w => w.StandingFrom <= at).Select(w => w.Wall).ToList();

        // Only a gate cares who the friends are, so a world without one skips the guild queries.
        var areFriends = standing.Any(w => w.IsGate)
            ? await FriendsAsync(db, worldId, cancellationToken).ConfigureAwait(false)
            : null;

        return new PalisadeIndex(standing, terrainAt, isWideRiver, areFriends);
    }

    /// <summary>
    /// Who a gate (or a guarded bridge) also opens for besides its owner: two accounts are friends when they are in the same guild or in guilds with an active
    /// peace treaty. An anonymous settlement's key (the settlement itself) is in no guild and so nobody's friend.
    /// </summary>
    internal static async Task<Func<Guid, Guid, bool>> FriendsAsync(GameDbContext db, Guid worldId, CancellationToken cancellationToken)
    {
        var relationOf = await GuildRelations.LoadAsync(db, worldId, cancellationToken).ConfigureAwait(false);
        return (a, b) => relationOf(a, b) != GuildRelation.None;
    }

    /// <summary>
    /// The wall hexes on and around <paramref name="coord"/> (a foundation included: it is already a hex the wall's pieces are drawn
    /// against) for <c>Settlement.PlanBuild</c>'s placement rules, of any settlement in the world.
    /// </summary>
    public static async Task<PalisadeLayout> NearAsync(
        GameDbContext db, Guid worldId, HexCoord coord, Func<HexCoord, Terrain> terrainAt,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(db);
        int q = coord.Q, r = coord.R;
        var rows = await db.PlacedBuildings
            .AsNoTracking()
            .Where(b => b.Settlement!.WorldId == worldId
                && (b.Type == BuildingType.Palisade || b.Type == BuildingType.PalisadeGate)
                && b.Q >= q - 1 && b.Q <= q + 1 && b.R >= r - 1 && b.R <= r + 1)
            .Select(b => new { b.Q, b.R, b.Type })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var walls = rows.Select(x => new HexCoord(x.Q, x.R)).ToHashSet();
        var gates = rows.Where(x => x.Type == BuildingType.PalisadeGate).Select(x => new HexCoord(x.Q, x.R)).ToHashSet();
        return new PalisadeLayout(walls, gates, terrainAt);
    }
}
