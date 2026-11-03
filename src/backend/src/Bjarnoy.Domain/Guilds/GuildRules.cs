using Bjarnoy.Domain.Buildings;

namespace Bjarnoy.Domain.Guilds;

/// <summary>
/// The pure rules a guild's membership implies: how many members it may hold
/// and how many peace pacts it may keep active. Every guild has the same caps.
/// </summary>
public static class GuildRules
{
    /// <summary>Member cap before any longhouse bonus.</summary>
    public const int MemberCapBase = 10;

    /// <summary>
    /// A guild may hold at most this many active members: a fixed base
    /// plus half of the highest longhouse level among its current members'
    /// settlements — the only anchor building today
    /// (<see cref="BuildingType.Longhouse"/>). If a dedicated civic
    /// building (a "Chieftain's Hall") takes over this role later, read its
    /// level through a single indirection instead of inlining
    /// <c>Settlement.LonghouseLevel</c> at every call site, so the swap is a
    /// one-line change rather than a schema migration.
    /// </summary>
    public static int MemberCap(int highestLonghouseLevel) =>
        MemberCapBase + (Math.Max(highestLonghouseLevel, 0) / 2);

    /// <summary>
    /// Active peace treaties a guild may hold at once. Both a pending proposal
    /// and an accepted pact count against this — see
    /// <c>GuildService.ActiveTreatyCountAsync</c> — so a guild cannot dodge the
    /// cap by leaving proposals open.
    /// </summary>
    public const int MaxActivePeaceTreaties = 1;
}
