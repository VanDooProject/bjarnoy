using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Admin-only settlement god-mode (issue #30): search/inspect settlements,
/// grant or remove resources, and set a placed building's level directly —
/// all going through the same lazy-settle path players read from and write
/// through, so nothing here can diverge from the normal game rules on
/// production or capacity.
/// </summary>
public static class AdminSettlementEndpoints
{
    public static IEndpointRouteBuilder MapAdminSettlementEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var settlements = app.MapGroup("/api/v1/admin/settlements")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Admin", "Settlements")
            .RequireAuthorization("Admin");

        settlements.MapGet("/", Search)
            .WithName("AdminSearchSettlements")
            .WithSummary("Searches settlements by world and/or owner name, paged.");

        settlements.MapGet("/{settlementId:guid}", Get)
            .WithName("AdminGetSettlement")
            .WithSummary("A settlement's detail as of now, stocks settled.");

        settlements.MapPost("/{settlementId:guid}/resources", GrantResources)
            .WithName("AdminGrantResources")
            .WithSummary("Grants (or, with negative values, removes) resources, settling first.");

        settlements.MapPut("/{settlementId:guid}/buildings/{q:int}/{r:int}/level", SetBuildingLevel)
            .WithName("AdminSetBuildingLevel")
            .WithSummary("Sets a placed building's level directly, recomputing rates like a normal build completion.");

        return app;
    }

    private static async Task<Ok<PagedAdminSettlementsResponse>> Search(
        Guid? worldId,
        string? owner,
        int? page,
        int? pageSize,
        SettlementService settlements,
        CancellationToken cancellationToken)
    {
        var effectivePage = page is > 0 ? page.Value : 1;
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 25;

        var result = await settlements.SearchAsync(worldId, owner, effectivePage, effectivePageSize, cancellationToken);

        IReadOnlyList<AdminSettlementSummary> items = [.. result.Settlements.Select(AdminSettlementSummary.From)];

        return TypedResults.Ok(new PagedAdminSettlementsResponse(items, result.TotalCount, effectivePage, effectivePageSize));
    }

    private static async Task<Results<Ok<SettlementResponse>, NotFound>> Get(
        Guid settlementId,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var found = await settlements.GetAsync(settlementId, cancellationToken);
        if (found is null)
        {
            return TypedResults.NotFound();
        }

        var (entity, clock) = found.Value;
        return TypedResults.Ok(SettlementResponse.From(entity, clock, clock.ToGameTime(time.GetUtcNow())));
    }

    private static async Task<Results<Ok<SettlementResponse>, NotFound>> GrantResources(
        Guid settlementId,
        GrantResourcesRequest request,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await settlements.GrantResourcesAsync(settlementId, request.ToDelta(), cancellationToken);

        if (!result.Accepted)
        {
            return TypedResults.NotFound();
        }

        var clock = result.Clock!.Value;
        return TypedResults.Ok(SettlementResponse.From(result.Settlement!, clock, clock.ToGameTime(time.GetUtcNow())));
    }

    private static async Task<Results<Ok<SettlementResponse>, NotFound, ValidationProblem>> SetBuildingLevel(
        Guid settlementId,
        int q,
        int r,
        SetBuildingLevelRequest request,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await settlements.SetBuildingLevelAsync(
            settlementId, new HexCoord(q, r), request.Level, cancellationToken);

        switch (result.Outcome)
        {
            case SetBuildingLevelOutcome.SettlementNotFound:
                return TypedResults.NotFound();
            case SetBuildingLevelOutcome.BuildingNotFound:
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["coord"] = ["No building stands on that hex."],
                });
            case SetBuildingLevelOutcome.InvalidLevel:
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    [nameof(request.Level)] = ["That level is outside the building's valid range."],
                });
        }

        var clock = result.Clock!.Value;
        return TypedResults.Ok(SettlementResponse.From(result.Settlement!, clock, clock.ToGameTime(time.GetUtcNow())));
    }
}
