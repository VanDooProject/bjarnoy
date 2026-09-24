using Bjarnoy.Api.Auth;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The product owner's explicit ask, after the fog-gated-settlement-reads
/// and gate-remaining-read-endpoints audits both found real endpoints
/// answering any caller with no ownership check at all: a test that
/// enumerates <em>every</em> endpoint the API actually maps and fails unless
/// each one is accounted for, so a newly added endpoint can never silently
/// ship un-gated again.
/// </summary>
/// <remarks>
/// <para>
/// Every mapped <see cref="RouteEndpoint"/> with an HTTP method is
/// classified into exactly one of three buckets: (a) it requires ASP.NET
/// authorization (<see cref="IAuthorizeData"/> with no
/// <see cref="IAllowAnonymous"/> — including a group-level
/// <c>RequireAuthorization()</c>, which shows up here as ordinary endpoint
/// metadata, same as a per-endpoint call); (b) it carries an
/// <see cref="EndpointAccess"/> marker (added alongside its actual enforcing
/// filter by the <c>Require*</c> extension methods in
/// <c>EndpointAccessBuilderExtensions</c> — see that file's own remarks on
/// why a marker exists at all, since <see cref="IEndpointFilter"/> instances
/// are not themselves visible in endpoint metadata); or (c) it is listed in
/// <see cref="PublicEndpoints"/> below with a human-written reason for why
/// it is intentionally unrestricted. Anything in none of the three fails the
/// test, naming every offender — the message tells the developer to gate it
/// or add it to <see cref="PublicEndpoints"/> with a reason.
/// </para>
/// <para>
/// Two more failure modes keep the allowlist itself honest: a
/// <see cref="PublicEndpoints"/> key that no longer matches any mapped
/// endpoint (stale — the endpoint was removed, renamed or actually gated
/// since), and a key that matches an endpoint which is <em>also</em>
/// authorized/marked (redundant — the allowlist claims something the code
/// no longer needs it to claim). Reasons are asserted non-trivial
/// (<see cref="MinimumReasonLength"/>) so an allowlist entry can't be added
/// with a throwaway one-word "reason" that says nothing.
/// </para>
/// </remarks>
public sealed class EndpointAccessPolicyTests
{
    private const int MinimumReasonLength = 20;

