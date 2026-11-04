using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Api.Auth.ApiKeys;

/// <summary>
/// The settings a key is being created or edited with, before validation. Shared by direct admin creation, admin
/// edits and the pickup of an approved request, so all three go through the same rules.
/// </summary>
/// <param name="ExpiresAt">Absolute expiry; the caller turns a request's lifetime into one at the moment it counts.</param>
public sealed record ApiKeySettings(
    string Name,
    string? Purpose,
    Guid OwnerUserId,
    IReadOnlyDictionary<string, ApiKeyAccess> Features,
    bool AllWorlds,
    IReadOnlyList<Guid> WorldIds,
    DateTimeOffset ExpiresAt,
    int RequestsPerMinute,
    DateTimeOffset? AutoRenewUntil);

/// <summary>The outcome of <see cref="ApiKeyService.ValidateAsync"/>: field errors, empty when the settings are valid.</summary>
public sealed record ApiKeyValidation(IReadOnlyDictionary<string, string[]> Errors)
{
    public bool IsValid => Errors.Count == 0;
}

/// <summary>
/// Creation, validation and revocation of API keys: the rules every route that mints or edits a key shares.
/// </summary>
/// <remarks>
/// All time arithmetic uses the injected <see cref="TimeProvider"/>. Because SQLite cannot compare or order
/// <see cref="DateTimeOffset"/> in SQL, "how many active keys does this owner hold" loads that owner's (few) keys and
/// counts in memory.
/// </remarks>
public sealed class ApiKeyService(
    GameDbContext dbContext,
    TimeProvider timeProvider,
    IOptions<ApiKeyOptions> options,
    ILogger<ApiKeyService> logger)
{
    private readonly ApiKeyOptions _options = options.Value;

    /// <summary>Drops <see cref="ApiKeyAccess.None"/> entries; what is left is what a key stores.</summary>
    public static Dictionary<string, ApiKeyAccess> NormaliseFeatures(IReadOnlyDictionary<string, ApiKeyAccess>? features) =>
        features is null
            ? []
            : features.Where(kv => kv.Value != ApiKeyAccess.None)
                .ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.Ordinal);

    /// <summary>
    /// Checks <paramref name="settings"/> against the catalogue and limits: name, at least one known feature, admin
    /// features only for an admin owner, a real non-banned owner, existing worlds, expiry in (now, now + max], a
    /// sane request quota and room under the per-owner active-key cap.
    /// </summary>
    /// <param name="excludeKeyId">A key being edited or replaced, which must not count against the cap.</param>
    public async Task<ApiKeyValidation> ValidateAsync(
        ApiKeySettings settings, Guid? excludeKeyId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(settings);

        var errors = new Dictionary<string, string[]>();
        var now = timeProvider.GetUtcNow();

        if (string.IsNullOrWhiteSpace(settings.Name))
        {
            errors["name"] = ["A name is required."];
        }
        else if (settings.Name.Length > 100)
        {
            errors["name"] = ["The name may be at most 100 characters."];
        }

        if (settings.Purpose is { Length: > 500 })
        {
            errors["purpose"] = ["The purpose may be at most 500 characters."];
        }

        var featureErrors = ValidateFeatures(settings.Features);

        var owner = await dbContext.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == settings.OwnerUserId, cancellationToken);
        if (owner is null || owner.IsSystem)
        {
            errors["ownerUserId"] = ["The owner must be an existing user account."];
        }
        else if (owner.Status == UserStatus.Banned)
        {
            errors["ownerUserId"] = ["A banned user cannot own an API key."];
        }
        else if (owner.Role != UserRole.Admin
            && settings.Features.Keys.Any(f => ApiKeyFeature.Find(f)?.Admin == true))
        {
            featureErrors.Add("admin.* features can only be given to a key owned by an admin.");
        }

        if (featureErrors.Count > 0)
        {
            errors["features"] = [.. featureErrors];
        }

        if (!settings.AllWorlds && settings.WorldIds.Count > 0)
        {
            var distinct = settings.WorldIds.Distinct().ToList();
            var existing = await dbContext.Worlds.AsNoTracking()
                .Where(w => distinct.Contains(w.Id))
                .Select(w => w.Id)
                .ToListAsync(cancellationToken);
            var missing = distinct.Except(existing).ToList();
            if (missing.Count > 0)
            {
                errors["worldIds"] = [$"Unknown world(s): {string.Join(", ", missing)}."];
            }
        }

        if (settings.ExpiresAt <= now)
        {
            errors["expiresAt"] = ["The expiry must lie in the future."];
        }
        else if (settings.ExpiresAt > now + _options.MaxLifetime)
        {
            errors["expiresAt"] = [$"A key may live at most {_options.MaxLifetime.TotalDays:0.##} days."];
        }

        if (settings.RequestsPerMinute < 1 || settings.RequestsPerMinute > _options.MaxRequestsPerMinute)
        {
            errors["requestsPerMinute"] = [$"Requests per minute must be between 1 and {_options.MaxRequestsPerMinute}."];
        }

        if (owner is not null && !errors.ContainsKey("ownerUserId"))
        {
            var ownersKeys = await dbContext.ApiKeys.AsNoTracking()
                .Where(k => k.OwnerUserId == owner.Id && k.Id != excludeKeyId && k.RevokedAt == null)
                .Select(k => k.ExpiresAt)
                .ToListAsync(cancellationToken);
            if (ownersKeys.Count(expiry => expiry > now) >= _options.MaxActiveKeysPerOwner)
            {
                errors["ownerUserId"] = [$"This user already has {_options.MaxActiveKeysPerOwner} active API keys."];
            }
        }

        return new ApiKeyValidation(errors);
    }

    /// <summary>Feature-map errors only (known ids, a level other than None, at least one feature).</summary>
    public static List<string> ValidateFeatures(IReadOnlyDictionary<string, ApiKeyAccess> features)
    {
        var errors = new List<string>();
        if (features.Count == 0)
        {
            errors.Add("At least one feature is required.");
        }

        foreach (var (feature, level) in features)
        {
            if (!ApiKeyFeature.IsKnown(feature))
            {
                errors.Add($"Unknown feature '{feature}'.");
            }
            else if (level == ApiKeyAccess.None || !Enum.IsDefined(level))
            {
                errors.Add($"Feature '{feature}' needs Read or ReadWrite.");
            }
        }

        return errors;
    }

    /// <summary>
    /// Builds a new key from valid <paramref name="settings"/> and adds it to the context — the caller saves, so the
    /// creation can share a transaction with whatever else changes (a request completing, a key being replaced).
    /// Returns the entity and the one-time token.
    /// </summary>
    public (ApiKeyEntity Key, string Token) Build(ApiKeySettings settings, Guid createdByUserId)
    {
        ArgumentNullException.ThrowIfNull(settings);

        var (keyId, secret, token) = ApiKeyToken.Generate();
        var key = new ApiKeyEntity
        {
            Name = settings.Name.Trim(),
            KeyId = keyId,
            SecretHash = ApiKeyToken.HashSecret(secret),
            OwnerUserId = settings.OwnerUserId,
            CreatedByUserId = createdByUserId,
            Features = NormaliseFeatures(settings.Features),
            AllWorlds = settings.AllWorlds,
            WorldIds = settings.AllWorlds ? [] : [.. settings.WorldIds.Distinct()],
            RequestsPerMinute = settings.RequestsPerMinute,
            CreatedAt = timeProvider.GetUtcNow(),
            ExpiresAt = settings.ExpiresAt,
            AutoRenewUntil = settings.AutoRenewUntil,
            Purpose = string.IsNullOrWhiteSpace(settings.Purpose) ? null : settings.Purpose.Trim(),
        };
        dbContext.ApiKeys.Add(key);
        return (key, token);
    }

    /// <summary>Loads a key with its owner and creator for responses; null when it does not exist.</summary>
    public Task<ApiKeyEntity?> FindAsync(Guid id, bool track, CancellationToken cancellationToken)
    {
        var query = dbContext.ApiKeys.Include(k => k.OwnerUser).Include(k => k.CreatedByUser).AsQueryable();
        if (!track)
        {
            query = query.AsNoTracking();
        }

        return query.FirstOrDefaultAsync(k => k.Id == id, cancellationToken);
    }

    public void LogCreated(string verb, ApiKeyEntity key, Guid adminUserId) =>
        logger.LogInformation(
            "API key {ApiKeyName} ({ApiKeyId}) {Verb} by admin {AdminUserId}; owner {OwnerUserId}.",
            key.Name, key.Id, verb, adminUserId, key.OwnerUserId);
}
