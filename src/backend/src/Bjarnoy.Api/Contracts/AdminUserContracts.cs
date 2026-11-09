using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;

namespace Bjarnoy.Api.Contracts;

public sealed record AdminUserResponse(
    Guid Id,
    string UserName,
    string? DisplayName,
    string Role,
    string Status,
    string? StatusReason,
    DateTimeOffset? StatusChangedAt,
    int SettlementCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt,
    bool IsPremium)
{
    public static AdminUserResponse From(UserEntity user, int settlementCount)
    {
        ArgumentNullException.ThrowIfNull(user);

        return new AdminUserResponse(
            user.Id,
            user.UserName,
            user.DisplayName,
            user.Role.ToString().ToLowerInvariant(),
            user.Status.ToString().ToLowerInvariant(),
            user.StatusReason,
            user.StatusChangedAt,
            settlementCount,
            user.CreatedAt,
            user.LastLoginAt,
            user.IsPremium);
    }
}

public sealed record AdminUserSettlementSummary(Guid Id, Guid WorldId, string WorldName, string Name)
{
    public static AdminUserSettlementSummary From(SettlementEntity settlement)
    {
        ArgumentNullException.ThrowIfNull(settlement);
        ArgumentNullException.ThrowIfNull(settlement.World);

        return new AdminUserSettlementSummary(settlement.Id, settlement.WorldId, settlement.World.Name, settlement.Name);
    }
}

public sealed record AdminUserDetailResponse(
    Guid Id,
    string UserName,
    string? DisplayName,
    string Role,
    string Status,
    string? StatusReason,
    DateTimeOffset? StatusChangedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt,
    IReadOnlyList<AdminUserSettlementSummary> Settlements)
{
    public static AdminUserDetailResponse From(UserEntity user, IReadOnlyList<SettlementEntity> settlements)
    {
        ArgumentNullException.ThrowIfNull(user);
        ArgumentNullException.ThrowIfNull(settlements);

        return new AdminUserDetailResponse(
            user.Id,
            user.UserName,
            user.DisplayName,
            user.Role.ToString().ToLowerInvariant(),
            user.Status.ToString().ToLowerInvariant(),
            user.StatusReason,
            user.StatusChangedAt,
            user.CreatedAt,
            user.LastLoginAt,
            [.. settlements.Select(AdminUserSettlementSummary.From)]);
    }
}

/// <summary>One autocomplete hit of <c>GET /admin/users/lookup</c>: the account, and how it was found (<c>user</c>, <c>settlement</c> or <c>jarl</c>).</summary>
public sealed record AdminUserLookupResponse(
    Guid UserId,
    string UserName,
    string? DisplayName,
    string Role,
    string Status,
    string Via,
    string? MatchedName,
    string? WorldName)
{
    public static AdminUserLookupResponse From(UserLookupMatch match)
    {
        ArgumentNullException.ThrowIfNull(match);

        return new AdminUserLookupResponse(
            match.User.Id,
            match.User.UserName,
            match.User.DisplayName,
            match.User.Role.ToString().ToLowerInvariant(),
            match.User.Status.ToString().ToLowerInvariant(),
            match.Via.ToString().ToLowerInvariant(),
            match.MatchedName,
            match.WorldName);
    }
}

public sealed record PagedAdminUsersResponse(
    IReadOnlyList<AdminUserResponse> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <param name="DisplayName">Omit to leave unchanged.</param>
/// <param name="Role">Omit to leave unchanged. One of <c>player</c>, <c>admin</c>.</param>
public sealed record UpdateAdminUserRequest(string? DisplayName = null, string? Role = null);

/// <param name="Status">One of <c>active</c>, <c>locked</c>, <c>banned</c>.</param>
/// <param name="Reason">Stored on the user for moderators; optional.</param>
public sealed record SetUserStatusRequest(string Status, string? Reason = null);

/// <param name="IsPremium">Grants premium (true) or revokes it (false).</param>
public sealed record SetUserPremiumRequest(bool IsPremium);
