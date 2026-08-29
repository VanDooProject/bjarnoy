using System.Security.Claims;
using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Admin-only moderation queue over <see cref="ReportEntity"/> — one queue
/// for both chat message reports (issue #41) and profile reports (issue
/// #42, previously a separate <c>AdminProfileReportEndpoints</c>/
/// <c>profile_reports</c> table), generic over <see cref="ReportSourceType"/>
/// so a future report source lands here too rather than in a parallel one.
/// Acting on the reported *user* (lock/ban) stays on the existing
/// <c>POST /api/v1/admin/users/{id}/status</c> — not duplicated here.
/// </summary>
public static class AdminReportEndpoints
{
    public static IEndpointRouteBuilder MapAdminReportEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var reports = app.MapGroup("/api/v1/admin/reports")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Admin", "Chat", "Profiles")
            .RequireAuthorization("Admin");

        reports.MapGet("/", ListReports)
            .WithName("AdminListReports")
            .WithSummary("Lists moderation reports, paged, optionally filtered by status or source type.");

        reports.MapPost("/{reportId:guid}/resolve", Resolve)
            .WithName("AdminResolveReport")
            .WithSummary("Marks a report resolved, dismissed, or actioned.");

        return app;
    }

    private static async Task<Results<Ok<PagedReportsResponse>, ValidationProblem>> ListReports(
        string? status,
        string? sourceType,
        int? page,
        int? pageSize,
        ReportService reports,
        CancellationToken cancellationToken)
    {
        ReportStatus? statusFilter = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!Enum.TryParse<ReportStatus>(status, ignoreCase: true, out var parsedStatus))
            {
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    [nameof(status)] = ["Valid: pending, resolved, dismissed, actioned."],
                });
            }

            statusFilter = parsedStatus;
        }

        ReportSourceType? sourceTypeFilter = null;
        if (!string.IsNullOrWhiteSpace(sourceType))
        {
            if (!Enum.TryParse<ReportSourceType>(sourceType, ignoreCase: true, out var parsedSourceType))
            {
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    [nameof(sourceType)] = ["Valid: chatMessage, profileBio."],
                });
            }

            sourceTypeFilter = parsedSourceType;
        }

        var effectivePage = page is > 0 ? page.Value : 1;
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 25;

        var result = await reports.GetReportsAsync(
            statusFilter, sourceTypeFilter, effectivePage, effectivePageSize, cancellationToken);

        var items = result.Reports.Select(ReportResponse.From).ToList();
        return TypedResults.Ok(new PagedReportsResponse(items, result.TotalCount, effectivePage, effectivePageSize));
    }

    private static async Task<Results<Ok<ReportResponse>, NotFound, ValidationProblem>> Resolve(
        Guid reportId,
        ResolveReportRequest request,
        ClaimsPrincipal principal,
        ReportService reports,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!Enum.TryParse<ReportStatus>(request.Outcome, ignoreCase: true, out var outcome)
            || outcome == ReportStatus.Pending)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.Outcome)] = ["Valid: resolved, dismissed, actioned."],
            });
        }

        // The "Admin" policy already requires a valid, authenticated JWT, so
        // NameIdentifier is always present here — same pattern as
        // AdminUserEndpoints.SetStatus.
        var adminUserId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var (result, report) = await reports.ResolveAsync(
            reportId, adminUserId, outcome, request.Note, cancellationToken);

        return result == ResolveReportOutcome.NotFound
            ? TypedResults.NotFound()
            : TypedResults.Ok(ReportResponse.From(report!));
    }
}
