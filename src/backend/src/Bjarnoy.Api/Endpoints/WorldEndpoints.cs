using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Services;
using Bjarnoy.Infrastructure.Services.PlotReservations;
using Bjarnoy.Infrastructure.World;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Endpoints;

public static class WorldEndpoints
{
    public static IEndpointRouteBuilder MapWorldEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var worlds = app.MapGroup("/api/v1/worlds")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Worlds");

        worlds.MapGet("/", ListWorlds)
            .WithName("ListWorlds")
            .WithSummary("Lists every world on this server.");

        // Registered ahead of "/{worldId:guid}" for readability, though the
        // ":guid" constraint on that route already keeps "joinable" from
        // ever matching it.
        worlds.MapGet("/joinable", ListJoinableWorlds)
            .WithName("ListJoinableWorlds")
            .WithSummary("Lists every world with the player-facing fields needed to pick one to join.");

        worlds.MapPost("/", CreateWorld)
            .WithName("CreateWorld")
            .WithSummary("Generates and stores a new world.");

        worlds.MapGet("/{worldId:guid}", GetWorld)
            .WithName("GetWorld")
            .WithSummary("Fetches a single world.");

        worlds.MapGet("/{worldId:guid}/membership", GetMembership)
            .WithName("GetWorldMembership")
            .WithSummary("Whether the requesting owner already has a settlement in this world.");

        worlds.MapGet("/{worldId:guid}/islands", GetIslands)
            .WithName("GetWorldIslands")
            .WithSummary("Lists the islands of a world, with their start positions.");

        worlds.MapGet("/{worldId:guid}/tiles", GetTiles)
            .WithName("GetWorldTiles")
            .WithSummary("Returns the terrain of an axial rectangle of hexes.");

        worlds.MapGet("/{worldId:guid}/fog-mask", GetFogMask)
            .WithName("GetWorldFogMask")
            .WithSummary("The requesting player's fog-of-war mask, as an RGBA8 PNG (map-fog-v2.md §2.2).");

        worlds.MapGet("/{worldId:guid}/plot-suggestion", GetPlotSuggestion)
            .WithName("GetPlotSuggestion")
            .WithSummary("The plot this visitor is offered to found on, pinned across reloads.");

        worlds.MapDelete("/{worldId:guid}/plot-suggestion", ReleasePlotSuggestion)
            .WithName("ReleasePlotSuggestion")
            .WithSummary("Releases this visitor's held plot suggestion (e.g. \"pick a different island\").");

