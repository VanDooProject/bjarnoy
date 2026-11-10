using Bjarnoy.Domain.Guilds;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>How two accounts of one world stand towards each other through their guilds.</summary>
public enum GuildRelation
{
    /// <summary>Not in the same guild and no active peace treaty between their guilds (or one of them is in no guild).</summary>
    None,

    /// <summary>Members of the same guild.</summary>
    SameGuild,

    /// <summary>Members of two guilds that have an active peace treaty.</summary>
    Treaty,
}

/// <summary>The one place that decides guild friendship: gates, bridges and the world map's realm colours all read it.</summary>
public static class GuildRelations
{
    /// <summary>Loads a world's guild memberships and active peace treaties (two queries) into a lookup of two user ids.</summary>
    public static async Task<Func<Guid, Guid, GuildRelation>> LoadAsync(GameDbContext db, Guid worldId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(db);
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
        return (a, b) =>
        {
            if (!guildOf.TryGetValue(a, out var ga) || !guildOf.TryGetValue(b, out var gb)) return GuildRelation.None;
            if (ga == gb) return GuildRelation.SameGuild;
            return atPeace.Contains((ga, gb)) ? GuildRelation.Treaty : GuildRelation.None;
        };
    }
}
