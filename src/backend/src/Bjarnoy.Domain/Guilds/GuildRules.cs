using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;

namespace Bjarnoy.Domain.Guilds;

/// <summary>
/// Perks a guild's fee tier unlocks for future trade and army systems to read.
/// </summary>
/// <remarks>
/// A forward-looking hook, not an integration: neither a trade/market system
/// nor an army/unit system exists in this repo yet (prototypes/MECHANICS.md
/// only has raids and a garrison as ideas). This type exists so those systems
/// can later read <c>GuildService.GetPerksAsync</c> and apply the numbers
/// themselves; nothing in the guild module ever calls outward to consume them.
/// </remarks>
public readonly record struct GuildPerks(double TradeCapacityBonus, bool AllowUnitSupport);

/// <summary>
/// The pure rules a guild's fee tier and membership imply: how many members it
/// may hold, how many peace pacts it may keep active, what the recurring fee
/// costs, and what perks the tier unlocks.
/// </summary>
public static class GuildRules
{
    /// <summary>How long a paid fee covers before a member is overdue again.</summary>
    public static readonly TimeSpan FeePeriod = TimeSpan.FromHours(24);

    /// <summary>Member cap contributed by the fee tier alone, before any longhouse bonus.</summary>
    public static int MemberCapBase(GuildFeeTier tier) => tier switch
    {
        GuildFeeTier.Copper => 10,
        GuildFeeTier.Silver => 20,
        GuildFeeTier.Gold => 30,
        _ => throw new ArgumentOutOfRangeException(nameof(tier), tier, "Unknown fee tier"),
    };

    /// <summary>
    /// A guild may hold at most this many active members: a tier-driven base
    /// plus half of the highest longhouse level among its current members'
    /// settlements — the only anchor building today
    /// (<see cref="BuildingType.Longhouse"/>). If a dedicated civic
    /// building (a "Chieftain's Hall") takes over this role later, read its
    /// level through a single indirection instead of inlining
    /// <c>Settlement.LonghouseLevel</c> at every call site, so the swap is a
    /// one-line change rather than a schema migration.
    /// </summary>
    public static int MemberCap(GuildFeeTier tier, int highestLonghouseLevel) =>
        MemberCapBase(tier) + (Math.Max(highestLonghouseLevel, 0) / 2);

    /// <summary>
    /// Active peace treaties a guild may hold at once. Both a pending proposal
    /// and an accepted pact count against this — see
    /// <c>GuildService.ActiveTreatyCountAsync</c> — so a guild cannot dodge the
    /// cap by leaving proposals open.
    /// </summary>
    public static int MaxActivePeaceTreaties(GuildFeeTier tier) => tier switch
    {
        GuildFeeTier.Copper => 1,
        GuildFeeTier.Silver => 3,
        GuildFeeTier.Gold => 6,
        _ => throw new ArgumentOutOfRangeException(nameof(tier), tier, "Unknown fee tier"),
    };

    /// <summary>The recurring per-member fee for a tier, in all four resources.</summary>
    public static ResourceAmounts FeeCost(GuildFeeTier tier) => tier switch
    {
        GuildFeeTier.Copper => ResourceAmounts.Uniform(50),
        GuildFeeTier.Silver => ResourceAmounts.Uniform(200),
        GuildFeeTier.Gold => ResourceAmounts.Uniform(600),
        _ => throw new ArgumentOutOfRangeException(nameof(tier), tier, "Unknown fee tier"),
    };

    public static GuildPerks Perks(GuildFeeTier tier) => tier switch
    {
        GuildFeeTier.Copper => new GuildPerks(TradeCapacityBonus: 0.0, AllowUnitSupport: false),
        GuildFeeTier.Silver => new GuildPerks(TradeCapacityBonus: 0.10, AllowUnitSupport: false),
        GuildFeeTier.Gold => new GuildPerks(TradeCapacityBonus: 0.25, AllowUnitSupport: true),
        _ => throw new ArgumentOutOfRangeException(nameof(tier), tier, "Unknown fee tier"),
    };
}
