namespace Bjarnoy.Api.Auth;

/// <summary>
/// Signing settings for access tokens, bound from the <c>Jwt</c> config
/// section — see <c>Database:ConnectionString</c> in
/// <c>DatabaseOptions</c> for the same convention.
/// </summary>
public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    /// <summary>
    /// Symmetric key access tokens are signed with. Required — there is no
    /// code-level fallback, because a fallback here would mean every unconfigured
    /// deployment silently shares one signing key.
    /// </summary>
    public required string SigningKey { get; set; }

    public string Issuer { get; set; } = "bjarnoy";

    public string Audience { get; set; } = "bjarnoy";

    /// <summary>Kept short — the refresh token, not this, is what a ban/lock revokes.</summary>
    public int AccessTokenLifetimeMinutes { get; set; } = 15;
}
