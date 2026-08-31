using System.ComponentModel.DataAnnotations;
using Bjarnoy.Domain.Guilds;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;

namespace Bjarnoy.Api.Contracts;

public sealed record CreateGuildRequest(
    [property: Required, MinLength(3), MaxLength(50)] string Name,
    [property: Required, MinLength(2), MaxLength(5)] string Tag,
    [property: MaxLength(500)] string? Description);

public sealed record SetGuildFeeTierRequest([property: Required] string FeeTier);

public sealed record SetGuildMemberRoleRequest([property: Required] string Role);

public sealed record CreateGuildTopicRequest(
    [property: Required, MinLength(1), MaxLength(120)] string Title,
    [property: Required] string Kind,
    [property: Required, MinLength(1), MaxLength(4000)] string Body);

public sealed record CreateGuildPostRequest(
    [property: Required, MinLength(1), MaxLength(4000)] string Body);

public sealed record ProposeTreatyRequest([property: Required] Guid TargetGuildId);

public sealed record GuildMemberResponse(Guid UserId, string Role, DateTimeOffset JoinedAt, bool FeeOverdue)
{
    public static GuildMemberResponse From(GuildMembershipEntity membership, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(membership);

        return new GuildMemberResponse(
            membership.UserId,
            membership.Role.ToWireName(),
            membership.JoinedAt,
            membership.FeePaidThroughAt is null || membership.FeePaidThroughAt < now);
    }
}

public sealed record GuildPerksResponse(double TradeCapacityBonus, bool AllowUnitSupport, int MemberCap, int MaxActivePeaceTreaties)
{
    public static GuildPerksResponse From(GuildPerksSummary summary)
    {
        ArgumentNullException.ThrowIfNull(summary);

        return new GuildPerksResponse(
            summary.Perks.TradeCapacityBonus,
            summary.Perks.AllowUnitSupport,
            summary.MemberCap,
            summary.MaxActivePeaceTreaties);
    }
}

public sealed record GuildResponse(
    Guid Id,
    Guid WorldId,
    string Name,
    string Tag,
    string? Description,
    string FeeTier,
    int MemberCount,
    DateTimeOffset CreatedAt,
    IReadOnlyList<GuildMemberResponse> Members)
{
    public static GuildResponse From(GuildEntity guild, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(guild);

        return new GuildResponse(
            guild.Id,
            guild.WorldId,
            guild.Name,
            guild.Tag,
            guild.Description,
            guild.FeeTier.ToWireName(),
            guild.Memberships.Count,
            guild.CreatedAt,
            [.. guild.Memberships.Select(m => GuildMemberResponse.From(m, now))]);
    }
}

public sealed record GuildBoardPostResponse(Guid Id, Guid AuthorUserId, string Body, DateTimeOffset CreatedAt)
{
    public static GuildBoardPostResponse From(GuildBoardPostEntity post)
    {
        ArgumentNullException.ThrowIfNull(post);
        return new GuildBoardPostResponse(post.Id, post.AuthorUserId, post.Body, post.CreatedAt);
    }
}

public sealed record GuildBoardTopicResponse(
    Guid Id,
    Guid GuildId,
    Guid AuthorUserId,
    string Title,
    string Kind,
    bool Pinned,
    bool Locked,
    DateTimeOffset CreatedAt,
    IReadOnlyList<GuildBoardPostResponse> Posts)
{
    public static GuildBoardTopicResponse From(GuildBoardTopicEntity topic)
    {
        ArgumentNullException.ThrowIfNull(topic);

        return new GuildBoardTopicResponse(
            topic.Id,
            topic.GuildId,
            topic.AuthorUserId,
            topic.Title,
            topic.Kind.ToWireName(),
            topic.Pinned,
            topic.Locked,
            topic.CreatedAt,
            [.. topic.Posts.Select(GuildBoardPostResponse.From)]);
    }
}

public sealed record GuildTreatyResponse(
    Guid Id,
    Guid ProposerGuildId,
    Guid TargetGuildId,
    string Status,
    DateTimeOffset ProposedAt,
    DateTimeOffset? RespondedAt)
{
    public static GuildTreatyResponse From(GuildPeaceTreatyEntity treaty)
    {
        ArgumentNullException.ThrowIfNull(treaty);

        return new GuildTreatyResponse(
            treaty.Id,
            treaty.ProposerGuildId,
            treaty.TargetGuildId,
            treaty.Status.ToWireName(),
            treaty.ProposedAt,
            treaty.RespondedAt);
    }
}
