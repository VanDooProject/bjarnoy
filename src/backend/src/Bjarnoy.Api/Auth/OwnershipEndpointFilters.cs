using System.Security.Claims;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.Auth;

/// <summary>
/// Refuses a settlement-mutating request with 403 unless the caller can prove
/// they own the target settlement. See <see cref="OwnershipGate"/> for the
/// actual rule; this filter only resolves the settlement id.
/// </summary>
/// <remarks>
/// Reads the id from the endpoint's own first bound parameter via
/// <see cref="EndpointFilterInvocationContext.GetArgument{T}"/>, so it only
/// fits an endpoint whose handler takes the settlement id
/// (<c>Guid settlementId</c>) as its first parameter — true of every endpoint
/// this is attached to today (<c>QueueBuild</c>, <c>TrainUnits</c>,
/// <c>ArmyEndpoints.Dispatch</c>). See <see cref="ArmyOwnershipEndpointFilter"/>
/// for the army-scoped equivalent, which must resolve back to the owning
/// settlement first. Constructed by the framework via the root service
/// provider (same reasoning as <see cref="ActiveUserEndpointFilter"/>), so
/// scoped services are pulled from <see cref="HttpContext.RequestServices"/>
/// rather than injected.
/// </remarks>
public sealed class SettlementOwnershipEndpointFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(next);

        var settlementId = context.GetArgument<Guid>(0);

        var settlements = context.HttpContext.RequestServices.GetRequiredService<SettlementService>();
        var refusal = await OwnershipGate.EnforceAsync(
            context.HttpContext, settlementId, settlements, context.HttpContext.RequestAborted);

        return refusal ?? await next(context);
    }
}

/// <summary>
/// Refuses an army-mutating request with 403 unless the caller can prove they
/// own the army's home settlement — an army has no owner of its own, only the
/// settlement it was dispatched from (<see cref="ArmyEntity.SettlementId"/>),
/// which stays the same for its whole life regardless of where it currently
/// is. See <see cref="OwnershipGate"/> for the actual rule.
/// </summary>
/// <remarks>
/// Reads the army id the same way <see cref="SettlementOwnershipEndpointFilter"/>
/// reads a settlement id — the endpoint's first bound parameter — so it only
/// fits a handler taking <c>Guid armyId</c> first, true of
/// <c>ArmyEndpoints.Recall</c> today.
/// </remarks>
public sealed class ArmyOwnershipEndpointFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(next);

        var armyId = context.GetArgument<Guid>(0);

        var armies = context.HttpContext.RequestServices.GetRequiredService<ArmyService>();
        var settlementId = await armies.GetOwningSettlementIdAsync(
            armyId, context.HttpContext.RequestAborted);

        if (settlementId is null)
        {
            // No such army — let the endpoint's own NotFound handling answer,
            // rather than this filter answering for it.
            return await next(context);
        }

        var settlements = context.HttpContext.RequestServices.GetRequiredService<SettlementService>();
        var refusal = await OwnershipGate.EnforceAsync(
            context.HttpContext, settlementId.Value, settlements, context.HttpContext.RequestAborted);

        return refusal ?? await next(context);
    }
}

/// <summary>
/// The shared ownership rule both endpoint filters above enforce: a caller
/// must be either the authenticated account that really owns the settlement,
/// or — for anonymous/unclaimed play, still held by
/// <see cref="SystemUserIds.Abandoned"/> — present the same client-local id
/// the settlement was founded with.
/// </summary>
/// <remarks>
/// This is deliberately the first real ownership check in the API — see
/// <c>docs/codebase-gap-analysis.md</c>, "no ownership authorization on any
/// game-mutation endpoint". It mirrors the anonymous-play model
/// <see cref="SettlementEntity.OwnerId"/>/<see cref="SettlementEntity.UserId"/>
/// already document: a settlement is either claimed (real <c>UserId</c>) or
/// not (owned by the <c>Abandoned</c> system user, provable only by the
/// founding browser's own local id). It does not, on its own, close the
/// separate "any caller can read any settlement" gap — this only gates
/// mutations, via the endpoint filters above.
/// </remarks>
internal static class OwnershipGate
{
    /// <summary>
    /// Carries the founding browser's client-local id (<c>player.id</c> on
    /// the frontend) for an anonymous-owned settlement's mutating requests.
    /// Meaningless — and ignored — once a settlement is claimed by a real
    /// account, since the JWT itself proves ownership then.
    /// </summary>
    public const string OwnerIdHeaderName = "X-Owner-Id";

    public static async Task<IResult?> EnforceAsync(
        HttpContext httpContext,
        Guid settlementId,
        SettlementService settlements,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpContext);
        ArgumentNullException.ThrowIfNull(settlements);

        var ownership = await settlements.GetOwnershipAsync(settlementId, cancellationToken);
        if (ownership is null)
        {
            // No such settlement — let the endpoint's own NotFound handling
            // answer, rather than this filter pre-empting it with a 403.
            return null;
        }

        var (userId, ownerId) = ownership.Value;

        if (userId != SystemUserIds.Abandoned)
        {
            var user = httpContext.User;
            var idClaim = user.Identity?.IsAuthenticated == true
                ? user.FindFirstValue(ClaimTypes.NameIdentifier)
                : null;

            return Guid.TryParse(idClaim, out var callerId) && callerId == userId
                ? null
                : Refuse();
        }

        var headerOwnerId = httpContext.Request.Headers[OwnerIdHeaderName].ToString();
        return !string.IsNullOrEmpty(headerOwnerId) && headerOwnerId == ownerId
            ? null
            : Refuse();
    }

    private static IResult Refuse() =>
        Results.Json(new AuthErrorResponse("not_owner"), statusCode: StatusCodes.Status403Forbidden);
}
