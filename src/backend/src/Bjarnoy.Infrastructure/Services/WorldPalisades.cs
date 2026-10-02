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
    /// wall costs one empty query.
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

        return new PalisadeIndex(
            rows.Select(r => new StandingWall(
                new HexCoord(r.Q, r.R), r.Type == BuildingType.PalisadeGate, OwnerKeyOf(r.UserId, r.SettlementId))),
            terrainAt,
            isWideRiver,
            areFriends);
    }

    /// <summary>One standing wall hex with its settlement's identity and centre, for <see cref="ListStandingAsync"/>.</summary>
    public sealed record StandingWallRow(
        int Q, int R, BuildingType Type, int Level, Guid SettlementId, Guid UserId, string OwnerId, int CentreQ, int CentreR);

    /// <summary>Every standing wall hex (level 1 or more) of <paramref name="worldId"/> with who owns it, for the world-wide walls read.</summary>
    public static async Task<IReadOnlyList<StandingWallRow>> ListStandingAsync(
        GameDbContext db, Guid worldId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(db);
        return await db.PlacedBuildings
            .AsNoTracking()
            .Where(b => b.Settlement!.WorldId == worldId
                && (b.Type == BuildingType.Palisade || b.Type == BuildingType.PalisadeGate)
                && b.Level >= 1)
            .OrderBy(b => b.SettlementId).ThenBy(b => b.Q).ThenBy(b => b.R)
            .Select(b => new StandingWallRow(
                b.Q, b.R, b.Type, b.Level, b.SettlementId, b.Settlement!.UserId, b.Settlement.OwnerId,
                b.Settlement.CentreQ, b.Settlement.CentreR))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Who a gate also opens for besides its owner: two accounts are friends when they are in the same guild or in guilds with an active
    /// peace treaty. An anonymous settlement's key (the settlement itself) is in no guild and so nobody's friend.
    /// </summary>
    public static async Task<Func<Guid, Guid, bool>> FriendsAsync(GameDbContext db, Guid worldId, CancellationToken cancellationToken)
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
