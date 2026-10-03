namespace Bjarnoy.Api.Auth.ApiKeys;

/// <summary>
/// Limits and defaults for debug API keys and the request flow that hands them out, bound from the
/// <c>ApiKeys</c> config section (same convention as <see cref="JwtOptions"/>). Every value has a working default, so
/// a deployment that configures nothing still gets sensible, conservative limits.
/// </summary>
public sealed class ApiKeyOptions
{
    public const string SectionName = "ApiKeys";

    /// <summary>The longest a key may live from the moment it is created (or picked up, for a request).</summary>
    public TimeSpan MaxLifetime { get; set; } = TimeSpan.FromDays(30);

    /// <summary>The shortest lifetime a request or a renewal may ask for.</summary>
    public TimeSpan MinLifetime { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>The per-key request quota used when none is asked for.</summary>
    public int DefaultRequestsPerMinute { get; set; } = 120;

    /// <summary>The highest per-key request quota an admin or a request may set.</summary>
    public int MaxRequestsPerMinute { get; set; } = 1200;

    /// <summary>How many active (unrevoked, unexpired) keys one owner may hold at once.</summary>
    public int MaxActiveKeysPerOwner { get; set; } = 20;

    /// <summary>How long an admin has to approve a request before it expires.</summary>
    public TimeSpan RequestTimeout { get; set; } = TimeSpan.FromMinutes(30);

    /// <summary>A guard on the anonymous request endpoint: open (pending or approved, unexpired) requests in total.</summary>
    public int MaxOpenRequestsTotal { get; set; } = 20;

    /// <summary>A guard on the anonymous request endpoint: open requests from one client address.</summary>
    public int MaxOpenRequestsPerIp { get; set; } = 5;

    /// <summary>The poll interval the request flow tells the requester to use.</summary>
    public int PollIntervalSeconds { get; set; } = 5;

    /// <summary>
    /// Base URL the approval link is built on (<c>&lt;base&gt;/admin/api-keys?request=&lt;code&gt;</c>). Unset: derived from the
    /// request's scheme and host, which is right behind the forwarded-headers middleware.
    /// </summary>
    public string? PublicBaseUrl { get; set; }
}
