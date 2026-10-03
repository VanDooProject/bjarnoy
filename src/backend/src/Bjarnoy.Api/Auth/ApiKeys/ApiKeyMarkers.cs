namespace Bjarnoy.Api.Auth.ApiKeys;

/// <summary>What an endpoint tells <see cref="ApiKeyScopeMiddleware"/> about being called with an API key.</summary>
public enum ApiKeyEndpointKind
{
    /// <summary>Callable with a key that holds <see cref="ApiKeyEndpointMarker.Feature"/> at the level the method needs.</summary>
    Feature,

    /// <summary>Callable with any valid key (read-only catalogue and key-introspection routes).</summary>
    Public,

    /// <summary>Never callable with a key: auth routes, the activity heartbeat, key management and approval.</summary>
    Forbidden,
}

/// <summary>
/// Endpoint metadata read by <see cref="ApiKeyScopeMiddleware"/>. One record type for all three kinds on purpose:
/// <c>EndpointMetadataCollection.GetMetadata</c> returns the <em>last</em> one, and group-level metadata is added
/// before endpoint-level, so an endpoint can override its group (e.g. <c>GET /auth/me</c> is public inside the
/// otherwise forbidden auth group). An endpoint with no marker is refused to keys — fail closed.
/// </summary>
/// <param name="Kind">Which of the three it is.</param>
/// <param name="Feature">For <see cref="ApiKeyEndpointKind.Feature"/>, the feature id from <see cref="ApiKeyFeature"/>.</param>
public sealed record ApiKeyEndpointMarker(ApiKeyEndpointKind Kind, string? Feature = null)
{
    public static readonly ApiKeyEndpointMarker Public = new(ApiKeyEndpointKind.Public);

    public static readonly ApiKeyEndpointMarker Forbidden = new(ApiKeyEndpointKind.Forbidden);
}

/// <summary>
/// Marks an endpoint whose handler really filters its result by a <c>worldId</c> query value (the admin settlement
/// and army lists). Only then does <see cref="ApiKeyScopeMiddleware"/> accept that query value as the request's world
/// for a world-limited key: on any other endpoint the handler ignores it, so <c>POST /admin/worlds?worldId=&lt;allowed&gt;</c>
/// would otherwise pass the world check while acting on no world at all.
/// </summary>
public sealed record ApiKeyWorldFromQueryMarker
{
    public static readonly ApiKeyWorldFromQueryMarker Instance = new();
}

/// <summary>Group- or endpoint-level wiring for <see cref="ApiKeyEndpointMarker"/>.</summary>
public static class ApiKeyEndpointExtensions
{
    /// <summary>Allows a key holding <paramref name="feature"/> (at the level the HTTP method needs) to call this.</summary>
    public static TBuilder WithApiKeyFeature<TBuilder>(this TBuilder builder, string feature)
        where TBuilder : IEndpointConventionBuilder
    {
        ArgumentNullException.ThrowIfNull(builder);
        if (!ApiKeyFeature.IsKnown(feature))
        {
            throw new ArgumentException($"'{feature}' is not a known API key feature.", nameof(feature));
        }

        return builder.WithMetadata(new ApiKeyEndpointMarker(ApiKeyEndpointKind.Feature, feature));
    }

    /// <summary>Allows any valid API key to call this (still rate-limited).</summary>
    public static TBuilder ApiKeyPublic<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder
    {
        ArgumentNullException.ThrowIfNull(builder);
        return builder.WithMetadata(ApiKeyEndpointMarker.Public);
    }

    /// <summary>Refuses every API key (403 "Not available to API keys.").</summary>
    public static TBuilder ApiKeyForbidden<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder
    {
        ArgumentNullException.ThrowIfNull(builder);
        return builder.WithMetadata(ApiKeyEndpointMarker.Forbidden);
    }

    /// <summary>
    /// Lets a world-limited key name its world through the <c>worldId</c> query value — only for a handler that
    /// filters by it, see <see cref="ApiKeyWorldFromQueryMarker"/>.
    /// </summary>
    public static TBuilder ApiKeyWorldFromQuery<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder
    {
        ArgumentNullException.ThrowIfNull(builder);
        return builder.WithMetadata(ApiKeyWorldFromQueryMarker.Instance);
    }
}
