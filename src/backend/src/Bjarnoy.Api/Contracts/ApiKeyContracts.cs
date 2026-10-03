using Bjarnoy.Api.Auth.ApiKeys;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.Contracts;

// Scope is written the same way everywhere:
//   "features": { "settlements": "ReadWrite", "worlds": "Read" }, "allWorlds": false, "worldIds": [guid, ...]
// ApiKeyAccess, ApiKeyStatus, ApiKeyRequestKind and ApiKeyRequestStatus serialise as their names.

/// <summary>One entry of <c>GET /api/v1/api-keys/features</c>.</summary>
public sealed record ApiKeyFeatureResponse(string Id, bool WorldScoped, bool Admin, string Description);

/// <summary>An API key as listed and as returned from create/update/self. Never contains the secret.</summary>
/// <param name="KeyHint">The public half of the token, <c>bjk_&lt;keyId&gt;_…</c>.</param>
public sealed record ApiKeyResponse(
    Guid Id,
    string Name,
    string? Purpose,
    string KeyHint,
    Guid OwnerUserId,
    string OwnerUserName,
    Guid CreatedByUserId,
    string? CreatedByUserName,
    ApiKeyStatus Status,
    IReadOnlyDictionary<string, ApiKeyAccess> Features,
    bool AllWorlds,
    IReadOnlyList<Guid> WorldIds,
    int RequestsPerMinute,
    DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? LastUsedAt,
    DateTimeOffset? RevokedAt,
    Guid? ReplacedByApiKeyId,
    DateTimeOffset? AutoRenewUntil)
{
    public static ApiKeyResponse From(ApiKeyEntity key, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(key);

        return new ApiKeyResponse(
            key.Id,
            key.Name,
            key.Purpose,
            ApiKeyToken.Hint(key.KeyId),
            key.OwnerUserId,
            key.OwnerUser?.UserName ?? string.Empty,
            key.CreatedByUserId,
            key.CreatedByUser?.UserName,
            key.GetStatus(now),
            new Dictionary<string, ApiKeyAccess>(key.Features),
            key.AllWorlds,
            [.. key.WorldIds],
            key.RequestsPerMinute,
            key.CreatedAt,
            key.ExpiresAt,
            key.LastUsedAt,
            key.RevokedAt,
            key.ReplacedByApiKeyId,
            key.AutoRenewUntil);
    }
}

/// <summary>
/// The settings of an API key, for <c>POST /api/v1/admin/api-keys</c> and <c>PUT /api/v1/admin/api-keys/{id}</c>.
/// </summary>
/// <param name="OwnerUserId">Whom the key acts as. Create: defaults to the calling admin. Update: omitted keeps the current owner.</param>
/// <param name="ExpiresAt">When the key stops working; must lie within the configured maximum lifetime from now.</param>
/// <param name="RequestsPerMinute">Omitted: the configured default.</param>
/// <param name="AutoRenewUntil">While in the future, renewal requests from the key are approved without an admin.</param>
public sealed record ApiKeySettingsRequest(
    string? Name,
    string? Purpose,
    Guid? OwnerUserId,
    Dictionary<string, ApiKeyAccess>? Features,
    bool AllWorlds,
    IReadOnlyList<Guid>? WorldIds,
    DateTimeOffset ExpiresAt,
    int? RequestsPerMinute,
    DateTimeOffset? AutoRenewUntil = null);

/// <summary>A freshly created key: the one and only time the token is shown.</summary>
public sealed record ApiKeyTokenResponse(string Token, ApiKeyResponse ApiKey);

// ---- request flow ----

/// <summary>Body of <c>POST /api/v1/api-key-requests</c> (anonymous).</summary>
/// <param name="OwnerUserName">A hint for whom the key should act as; the approving admin decides.</param>
/// <param name="LifetimeMinutes">How long the key should live once collected.</param>
public sealed record CreateApiKeyRequestRequest(
    string? Name,
    string? Purpose,
    string? Description,
    string? ContextUrl,
    string? OwnerUserName,
    Dictionary<string, ApiKeyAccess>? Features,
    bool AllWorlds,
    IReadOnlyList<Guid>? WorldIds,
    int LifetimeMinutes,
    int? RequestsPerMinute);

/// <summary>Body of <c>POST /api/v1/api-key-requests/renewal</c>, called with the key to renew.</summary>
public sealed record RenewApiKeyRequest(int? LifetimeMinutes, string? Description, string? ContextUrl);

/// <summary>What the requester gets back for a new request or a renewal: show <c>UserCode</c>/<c>ApprovalUrl</c> to an admin, poll with <c>PollSecret</c>.</summary>
/// <param name="Status"><c>Pending</c>, or <c>Approved</c> for a renewal that was approved automatically.</param>
public sealed record ApiKeyRequestCreatedResponse(
    Guid Id,
    string UserCode,
    string ApprovalUrl,
    string PollSecret,
    int PollIntervalSeconds,
    DateTimeOffset ExpiresAt,
    ApiKeyRequestStatus Status);

/// <summary>Body of <c>POST /api/v1/api-key-requests/{id}/token</c> (anonymous).</summary>
public sealed record ApiKeyTokenPollRequest(string? PollSecret);

/// <summary>202 answer of the token endpoint: not decided yet.</summary>
public sealed record ApiKeyPendingResponse(ApiKeyRequestStatus Status, int PollIntervalSeconds);

/// <summary>What the approving admin decided, on an approved/completed request.</summary>
public sealed record ApiKeyApprovalResponse(
    Guid OwnerUserId,
    string? OwnerUserName,
    IReadOnlyDictionary<string, ApiKeyAccess> Features,
    bool AllWorlds,
    IReadOnlyList<Guid> WorldIds,
    int RequestsPerMinute,
    int LifetimeMinutes,
    DateTimeOffset? AutoRenewUntil);

/// <summary>A key request as the admin list shows it. The requested settings are the agent's ask; <c>Approved</c> is the decision.</summary>
public sealed record ApiKeyRequestResponse(
    Guid Id,
    ApiKeyRequestKind Kind,
    ApiKeyRequestStatus Status,
    string UserCode,
    string Name,
    string? Purpose,
    string? Description,
    string? ContextUrl,
    IReadOnlyDictionary<string, ApiKeyAccess> Features,
    bool AllWorlds,
    IReadOnlyList<Guid> WorldIds,
    int RequestsPerMinute,
    int LifetimeMinutes,
    string? RequestedOwnerUserName,
    Guid? RenewsApiKeyId,
    string? RequesterIp,
    string? RequesterUserAgent,
    DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? DecidedAt,
    Guid? DecidedByUserId,
    string? DecidedByUserName,
    Guid? ApiKeyId,
    DateTimeOffset? CompletedAt,
    ApiKeyApprovalResponse? Approved);

/// <summary>
/// Optional overrides on <c>POST /api/v1/admin/api-key-requests/{id}/approve</c>; anything omitted is taken from the
/// request (owner: the requested user name if it exists, else the approving admin).
/// </summary>
/// <param name="AutoRenewMinutes">Auto-approve renewals from the created key for this long from now (0 or omitted: never).</param>
public sealed record ApproveApiKeyRequestRequest(
    Guid? OwnerUserId = null,
    Dictionary<string, ApiKeyAccess>? Features = null,
    bool? AllWorlds = null,
    IReadOnlyList<Guid>? WorldIds = null,
    int? LifetimeMinutes = null,
    int? RequestsPerMinute = null,
    int? AutoRenewMinutes = null);
