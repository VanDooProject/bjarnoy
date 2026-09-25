using System.Security.Claims;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;

namespace Bjarnoy.Api.Auth;

/// <summary>How <see cref="CallerRealmResolver.ResolveAsync"/> settled a caller's realm.</summary>
internal enum CallerRealmOutcome
{
    /// <summary><see cref="CallerRealmResult.OwnerId"/> is the realm to act on.</summary>
    Resolved,

    /// <summary>
    /// No JWT realm and no <see cref="OwnershipGate.OwnerIdHeaderName"/> header
    /// either — the caller has given nothing to resolve a realm from at all.
    /// </summary>
    MissingHeader,

    /// <summary>
    /// The header names a realm that is already claimed by a different real
    /// account than the (possibly anonymous) caller. Distinct from
    /// <see cref="MissingHeader"/>: the caller gave an answer, it was just the
    /// wrong one — see <see cref="CallerRealmResolver"/>'s remarks for how
    /// each read endpoint turns this into a response.
    /// </summary>
    Refused,
}

/// <param name="Outcome">Which of the three cases above this is.</param>
/// <param name="OwnerId">Only set when <paramref name="Outcome"/> is <see cref="CallerRealmOutcome.Resolved"/>.</param>
internal readonly record struct CallerRealmResult(CallerRealmOutcome Outcome, string? OwnerId)
{
    public static CallerRealmResult Resolved(string ownerId) => new(CallerRealmOutcome.Resolved, ownerId);

    public static readonly CallerRealmResult MissingHeader = new(CallerRealmOutcome.MissingHeader, null);

    public static readonly CallerRealmResult Refused = new(CallerRealmOutcome.Refused, null);
}

/// <summary>
/// Resolves which <see cref="SettlementEntity.OwnerId"/> a read-only,
/// per-world request should act under — <c>GET .../membership</c>,
/// <c>.../fog-mask</c> and <c>.../plot-suggestion</c> (GET and DELETE). These
/// endpoints predate accounts and so were built purely around
/// <see cref="OwnershipGate.OwnerIdHeaderName"/>, which breaks the moment a
/// claimed player logs in from a browser that never founded anything: the
/// header they can offer is some other, unrelated local id, or none at all.
/// </summary>
/// <remarks>
/// <para>
/// Resolution order: if the caller carries an authenticated JWT, their
/// <em>own</em> realm in this world (<see cref="RealmDirectory.FindByUserAsync"/>)
/// wins outright — the header, if any, is not even consulted, since a real
/// account's identity is strictly stronger proof than a client-local id
/// anyone could send. This is also what makes a new-browser login work: the
/// resolved <see cref="CallerRealmResult.OwnerId"/> is the realm's
/// <em>original</em> founding <c>OwnerId</c>, not anything from this request —
/// exactly the id <c>FogMaskService</c>'s explored-tile history and the plot
/// reservation store are keyed by, so callers downstream (fog mask, plot
/// suggestion) need no changes of their own to work correctly off it.
/// </para>
/// <para>
/// Only once that fails (no JWT, or a JWT user with no realm here — they may
/// still have an unclaimed browser realm, or none at all) does the header
/// rule apply, unchanged from anonymous play: missing header is
/// <see cref="CallerRealmOutcome.MissingHeader"/> (a 400, same as before),
/// and a claimed realm under that header id whose account is not the caller
/// is <see cref="CallerRealmOutcome.Refused"/> — an unclaimed realm, or one
/// the caller genuinely owns, resolves normally. This is also what closes
/// problem 2: a bare local id can no longer read a realm's mask or plot state
/// once someone has actually claimed it.
/// </para>
/// <para>
/// <see cref="CallerRealmOutcome.Refused"/> is deliberately left for each
/// caller to translate: <c>GET .../membership</c> treats it as "no realm
/// here" (200, null settlement — it is a membership check, not an ownership
/// proof), while the fog-mask and plot-suggestion endpoints treat it as the
/// same 403 <c>not_owner</c> <see cref="Bjarnoy.Api.Contracts.AuthErrorResponse"/>
/// <see cref="OwnershipGate"/> uses for mutations.
/// </para>
/// </remarks>
internal static class CallerRealmResolver
{
    public static async Task<CallerRealmResult> ResolveAsync(
        HttpContext httpContext, Guid worldId, RealmDirectory realms, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(httpContext);
        ArgumentNullException.ThrowIfNull(realms);

        var user = httpContext.User;
        var idClaim = user.Identity?.IsAuthenticated == true
            ? user.FindFirstValue(ClaimTypes.NameIdentifier)
            : null;
        var callerUserId = Guid.TryParse(idClaim, out var parsedUserId) ? parsedUserId : (Guid?)null;

        if (callerUserId is { } uid)
        {
            var ownRealm = await realms.FindByUserAsync(worldId, uid, cancellationToken);
            if (ownRealm is not null)
            {
                return CallerRealmResult.Resolved(ownRealm.Value.OwnerId);
            }
        }

        var headerOwnerId = httpContext.Request.Headers[OwnershipGate.OwnerIdHeaderName].ToString();
        if (string.IsNullOrEmpty(headerOwnerId))
        {
            return CallerRealmResult.MissingHeader;
        }

        var headerRealm = await realms.FindByOwnerAsync(worldId, headerOwnerId, cancellationToken);
        if (headerRealm is { UserId: var owningUserId }
            && owningUserId != SystemUserIds.Abandoned
            && owningUserId != callerUserId)
        {
            return CallerRealmResult.Refused;
        }

        return CallerRealmResult.Resolved(headerOwnerId);
    }
}
