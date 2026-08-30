using System.Security.Claims;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Api.Auth;

/// <summary>
/// Records that the caller did something, right now, whenever a request is
/// authenticated — modeled on <see cref="ActiveUserEndpointFilter"/>: it is
/// transparent to an anonymous request (no owner-auth yet on most game
/// actions, so anonymous play must keep working unaffected), and only acts
/// when a valid JWT is present.
/// </summary>
/// <remarks>
/// Tracking failure must never fail the request it's riding along on — a
/// blip talking to the database here would otherwise turn "we couldn't log
/// that you were active" into "the settlement build you were trying to queue
/// also failed", which is a far worse trade. So any exception from
/// <see cref="IUserActivityTracker.TrackAsync"/> is caught and logged, not
/// rethrown.
/// </remarks>
public sealed class UserActivityEndpointFilter : IEndpointFilter
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
                // Resolved from RequestServices, not constructor-injected —
                // same reasoning as ActiveUserEndpointFilter: this filter is
                // built once at endpoint-build time via the root service
                // provider, which cannot hand out a Scoped service.
                var tracker = context.HttpContext.RequestServices.GetRequiredService<IUserActivityTracker>();
                try
                {
                    await tracker.TrackAsync(userId, context.HttpContext.RequestAborted);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    var logger = context.HttpContext.RequestServices
                        .GetRequiredService<ILoggerFactory>()
                        .CreateLogger<UserActivityEndpointFilter>();
                    logger.LogWarning(ex, "Failed to record user activity for {UserId}.", userId);
                }
            }
        }

        return await next(context);
    }
}
