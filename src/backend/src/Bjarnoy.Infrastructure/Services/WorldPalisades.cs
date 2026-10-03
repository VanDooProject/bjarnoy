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
    /// Every standing wall hex (level 1 or more; a foundation does not block) of <paramref name="worldId"/> as a <see cref="PalisadeIndex"/>
    /// — one query per request at each call site that builds a land route, like <see cref="WorldRivers.IndexAsync"/>. A world with no
    /// wall costs two small queries. The standing Utgard wall hexes of the world's wasted islands (<c>islands.UtgardWalls</c>, level 1 or
    /// more) are in it too, owned by <see cref="EndgameRules.JotnarOwnerKey"/>.
    /// </summary>
    public static async Task<PalisadeIndex> IndexAsync(
        GameDbContext db, Guid worldId, Func<HexCoord, Terrain> terrainAt, Func<HexCoord, bool> isWideRiver,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(db);
        var rows = await db.PlacedBuildings
            .AsNoTracking()
            .Where(b => b.Settlement!.WorldId == worldId
                && (b.Type == BuildingType.Palisade || b.Type == BuildingType.PalisadeGate)
                && b.Level >= 1)
            .Select(b => new { b.Q, b.R, b.Type, b.SettlementId, b.Settlement!.UserId })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        // Only a gate cares who the friends are, so a world without one skips the guild queries.
        var areFriends = rows.Any(r => r.Type == BuildingType.PalisadeGate)
            ? await FriendsAsync(db, worldId, cancellationToken).ConfigureAwait(false)
            : null;

        // The jötnar's Utgard walls (wasted islands, level 1 or more; a breached level-0 hex is passable) block like any wall. Their key
        // belongs to no account or guild, so a jötnar gate is never friendly to a player.
        var utgardWalls = await db.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId && i.IsWasted)
            .Select(i => i.UtgardWalls)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return new PalisadeIndex(
            rows.Select(r => new StandingWall(
                new HexCoord(r.Q, r.R), r.Type == BuildingType.PalisadeGate, OwnerKeyOf(r.UserId, r.SettlementId)))
            .Concat(utgardWalls.SelectMany(walls => walls)
                .Where(w => w.Level >= 1)
                .Select(w => new StandingWall(new HexCoord(w.Q, w.R), w.IsGate, EndgameRules.JotnarOwnerKey))),
            terrainAt,
            isWideRiver,
            areFriends);
    }

    /// <summary>
    /// Who a gate also opens for besides its owner: two accounts are friends when they are in the same guild or in guilds with an active
    /// peace treaty. An anonymous settlement's key (the settlement itself) is in no guild and so nobody's friend.
    /// </summary>
    private static async Task<Func<Guid, Guid, bool>> FriendsAsync(GameDbContext db, Guid worldId, CancellationToken cancellationToken)
    {
        var memberships = await db.GuildMemberships
            .AsNoTracking()
            .Where(m => m.Guild!.WorldId == worldId && m.Guild.DisbandedAt == null)
            .Select(m => new { m.UserId, m.GuildId })
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        var treaties = await db.GuildPeaceTreaties
            .AsNoTracking()
            .Where(t => t.Status == PeaceTreatyStatus.Active && t.ProposerGuild!.WorldId == worldId)
            .Select(t => new { t.ProposerGuildId, t.TargetGuildId })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var guildOf = memberships.ToDictionary(m => m.UserId, m => m.GuildId);
        var atPeace = treaties.SelectMany(t => new[] { (t.ProposerGuildId, t.TargetGuildId), (t.TargetGuildId, t.ProposerGuildId) }).ToHashSet();
        return (a, b) => guildOf.TryGetValue(a, out var ga) && guildOf.TryGetValue(b, out var gb) && (ga == gb || atPeace.Contains((ga, gb)));
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
