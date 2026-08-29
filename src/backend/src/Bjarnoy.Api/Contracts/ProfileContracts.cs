using System.ComponentModel.DataAnnotations;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.Contracts;

/// <summary>
/// A user's public profile (issue #42). <see cref="Bio"/> is plain text with
/// significant whitespace (ASCII art); the frontend renders it escaped, with
/// <c>white-space: pre</c>.
/// </summary>
public sealed record ProfileResponse(
    Guid Id,
    string UserName,
    string? DisplayName,
    string? Bio,
    DateTimeOffset CreatedAt,
    int SettlementCount)
{
    public static ProfileResponse From(UserEntity user, int settlementCount)
    {
        ArgumentNullException.ThrowIfNull(user);

        return new ProfileResponse(
            user.Id,
            user.UserName,
            user.DisplayName,
            user.Bio,
            user.CreatedAt,
            settlementCount);
    }
}

/// <param name="Bio">The new bio; <c>null</c> or empty clears it. Stored verbatim (whitespace is significant).</param>
public sealed record UpdateBioRequest([property: MaxLength(2000)] string? Bio);

/// <param name="Reason">Why the profile is being reported.</param>
/// <param name="Note">Optional extra context.</param>
public sealed record ReportProfileRequest(
    [property: Required, MaxLength(200)] string Reason,
    [property: MaxLength(2000)] string? Note = null);

public sealed record ProfileReportResponse(
    Guid Id,
    Guid ReporterUserId,
    string ReporterUserName,
    Guid ReportedUserId,
    string ReportedUserName,
    string Reason,
    string? Note,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ReviewedAt)
{
    public static ProfileReportResponse From(ProfileReportEntity report)
    {
        ArgumentNullException.ThrowIfNull(report);

        return new ProfileReportResponse(
            report.Id,
            report.ReporterUserId,
            report.Reporter?.UserName ?? string.Empty,
            report.ReportedUserId,
            report.ReportedUser?.UserName ?? string.Empty,
            report.Reason,
            report.Note,
            report.Status.ToString().ToLowerInvariant(),
            report.CreatedAt,
            report.ReviewedAt);
    }
}

public sealed record PagedProfileReportsResponse(
    IReadOnlyList<ProfileReportResponse> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <param name="Status">One of <c>reviewed</c>, <c>dismissed</c>, <c>actioned</c> (or <c>pending</c> to reopen).</param>
public sealed record ResolveProfileReportRequest([property: Required] string Status);
