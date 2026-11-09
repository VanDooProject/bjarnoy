using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

public enum UserEditOutcome
{
    Success,
    NotFound,

    /// <summary>The edit would demote the last remaining Admin.</summary>
    WouldRemoveLastAdmin,
}

public enum UserStatusChangeOutcome
{
    Success,
    NotFound,

    /// <summary>An admin tried to lock or ban their own account.</summary>
    CannotActOnSelf,
}

public sealed record UsersPage(
    IReadOnlyList<UserEntity> Users, IReadOnlyDictionary<Guid, int> SettlementCounts, int TotalCount);

/// <summary>How a <see cref="UserService.LookupAsync"/> hit was found; the order is the ranking.</summary>
public enum UserLookupVia
{
    User = 0,
    Settlement = 1,
    Jarl = 2,
}

public sealed record UserLookupMatch(UserEntity User, UserLookupVia Via, string? MatchedName, string? WorldName);

public sealed record UserDetail(UserEntity User, IReadOnlyList<SettlementEntity> Settlements);

/// <summary>
/// Admin-facing user management (issue #29): list/search/filter, edit, and
/// lock/ban a <see cref="UserEntity"/>. The status enforcement itself (login
/// refused when banned, mutating game actions refused when locked) already
/// lands in #26 (<see cref="AuthService"/>, <c>ActiveUserEndpointFilter</c>);
/// this service is only the admin-facing control over it.
/// </summary>
public sealed class UserService(GameDbContext dbContext, TimeProvider timeProvider)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;

    public async Task<UsersPage> GetUsersAsync(
        string? search,
        UserStatus? status,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var query = _dbContext.Users.AsNoTracking().Where(u => !u.IsSystem);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(u =>
                u.NormalizedUserName.Contains(term)
                || (u.DisplayName != null && u.DisplayName.ToLower().Contains(term)));
        }

        if (status is { } statusFilter)
        {
            query = query.Where(u => u.Status == statusFilter);
        }

        var totalCount = await query.CountAsync(cancellationToken).ConfigureAwait(false);

        // Guid v7 sorts time-ordered, so this is a stable creation-order
        // paging key on both providers — see WorldService for the same
        // convention (SQLite cannot order by DateTimeOffset).
        var users = await query
            .OrderBy(u => u.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var ids = users.Select(u => u.Id).ToList();
        var counts = await _dbContext.Settlements
            .Where(s => ids.Contains(s.UserId))
            .GroupBy(s => s.UserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count, cancellationToken)
            .ConfigureAwait(false);

        return new UsersPage(users, counts, totalCount);
    }

    /// <summary>
    /// Autocomplete for "pick an account": matches the user name and display name, and also the name and jarl
    /// (<see cref="SettlementEntity.OwnerName"/>) of settlements, resolving those to the owning account.
    /// One row per user, best match first (user, then settlement, then jarl). Needs at least two characters.
    /// </summary>
    public async Task<IReadOnlyList<UserLookupMatch>> LookupAsync(
        string? query, int limit, CancellationToken cancellationToken = default)
    {
        var term = query?.Trim().ToLowerInvariant();
        if (term is null || term.Length < 2 || limit < 1)
        {
            return [];
        }

        var matches = new Dictionary<Guid, UserLookupMatch>();

        var byUser = await _dbContext.Users.AsNoTracking()
            .Where(u => !u.IsSystem
                && (u.NormalizedUserName.Contains(term)
                    || (u.DisplayName != null && u.DisplayName.ToLower().Contains(term))))
            .OrderBy(u => u.Id)
            .Take(limit)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        foreach (var user in byUser)
        {
            matches[user.Id] = new UserLookupMatch(user, UserLookupVia.User, null, null);
        }

        var bySettlement = await _dbContext.Settlements.AsNoTracking()
            .Include(s => s.World)
            .Include(s => s.Owner)
            .Where(s => !s.Owner!.IsSystem
                && (s.Name.ToLower().Contains(term) || s.OwnerName.ToLower().Contains(term)))
            .OrderBy(s => s.Id)
            .Take(limit * 3)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        foreach (var settlement in bySettlement)
        {
            if (matches.Count >= limit)
            {
                break;
            }

            var via = settlement.Name.Contains(term, StringComparison.OrdinalIgnoreCase)
                ? UserLookupVia.Settlement
                : UserLookupVia.Jarl;
            var label = via == UserLookupVia.Settlement ? settlement.Name : settlement.OwnerName;
            if (!matches.TryGetValue(settlement.UserId, out var existing))
            {
                matches[settlement.UserId] = new UserLookupMatch(settlement.Owner!, via, label, settlement.World?.Name);
            }
            else if (existing.Via == UserLookupVia.Jarl && via == UserLookupVia.Settlement)
            {
                matches[settlement.UserId] = existing with { Via = via, MatchedName = label, WorldName = settlement.World?.Name };
            }
        }

        return [.. matches.Values.OrderBy(m => m.Via).Take(limit)];
    }

    public async Task<UserDetail?> GetUserDetailAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var user = await _dbContext.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == id && !u.IsSystem, cancellationToken)
            .ConfigureAwait(false);

        if (user is null)
        {
            return null;
        }

        var settlements = await _dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.World)
            .Where(s => s.UserId == id)
            .OrderBy(s => s.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new UserDetail(user, settlements);
    }

    public Task<int> GetSettlementCountAsync(Guid userId, CancellationToken cancellationToken = default) =>
        _dbContext.Settlements.CountAsync(s => s.UserId == userId, cancellationToken);

    public async Task<(UserEditOutcome Outcome, UserEntity? User)> UpdateUserAsync(
        Guid id, string? displayName, UserRole? role, CancellationToken cancellationToken = default)
    {
        var user = await _dbContext.Users
            .FirstOrDefaultAsync(u => u.Id == id && !u.IsSystem, cancellationToken)
            .ConfigureAwait(false);

        if (user is null)
        {
            return (UserEditOutcome.NotFound, null);
        }

        if (role is { } newRole && newRole != UserRole.Admin && user.Role == UserRole.Admin)
        {
            var otherAdmins = await _dbContext.Users
                .CountAsync(u => u.Role == UserRole.Admin && u.Id != id, cancellationToken)
                .ConfigureAwait(false);

            if (otherAdmins == 0)
            {
                return (UserEditOutcome.WouldRemoveLastAdmin, null);
            }
        }

        if (displayName is not null)
        {
            user.DisplayName = displayName;
        }

        if (role is { } roleToSet)
        {
            user.Role = roleToSet;
        }

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return (UserEditOutcome.Success, user);
    }

    /// <param name="actingUserId">
    /// The admin making the call, from their own token — an admin cannot lock
    /// or ban their own account this way, so they can't lock themselves out
    /// by mistake.
    /// </param>
    public async Task<(UserStatusChangeOutcome Outcome, UserEntity? User)> SetStatusAsync(
        Guid id, UserStatus status, string? reason, Guid actingUserId, CancellationToken cancellationToken = default)
    {
        if (id == actingUserId && status != UserStatus.Active)
        {
            return (UserStatusChangeOutcome.CannotActOnSelf, null);
        }

        var user = await _dbContext.Users
            .FirstOrDefaultAsync(u => u.Id == id && !u.IsSystem, cancellationToken)
            .ConfigureAwait(false);

        if (user is null)
        {
            return (UserStatusChangeOutcome.NotFound, null);
        }

        user.Status = status;
        user.StatusReason = reason;
        user.StatusChangedAt = _timeProvider.GetUtcNow();

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return (UserStatusChangeOutcome.Success, user);
    }

    /// <summary>
    /// Grants or revokes premium (issue #40 phase 7's <c>PremiumUserEndpointFilter</c>
    /// gate on the fight simulator) — the one control surface missing for that
    /// filter, since nothing else in the API ever sets
    /// <see cref="UserEntity.IsPremium"/>.
    /// </summary>
    public async Task<(UserEditOutcome Outcome, UserEntity? User)> SetPremiumAsync(
        Guid id, bool isPremium, CancellationToken cancellationToken = default)
    {
        var user = await _dbContext.Users
            .FirstOrDefaultAsync(u => u.Id == id && !u.IsSystem, cancellationToken)
            .ConfigureAwait(false);

        if (user is null)
        {
            return (UserEditOutcome.NotFound, null);
        }

        user.IsPremium = isPremium;

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return (UserEditOutcome.Success, user);
    }
}
