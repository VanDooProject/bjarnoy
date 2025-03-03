using BG.API.Models.Auth;
using User = BG.Core.Models.User;
using BG.Core.Interfaces.Repositories;
using BG.Core.Models;
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
    private readonly IEmailVerificationRepository _emailVerificationRepository;
    private readonly IPasswordService _passwordService;
    private readonly ITokenService _tokenService;
    private readonly IEmailService _emailService;

    public AuthController(
        IUserRepository userRepository,
        IEmailVerificationRepository emailVerificationRepository,
        IPasswordService passwordService,
        ITokenService tokenService,
        IEmailService emailService)
    {
        _userRepository = userRepository;
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

        var user = User.Create(
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

        var tokens = new AuthTokenResponse(
            _tokenService.GenerateAccessToken(user),
            _tokenService.GenerateRefreshToken());

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

        user.UpdateLogin();
        await _userRepository.UpdateAsync(user);

        var tokens = new AuthTokenResponse(
            _tokenService.GenerateAccessToken(user),
            _tokenService.GenerateRefreshToken());

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

        await _emailVerificationRepository.DeleteAsync(verification.Id);
        return TypedResults.Ok();
    }

    [HttpPost("refresh")]
    [ProducesResponseType(typeof(AuthTokenResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status401Unauthorized)]
    public async Task<Results<Ok<AuthTokenResponse>, UnauthorizedHttpResult>> Refresh(
        [FromBody] RefreshTokenRequest request)
    {
        var result = _tokenService.GetUserInfoFromToken(request.RefreshToken);
        if (result == null)
        {
            return TypedResults.Unauthorized();
        }

        var userId = EntityId.Parse(result.Value.UserId); // this method is not exisiting yet
        var user = await _userRepository.GetByIdAsync(userId);
        if (user == null)
        {
            return TypedResults.Unauthorized();
        }

        return TypedResults.Ok(new AuthTokenResponse(
            _tokenService.GenerateAccessToken(user),
            _tokenService.GenerateRefreshToken()));
    }
}