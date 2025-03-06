using System.Net;
using System.Net.Http.Json;
using BG.Api.IntegrationTests.Infrastructure;
using BG.Core.Models;
using BG.Core.Interfaces.Repositories;
using Microsoft.Extensions.DependencyInjection;
using BG.API.Models.Auth;
using System.IdentityModel.Tokens.Jwt;
using BG.Infrastructure.Services;
using BG.Core.Services;

namespace BG.Api.IntegrationTests.Auth;

public class TokenUserIdTests : IntegrationTestBase
{
    private HttpClient _client = null!;
    private string _userId = string.Empty;
    private string _accessToken = string.Empty;

    [SetUp]
    public async Task Setup()
    {
        _client = _factory?.CreateClient() ?? throw new InvalidOperationException("Test factory is not initialized");

        // Register and activate a test user
        var registerResponse = await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            Username = $"tokentest-{TestId}",
            Email = $"tokentest-{TestId}@example.com",
            Password = "Test123!"
        });

        var userRepo = _factory.Services.GetRequiredService<IUserRepository>();
        var user = await userRepo.GetByUsernameAsync($"tokentest-{TestId}");
        user!.UpdateStatus(Core.Models.Enums.UserStatus.Active);
        await userRepo.UpdateAsync(user);
        _userId = user.Id.ToString();

        // Login to get tokens
        var loginResponse = await _client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            Username = $"tokentest-{TestId}",
            Password = "Test123!"
        });

        var authResponse = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
        _accessToken = authResponse?.Tokens.AccessToken ?? throw new InvalidOperationException("No access token received");
        _client.DefaultRequestHeaders.Authorization = new("Bearer", _accessToken);
    }

    [Test]
    public void AccessToken_ShouldContainCorrectUserId()
    {
        // Arrange
        var handler = new JwtSecurityTokenHandler();
        var token = handler.ReadJwtToken(_accessToken);

        // Act
        var tokenUserId = token.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Sub)?.Value;

        // also use Jwt helper service class
        var jwtService = _factory.Services.GetRequiredService<ITokenService>();
        var userId = jwtService.GetUserIdFromClaims(token.Claims);

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(tokenUserId, Is.Not.Null, "Token should contain a subject (user ID) claim");
            Assert.That(tokenUserId, Is.EqualTo(_userId), "Token user ID should match the registered user's ID");

            Assert.That(jwtService, Is.InstanceOf<JwtTokenService>());
            Assert.That(userId, Is.Not.Null.Or.Empty, "Token service should return a user ID");
            Assert.That(userId, Is.EqualTo(_userId), "Token service user ID should match the registered user's ID");
        });
    }

    [Test]
    public async Task RefreshToken_ShouldMaintainUserId()
    {
        // Arrange
        var loginResponse = await _client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            Username = $"tokentest-{TestId}",
            Password = "Test123!"
        });
        var authResponse = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
        var refreshToken = authResponse?.Tokens.RefreshToken;

        // Act
        var refreshResponse = await _client.PostAsJsonAsync("/api/v1/auth/refresh", new { RefreshToken = refreshToken });
        var refreshResult = await refreshResponse.Content.ReadFromJsonAsync<AuthTokenResponse>();
        var newTokenStr = refreshResult?.AccessToken;
        var newToken = new JwtSecurityTokenHandler()
            .ReadJwtToken(newTokenStr);
        var newTokenUserId = newToken.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Sub)?.Value;

        // also use Jwt helper service class
        var jwtService = _factory.Services.GetRequiredService<ITokenService>();
        var userId = jwtService.GetUserIdFromClaims(newToken.Claims);

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(refreshResponse.StatusCode, Is.EqualTo(HttpStatusCode.OK));
            Assert.That(newTokenUserId, Is.EqualTo(_userId), "User ID should remain the same after token refresh");

            Assert.That(jwtService, Is.InstanceOf<JwtTokenService>());
            Assert.That(userId, Is.Not.Null.Or.Empty, "Token service should return a user ID");
            Assert.That(userId, Is.EqualTo(_userId), "Token service user ID should match the registered user's ID");
        });
    }
}