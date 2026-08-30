namespace Bjarnoy.Domain.Guilds;

/// <summary>
/// A guild's recurring fee tier. Drives its member cap contribution, its peace
/// treaty cap, and the forward-looking perks in <see cref="GuildRules.Perks"/>.
/// </summary>
public enum GuildFeeTier
{
    Copper = 0,
    Silver = 1,
    Gold = 2,
}

/// <summary>A member's standing within a guild. Exactly one member holds <see cref="Leader"/> at a time.</summary>
public enum GuildRole
{
    Leader = 0,
    Officer = 1,
    Member = 2,
}

/// <summary>
/// What a board topic is about. <see cref="Report"/> is the forward-looking
/// hook for game event reports (battle reports, etc.) — that feature does not
/// exist yet (see docs/design/guild-alliance-system.md), so a report topic
/// today is just a normal topic flagged this way for the client to render
/// distinctly and for a future reports feature to slot posts into.
/// </summary>
public enum GuildBoardTopicKind
{
    Discussion = 0,
    Announcement = 1,
    Report = 2,
}

/// <summary>Lifecycle of a peace treaty between two guilds.</summary>
public enum PeaceTreatyStatus
{
    Proposed = 0,
    Active = 1,
    Rejected = 2,
    Withdrawn = 3,
    Broken = 4,
}

public static class GuildEnumExtensions
{
    public static string ToWireName(this GuildFeeTier tier) => tier switch
    {
        GuildFeeTier.Copper => "copper",
        GuildFeeTier.Silver => "silver",
        GuildFeeTier.Gold => "gold",
        _ => throw new ArgumentOutOfRangeException(nameof(tier), tier, "Unknown fee tier"),
    };

    public static string ToWireName(this GuildRole role) => role switch
    {
        GuildRole.Leader => "leader",
        GuildRole.Officer => "officer",
        GuildRole.Member => "member",
        _ => throw new ArgumentOutOfRangeException(nameof(role), role, "Unknown guild role"),
    };

    public static string ToWireName(this GuildBoardTopicKind kind) => kind switch
    {
        GuildBoardTopicKind.Discussion => "discussion",
        GuildBoardTopicKind.Announcement => "announcement",
        GuildBoardTopicKind.Report => "report",
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Unknown board topic kind"),
    };

    public static string ToWireName(this PeaceTreatyStatus status) => status switch
    {
        PeaceTreatyStatus.Proposed => "proposed",
        PeaceTreatyStatus.Active => "active",
        PeaceTreatyStatus.Rejected => "rejected",
        PeaceTreatyStatus.Withdrawn => "withdrawn",
        PeaceTreatyStatus.Broken => "broken",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, "Unknown treaty status"),
    };
}
