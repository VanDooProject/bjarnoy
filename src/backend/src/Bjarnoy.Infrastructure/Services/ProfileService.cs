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

/// <summary>A user's public profile: the user row plus how many settlements they own.</summary>
public sealed record ProfileData(UserEntity User, int SettlementCount);

/// <summary>
/// The player-facing profile surface (issue #42): read a profile (own or
/// another player's), edit one's own bio, and report a profile for
/// moderation. The report itself is recorded on the shared
/// <see cref="ReportService"/> queue (also used by chat message reports,
/// issue #41) rather than a profile-only one — that service, and
/// <c>AdminReportEndpoints</c>, own listing and resolving reports.
/// </summary>
public sealed class ProfileService(GameDbContext dbContext, ReportService reportService)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly ReportService _reportService = reportService;

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

    public async Task<(ProfileReportOutcome Outcome, ReportEntity? Report)> ReportProfileAsync(
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

        var reportedUser = await _dbContext.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == reportedUserId && !u.IsSystem, cancellationToken)
            .ConfigureAwait(false);

        if (reportedUser is null)
        {
            return (ProfileReportOutcome.ReportedUserNotFound, null);
        }

        var (outcome, report) = await _reportService.CreateAsync(
            reporterUserId,
            reportedUserId,
            ReportSourceType.ProfileBio,
            reportedUserId,
            contextSnapshot: reportedUser.Bio ?? string.Empty,
            reason,
            note,
            cancellationToken).ConfigureAwait(false);

        return (outcome == CreateReportOutcome.AlreadyPending
            ? ProfileReportOutcome.AlreadyReported
            : ProfileReportOutcome.Success, report);
    }
}
