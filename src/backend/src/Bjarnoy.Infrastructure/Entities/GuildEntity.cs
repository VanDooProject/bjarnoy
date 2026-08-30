using Bjarnoy.Domain.Guilds;

namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// A guild (alliance): a world-scoped group of players sharing a message
/// board and diplomacy, gated by a recurring fee. See
/// docs/design/guild-alliance-system.md for the full design and what is
/// deliberately deferred past this v1 slice.
/// </summary>
public class GuildEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid WorldId { get; set; }

    public WorldEntity? World { get; set; }

    public required string Name { get; set; }

    public required string Tag { get; set; }

    public string? Description { get; set; }

    /// <summary>Drives the member cap contribution, the peace treaty cap, and <see cref="GuildRules.Perks"/>.</summary>
    public GuildFeeTier FeeTier { get; set; } = GuildFeeTier.Copper;

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>
    /// Soft-delete: a disbanded guild's rows (memberships already removed,
    /// board and treaty history) stay queryable rather than being deleted, but
    /// it no longer accepts joins, posts or treaty proposals.
    /// </summary>
    public DateTimeOffset? DisbandedAt { get; set; }

    public List<GuildMembershipEntity> Memberships { get; set; } = [];

    public List<GuildBoardTopicEntity> Topics { get; set; } = [];
}

/// <summary>
/// A player's current standing in a guild. Removed outright on leave/kick
/// rather than soft-left — v1 keeps no membership history (no rejoin
/// cooldowns, no audit log; see docs/design/guild-alliance-system.md).
/// </summary>
public class GuildMembershipEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid GuildId { get; set; }

    public GuildEntity? Guild { get; set; }

    public Guid UserId { get; set; }

    public UserEntity? User { get; set; }

    /// <summary>Exactly one member of a guild holds <see cref="GuildRole.Leader"/> at a time.</summary>
    public GuildRole Role { get; set; } = GuildRole.Member;

    public DateTimeOffset JoinedAt { get; set; }

    /// <summary>
    /// Null until the member's first fee payment; the member is overdue
    /// whenever this is in the past. Paying deducts <see cref="GuildRules.FeeCost"/>
    /// from the member's settlement in the guild's world and extends this by
    /// <see cref="GuildRules.FeePeriod"/> — see <c>GuildService.PayFeeAsync</c>.
    /// A guild is never auto-purged for an overdue member in v1; that is a
    /// deliberate deferral, see the design doc.
    /// </summary>
    public DateTimeOffset? FeePaidThroughAt { get; set; }
}

/// <summary>A guild message board topic. Its first reply carries the opening message.</summary>
public class GuildBoardTopicEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid GuildId { get; set; }

    public GuildEntity? Guild { get; set; }

    public Guid AuthorUserId { get; set; }

    public required string Title { get; set; }

    public GuildBoardTopicKind Kind { get; set; } = GuildBoardTopicKind.Discussion;

    public bool Pinned { get; set; }

    public bool Locked { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public List<GuildBoardPostEntity> Posts { get; set; } = [];
}

/// <summary>A reply within a guild board topic (the topic's first post is its opening message).</summary>
public class GuildBoardPostEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid TopicId { get; set; }

    public GuildBoardTopicEntity? Topic { get; set; }

    public Guid AuthorUserId { get; set; }

    public required string Body { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>
/// A proposed or active non-aggression pact between two guilds. Purely
/// informational in v1 — there is no combat system yet for it to gate (see
/// docs/design/guild-alliance-system.md).
/// </summary>
public class GuildPeaceTreatyEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid ProposerGuildId { get; set; }

    public GuildEntity? ProposerGuild { get; set; }

    public Guid TargetGuildId { get; set; }

    public GuildEntity? TargetGuild { get; set; }

    public Guid ProposedByUserId { get; set; }

    public PeaceTreatyStatus Status { get; set; } = PeaceTreatyStatus.Proposed;

    public DateTimeOffset ProposedAt { get; set; }

    public DateTimeOffset? RespondedAt { get; set; }

    public Guid? RespondedByUserId { get; set; }
}
