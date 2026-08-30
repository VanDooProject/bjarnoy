using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Admin-only read side of the user activity tracker (PR1: <c>UserActivityService</c>,
/// <c>UserActivityEntity</c>/<c>UserActivitySessionEntity</c>): a bucketed
/// active-user summary, a users-by-last-active list, and one user's session
/// history. Nothing here writes activity — that's PR1's endpoint filter and
/// refresh-token hook.
/// </summary>
public static class AdminActivityEndpoints
{
    public static IEndpointRouteBuilder MapAdminActivityEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var activity = app.MapGroup("/api/v1/admin/activity")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Admin", "Activity")
            .RequireAuthorization("Admin");

        activity.MapGet("/summary", GetSummary)
            .WithName("AdminGetActivitySummary")
            .WithSummary("Distinct active-user counts per time bucket over a range.");

        activity.MapGet("/users", GetUsers)
            .WithName("AdminGetActivityUsers")
            .WithSummary("Users paged and sorted by most-recently-active, including never-active users.");

        activity.MapGet("/users/{userId:guid}", GetUserDetail)
            .WithName("AdminGetUserActivityDetail")
            .WithSummary("One user's session windows and totals over a range.");

        return app;
    }

    private static async Task<Results<Ok<ActivitySummaryResponse>, ValidationProblem>> GetSummary(
        DateTimeOffset? from,
        DateTimeOffset? to,
        string? bucket,
        UserActivityQueryService activityQueryService,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();

        if (from is null)
        {
            errors[nameof(from)] = ["Required."];
        }

        if (to is null)
        {
            errors[nameof(to)] = ["Required."];
        }

        ActivityBucketSize bucketSize = default;
        var bucketValue = string.IsNullOrWhiteSpace(bucket) ? "day" : bucket;
        if (!Enum.TryParse(bucketValue, ignoreCase: true, out bucketSize))
        {
            errors[nameof(bucket)] = ["Valid: day, hour."];
        }

        if (from is not null && to is not null && to < from)
        {
            errors[nameof(to)] = ["Must not be before 'from'."];
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var (outcome, summary) = await activityQueryService.GetSummaryAsync(
            from!.Value, to!.Value, bucketSize, cancellationToken);

        if (outcome == ActivitySummaryOutcome.RangeTooLarge)
        {
            var maxRange = UserActivityQueryService.MaxRangeFor(bucketSize);
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(bucket)] =
                [
                    $"The requested range exceeds the max of {maxRange.TotalDays:0} days for bucket={bucketValue.ToLowerInvariant()}.",
                ],
            });
        }

        var response = new ActivitySummaryResponse(
            from.Value,
            to.Value,
            bucketValue.ToLowerInvariant(),
            [.. summary!.Buckets.Select(b => new ActivityBucketResponse(b.BucketStart, b.ActiveUserCount))]);

        return TypedResults.Ok(response);
    }

    private static async Task<Ok<PagedAdminActivityUsersResponse>> GetUsers(
        int? page,
        int? pageSize,
        string? sort,
        UserActivityQueryService activityQueryService,
        CancellationToken cancellationToken)
    {
        // "lastActive" is the only supported sort today; the parameter exists
        // so a future addition (e.g. sort=name) is not a breaking API change.
        var effectivePage = page is > 0 ? page.Value : 1;
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 25;

        var result = await activityQueryService.GetUsersAsync(effectivePage, effectivePageSize, cancellationToken);

        IReadOnlyList<AdminActivityUserResponse> items =
        [
            .. result.Users.Select(u => new AdminActivityUserResponse(u.UserId, u.UserName, u.DisplayName, u.LastActiveAtUtc)),
        ];

        return TypedResults.Ok(new PagedAdminActivityUsersResponse(items, result.TotalCount, effectivePage, effectivePageSize));
    }

    private static async Task<Results<Ok<AdminUserActivityDetailResponse>, NotFound, ValidationProblem>> GetUserDetail(
        Guid userId,
        DateTimeOffset? from,
        DateTimeOffset? to,
        UserActivityQueryService activityQueryService,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();

        if (from is null)
        {
            errors[nameof(from)] = ["Required."];
        }

        if (to is null)
        {
            errors[nameof(to)] = ["Required."];
        }

        if (from is not null && to is not null && to < from)
        {
            errors[nameof(to)] = ["Must not be before 'from'."];
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var detail = await activityQueryService.GetUserDetailAsync(userId, from!.Value, to!.Value, cancellationToken);

        if (detail is null)
        {
            return TypedResults.NotFound();
        }

        var response = new AdminUserActivityDetailResponse(
            userId,
            from.Value,
            to.Value,
            detail.SessionCount,
            detail.TotalActiveDuration,
            [.. detail.Sessions.Select(s => new ActivitySessionWindowResponse(s.StartedAtUtc, s.LastSeenAtUtc))]);

        return TypedResults.Ok(response);
    }
}
