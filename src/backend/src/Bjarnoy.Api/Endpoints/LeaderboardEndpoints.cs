using System.Security.Claims;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// The leaderboard read API (issue #43 PR 2): board directory, board pages,
/// and the caller's own rank. World-public — anonymous play can already
/// browse worlds, so only <c>/me</c> requires auth (issue #43 §6).
/// </summary>
public static class LeaderboardEndpoints
{
    public const int DefaultPageSize = 25;
    public const int MaxPageSize = 100;
    public const int DefaultMeRadius = 3;

    public static IEndpointRouteBuilder MapLeaderboardEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var group = app.MapGroup("/api/v1/worlds/{worldId:guid}/leaderboards")
            .WithApiVersionSet(versionSet)
            .WithTags("Leaderboards");

        group.MapGet("/", GetDirectory)
            .WithName("GetLeaderboardDirectory")
            .WithSummary("Which (scope, category) boards exist, which are live vs. dark, and why.");

        group.MapGet("/{scope}/{category}", GetBoard)
            .WithName("GetLeaderboardBoard")
            .WithSummary("A keyset page of one board's current, all-time ranking.");

        group.MapGet("/{scope}/{category}/me", GetMyRank)
            .WithName("GetMyLeaderboardRank")
            .WithSummary("The caller's rank on one board, plus a window of entries around it.")
            .RequireAuthorization();

        return app;
    }

    private static async Task<Results<Ok<LeaderboardDirectoryResponse>, NotFound>> GetDirectory(
        Guid worldId,
        LeaderboardService leaderboards,
        WorldService worlds,
        CancellationToken cancellationToken)
    {
        if (await worlds.GetWorldAsync(worldId, cancellationToken) is null)
        {
            return TypedResults.NotFound();
        }

        var boards = await leaderboards.GetDirectoryAsync(worldId, cancellationToken);

        // Issue #43 PR 4 populates this once window closing exists; PR 2 has
        // no closed windows to report.
        IReadOnlyList<WeeklyWindowResponse> weeklyWindows = [];

        return TypedResults.Ok(new LeaderboardDirectoryResponse(
            [.. boards.Select(LeaderboardBoardInfoResponse.From)], weeklyWindows));
    }

    private static async Task<Results<Ok<LeaderboardBoardResponse>, NotFound, BadRequest<ProblemDetails>>> GetBoard(
        Guid worldId,
        string scope,
        string category,
        int? afterRank,
        int? pageSize,
        LeaderboardService leaderboards,
        WorldService worlds,
        CancellationToken cancellationToken)
    {
        if (!TryParseScope(scope, out var parsedScope) || !TryParseCategory(category, out var parsedCategory))
        {
            return TypedResults.BadRequest(UnknownBoardProblem());
        }

        if (await worlds.GetWorldAsync(worldId, cancellationToken) is null)
        {
            return TypedResults.NotFound();
        }

        var page = await leaderboards.GetBoardPageAsync(
            worldId,
            parsedScope,
            parsedCategory,
            Math.Max(0, afterRank ?? 0),
            Math.Clamp(pageSize ?? DefaultPageSize, 1, MaxPageSize),
            cancellationToken);

        return TypedResults.Ok(LeaderboardBoardResponse.From(parsedScope, parsedCategory, page));
    }

    private static async Task<Results<Ok<LeaderboardMeResponse>, NotFound, ForbidHttpResult, BadRequest<ProblemDetails>>> GetMyRank(
        Guid worldId,
        string scope,
        string category,
        Guid? subjectId,
        int? radius,
        ClaimsPrincipal principal,
        LeaderboardService leaderboards,
        WorldService worlds,
        CancellationToken cancellationToken)
    {
        if (!TryParseScope(scope, out var parsedScope) || !TryParseCategory(category, out var parsedCategory))
        {
            return TypedResults.BadRequest(UnknownBoardProblem());
        }

        var idClaim = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(idClaim, out var userId))
        {
            return TypedResults.NotFound();
        }

        if (await worlds.GetWorldAsync(worldId, cancellationToken) is null)
        {
            return TypedResults.NotFound();
        }

        var resolution = await leaderboards.ResolveMeSubjectAsync(
            worldId, parsedScope, userId, subjectId, cancellationToken);

        if (!resolution.Succeeded)
        {
            return resolution.Failure == nameof(MeSubjectResolution.NotOwner)
                ? TypedResults.Forbid()
                : TypedResults.NotFound();
        }

        var result = await leaderboards.GetMyRankAsync(
            worldId, parsedScope, parsedCategory, resolution.SubjectId!.Value,
            Math.Max(0, radius ?? DefaultMeRadius), cancellationToken);

        return result is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(LeaderboardMeResponse.From(result));
    }

    private static ProblemDetails UnknownBoardProblem() => new()
    {
        Title = "Unknown leaderboard scope or category.",
        Detail = $"Valid scopes: {string.Join(", ", Enum.GetNames<LeaderboardScope>()).ToLowerInvariant()}. "
            + $"Valid categories: {string.Join(", ", Enum.GetNames<LeaderboardCategory>()).ToLowerInvariant()}.",
        Status = StatusCodes.Status400BadRequest,
    };

    private static bool TryParseScope(string value, out LeaderboardScope scope)
    {
        foreach (var candidate in Enum.GetValues<LeaderboardScope>())
        {
            if (string.Equals(candidate.ToString(), value, StringComparison.OrdinalIgnoreCase))
            {
                scope = candidate;
                return true;
            }
        }

        scope = default;
        return false;
    }

    private static bool TryParseCategory(string value, out LeaderboardCategory category)
    {
        foreach (var candidate in Enum.GetValues<LeaderboardCategory>())
        {
            if (string.Equals(candidate.ToString(), value, StringComparison.OrdinalIgnoreCase))
            {
                category = candidate;
                return true;
            }
        }

        category = default;
        return false;
    }
}
