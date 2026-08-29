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
/// Player-to-player direct messages, reporting a message to moderation, and
/// the admin report queue — issue #41. Covers the guild-scoped read-receipt
/// rule (<see cref="UserEntity.GuildId"/> has no real guild system behind it
/// yet, so these tests set it directly on the entity to exercise the rule).
/// </summary>
public sealed class ChatEndpointsTests(SqliteApiFixture fixture) : IClassFixture<SqliteApiFixture>
{
    private readonly SqliteApiFixture _fixture = fixture;

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string UniqueName(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    private async Task<(string UserName, string AccessToken, Guid UserId)> CreatePlayerAsync(HttpClient client)
    {
        var userName = UniqueName("player");
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);
        return (userName, auth.AccessToken, auth.User.Id);
    }

    private async Task<(string AccessToken, Guid UserId)> CreateAdminAsync(HttpClient client)
    {
        var userName = UniqueName("admin");
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == auth.User.Id, Ct);
            user.Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var loggedIn = await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, loggedIn.StatusCode);
        var loggedInAuth = await loggedIn.ReadStrictAsync<AuthResponse>(Ct);
        return (loggedInAuth.AccessToken, auth.User.Id);
    }

    private async Task PutInSameGuildAsync(Guid userIdA, Guid userIdB)
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var guildId = Guid.CreateVersion7();
        var users = await db.Users.Where(u => u.Id == userIdA || u.Id == userIdB).ToListAsync(Ct);
        foreach (var user in users)
        {
            user.GuildId = guildId;
        }
        await db.SaveChangesAsync(Ct);
    }

    [Fact]
    public async Task Anonymous_caller_is_refused_the_chat_surface()
    {
        using var client = _fixture.CreateClient();
        var response = await client.GetAsync("/api/v1/messages/conversations", Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_player_can_send_a_message_and_the_recipient_can_read_it()
    {
        using var senderClient = _fixture.CreateClient();
        using var recipientClient = _fixture.CreateClient();
        var (_, senderToken, senderId) = await CreatePlayerAsync(senderClient);
        var (_, recipientToken, recipientId) = await CreatePlayerAsync(recipientClient);
        Authorize(senderClient, senderToken);
        Authorize(recipientClient, recipientToken);

        var sent = await senderClient.PostJsonAsync(
            "/api/v1/messages", new SendMessageRequest(recipientId, "Skål!"), Ct);
        Assert.Equal(HttpStatusCode.Created, sent.StatusCode);
        var message = await sent.ReadStrictAsync<MessageResponse>(Ct);
        Assert.Equal("Skål!", message.Body);
        Assert.Equal(senderId, message.SenderUserId);
        Assert.False(message.ReadReceiptVisible);

        var conversation = await recipientClient.GetAsync($"/api/v1/messages/conversations/{senderId}", Ct);
        Assert.Equal(HttpStatusCode.OK, conversation.StatusCode);
        var page = await conversation.ReadStrictAsync<PagedMessagesResponse>(Ct);
        Assert.Single(page.Items);
        Assert.Equal("Skål!", page.Items[0].Body);

        var conversations = await recipientClient.GetAsync("/api/v1/messages/conversations", Ct);
        Assert.Equal(HttpStatusCode.OK, conversations.StatusCode);
        var list = await conversations.ReadStrictAsync<PagedConversationsResponse>(Ct);
        Assert.Single(list.Items, c => c.OtherUserId == senderId && c.UnreadCount == 1);
    }

    [Fact]
    public async Task Messaging_yourself_is_rejected_and_a_missing_recipient_is_not_found()
    {
        using var client = _fixture.CreateClient();
        var (_, token, userId) = await CreatePlayerAsync(client);
        Authorize(client, token);

        var toSelf = await client.PostJsonAsync("/api/v1/messages", new SendMessageRequest(userId, "hi me"), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, toSelf.StatusCode);

        var toMissing = await client.PostJsonAsync(
            "/api/v1/messages", new SendMessageRequest(Guid.CreateVersion7(), "hi?"), Ct);
        Assert.Equal(HttpStatusCode.NotFound, toMissing.StatusCode);
    }

    [Fact]
    public async Task Marking_a_conversation_read_clears_unread_count_and_records_read_at()
    {
        using var senderClient = _fixture.CreateClient();
        using var recipientClient = _fixture.CreateClient();
        var (_, senderToken, senderId) = await CreatePlayerAsync(senderClient);
        var (_, recipientToken, recipientId) = await CreatePlayerAsync(recipientClient);
        Authorize(senderClient, senderToken);
        Authorize(recipientClient, recipientToken);

        await senderClient.PostJsonAsync("/api/v1/messages", new SendMessageRequest(recipientId, "one"), Ct);
        await senderClient.PostJsonAsync("/api/v1/messages", new SendMessageRequest(recipientId, "two"), Ct);

        var markRead = await recipientClient.PostAsync($"/api/v1/messages/conversations/{senderId}/read", null, Ct);
        Assert.Equal(HttpStatusCode.OK, markRead.StatusCode);
        var marked = await markRead.ReadStrictAsync<MarkReadResponse>(Ct);
        Assert.Equal(2, marked.MarkedRead);

        var conversations = await recipientClient.GetAsync("/api/v1/messages/conversations", Ct);
        var list = await conversations.ReadStrictAsync<PagedConversationsResponse>(Ct);
        Assert.Single(list.Items, c => c.OtherUserId == senderId && c.UnreadCount == 0);
    }

    [Fact]
    public async Task Read_receipt_is_only_visible_to_the_sender_when_both_are_in_the_same_guild()
    {
        using var senderClient = _fixture.CreateClient();
        using var recipientClient = _fixture.CreateClient();
        var (_, senderToken, senderId) = await CreatePlayerAsync(senderClient);
        var (_, recipientToken, recipientId) = await CreatePlayerAsync(recipientClient);
        Authorize(senderClient, senderToken);
        Authorize(recipientClient, recipientToken);

        await senderClient.PostJsonAsync("/api/v1/messages", new SendMessageRequest(recipientId, "hey"), Ct);
        await recipientClient.PostAsync($"/api/v1/messages/conversations/{senderId}/read", null, Ct);

        // Not in a guild together: the sender never sees ReadAt.
        var beforeGuild = await senderClient.GetAsync($"/api/v1/messages/conversations/{recipientId}", Ct);
        var beforePage = await beforeGuild.ReadStrictAsync<PagedMessagesResponse>(Ct);
        Assert.False(beforePage.Items[0].ReadReceiptVisible);
        Assert.Null(beforePage.Items[0].ReadAt);

        await PutInSameGuildAsync(senderId, recipientId);

        var afterGuild = await senderClient.GetAsync($"/api/v1/messages/conversations/{recipientId}", Ct);
        var afterPage = await afterGuild.ReadStrictAsync<PagedMessagesResponse>(Ct);
        Assert.True(afterPage.Items[0].ReadReceiptVisible);
        Assert.NotNull(afterPage.Items[0].ReadAt);

        // The recipient's own copy never carries the sender-only receipt flag.
        var recipientView = await recipientClient.GetAsync($"/api/v1/messages/conversations/{senderId}", Ct);
        var recipientPage = await recipientView.ReadStrictAsync<PagedMessagesResponse>(Ct);
        Assert.False(recipientPage.Items[0].ReadReceiptVisible);
    }

    [Fact]
    public async Task A_message_can_be_reported_and_an_admin_can_resolve_it()
    {
        using var senderClient = _fixture.CreateClient();
        using var recipientClient = _fixture.CreateClient();
        using var adminClient = _fixture.CreateClient();
        var (_, senderToken, _) = await CreatePlayerAsync(senderClient);
        var (_, recipientToken, recipientId) = await CreatePlayerAsync(recipientClient);
        Authorize(senderClient, senderToken);
        Authorize(recipientClient, recipientToken);

        var sent = await senderClient.PostJsonAsync(
            "/api/v1/messages", new SendMessageRequest(recipientId, "insult"), Ct);
        var message = await sent.ReadStrictAsync<MessageResponse>(Ct);

        var reported = await recipientClient.PostJsonAsync(
            $"/api/v1/messages/{message.Id}/report", new ReportMessageRequest("was rude"), Ct);
        Assert.Equal(HttpStatusCode.Created, reported.StatusCode);
        var report = await reported.ReadStrictAsync<ReportResponse>(Ct);
        Assert.Equal("chatMessage", report.SourceType);
        Assert.Equal("open", report.Status);
        Assert.Contains("insult", report.ContextSnapshot);

        // Reporting the same message again is idempotent.
        var reportedAgain = await recipientClient.PostJsonAsync(
            $"/api/v1/messages/{message.Id}/report", new ReportMessageRequest("still rude"), Ct);
        Assert.Equal(HttpStatusCode.OK, reportedAgain.StatusCode);
        var sameReport = await reportedAgain.ReadStrictAsync<ReportResponse>(Ct);
        Assert.Equal(report.Id, sameReport.Id);

        var (adminToken, _) = await CreateAdminAsync(adminClient);
        Authorize(adminClient, adminToken);

        var forbidden = await recipientClient.GetAsync("/api/v1/admin/reports", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        var listed = await adminClient.GetAsync("/api/v1/admin/reports?status=open", Ct);
        Assert.Equal(HttpStatusCode.OK, listed.StatusCode);
        var page = await listed.ReadStrictAsync<PagedReportsResponse>(Ct);
        Assert.Single(page.Items, r => r.Id == report.Id);

        var resolved = await adminClient.PostJsonAsync(
            $"/api/v1/admin/reports/{report.Id}/resolve", new ResolveReportRequest("resolved", "locked the sender"), Ct);
        Assert.Equal(HttpStatusCode.OK, resolved.StatusCode);
        var resolvedReport = await resolved.ReadStrictAsync<ReportResponse>(Ct);
        Assert.Equal("resolved", resolvedReport.Status);
        Assert.NotNull(resolvedReport.ResolvedAt);
    }

    [Fact]
    public async Task Reporting_a_message_the_caller_cannot_see_is_not_found()
    {
        using var senderClient = _fixture.CreateClient();
        using var recipientClient = _fixture.CreateClient();
        using var outsiderClient = _fixture.CreateClient();
        var (_, senderToken, _) = await CreatePlayerAsync(senderClient);
        var (_, _, recipientId) = await CreatePlayerAsync(recipientClient);
        var (_, outsiderToken, _) = await CreatePlayerAsync(outsiderClient);
        Authorize(senderClient, senderToken);
        Authorize(outsiderClient, outsiderToken);

        var sent = await senderClient.PostJsonAsync(
            "/api/v1/messages", new SendMessageRequest(recipientId, "private"), Ct);
        var message = await sent.ReadStrictAsync<MessageResponse>(Ct);

        var response = await outsiderClient.PostJsonAsync(
            $"/api/v1/messages/{message.Id}/report", new ReportMessageRequest("nosy"), Ct);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task A_locked_player_can_read_their_inbox_but_cannot_send_or_report()
    {
        using var playerClient = _fixture.CreateClient();
        using var otherClient = _fixture.CreateClient();
        using var adminClient = _fixture.CreateClient();
        var (_, playerToken, userId) = await CreatePlayerAsync(playerClient);
        var (_, otherToken, otherId) = await CreatePlayerAsync(otherClient);
        Authorize(otherClient, otherToken);

        var sent = await otherClient.PostJsonAsync("/api/v1/messages", new SendMessageRequest(userId, "hi"), Ct);
        var message = await sent.ReadStrictAsync<MessageResponse>(Ct);

        var (adminToken, _) = await CreateAdminAsync(adminClient);
        Authorize(adminClient, adminToken);
        var lockResponse = await adminClient.PostJsonAsync(
            $"/api/v1/admin/users/{userId}/status", new SetUserStatusRequest("locked"), Ct);
        Assert.Equal(HttpStatusCode.OK, lockResponse.StatusCode);

        // ActiveUserEndpointFilter checks live DB status, not the token's
        // claims, so the existing token keeps working without a re-login —
        // see AdminUserEndpointsTests.A_locked_user_can_still_log_in_but_a_mutating_game_action_is_refused.
        Authorize(playerClient, playerToken);

        var readInbox = await playerClient.GetAsync("/api/v1/messages/conversations", Ct);
        Assert.Equal(HttpStatusCode.OK, readInbox.StatusCode);

        var sendAttempt = await playerClient.PostJsonAsync(
            "/api/v1/messages", new SendMessageRequest(otherId, "can't send this"), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, sendAttempt.StatusCode);

        var reportAttempt = await playerClient.PostJsonAsync(
            $"/api/v1/messages/{message.Id}/report", new ReportMessageRequest("nope"), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, reportAttempt.StatusCode);
    }
}
