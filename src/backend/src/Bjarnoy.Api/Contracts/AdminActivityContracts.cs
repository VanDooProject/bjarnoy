namespace Bjarnoy.Api.Contracts;

/// <summary>One time bucket's distinct-active-user count, as returned by the summary endpoint.</summary>
public sealed record ActivityBucketResponse(DateTimeOffset BucketStart, int ActiveUserCount);

public sealed record ActivitySummaryResponse(
    DateTimeOffset From,
    DateTimeOffset To,
    string Bucket,
    IReadOnlyList<ActivityBucketResponse> Buckets);

/// <summary>One row of the admin activity user list — <c>LastActiveAtUtc</c> is null for a user who has never been tracked.</summary>
public sealed record AdminActivityUserResponse(
    Guid UserId,
    string UserName,
    string? DisplayName,
    DateTimeOffset? LastActiveAtUtc);

public sealed record PagedAdminActivityUsersResponse(
    IReadOnlyList<AdminActivityUserResponse> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>One contiguous session window, as recorded by <c>UserActivityService.TrackAsync</c>.</summary>
public sealed record ActivitySessionWindowResponse(DateTimeOffset StartedAtUtc, DateTimeOffset LastSeenAtUtc);

public sealed record AdminUserActivityDetailResponse(
    Guid UserId,
    DateTimeOffset From,
    DateTimeOffset To,
    int SessionCount,
    TimeSpan TotalActiveDuration,
    IReadOnlyList<ActivitySessionWindowResponse> Sessions);
