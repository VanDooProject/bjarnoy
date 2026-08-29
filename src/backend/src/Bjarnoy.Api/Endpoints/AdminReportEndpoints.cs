using System.Security.Claims;
using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Admin-only moderation queue over <see cref="ReportEntity"/> — issue #41.
/// Deliberately generic over <see cref="ReportSourceType"/>, even though chat
/// messages are the only source implemented today, so a future report source
/// lands in this same queue rather than a parallel one. Acting on the
/// reported *user* (lock/ban) stays on the existing
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
            .WithTags("Admin", "Chat")
            .RequireAuthorization("Admin");

        reports.MapGet("/", ListReports)
            .WithName("AdminListReports")
            .WithSummary("Lists moderation reports, paged, optionally filtered by status or source type.");

        reports.MapPost("/{reportId:guid}/resolve", Resolve)
            .WithName("AdminResolveReport")
            .WithSummary("Marks a report resolved or dismissed.");

        return app;
    }

    private static async Task<Results<Ok<PagedReportsResponse>, ValidationProblem>> ListReports(
        string? status,
        string? sourceType,
        int? page,
        int? pageSize,
        ChatService chat,
        CancellationToken cancellationToken)
    {
        ReportStatus? statusFilter = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!Enum.TryParse<ReportStatus>(status, ignoreCase: true, out var parsedStatus))
            {
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    [nameof(status)] = ["Valid: open, resolved, dismissed."],
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
                    [nameof(sourceType)] = ["Valid: chatMessage."],
                });
            }

            sourceTypeFilter = parsedSourceType;
        }

        var effectivePage = page is > 0 ? page.Value : 1;
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 25;

        var result = await chat.GetReportsAsync(
            statusFilter, sourceTypeFilter, effectivePage, effectivePageSize, cancellationToken);

        var items = result.Reports.Select(ReportResponse.From).ToList();
        return TypedResults.Ok(new PagedReportsResponse(items, result.TotalCount, effectivePage, effectivePageSize));
    }

    private static async Task<Results<Ok<ReportResponse>, NotFound, ValidationProblem>> Resolve(
        Guid reportId,
        ResolveReportRequest request,
        ClaimsPrincipal principal,
        ChatService chat,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!Enum.TryParse<ReportStatus>(request.Outcome, ignoreCase: true, out var outcome)
            || outcome == ReportStatus.Open)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.Outcome)] = ["Valid: resolved, dismissed."],
            });
        }

        // The "Admin" policy already requires a valid, authenticated JWT, so
        // NameIdentifier is always present here — same pattern as
        // AdminUserEndpoints.SetStatus.
        var adminUserId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var (result, report) = await chat.ResolveReportAsync(
            reportId, adminUserId, outcome, request.Note, cancellationToken);

        return result == ResolveReportOutcome.NotFound
            ? TypedResults.NotFound()
            : TypedResults.Ok(ReportResponse.From(report!));
    }
}