    /// <summary>
    /// Every endpoint this suite has reviewed and confirmed is intentionally
    /// reachable by any caller, keyed <c>"METHOD /route/pattern"</c> exactly
    /// as <see cref="RouteEndpoint.RoutePattern"/>'s <c>RawText</c> renders
    /// it (including the trailing <c>/</c> a group's own <c>""</c>-suffixed
    /// route leaves behind, and the route's own constraints such as
    /// <c>:guid</c>). The three framework catch-all routes live in
    /// <see cref="FallbackEndpoints"/> instead, not here — see its own remarks.
    /// </summary>
    private static readonly Dictionary<string, string> PublicEndpoints = new()
    {
        // --- Auth: credential exchange has to be reachable before any session exists ---
        ["POST /api/v1/auth/login"] = "Credential exchange — must be callable before a session exists.",
        ["POST /api/v1/auth/register"] = "Account creation — must be callable before a session exists.",
        ["POST /api/v1/auth/refresh"] = "Exchanges a refresh token for a new access token — must be callable without a (possibly expired) access token.",
        ["POST /api/v1/auth/logout"] = "Revokes a caller-supplied refresh token; there is no session left to authorize against once it's revoked.",

        // --- Static catalogues: the same data for every player, every world ---
        ["GET /api/v1/buildings"] = "Public catalogue — building costs/durations (BuildingCatalogue.cs) are static game data, not per-player.",
        ["GET /api/v1/units"] = "Public catalogue — the unit roster (UnitCatalogue.cs) is static game data, not per-player.",

        // --- Public world/leaderboard/profile surfaces: aggregate or public-by-design ---
        ["GET /api/v1/worlds/"] = "Public world listing (WorldSummaryResponse) — name, joinability and seat counts only, no seed/radius/generation/movement and no per-player data. World creation itself is admin-only (POST /api/v1/admin/worlds).",
        ["GET /api/v1/worlds/joinable"] = "The public 'join another world' picker — deliberately narrower than ListWorlds still (JoinableWorldResponse), still no per-player data.",
        ["GET /api/v1/worlds/{worldId:guid}"] = "The game client's own world config (seed/radius/generation/movement), deliberately still public: bootstrapLiveWorld builds the local map straight from this seed, including anonymously — the landing page previews terrain before anyone has founded anything — and GET .../tiles already serves the same terrain to any caller anyway, so nothing is gated by hiding this too.",
        ["GET /api/v1/worlds/{worldId:guid}/islands"] = "Public island layout/start positions — generated from the world's own public seed, not per-player.",
        ["GET /api/v1/worlds/{worldId:guid}/tiles"] = "Public terrain — derived from the world's public seed on every call (WorldService), not per-player.",
        ["GET /api/v1/worlds/{worldId:guid}/leaderboards/"] = "Public leaderboard directory — which boards exist, not per-player data.",
        ["GET /api/v1/worlds/{worldId:guid}/leaderboards/{scope}/{category}"] = "A ranked, public leaderboard board — public by design, like any competitive leaderboard.",
        ["GET /api/v1/worlds/{worldId:guid}/stats/users/{userId:guid}/weekly"] = "Public per-user weekly stat cards (score gained) backing the public leaderboard — same visibility as the leaderboard itself, not private resource data.",
        ["GET /api/v1/profiles/{userId:guid}"] = "Public profile page — a player's profile is meant to be viewable by anyone, same as any username lookup.",
        ["GET /api/v1/profiles/by-name/{userName}"] = "Public profile page, looked up by name instead of id — same visibility as GetProfile.",

        // --- Guilds: read routes are deliberately public (GuildEndpoints'
        // own doc comment: "read routes are opened back up with
        // AllowAnonymous") — a guild's roster/board/treaties are a public
        // profile, same idea as a player's own profile page above. ---
        ["GET /api/v1/worlds/{worldId:guid}/guilds"] = "Public guild directory for a world — GuildEndpoints' own doc comment: read routes are deliberately AllowAnonymous.",
        ["GET /api/v1/guilds/{guildId:guid}"] = "Public guild profile (roster, perks tier) — same reasoning as the world guild directory above.",
        ["GET /api/v1/guilds/{guildId:guid}/perks"] = "Public — a guild's perk tier is part of its public profile, same as Get above.",
        ["GET /api/v1/guilds/{guildId:guid}/board/topics"] = "Public guild board listing — visible to anyone deciding whether to join, per GuildEndpoints' own AllowAnonymous design.",
        ["GET /api/v1/guilds/{guildId:guid}/board/topics/{topicId:guid}"] = "Public guild board topic detail — same reasoning as the topic listing above.",
        ["GET /api/v1/guilds/{guildId:guid}/treaties"] = "Public guild treaty listing — diplomatic state between guilds is public information, not a member secret.",

        // --- Onboarding: anonymous play is the model, not a gap ---
        ["POST /api/v1/worlds/{worldId:guid}/settlements"] = "Anonymous founding is the onboarding model — it binds the new realm to the caller's own X-Owner-Id.",

        // --- Infrastructure probes: MapHealthChecks (ServiceDefaults'
        // MapDefaultEndpoints), not an API resource. Keyed "ANY" like the
        // fallbacks below — MapHealthChecks carries no IHttpMethodMetadata
        // either, so it matches every verb. ---
        ["ANY /health"] = "ASP.NET Core health-check endpoint (MapDefaultEndpoints/MapHealthChecks) — a readiness probe at a fixed, conventional path outside the API's own versioning; carries no per-caller data, only aggregate pass/fail.",
        ["ANY /alive"] = "Liveness-probe counterpart to /health above (only checks tagged \"live\") — same reasoning.",
    };

    /// <summary>
    /// Endpoints that exist to catch whatever this router didn't otherwise
    /// map, rather than to serve one particular API resource — exempt from
    /// both <see cref="Every_mapped_endpoint_requires_authorization_or_carries_an_access_marker_or_is_explicitly_allowlisted"/>
    /// and <see cref="Every_mapped_route_starts_with_api_v1_except_the_named_fallbacks"/>,
    /// since neither "who may call this" nor "is this under /api/v1/" is a
    /// meaningful question for a catch-all. Keyed by the route pattern's own
    /// <c>RawText</c> alone (not <c>"METHOD route"</c> like <see cref="PublicEndpoints"/>
    /// above) because these three don't agree on whether they even carry an
    /// HTTP method at all — see <c>MapEndpointsAsync</c>'s own remark on why
    /// <c>/api/{**segment}</c> needed a different key shape to be seen by
    /// this suite at all.
    /// </summary>
    private static readonly Dictionary<string, string> FallbackEndpoints = new()
    {
        ["{**path:file}"] = "MapFallbackToFile's static-asset branch (GET/HEAD) — serves the built app shell for any real file path with no matching endpoint; not an API resource, so it carries no per-player data to gate.",
        ["{*path:nonfile}"] = "MapFallbackToFile's client-route branch (GET/HEAD) — serves the app shell for a client-side (HTML5 history mode) route the SPA router owns, same reasoning as the file branch above.",
        ["/api/{**segment}"] = "Program.cs's own JSON 404 (app.MapFallback, no HTTP method restriction — matches every verb) for an unmatched /api path, registered ahead of the SPA fallback so an API caller gets JSON rather than the HTML app shell. Answers 404 to everyone alike; there is nothing behind it to gate.",
    };

