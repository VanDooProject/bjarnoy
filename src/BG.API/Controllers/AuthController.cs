using BG.API.Models.Auth;
using BG.Core.Interfaces.Repositories;
using BG.Core.Models;
using BG.Core.Models.Enums;
using BG.Core.Services;
using BG.Core.ValueObjects;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace BG.API.Controllers;

[ApiController]
[Route("api/v1/auth")]
public class AuthController : ControllerBase
{
    private readonly IUserRepository _userRepository;
    private readonly IRefreshTokenRepository _refreshTokenRepository;
    private readonly IEmailVerificationRepository _emailVerificationRepository;
    private readonly IPasswordService _passwordService;
    private readonly ITokenService _tokenService;
    private readonly IEmailService _emailService;

    public AuthController(
        IUserRepository userRepository,
        IRefreshTokenRepository refreshTokenRepository,
        IEmailVerificationRepository emailVerificationRepository,
        IPasswordService passwordService,
        ITokenService tokenService,
        IEmailService emailService)
    {
        _userRepository = userRepository;
        _refreshTokenRepository = refreshTokenRepository;
        _emailVerificationRepository = emailVerificationRepository;
        _passwordService = passwordService;
        _tokenService = tokenService;
        _emailService = emailService;
    }

    // TODO think of rate limit so a bad guy can't enumerate usernames or emails
    [HttpPost("register")]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<Results<Ok<AuthResponse>, BadRequest<ErrorResponse>>> Register(
        [FromBody] RegisterRequest request)
    {
        var existingUserByName = await _userRepository.GetByUsernameAsync(request.Username);
        var existingUserByEmail = await _userRepository.GetByEmailAsync(request.Email);

        if (existingUserByName != null || existingUserByEmail != null)
        {
            return TypedResults.BadRequest(new ErrorResponse("Username or email already exists"));
        }

        var user = BG.Core.Models.User.Create(
            request.Username,
            request.Email,
            _passwordService.HashPassword(request.Password));

        await _userRepository.CreateAsync(user);

        var verification = EmailVerification.Create(
            user.Id, 
            user.Email, 
            TimeSpan.FromHours(24));

        await _emailVerificationRepository.CreateAsync(verification);
        await _emailService.SendVerificationEmailAsync(user, verification);

        var refreshToken = _tokenService.GenerateRefreshToken();
        await _refreshTokenRepository.CreateAsync(RefreshToken.Create(
            user.Id,
            refreshToken,
            TimeSpan.FromDays(7)));

        var tokens = new AuthTokenResponse(
            _tokenService.GenerateAccessToken(user),
            refreshToken
        );
        
        return TypedResults.Ok(new AuthResponse(
            tokens,
            new MinimalUserResponse(user.Id, user.Username, user.Roles)));
    }

