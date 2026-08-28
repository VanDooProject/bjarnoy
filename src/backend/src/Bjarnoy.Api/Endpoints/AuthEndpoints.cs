using System.Security.Claims;
using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Endpoints;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var auth = app.MapGroup("/api/v1/auth")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Auth");

        auth.MapPost("/register", Register)
            .WithName("Register")
            .WithSummary("Creates a player account and logs it in.");

        auth.MapPost("/login", Login)
            .WithName("Login")
            .WithSummary("Logs in with a username and password.");

        auth.MapPost("/refresh", Refresh)
            .WithName("RefreshToken")
            .WithSummary("Exchanges a refresh token for a new access token, rotating it.");

        auth.MapPost("/logout", Logout)
            .WithName("Logout")
            .WithSummary("Revokes a refresh token.");

        auth.MapGet("/me", Me)
            .WithName("Me")
            .WithSummary("The current user, from live database state.")
            .RequireAuthorization();

        return app;
    }

    private static async Task<IResult> Register(
        RegisterRequest request,
        AuthService authService,
        JwtTokenService tokens,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await authService.RegisterAsync(
            request.UserName, request.Password, request.LegacyPlayerId, cancellationToken);

        if (result.Outcome == AuthOutcome.UserNameTaken)
        {
            return Results.Conflict(new ProblemDetails
            {
                Title = "That username is taken.",
                Status = StatusCodes.Status409Conflict,
            });
        }

        return Results.Ok(ToAuthResponse(result.User!, result.RefreshToken!, tokens));
    }

    private static async Task<IResult> Login(
        LoginRequest request,
        AuthService authService,
        JwtTokenService tokens,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await authService.LoginAsync(request.UserName, request.Password, cancellationToken);

        return result.Outcome switch
        {
            AuthOutcome.InvalidCredentials => Results.Unauthorized(),
            AuthOutcome.Banned => Banned(),
            _ => Results.Ok(ToAuthResponse(result.User!, result.RefreshToken!, tokens)),
        };
    }

    private static async Task<IResult> Refresh(
        RefreshRequest request,
        AuthService authService,
        JwtTokenService tokens,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await authService.RefreshAsync(request.RefreshToken, cancellationToken);

        return result.Outcome switch
        {
            RefreshOutcome.Invalid => Results.Unauthorized(),
            RefreshOutcome.Banned => Banned(),
            _ => Results.Ok(ToAuthResponse(result.User!, result.RefreshToken!, tokens)),
        };
    }

    private static async Task<IResult> Logout(
        LogoutRequest request,
        AuthService authService,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        await authService.LogoutAsync(request.RefreshToken, cancellationToken);
        return Results.NoContent();
    }

    private static async Task<IResult> Me(
        ClaimsPrincipal principal,
        AuthService authService,
        CancellationToken cancellationToken)
    {
        var idClaim = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(idClaim, out var id))
        {
            return Results.Unauthorized();
        }

        // Read live state rather than trusting the token's claims, so a status
        // change (locked/banned) shows up here immediately rather than only
        // once the access token expires.
        var user = await authService.GetByIdAsync(id, cancellationToken);
        return user is null ? Results.Unauthorized() : Results.Ok(UserResponse.From(user));
    }

    private static IResult Banned() =>
        Results.Json(new AuthErrorResponse("user_banned"), statusCode: StatusCodes.Status403Forbidden);

    private static AuthResponse ToAuthResponse(
        Bjarnoy.Infrastructure.Entities.UserEntity user, string refreshToken, JwtTokenService tokens) =>
        new(tokens.CreateAccessToken(user), refreshToken, UserResponse.From(user));
}
