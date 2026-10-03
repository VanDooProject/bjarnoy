using Bjarnoy.Api.Auth.ApiKeys;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests.ApiKeys;

/// <summary>
/// Fail-closed audit for API keys, in the spirit of <see cref="EndpointAccessPolicyTests"/>: every endpoint under
/// <c>/api/v1</c> must say what a key may do there, so a new route is never reachable (or silently unreachable) by
/// keys by accident.
/// </summary>
public sealed class ApiKeyScopePolicyTests
{
    private static async Task<Dictionary<string, RouteEndpoint>> ApiEndpointsAsync()
    {
        await using var factory = BjarnoyApiFactory.Sqlite();
        using var client = factory.CreateClient();

        var mapped = new Dictionary<string, RouteEndpoint>();
        foreach (var dataSource in factory.Services.GetServices<EndpointDataSource>())
        {
            foreach (var endpoint in dataSource.Endpoints.OfType<RouteEndpoint>())
            {
                var pattern = endpoint.RoutePattern.RawText ?? string.Empty;
                if (!pattern.StartsWith("/api/v1/", StringComparison.Ordinal))
                {
                    continue;
                }

                foreach (var method in endpoint.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods ?? ["ANY"])
                {
                    mapped[$"{method} {pattern}"] = endpoint;
                }
            }
        }

        return mapped;
    }

    [Fact]
    public async Task Every_api_v1_endpoint_carries_an_api_key_marker()
    {
        var mapped = await ApiEndpointsAsync();
        Assert.NotEmpty(mapped);

        var unmarked = mapped
            .Where(kv => kv.Value.Metadata.GetMetadata<ApiKeyEndpointMarker>() is null)
            .Select(kv => kv.Key)
            .OrderBy(k => k, StringComparer.Ordinal)
            .ToList();

        Assert.True(
            unmarked.Count == 0,
            "These /api/v1 endpoints have no API key marker, so keys are refused (403) there. Mark the endpoint group with "
                + ".WithApiKeyFeature(ApiKeyFeature.X), .ApiKeyPublic() or .ApiKeyForbidden():\n"
                + string.Join('\n', unmarked));
    }

    [Fact]
    public async Task Feature_markers_name_known_features_and_admin_routes_use_only_admin_features()
    {
        var mapped = await ApiEndpointsAsync();

        var problems = new List<string>();
        foreach (var (key, endpoint) in mapped)
        {
            var marker = endpoint.Metadata.GetMetadata<ApiKeyEndpointMarker>();
            if (marker is null)
            {
                continue; // reported by the test above
            }

            var isAdminRoute = (endpoint.RoutePattern.RawText ?? string.Empty)
                .StartsWith("/api/v1/admin/", StringComparison.Ordinal);

            switch (marker.Kind)
            {
                case ApiKeyEndpointKind.Feature:
                    var feature = marker.Feature is null ? null : ApiKeyFeature.Find(marker.Feature);
                    if (feature is null)
                    {
                        problems.Add($"{key}: unknown feature '{marker.Feature}'");
                    }
                    else if (isAdminRoute != feature.Admin)
                    {
                        problems.Add($"{key}: feature '{feature.Id}' is {(feature.Admin ? "an admin" : "a player")} feature but the route is {(isAdminRoute ? "an admin" : "a player")} route");
                    }

                    break;
                case ApiKeyEndpointKind.Public when isAdminRoute:
                    problems.Add($"{key}: an admin route must not be public to keys");
                    break;
            }
        }

        Assert.True(problems.Count == 0, string.Join('\n', problems.OrderBy(p => p, StringComparer.Ordinal)));
    }

    [Fact]
    public async Task Key_management_auth_and_heartbeat_are_forbidden_and_a_few_catalogue_routes_are_public()
    {
        var mapped = await ApiEndpointsAsync();

        ApiKeyEndpointKind KindOf(string key) => mapped[key].Metadata.GetMetadata<ApiKeyEndpointMarker>()!.Kind;

        string[] forbidden =
        [
            "POST /api/v1/auth/login",
            "POST /api/v1/auth/register",
            "POST /api/v1/auth/refresh",
            "POST /api/v1/auth/logout",
            "POST /api/v1/activity/heartbeat",
            "GET /api/v1/admin/api-keys/",
            "POST /api/v1/admin/api-keys/",
            "PUT /api/v1/admin/api-keys/{keyId:guid}",
            "POST /api/v1/admin/api-keys/{keyId:guid}/recreate",
            "POST /api/v1/admin/api-keys/{keyId:guid}/revoke",
            "GET /api/v1/admin/api-key-requests/",
            "POST /api/v1/admin/api-key-requests/{requestId:guid}/approve",
            "POST /api/v1/admin/api-key-requests/{requestId:guid}/deny",
            "POST /api/v1/api-key-requests/",
            "POST /api/v1/api-key-requests/{requestId:guid}/token",
        ];
        foreach (var key in forbidden)
        {
            Assert.Equal(ApiKeyEndpointKind.Forbidden, KindOf(key));
        }

        // Endpoint-level markers override their group's.
        string[] publicRoutes =
        [
            "GET /api/v1/info",
            "GET /api/v1/buildings",
            "GET /api/v1/units",
            "GET /api/v1/auth/me",
            "GET /api/v1/api-keys/features",
            "GET /api/v1/api-keys/self",
            "POST /api/v1/api-key-requests/renewal",
        ];
        foreach (var key in publicRoutes)
        {
            Assert.Equal(ApiKeyEndpointKind.Public, KindOf(key));
        }
    }
}
