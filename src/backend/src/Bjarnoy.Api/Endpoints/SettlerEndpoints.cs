using System.Security.Claims;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// The settlement-expansion surface (issue #55): the caller's own renown, and
/// the settlement switcher's "which settlements do I own in this world"
/// listing. Founding itself has no dedicated endpoint — a settler convoy
/// founds automatically on arrival, resolved lazily the same way an
/// <c>ArmyMission.Attack</c> resolves a battle — see
/// <see cref="ArmyEndpoints"/>'s Dispatch/Get/Recall/RetargetFounding, which
/// a "found" mission rides end to end.
/// </summary>
public static class SettlerEndpoints
{
    public static IEndpointRouteBuilder MapSettlerEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var worlds = app.MapGroup("/api/v1/worlds")
            .WithApiVersionSet(versionSet)
            .WithTags("Settlers");

        worlds.MapGet("/{worldId:guid}/renown", GetOwnRenown)
            .WithName("GetOwnRenown")
            .WithSummary("The caller's own renown in this world, accrued as of now (issue #55).")
            .RequireAuthorization();

        worlds.MapGet("/{worldId:guid}/settlements/mine", ListOwnSettlements)
            .WithName("ListOwnSettlementsInWorld")
            .WithSummary("Every settlement the caller owns in this world — the settlement switcher's source list.")
            .RequireAuthorization();

        return app;
    }

    private static async Task<Ok<RenownResponse>> GetOwnRenown(
        Guid worldId,
        RenownService renown,
        SettlementService settlements,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var total = await renown.AccrueAsync(userId, worldId, cancellationToken);
        var settlementCount = await settlements.GetSettlementCountAsync(userId, worldId, cancellationToken);

        return TypedResults.Ok(RenownResponse.From(total, settlementCount));
    }

    private static async Task<Ok<IReadOnlyList<SettlementSummary>>> ListOwnSettlements(
        Guid worldId,
        SettlementService settlements,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var entities = await settlements.GetForWorldAsync(worldId, cancellationToken);

        IReadOnlyList<SettlementSummary> response =
        [
            .. entities
                .Where(s => s.UserId == userId)
                .Select(s => new SettlementSummary(
                    s.Id, s.Name, s.OwnerName, s.CentreQ, s.CentreR,
                    s.Buildings.FirstOrDefault(b => b.Type == BuildingType.Longhouse)?.Level ?? 0, s.IslandId)),
        ];

        return TypedResults.Ok(response);
    }
}
