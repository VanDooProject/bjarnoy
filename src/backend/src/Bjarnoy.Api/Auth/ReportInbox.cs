using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Auth;

/// <summary>
/// The shared answers of the per-player report lists (battle, field battle, camp, trade): a player's reports are listed
/// by the realm <see cref="CallerRealmResolver"/> resolves for the caller in a world, one inbox across all their
/// settlements.
/// </summary>
internal static class ReportInbox
{
    public static BadRequest<ProblemDetails> MissingOwnerId() => TypedResults.BadRequest(new ProblemDetails
    {
        Title = "Missing owner id.",
        Detail = $"The '{OwnershipGate.OwnerIdHeaderName}' header is required.",
        Status = StatusCodes.Status400BadRequest,
    });

    public static JsonHttpResult<AuthErrorResponse> NotOwner() =>
        TypedResults.Json(new AuthErrorResponse("not_owner"), statusCode: StatusCodes.Status403Forbidden);

    /// <summary>The owner id of the caller's realm in <paramref name="worldId"/>, or null when it does not resolve.</summary>
    public static async Task<string?> ViewerOwnerIdAsync(
        HttpContext httpContext, Guid worldId, RealmDirectory realms, CancellationToken cancellationToken)
    {
        var realm = await CallerRealmResolver.ResolveAsync(httpContext, worldId, realms, cancellationToken);
        return realm.Outcome == CallerRealmOutcome.Resolved ? realm.OwnerId : null;
    }

    /// <summary>
    /// Whether the caller's realm in <paramref name="worldId"/> is one of <paramref name="reportOwnerIds"/> — the rule for
    /// reading a single report by id (either party of a battle or trade may).
    /// </summary>
    public static async Task<bool> CallerIsPartyAsync(
        HttpContext httpContext, Guid worldId, IReadOnlyList<string> reportOwnerIds, RealmDirectory realms, CancellationToken cancellationToken)
    {
        var realm = await CallerRealmResolver.ResolveAsync(httpContext, worldId, realms, cancellationToken);
        return realm.Outcome == CallerRealmOutcome.Resolved && reportOwnerIds.Contains(realm.OwnerId!);
    }
}
