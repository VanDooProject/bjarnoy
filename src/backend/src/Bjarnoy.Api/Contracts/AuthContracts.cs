using System.ComponentModel.DataAnnotations;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.Contracts;

/// <param name="ExistingOwnerId">
/// The client-generated local id (<c>stablePlayerId()</c> in the frontend's
/// player store) this browser was already playing under, if any. Any
/// unclaimed settlement still carrying that id is claimed by the new account
/// (<c>SettlementEntity.UserId</c>) as part of registering — see
/// <c>AuthService.RegisterAsync</c>.
/// </param>
public sealed record RegisterRequest(
    [property: Required, MinLength(3), MaxLength(50)] string UserName,
    [property: Required, MinLength(8), MaxLength(200)] string Password,
    [property: MaxLength(200)] string? ExistingOwnerId = null);

public sealed record LoginRequest(
    [property: Required] string UserName,
    [property: Required] string Password);

public sealed record RefreshRequest([property: Required] string RefreshToken);

public sealed record LogoutRequest([property: Required] string RefreshToken);

public sealed record UserResponse(
    Guid Id,
    string UserName,
    string Role,
    string Status,
    string? DisplayName)
{
    public static UserResponse From(UserEntity user)
    {
        ArgumentNullException.ThrowIfNull(user);

        return new UserResponse(
            user.Id,
            user.UserName,
            user.Role.ToString().ToLowerInvariant(),
            user.Status.ToString().ToLowerInvariant(),
            user.DisplayName);
    }
}

/// <param name="AccessToken">Short-lived JWT; send as <c>Authorization: Bearer &lt;token&gt;</c>.</param>
/// <param name="RefreshToken">
/// Long-lived and single-use: <c>POST /auth/refresh</c> both consumes and
/// replaces it (rotation), so the one returned here is only ever valid until
/// the next refresh or logout.
/// </param>
public sealed record AuthResponse(string AccessToken, string RefreshToken, UserResponse User);

/// <param name="Error">Machine-readable — <c>"user_banned"</c> or <c>"user_locked"</c>.</param>
public sealed record AuthErrorResponse(string Error);
