using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Services;
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
}
