using System.Security.Claims;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.Auth;

/// <summary>
/// Refuses a battle-report read with 403 unless the caller can prove they own
/// either party's settlement — a battle report legitimately belongs to both
/// the attacker's and the defender's owner, unlike the single-settlement
/// rule <see cref="SettlementOwnershipEndpointFilter"/> enforces. See
/// <see cref="OwnershipGate.EnforceAnyAsync"/> for the actual rule.
/// </summary>
/// <remarks>
/// Fits <c>ArmyEndpoints.GetReport</c> only: reads the report id the same way
/// the other filters here read their own first argument, then looks the
/// report up itself (rather than trusting a route parameter) to get both
/// settlement ids to check.
/// </remarks>
public sealed class ReportOwnershipEndpointFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(next);

        var reportId = context.GetArgument<Guid>(0);

        var reports = context.HttpContext.RequestServices.GetRequiredService<BattleReportService>();
        var report = await reports.GetAsync(reportId, context.HttpContext.RequestAborted);
        if (report is null)
        {
            // No such report — let the endpoint's own NotFound handling
            // answer, rather than this filter pre-empting it with a 403.
            return await next(context);
        }

        var realms = context.HttpContext.RequestServices.GetRequiredService<RealmDirectory>();
        var refusal = await OwnershipGate.EnforceAnyAsync(
            context.HttpContext,
            [report.AttackerSettlementId, report.DefenderSettlementId],
            realms,
            context.HttpContext.RequestAborted);

        return refusal ?? await next(context);
    }
}

/// <summary>
/// The field-battle-report sibling of <see cref="ReportOwnershipEndpointFilter"/> —
/// same "either party's owner may read it" rule, applied to
/// <c>ArmyEndpoints.GetFieldReport</c> and <c>FieldBattleReportEntity</c>'s
/// <c>SideA</c>/<c>SideB</c> settlement ids instead of attacker/defender.
/// </summary>
public sealed class FieldReportOwnershipEndpointFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(next);

        var reportId = context.GetArgument<Guid>(0);

        var reports = context.HttpContext.RequestServices.GetRequiredService<FieldBattleReportService>();
        var report = await reports.GetAsync(reportId, context.HttpContext.RequestAborted);
        if (report is null)
        {
            return await next(context);
        }

        var realms = context.HttpContext.RequestServices.GetRequiredService<RealmDirectory>();
        var refusal = await OwnershipGate.EnforceAnyAsync(
            context.HttpContext,
            [report.SideASettlementId, report.SideBSettlementId],
            realms,
            context.HttpContext.RequestAborted);

        return refusal ?? await next(context);
    }
}

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

        var realms = context.HttpContext.RequestServices.GetRequiredService<RealmDirectory>();
        var refusal = await OwnershipGate.EnforceAsync(
            context.HttpContext, settlementId, realms, context.HttpContext.RequestAborted);

        return refusal ?? await next(context);
    }
}

/// <summary>
/// Same rule as <see cref="SettlementOwnershipEndpointFilter"/>, for routes
/// whose settlement comes from the request body (an
/// <see cref="ISettlementScopedRequest"/> argument) rather than the route:
/// trade accept/cancel took the acting settlement straight from the body with
/// no check at all, so any caller could escrow another settlement's goods or
/// withdraw its offers.
/// </summary>
public sealed class RequestSettlementOwnershipEndpointFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(next);

        var request = context.Arguments.OfType<ISettlementScopedRequest>().FirstOrDefault()
            ?? throw new InvalidOperationException(
                $"{nameof(RequestSettlementOwnershipEndpointFilter)} is attached to an endpoint with no {nameof(ISettlementScopedRequest)} argument.");

        var realms = context.HttpContext.RequestServices.GetRequiredService<RealmDirectory>();
        var refusal = await OwnershipGate.EnforceAsync(
            context.HttpContext, request.ActingSettlementId, realms, context.HttpContext.RequestAborted);

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

        var realms = context.HttpContext.RequestServices.GetRequiredService<RealmDirectory>();
        var refusal = await OwnershipGate.EnforceAsync(
            context.HttpContext, settlementId.Value, realms, context.HttpContext.RequestAborted);

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
/// founding browser's own local id). This gates mutations, via the endpoint
/// filters above; <see cref="Bjarnoy.Api.Endpoints.WorldEndpoints"/>'s
/// per-world reads (membership/fog-mask/plot-suggestion) apply the same
/// "claimed realm, header alone is no longer enough" rule to their own
/// scoping via <see cref="CallerRealmResolver"/> instead, since none of them
/// take a settlement id to run this gate against directly.
/// </remarks>
internal static class OwnershipGate
{
    /// <summary>
    /// Carries the founding browser's client-local id (<c>player.id</c> on
    /// the frontend) — for an anonymous-owned settlement's mutating requests
    /// here, and as <see cref="CallerRealmResolver"/>'s fallback for the
    /// per-world read endpoints. Meaningless — and ignored, in favour of the
    /// caller's own realm — once a settlement is claimed by a real account,
    /// since the JWT itself proves ownership then.
    /// </summary>
    public const string OwnerIdHeaderName = "X-Owner-Id";

