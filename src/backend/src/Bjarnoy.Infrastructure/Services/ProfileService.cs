using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

public enum BioUpdateOutcome
{
    Success,
    NotFound,
}

public enum ProfileReportOutcome
{
    Success,
    ReportedUserNotFound,

    /// <summary>A player tried to report their own profile.</summary>
    CannotReportSelf,

    /// <summary>
    /// This reporter already has a Pending report against the same user —
    /// the cheap end of the rate-limiting follow-up issue #42 defers.
    /// </summary>
    AlreadyReported,
}

public enum ReportResolveOutcome
{
    Success,
    NotFound,
}

/// <summary>A user's public profile: the user row plus how many settlements they own.</summary>
public sealed record ProfileData(UserEntity User, int SettlementCount);

public sealed record ProfileReportsPage(IReadOnlyList<ProfileReportEntity> Reports, int TotalCount);

/// <summary>
/// The player-facing profile surface (issue #42): read a profile (own or
/// another player's), edit one's own bio, and report a profile for
/// moderation — plus the admin-side queue over those reports. Acting on a
/// report (lock/ban) stays with <see cref="UserService.SetStatusAsync"/>;
/// this service only records the decision on the report row.
/// </summary>
public sealed class ProfileService(GameDbContext dbContext, TimeProvider timeProvider)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;

    public async Task<ProfileData?> GetProfileByIdAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await _dbContext.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId && !u.IsSystem, cancellationToken)
            .ConfigureAwait(false);

        return user is null ? null : await WithSettlementCountAsync(user, cancellationToken).ConfigureAwait(false);
    }

    public async Task<ProfileData?> GetProfileByUserNameAsync(
        string userName, CancellationToken cancellationToken = default)
    {
        var normalized = userName.Trim().ToLowerInvariant();
        var user = await _dbContext.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.NormalizedUserName == normalized && !u.IsSystem, cancellationToken)
            .ConfigureAwait(false);

        return user is null ? null : await WithSettlementCountAsync(user, cancellationToken).ConfigureAwait(false);
    }

    private async Task<ProfileData> WithSettlementCountAsync(UserEntity user, CancellationToken cancellationToken)
    {
        var settlementCount = await _dbContext.Settlements
            .CountAsync(s => s.UserId == user.Id, cancellationToken)
            .ConfigureAwait(false);

        return new ProfileData(user, settlementCount);
    }

    /// <summary>
    /// Sets (or with <c>null</c> clears) the caller's own bio. The text is
    /// stored verbatim — whitespace is what makes ASCII art work — with only
    /// the length capped by the endpoint's validation and the column's max.
    /// </summary>
    public async Task<(BioUpdateOutcome Outcome, UserEntity? User)> UpdateBioAsync(
        Guid userId, string? bio, CancellationToken cancellationToken = default)
    {
        var user = await _dbContext.Users
            .FirstOrDefaultAsync(u => u.Id == userId && !u.IsSystem, cancellationToken)
            .ConfigureAwait(false);

        if (user is null)
        {
            return (BioUpdateOutcome.NotFound, null);
        }

        user.Bio = string.IsNullOrEmpty(bio) ? null : bio;

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return (BioUpdateOutcome.Success, user);
    }

    public async Task<(ProfileReportOutcome Outcome, ProfileReportEntity? Report)> ReportProfileAsync(
        Guid reporterUserId,
        Guid reportedUserId,
        string reason,
        string? note,
        CancellationToken cancellationToken = default)
    {
        if (reporterUserId == reportedUserId)
        {
            return (ProfileReportOutcome.CannotReportSelf, null);
        }

        var reportedExists = await _dbContext.Users
            .AnyAsync(u => u.Id == reportedUserId && !u.IsSystem, cancellationToken)
            .ConfigureAwait(false);

        if (!reportedExists)
        {
            return (ProfileReportOutcome.ReportedUserNotFound, null);
        }

        var alreadyPending = await _dbContext.ProfileReports
            .AnyAsync(
                r => r.ReporterUserId == reporterUserId
                    && r.ReportedUserId == reportedUserId
                    && r.Status == ProfileReportStatus.Pending,
                cancellationToken)
            .ConfigureAwait(false);

        if (alreadyPending)
        {
            return (ProfileReportOutcome.AlreadyReported, null);
        }

        var report = new ProfileReportEntity
        {
            ReporterUserId = reporterUserId,
            ReportedUserId = reportedUserId,
            Reason = reason,
            Note = string.IsNullOrWhiteSpace(note) ? null : note,
            Status = ProfileReportStatus.Pending,
            CreatedAt = _timeProvider.GetUtcNow(),
        };

        _dbContext.ProfileReports.Add(report);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return (ProfileReportOutcome.Success, report);
    }

    public async Task<ProfileReportsPage> GetReportsAsync(
        ProfileReportStatus? status,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var query = _dbContext.ProfileReports.AsNoTracking();

        if (status is { } statusFilter)
        {
            query = query.Where(r => r.Status == statusFilter);
        }

        var totalCount = await query.CountAsync(cancellationToken).ConfigureAwait(false);

        // Guid v7 is time-ordered, so this pages newest-first without
        // ordering by DateTimeOffset (which SQLite cannot) — the same
        // convention as UserService.GetUsersAsync.
        var reports = await query
            .Include(r => r.Reporter)
            .Include(r => r.ReportedUser)
            .OrderByDescending(r => r.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new ProfileReportsPage(reports, totalCount);
    }

    /// <param name="reviewerUserId">The admin resolving the report, from their own token.</param>
    public async Task<(ReportResolveOutcome Outcome, ProfileReportEntity? Report)> ResolveReportAsync(
        Guid reportId,
        ProfileReportStatus status,
        Guid reviewerUserId,
        CancellationToken cancellationToken = default)
    {
        var report = await _dbContext.ProfileReports
            .Include(r => r.Reporter)
            .Include(r => r.ReportedUser)
            .FirstOrDefaultAsync(r => r.Id == reportId, cancellationToken)
            .ConfigureAwait(false);

        if (report is null)
        {
            return (ReportResolveOutcome.NotFound, null);
        }

        report.Status = status;
        report.ReviewedAt = _timeProvider.GetUtcNow();
        report.ReviewedByUserId = reviewerUserId;

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return (ReportResolveOutcome.Success, report);
    }
}
