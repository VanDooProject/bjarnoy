using System.Text.Json.Serialization;

namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// How much of one API key feature a key may use. Ordered, so <c>level &gt;= required</c> is the whole check:
/// <see cref="Read"/> covers GET/HEAD/OPTIONS, <see cref="ReadWrite"/> additionally covers POST/PUT/PATCH/DELETE.
/// </summary>
/// <remarks>
/// Serialised as its name (<c>"Read"</c>, <c>"ReadWrite"</c>) wherever it appears in a JSON contract; stored as
/// <c>r</c>/<c>rw</c> inside <see cref="ApiKeyEntity.Features"/>'s one text column.
/// </remarks>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ApiKeyAccess
{
    /// <summary>No access — never stored on a key, only used as "feature absent" in code and request validation.</summary>
    None = 0,

    /// <summary>Safe methods only (GET, HEAD, OPTIONS).</summary>
    Read = 1,

    /// <summary>Safe methods plus POST, PUT, PATCH and DELETE.</summary>
    ReadWrite = 2,
}

/// <summary>Where an <see cref="ApiKeyEntity"/> is in its life, derived from its timestamps — never stored.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ApiKeyStatus
{
    /// <summary>Usable: not revoked and not past <see cref="ApiKeyEntity.ExpiresAt"/>.</summary>
    Active = 0,

    /// <summary>Past its expiry; kept for the audit trail.</summary>
    Expired = 1,

    /// <summary>Revoked by an admin, or replaced by a recreate/renewal; kept for the audit trail.</summary>
    Revoked = 2,
}

/// <summary>
/// A debug/agent API key: a long-lived, narrowly scoped credential an admin hands to a tool (typically an AI agent
/// testing the running game) so it can call the API <em>as</em> <see cref="OwnerUserId"/> without that user's
/// password, but with only the <see cref="Features"/> and worlds the key was granted.
/// </summary>
/// <remarks>
/// <para>
/// The token a caller presents is <c>bjk_&lt;KeyId&gt;_&lt;secret&gt;</c>. Only a SHA-256 hash of the secret is stored
/// (<see cref="SecretHash"/>): the secret is 256 random bits, so a fast hash is enough and the lookup by
/// <see cref="KeyId"/> stays one indexed read. The token is shown exactly once, when the key is created.
/// </para>
/// <para>
/// Timestamps are <see cref="DateTimeOffset"/> like every other entity here; because SQLite cannot compare or order
/// those in SQL, the status (<see cref="GetStatus"/>) and every expiry test is evaluated in memory.
/// </para>
/// </remarks>
public class ApiKeyEntity
{
    /// <summary>UUIDv7, matching the primary-key convention used elsewhere in this model.</summary>
    public Guid Id { get; set; } = Guid.CreateVersion7();

    /// <summary>Human label shown in the admin list and the logs (at most 100 characters).</summary>
    public required string Name { get; set; }

    /// <summary>The public half of the token: 16 lowercase hex characters, unique, used to find the row.</summary>
    public required string KeyId { get; set; }

    /// <summary>SHA-256 of the token's secret half, hex-encoded. The secret itself is never stored.</summary>
    public required string SecretHash { get; set; }

    /// <summary>The user whose rights the key has: every request made with the key acts as this user.</summary>
    public Guid OwnerUserId { get; set; }

    public UserEntity? OwnerUser { get; set; }

    /// <summary>The admin who created the key, or who approved the request that became it.</summary>
    public Guid CreatedByUserId { get; set; }

    public UserEntity? CreatedByUser { get; set; }

    /// <summary>
    /// Feature id (see <c>ApiKeyFeatures</c> in the API project) to the access level granted. Never contains
    /// <see cref="ApiKeyAccess.None"/>; a feature that is absent is simply not callable.
    /// </summary>
    public Dictionary<string, ApiKeyAccess> Features { get; set; } = [];

    /// <summary>True when the key may touch every world; <see cref="WorldIds"/> is then ignored.</summary>
    public bool AllWorlds { get; set; }

    /// <summary>The worlds a world-scoped feature may be used in when <see cref="AllWorlds"/> is false.</summary>
    public List<Guid> WorldIds { get; set; } = [];

    /// <summary>Fixed one-minute window quota, enforced in memory per key.</summary>
    public int RequestsPerMinute { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>Last authenticated use, written at most once a minute.</summary>
    public DateTimeOffset? LastUsedAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }

    /// <summary>The key a recreate or a renewal pickup replaced this one with.</summary>
    public Guid? ReplacedByApiKeyId { get; set; }

    /// <summary>
    /// While this lies in the future, a renewal request from this key is approved without an admin — the admin's
    /// standing consent for the key to keep itself alive until then. Carried over to each renewal.
    /// </summary>
    public DateTimeOffset? AutoRenewUntil { get; set; }

    /// <summary>Why the key exists (at most 500 characters), for the admin list.</summary>
    public string? Purpose { get; set; }

    /// <summary>The derived status at <paramref name="now"/>; revocation wins over expiry.</summary>
    public ApiKeyStatus GetStatus(DateTimeOffset now) =>
        RevokedAt is not null ? ApiKeyStatus.Revoked
        : ExpiresAt <= now ? ApiKeyStatus.Expired
        : ApiKeyStatus.Active;
}

