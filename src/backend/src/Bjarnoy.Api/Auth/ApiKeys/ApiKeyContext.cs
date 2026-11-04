using System.Security.Claims;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.Auth.ApiKeys;

/// <summary>
/// What the authentication handler learned about the key behind a request, parked on <see cref="HttpContext.Items"/>
/// so <see cref="ApiKeyScopeMiddleware"/> and the self endpoint need no second database read.
/// </summary>
public sealed record ApiKeyContext(
    Guid ApiKeyId,
    string KeyId,
    string Name,
    Guid OwnerUserId,
    IReadOnlyDictionary<string, ApiKeyAccess> Features,
    bool AllWorlds,
    IReadOnlySet<Guid> WorldIds,
    int RequestsPerMinute)
{
    internal const string ItemKey = "bjarnoy:api_key_context";

    /// <summary>Set (to a reason) when a request presented an API key that failed authentication.</summary>
    internal const string FailureItemKey = "bjarnoy:api_key_failure";

    /// <summary>The level this key has for <paramref name="feature"/>; <see cref="ApiKeyAccess.None"/> when absent.</summary>
    public ApiKeyAccess AccessTo(string feature) =>
        Features.TryGetValue(feature, out var level) ? level : ApiKeyAccess.None;

    public static ApiKeyContext? From(HttpContext context) =>
        context.Items.TryGetValue(ItemKey, out var value) ? value as ApiKeyContext : null;
}

/// <summary>Claim names and helpers for a principal built from an API key.</summary>
public static class ApiKeyClaims
{
    public const string ApiKeyId = "bjarnoy:api_key_id";
    public const string ApiKeyName = "bjarnoy:api_key_name";

    /// <summary>True when the request was authenticated with an API key rather than a user's JWT.</summary>
    public static bool IsApiKey(this ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true && user.HasClaim(c => c.Type == ApiKeyId);

    /// <summary>The key's database id, or null for a non-key principal.</summary>
    public static Guid? GetApiKeyId(this ClaimsPrincipal user) =>
        Guid.TryParse(user.FindFirstValue(ApiKeyId), out var id) ? id : null;
}
