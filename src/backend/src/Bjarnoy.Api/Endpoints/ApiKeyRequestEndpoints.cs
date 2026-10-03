using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth.ApiKeys;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// The agent's side of getting an API key: ask anonymously, show the admin the code, poll until approved, collect the
/// token once — and, with a key in hand, ask for its successor before it expires.
/// </summary>
/// <remarks>
/// <para>
/// The admin's side (listing, approving, denying) is in <see cref="AdminApiKeyEndpoints"/>. The group is
/// <see cref="ApiKeyEndpointMarker.Forbidden"/> for keys — an agent asking for a key has none — except renewal, which
/// is marked <see cref="ApiKeyEndpointMarker.Public"/> at endpoint level: a key may always ask to be replaced,
/// whatever features it holds.
/// </para>
/// </remarks>
public static class ApiKeyRequestEndpoints
{
    public static IEndpointRouteBuilder MapApiKeyRequestEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var requests = app.MapGroup("/api/v1/api-key-requests")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("API keys")
            .ApiKeyForbidden();

        requests.MapPost("/", CreateRequest)
            .WithName("CreateApiKeyRequest")
            .WithSummary("Asks for an API key (anonymous); an admin approves it in the admin UI with the returned code.")
            .AllowAnonymous();

        requests.MapPost("/{requestId:guid}/token", PickUpToken)
            .WithName("PickUpApiKeyToken")
            .WithSummary("Polls a request with its poll secret: 202 while pending, 200 with the token exactly once after approval.")
            .AllowAnonymous();

        requests.MapPost("/renewal", Renew)
            .WithName("RenewApiKey")
            .WithSummary("Called with an API key: asks for its successor (auto-approved while the key's auto-renew window is open).")
            .RequireAuthorization()
            .ApiKeyPublic();

        return app;
    }

    private static async Task<IResult> CreateRequest(
        CreateApiKeyRequestRequest body,
        HttpContext http,
        ApiKeyRequestService requests,
        IOptions<ApiKeyOptions> options,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(body);

        var result = await requests.CreateAsync(
            new NewApiKeyRequest(
                body.Name, body.Purpose, body.Description, body.ContextUrl, body.OwnerUserName,
                body.Features, body.AllWorlds, body.WorldIds, body.LifetimeMinutes, body.RequestsPerMinute),
            http.Connection.RemoteIpAddress?.ToString(),
            http.Request.Headers.UserAgent.ToString(),
            cancellationToken);

        return result.Outcome switch
        {
            ApiKeyRequestOutcome.Invalid => Results.ValidationProblem(result.Errors!.ToDictionary()),
            ApiKeyRequestOutcome.TooManyRequests => Results.Problem(
                title: result.Message, statusCode: StatusCodes.Status429TooManyRequests),
            _ => Results.Json(ToCreated(result, http, options.Value), statusCode: StatusCodes.Status201Created),
        };
    }

    private static async Task<IResult> Renew(
        HttpContext http,
        ApiKeyRequestService requests,
        IOptions<ApiKeyOptions> options,
        CancellationToken cancellationToken)
    {
        if (http.User.GetApiKeyId() is not { } keyId)
        {
            return Results.Unauthorized();
        }

        var (body, bodyError) = await OptionalBody.ReadAsync<RenewApiKeyRequest>(http.Request, cancellationToken);
        if (bodyError is not null)
        {
            return bodyError;
        }

        var result = await requests.CreateRenewalAsync(
            keyId,
            body?.LifetimeMinutes,
            body?.Description,
            body?.ContextUrl,
            http.Connection.RemoteIpAddress?.ToString(),
            http.Request.Headers.UserAgent.ToString(),
            cancellationToken);

        return result.Outcome switch
        {
            ApiKeyRequestOutcome.Invalid => Results.ValidationProblem(result.Errors!.ToDictionary()),
            ApiKeyRequestOutcome.NotFound => Results.Unauthorized(),
            _ => Results.Json(ToCreated(result, http, options.Value), statusCode: StatusCodes.Status201Created),
        };
    }

    private static async Task<IResult> PickUpToken(
        Guid requestId,
        ApiKeyTokenPollRequest? body,
        ApiKeyRequestService requests,
        ApiKeyService keys,
        TimeProvider timeProvider,
        IOptions<ApiKeyOptions> options,
        CancellationToken cancellationToken)
    {
        var result = await requests.PickUpAsync(requestId, body?.PollSecret, cancellationToken);
        switch (result.Outcome)
        {
            case ApiKeyRequestOutcome.Pending:
                return Results.Json(
                    new ApiKeyPendingResponse(ApiKeyRequestStatus.Pending, options.Value.PollIntervalSeconds),
                    statusCode: StatusCodes.Status202Accepted);
            case ApiKeyRequestOutcome.Denied:
                return Results.Problem(title: "The request was denied.", statusCode: StatusCodes.Status403Forbidden);
            case ApiKeyRequestOutcome.Gone:
                return Results.Problem(
                    title: result.Message ?? "The request is no longer available.",
                    statusCode: StatusCodes.Status410Gone);
            case ApiKeyRequestOutcome.Conflict:
                return Results.Problem(
                    title: result.Message ?? "The request cannot be completed.",
                    statusCode: StatusCodes.Status409Conflict,
                    extensions: result.Errors?.ToDictionary(kv => kv.Key, kv => (object?)kv.Value));
            case ApiKeyRequestOutcome.Ok:
                var key = await keys.FindAsync(result.Key!.Id, track: false, cancellationToken);
                return Results.Ok(new ApiKeyTokenResponse(result.Token!, ApiKeyResponse.From(key!, timeProvider.GetUtcNow())));
            default:
                // Unknown request or wrong poll secret: the same answer, so a probe learns nothing.
                return Results.NotFound();
        }
    }

    private static ApiKeyRequestCreatedResponse ToCreated(
        ApiKeyRequestResult result, HttpContext http, ApiKeyOptions options)
    {
        var request = result.Request!;
        var baseUrl = string.IsNullOrWhiteSpace(options.PublicBaseUrl)
            ? $"{http.Request.Scheme}://{http.Request.Host}"
            : options.PublicBaseUrl.TrimEnd('/');
        return new ApiKeyRequestCreatedResponse(
            request.Id,
            request.UserCode,
            $"{baseUrl}/admin/api-keys?request={request.UserCode}",
            result.PollSecret!,
            options.PollIntervalSeconds,
            request.ExpiresAt,
            request.Status);
    }
}
