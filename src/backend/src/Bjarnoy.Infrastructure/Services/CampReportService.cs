using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Reads for stored <see cref="CampReportEntity"/> rows. Written once, by the service that resolves the camp fight,
/// and never changed — plain queries, no settle-on-read step, like <see cref="BattleReportService"/>.
/// A camp report belongs to the player's settlement only.
/// </summary>
public sealed class CampReportService(GameDbContext dbContext)
{
    private readonly GameDbContext _dbContext = dbContext;

    public Task<CampReportEntity?> GetAsync(Guid reportId, CancellationToken cancellationToken = default) =>
        _dbContext.CampReports
            .AsNoTracking()
            .Include(r => r.UnitLines)
            .Include(r => r.BeastLines)
            .FirstOrDefaultAsync(r => r.Id == reportId, cancellationToken);

    /// <summary>Camp reports of <paramref name="settlementId"/>, newest first.</summary>
    public async Task<List<CampReportEntity>> GetForSettlementAsync(
        Guid settlementId, CancellationToken cancellationToken = default)
    {
        // Sorted in memory: the SQLite provider cannot ORDER BY a DateTimeOffset column (see BattleReportService).
        var reports = await _dbContext.CampReports
            .AsNoTracking()
            .Include(r => r.UnitLines)
            .Include(r => r.BeastLines)
            .Where(r => r.SettlementId == settlementId)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        reports.Sort((a, b) => b.OccurredAt.CompareTo(a.OccurredAt));
        return reports;
    }
}