    [HttpPost("login")]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status401Unauthorized)]
    public async Task<Results<Ok<AuthResponse>, UnauthorizedHttpResult>> Login(
        [FromBody] LoginRequest request)
    {
        var user = await _userRepository.GetByUsernameAsync(request.Username);
        if (user == null || !_passwordService.VerifyPassword(request.Password, user.PasswordHash))
        {
            return TypedResults.Unauthorized();
        }

        user.UpdateLastOnline();
        await _userRepository.UpdateAsync(user);

        var refreshToken = _tokenService.GenerateRefreshToken();
        await _refreshTokenRepository.CreateAsync(RefreshToken.Create(
            user.Id,
            refreshToken,
            TimeSpan.FromDays(7)));

        var tokens = new AuthTokenResponse(
            _tokenService.GenerateAccessToken(user),
            refreshToken
        );
        
        return TypedResults.Ok(new AuthResponse(
            tokens,
            new MinimalUserResponse(user.Id, user.Username, user.Roles)));
    }

    [HttpPost("verify-email")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<Results<Ok, BadRequest<ErrorResponse>>> VerifyEmail(
        [FromBody] VerifyEmailRequest request)
    {
        var verification = await _emailVerificationRepository.GetVerificationByTokenAsync(request.Token);
        if (verification == null || !verification.IsValid(request.Token))
        {
            return TypedResults.BadRequest(new ErrorResponse("Invalid or expired verification token"));
        }

        var user = await _userRepository.GetByIdAsync(verification.UserId);
        if (user == null)
        {
            return TypedResults.BadRequest(new ErrorResponse("User not found"));
        }

        user.UpdateStatus(UserStatus.Active);
        await _userRepository.UpdateAsync(user);

        await _emailVerificationRepository.DeleteAsync(verification.Id);
        return TypedResults.Ok();
    }

    [HttpPost("refresh")]
    [ProducesResponseType(typeof(AuthTokenResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status401Unauthorized)]
    public async Task<Results<Ok<AuthTokenResponse>, UnauthorizedHttpResult>> Refresh(
        [FromBody] RefreshTokenRequest request)
    {
        var refreshToken = await _refreshTokenRepository.GetByTokenAsync(request.RefreshToken);
        if (refreshToken == null || !refreshToken.IsValid())
        {
            return TypedResults.Unauthorized();
        }

        var user = await _userRepository.GetByIdAsync(refreshToken.UserId);
        if (user == null)
        {
            return TypedResults.Unauthorized();
        }

        user.UpdateLastOnline();
        await _userRepository.UpdateAsync(user);

        // Revoke the old token and generate a new one
        refreshToken.Revoke();
        await _refreshTokenRepository.UpdateAsync(refreshToken);

        var newRefreshToken = _tokenService.GenerateRefreshToken();
        await _refreshTokenRepository.CreateAsync(RefreshToken.Create(
            user.Id,
            newRefreshToken,
            TimeSpan.FromDays(7)));

        return TypedResults.Ok(new AuthTokenResponse(
            _tokenService.GenerateAccessToken(user),
            newRefreshToken));
    }

    [HttpPost("logout")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<Results<Ok, BadRequest<ErrorResponse>>> Logout(
        [FromBody] RefreshTokenRequest request)
    {
        var refreshToken = await _refreshTokenRepository.GetByTokenAsync(request.RefreshToken);
        if (refreshToken == null)
        {
            return TypedResults.BadRequest(new ErrorResponse("Invalid refresh token"));
        }

        refreshToken.Revoke();
        await _refreshTokenRepository.UpdateAsync(refreshToken);

        return TypedResults.Ok();
    }

    [Authorize]
    [HttpPost("logout-all")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<Ok> LogoutAll()
    {
        var userIdString = User.Claims.FirstOrDefault(c => c.Type == "sub")?.Value;
        if (userIdString != null && EntityId.TryParse(userIdString, out var userId))
        {
            await _refreshTokenRepository.RevokeAllForUserAsync(userId);
        }
        return TypedResults.Ok();
    }

    [HttpPost("request-password-reset")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<Results<Ok, BadRequest<ErrorResponse>>> RequestPasswordReset(
        [FromBody] RequestPasswordResetRequest request)
    {
        var user = await _userRepository.GetByEmailAsync(request.Email);
        if (user == null)
        {
            // Return OK even if user not found to prevent email enumeration
            return TypedResults.Ok();
        }

        var verification = EmailVerification.Create(
            user.Id,
            user.Email,
            TimeSpan.FromHours(1));

        await _emailVerificationRepository.CreateAsync(verification);
        await _emailService.SendPasswordResetEmailAsync(user, verification.Token);

        return TypedResults.Ok();
    }

    [HttpPost("reset-password")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<Results<Ok, BadRequest<ErrorResponse>>> ResetPassword(
        [FromBody] ResetPasswordRequest request)
    {
        var verification = await _emailVerificationRepository.GetVerificationByTokenAsync(request.Token);
        if (verification == null || !verification.IsValid(request.Token))
        {
            return TypedResults.BadRequest(new ErrorResponse("Invalid or expired reset token"));
        }

        var user = await _userRepository.GetByIdAsync(verification.UserId);
        if (user == null)
        {
            return TypedResults.BadRequest(new ErrorResponse("User not found"));
        }

        // Update password and revoke all refresh tokens for security
        user.UpdatePassword(_passwordService.HashPassword(request.NewPassword));
        await _userRepository.UpdateAsync(user);
        await _refreshTokenRepository.RevokeAllForUserAsync(user.Id);
        await _emailVerificationRepository.DeleteAsync(verification.Id);

        var refreshToken = _tokenService.GenerateRefreshToken();
        await _refreshTokenRepository.CreateAsync(RefreshToken.Create(
            user.Id,
            refreshToken,
            TimeSpan.FromDays(7)));

        var tokens = new AuthTokenResponse(
            _tokenService.GenerateAccessToken(user),
            refreshToken
        );
        
        return TypedResults.Ok();
    }

    private void ValidatePassword(string password) {
        // TODO: Add password validation rules
    }
}