    /// <summary>
    /// Routes this suite has reviewed and confirmed are deliberately outside
    /// /api/v1/ without being "fallbacks" (<see cref="FallbackEndpoints"/>) —
    /// unlike those, these serve a real purpose of their own (a liveness/
    /// readiness probe), so they still need — and have — an ordinary
    /// <see cref="PublicEndpoints"/> entry for the access-gating rule; this
    /// set exists only to also exempt them from the /api/v1 prefix rule,
    /// since an infrastructure probe conventionally lives at a fixed root
    /// path, not behind the API's own versioning.
    /// </summary>
    private static readonly HashSet<string> UnprefixedInfrastructureRoutes = ["/health", "/alive"];

    /// <summary>
    /// Every endpoint the app actually maps, keyed the same way
    /// <see cref="PublicEndpoints"/> is: <c>"METHOD /route/pattern"</c> — except
    /// an endpoint with no <see cref="IHttpMethodMetadata"/> at all (a plain
    /// <c>app.MapFallback(...)</c>, which matches every HTTP verb), keyed
    /// <c>"ANY /route/pattern"</c> instead of being silently skipped. That
    /// used to be this method's behaviour — the loop below skipped any
    /// endpoint without method metadata on the assumption that meant "not a
    /// callable route" — but <c>app.MapFallback("/api/{**segment}", ...)</c>
    /// (Program.cs) is exactly such an endpoint and very much callable
    /// (every /api verb reaches it whenever nothing more specific matches),
    /// so it was invisible to every assertion below it: neither gated nor
    /// ungated, neither under /api/v1/ nor flagged for not being. See
    /// <see cref="FallbackEndpoints"/> for how it (and the two SPA fallbacks)
    /// are accounted for instead of just being let back in unexamined.
    /// </summary>
    private static async Task<Dictionary<string, RouteEndpoint>> MapEndpointsAsync()
    {
        await using var factory = BjarnoyApiFactory.Sqlite();
        using var client = factory.CreateClient();

        var mapped = new Dictionary<string, RouteEndpoint>();
        foreach (var dataSource in factory.Services.GetServices<EndpointDataSource>())
        {
            foreach (var endpoint in dataSource.Endpoints)
            {
                if (endpoint is not RouteEndpoint routeEndpoint)
                {
                    continue;
                }

                var methodMetadata = routeEndpoint.Metadata.GetMetadata<IHttpMethodMetadata>();
                if (methodMetadata is null)
                {
                    mapped[$"ANY {routeEndpoint.RoutePattern.RawText}"] = routeEndpoint;
                    continue;
                }

                foreach (var method in methodMetadata.HttpMethods)
                {
                    mapped[$"{method} {routeEndpoint.RoutePattern.RawText}"] = routeEndpoint;
                }
            }
        }

        return mapped;
    }

