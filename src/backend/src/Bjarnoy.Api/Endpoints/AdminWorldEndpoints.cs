using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;

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
