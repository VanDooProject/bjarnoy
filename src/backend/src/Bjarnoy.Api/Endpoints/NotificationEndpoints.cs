using System.Security.Claims;
using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.Hosting;
using Bjarnoy.Infrastructure.Services.Notifications;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Push notification subscriptions (Web Push/VAPID) — see
/// <c>docs/plans/push-notifications.md</c>. Subscriptions belong to
/// accounts, never to the legacy anonymous <c>OwnerId</c>, so every mutating
/// route here requires auth. <see cref="GetConfig"/> is the one anonymous
/// route: the service worker's subscribe call needs the public VAPID key
/// before a user is necessarily logged in on that device yet.
/// </summary>
public static class NotificationEndpoints
{
    public static IEndpointRouteBuilder MapNotificationEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var notifications = app.MapGroup("/api/v1/notifications")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Notifications");

        notifications.MapGet("/config", GetConfig)
            .WithName("GetNotificationConfig")
            .WithSummary("Whether push is enabled in this environment, and the public VAPID key.");

        // Read-only, so a locked account (which may still log in) can see its
        // own devices even though it's refused subscribing/unsubscribing one
        // — same "reads stay open, mutations are gated" split as ProfileEndpoints.
        notifications.MapGet("/subscriptions", ListSubscriptions)
            .WithName("ListPushSubscriptions")
            .WithSummary("The caller's own push-subscribed devices.")
            .RequireAuthorization();

        notifications.MapPut("/subscriptions", UpsertSubscription)
            .WithName("UpsertPushSubscription")
            .WithSummary("Subscribes this device, or updates its subscription if it already exists.")
            .RequireAuthorization()
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .AddEndpointFilter<UserActivityEndpointFilter>();

        notifications.MapDelete("/subscriptions/{subscriptionId:guid}", DeleteSubscription)
            .WithName("DeletePushSubscription")
            .WithSummary("Unsubscribes one of the caller's own devices.")
            .RequireAuthorization()
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .AddEndpointFilter<UserActivityEndpointFilter>();

        return app;
    }

    private static Ok<NotificationConfigResponse> GetConfig(IOptions<PushOptions> pushOptions)
    {
        var options = pushOptions.Value;
        return TypedResults.Ok(new NotificationConfigResponse(
            options.IsConfigured, options.IsConfigured ? options.VapidPublicKey : null));
    }

    private static async Task<Results<Ok<List<PushSubscriptionResponse>>, NotFound>> ListSubscriptions(
        NotificationSubscriptionService subscriptionService,
        IOptions<PushOptions> pushOptions,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        if (!pushOptions.Value.IsConfigured)
        {
            return TypedResults.NotFound();
        }

        var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var subscriptions = await subscriptionService.ListForUserAsync(userId, cancellationToken);
        return TypedResults.Ok(subscriptions.ConvertAll(PushSubscriptionResponse.From));
    }

    private static async Task<Results<Ok<PushSubscriptionResponse>, Created<PushSubscriptionResponse>, NotFound>> UpsertSubscription(
        UpsertPushSubscriptionRequest request,
        NotificationSubscriptionService subscriptionService,
        IOptions<PushOptions> pushOptions,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!pushOptions.Value.IsConfigured)
        {
            return TypedResults.NotFound();
        }

        var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var (created, subscription) = await subscriptionService.UpsertAsync(
            userId, request.Endpoint, request.P256dh, request.Auth, request.DeviceLabel, request.UserAgent, cancellationToken);

        var response = PushSubscriptionResponse.From(subscription);
        return created
            ? TypedResults.Created($"/api/v1/notifications/subscriptions/{subscription.Id}", response)
            : TypedResults.Ok(response);
    }

    private static async Task<Results<NoContent, NotFound>> DeleteSubscription(
        Guid subscriptionId,
        NotificationSubscriptionService subscriptionService,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var outcome = await subscriptionService.DeleteAsync(userId, subscriptionId, cancellationToken);

        // Own rows only — a foreign id is a 404, never a 403, so the route
        // never confirms whether a given subscription id exists at all.
        return outcome == SubscriptionDeleteOutcome.Deleted
            ? TypedResults.NoContent()
            : TypedResults.NotFound();
    }
}