    public static async Task<IResult?> EnforceAsync(
        HttpContext httpContext,
        Guid settlementId,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpContext);
        ArgumentNullException.ThrowIfNull(realms);

        var ownership = await realms.GetOwnershipAsync(settlementId, cancellationToken);
        if (ownership is null)
        {
            // No such settlement — let the endpoint's own NotFound handling
            // answer, rather than this filter pre-empting it with a 403.
            return null;
        }

        var (userId, ownerId, _) = ownership.Value;
        return Owns(httpContext, userId, ownerId) ? null : Refuse();
    }

    /// <summary>
    /// The "owns any of these settlements" counterpart to <see cref="EnforceAsync"/> —
    /// used where a resource (a battle report) legitimately belongs to more
    /// than one settlement at once, see <see cref="ReportOwnershipEndpointFilter"/>/
    /// <see cref="FieldReportOwnershipEndpointFilter"/>. Reuses the exact same
    /// per-settlement JWT/header rule as <see cref="EnforceAsync"/> — a caller
    /// passes as soon as one settlement id matches.
    /// </summary>
    /// <remarks>
    /// A settlement id whose ownership lookup misses (deleted since, e.g. by a
    /// world reseed) is skipped, not treated as a match nor as a pass-through:
    /// unlike <see cref="EnforceAsync"/>'s single id, this filter's ids come
    /// from a report that already recorded them at battle time, so a miss
    /// here means "gone", not "never existed" — there is no NotFound for the
    /// endpoint's own handler to answer with instead, so a caller who matches
    /// nothing is refused rather than let through.
    /// </remarks>
    public static async Task<IResult?> EnforceAnyAsync(
        HttpContext httpContext,
        IReadOnlyList<Guid> settlementIds,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpContext);
        ArgumentNullException.ThrowIfNull(realms);

        foreach (var settlementId in settlementIds)
        {
            var ownership = await realms.GetOwnershipAsync(settlementId, cancellationToken);
            if (ownership is null)
            {
                continue;
            }

            var (userId, ownerId, _) = ownership.Value;
            if (Owns(httpContext, userId, ownerId))
            {
                return null;
            }
        }

        return Refuse();
    }

    /// <summary>
    /// The single-settlement ownership test <see cref="EnforceAsync"/>/
    /// <see cref="EnforceAnyAsync"/> both reduce to — <c>internal</c> (not
    /// <c>private</c>) so a handler that must gate itself in-handler with a
    /// more elaborate rule than either of those (e.g.
    /// <c>ArmyEndpoints.ListGuestArmies</c>'s "host sees all, a guest's own
    /// owner sees only their own") can still reuse this exact JWT/header
    /// rule instead of re-deriving it.
    /// </summary>
    internal static bool Owns(HttpContext httpContext, Guid settlementUserId, string settlementOwnerId)
    {
        if (settlementUserId != SystemUserIds.Abandoned)
        {
            var user = httpContext.User;
            var idClaim = user.Identity?.IsAuthenticated == true
                ? user.FindFirstValue(ClaimTypes.NameIdentifier)
                : null;

            return Guid.TryParse(idClaim, out var callerId) && callerId == settlementUserId;
        }

        var headerOwnerId = httpContext.Request.Headers[OwnerIdHeaderName].ToString();
        return !string.IsNullOrEmpty(headerOwnerId) && headerOwnerId == settlementOwnerId;
    }

    private static IResult Refuse() =>
        Results.Json(new AuthErrorResponse("not_owner"), statusCode: StatusCodes.Status403Forbidden);
}
