using System.Net;
using System.Net.Http.Headers;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Push subscription endpoints and the <c>Push</c>-unconfigured feature gate —
/// see <c>docs/plans/push-notifications.md</c>. Delivery itself (the outbox,
/// <c>PushDeliveryService</c>) is covered separately once that lands.
/// </summary>
public sealed class NotificationEndpointsTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string UniqueName(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

    private static UpsertPushSubscriptionRequest SubscriptionRequest(string? endpoint = null) => new(
        Endpoint: endpoint ?? $"https://push.example/{Guid.CreateVersion7():N}",
        P256dh: "test-p256dh-key",
        Auth: "test-auth-secret",
        DeviceLabel: "Chrome on Linux",
        UserAgent: "Mozilla/5.0 (test)");

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    private static async Task<(string AccessToken, Guid UserId)> RegisterAsync(HttpClient client)
    {
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(UniqueName("player"), "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);
        return (auth.AccessToken, auth.User.Id);
    }

    [Fact]
    public async Task Config_reports_disabled_when_push_is_unconfigured()
    {
        await using var factory = BjarnoyApiFactory.Sqlite();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/notifications/config", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var config = await response.ReadStrictAsync<NotificationConfigResponse>(Ct);
        Assert.False(config.Enabled);
        Assert.Null(config.VapidPublicKey);
    }

    [Fact]
    public async Task Config_reports_enabled_and_the_public_key_when_push_is_configured()
    {
        await using var factory = BjarnoyApiFactory.Sqlite().WithPush(vapidPublicKey: "the-public-key");
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/notifications/config", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var config = await response.ReadStrictAsync<NotificationConfigResponse>(Ct);
        Assert.True(config.Enabled);
        Assert.Equal("the-public-key", config.VapidPublicKey);
    }

    [Fact]
    public async Task Subscribing_when_push_is_unconfigured_is_not_found()
    {
        await using var factory = BjarnoyApiFactory.Sqlite();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();
        var (accessToken, _) = await RegisterAsync(client);
        Authorize(client, accessToken);

        var response = await client.PutJsonAsync(
            "/api/v1/notifications/subscriptions", SubscriptionRequest(), Ct);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Subscribing_requires_authentication()
    {
        await using var factory = BjarnoyApiFactory.Sqlite().WithPush();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();

        var response = await client.PutJsonAsync(
            "/api/v1/notifications/subscriptions", SubscriptionRequest(), Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_user_can_subscribe_list_and_delete_their_own_device()
    {
        await using var factory = BjarnoyApiFactory.Sqlite().WithPush();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();
        var (accessToken, _) = await RegisterAsync(client);
        Authorize(client, accessToken);

        var subscribed = await client.PutJsonAsync(
            "/api/v1/notifications/subscriptions", SubscriptionRequest(), Ct);
        Assert.Equal(HttpStatusCode.Created, subscribed.StatusCode);
        var subscription = await subscribed.ReadStrictAsync<PushSubscriptionResponse>(Ct);
        Assert.Equal("Chrome on Linux", subscription.DeviceLabel);

        // Endpoint/keys are never returned — the device already has them.
        var listed = await client.GetAsync("/api/v1/notifications/subscriptions", Ct);
        Assert.Equal(HttpStatusCode.OK, listed.StatusCode);
        var subscriptions = await listed.ReadStrictAsync<List<PushSubscriptionResponse>>(Ct);
        Assert.Single(subscriptions, s => s.Id == subscription.Id);

        var deleted = await client.DeleteAsync($"/api/v1/notifications/subscriptions/{subscription.Id}", Ct);
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        var listedAfter = await client.GetAsync("/api/v1/notifications/subscriptions", Ct);
        var subscriptionsAfter = await listedAfter.ReadStrictAsync<List<PushSubscriptionResponse>>(Ct);
        Assert.Empty(subscriptionsAfter);

        // Deleting it again is a 404, not a repeat success.
        var deletedAgain = await client.DeleteAsync($"/api/v1/notifications/subscriptions/{subscription.Id}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, deletedAgain.StatusCode);
    }

    [Fact]
    public async Task Subscribing_twice_with_the_same_endpoint_updates_the_existing_row()
    {
        await using var factory = BjarnoyApiFactory.Sqlite().WithPush();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();
        var (accessToken, _) = await RegisterAsync(client);
        Authorize(client, accessToken);

        var endpoint = $"https://push.example/{Guid.CreateVersion7():N}";
        var first = await client.PutJsonAsync(
            "/api/v1/notifications/subscriptions", SubscriptionRequest(endpoint), Ct);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var firstSubscription = await first.ReadStrictAsync<PushSubscriptionResponse>(Ct);

        var second = await client.PutJsonAsync(
            "/api/v1/notifications/subscriptions",
            SubscriptionRequest(endpoint) with { DeviceLabel = "Chrome on Linux (renamed)" },
            Ct);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var secondSubscription = await second.ReadStrictAsync<PushSubscriptionResponse>(Ct);

        Assert.Equal(firstSubscription.Id, secondSubscription.Id);
        Assert.Equal("Chrome on Linux (renamed)", secondSubscription.DeviceLabel);

        var listed = await client.GetAsync("/api/v1/notifications/subscriptions", Ct);
        var subscriptions = await listed.ReadStrictAsync<List<PushSubscriptionResponse>>(Ct);
        Assert.Single(subscriptions);
    }

    [Fact]
    public async Task Subscribing_to_an_endpoint_already_owned_by_another_user_reparents_it()
    {
        await using var factory = BjarnoyApiFactory.Sqlite().WithPush();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();

        var (firstAccessToken, firstUserId) = await RegisterAsync(client);
        var endpoint = $"https://push.example/{Guid.CreateVersion7():N}";
        Authorize(client, firstAccessToken);
        var subscribed = await client.PutJsonAsync(
            "/api/v1/notifications/subscriptions", SubscriptionRequest(endpoint), Ct);
        var subscription = await subscribed.ReadStrictAsync<PushSubscriptionResponse>(Ct);

        // Someone else logs in on the same browser (a shared device, or an
        // account switch) and subscribes with the same endpoint.
        var (secondAccessToken, secondUserId) = await RegisterAsync(client);
        Authorize(client, secondAccessToken);
        var reparented = await client.PutJsonAsync(
            "/api/v1/notifications/subscriptions", SubscriptionRequest(endpoint), Ct);
        Assert.Equal(HttpStatusCode.OK, reparented.StatusCode);
        var reparentedSubscription = await reparented.ReadStrictAsync<PushSubscriptionResponse>(Ct);
        Assert.Equal(subscription.Id, reparentedSubscription.Id);

        // It's now the second user's device, not the first's.
        var secondUserList = await client.GetAsync("/api/v1/notifications/subscriptions", Ct);
        var secondUserSubscriptions = await secondUserList.ReadStrictAsync<List<PushSubscriptionResponse>>(Ct);
        Assert.Single(secondUserSubscriptions, s => s.Id == subscription.Id);

        Authorize(client, firstAccessToken);
        var firstUserList = await client.GetAsync("/api/v1/notifications/subscriptions", Ct);
        var firstUserSubscriptions = await firstUserList.ReadStrictAsync<List<PushSubscriptionResponse>>(Ct);
        Assert.Empty(firstUserSubscriptions);

        Assert.NotEqual(firstUserId, secondUserId);
    }

    [Fact]
    public async Task A_user_cannot_delete_another_users_subscription()
    {
        await using var factory = BjarnoyApiFactory.Sqlite().WithPush();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();

        var (ownerAccessToken, _) = await RegisterAsync(client);
        Authorize(client, ownerAccessToken);
        var subscribed = await client.PutJsonAsync(
            "/api/v1/notifications/subscriptions", SubscriptionRequest(), Ct);
        var subscription = await subscribed.ReadStrictAsync<PushSubscriptionResponse>(Ct);

        var (otherAccessToken, _) = await RegisterAsync(client);
        Authorize(client, otherAccessToken);

        // A foreign id is a 404, never a 403 — the route never confirms
        // whether a given subscription id exists at all.
        var deleted = await client.DeleteAsync($"/api/v1/notifications/subscriptions/{subscription.Id}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, deleted.StatusCode);

        Authorize(client, ownerAccessToken);
        var stillThere = await client.GetAsync("/api/v1/notifications/subscriptions", Ct);
        var subscriptions = await stillThere.ReadStrictAsync<List<PushSubscriptionResponse>>(Ct);
        Assert.Single(subscriptions, s => s.Id == subscription.Id);
    }

    [Fact]
    public async Task A_locked_user_is_refused_mutating_notification_endpoints()
    {
        await using var factory = BjarnoyApiFactory.Sqlite().WithPush();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();
        var (accessToken, userId) = await RegisterAsync(client);
        Authorize(client, accessToken);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == userId, Ct);
            user.Status = UserStatus.Locked;
            await db.SaveChangesAsync(Ct);
        }

        var response = await client.PutJsonAsync(
            "/api/v1/notifications/subscriptions", SubscriptionRequest(), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        // Reads stay open to a locked account — same as everywhere else
        // ActiveUserEndpointFilter is used.
        var listed = await client.GetAsync("/api/v1/notifications/subscriptions", Ct);
        Assert.Equal(HttpStatusCode.OK, listed.StatusCode);
    }
}
