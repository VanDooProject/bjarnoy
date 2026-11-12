using System.Security.Claims;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Auth.ApiKeys;
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
            .WithTags("Leaderboards")
            .WithApiKeyFeature(ApiKeyFeature.Leaderboards);

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

        app.MapGet("/api/v1/worlds/{worldId:guid}/stats/users/{userId:guid}/weekly", GetWeeklyStats)
            .WithApiVersionSet(versionSet)
            .WithTags("Leaderboards")
            .WithName("GetWeeklyStats")
            .WithSummary("A user's weekly stat cards, newest window first.")
            .WithApiKeyFeature(ApiKeyFeature.Leaderboards);

        return app;
    }

    private static async Task<Results<Ok<LeaderboardDirectoryResponse>, NotFound>> GetDirectory(
        Guid worldId,
        ClaimsPrincipal principal,
        LeaderboardService leaderboards,
        WorldService worlds,
        AuthService auth,
        CancellationToken cancellationToken)
    {
        if (await worlds.GetWorldAsync(worldId, cancellationToken) is null)
        {
            return TypedResults.NotFound();
        }

        var callerId = CallerId(principal);
        var boards = await leaderboards.GetDirectoryAsync(worldId, callerId, cancellationToken);
        var (isPremium, isAdmin) = await CallerTierAsync(principal, callerId, auth, cancellationToken);
        var windows = LeaderboardService.OpenableWindows(
            await leaderboards.GetClosedWindowsAsync(worldId, cancellationToken), isPremium, isAdmin);

        return TypedResults.Ok(new LeaderboardDirectoryResponse(
            [.. boards.Select(LeaderboardBoardInfoResponse.From)],
            [.. windows.Select(w => new WeeklyWindowResponse(w.PeriodStart, w.PeriodEnd))]));
    }

    private static async Task<Results<Ok<LeaderboardBoardResponse>, NotFound, BadRequest<ProblemDetails>, JsonHttpResult<AuthErrorResponse>>> GetBoard(
        Guid worldId,
        string scope,
        string category,
        DateTimeOffset? periodStart,
        int? afterRank,
        int? pageSize,
        ClaimsPrincipal principal,
        LeaderboardService leaderboards,
        WorldService worlds,
        AuthService auth,
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

        // The current board is public; a named past window is week history, which is gated the same way as the
        // directory's window list (anonymous 401, free 403, premium only the newest windows, admin all).
        if (periodStart is { } requested)
        {
            var callerId = CallerId(principal);
            if (callerId is null)
            {
                return TypedResults.Json(
                    new AuthErrorResponse("authentication_required"), statusCode: StatusCodes.Status401Unauthorized);
            }

            var (isPremium, isAdmin) = await CallerTierAsync(principal, callerId, auth, cancellationToken);
            var openable = LeaderboardService.OpenableWindows(
                await leaderboards.GetClosedWindowsAsync(worldId, cancellationToken), isPremium, isAdmin);
            if (!isAdmin && !openable.Any(w => w.PeriodStart == requested))
            {
                return TypedResults.Json(
                    new AuthErrorResponse("premium_required"), statusCode: StatusCodes.Status403Forbidden);
            }
        }

        var page = await leaderboards.GetBoardPageAsync(
            worldId,
            parsedScope,
            parsedCategory,
            periodStart,
            Math.Max(0, afterRank ?? 0),
            Math.Clamp(pageSize ?? DefaultPageSize, 1, MaxPageSize),
            cancellationToken);

        return TypedResults.Ok(LeaderboardBoardResponse.From(parsedScope, parsedCategory, page));
    }

    private static async Task<Results<Ok<WeeklyStatsPageResponse>, NotFound>> GetWeeklyStats(
        Guid worldId,
        Guid userId,
        Guid? cursor,
        int? pageSize,
        LeaderboardService leaderboards,
        WorldService worlds,
        CancellationToken cancellationToken)
    {
        if (await worlds.GetWorldAsync(worldId, cancellationToken) is null)
        {
            return TypedResults.NotFound();
        }

        var (items, nextCursor) = await leaderboards.GetWeeklyStatsAsync(
            worldId, userId, cursor, Math.Clamp(pageSize ?? DefaultPageSize, 1, MaxPageSize), cancellationToken);

        return TypedResults.Ok(new WeeklyStatsPageResponse([.. items.Select(WeeklyStatResponse.From)], nextCursor));
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

    /// <summary>The caller's user id; <see langword="null"/> for anonymous play, which is an ordinary caller here.</summary>
    private static Guid? CallerId(ClaimsPrincipal principal)
    {
        var idClaim = principal.Identity?.IsAuthenticated == true
            ? principal.FindFirstValue(ClaimTypes.NameIdentifier)
            : null;
        return Guid.TryParse(idClaim, out var id) ? id : null;
    }

    /// <summary>Premium is a live database read (like <see cref="PremiumUserEndpointFilter"/>); admin comes from the role claim.</summary>
    private static async Task<(bool IsPremium, bool IsAdmin)> CallerTierAsync(
        ClaimsPrincipal principal, Guid? callerId, AuthService auth, CancellationToken cancellationToken)
    {
        if (callerId is not { } id)
        {
            return (false, false);
        }

        var isPremium = await auth.GetIsPremiumAsync(id, cancellationToken) == true;
        return (isPremium, principal.IsInRole(nameof(UserRole.Admin)));
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
