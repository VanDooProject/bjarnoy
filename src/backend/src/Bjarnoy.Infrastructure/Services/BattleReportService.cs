using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Reads for stored <see cref="BattleReportEntity"/> rows (issue #40 phase 3).
/// Reports are written once, by <see cref="ArmyService"/> at the moment a
/// battle resolves, and never change afterward — so unlike
/// <see cref="SettlementService"/>/<see cref="ArmyService"/> there is no
/// settle-on-read step here, just plain queries.
/// </summary>
/// <remarks>
/// "A player's reports" is modelled here as "reports touching one of their
/// settlements" (either side of the fight) — there is no full
/// player/account-scoped inbox model yet, so this deliberately stays at the
/// data-availability level the issue's design doc asks for, not a full
/// unread-count/inbox UX (that is frontend work, out of scope).
/// </remarks>
public sealed class BattleReportService(GameDbContext dbContext)
{
    private readonly GameDbContext _dbContext = dbContext;

    public Task<BattleReportEntity?> GetAsync(Guid reportId, CancellationToken cancellationToken = default) =>
        _dbContext.BattleReports
            .AsNoTracking()
            .Include(r => r.AttackerLines)
            .Include(r => r.DefenderLines)
            .FirstOrDefaultAsync(r => r.Id == reportId, cancellationToken);

    /// <summary>Reports where <paramref name="settlementId"/> was either the attacker's or the defender's settlement, newest first.</summary>
    public Task<List<BattleReportEntity>> GetForSettlementAsync(
        Guid settlementId, CancellationToken cancellationToken = default) =>
        _dbContext.BattleReports
            .AsNoTracking()
            .Include(r => r.AttackerLines)
            .Include(r => r.DefenderLines)
            .Where(r => r.AttackerSettlementId == settlementId || r.DefenderSettlementId == settlementId)
            .OrderByDescending(r => r.OccurredAt)
            .ToListAsync(cancellationToken);
}
