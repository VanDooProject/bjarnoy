namespace BG.API.Models.Auth;

public record RegisterRequest(
    string Username,
    string Email,
    string Password);

public record LoginRequest(
    string Username,
    string Password);

public record RefreshTokenRequest(
    string RefreshToken);

public record VerifyEmailRequest(
    string Token);

public record RequestPasswordResetRequest(
    string Email);

public record ResetPasswordRequest(
    string Token,
    string NewPassword);