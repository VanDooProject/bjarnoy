using Bjarnoy.Api.Contracts;
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
    DateTimeOffset? AutoRenewUntil,
    IReadOnlyList<Guid>? AdditionalUserIds = null,
    IReadOnlyList<AnonymousAccountGrant>? AnonymousAccounts = null,
    bool OwnerCanAct = true);

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
    /// <summary>How many extra accounts one key may act as, besides its owner.</summary>
    public const int MaxAdditionalAccounts = 10;

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

        if (owner is not null && !errors.ContainsKey("ownerUserId")
            && await IsAtCapAsync(owner.Id, excludeKeyId, now, cancellationToken))
        {
            errors["ownerUserId"] = [$"This user already has {_options.MaxActiveKeysPerOwner} active API keys."];
        }

        var anonymous = settings.AnonymousAccounts ?? [];
        var additional = settings.AdditionalUserIds ?? [];
        var anonymousErrors = await ValidateAnonymousAsync(settings, anonymous, additional.Count, cancellationToken);
        if (anonymousErrors.Count > 0)
        {
            errors["anonymousAccounts"] = [.. anonymousErrors];
        }

        if (additional.Count > MaxAdditionalAccounts)
        {
            errors["additionalUserIds"] = [$"A key may act as at most {MaxAdditionalAccounts} further accounts."];
        }
        else if (additional.Count > 0)
        {
            var extraErrors = await ValidateAdditionalAsync(
                settings.OwnerUserId, additional, excludeKeyId, now, cancellationToken);
            if (extraErrors.Count > 0)
            {
                errors["additionalUserIds"] = [.. extraErrors];
            }
        }

        return new ApiKeyValidation(errors);
    }

    private async Task<List<string>> ValidateAnonymousAsync(
        ApiKeySettings settings, IReadOnlyList<AnonymousAccountGrant> anonymous, int additionalCount, CancellationToken cancellationToken)
    {
        var errors = new List<string>();
        if (anonymous.Count + additionalCount > MaxAdditionalAccounts)
        {
            errors.Add($"A key may act as at most {MaxAdditionalAccounts} further accounts in total.");
        }

        if (anonymous.Select(a => a.Label).Distinct(StringComparer.OrdinalIgnoreCase).Count() != anonymous.Count
            || anonymous.Select(a => a.OwnerId).Distinct().Count() != anonymous.Count)
        {
            errors.Add("An anonymous account may be listed only once, and its jarl names must differ.");
        }

        if (anonymous.Count(a => a.IsPrimary) > 1)
        {
            errors.Add("Only one anonymous account can be the primary one.");
        }

        if (!settings.OwnerCanAct)
        {
            if (anonymous.Count == 0)
            {
                errors.Add("A key whose owner cannot act needs at least one anonymous account.");
            }

            if (settings.Features.Keys.Any(f => ApiKeyFeature.Find(f)?.Admin == true))
            {
                errors.Add("admin.* features need a key whose owner can act, and an anonymous account has no admin rights.");
            }
        }

        var ownerIds = anonymous.Select(a => a.OwnerId).ToList();
        if (ownerIds.Count > 0)
        {
            var anonymousNow = await dbContext.Settlements.AsNoTracking()
                .Where(s => s.UserId == SystemUserIds.Abandoned && ownerIds.Contains(s.OwnerId))
                .Select(s => s.OwnerId)
                .Distinct()
                .ToListAsync(cancellationToken);
            foreach (var missing in anonymous.Where(a => !anonymousNow.Contains(a.OwnerId)))
            {
                errors.Add($"{missing.Label} is not an anonymous player any more.");
            }
        }

        return errors;
    }

    /// <summary>
    /// Turns the anonymous accounts of a body into stored grants: an <c>Id</c> keeps an existing grant of
    /// <paramref name="existing"/>, a <c>SettlementId</c> picks a new identity from that settlement (its owner id, and its
    /// jarl name as label, plus the settlement name when two would collide). Errors name what could not be resolved.
    /// </summary>
    public async Task<(List<AnonymousAccountGrant> Grants, List<string> Errors)> ResolveAnonymousAsync(
        IReadOnlyList<AnonymousAccountInput> inputs,
        IReadOnlyCollection<ApiKeyAnonymousAccountEntity> existing,
        CancellationToken cancellationToken)
    {
        var grants = new List<AnonymousAccountGrant>();
        var errors = new List<string>();
        var settlementIds = inputs.Where(i => i.Id is null && i.SettlementId is not null).Select(i => i.SettlementId!.Value).ToList();
        var settlements = settlementIds.Count == 0
            ? []
            : await dbContext.Settlements.AsNoTracking()
                .Where(s => settlementIds.Contains(s.Id))
                .ToDictionaryAsync(s => s.Id, cancellationToken);

        foreach (var input in inputs)
        {
            if (input.Id is { } id)
            {
                var row = existing.FirstOrDefault(e => e.Id == id);
                if (row is null)
                {
                    errors.Add($"Unknown anonymous account {id}.");
                }
                else
                {
                    grants.Add(new AnonymousAccountGrant(row.OwnerId, row.Label, input.Primary, row.SourceSettlementId));
                }
            }
            else if (input.SettlementId is { } settlementId && settlements.TryGetValue(settlementId, out var settlement))
            {
                if (settlement.UserId != SystemUserIds.Abandoned)
                {
                    errors.Add($"{settlement.OwnerName} has an account; add the account instead.");
                    continue;
                }

                grants.Add(new AnonymousAccountGrant(settlement.OwnerId, settlement.OwnerName, input.Primary, settlement.Id));
            }
            else
            {
                errors.Add("Each anonymous account needs the id of an existing grant or of a settlement.");
            }
        }

        // Two jarls with the same nickname are told apart by their settlement name, so X-Act-As stays unambiguous.
        var duplicated = grants.GroupBy(g => g.Label, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1).Select(g => g.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (duplicated.Count > 0)
        {
            var names = await dbContext.Settlements.AsNoTracking()
                .Where(s => grants.Select(g => g.SourceSettlementId).Contains(s.Id))
                .ToDictionaryAsync(s => s.Id, s => s.Name, cancellationToken);
            grants = [.. grants.Select(g => duplicated.Contains(g.Label) && g.SourceSettlementId is { } sid && names.TryGetValue(sid, out var n)
                ? g with { Label = $"{g.Label} ({n})" }
                : g)];
        }

        return (grants, errors);
    }

    /// <summary>Settlement name, world and whether it was claimed since, per owner id, for the admin key list.</summary>
    public async Task<Dictionary<string, AnonymousAccountInfo>> AnonymousInfoAsync(
        IEnumerable<ApiKeyEntity> keys, CancellationToken cancellationToken)
    {
        var ownerIds = keys.SelectMany(k => k.AnonymousAccounts).Select(a => a.OwnerId).Distinct().ToList();
        if (ownerIds.Count == 0)
        {
            return [];
        }

        var settlements = await dbContext.Settlements.AsNoTracking()
            .Include(s => s.World)
            .Where(s => ownerIds.Contains(s.OwnerId))
            .OrderBy(s => s.Id)
            .ToListAsync(cancellationToken);
        return ownerIds.ToDictionary(
            id => id,
            id =>
            {
                var own = settlements.Where(s => s.OwnerId == id).ToList();
                var anonymousOne = own.FirstOrDefault(s => s.UserId == SystemUserIds.Abandoned);
                var shown = anonymousOne ?? own.FirstOrDefault();
                return new AnonymousAccountInfo(shown?.Name, shown?.World?.Name, anonymousOne is null);
            });
    }

    private async Task<List<string>> ValidateAdditionalAsync(
        Guid ownerId, IReadOnlyList<Guid> additional, Guid? excludeKeyId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var errors = new List<string>();
        if (additional.Distinct().Count() != additional.Count)
        {
            errors.Add("An account may be listed only once.");
        }

        var users = await dbContext.Users.AsNoTracking()
            .Where(u => additional.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, cancellationToken);
        foreach (var id in additional.Distinct())
        {
            if (id == ownerId)
            {
                errors.Add("The owner is already an account of the key; list only the further ones.");
            }
            else if (!users.TryGetValue(id, out var user) || user.IsSystem)
            {
                errors.Add($"Unknown account {id}.");
            }
            else if (user.Status == UserStatus.Banned)
            {
                errors.Add($"{user.UserName} is banned and cannot be an account of an API key.");
            }
            else if (await IsAtCapAsync(id, excludeKeyId, now, cancellationToken))
            {
                errors.Add($"{user.UserName} already has {_options.MaxActiveKeysPerOwner} active API keys.");
            }
        }

        return errors;
    }

    /// <summary>A key counts against every account it can act as, so the cap covers owned and extra accounts alike.</summary>
    private async Task<bool> IsAtCapAsync(Guid userId, Guid? excludeKeyId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var expiries = await dbContext.ApiKeys.AsNoTracking()
            .Where(k => (k.OwnerUserId == userId || k.Accounts.Any(a => a.UserId == userId))
                && k.Id != excludeKeyId && k.RevokedAt == null)
            .Select(k => k.ExpiresAt)
            .ToListAsync(cancellationToken);
        return expiries.Count(expiry => expiry > now) >= _options.MaxActiveKeysPerOwner;
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
            Accounts = [.. (settings.AdditionalUserIds ?? []).Distinct().Select(id => new ApiKeyAccountEntity { UserId = id })],
            OwnerCanAct = settings.OwnerCanAct,
            AnonymousAccounts = [.. (settings.AnonymousAccounts ?? []).Select(g => new ApiKeyAnonymousAccountEntity
            {
                OwnerId = g.OwnerId,
                Label = g.Label,
                IsPrimary = g.IsPrimary,
                SourceSettlementId = g.SourceSettlementId,
            })],
        };
        dbContext.ApiKeys.Add(key);
        return (key, token);
    }

    /// <summary>Loads a key with its owner and creator for responses; null when it does not exist.</summary>
    public Task<ApiKeyEntity?> FindAsync(Guid id, bool track, CancellationToken cancellationToken)
    {
        var query = dbContext.ApiKeys
            .Include(k => k.OwnerUser)
            .Include(k => k.CreatedByUser)
            .Include(k => k.Accounts).ThenInclude(a => a.User)
            .Include(k => k.AnonymousAccounts)
            .AsQueryable();
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
