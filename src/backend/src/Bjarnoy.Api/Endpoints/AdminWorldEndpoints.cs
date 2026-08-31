using System.Security.Claims;
using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;
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

        worlds.MapPatch("/{worldId:guid}/settings", UpdateSettings)
            .WithName("AdminUpdateWorldSettings")
            .WithSummary("Updates a world's speed factor, start date, stop-join toggle, and endboss instant.");

        worlds.MapPost("/{worldId:guid}/run-state", SetRunState)
            .WithName("AdminSetWorldRunState")
            .WithSummary("Pauses, enters maintenance on, locks, or resumes a world.");

        worlds.MapPost("/{worldId:guid}/preview-seed", PreviewSeed)
            .WithName("AdminPreviewWorldSeed")
            .WithSummary("Generates a candidate map in memory and returns its islands. Persists nothing.");

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

        IReadOnlyList<AdminWorldResponse> response =
        [
            .. entities.Select(w => AdminWorldResponse.From(w, playerCounts.GetValueOrDefault(w.Id))),
        ];

        return TypedResults.Ok(response);
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
            request.EndbossAt.HasValue,
            request.EndbossAt.Value,
            cancellationToken);

        if (updated is null)
        {
            return TypedResults.NotFound();
        }

        var playerCount = await worlds.GetPlayerCountAsync(worldId, cancellationToken);
        return TypedResults.Ok(AdminWorldResponse.From(updated, playerCount));
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

        if (!TryBuildOptions(world, request.Seed, request.Radius, out var options, out var errors))
        {
            return TypedResults.ValidationProblem(errors);
        }

        var generated = await WorldService.PreviewAsync(options, cancellationToken);

        return TypedResults.Ok(new WorldSeedPreviewResponse(
            worldId,
            options.Seed,
            options.Radius,
            generated.Islands.Count,
            generated.LandTileCount,
            [.. generated.Islands.Select(PreviewIslandResponse.From)]));
    }

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

        if (!TryBuildOptions(world, request.Seed, request.Radius, out var options, out var errors))
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
                return TypedResults.Ok(new ReseedWorldResponse(
                    AdminWorldResponse.From(result.World!, playerCount),
                    options.Seed,
                    result.IslandCount,
                    result.DeletedSettlements));
        }
    }

    /// <summary>
    /// The generation options a preview/reseed request asks for: the world's own
    /// parameters, with the seed and radius the admin chose laid over them.
    /// </summary>
    private static bool TryBuildOptions(
        WorldEntity world,
        int? seed,
        int? radius,
        out WorldGenerationOptions options,
        out Dictionary<string, string[]> errors)
    {
        options = world.ToGenerationOptions() with
        {
            Seed = seed ?? Random.Shared.Next(),
            Radius = radius ?? world.Radius,
        };

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
        return TypedResults.Ok(AdminWorldResponse.From(updated, playerCount));
    }
}
