using System.Net;
using System.Net.Http.Headers;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The notification_outbox → <c>PushDeliveryService</c> chain, and the
/// direct-message hook that feeds it — see
/// <c>docs/plans/push-notifications.md</c>. Uses <see cref="RecordingPushSender"/>
/// instead of a real push service (<see cref="BjarnoyApiFactory.WithPush"/>).
/// </summary>
public sealed class NotificationDeliveryTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string UniqueName(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

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

    private static async Task SubscribeAsync(HttpClient client, string endpoint = "https://push.example/dev")
    {
        var response = await client.PutJsonAsync(
            "/api/v1/notifications/subscriptions",
            new UpsertPushSubscriptionRequest(endpoint, "p256dh", "auth", "Test Device", null),
            Ct);
        Assert.True(response.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK);
    }

    private static async Task<int> OutboxCountAsync(BjarnoyApiFactory factory, Guid userId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.NotificationOutbox.CountAsync(o => o.UserId == userId, Ct);
    }

    [Fact]
    public async Task Sending_a_message_enqueues_exactly_one_outbox_row_which_the_delivery_worker_then_sends()
    {
        await using var factory = BjarnoyApiFactory.Sqlite().WithPush();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();

        var (senderToken, _) = await RegisterAsync(client);
        var (recipientToken, recipientId) = await RegisterAsync(client);

        Authorize(client, recipientToken);
        await SubscribeAsync(client);

        Authorize(client, senderToken);
        var sent = await client.PostJsonAsync(
            "/api/v1/messages", new SendMessageRequest(recipientId, "Hello there!"), Ct);
        Assert.Equal(HttpStatusCode.Created, sent.StatusCode);

        Assert.Equal(1, await OutboxCountAsync(factory, recipientId));

        // Sending doesn't itself deliver — the outbox row is unsent until
        // the delivery worker's next pass.
        Assert.Empty(factory.PushSender.Sent);

        await factory.DeliverDueNotificationsAsync(Ct);

        var sentPush = Assert.Single(factory.PushSender.Sent);
        Assert.Contains("Hello there", sentPush.PayloadJson);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var row = await db.NotificationOutbox.SingleAsync(o => o.UserId == recipientId, Ct);
            Assert.NotNull(row.SentAt);
        }
    }

    [Fact]
    public async Task A_410_response_deletes_the_subscription_without_failing_the_outbox_row()
    {
        await using var factory = BjarnoyApiFactory.Sqlite().WithPush();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();

        var (senderToken, _) = await RegisterAsync(client);
        var (recipientToken, recipientId) = await RegisterAsync(client);

        Authorize(client, recipientToken);
        await SubscribeAsync(client);

        Authorize(client, senderToken);
        await client.PostJsonAsync("/api/v1/messages", new SendMessageRequest(recipientId, "hi"), Ct);

        factory.PushSender.NextOutcome = new PushSendResult(PushSendOutcome.Gone, "410");
        await factory.DeliverDueNotificationsAsync(Ct);

        Authorize(client, recipientToken);
        var subscriptions = await client.GetAsync("/api/v1/notifications/subscriptions", Ct);
        var list = await subscriptions.ReadStrictAsync<List<PushSubscriptionResponse>>(Ct);
        Assert.Empty(list);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var row = await db.NotificationOutbox.SingleAsync(o => o.UserId == recipientId, Ct);
            Assert.NotNull(row.SentAt);
        }
    }

    [Fact]
    public async Task Repeated_transient_failures_retry_then_give_up_after_five_attempts()
    {
        await using var factory = BjarnoyApiFactory.Sqlite().WithPush();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();

        var (senderToken, _) = await RegisterAsync(client);
        var (recipientToken, recipientId) = await RegisterAsync(client);

        Authorize(client, recipientToken);
        await SubscribeAsync(client);

        Authorize(client, senderToken);
        await client.PostJsonAsync("/api/v1/messages", new SendMessageRequest(recipientId, "hi"), Ct);

        factory.PushSender.NextOutcome = new PushSendResult(PushSendOutcome.TransientFailure, "503");

        for (var attempt = 1; attempt <= 5; attempt++)
        {
            await factory.DeliverDueNotificationsAsync(Ct);

            await using var scope = factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var row = await db.NotificationOutbox.SingleAsync(o => o.UserId == recipientId, Ct);
            Assert.Equal(attempt, row.Attempts);

            if (attempt < 5)
            {
                Assert.Null(row.SentAt);
            }
            else
            {
                Assert.NotNull(row.SentAt);
                Assert.NotNull(row.LastError);
            }
        }

        // The same 5 delivery attempts against the same subscription also
        // give up on the device itself (FailureCount and row.Attempts climb
        // together when there's only one row in play) — see the dedicated
        // per-subscription-failure test below for the case where several
        // rows retry against one subscription in the same poll.
        Authorize(client, recipientToken);
        var subscriptions = await client.GetAsync("/api/v1/notifications/subscriptions", Ct);
        var list = await subscriptions.ReadStrictAsync<List<PushSubscriptionResponse>>(Ct);
        Assert.Empty(list);
    }

    [Fact]
    public async Task A_subscription_failing_on_every_row_in_one_poll_is_dropped_once_regardless_of_row_count()
    {
        await using var factory = BjarnoyApiFactory.Sqlite().WithPush();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();

        var (senderToken, _) = await RegisterAsync(client);
        var (recipientToken, recipientId) = await RegisterAsync(client);

        Authorize(client, recipientToken);
        await SubscribeAsync(client);

        // Several distinct messages, all still unsent when the poll runs —
        // one subscription, several outbox rows failing against it at once.
        Authorize(client, senderToken);
        for (var i = 0; i < 3; i++)
        {
            await client.PostJsonAsync("/api/v1/messages", new SendMessageRequest(recipientId, $"hi {i}"), Ct);
        }

        Assert.Equal(3, await OutboxCountAsync(factory, recipientId));

        factory.PushSender.NextOutcome = new PushSendResult(PushSendOutcome.TransientFailure, "503");
        await factory.DeliverDueNotificationsAsync(Ct);

        // Three failed sends in the same poll already reach FailureCount 3;
        // one more poll (any of the remaining unsent rows) pushes it to 5.
        await factory.DeliverDueNotificationsAsync(Ct);

        Authorize(client, recipientToken);
        var subscriptions = await client.GetAsync("/api/v1/notifications/subscriptions", Ct);
        var list = await subscriptions.ReadStrictAsync<List<PushSubscriptionResponse>>(Ct);
        Assert.Empty(list);
    }

    [Fact]
    public async Task A_locked_recipient_still_accumulates_an_outbox_row_but_delivery_skips_it()
    {
        await using var factory = BjarnoyApiFactory.Sqlite().WithPush();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();

        var (senderToken, _) = await RegisterAsync(client);
        var (recipientToken, recipientId) = await RegisterAsync(client);

        Authorize(client, recipientToken);
        await SubscribeAsync(client);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == recipientId, Ct);
            user.Status = UserStatus.Locked;
            await db.SaveChangesAsync(Ct);
        }

        Authorize(client, senderToken);
        await client.PostJsonAsync("/api/v1/messages", new SendMessageRequest(recipientId, "hi"), Ct);

        await factory.DeliverDueNotificationsAsync(Ct);

        Assert.Empty(factory.PushSender.Sent);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var row = await db.NotificationOutbox.SingleAsync(o => o.UserId == recipientId, Ct);
            Assert.NotNull(row.SentAt);
            Assert.Equal("user not active", row.LastError);
        }
    }

    [Fact]
    public async Task Sending_when_push_is_unconfigured_never_writes_an_outbox_row()
    {
        await using var factory = BjarnoyApiFactory.Sqlite();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();

        var (senderToken, _) = await RegisterAsync(client);
        var (recipientToken, recipientId) = await RegisterAsync(client);
        _ = recipientToken;

        Authorize(client, senderToken);
        var sent = await client.PostJsonAsync(
            "/api/v1/messages", new SendMessageRequest(recipientId, "hi"), Ct);
        Assert.Equal(HttpStatusCode.Created, sent.StatusCode);

        Assert.Equal(0, await OutboxCountAsync(factory, recipientId));
    }
}
