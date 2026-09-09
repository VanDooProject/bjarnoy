using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Reads for stored <see cref="FieldBattleReportEntity"/> rows (issue #206) —
/// the field-battle sibling of <see cref="BattleReportService"/>. Reports are
/// written once, by <see cref="FieldBattleService"/> at the moment a field
/// battle resolves, and never change afterward, so this is plain queries with
/// no settle-on-read step, exactly like <see cref="BattleReportService"/>.
/// </summary>
public sealed class FieldBattleReportService(GameDbContext dbContext)
{
    private readonly GameDbContext _dbContext = dbContext;

    public Task<FieldBattleReportEntity?> GetAsync(Guid reportId, CancellationToken cancellationToken = default) =>
        _dbContext.FieldBattleReports
            .AsNoTracking()
            .Include(r => r.Lines)
            .FirstOrDefaultAsync(r => r.Id == reportId, cancellationToken);

    /// <summary>Reports where <paramref name="settlementId"/> was either side, newest first.</summary>
    public async Task<List<FieldBattleReportEntity>> GetForSettlementAsync(
        Guid settlementId, CancellationToken cancellationToken = default)
    {
        // Ordered client-side rather than via OrderByDescending in the query:
        // the SQLite provider (a real, supported deployment target here, not
        // just a test double — see Bjarnoy.Migrations.Sqlite) refuses to
        // translate ORDER BY over a DateTimeOffset column at all. A
        // settlement's field-battle history is small, so sorting the already
        // fully materialized (Include'd) list in memory is cheap and works
        // identically on every provider.
        var reports = await _dbContext.FieldBattleReports
            .AsNoTracking()
            .Include(r => r.Lines)
            .Where(r => r.SideASettlementId == settlementId || r.SideBSettlementId == settlementId)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        reports.Sort((a, b) => b.OccurredAt.CompareTo(a.OccurredAt));
        return reports;
    }
}
