using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Contracts;
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

        worlds.MapPost("/", CreateWorld)
            .WithName("CreateWorld")
            .WithSummary("Generates and stores a new world.");

        worlds.MapGet("/{worldId:guid}", GetWorld)
            .WithName("GetWorld")
            .WithSummary("Fetches a single world.");

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
                request.Name, options, request.MaxPlayers, cancellationToken);

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

    private static async Task<Results<Ok<WorldResponse>, NotFound>> GetWorld(
        Guid worldId,
        WorldService worlds,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var world = await worlds.GetWorldAsync(worldId, cancellationToken);
        if (world is null)
        {
            return TypedResults.NotFound();
        }

        var islandCount = await worlds.GetIslandCountAsync(worldId, cancellationToken);
        var playerCount = await worlds.GetPlayerCountAsync(worldId, cancellationToken);
        return TypedResults.Ok(WorldResponse.From(world, islandCount, playerCount, timeProvider.GetUtcNow()));
    }

    private static async Task<Results<Ok<IReadOnlyList<IslandResponse>>, NotFound>> GetIslands(
        Guid worldId,
        WorldService worlds,
        CancellationToken cancellationToken)
    {
        if (await worlds.GetWorldAsync(worldId, cancellationToken) is null)
        {
            return TypedResults.NotFound();
        }

        var islands = await worlds.GetIslandsAsync(worldId, cancellationToken);
        IReadOnlyList<IslandResponse> response = [.. islands.Select(IslandResponse.From)];

        return TypedResults.Ok(response);
    }

    /// <summary>
    /// Terrain for a window of the map. Derived from the world's seed on each
    /// call rather than read from a tile table — see <see cref="WorldService"/>.
    /// </summary>
    private static async Task<Results<Ok<TileChunkResponse>, NotFound, ValidationProblem>> GetTiles(
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
            return TypedResults.NotFound();
        }

        IReadOnlyList<TileResponse> tiles =
        [
            .. WorldService.GetTiles(world, qMin, qMax, rMin, rMax).Select(TileResponse.From),
        ];

        return TypedResults.Ok(new TileChunkResponse(worldId, qMin, qMax, rMin, rMax, tiles));
    }

    /// <summary>
    /// Reads <see cref="OwnershipGate.OwnerIdHeaderName"/> the same way the
    /// settlement-mutating endpoints do (see
    /// <see cref="Bjarnoy.Api.Auth.OwnershipEndpointFilters"/>) — anonymous
    /// play has no JWT to prove identity with, so the caller's own
    /// client-local id is what selects which settlements this mask is
    /// built from. Per <c>map-fog-v2.md</c> §1f, this endpoint must stay
    /// player-scoped even though <c>/tiles</c> above is deliberately open —
    /// the header is what does that scoping today, at the same trust level
    /// every other anonymous-play endpoint already relies on.
    /// </summary>
    private static async Task<Results<FileContentHttpResult, StatusCodeHttpResult, NotFound, BadRequest<ProblemDetails>>> GetFogMask(
        Guid worldId,
        HttpContext httpContext,
        FogMaskService fogMask,
        CancellationToken cancellationToken)
    {
        var ownerId = httpContext.Request.Headers[OwnershipGate.OwnerIdHeaderName].ToString();
        if (string.IsNullOrEmpty(ownerId))
        {
            return TypedResults.BadRequest(new ProblemDetails
            {
                Title = "Missing owner id.",
                Detail = $"The '{OwnershipGate.OwnerIdHeaderName}' header is required.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        var result = await fogMask.GeneratePlayerMaskAsync(worldId, ownerId, cancellationToken);
        if (!result.Accepted)
        {
            return TypedResults.NotFound();
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
    /// finder — see <see cref="PlotReservationService"/>. Same anonymous-play
    /// ownership header as <see cref="GetFogMask"/>; never echoes any owner
    /// id, IP, or another visitor's reservation back to the caller.
    /// </summary>
    private static async Task<Results<Ok<PlotSuggestionResponse>, NotFound<ProblemDetails>,
        Conflict<ProblemDetails>, BadRequest<ProblemDetails>>> GetPlotSuggestion(
        Guid worldId,
        HttpContext httpContext,
        PlotReservationService reservations,
        CancellationToken cancellationToken)
    {
        var ownerIdOrProblem = RequireOwnerId(httpContext);
        if (ownerIdOrProblem.Problem is not null)
        {
            return TypedResults.BadRequest(ownerIdOrProblem.Problem);
        }

        var ipKey = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var fingerprintKey = ClientFingerprint.Derive(httpContext.Request.Headers);

        var result = await reservations.GetOrRefreshAsync(
            worldId, ownerIdOrProblem.OwnerId!, ipKey, fingerprintKey, cancellationToken);

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
        return TypedResults.Ok(new PlotSuggestionResponse(
            suggestion.IslandId,
            new TileCoordinate(suggestion.Plot.Q, suggestion.Plot.R),
            [.. suggestion.Alternatives.Select(a => new TileCoordinate(a.Q, a.R))],
            suggestion.Reserved,
            suggestion.ReservedUntil));
    }

    private static Results<NoContent, BadRequest<ProblemDetails>> ReleasePlotSuggestion(
        Guid worldId,
        HttpContext httpContext,
        PlotReservationService reservations)
    {
        var ownerIdOrProblem = RequireOwnerId(httpContext);
        if (ownerIdOrProblem.Problem is not null)
        {
            return TypedResults.BadRequest(ownerIdOrProblem.Problem);
        }

        reservations.Release(worldId, ownerIdOrProblem.OwnerId!);
        return TypedResults.NoContent();
    }

    private static (string? OwnerId, ProblemDetails? Problem) RequireOwnerId(HttpContext httpContext)
    {
        var ownerId = httpContext.Request.Headers[OwnershipGate.OwnerIdHeaderName].ToString();
        if (string.IsNullOrEmpty(ownerId))
        {
            return (null, new ProblemDetails
            {
                Title = "Missing owner id.",
                Detail = $"The '{OwnershipGate.OwnerIdHeaderName}' header is required.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        return (ownerId, null);
    }
}
