using System.Security.Claims;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.Auth;

/// <summary>
/// Rejects a request with 403 unless the caller is authenticated <em>and</em>
/// their live <see cref="Infrastructure.Entities.UserEntity.IsPremium"/> flag
/// is set (issue #40 phase 7) — gates the premium fight simulator
/// (<c>SimulatorEndpoints</c>).
/// </summary>
/// <remarks>
/// <para>
/// Deliberately the opposite posture from <see cref="ActiveUserEndpointFilter"/>:
/// that filter is transparent to anonymous callers because this repo's
/// ordinary game actions must keep working for anonymous play. "Premium" is
/// meaningless for an anonymous caller — there is no account to be premium on
/// — so this is the one place in the API that actually requires
/// authentication. An unauthenticated request and an authenticated-but-not-
/// premium request are both refused the same way, with 403.
/// </para>
/// <para>
/// Checked against a live database read (<see cref="AuthService.GetIsPremiumAsync"/>),
/// not a JWT claim, so a premium grant or revocation takes effect on the next
/// request rather than only once a stale access token expires — same
/// reasoning as <see cref="ActiveUserEndpointFilter"/>'s ban/lock check.
/// </para>
/// </remarks>
public sealed class PremiumUserEndpointFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(next);

        var user = context.HttpContext.User;
        var idClaim = user.Identity?.IsAuthenticated == true
            ? user.FindFirstValue(ClaimTypes.NameIdentifier)
            : null;

        if (!Guid.TryParse(idClaim, out var userId))
        {
            // Not authenticated at all (or an unparseable/missing subject
            // claim) — refused outright, unlike ActiveUserEndpointFilter,
            // which stays transparent to anonymous callers.
            return Results.Json(
                new AuthErrorResponse("authentication_required"), statusCode: StatusCodes.Status401Unauthorized);
        }

        // Resolved from RequestServices, not constructor-injected — see
        // ActiveUserEndpointFilter's identical remark: this filter is built
        // once at endpoint-build time via the root service provider, which
        // cannot hand out a Scoped service like AuthService.
        var authService = context.HttpContext.RequestServices.GetRequiredService<AuthService>();
        var isPremium = await authService.GetIsPremiumAsync(userId, context.HttpContext.RequestAborted);

        if (isPremium != true)
        {
            return Results.Json(
                new AuthErrorResponse("premium_required"), statusCode: StatusCodes.Status403Forbidden);
        }

        return await next(context);
    }
}