    /// <summary>Whether any of <paramref name="endpoint"/>'s <see cref="IAuthorizeData"/> requires the "Admin" policy, by name or by role.</summary>
    private static bool RequiresAdminPolicy(RouteEndpoint endpoint)
    {
        foreach (var authorizeData in endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>())
        {
            if (string.Equals(authorizeData.Policy, "Admin", StringComparison.Ordinal))
            {
                return true;
            }

            var roles = authorizeData.Roles?.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                ?? [];
            if (roles.Contains("Admin", StringComparer.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    [Fact]
    public async Task Every_mapped_endpoint_requires_authorization_or_carries_an_access_marker_or_is_explicitly_allowlisted()
    {
        var mapped = await MapEndpointsAsync();
        Assert.NotEmpty(mapped);

        var ungated = new List<string>();
        var redundantAllowlistEntries = new List<string>();

        foreach (var (key, endpoint) in mapped)
        {
            if (FallbackEndpoints.ContainsKey(endpoint.RoutePattern.RawText ?? string.Empty))
            {
                continue;
            }

            var requiresAuthorization = endpoint.Metadata.GetMetadata<IAuthorizeData>() is not null
                && endpoint.Metadata.GetMetadata<IAllowAnonymous>() is null;
            var hasAccessMarker = endpoint.Metadata.GetMetadata<EndpointAccess>() is not null;
            var isAllowlisted = PublicEndpoints.ContainsKey(key);

            if (isAllowlisted && (requiresAuthorization || hasAccessMarker))
            {
                redundantAllowlistEntries.Add(key);
                continue;
            }

            if (!requiresAuthorization && !hasAccessMarker && !isAllowlisted)
            {
                ungated.Add(key);
            }
        }

        var staleAllowlistEntries = PublicEndpoints.Keys.Where(key => !mapped.ContainsKey(key)).ToList();
        var trivialReasons = PublicEndpoints
            .Where(kv => kv.Value.Length < MinimumReasonLength)
            .Select(kv => kv.Key)
            .ToList();

        Assert.True(
            ungated.Count == 0,
            "The following endpoints have no authorization requirement, no EndpointAccess marker, "
                + "and are not in PublicEndpoints — gate them (e.g. RequireSettlementOwner/RequireArmyOwner/"
                + "RequireReportParty/RequireCallerRealm) or add a PublicEndpoints entry with a reason:\n"
                + string.Join('\n', ungated.OrderBy(x => x, StringComparer.Ordinal)));

        Assert.True(
            staleAllowlistEntries.Count == 0,
            "The following PublicEndpoints keys no longer match any mapped endpoint — remove them "
                + "(the endpoint was removed, renamed, or the route pattern changed):\n"
                + string.Join('\n', staleAllowlistEntries.OrderBy(x => x, StringComparer.Ordinal)));

        Assert.True(
            redundantAllowlistEntries.Count == 0,
            "The following endpoints are listed in PublicEndpoints but are ALSO gated (authorization or an "
                + "EndpointAccess marker) — remove the now-redundant allowlist entry so the list stays honest:\n"
                + string.Join('\n', redundantAllowlistEntries.OrderBy(x => x, StringComparer.Ordinal)));

        Assert.True(
            trivialReasons.Count == 0,
            $"The following PublicEndpoints reasons are shorter than {MinimumReasonLength} characters — "
                + "write a real reason, not a placeholder:\n"
                + string.Join('\n', trivialReasons.OrderBy(x => x, StringComparer.Ordinal)));
    }

    /// <summary>
    /// The product owner's follow-up ask: every admin surface must actually
    /// sit behind the "Admin" policy, not just behind *some* authorization
    /// (which the test above already requires but does not itself
    /// distinguish "Admin" from "any logged-in player"). Deliberately
    /// one-directional — an endpoint requiring "Admin" without living under
    /// /api/v1/admin/ (e.g. <c>GET /api/v1/info</c>, admin-only only in
    /// production builds — see InfoEndpoints.cs/DiagnosticsOptions) is not a
    /// naming-convention violation this suite polices.
    /// </summary>
    [Fact]
    public async Task Every_admin_route_requires_the_admin_policy()
    {
        var mapped = await MapEndpointsAsync();

        var offenders = mapped
            .Where(kv => (kv.Value.RoutePattern.RawText ?? string.Empty)
                .StartsWith("/api/v1/admin/", StringComparison.Ordinal))
            .Where(kv => !RequiresAdminPolicy(kv.Value))
            .Select(kv => kv.Key)
            .OrderBy(x => x, StringComparer.Ordinal)
            .ToList();

        Assert.True(
            offenders.Count == 0,
            "The following /api/v1/admin/ endpoints do not require the \"Admin\" authorization policy "
                + "(by IAuthorizeData.Policy == \"Admin\" or a Roles list containing Admin), at either "
                + "endpoint or group level — add .RequireAuthorization(\"Admin\") (see the other Admin* "
                + "endpoint groups):\n"
                + string.Join('\n', offenders));
    }

    /// <summary>
    /// The product owner's second follow-up: every real API route lives under
    /// the versioned /api/v1/ prefix, so a caller (and this suite's own
    /// PublicEndpoints keys) can rely on that shape without checking each
    /// endpoint group individually. <see cref="FallbackEndpoints"/> are the
    /// only routes this suite has reviewed and confirmed are deliberately
    /// unprefixed catch-alls, not an oversight.
    /// </summary>
    [Fact]
    public async Task Every_mapped_route_starts_with_api_v1_except_the_named_fallbacks()
    {
        var mapped = await MapEndpointsAsync();

        var offenders = mapped
            .Where(kv => !FallbackEndpoints.ContainsKey(kv.Value.RoutePattern.RawText ?? string.Empty))
            .Where(kv => !UnprefixedInfrastructureRoutes.Contains(kv.Value.RoutePattern.RawText ?? string.Empty))
            .Where(kv => !(kv.Value.RoutePattern.RawText ?? string.Empty).StartsWith("/api/v1/", StringComparison.Ordinal))
            .Select(kv => kv.Key)
            .OrderBy(x => x, StringComparer.Ordinal)
            .ToList();

        Assert.True(
            offenders.Count == 0,
            "The following endpoints are not under /api/v1/ and are not one of the named FallbackEndpoints/"
                + "UnprefixedInfrastructureRoutes exceptions — move them under /api/v1/ or add an exception "
                + "with a reason:\n"
                + string.Join('\n', offenders));
    }
}