        return app;
    }

    private static async Task<Ok<IReadOnlyList<WorldResponse>>> ListWorlds(
        WorldService worlds,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var entities = await worlds.GetWorldsAsync(cancellationToken);
        var islandCounts = await worlds.GetIslandCountsAsync(cancellationToken);
        var playerCounts = await worlds.GetPlayerCountsAsync(cancellationToken);
        var now = timeProvider.GetUtcNow();

        IReadOnlyList<WorldResponse> response =
        [
            .. entities.Select(w => WorldResponse.From(
                w, islandCounts.GetValueOrDefault(w.Id), playerCounts.GetValueOrDefault(w.Id), now)),
        ];

        return TypedResults.Ok(response);
    }

    /// <summary>
    /// The player-facing listing for the "join another world" flow: anonymous
    /// (a player browsing worlds to join has no settlement, and so no owner
    /// id, yet), and deliberately narrower than <see cref="ListWorlds"/> —
    /// see <see cref="JoinableWorldResponse"/>.
    /// </summary>
    private static async Task<Ok<IReadOnlyList<JoinableWorldResponse>>> ListJoinableWorlds(
        WorldService worlds,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var entities = await worlds.GetWorldsAsync(cancellationToken);
        var playerCounts = await worlds.GetPlayerCountsAsync(cancellationToken);
        var now = timeProvider.GetUtcNow();

        IReadOnlyList<JoinableWorldResponse> response =
        [
            .. entities.Select(w => JoinableWorldResponse.From(w, playerCounts.GetValueOrDefault(w.Id), now)),
        ];

        return TypedResults.Ok(response);
    }

    private static async Task<Results<Created<WorldResponse>, ValidationProblem, Conflict<ProblemDetails>>>
        CreateWorld(
            CreateWorldRequest request,
            WorldService worlds,
            TimeProvider timeProvider,
            CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var options = WorldGenerationOptions.ForSeed(request.Seed ?? Random.Shared.Next()) with
        {
            Radius = request.Radius,
        };

        try
        {
            options.Validate();
        }
        catch (ArgumentException ex)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [ex.ParamName ?? nameof(request)] = [ex.Message],
            });
        }

        try
        {
            var world = await worlds.CreateWorldAsync(
                request.Name, options, request.MaxPlayers, autoSeed: request.Seed is null, cancellationToken);

            return TypedResults.Created(
                $"/api/v1/worlds/{world.Id}",
                WorldResponse.From(world, world.Islands.Count, playerCount: 0, timeProvider.GetUtcNow()));
        }
        catch (WorldCreationException ex)
        {
            return TypedResults.Conflict(new ProblemDetails
            {
                Title = "The world could not be created.",
                Detail = ex.Message,
                Status = StatusCodes.Status409Conflict,
            });
        }
    }

    private static async Task<Results<Ok<WorldResponse>, NotFound<ProblemDetails>>> GetWorld(
        Guid worldId,
        WorldService worlds,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var world = await worlds.GetWorldAsync(worldId, cancellationToken);
        if (world is null)
        {
            return TypedResults.NotFound(WorldNotFoundProblem());
        }

        var islandCount = await worlds.GetIslandCountAsync(worldId, cancellationToken);
        var playerCount = await worlds.GetPlayerCountAsync(worldId, cancellationToken);
        return TypedResults.Ok(WorldResponse.From(world, islandCount, playerCount, timeProvider.GetUtcNow()));
    }

    /// <summary>
    /// Purely a read: the "join another world" flow's per-world check before
    /// offering a plot, so it must never take a plot reservation or otherwise
    /// touch <see cref="PlotReservationService"/> the way
    /// <see cref="GetPlotSuggestion"/> does. Resolves which realm to answer
    /// for via <see cref="CallerRealmResolver"/> — a claimed player's JWT
    /// finds their realm even from a browser that never founded anything, and
    /// a <see cref="CallerRealmOutcome.Refused"/> header (someone else's
    /// already-claimed realm) is reported the same as no membership at all:
    /// this is a membership check, not an ownership proof, so it has nothing
    /// to refuse with a 403 over.
    /// </summary>
    private static async Task<Results<Ok<WorldMembershipResponse>, NotFound<ProblemDetails>, BadRequest<ProblemDetails>>>
        GetMembership(
            Guid worldId,
            HttpContext httpContext,
            WorldService worlds,
            SettlementService settlements,
            RealmDirectory realms,
            CancellationToken cancellationToken)
    {
        if (await worlds.GetWorldAsync(worldId, cancellationToken) is null)
        {
            return TypedResults.NotFound(WorldNotFoundProblem());
        }

        var realm = await CallerRealmResolver.ResolveAsync(httpContext, worldId, realms, cancellationToken);
        if (realm.Outcome == CallerRealmOutcome.MissingHeader)
        {
            return TypedResults.BadRequest(MissingOwnerIdProblem());
        }

        if (realm.Outcome == CallerRealmOutcome.Refused)
        {
            return TypedResults.Ok(new WorldMembershipResponse(worldId, null, null));
        }

        var settlement = await settlements.FindByOwnerAsync(worldId, realm.OwnerId!, cancellationToken);

        return TypedResults.Ok(new WorldMembershipResponse(
            worldId, settlement?.Id.ToString(), settlement?.Name));
    }

    private static async Task<Results<Ok<IReadOnlyList<IslandResponse>>, NotFound<ProblemDetails>>> GetIslands(
        Guid worldId,
        WorldService worlds,
        CancellationToken cancellationToken)
    {
        if (await worlds.GetWorldAsync(worldId, cancellationToken) is null)
        {
            return TypedResults.NotFound(WorldNotFoundProblem());
        }

        var islands = await worlds.GetIslandsAsync(worldId, cancellationToken);
        IReadOnlyList<IslandResponse> response = [.. islands.Select(IslandResponse.From)];

        return TypedResults.Ok(response);
    }

    /// <summary>
    /// Terrain for a window of the map. Derived from the world's seed on each
    /// call rather than read from a tile table — see <see cref="WorldService"/>.
    /// </summary>
    private static async Task<Results<Ok<TileChunkResponse>, NotFound<ProblemDetails>, ValidationProblem>> GetTiles(
        Guid worldId,
        int qMin,
        int qMax,
        int rMin,
        int rMax,
        WorldService worlds,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();

        if (qMax < qMin)
        {
            errors[nameof(qMax)] = [$"{nameof(qMax)} must be greater than or equal to {nameof(qMin)}."];
        }

        if (rMax < rMin)
        {
            errors[nameof(rMax)] = [$"{nameof(rMax)} must be greater than or equal to {nameof(rMin)}."];
        }

        if (errors.Count == 0)
        {
            var requested = (long)(qMax - qMin + 1) * (rMax - rMin + 1);
            if (requested > WorldService.MaxTilesPerRequest)
            {
                errors["range"] =
                [
                    $"Requested {requested} tiles; at most {WorldService.MaxTilesPerRequest} " +
                    "may be fetched in one call.",
                ];
            }
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var world = await worlds.GetWorldAsync(worldId, cancellationToken);
        if (world is null)
        {
            return TypedResults.NotFound(WorldNotFoundProblem());
        }

        IReadOnlyList<TileResponse> tiles =
        [
            .. WorldService.GetTiles(world, qMin, qMax, rMin, rMax).Select(TileResponse.From),
        ];

        return TypedResults.Ok(new TileChunkResponse(worldId, qMin, qMax, rMin, rMax, tiles));
    }

    /// <summary>
    /// Scoped player-side via <see cref="CallerRealmResolver"/> — anonymous
    /// play resolves purely off <see cref="OwnershipGate.OwnerIdHeaderName"/>
    /// as before, but a claimed player's JWT now resolves to their realm's
    /// own founding owner id even from a browser that never founded anything
    /// (a new-browser login), and a header naming someone else's already-claimed
    /// realm is refused with 403 rather than handed that realm's fog history.
    /// Per <c>map-fog-v2.md</c> §1f, this endpoint must stay player-scoped
    /// even though <c>/tiles</c> above is deliberately open. The resolved
    /// owner id is passed straight through to <see cref="FogMaskService"/>
    /// unchanged — its explored-tile history is keyed by <c>OwnerId</c>,
    /// which is exactly why the resolver hands back the realm's original one
    /// rather than anything from this request.
    /// </summary>
    private static async Task<IResult> GetFogMask(
        Guid worldId,
        HttpContext httpContext,
        FogMaskService fogMask,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        var realm = await CallerRealmResolver.ResolveAsync(httpContext, worldId, realms, cancellationToken);
        if (realm.Outcome == CallerRealmOutcome.MissingHeader)
        {
            return TypedResults.BadRequest(MissingOwnerIdProblem());
        }

        if (realm.Outcome == CallerRealmOutcome.Refused)
        {
            return NotOwnerRefusal();
        }

        var result = await fogMask.GeneratePlayerMaskAsync(worldId, realm.OwnerId!, cancellationToken);
        if (!result.Accepted)
        {
            // FogMaskRejection's only value besides None: the world itself
            // doesn't exist (map-fog-v2.md's slice never rejects for an
            // owner having no settlements — that renders an all-fog mask).
            return TypedResults.NotFound(WorldNotFoundProblem());
        }

        var eTag = $"\"{result.ETag}\"";
        if (httpContext.Request.Headers.IfNoneMatch == eTag)
        {
            return TypedResults.StatusCode(StatusCodes.Status304NotModified);
        }

        httpContext.Response.Headers.ETag = eTag;
        return TypedResults.File(result.Png!, "image/png");
    }

    /// <summary>
    /// Backend-owned counterpart to the landing page's old client-side plot
    /// finder — see <see cref="PlotReservationService"/>. Same
    /// <see cref="CallerRealmResolver"/>-based scoping as <see cref="GetFogMask"/>
    /// (a claimed player's JWT resolves to their realm even from a fresh
    /// browser, and someone else's already-claimed realm under the header is
    /// refused with 403) — never echoes any owner id, IP, or another
    /// visitor's reservation back to the caller.
    /// </summary>
    private static async Task<IResult> GetPlotSuggestion(
        Guid worldId,
        HttpContext httpContext,
        PlotReservationService reservations,
        SettlementService settlements,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        var realm = await CallerRealmResolver.ResolveAsync(httpContext, worldId, realms, cancellationToken);
        if (realm.Outcome == CallerRealmOutcome.MissingHeader)
        {
            return TypedResults.BadRequest(MissingOwnerIdProblem());
        }

        if (realm.Outcome == CallerRealmOutcome.Refused)
        {
            return NotOwnerRefusal();
        }

        var ipKey = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var fingerprintKey = ClientFingerprint.Derive(httpContext.Request.Headers);

        var result = await reservations.GetOrRefreshAsync(
            worldId, realm.OwnerId!, ipKey, fingerprintKey, cancellationToken);

        switch (result.Rejection)
        {
            case PlotSuggestionRejection.WorldNotFound:
                return TypedResults.NotFound(new ProblemDetails
                {
                    Title = "World not found.",
                    Status = StatusCodes.Status404NotFound,
                });
            case PlotSuggestionRejection.AlreadyFounded:
            {
                var problem = new ProblemDetails
                {
                    Title = "Already founded.",
                    Detail = "This visitor already has a settlement in this world.",
                    Status = StatusCodes.Status409Conflict,
                };
                problem.Extensions["rejection"] = result.Rejection.ToString();
                problem.Extensions["existingSettlementId"] = result.ExistingSettlementId;
                return TypedResults.Conflict(problem);
            }

            case PlotSuggestionRejection.NoPlotAvailable:
            {
                var problem = new ProblemDetails
                {
                    Title = "No plot available.",
                    Detail = "Every founding plot in this world is currently taken or held.",
                    Status = StatusCodes.Status409Conflict,
                };
                problem.Extensions["rejection"] = result.Rejection.ToString();
                return TypedResults.Conflict(problem);
            }
        }

        // Always fresh — re-validated against live state on every call, so a
        // cached response would just be wrong the moment anything changes.
        httpContext.Response.Headers.CacheControl = "no-store";

        var suggestion = result.Suggestion!;

        var islandSettlementEntities = await settlements.GetForIslandAsync(suggestion.IslandId, cancellationToken);
        IReadOnlyList<SettlementSummary> islandSettlements =
        [
            .. islandSettlementEntities.Select(s => new SettlementSummary(
                s.Id, s.Name, s.OwnerName, s.CentreQ, s.CentreR,
                s.Buildings.FirstOrDefault(b => b.Type == BuildingType.Longhouse)?.Level ?? 0,
                s.IslandId)),
        ];

        return TypedResults.Ok(new PlotSuggestionResponse(
            suggestion.IslandId,
            new TileCoordinate(suggestion.Plot.Q, suggestion.Plot.R),
            [.. suggestion.Alternatives.Select(a => new TileCoordinate(a.Q, a.R))],
            suggestion.Reserved,
            suggestion.ReservedUntil,
            islandSettlements));
    }

    private static async Task<IResult> ReleasePlotSuggestion(
        Guid worldId,
        HttpContext httpContext,
        PlotReservationService reservations,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        var realm = await CallerRealmResolver.ResolveAsync(httpContext, worldId, realms, cancellationToken);
        if (realm.Outcome == CallerRealmOutcome.MissingHeader)
        {
            return TypedResults.BadRequest(MissingOwnerIdProblem());
        }

        if (realm.Outcome == CallerRealmOutcome.Refused)
        {
            return NotOwnerRefusal();
        }

        reservations.Release(worldId, realm.OwnerId!);
        return TypedResults.NoContent();
    }

    /// <summary>
    /// The 400 every read endpoint above answers with when
    /// <see cref="CallerRealmResolver.ResolveAsync"/> finds neither a JWT
    /// realm nor a usable <see cref="OwnershipGate.OwnerIdHeaderName"/> header
    /// to fall back to.
    /// </summary>
    private static ProblemDetails MissingOwnerIdProblem() => new()
    {
        Title = "Missing owner id.",
        Detail = $"The '{OwnershipGate.OwnerIdHeaderName}' header is required.",
        Status = StatusCodes.Status400BadRequest,
    };

    /// <summary>
    /// The 403 the fog-mask and plot-suggestion endpoints answer with on
    /// <see cref="CallerRealmOutcome.Refused"/> — the same body
    /// <see cref="OwnershipGate"/> uses for a mutation from the wrong caller,
    /// since this is the same rule applied to a read.
    /// </summary>
    private static IResult NotOwnerRefusal() =>
        Results.Json(new AuthErrorResponse("not_owner"), statusCode: StatusCodes.Status403Forbidden);

    /// <summary>
    /// Every 404 in this file that means "no world with that id exists" —
    /// as opposed to some other rejection that happens to share the status
    /// code — carries this same machine-readable body. A world a client
    /// once joined can stop existing (an admin reseed, or a database the
    /// client's stored id no longer resolves against at all), and unlike a
    /// bare 404 this lets it tell that apart from a transient failure and
    /// drop the stale id instead of retrying it forever — see
    /// `stores/world.ts`'s `recoverFromMissingWorld`.
    /// </summary>
    private static ProblemDetails WorldNotFoundProblem()
    {
        var problem = new ProblemDetails
        {
            Title = "No such world.",
            Detail = "This world does not exist, or no longer does.",
            Status = StatusCodes.Status404NotFound,
        };
        problem.Extensions["error"] = "world_not_found";
        return problem;
    }
}
