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
    /// <c>:guid</c>). A <c>TODO(review)</c>-prefixed reason marks one this
    /// audit could not confidently resolve itself — see this PR's own report
    /// for the list of those and why.
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
        ["GET /api/v1/worlds/"] = "Public world listing — aggregate metadata (name, player/island counts), no per-player data.",
        ["GET /api/v1/worlds/joinable"] = "The public 'join another world' picker — deliberately narrower than ListWorlds (JoinableWorldResponse), still no per-player data.",
        ["GET /api/v1/worlds/{worldId:guid}"] = "Public world metadata read — same aggregate shape as ListWorlds, no per-player data.",
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

        // --- Framework/non-API surface ---
        ["GET {**path:file}"] = "SPA/static-asset fallback (MapFallbackToFile) — serves the app shell and static files, not an API endpoint carrying per-player data.",
        ["GET {*path:nonfile}"] = "SPA fallback for client-side routes (MapFallbackToFile) — same reasoning as the file fallback above.",
        ["HEAD {**path:file}"] = "HEAD counterpart of the static-asset SPA fallback above.",
        ["HEAD {*path:nonfile}"] = "HEAD counterpart of the client-route SPA fallback above.",

        // --- TODO(review): found while auditing, not obviously safe to either
        // gate or leave open without a product decision — see this PR's own
        // report for what each one leaks/risks. ---
        ["POST /api/v1/worlds/"] = "TODO(review): anonymous player-facing world creation, with no auth at all — duplicates the admin-gated POST /admin/worlds, whose access model presumably ought to apply here too; left open because closing it would break the many tests that rely on it to set up a world anonymously, which needs a product decision, not a unilateral change.",
        ["POST /api/v1/simulator"] = "TODO(review): gated by PremiumUserEndpointFilter (401 unauthenticated / 403 premium_required), a real access check but not an ownership one, so it fits none of the three EndpointAccessKind buckets as they stand today.",
        ["POST /api/v1/trade-offers/{offerId:guid}/accept"] = "TODO(review): escrows the accepting settlement's goods with no ownership check at all — AcceptTradeOfferRequest.AcceptorSettlementId is caller-supplied and unverified. The route's own first argument is the offer id, not a settlement id, so this needs a bespoke filter (read the settlement id from the body), not a drop-in SettlementOwnershipEndpointFilter.",
        ["POST /api/v1/trade-offers/{offerId:guid}/cancel"] = "TODO(review): same shape of gap as /accept above — CancelTradeOfferRequest.SettlementId is caller-supplied and unverified.",
    };

    [Fact]
    public async Task Every_mapped_endpoint_requires_authorization_or_carries_an_access_marker_or_is_explicitly_allowlisted()
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
                    // No HTTP method — not a callable route (e.g. a
                    // route-pattern-only registration with nothing mapped to it).
                    continue;
                }

                foreach (var method in methodMetadata.HttpMethods)
                {
                    mapped[$"{method} {routeEndpoint.RoutePattern.RawText}"] = routeEndpoint;
                }
            }
        }

        Assert.NotEmpty(mapped);

        var ungated = new List<string>();
        var redundantAllowlistEntries = new List<string>();

        foreach (var (key, endpoint) in mapped)
        {
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
}
