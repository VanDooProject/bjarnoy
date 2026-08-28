using System.Security.Claims;
using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Admin-only user management (issue #29): list/search/filter, edit display
/// name/role, and lock/ban control — the admin-facing surface over the
/// enforcement #26 already wires into login/refresh and mutating game endpoints.
/// </summary>
public static class AdminUserEndpoints
{
    public static IEndpointRouteBuilder MapAdminUserEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var users = app.MapGroup("/api/v1/admin/users")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Admin", "Users")
            .RequireAuthorization("Admin");

        users.MapGet("/", ListUsers)
            .WithName("AdminListUsers")
            .WithSummary("Lists users, paged, with optional search and status filter.");

        users.MapGet("/{userId:guid}", GetUser)
            .WithName("AdminGetUser")
            .WithSummary("A user's detail, including the settlements they own.");

        users.MapPatch("/{userId:guid}", UpdateUser)
            .WithName("AdminUpdateUser")
            .WithSummary("Updates a user's display name and/or role.");

        users.MapPost("/{userId:guid}/status", SetStatus)
            .WithName("AdminSetUserStatus")
            .WithSummary("Locks, unlocks, bans, or unbans a user.");

        return app;
    }

    private static async Task<Ok<PagedAdminUsersResponse>> ListUsers(
        string? search,
        string? status,
        int? page,
        int? pageSize,
        UserService userService,
        CancellationToken cancellationToken)
    {
        UserStatus? statusFilter = null;
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<UserStatus>(status, ignoreCase: true, out var parsed))
        {
            statusFilter = parsed;
        }

        var effectivePage = page is > 0 ? page.Value : 1;
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 25;

        var result = await userService.GetUsersAsync(
            search, statusFilter, effectivePage, effectivePageSize, cancellationToken);

        IReadOnlyList<AdminUserResponse> items =
        [
            .. result.Users.Select(u => AdminUserResponse.From(u, result.SettlementCounts.GetValueOrDefault(u.Id))),
        ];

        return TypedResults.Ok(new PagedAdminUsersResponse(items, result.TotalCount, effectivePage, effectivePageSize));
    }

    private static async Task<Results<Ok<AdminUserDetailResponse>, NotFound>> GetUser(
        Guid userId,
        UserService userService,
        CancellationToken cancellationToken)
    {
        var detail = await userService.GetUserDetailAsync(userId, cancellationToken);
        return detail is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(AdminUserDetailResponse.From(detail.User, detail.Settlements));
    }

    private static async Task<Results<Ok<AdminUserResponse>, NotFound, ValidationProblem>> UpdateUser(
        Guid userId,
        UpdateAdminUserRequest request,
        UserService userService,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        UserRole? role = null;
        if (request.Role is not null)
        {
            if (!Enum.TryParse<UserRole>(request.Role, ignoreCase: true, out var parsedRole))
            {
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    [nameof(request.Role)] = ["Valid: player, admin."],
                });
            }

            role = parsedRole;
        }

        var (outcome, user) = await userService.UpdateUserAsync(userId, request.DisplayName, role, cancellationToken);

        if (outcome == UserEditOutcome.NotFound)
        {
            return TypedResults.NotFound();
        }

        if (outcome == UserEditOutcome.WouldRemoveLastAdmin)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.Role)] = ["This is the last remaining admin; demote another admin first."],
            });
        }

        var settlementCount = await userService.GetSettlementCountAsync(userId, cancellationToken);
        return TypedResults.Ok(AdminUserResponse.From(user!, settlementCount));
    }

    private static async Task<Results<Ok<AdminUserResponse>, NotFound, ValidationProblem>> SetStatus(
        Guid userId,
        SetUserStatusRequest request,
        UserService userService,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!Enum.TryParse<UserStatus>(request.Status, ignoreCase: true, out var status))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.Status)] = ["Valid: active, locked, banned."],
            });
        }

        // The "Admin" policy already requires a valid, authenticated JWT, so
        // NameIdentifier is always present here.
        var actingUserId = Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var (outcome, user) = await userService.SetStatusAsync(
            userId, status, request.Reason, actingUserId, cancellationToken);

        if (outcome == UserStatusChangeOutcome.NotFound)
        {
            return TypedResults.NotFound();
        }

        if (outcome == UserStatusChangeOutcome.CannotActOnSelf)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.Status)] = ["You cannot lock or ban your own account."],
            });
        }

        var settlementCount = await userService.GetSettlementCountAsync(userId, cancellationToken);
        return TypedResults.Ok(AdminUserResponse.From(user!, settlementCount));
    }
}
