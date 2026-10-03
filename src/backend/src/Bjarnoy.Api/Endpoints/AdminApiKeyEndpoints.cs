using System.Security.Claims;
using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth.ApiKeys;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Admin-only management of API keys and of the requests agents open for them. An admin may pick the key's owner
/// (themselves, or any user such as a test player account) and the key then acts as that user.
/// </summary>
/// <remarks>
/// Everything here is <see cref="ApiKeyEndpointMarker.Forbidden"/> for keys: a key can never mint, edit, recreate,
/// revoke or approve keys, even one owned by an admin and holding every <c>admin.*</c> feature. Every creation,
/// approval, denial and revocation is logged at Information with the admin's, the key's and the owner's ids.
/// </remarks>
public static class AdminApiKeyEndpoints
{
    public static IEndpointRouteBuilder MapAdminApiKeyEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var keys = app.MapGroup("/api/v1/admin/api-keys")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Admin", "API keys")
            .RequireAuthorization("Admin")
            .ApiKeyForbidden();

        keys.MapGet("/", ListKeys)
            .WithName("AdminListApiKeys")
            .WithSummary("Lists API keys (active ones, or every one with includeInactive=true), newest first.");

        keys.MapPost("/", CreateKey)
            .WithName("AdminCreateApiKey")
            .WithSummary("Creates an API key; the response carries the token, which is never shown again.");

        keys.MapPut("/{keyId:guid}", UpdateKey)
            .WithName("AdminUpdateApiKey")
            .WithSummary("Replaces a key's settings; the token stays the same. A revoked key cannot be edited.");

        keys.MapPost("/{keyId:guid}/recreate", RecreateKey)
            .WithName("AdminRecreateApiKey")
            .WithSummary("Revokes a key and creates a successor with the same settings and a new secret.");

        keys.MapPost("/{keyId:guid}/revoke", RevokeKey)
            .WithName("AdminRevokeApiKey")
            .WithSummary("Revokes a key immediately.");

        var requests = app.MapGroup("/api/v1/admin/api-key-requests")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Admin", "API keys")
            .RequireAuthorization("Admin")
            .ApiKeyForbidden();

        requests.MapGet("/", ListRequests)
            .WithName("AdminListApiKeyRequests")
            .WithSummary("Lists key requests, newest first: pending and approved ones by default, or ?status=pending|approved|denied|completed|expired|all.");

        requests.MapPost("/{requestId:guid}/approve", ApproveRequest)
            .WithName("AdminApproveApiKeyRequest")
            .WithSummary("Approves a pending request, optionally overriding owner, scope, lifetime, quota and auto-renew window.");

        requests.MapPost("/{requestId:guid}/deny", DenyRequest)
            .WithName("AdminDenyApiKeyRequest")
            .WithSummary("Denies a pending (or approved but uncollected) request.");

