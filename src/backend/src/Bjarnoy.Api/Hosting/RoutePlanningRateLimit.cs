using System.Security.Claims;
using System.Threading.RateLimiting;
using Bjarnoy.Api.Auth;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Api.Hosting;

/// <summary>
/// The per-player limit on requests that run the route search (dispatching, recalling, field orders, re-targeting a
/// founding convoy, sending a guest home). A search is bounded but can cost ~50 ms on a long detour, so one player
/// firing them in a loop must not be able to hog the API. Bound from the <c>RoutePlanningRateLimit</c> section.
/// </summary>
public sealed class RoutePlanningRateLimitOptions
{
    public const string SectionName = "RoutePlanningRateLimit";

    /// <summary>The name of the rate-limiter policy the army endpoints opt into.</summary>
    public const string PolicyName = "route-planning";

    /// <summary>The <c>rejection</c> code the 429 body carries, which the frontend maps to a text.</summary>
    public const string RejectionCode = "RouteRateLimited";

    /// <summary>How many route-planning requests one player may make per window.</summary>
    public int PermitLimit { get; set; } = 30;

    /// <summary>Length of the sliding window, in seconds.</summary>
    public int WindowSeconds { get; set; } = 60;

    /// <summary>How many segments the window is divided into (the window slides one segment at a time).</summary>
    public int Segments { get; set; } = 6;
}

public static class RoutePlanningRateLimit
{
    /// <summary>
    /// Registers the <see cref="RoutePlanningRateLimitOptions.PolicyName"/> policy: a sliding window per player (the
    /// authenticated user id, which for an API key is its owner; the remote IP when there is no user), no queueing,
    /// and a 429 ProblemDetails with <c>rejection</c> = <c>RouteRateLimited</c> and <c>Retry-After</c>.
    /// </summary>
    public static IServiceCollection AddRoutePlanningRateLimit(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<RoutePlanningRateLimitOptions>()
            .Bind(configuration.GetSection(RoutePlanningRateLimitOptions.SectionName));

        services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            limiter.AddPolicy(RoutePlanningRateLimitOptions.PolicyName, httpContext =>
            {
                var options = httpContext.RequestServices.GetRequiredService<IOptions<RoutePlanningRateLimitOptions>>().Value;
                return RateLimitPartition.GetSlidingWindowLimiter(PartitionKey(httpContext), _ => new SlidingWindowRateLimiterOptions
                {
                    PermitLimit = options.PermitLimit,
                    Window = TimeSpan.FromSeconds(options.WindowSeconds),
                    SegmentsPerWindow = options.Segments,
                    QueueLimit = 0,
                });
            });

            limiter.OnRejected = async (context, cancellationToken) =>
            {
                var response = context.HttpContext.Response;
                response.StatusCode = StatusCodes.Status429TooManyRequests;

                var options = context.HttpContext.RequestServices.GetRequiredService<IOptions<RoutePlanningRateLimitOptions>>().Value;
                var retryAfter = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var delay)
                    ? (int)Math.Ceiling(delay.TotalSeconds)
                    : options.WindowSeconds / Math.Max(1, options.Segments);
                response.Headers.RetryAfter = Math.Max(1, retryAfter).ToString(System.Globalization.CultureInfo.InvariantCulture);

                var problem = new ProblemDetails
                {
                    Title = "Too many marching orders.",
                    Detail = "Route planning is limited per player; wait a moment and try again.",
                    Status = StatusCodes.Status429TooManyRequests,
                };
                problem.Extensions["rejection"] = RoutePlanningRateLimitOptions.RejectionCode;
                await response.WriteAsJsonAsync(problem, cancellationToken).ConfigureAwait(false);
            };
        });

        return services;
    }

    private static string PartitionKey(HttpContext httpContext)
    {
        var user = httpContext.User;
        var idClaim = user.Identity?.IsAuthenticated == true ? user.FindFirstValue(ClaimTypes.NameIdentifier) : null;
        if (Guid.TryParse(idClaim, out var userId))
        {
            return $"user:{userId}";
        }

        // A player without an account is identified by the client-local owner id their settlements are proven with.
        var ownerId = OwnershipGate.CallerOwnerId(httpContext);
        return string.IsNullOrEmpty(ownerId)
            ? $"ip:{httpContext.Connection.RemoteIpAddress}"
            : $"owner:{ownerId}";
    }
}
