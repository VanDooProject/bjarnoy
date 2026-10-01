using System.Security.Claims;
using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;
using Bjarnoy.Domain.World.Review;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Admin-only world management (issue #27): speed factor, start date,
/// stop-join, endboss scheduling, and the pause/maintenance/lock/resume state
/// machine <see cref="GameClock"/> already implements.
/// </summary>
public static class AdminWorldEndpoints
{
    public static IEndpointRouteBuilder MapAdminWorldEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var worlds = app.MapGroup("/api/v1/admin/worlds")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Admin", "Worlds")
            .RequireAuthorization("Admin");

        worlds.MapGet("/", ListWorlds)
            .WithName("AdminListWorlds")
            .WithSummary("Lists every world with its admin-only fields.");

        worlds.MapPost("/", CreateWorld)
            .WithName("AdminCreateWorld")
            .WithSummary("Generates and stores a new world, returning it with its admin-only fields.");

        worlds.MapPatch("/{worldId:guid}/settings", UpdateSettings)
            .WithName("AdminUpdateWorldSettings")
            .WithSummary("Updates a world's speed factor, start date, stop-join toggle, and endboss instant.");

        worlds.MapPost("/{worldId:guid}/run-state", SetRunState)
            .WithName("AdminSetWorldRunState")
            .WithSummary("Pauses, enters maintenance on, locks, or resumes a world.");

        worlds.MapPost("/{worldId:guid}/preview-seed", PreviewSeed)
            .WithName("AdminPreviewWorldSeed")
            .WithSummary("Generates a candidate map in memory and returns its islands and its world review. Persists nothing.");

        worlds.MapPost("/{worldId:guid}/review-seeds", ReviewSeeds)
            .WithName("AdminReviewWorldSeeds")
            .WithSummary("Generates and reviews a range of candidate seeds in memory, returning their review summaries best first. Persists nothing.");

        worlds.MapPost("/{worldId:guid}/reseed", Reseed)
            .WithName("AdminReseedWorld")
            .WithSummary("Regenerates a world's map from a new seed, destroying every settlement in it.");

        return app;
    }

    private static async Task<Ok<IReadOnlyList<AdminWorldResponse>>> ListWorlds(
        WorldService worlds,
        CancellationToken cancellationToken)
    {
        var entities = await worlds.GetWorldsAsync(cancellationToken);
        var playerCounts = await worlds.GetPlayerCountsAsync(cancellationToken);
        var spawnCapacity = await worlds.GetSpawnCapacityAsync(cancellationToken: cancellationToken);

        IReadOnlyList<AdminWorldResponse> response =
        [
            .. entities.Select(w => AdminWorldResponse.From(w, playerCounts.GetValueOrDefault(w.Id), spawnCapacity.GetValueOrDefault(w.Id))),
        ];

        return TypedResults.Ok(response);
    }

    /// <summary>
    /// The admin surface for world creation (issue #105). Deliberately a
    /// separate endpoint from the public <c>POST /api/v1/worlds</c> rather
    /// than a wrapper around it: this one answers with
    /// <see cref="AdminWorldResponse"/>, so the admin list a caller already
    /// holds can be updated from the response without a follow-up round trip.
    /// </summary>
    private static async Task<Results<Created<AdminWorldResponse>, ValidationProblem, Conflict<ProblemDetails>>>
        CreateWorld(
            CreateWorldRequest request,
            WorldService worlds,
            CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.Name)] = ["A world needs a name."],
            });
        }

        var options = ApplyOverrides(
            WorldGenerationOptions.ForSeed(request.Seed ?? Random.Shared.Next()) with { Radius = request.Radius },
            request.Generation);

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
                request.Name.Trim(), options, request.MaxPlayers, autoSeed: request.Seed is null, cancellationToken);
            var spawns = await worlds.GetSpawnCapacityAsync(world.Id, cancellationToken);

            return TypedResults.Created(
                $"/api/v1/admin/worlds/{world.Id}", AdminWorldResponse.From(world, playerCount: 0, spawns.GetValueOrDefault(world.Id)));
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

    private static async Task<Results<Ok<AdminWorldResponse>, NotFound, ValidationProblem>> UpdateSettings(
        Guid worldId,
        UpdateWorldSettingsRequest request,
        WorldService worlds,
        SettlementService settlements,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var errors = new Dictionary<string, string[]>();

        if (request.SpeedFactor is <= 0)
        {
            errors[nameof(request.SpeedFactor)] = ["Speed factor must be greater than 0."];
        }

        var world = await worlds.GetWorldAsync(worldId, cancellationToken);
        if (world is null)
        {
            return TypedResults.NotFound();
        }

        var effectiveStartsAt = request.StartsAt.HasValue ? request.StartsAt.Value : world.StartsAt;
        var effectiveEndbossAt = request.EndbossAt.HasValue ? request.EndbossAt.Value : world.EndbossAt;

        if (effectiveEndbossAt is { } endbossAt && effectiveStartsAt is { } startsAt && endbossAt <= startsAt)
        {
            errors[nameof(request.EndbossAt)] = ["The endboss instant must be after the world's start date."];
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        // The old rate must be locked in before the new one takes effect —
        // see SettlementService.RetuneSpeedAsync.
        if (request.SpeedFactor is { } newSpeedFactor && newSpeedFactor != world.SpeedFactor)
        {
            await settlements.RetuneSpeedAsync(worldId, world.SpeedFactor, newSpeedFactor, cancellationToken);
        }

        var updated = await worlds.UpdateAdminSettingsAsync(
            worldId,
            request.SpeedFactor,
            request.StartsAt.HasValue,
            request.StartsAt.Value,
            request.JoinsClosed,
            request.FrozenIslesEnabled,
            request.EndbossAt.HasValue,
            request.EndbossAt.Value,
            cancellationToken);

        if (updated is null)
        {
            return TypedResults.NotFound();
        }

        var playerCount = await worlds.GetPlayerCountAsync(worldId, cancellationToken);
        var spawns = await worlds.GetSpawnCapacityAsync(worldId, cancellationToken);
        return TypedResults.Ok(AdminWorldResponse.From(updated, playerCount, spawns.GetValueOrDefault(worldId)));
    }

    /// <summary>
    /// Generates a candidate map and hands it straight back. Nothing is written:
    /// the world named in the route is only read, for its current radius and to
    /// answer 404 for an id that names nothing.
    /// </summary>
    private static async Task<Results<Ok<WorldSeedPreviewResponse>, NotFound, ValidationProblem>> PreviewSeed(
        Guid worldId,
        PreviewWorldSeedRequest request,
        WorldService worlds,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var world = await worlds.GetWorldAsync(worldId, cancellationToken);
        if (world is null)
        {
            return TypedResults.NotFound();
        }

        if (!TryBuildOptions(world, request.Seed, request.Radius, request.Generation, out var options, out var errors))
        {
            return TypedResults.ValidationProblem(errors);
        }

        var generated = await WorldService.PreviewAsync(options, cancellationToken);
        var review = await Task.Run(() => WorldReview.Review(generated, cancellationToken), cancellationToken);

        return TypedResults.Ok(new WorldSeedPreviewResponse(
            worldId,
            options.Seed,
            options.Radius,
            generated.Islands.Count,
            generated.LandTileCount,
            [.. generated.Islands.Select(PreviewIslandResponse.From)],
            WorldGenerationResponse.From(options),
            WorldReviewResponse.From(review)));
    }

    /// <summary>
    /// Generates and reviews <see cref="ReviewWorldSeedsRequest.Count"/> consecutive candidate seeds and answers their
    /// review summaries best first, so an admin can pick a clean seed to preview. Nothing is written. The seeds run in
    /// parallel, at most <see cref="SeedParallelism"/> at a time (each generation is itself parallel over its islands), and
    /// the request's cancellation stops them: closing the page does not leave the server generating worlds.
    /// </summary>
    private static async Task<Results<Ok<WorldSeedReviewResponse>, NotFound, ValidationProblem>> ReviewSeeds(
        Guid worldId,
        ReviewWorldSeedsRequest request,
        WorldService worlds,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.Count is < 1 or > ReviewWorldSeedsRequest.MaxCount)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.Count)] = [$"Review between 1 and {ReviewWorldSeedsRequest.MaxCount} seeds at a time."],
            });
        }

        if (request.SeedFrom > int.MaxValue - (request.Count - 1))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.SeedFrom)] = ["The seed range runs past the largest seed."],
            });
        }

        var world = await worlds.GetWorldAsync(worldId, cancellationToken);
        if (world is null)
        {
            return TypedResults.NotFound();
        }

        var options = new WorldGenerationOptions[request.Count];
        for (var i = 0; i < request.Count; i++)
        {
            if (!TryBuildOptions(world, request.SeedFrom + i, request.Radius, request.Generation, out options[i], out var errors))
            {
                return TypedResults.ValidationProblem(errors);
            }
        }

        var summaries = new WorldReviewSummary[request.Count];
        await Parallel.ForEachAsync(
            Enumerable.Range(0, request.Count),
            new ParallelOptions { MaxDegreeOfParallelism = SeedParallelism, CancellationToken = cancellationToken },
            (i, token) =>
            {
                var generated = new WorldGenerator(options[i]).Generate(token);
                summaries[i] = WorldReview.Review(generated, token).Summary;
                return ValueTask.CompletedTask;
            });

        Array.Sort(summaries, WorldReviewSummary.BestFirst);
        return TypedResults.Ok(new WorldSeedReviewResponse(
            worldId,
            options[0].Radius,
            [.. summaries.Select(WorldReviewSummaryResponse.From)],
            WorldGenerationResponse.From(options[0])));
    }

    /// <summary>
    /// How many candidate seeds generate at once: half the cores (at least one). A generation already spreads its islands
    /// over every core, so more seeds at once mostly adds memory - a radius-4000 world holds a few hundred MB while it is built.
    /// </summary>
    private static int SeedParallelism => Math.Max(1, Environment.ProcessorCount / 2);

    /// <summary>
    /// Commits a candidate map. The point of no return: every settlement in the
    /// world goes with the islands it was founded on (issue #133), which is why
    /// the request has to re-type the world's name and why a world holding any
    /// other real player's settlement is refused outright.
    /// </summary>
    private static async Task<Results<Ok<ReseedWorldResponse>, NotFound, ValidationProblem, Conflict<ProblemDetails>>>
        Reseed(
            Guid worldId,
            ReseedWorldRequest request,
            ClaimsPrincipal principal,
            WorldService worlds,
            CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var world = await worlds.GetWorldAsync(worldId, cancellationToken);
        if (world is null)
        {
            return TypedResults.NotFound();
        }

        if (!string.Equals(request.ConfirmWorldName?.Trim(), world.Name, StringComparison.Ordinal))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.ConfirmWorldName)] = [$"Type the world's exact name ('{world.Name}') to confirm."],
            });
        }

        if (!TryBuildOptions(world, request.Seed, request.Radius, request.Generation, out var options, out var errors))
        {
            return TypedResults.ValidationProblem(errors);
        }

        var actingUserId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var result = await worlds.ReseedAsync(worldId, options, actingUserId, cancellationToken);

        switch (result.Outcome)
        {
            case ReseedOutcome.WorldNotFound:
                return TypedResults.NotFound();

            case ReseedOutcome.RealPlayersPresent:
                return TypedResults.Conflict(new ProblemDetails
                {
                    Title = "The world has real players in it.",
                    Detail =
                        $"{result.BlockingPlayers} settlement(s) belong to players other than you. " +
                        "Reseeding would delete them, so it is refused.",
                    Status = StatusCodes.Status409Conflict,
                });

            case ReseedOutcome.NoIslands:
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    [nameof(request.Seed)] =
                        [$"Seed {options.Seed} at radius {options.Radius} produced no islands. Try another seed."],
                });

            default:
                var playerCount = await worlds.GetPlayerCountAsync(worldId, cancellationToken);
                var spawns = await worlds.GetSpawnCapacityAsync(worldId, cancellationToken);
                return TypedResults.Ok(new ReseedWorldResponse(
                    AdminWorldResponse.From(result.World!, playerCount, spawns.GetValueOrDefault(worldId)),
                    options.Seed,
                    result.IslandCount,
                    result.DeletedSettlements));
        }
    }

    /// <summary>
    /// <paramref name="current"/> with every non-null field of <paramref name="generation"/>
    /// laid over it — a <see langword="null"/> field keeps the current value, which is what
    /// makes every one of them optional to send.
    /// </summary>
    private static WorldGenerationOptions ApplyOverrides(
        WorldGenerationOptions current, WorldGenerationSettingsOverrides? generation) => current with
    {
        IslandCellSize = generation?.IslandCellSize ?? current.IslandCellSize,
        IslandChance = generation?.IslandChance ?? current.IslandChance,
        IslandMinWidth = generation?.IslandMinWidth ?? current.IslandMinWidth,
        IslandMaxWidth = generation?.IslandMaxWidth ?? current.IslandMaxWidth,
        IslandMinSegments = generation?.IslandMinSegments ?? current.IslandMinSegments,
        IslandMaxSegments = generation?.IslandMaxSegments ?? current.IslandMaxSegments,
        IslandMinElongation = generation?.IslandMinElongation ?? current.IslandMinElongation,
        IslandMaxElongation = generation?.IslandMaxElongation ?? current.IslandMaxElongation,
        IslandMinBend = generation?.IslandMinBend ?? current.IslandMinBend,
        IslandMaxBend = generation?.IslandMaxBend ?? current.IslandMaxBend,
        IslandCoastWarp = generation?.IslandCoastWarp ?? current.IslandCoastWarp,
        IslandCoastWarpScale = generation?.IslandCoastWarpScale ?? current.IslandCoastWarpScale,
        IslandCoastNoise = generation?.IslandCoastNoise ?? current.IslandCoastNoise,
        IslandCoastNoiseScale = generation?.IslandCoastNoiseScale ?? current.IslandCoastNoiseScale,
        IslandSmallShare = generation?.IslandSmallShare ?? current.IslandSmallShare,
        IslandLargeShare = generation?.IslandLargeShare ?? current.IslandLargeShare,
        BeachThreshold = generation?.BeachThreshold ?? current.BeachThreshold,
        MountainThreshold = generation?.MountainThreshold ?? current.MountainThreshold,
        MountainRockiness = generation?.MountainRockiness ?? current.MountainRockiness,
        ForestRockiness = generation?.ForestRockiness ?? current.ForestRockiness,
        MinimumIslandTiles = generation?.MinimumIslandTiles ?? current.MinimumIslandTiles,
        IslandMaxReach = generation?.IslandMaxReach ?? current.IslandMaxReach,
        IslandMinGap = generation?.IslandMinGap ?? current.IslandMinGap,
    };

    /// <summary>
    /// The generation options a preview/reseed request asks for: the world's own
    /// parameters, with the seed, radius, and any <paramref name="generation"/>
    /// overrides the admin chose laid over them. A <see langword="null"/> field
    /// on <paramref name="generation"/> keeps the world's current value for
    /// that parameter — this is what makes every one of them optional to send.
    /// </summary>
    private static bool TryBuildOptions(
        WorldEntity world,
        int? seed,
        int? radius,
        WorldGenerationSettingsOverrides? generation,
        out WorldGenerationOptions options,
        out Dictionary<string, string[]> errors)
    {
        options = ApplyOverrides(
            world.ToGenerationOptions() with
            {
                Seed = seed ?? Random.Shared.Next(),
                Radius = radius ?? world.Radius,
            },
            generation);

        try
        {
            options.Validate();
            errors = new Dictionary<string, string[]>();
            return true;
        }
        catch (ArgumentException ex)
        {
            errors = new Dictionary<string, string[]>
            {
                [ex.ParamName ?? nameof(radius)] = [ex.Message],
            };
            return false;
        }
    }

    private static async Task<Results<Ok<AdminWorldResponse>, NotFound, ValidationProblem>> SetRunState(
        Guid worldId,
        SetWorldRunStateRequest request,
        WorldService worlds,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        WorldRunState? state = request.Action.Trim().ToLowerInvariant() switch
        {
            "pause" => WorldRunState.Paused,
            "maintenance" => WorldRunState.Maintenance,
            "lock" => WorldRunState.Locked,
            "resume" => WorldRunState.Running,
            _ => null,
        };

        if (state is null)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.Action)] = ["Valid: pause, maintenance, lock, resume."],
            });
        }

        if (request.GraceMinutes is < 0)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.GraceMinutes)] = ["Grace cannot be negative."],
            });
        }

        var grace = TimeSpan.FromMinutes(request.GraceMinutes ?? 0);
        var updated = await worlds.SetRunStateAsync(worldId, state.Value, grace, cancellationToken);

        if (updated is null)
        {
            return TypedResults.NotFound();
        }

        var playerCount = await worlds.GetPlayerCountAsync(worldId, cancellationToken);
        var spawns = await worlds.GetSpawnCapacityAsync(worldId, cancellationToken);
        return TypedResults.Ok(AdminWorldResponse.From(updated, playerCount, spawns.GetValueOrDefault(worldId)));
    }
}
