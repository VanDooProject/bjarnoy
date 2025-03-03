using BG.Core.ValueObjects;

namespace BG.API.Models.Auth;

public record AuthTokenResponse(
    string AccessToken,
    string RefreshToken);

public record MinimalUserResponse(
    EntityId Id,
    string Username,
    string[] Roles);

public record AuthResponse(
    AuthTokenResponse Tokens,
    MinimalUserResponse User);

public record ErrorResponse(
    string Message,
    string[]? Errors = null);