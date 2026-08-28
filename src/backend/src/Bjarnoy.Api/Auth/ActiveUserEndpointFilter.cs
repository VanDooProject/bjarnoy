using System.Security.Claims;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.Auth;

/// <summary>
/// Rejects a request from a Locked or Banned user with 403, checked against
/// live database status rather than a token claim (so a ban/lock takes effect
/// immediately, not only once a stale access token expires).
/// </summary>
/// <remarks>
/// Deliberately an endpoint filter rather than an authorization policy: an
/// authorization policy on an endpoint demands authentication, which would
/// break anonymous play — this repo still has no real owner-auth on
/// settlements (see docs/tech/backend.md, "Not in here yet"), so an
/// unauthenticated caller must keep working exactly as before. This filter
/// only acts when the request <em>is</em> authenticated; it is transparent to
/// anonymous requests either way, since <c>UseAuthentication</c> populates
/// <see cref="HttpContext.User"/> when a token is present without requiring
/// one.
/// </remarks>
public sealed class ActiveUserEndpointFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(next);

        var user = context.HttpContext.User;
        if (user.Identity?.IsAuthenticated == true)
        {
            var idClaim = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (Guid.TryParse(idClaim, out var userId))
            {
                // Resolved from RequestServices, not constructor-injected: this
                // filter is constructed once at endpoint-build time via the
                // root service provider, which cannot hand out a Scoped
                // service like AuthService (it can only be resolved per
                // request).
                var authService = context.HttpContext.RequestServices.GetRequiredService<AuthService>();
                var status = await authService.GetStatusAsync(userId, context.HttpContext.RequestAborted);
                switch (status)
                {
                    case UserStatus.Banned:
                        return Results.Json(
                            new AuthErrorResponse("user_banned"), statusCode: StatusCodes.Status403Forbidden);
                    case UserStatus.Locked:
                        return Results.Json(
                            new AuthErrorResponse("user_locked"), statusCode: StatusCodes.Status403Forbidden);
                }
            }
        }

        return await next(context);
    }
}
