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