        return app;
    }

    private static Guid AdminId(ClaimsPrincipal user) =>
        Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static async Task<IResult> ListKeys(
        bool? includeInactive,
        GameDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var all = await dbContext.ApiKeys.AsNoTracking()
            .Include(k => k.OwnerUser)
            .Include(k => k.CreatedByUser)
            .ToListAsync(cancellationToken);
        return Results.Ok(all
            .Where(k => includeInactive == true || k.GetStatus(now) == ApiKeyStatus.Active)
            .OrderByDescending(k => k.CreatedAt)
            .Select(k => ApiKeyResponse.From(k, now))
            .ToList());
    }

    private static async Task<IResult> CreateKey(
        ApiKeySettingsRequest body,
        ClaimsPrincipal user,
        ApiKeyService keys,
        IOptions<ApiKeyOptions> options,
        TimeProvider timeProvider,
        GameDbContext dbContext,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(body);

        var adminId = AdminId(user);
        var settings = ToSettings(body, body.OwnerUserId ?? adminId, options.Value.DefaultRequestsPerMinute, body.AutoRenewUntil);
        var validation = await keys.ValidateAsync(settings, excludeKeyId: null, cancellationToken);
        if (!validation.IsValid)
        {
            return Results.ValidationProblem(validation.Errors.ToDictionary());
        }

        var (key, token) = keys.Build(settings, adminId);
        await dbContext.SaveChangesAsync(cancellationToken);
        keys.LogCreated("created", key, adminId);

        var created = await keys.FindAsync(key.Id, track: false, cancellationToken);
        return Results.Json(
            new ApiKeyTokenResponse(token, ApiKeyResponse.From(created!, timeProvider.GetUtcNow())),
            statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> UpdateKey(
        Guid keyId,
        ApiKeySettingsRequest body,
        ClaimsPrincipal user,
        ApiKeyService keys,
        TimeProvider timeProvider,
        GameDbContext dbContext,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(body);

        var key = await keys.FindAsync(keyId, track: true, cancellationToken);
        if (key is null)
        {
            return Results.NotFound();
        }

        if (key.RevokedAt is not null)
        {
            return Results.Problem(title: "A revoked API key cannot be edited.", statusCode: StatusCodes.Status409Conflict);
        }

        // An omitted owner, quota or auto-renew window keeps the current one: the editor only sends what it shows.
        var settings = ToSettings(
            body, body.OwnerUserId ?? key.OwnerUserId, body.RequestsPerMinute ?? key.RequestsPerMinute,
            body.AutoRenewUntil ?? key.AutoRenewUntil);
        var validation = await keys.ValidateAsync(settings, key.Id, cancellationToken);
        if (!validation.IsValid)
        {
            return Results.ValidationProblem(validation.Errors.ToDictionary());
        }

        key.Name = settings.Name.Trim();
        key.Purpose = string.IsNullOrWhiteSpace(settings.Purpose) ? null : settings.Purpose.Trim();
        key.OwnerUserId = settings.OwnerUserId;
        key.Features = ApiKeyService.NormaliseFeatures(settings.Features);
        key.AllWorlds = settings.AllWorlds;
        key.WorldIds = settings.AllWorlds ? [] : [.. settings.WorldIds.Distinct()];
        key.ExpiresAt = settings.ExpiresAt;
        key.RequestsPerMinute = settings.RequestsPerMinute;
        key.AutoRenewUntil = settings.AutoRenewUntil;
        await dbContext.SaveChangesAsync(cancellationToken);
        keys.LogCreated("updated", key, AdminId(user));

        var updated = await keys.FindAsync(key.Id, track: false, cancellationToken);
        return Results.Ok(ApiKeyResponse.From(updated!, timeProvider.GetUtcNow()));
    }

    private static async Task<IResult> RecreateKey(
        Guid keyId,
        ClaimsPrincipal user,
        ApiKeyService keys,
        IOptions<ApiKeyOptions> options,
        TimeProvider timeProvider,
        GameDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var old = await keys.FindAsync(keyId, track: true, cancellationToken);
        if (old is null)
        {
            return Results.NotFound();
        }

        if (old.RevokedAt is not null)
        {
            return Results.Problem(title: "A revoked API key cannot be recreated.", statusCode: StatusCodes.Status409Conflict);
        }

        var now = timeProvider.GetUtcNow();
        var lifetime = TimeSpan.FromMinutes(Math.Clamp(
            (old.ExpiresAt - old.CreatedAt).TotalMinutes, 1, options.Value.MaxLifetime.TotalMinutes));
        var settings = new ApiKeySettings(
            old.Name, old.Purpose, old.OwnerUserId, old.Features, old.AllWorlds, old.WorldIds,
            now + lifetime, old.RequestsPerMinute, old.AutoRenewUntil);
        var validation = await keys.ValidateAsync(settings, old.Id, cancellationToken);
        if (!validation.IsValid)
        {
            return Results.ValidationProblem(validation.Errors.ToDictionary());
        }

        var adminId = AdminId(user);
        var (replacement, token) = keys.Build(settings, adminId);
        old.RevokedAt = now;
        old.ReplacedByApiKeyId = replacement.Id;
        await dbContext.SaveChangesAsync(cancellationToken);
        keys.LogCreated("recreated (replacing " + old.Id + ")", replacement, adminId);

        var created = await keys.FindAsync(replacement.Id, track: false, cancellationToken);
        return Results.Json(
            new ApiKeyTokenResponse(token, ApiKeyResponse.From(created!, now)),
            statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> RevokeKey(
        Guid keyId,
        ClaimsPrincipal user,
        ApiKeyService keys,
        TimeProvider timeProvider,
        GameDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var key = await keys.FindAsync(keyId, track: true, cancellationToken);
        if (key is null)
        {
            return Results.NotFound();
        }

        var now = timeProvider.GetUtcNow();
        if (key.RevokedAt is null)
        {
            key.RevokedAt = now;
            await dbContext.SaveChangesAsync(cancellationToken);
            keys.LogCreated("revoked", key, AdminId(user));
        }

        return Results.Ok(ApiKeyResponse.From(key, now));
    }

    private static async Task<IResult> ListRequests(
        string? status,
        ApiKeyRequestService requests,
        CancellationToken cancellationToken)
    {
        var list = await requests.ListAsync(status, cancellationToken);
        if (list is null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["status"] = ["Valid: pending, approved, denied, completed, expired, all."],
            });
        }

        return Results.Ok(await requests.ToResponsesAsync(list, cancellationToken));
    }

    private static async Task<IResult> ApproveRequest(
        Guid requestId,
        ClaimsPrincipal user,
        ApiKeyRequestService requests,
        [FromBody] ApproveApiKeyRequestRequest? body,
        CancellationToken cancellationToken)
    {
        body ??= new ApproveApiKeyRequestRequest();
        var result = await requests.ApproveAsync(
            requestId,
            AdminId(user),
            new ApprovalOverrides(
                body.OwnerUserId, body.Features, body.AllWorlds, body.WorldIds,
                body.LifetimeMinutes, body.RequestsPerMinute, body.AutoRenewMinutes),
            cancellationToken);
        return await ToDecisionResultAsync(result, requests, cancellationToken);
    }

    private static async Task<IResult> DenyRequest(
        Guid requestId,
        ClaimsPrincipal user,
        ApiKeyRequestService requests,
        CancellationToken cancellationToken)
    {
        var result = await requests.DenyAsync(requestId, AdminId(user), cancellationToken);
        return await ToDecisionResultAsync(result, requests, cancellationToken);
    }

    private static async Task<IResult> ToDecisionResultAsync(
        ApiKeyRequestResult result, ApiKeyRequestService requests, CancellationToken cancellationToken)
    {
        switch (result.Outcome)
        {
            case ApiKeyRequestOutcome.Ok:
                var mapped = await requests.ToResponsesAsync([result.Request!], cancellationToken);
                return Results.Ok(mapped[0]);
            case ApiKeyRequestOutcome.NotFound:
                return Results.NotFound();
            case ApiKeyRequestOutcome.Gone:
                return Results.Problem(title: result.Message, statusCode: StatusCodes.Status410Gone);
            case ApiKeyRequestOutcome.Invalid:
                return Results.ValidationProblem(result.Errors!.ToDictionary());
            default:
                return Results.Problem(title: result.Message, statusCode: StatusCodes.Status409Conflict);
        }
    }

    private static ApiKeySettings ToSettings(
        ApiKeySettingsRequest body, Guid ownerUserId, int requestsPerMinute, DateTimeOffset? autoRenewUntil) =>
        new(
            body.Name ?? string.Empty,
            body.Purpose,
            ownerUserId,
            ApiKeyService.NormaliseFeatures(body.Features),
            body.AllWorlds,
            body.WorldIds ?? [],
            body.ExpiresAt,
            body.RequestsPerMinute ?? requestsPerMinute,
            autoRenewUntil);
}
