namespace Bjarnoy.Api.Hosting;

/// <summary>
/// VAPID settings for Web Push, bound from the <c>Push</c> config section —
/// same convention as <c>Jwt:SigningKey</c> (<c>JwtOptions</c>). Unlike the
/// JWT key, this feature is optional: an environment that sets none of the
/// three values simply runs without push (<c>GET /api/v1/notifications/config</c>
/// reports <c>enabled: false</c>, the subscription/preference endpoints
/// 404, and the delivery/scanner hosted services are not registered — see
/// <c>Program.cs</c>). Setting only some of the three is treated as a
/// misconfiguration and fails startup, the same as a missing JWT key.
/// </summary>
public sealed class PushOptions
{
    public const string SectionName = "Push";

    public string? VapidPublicKey { get; set; }

    public string? VapidPrivateKey { get; set; }

    /// <summary>A <c>mailto:</c> address or site URL, per RFC 8292 — identifies who to contact about this sender.</summary>
    public string? Subject { get; set; }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(VapidPublicKey)
        && !string.IsNullOrWhiteSpace(VapidPrivateKey)
        && !string.IsNullOrWhiteSpace(Subject);

    public bool IsPartiallyConfigured =>
        !IsConfigured
        && (!string.IsNullOrWhiteSpace(VapidPublicKey)
            || !string.IsNullOrWhiteSpace(VapidPrivateKey)
            || !string.IsNullOrWhiteSpace(Subject));
}
