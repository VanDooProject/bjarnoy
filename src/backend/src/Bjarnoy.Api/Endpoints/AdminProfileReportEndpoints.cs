using System.Security.Claims;
using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// The admin side of profile reports (issue #42): list the moderation queue
/// and record a decision on a report. Acting on the reported user (lock/ban)
/// is the existing status flow in <see cref="AdminUserEndpoints"/> — a report
/// links the two by the reported user's id.
/// </summary>
public static class AdminProfileReportEndpoints
{
    public static IEndpointRouteBuilder MapAdminProfileReportEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var reports = app.MapGroup("/api/v1/admin/profile-reports")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Admin", "Profiles")
            .RequireAuthorization("Admin");

        reports.MapGet("/", ListReports)
            .WithName("AdminListProfileReports")
            .WithSummary("Lists profile reports, paged, newest first, with an optional status filter.");

        reports.MapPost("/{reportId:guid}/resolve", ResolveReport)
            .WithName("AdminResolveProfileReport")
            .WithSummary("Marks a report reviewed, dismissed, or actioned.");

        return app;
    }

    private static async Task<Ok<PagedProfileReportsResponse>> ListReports(
        string? status,
        int? page,
        int? pageSize,
        ProfileService profileService,
        CancellationToken cancellationToken)
    {
        ProfileReportStatus? statusFilter = null;
        if (!string.IsNullOrWhiteSpace(status)
            && Enum.TryParse<ProfileReportStatus>(status, ignoreCase: true, out var parsed))
        {
            statusFilter = parsed;
        }

        var effectivePage = page is > 0 ? page.Value : 1;
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 25;

        var result = await profileService.GetReportsAsync(
            statusFilter, effectivePage, effectivePageSize, cancellationToken);

        IReadOnlyList<ProfileReportResponse> items =
        [
            .. result.Reports.Select(ProfileReportResponse.From),
        ];

        return TypedResults.Ok(
            new PagedProfileReportsResponse(items, result.TotalCount, effectivePage, effectivePageSize));
    }

    private static async Task<Results<Ok<ProfileReportResponse>, NotFound, ValidationProblem>> ResolveReport(
        Guid reportId,
        ResolveProfileReportRequest request,
        ProfileService profileService,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!Enum.TryParse<ProfileReportStatus>(request.Status, ignoreCase: true, out var status))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.Status)] = ["Valid: pending, reviewed, dismissed, actioned."],
            });
        }

        // The "Admin" policy already requires a valid, authenticated JWT.
        var reviewerUserId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var (outcome, report) = await profileService.ResolveReportAsync(
            reportId, status, reviewerUserId, cancellationToken);

        return outcome == ReportResolveOutcome.NotFound
            ? TypedResults.NotFound()
            : TypedResults.Ok(ProfileReportResponse.From(report!));
    }
}
