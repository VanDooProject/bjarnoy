using System.Security.Cryptography;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Api.Auth.ApiKeys;

/// <summary>How a state-changing step on a request ended, for the endpoint to map onto a status code.</summary>
public enum ApiKeyRequestOutcome
{
    /// <summary>It worked.</summary>
    Ok,

    /// <summary>No such request (or, for pickup, a wrong poll secret — the two are deliberately indistinguishable).</summary>
    NotFound,

    /// <summary>The request is past its expiry or its token was already collected.</summary>
    Gone,

    /// <summary>The request is not in a state this step applies to, or lost a race.</summary>
    Conflict,

    /// <summary>The submitted or approved settings are invalid; see <see cref="ApiKeyRequestResult.Errors"/>.</summary>
    Invalid,

    /// <summary>Too many open requests (per address or in total).</summary>
    TooManyRequests,

    /// <summary>The request was denied.</summary>
    Denied,

    /// <summary>Not decided yet.</summary>
    Pending,
}

/// <summary>An <see cref="ApiKeyRequestOutcome"/> with whatever that outcome carries.</summary>
public sealed record ApiKeyRequestResult(
    ApiKeyRequestOutcome Outcome,
    ApiKeyRequestEntity? Request = null,
    string? PollSecret = null,
    ApiKeyEntity? Key = null,
    string? Token = null,
    IReadOnlyDictionary<string, string[]>? Errors = null,
    string? Message = null);

/// <summary>The cleaned-up input of a new key request, from <c>CreateApiKeyRequestRequest</c>.</summary>
public sealed record NewApiKeyRequest(
    string? Name,
    string? Purpose,
    string? Description,
    string? ContextUrl,
    string? OwnerUserName,
    IReadOnlyDictionary<string, ApiKeyAccess>? Features,
    bool AllWorlds,
    IReadOnlyList<Guid>? WorldIds,
    int LifetimeMinutes,
    int? RequestsPerMinute);

/// <summary>Admin overrides applied when approving; any null keeps what the request asked for.</summary>
public sealed record ApprovalOverrides(
    Guid? OwnerUserId,
    IReadOnlyDictionary<string, ApiKeyAccess>? Features,
    bool? AllWorlds,
    IReadOnlyList<Guid>? WorldIds,
    int? LifetimeMinutes,
    int? RequestsPerMinute,
    int? AutoRenewMinutes);

