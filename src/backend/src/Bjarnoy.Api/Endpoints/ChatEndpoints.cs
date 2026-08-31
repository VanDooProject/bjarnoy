using System.Security.Claims;
using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Player-to-player direct messages: send, list conversations, mark read, and
/// report a message to moderation — issue #41. Every route requires
/// authentication (there is no anonymous chat), and mutating routes also go
/// through <see cref="ActiveUserEndpointFilter"/> so a Locked/Banned account
/// cannot send, mark read, or report (it can still read its own inbox).
/// </summary>
public static class ChatEndpoints
{
    public static IEndpointRouteBuilder MapChatEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var messages = app.MapGroup("/api/v1/messages")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Chat")
            .RequireAuthorization();

        messages.MapPost("/", Send)
            .WithName("SendMessage")
            .WithSummary("Sends a direct message to another player.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        messages.MapGet("/conversations", ListConversations)
            .WithName("ListConversations")
            .WithSummary("Lists the caller's conversations, most recently active first.");

        messages.MapGet("/conversations/{otherUserId:guid}", GetConversation)
            .WithName("GetConversation")
            .WithSummary("The message history between the caller and one other player.");

        messages.MapPost("/conversations/{otherUserId:guid}/read", MarkRead)
            .WithName("MarkConversationRead")
            .WithSummary("Marks every unread message from one player as read.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        messages.MapPost("/{messageId:guid}/report", Report)
            .WithName("ReportMessage")
            .WithSummary("Reports a message to moderation.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        return app;
    }

    private static Guid CallerId(ClaimsPrincipal principal) =>
        Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static async Task<Results<Created<MessageResponse>, NotFound<ProblemDetails>, BadRequest<ProblemDetails>>> Send(
        SendMessageRequest request,
        ClaimsPrincipal principal,
        ChatService chat,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var senderId = CallerId(principal);
        var (outcome, message) = await chat.SendAsync(senderId, request.RecipientUserId, request.Body, cancellationToken);

        switch (outcome)
        {
            case SendMessageOutcome.MessageToSelf:
                return TypedResults.BadRequest(new ProblemDetails
                {
                    Title = "You cannot message yourself.",
                    Status = StatusCodes.Status400BadRequest,
                });
            case SendMessageOutcome.RecipientNotFound:
                return TypedResults.NotFound(new ProblemDetails
                {
                    Title = "No such player.",
                    Status = StatusCodes.Status404NotFound,
                });
        }

        var response = MessageResponse.From(message!, request.RecipientUserId, readReceiptVisible: false);
        return TypedResults.Created($"/api/v1/messages/conversations/{request.RecipientUserId}", response);
    }

    private static async Task<Ok<PagedConversationsResponse>> ListConversations(
        ClaimsPrincipal principal,
        ChatService chat,
        int? page,
        int? pageSize,
        CancellationToken cancellationToken)
    {
        var userId = CallerId(principal);
        var effectivePage = page is > 0 ? page.Value : 1;
        var effectivePageSize = pageSize is > 0 and <= 100 ? pageSize.Value : 20;

        var conversations = await chat.GetConversationsAsync(userId, effectivePage, effectivePageSize, cancellationToken);

        var items = conversations.Select(c =>
        {
            var recipientOfLastMessage = c.LastMessage.SenderUserId == userId ? c.OtherUser.Id : userId;
            return new ConversationResponse(
                c.OtherUser.Id,
                c.OtherUser.UserName,
                c.OtherUser.DisplayName,
                MessageResponse.From(c.LastMessage, recipientOfLastMessage, c.LastMessageReadReceiptVisible),
                c.UnreadCount);
        }).ToList();

        return TypedResults.Ok(new PagedConversationsResponse(items, effectivePage, effectivePageSize));
    }

    private static async Task<Ok<PagedMessagesResponse>> GetConversation(
        Guid otherUserId,
        ClaimsPrincipal principal,
        ChatService chat,
        int? page,
        int? pageSize,
        CancellationToken cancellationToken)
    {
        var userId = CallerId(principal);
        var effectivePage = page is > 0 ? page.Value : 1;
        var effectivePageSize = pageSize is > 0 and <= 100 ? pageSize.Value : 20;

        var result = await chat.GetConversationAsync(userId, otherUserId, effectivePage, effectivePageSize, cancellationToken);
        var readReceiptVisible = await chat.CanSeeReadReceiptAsync(userId, otherUserId, cancellationToken);

        var items = result.Messages.Select(m =>
        {
            var recipientOfMessage = m.SenderUserId == userId ? otherUserId : userId;
            var visible = m.SenderUserId == userId && readReceiptVisible;
            return MessageResponse.From(m, recipientOfMessage, visible);
        }).ToList();

        return TypedResults.Ok(new PagedMessagesResponse(items, result.TotalCount, effectivePage, effectivePageSize));
    }

    private static async Task<Ok<MarkReadResponse>> MarkRead(
        Guid otherUserId,
        ClaimsPrincipal principal,
        ChatService chat,
        CancellationToken cancellationToken)
    {
        var userId = CallerId(principal);
        var markedRead = await chat.MarkConversationReadAsync(userId, otherUserId, cancellationToken);
        return TypedResults.Ok(new MarkReadResponse(markedRead));
    }

    private static async Task<Results<Created<ReportResponse>, Ok<ReportResponse>, NotFound<ProblemDetails>>> Report(
        Guid messageId,
        ReportMessageRequest request,
        ClaimsPrincipal principal,
        ChatService chat,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var reporterId = CallerId(principal);
        var (outcome, report) = await chat.ReportMessageAsync(reporterId, messageId, request.Reason, cancellationToken);

        if (outcome == ReportMessageOutcome.MessageNotVisible)
        {
            return TypedResults.NotFound(new ProblemDetails
            {
                Title = "No such message.",
                Status = StatusCodes.Status404NotFound,
            });
        }

        var response = ReportResponse.From(report!);
        return outcome == ReportMessageOutcome.AlreadyReported
            ? TypedResults.Ok(response)
            : TypedResults.Created($"/api/v1/admin/reports/{report!.Id}", response);
    }
}
