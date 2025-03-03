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