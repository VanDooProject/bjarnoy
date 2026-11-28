using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Auth.ApiKeys;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Per-player report read state across all five report kinds. The caller's realm is resolved in the handler (anonymous
/// players mark too, so there is no active-user filter) and the service matches on the side's owner id, so a player can
/// only mark reports they are a party to.
/// </summary>
public static class ReportReadEndpoints
{
    public static IEndpointRouteBuilder MapReportReadEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var group = app.MapGroup("/api/v1")
            .WithApiVersionSet(versionSet)
            .WithTags("Battle reports")
            .WithApiKeyFeature(ApiKeyFeature.Armies);

        group.MapPost("/worlds/{worldId:guid}/reports/{kind}/{reportId:guid}/read", MarkRead)
            .WithName("MarkReportRead")
            .WithSummary("Marks one report (battle, field, camp, army or trade) read for the caller; 404 when the caller is no party to it.")
            .RequireCallerRealm();

        group.MapPost("/worlds/{worldId:guid}/reports/read", MarkAllRead)
            .WithName("MarkAllReportsRead")
            .WithSummary("Marks every unread report of the caller in a world read; returns how many were marked.")
            .RequireCallerRealm();

        return app;
    }

    private static async Task<Results<NoContent, NotFound, BadRequest<ProblemDetails>, JsonHttpResult<AuthErrorResponse>>> MarkRead(
        Guid worldId,
        string kind,
        Guid reportId,
        HttpContext httpContext,
        ReportReadService reads,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        var realm = await CallerRealmResolver.ResolveAsync(httpContext, worldId, realms, cancellationToken);
        if (realm.Outcome == CallerRealmOutcome.MissingHeader) return ReportInbox.MissingOwnerId();
        if (realm.Outcome == CallerRealmOutcome.Refused) return ReportInbox.NotOwner();

        if (!ReportReadService.TryParseKind(kind, out var parsed))
        {
            return TypedResults.BadRequest(new ProblemDetails
            {
                Title = "Unknown report kind.",
                Detail = "The kind must be one of battle, field, camp, army or trade.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        return await reads.MarkReadAsync(worldId, realm.OwnerId!, parsed, reportId, cancellationToken)
            ? TypedResults.NoContent()
            : TypedResults.NotFound();
    }

    private static async Task<Results<Ok<MarkReadResponse>, BadRequest<ProblemDetails>, JsonHttpResult<AuthErrorResponse>>> MarkAllRead(
        Guid worldId,
        HttpContext httpContext,
        ReportReadService reads,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        var realm = await CallerRealmResolver.ResolveAsync(httpContext, worldId, realms, cancellationToken);
        if (realm.Outcome == CallerRealmOutcome.MissingHeader) return ReportInbox.MissingOwnerId();
        if (realm.Outcome == CallerRealmOutcome.Refused) return ReportInbox.NotOwner();

        var marked = await reads.MarkAllReadAsync(worldId, realm.OwnerId!, cancellationToken);
        return TypedResults.Ok(new MarkReadResponse(marked));
    }
}