/// <summary>
/// The device-flow style request lifecycle for API keys: an agent asks anonymously, an admin approves or denies with
/// the code the agent shows them, and the agent collects the token exactly once. Also renewal, where a key asks for
/// its own successor.
/// </summary>
/// <remarks>
/// <para>
/// The key itself is created at <em>pickup</em>, not at approval, so an approval nobody collects leaves no live
/// credential behind, and the secret is only ever returned to the party that proved it holds the poll secret. The
/// request's <see cref="ApiKeyRequestEntity.Status"/> is an optimistic-concurrency token, so two racing pickups cannot
/// both mint a key.
/// </para>
/// <para>
/// Time columns are <see cref="DateTimeOffset"/>, which SQLite cannot compare in SQL, so expiry is always decided in
/// memory after a status-filtered load.
/// </para>
/// </remarks>
public sealed class ApiKeyRequestService(
    GameDbContext dbContext,
    ApiKeyService keyService,
    TimeProvider timeProvider,
    IOptions<ApiKeyOptions> options,
    ILogger<ApiKeyRequestService> logger)
{
    /// <summary>The unambiguous alphabet user codes draw from (no 0/O, 1/I/L).</summary>
    public const string UserCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    /// <summary>An approval is always collectable for at least this long, however late in the request's life it came.</summary>
    private static readonly TimeSpan PickupGrace = TimeSpan.FromMinutes(5);

    private readonly ApiKeyOptions _options = options.Value;

    // ---- anonymous: ask ----

    /// <summary>Validates and stores a new anonymous request; the poll secret in the result is the only time it exists in clear.</summary>
    public async Task<ApiKeyRequestResult> CreateAsync(
        NewApiKeyRequest input, string? requesterIp, string? userAgent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(input);

        var now = timeProvider.GetUtcNow();
        var errors = new Dictionary<string, string[]>();
        var features = ApiKeyService.NormaliseFeatures(input.Features);

        RequireText(errors, "name", input.Name, 100, required: true);
        RequireText(errors, "purpose", input.Purpose, 500, required: false);
        RequireText(errors, "description", input.Description, 1000, required: false);
        RequireText(errors, "ownerUserName", input.OwnerUserName, 100, required: false);
        ValidateContextUrl(errors, input.ContextUrl);

        var featureErrors = ApiKeyService.ValidateFeatures(features);
        if (featureErrors.Count > 0)
        {
            errors["features"] = [.. featureErrors];
        }

        if (input.LifetimeMinutes < (int)_options.MinLifetime.TotalMinutes
            || input.LifetimeMinutes > (int)_options.MaxLifetime.TotalMinutes)
        {
            errors["lifetimeMinutes"] =
                [$"The lifetime must be between {(int)_options.MinLifetime.TotalMinutes} and {(int)_options.MaxLifetime.TotalMinutes} minutes."];
        }

        var rpm = input.RequestsPerMinute ?? _options.DefaultRequestsPerMinute;
        if (rpm < 1 || rpm > _options.MaxRequestsPerMinute)
        {
            errors["requestsPerMinute"] = [$"Requests per minute must be between 1 and {_options.MaxRequestsPerMinute}."];
        }

        var worldIds = input.AllWorlds ? [] : (input.WorldIds ?? []).Distinct().ToList();
        if (worldIds.Count > 0)
        {
            var existing = await dbContext.Worlds.AsNoTracking()
                .Where(w => worldIds.Contains(w.Id))
                .Select(w => w.Id)
                .ToListAsync(cancellationToken);
            var missing = worldIds.Except(existing).ToList();
            if (missing.Count > 0)
            {
                errors["worldIds"] = [$"Unknown world(s): {string.Join(", ", missing)}."];
            }
        }

        if (errors.Count > 0)
        {
            return new ApiKeyRequestResult(ApiKeyRequestOutcome.Invalid, Errors: errors);
        }

        // Open requests are few by construction (that is what the limits below enforce), so load and count in memory.
        var open = await dbContext.ApiKeyRequests
            .Where(r => r.Status == ApiKeyRequestStatus.Pending || r.Status == ApiKeyRequestStatus.Approved)
            .ToListAsync(cancellationToken);
        var stale = open.Where(r => r.ExpiresAt <= now - TimeSpan.FromDays(1)).ToList();
        if (stale.Count > 0)
        {
            dbContext.ApiKeyRequests.RemoveRange(stale);
        }

        var live = open.Where(r => r.ExpiresAt > now).ToList();
        if (live.Count >= _options.MaxOpenRequestsTotal
            || live.Count(r => r.RequesterIp == requesterIp) >= _options.MaxOpenRequestsPerIp)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return new ApiKeyRequestResult(
                ApiKeyRequestOutcome.TooManyRequests, Message: "Too many open API key requests; try again later.");
        }

        var pollSecret = ApiKeyToken.GenerateSecret();
        var request = new ApiKeyRequestEntity
        {
            Kind = ApiKeyRequestKind.New,
            Status = ApiKeyRequestStatus.Pending,
            UserCode = await NewUserCodeAsync(cancellationToken),
            PollSecretHash = ApiKeyToken.HashSecret(pollSecret),
            Name = input.Name!.Trim(),
            Purpose = Clean(input.Purpose),
            Description = Clean(input.Description),
            ContextUrl = Clean(input.ContextUrl),
            RequestedOwnerUserName = Clean(input.OwnerUserName),
            Features = features,
            AllWorlds = input.AllWorlds,
            WorldIds = worldIds,
            RequestsPerMinute = rpm,
            LifetimeMinutes = input.LifetimeMinutes,
            RequesterIp = requesterIp,
            RequesterUserAgent = TrimUserAgent(userAgent),
            CreatedAt = now,
            ExpiresAt = now + _options.RequestTimeout,
        };
        dbContext.ApiKeyRequests.Add(request);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "API key request {UserCode} ({RequestId}) opened for {Name} from {Ip}.",
            request.UserCode, request.Id, request.Name, requesterIp);
        return new ApiKeyRequestResult(ApiKeyRequestOutcome.Ok, request, pollSecret);
    }

    // ---- key holder: renew ----

    /// <summary>
    /// A key asks for its own successor: same owner, features, worlds and quota. One open renewal per key (an older
    /// one is expired). Approved on the spot while <see cref="ApiKeyEntity.AutoRenewUntil"/> lies ahead, with the
    /// lifetime capped so the new key never outlives it; otherwise it waits for an admin like any other request.
    /// </summary>
    public async Task<ApiKeyRequestResult> CreateRenewalAsync(
        Guid apiKeyId,
        int? lifetimeMinutes,
        string? description,
        string? contextUrl,
        string? requesterIp,
        string? userAgent,
        CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var key = await dbContext.ApiKeys.AsNoTracking().FirstOrDefaultAsync(k => k.Id == apiKeyId, cancellationToken);
        if (key is null || key.GetStatus(now) != ApiKeyStatus.Active)
        {
            return new ApiKeyRequestResult(ApiKeyRequestOutcome.NotFound);
        }

        var errors = new Dictionary<string, string[]>();
        RequireText(errors, "description", description, 1000, required: false);
        ValidateContextUrl(errors, contextUrl);

        var minMinutes = (int)_options.MinLifetime.TotalMinutes;
        var maxMinutes = (int)_options.MaxLifetime.TotalMinutes;
        var originalMinutes = (int)Math.Clamp((key.ExpiresAt - key.CreatedAt).TotalMinutes, minMinutes, maxMinutes);
        var lifetime = lifetimeMinutes ?? originalMinutes;
        if (lifetime < minMinutes || lifetime > maxMinutes)
        {
            errors["lifetimeMinutes"] = [$"The lifetime must be between {minMinutes} and {maxMinutes} minutes."];
        }

        if (errors.Count > 0)
        {
            return new ApiKeyRequestResult(ApiKeyRequestOutcome.Invalid, Errors: errors);
        }

        // One open renewal per key: whatever an earlier call left open stops being collectable.
        var earlier = await dbContext.ApiKeyRequests
            .Where(r => r.RenewsApiKeyId == key.Id
                && (r.Status == ApiKeyRequestStatus.Pending || r.Status == ApiKeyRequestStatus.Approved))
            .ToListAsync(cancellationToken);
        foreach (var old in earlier.Where(r => r.ExpiresAt > now))
        {
            old.ExpiresAt = now;
        }

        var autoApprove = false;
        if (key.AutoRenewUntil is { } autoUntil && autoUntil > now)
        {
            var window = (int)(autoUntil - now).TotalMinutes;
            var capped = Math.Min(lifetime, window);
            if (capped >= minMinutes)
            {
                lifetime = capped;
                autoApprove = true;
            }
        }

        var pollSecret = ApiKeyToken.GenerateSecret();
        var request = new ApiKeyRequestEntity
        {
            Kind = ApiKeyRequestKind.Renewal,
            Status = autoApprove ? ApiKeyRequestStatus.Approved : ApiKeyRequestStatus.Pending,
            UserCode = await NewUserCodeAsync(cancellationToken),
            PollSecretHash = ApiKeyToken.HashSecret(pollSecret),
            Name = key.Name,
            Purpose = key.Purpose,
            Description = Clean(description),
            ContextUrl = Clean(contextUrl),
            Features = new Dictionary<string, ApiKeyAccess>(key.Features),
            AllWorlds = key.AllWorlds,
            WorldIds = [.. key.WorldIds],
            RequestsPerMinute = key.RequestsPerMinute,
            LifetimeMinutes = lifetime,
            RenewsApiKeyId = key.Id,
            OwnerUserId = key.OwnerUserId,
            AutoRenewUntil = key.AutoRenewUntil,
            RequesterIp = requesterIp,
            RequesterUserAgent = TrimUserAgent(userAgent),
            CreatedAt = now,
            ExpiresAt = now + _options.RequestTimeout,
        };

        if (autoApprove)
        {
            request.DecidedAt = now;
            request.ApprovedFeatures = new Dictionary<string, ApiKeyAccess>(key.Features);
            request.ApprovedAllWorlds = key.AllWorlds;
            request.ApprovedWorldIds = [.. key.WorldIds];
            request.ApprovedRequestsPerMinute = key.RequestsPerMinute;
            request.ApprovedLifetimeMinutes = lifetime;
        }

        dbContext.ApiKeyRequests.Add(request);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "API key {ApiKeyId} requested renewal {UserCode} ({RequestId}); {Decision}.",
            key.Id, request.UserCode, request.Id, autoApprove ? "auto-approved" : "awaiting an admin");
        return new ApiKeyRequestResult(ApiKeyRequestOutcome.Ok, request, pollSecret);
    }

    // ---- anonymous: collect ----

    /// <summary>
    /// The requester's poll. Pending answers <see cref="ApiKeyRequestOutcome.Pending"/>; once approved the first poll
    /// creates the key (revoking the old one for a renewal) and returns the token, every later one is Gone.
    /// </summary>
    public async Task<ApiKeyRequestResult> PickUpAsync(Guid requestId, string? pollSecret, CancellationToken cancellationToken)
    {
        var request = await dbContext.ApiKeyRequests.FirstOrDefaultAsync(r => r.Id == requestId, cancellationToken);
        if (request is null
            || string.IsNullOrEmpty(pollSecret)
            || !ApiKeyToken.Verify(pollSecret, request.PollSecretHash))
        {
            return new ApiKeyRequestResult(ApiKeyRequestOutcome.NotFound);
        }

        var now = timeProvider.GetUtcNow();
        switch (request.GetEffectiveStatus(now))
        {
            case ApiKeyRequestStatus.Pending:
                return new ApiKeyRequestResult(ApiKeyRequestOutcome.Pending, request);
            case ApiKeyRequestStatus.Denied:
                return new ApiKeyRequestResult(ApiKeyRequestOutcome.Denied, request);
            case ApiKeyRequestStatus.Expired:
                return new ApiKeyRequestResult(ApiKeyRequestOutcome.Gone, request, Message: "The request expired.");
            case ApiKeyRequestStatus.Completed:
                return new ApiKeyRequestResult(
                    ApiKeyRequestOutcome.Gone, request, Message: "The token was already collected.");
        }

        ApiKeyEntity? renewed = null;
        if (request.RenewsApiKeyId is { } renewsId)
        {
            renewed = await dbContext.ApiKeys.FirstOrDefaultAsync(k => k.Id == renewsId, cancellationToken);
            if (renewed is null || renewed.GetStatus(now) != ApiKeyStatus.Active)
            {
                return new ApiKeyRequestResult(
                    ApiKeyRequestOutcome.Gone, request, Message: "The key to renew is no longer active.");
            }
        }

        var expiresAt = now + TimeSpan.FromMinutes(request.ApprovedLifetimeMinutes ?? request.LifetimeMinutes);
        if (request.Kind == ApiKeyRequestKind.Renewal && request.AutoRenewUntil is { } autoUntil
            && autoUntil > now && expiresAt > autoUntil)
        {
            expiresAt = autoUntil;
        }

        var settings = new ApiKeySettings(
            request.Name,
            request.Purpose,
            request.OwnerUserId!.Value,
            request.ApprovedFeatures,
            request.ApprovedAllWorlds ?? request.AllWorlds,
            request.ApprovedWorldIds,
            expiresAt,
            request.ApprovedRequestsPerMinute ?? request.RequestsPerMinute,
            request.AutoRenewUntil);
        var validation = await keyService.ValidateAsync(settings, request.RenewsApiKeyId, cancellationToken);
        if (!validation.IsValid)
        {
            return new ApiKeyRequestResult(
                ApiKeyRequestOutcome.Conflict,
                request,
                Errors: validation.Errors,
                Message: "The approved settings are no longer valid.");
        }

        var createdBy = request.DecidedByUserId ?? renewed?.CreatedByUserId ?? request.OwnerUserId!.Value;
        var (key, token) = keyService.Build(settings, createdBy);
        request.Status = ApiKeyRequestStatus.Completed;
        request.CompletedAt = now;
        request.ApiKeyId = key.Id;
        if (renewed is not null)
        {
            renewed.RevokedAt = now;
            renewed.ReplacedByApiKeyId = key.Id;
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Another poll got there first (or an admin denied it in the same instant): no key was created.
            return new ApiKeyRequestResult(ApiKeyRequestOutcome.Gone, Message: "The token was already collected.");
        }

        logger.LogInformation(
            "API key {ApiKeyName} ({ApiKeyId}) collected from request {UserCode}; owner {OwnerUserId}{Replaced}.",
            key.Name, key.Id, request.UserCode, key.OwnerUserId, renewed is null ? string.Empty : $", replaces {renewed.Id}");
        return new ApiKeyRequestResult(ApiKeyRequestOutcome.Ok, request, Key: key, Token: token);
    }

    // ---- admin ----

    /// <summary>
    /// Lists requests, newest first. <paramref name="status"/> null: pending and approved ones that have not expired;
    /// otherwise one of the status names, or <c>all</c>. Null with an unknown name.
    /// </summary>
    public async Task<IReadOnlyList<ApiKeyRequestEntity>?> ListAsync(string? status, CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        Func<ApiKeyRequestEntity, bool> filter;
        if (string.IsNullOrWhiteSpace(status))
        {
            filter = r => r.GetEffectiveStatus(now) is ApiKeyRequestStatus.Pending or ApiKeyRequestStatus.Approved;
        }
        else if (string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
        {
            filter = _ => true;
        }
        else if (Enum.TryParse<ApiKeyRequestStatus>(status, ignoreCase: true, out var wanted))
        {
            filter = r => r.GetEffectiveStatus(now) == wanted;
        }
        else
        {
            return null;
        }

        var all = await dbContext.ApiKeyRequests.AsNoTracking().ToListAsync(cancellationToken);
        return [.. all.Where(filter).OrderByDescending(r => r.CreatedAt).Take(200)];
    }

    /// <summary>Finds a request by id, for admin responses.</summary>
    public Task<ApiKeyRequestEntity?> FindAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.ApiKeyRequests.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

    /// <summary>
    /// Approves a pending request, fixing the final settings (the request's, overridden by <paramref name="overrides"/>).
    /// Owner defaults to the requested user name if such a user exists, else the approving admin. The key is only
    /// created when the requester collects it.
    /// </summary>
    public async Task<ApiKeyRequestResult> ApproveAsync(
        Guid requestId, Guid adminUserId, ApprovalOverrides overrides, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(overrides);

        var request = await dbContext.ApiKeyRequests.FirstOrDefaultAsync(r => r.Id == requestId, cancellationToken);
        if (request is null)
        {
            return new ApiKeyRequestResult(ApiKeyRequestOutcome.NotFound);
        }

        var now = timeProvider.GetUtcNow();
        switch (request.GetEffectiveStatus(now))
        {
            case ApiKeyRequestStatus.Expired:
                return new ApiKeyRequestResult(ApiKeyRequestOutcome.Gone, request, Message: "The request expired.");
            case ApiKeyRequestStatus.Pending:
                break;
            default:
                return new ApiKeyRequestResult(
                    ApiKeyRequestOutcome.Conflict, request, Message: $"The request is already {request.Status}.");
        }

        var ownerId = overrides.OwnerUserId ?? request.OwnerUserId;
        if (ownerId is null && !string.IsNullOrWhiteSpace(request.RequestedOwnerUserName))
        {
            var normalised = request.RequestedOwnerUserName.Trim().ToLowerInvariant();
            ownerId = await dbContext.Users.AsNoTracking()
                .Where(u => u.NormalizedUserName == normalised && !u.IsSystem)
                .Select(u => (Guid?)u.Id)
                .FirstOrDefaultAsync(cancellationToken);
        }

        ownerId ??= adminUserId;

        var features = overrides.Features is null
            ? new Dictionary<string, ApiKeyAccess>(request.Features)
            : ApiKeyService.NormaliseFeatures(overrides.Features);
        var allWorlds = overrides.AllWorlds ?? request.AllWorlds;
        var worldIds = allWorlds ? [] : (overrides.WorldIds ?? request.WorldIds).Distinct().ToList();
        var lifetime = overrides.LifetimeMinutes ?? request.LifetimeMinutes;
        var rpm = overrides.RequestsPerMinute ?? request.RequestsPerMinute;

        DateTimeOffset? autoRenewUntil = overrides.AutoRenewMinutes switch
        {
            null => request.AutoRenewUntil,
            <= 0 => null,
            int minutes => now + TimeSpan.FromMinutes(minutes),
        };

        var settings = new ApiKeySettings(
            request.Name, request.Purpose, ownerId.Value, features, allWorlds, worldIds,
            now + TimeSpan.FromMinutes(Math.Max(lifetime, 0)), rpm, autoRenewUntil);
        var validation = await keyService.ValidateAsync(settings, request.RenewsApiKeyId, cancellationToken);
        var errors = new Dictionary<string, string[]>(validation.Errors);
        if (lifetime < 1)
        {
            errors.Remove("expiresAt");
            errors["lifetimeMinutes"] = ["The lifetime must be at least one minute."];
        }
        else if (errors.Remove("expiresAt"))
        {
            errors["lifetimeMinutes"] = [$"A key may live at most {(int)_options.MaxLifetime.TotalMinutes} minutes."];
        }

        if (errors.Count > 0)
        {
            return new ApiKeyRequestResult(ApiKeyRequestOutcome.Invalid, request, Errors: errors);
        }

        request.Status = ApiKeyRequestStatus.Approved;
        request.DecidedAt = now;
        request.DecidedByUserId = adminUserId;
        request.OwnerUserId = ownerId;
        request.ApprovedFeatures = features;
        request.ApprovedAllWorlds = allWorlds;
        request.ApprovedWorldIds = worldIds;
        request.ApprovedRequestsPerMinute = rpm;
        request.ApprovedLifetimeMinutes = lifetime;
        request.AutoRenewUntil = autoRenewUntil;
        if (request.ExpiresAt < now + PickupGrace)
        {
            request.ExpiresAt = now + PickupGrace;
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return new ApiKeyRequestResult(
                ApiKeyRequestOutcome.Conflict, Message: "The request was changed by someone else; reload it.");
        }

        logger.LogInformation(
            "API key request {UserCode} ({RequestId}) approved by admin {AdminUserId}; owner {OwnerUserId}.",
            request.UserCode, request.Id, adminUserId, ownerId);
        return new ApiKeyRequestResult(ApiKeyRequestOutcome.Ok, request);
    }

    /// <summary>Denies a request that is pending or approved-but-not-yet-collected.</summary>
    public async Task<ApiKeyRequestResult> DenyAsync(Guid requestId, Guid adminUserId, CancellationToken cancellationToken)
    {
        var request = await dbContext.ApiKeyRequests.FirstOrDefaultAsync(r => r.Id == requestId, cancellationToken);
        if (request is null)
        {
            return new ApiKeyRequestResult(ApiKeyRequestOutcome.NotFound);
        }

        var now = timeProvider.GetUtcNow();
        switch (request.GetEffectiveStatus(now))
        {
            case ApiKeyRequestStatus.Expired:
                return new ApiKeyRequestResult(ApiKeyRequestOutcome.Gone, request, Message: "The request expired.");
            case ApiKeyRequestStatus.Pending or ApiKeyRequestStatus.Approved:
                break;
            default:
                return new ApiKeyRequestResult(
                    ApiKeyRequestOutcome.Conflict, request, Message: $"The request is already {request.Status}.");
        }

        request.Status = ApiKeyRequestStatus.Denied;
        request.DecidedAt = now;
        request.DecidedByUserId = adminUserId;
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return new ApiKeyRequestResult(
                ApiKeyRequestOutcome.Conflict, Message: "The request was changed by someone else; reload it.");
        }

        logger.LogInformation(
            "API key request {UserCode} ({RequestId}) denied by admin {AdminUserId}.",
            request.UserCode, request.Id, adminUserId);
        return new ApiKeyRequestResult(ApiKeyRequestOutcome.Ok, request);
    }

    /// <summary>Maps requests to their admin-list shape, resolving the user names they mention in one query.</summary>
    public async Task<IReadOnlyList<ApiKeyRequestResponse>> ToResponsesAsync(
        IReadOnlyList<ApiKeyRequestEntity> requests, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(requests);

        var userIds = requests
            .SelectMany(r => new[] { r.DecidedByUserId, r.OwnerUserId })
            .OfType<Guid>()
            .Distinct()
            .ToList();
        var names = await dbContext.Users.AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.UserName, cancellationToken);
        var now = timeProvider.GetUtcNow();

        return
        [
            .. requests.Select(r => new ApiKeyRequestResponse(
                r.Id,
                r.Kind,
                r.GetEffectiveStatus(now),
                r.UserCode,
                r.Name,
                r.Purpose,
                r.Description,
                r.ContextUrl,
                new Dictionary<string, ApiKeyAccess>(r.Features),
                r.AllWorlds,
                [.. r.WorldIds],
                r.RequestsPerMinute,
                r.LifetimeMinutes,
                r.RequestedOwnerUserName,
                r.RenewsApiKeyId,
                r.RequesterIp,
                r.RequesterUserAgent,
                r.CreatedAt,
                r.ExpiresAt,
                r.DecidedAt,
                r.DecidedByUserId,
                r.DecidedByUserId is { } decider ? names.GetValueOrDefault(decider) : null,
                r.ApiKeyId,
                r.CompletedAt,
                r.OwnerUserId is { } owner && r.DecidedAt is not null && r.Status != ApiKeyRequestStatus.Denied
                    ? new ApiKeyApprovalResponse(
                        owner,
                        names.GetValueOrDefault(owner),
                        new Dictionary<string, ApiKeyAccess>(r.ApprovedFeatures),
                        r.ApprovedAllWorlds ?? r.AllWorlds,
                        [.. r.ApprovedWorldIds],
                        r.ApprovedRequestsPerMinute ?? r.RequestsPerMinute,
                        r.ApprovedLifetimeMinutes ?? r.LifetimeMinutes,
                        r.AutoRenewUntil)
                    : null)),
        ];
    }

    // ---- helpers ----

    private async Task<string> NewUserCodeAsync(CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 20; attempt++)
        {
            var chars = new char[9];
            for (var i = 0; i < 8; i++)
            {
                chars[i < 4 ? i : i + 1] = UserCodeAlphabet[RandomNumberGenerator.GetInt32(UserCodeAlphabet.Length)];
            }

            chars[4] = '-';
            var code = new string(chars);
            if (!await dbContext.ApiKeyRequests.AnyAsync(r => r.UserCode == code, cancellationToken))
            {
                return code;
            }
        }

        throw new InvalidOperationException("Could not generate a unique API key request code.");
    }

    private static string? TrimUserAgent(string? userAgent) =>
        string.IsNullOrWhiteSpace(userAgent) ? null : userAgent.Length > 500 ? userAgent[..500] : userAgent;

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static void RequireText(
        Dictionary<string, string[]> errors, string field, string? value, int maxLength, bool required)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            if (required)
            {
                errors[field] = [$"{field} is required."];
            }
        }
        else if (value.Trim().Length > maxLength)
        {
            errors[field] = [$"{field} may be at most {maxLength} characters."];
        }
    }

    private static void ValidateContextUrl(Dictionary<string, string[]> errors, string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return;
        }

        if (url.Trim().Length > 500)
        {
            errors["contextUrl"] = ["contextUrl may be at most 500 characters."];
        }
        else if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var parsed)
            || (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps))
        {
            errors["contextUrl"] = ["contextUrl must be an http or https URL."];
        }
    }
}
