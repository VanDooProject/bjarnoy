using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// The player-facing activity surface: a lightweight heartbeat a client can
/// ping periodically while its tab is focused and visible, to cover the case
/// where a logged-in user has the app open but isn't triggering any other
/// authenticated request (which would otherwise record activity via
/// <see cref="UserActivityEndpointFilter"/> on its own). The handler does
/// nothing itself — <see cref="UserActivityEndpointFilter"/> on this group
/// does the actual tracking, same as every other authenticated endpoint.
/// </summary>
public static class ActivityEndpoints
{
    public static IEndpointRouteBuilder MapActivityEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var activity = app.MapGroup("/api/v1/activity")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Activity");

        activity.MapPost("/heartbeat", Heartbeat)
            .WithName("ActivityHeartbeat")
            .WithSummary("Records that the caller's tab is open, focused, and visible.")
            .RequireAuthorization()
            .AddEndpointFilter<UserActivityEndpointFilter>();

        return app;
    }

    private static IResult Heartbeat() => Results.NoContent();
}
