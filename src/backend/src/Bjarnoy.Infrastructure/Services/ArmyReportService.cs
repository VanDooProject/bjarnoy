using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Army reports ("army stuck", "army starved"): written once, by the service that notices it, and never changed — plain
/// queries, no settle-on-read step, like <see cref="CampReportService"/>. A report belongs to the player
/// (<see cref="ArmyReportEntity.OwnerId"/>), not to a settlement.
/// </summary>
public sealed class ArmyReportService(GameDbContext dbContext)
{
    private readonly GameDbContext _dbContext = dbContext;

    /// <summary>Stages a report on the context; the caller saves.</summary>
    public ArmyReportEntity Add(
        SettlementEntity owner, ArmyReportKind kind, DateTimeOffset occurredAt, Guid armyId, HexCoord hex,
        ArmyMission mission, IEnumerable<UnitStack> units)
    {
        ArgumentNullException.ThrowIfNull(owner);

        var report = ArmyReportEntity.Create(owner.WorldId, owner.OwnerId, owner.UserId, kind, occurredAt, armyId, hex, mission, units);
        _dbContext.ArmyReports.Add(report);
        return report;
    }

    public Task<ArmyReportEntity?> GetAsync(Guid reportId, CancellationToken cancellationToken = default) =>
        _dbContext.ArmyReports
            .AsNoTracking()
            .Include(r => r.UnitLines)
            .FirstOrDefaultAsync(r => r.Id == reportId, cancellationToken);

    /// <summary>The army reports of the player <paramref name="ownerId"/> in <paramref name="worldId"/>, newest first.</summary>
    public async Task<List<ArmyReportEntity>> GetForPlayerAsync(
        Guid worldId, string ownerId, CancellationToken cancellationToken = default)
    {
        // Sorted in memory: the SQLite provider cannot ORDER BY a DateTimeOffset column (see BattleReportService).
        var reports = await _dbContext.ArmyReports
            .AsNoTracking()
            .Include(r => r.UnitLines)
            .Where(r => r.WorldId == worldId && r.OwnerId == ownerId)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        reports.Sort((a, b) => b.OccurredAt.CompareTo(a.OccurredAt));
        return reports;
    }
}