/// <summary>Whether an <see cref="ApiKeyRequestEntity"/> asks for a brand new key or for a successor of an existing one.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ApiKeyRequestKind
{
    New = 0,
    Renewal = 1,
}

/// <summary>
/// Where a request is in the device-flow style approval. "Expired" is not stored: it is derived from
/// <see cref="ApiKeyRequestEntity.ExpiresAt"/> for a request that is still <see cref="Pending"/> or <see cref="Approved"/>.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ApiKeyRequestStatus
{
    /// <summary>Waiting for an admin.</summary>
    Pending = 0,

    /// <summary>An admin (or the renewal auto-approval) said yes; the requester has not collected the token yet.</summary>
    Approved = 1,

    /// <summary>An admin said no.</summary>
    Denied = 2,

    /// <summary>The token was collected; the key exists. Terminal.</summary>
    Completed = 3,

    /// <summary>Derived only (<see cref="ApiKeyRequestEntity.GetEffectiveStatus"/>): never stored.</summary>
    Expired = 4,
}

/// <summary>
/// An agent's anonymous request for an API key, held until an admin approves or denies it — modelled on the OAuth
/// device flow. The requester shows the admin the <see cref="UserCode"/>, polls with a secret only it knows, and
/// collects the token exactly once after approval.
/// </summary>
/// <remarks>
/// The requested settings (<see cref="Features"/>, <see cref="AllWorlds"/>, ...) are what the agent asked for; the
/// <c>Approved*</c> columns and <see cref="OwnerUserId"/> are what the admin decided, which may differ. The key itself
/// is only created at pickup, so an approval that is never collected leaves no live credential behind.
/// </remarks>
public class ApiKeyRequestEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public ApiKeyRequestKind Kind { get; set; }

    /// <summary>
    /// Stored status. Also the optimistic-concurrency token, so two racing token pickups (or an approve racing a deny)
    /// cannot both win.
    /// </summary>
    public ApiKeyRequestStatus Status { get; set; }

    /// <summary>Short code <c>XXXX-XXXX</c> (unambiguous alphabet) the requester shows the admin; unique.</summary>
    public required string UserCode { get; set; }

    /// <summary>SHA-256 of the poll secret, hex-encoded; the secret is only ever in the 201 response.</summary>
    public required string PollSecretHash { get; set; }

    public required string Name { get; set; }

    public string? Purpose { get; set; }

    /// <summary>Free text the agent wants the admin to read before approving (at most 1000 characters).</summary>
    public string? Description { get; set; }

    /// <summary>An http(s) link giving the admin context (a PR, an issue); at most 500 characters.</summary>
    public string? ContextUrl { get; set; }

    /// <summary>The requested features; for a renewal, copied from the key being renewed.</summary>
    public Dictionary<string, ApiKeyAccess> Features { get; set; } = [];

    public bool AllWorlds { get; set; }

    public List<Guid> WorldIds { get; set; } = [];

    public int RequestsPerMinute { get; set; }

    public int LifetimeMinutes { get; set; }

    /// <summary>A hint for whom the key should act as; the approving admin decides.</summary>
    public string? RequestedOwnerUserName { get; set; }

    /// <summary>For a <see cref="ApiKeyRequestKind.Renewal"/>, the key that is revoked when the successor is collected.</summary>
    public Guid? RenewsApiKeyId { get; set; }

    public string? RequesterIp { get; set; }

    public string? RequesterUserAgent { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>After this, the request can no longer be approved or collected.</summary>
    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? DecidedAt { get; set; }

    /// <summary>The deciding admin; null while pending and for an automatic renewal approval.</summary>
    public Guid? DecidedByUserId { get; set; }

    /// <summary>The key created at pickup.</summary>
    public Guid? ApiKeyId { get; set; }

    public DateTimeOffset? CompletedAt { get; set; }

    /// <summary>The user the created key acts as, fixed on approval.</summary>
    public Guid? OwnerUserId { get; set; }

    /// <summary>The features the admin approved (empty until approved; replaces <see cref="Features"/> at pickup).</summary>
    public Dictionary<string, ApiKeyAccess> ApprovedFeatures { get; set; } = [];

    public bool? ApprovedAllWorlds { get; set; }

    public List<Guid> ApprovedWorldIds { get; set; } = [];

    public int? ApprovedRequestsPerMinute { get; set; }

    public int? ApprovedLifetimeMinutes { get; set; }

    /// <summary>Carried onto the created key as <see cref="ApiKeyEntity.AutoRenewUntil"/>.</summary>
    public DateTimeOffset? AutoRenewUntil { get; set; }

    /// <summary>The status a client should see: a pending or approved request past its expiry reads as expired.</summary>
    public ApiKeyRequestStatus GetEffectiveStatus(DateTimeOffset now) =>
        Status is ApiKeyRequestStatus.Pending or ApiKeyRequestStatus.Approved && ExpiresAt <= now
            ? ApiKeyRequestStatus.Expired
            : Status;
}
