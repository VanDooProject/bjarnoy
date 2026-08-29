using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

public enum CreateReportOutcome
{
    Created,

    /// <summary>This reporter already has a Pending report against the same source — the existing report is returned instead.</summary>
    AlreadyPending,
}

public enum ResolveReportOutcome
{
    Success,
    NotFound,
}

public sealed record ReportsPage(IReadOnlyList<ReportEntity> Reports, int TotalCount);

/// <summary>
/// The generic moderation queue behind both chat message reports (issue #41,
/// <see cref="ChatService.ReportMessageAsync"/>) and profile reports (issue
/// #42, <see cref="ProfileService.ReportProfileAsync"/>) — originally two
/// separate systems, unified onto one <see cref="ReportEntity"/> table keyed
/// by <see cref="ReportSourceType"/>/<c>SourceId</c> so the admin queue and
/// its resolution flow exist exactly once. Each source-specific service owns
/// its own visibility/self-report checks and builds the denormalized
/// <c>ContextSnapshot</c>; this service only owns the report row itself.
/// </summary>
public sealed class ReportService(GameDbContext dbContext, TimeProvider timeProvider)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;

    public async Task<(CreateReportOutcome Outcome, ReportEntity Report)> CreateAsync(
        Guid reporterUserId,
        Guid reportedUserId,
        ReportSourceType sourceType,
        Guid sourceId,
        string contextSnapshot,
        string reason,
        string? note,
        CancellationToken cancellationToken = default)
    {
        var existing = await _dbContext.Reports
            .Include(r => r.Reporter)
            .Include(r => r.ReportedUser)
            .FirstOrDefaultAsync(
                r => r.ReporterUserId == reporterUserId
                    && r.SourceType == sourceType
                    && r.SourceId == sourceId
                    && r.Status == ReportStatus.Pending,
                cancellationToken)
            .ConfigureAwait(false);
        if (existing is not null)
        {
            return (CreateReportOutcome.AlreadyPending, existing);
        }

        var report = new ReportEntity
        {
            ReporterUserId = reporterUserId,
            ReportedUserId = reportedUserId,
            SourceType = sourceType,
            SourceId = sourceId,
            ContextSnapshot = contextSnapshot,
            Reason = reason,
            Note = string.IsNullOrWhiteSpace(note) ? null : note,
            CreatedAt = _timeProvider.GetUtcNow(),
        };

        _dbContext.Reports.Add(report);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        await _dbContext.Entry(report).Reference(r => r.Reporter).LoadAsync(cancellationToken).ConfigureAwait(false);
        await _dbContext.Entry(report).Reference(r => r.ReportedUser).LoadAsync(cancellationToken).ConfigureAwait(false);

        return (CreateReportOutcome.Created, report);
    }

    public async Task<ReportsPage> GetReportsAsync(
        ReportStatus? status, ReportSourceType? sourceType, int page, int pageSize,
        CancellationToken cancellationToken = default)
    {
        var query = _dbContext.Reports
            .AsNoTracking()
            .Include(r => r.Reporter)
            .Include(r => r.ReportedUser)
            .AsQueryable();

        if (status is { } statusFilter)
        {
            query = query.Where(r => r.Status == statusFilter);
        }

        if (sourceType is { } sourceTypeFilter)
        {
            query = query.Where(r => r.SourceType == sourceTypeFilter);
        }

        var totalCount = await query.CountAsync(cancellationToken).ConfigureAwait(false);

        // Guid v7 is time-ordered, so this pages newest-first within each
        // status group without ordering by DateTimeOffset (which SQLite
        // cannot) — the same convention as UserService.GetUsersAsync.
        var reports = await query
            .OrderBy(r => r.Status)
            .ThenByDescending(r => r.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new ReportsPage(reports, totalCount);
    }

    /// <param name="adminUserId">The admin resolving the report, from their own token.</param>
    public async Task<(ResolveReportOutcome Outcome, ReportEntity? Report)> ResolveAsync(
        Guid reportId, Guid adminUserId, ReportStatus status, string? note,
        CancellationToken cancellationToken = default)
    {
        var report = await _dbContext.Reports
            .Include(r => r.Reporter)
            .Include(r => r.ReportedUser)
            .FirstOrDefaultAsync(r => r.Id == reportId, cancellationToken)
            .ConfigureAwait(false);
        if (report is null)
        {
            return (ResolveReportOutcome.NotFound, null);
        }

        report.Status = status;
        report.ResolvedByUserId = adminUserId;
        report.ResolvedAt = _timeProvider.GetUtcNow();
        report.ResolutionNote = note;

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return (ResolveReportOutcome.Success, report);
    }
}
