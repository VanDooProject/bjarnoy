using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Reads the facts <see cref="AttackProtection.Evaluate"/> needs (issue #336) for a pair of settlements:
/// both owners' account size (highest Longhouse in the world), the target owner's last activity and any
/// open revenge. Used on arrival by <see cref="ArmyService"/> and by the dispatch-time status endpoint.
/// </summary>
public sealed class AttackProtectionService(GameDbContext dbContext)
{
    private readonly GameDbContext _dbContext = dbContext;

    /// <param name="gameNow">The world's game instant the revenge window is measured back from.</param>
    /// <param name="wallNow">Wall time, against which the target owner's inactivity is measured.</param>
    /// <returns>The verdict, or null when either settlement does not exist.</returns>
    public async Task<AttackProtectionVerdict?> EvaluateAsync(
        Guid attackerSettlementId, Guid targetSettlementId, DateTimeOffset gameNow, DateTimeOffset wallNow,
        CancellationToken cancellationToken = default)
    {
        var ids = new[] { attackerSettlementId, targetSettlementId };
        var owners = await _dbContext.Settlements.AsNoTracking()
            .Where(s => ids.Contains(s.Id))
            .Select(s => new { s.Id, s.UserId, s.WorldId })
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var attacker = owners.FirstOrDefault(s => s.Id == attackerSettlementId);
        var target = owners.FirstOrDefault(s => s.Id == targetSettlementId);
        if (attacker is null || target is null)
        {
            return null;
        }

        var targetUser = await _dbContext.Users.AsNoTracking()
            .Where(u => u.Id == target.UserId)
            .Select(u => new { u.IsSystem, u.LastLoginAt, u.CreatedAt })
            .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

        var sameOwner = attacker.UserId == target.UserId;
        var targetUnowned = targetUser?.IsSystem ?? false;

        // Nothing below can change the verdict for these, so skip the extra queries.
        if (sameOwner || targetUnowned)
        {
            return AttackProtection.Evaluate(sameOwner, targetUnowned, 0, 0, false, false);
        }

        var attackerLevel = await HighestLonghouseAsync(attacker.UserId, attacker.WorldId, cancellationToken).ConfigureAwait(false);
        var defenderLevel = await HighestLonghouseAsync(target.UserId, target.WorldId, cancellationToken).ConfigureAwait(false);

        var inactive = false;
        var revenge = false;
        if (attackerLevel - defenderLevel > AttackProtection.MaxLonghouseGap)
        {
            inactive = await IsInactiveAsync(
                target.UserId, targetUser?.LastLoginAt ?? targetUser?.CreatedAt, wallNow, cancellationToken).ConfigureAwait(false);
            revenge = !inactive
                && await IsRevengeOpenAsync(attacker.UserId, target.UserId, attacker.WorldId, gameNow, cancellationToken).ConfigureAwait(false);
        }

        return AttackProtection.Evaluate(sameOwner, targetUnowned, attackerLevel, defenderLevel, inactive, revenge);
    }

    private async Task<int> HighestLonghouseAsync(Guid userId, Guid worldId, CancellationToken cancellationToken)
    {
        var levels = await _dbContext.PlacedBuildings.AsNoTracking()
            .Where(b => b.Type == BuildingType.Longhouse && b.Settlement!.WorldId == worldId && b.Settlement.UserId == userId)
            .Select(b => b.Level)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return levels.Count == 0 ? 0 : levels.Max();
    }

    private async Task<bool> IsInactiveAsync(
        Guid userId, DateTimeOffset? fallbackLastSeen, DateTimeOffset wallNow, CancellationToken cancellationToken)
    {
        var tracked = await _dbContext.UserActivities.AsNoTracking()
            .Where(a => a.UserId == userId)
            .Select(a => (DateTimeOffset?)a.LastActiveAtUtc)
            .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

        var lastSeen = tracked ?? fallbackLastSeen;
        return lastSeen is { } seen && wallNow - seen >= AttackProtection.InactivityThreshold;
    }

    private async Task<bool> IsRevengeOpenAsync(
        Guid attackerUserId, Guid targetUserId, Guid worldId, DateTimeOffset gameNow, CancellationToken cancellationToken)
    {
        var targetSettlements = _dbContext.Settlements.Where(s => s.WorldId == worldId && s.UserId == targetUserId).Select(s => s.Id);
        var attackerSettlements = _dbContext.Settlements.Where(s => s.WorldId == worldId && s.UserId == attackerUserId).Select(s => s.Id);

        // Filtered by ids only and compared in memory: the SQLite provider cannot translate a DateTimeOffset
        // comparison (see BattleReportService.GetForSettlementAsync).
        var occurred = await _dbContext.BattleReports.AsNoTracking()
            .Where(r => targetSettlements.Contains(r.AttackerSettlementId) && attackerSettlements.Contains(r.DefenderSettlementId))
            .Select(r => r.OccurredAt)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var cutoff = gameNow - AttackProtection.RevengeWindow;
        return occurred.Any(at => at >= cutoff);
    }
}
