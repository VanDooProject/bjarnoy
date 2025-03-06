using System.Net;
using System.Net.Http.Json;
using BG.Api.IntegrationTests.Infrastructure;
using BG.Core.Models;
using BG.Core.Interfaces.Repositories;
using Microsoft.Extensions.DependencyInjection;
using BG.API.Models.Auth;

namespace BG.Api.IntegrationTests.Auth;

public class LogoutTests : IntegrationTestBase
{
    private HttpClient _client = null!;
    private string _accessToken = string.Empty;
    private string _refreshToken = string.Empty;
    private string _userId = string.Empty;

    [SetUp]
    public async Task Setup()
    {
        _client = _factory?.CreateClient() ?? throw new InvalidOperationException("Test factory is not initialized");

        // Register a new user
        var registerResponse = await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            Username = $"logouttest-{TestId}",
            Email = $"logouttest-{TestId}@example.com",
            Password = "Test123!"
        });

        // Activate user
        var userRepo = _factory.Services.GetRequiredService<IUserRepository>();
        var user = await userRepo.GetByUsernameAsync($"logouttest-{TestId}");
        user!.UpdateStatus(Core.Models.Enums.UserStatus.Active);
        await userRepo.UpdateAsync(user);

        // Login to get tokens
        var loginResponse = await _client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            Username = $"logouttest-{TestId}",
            Password = "Test123!"
        });

        var authResponse = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
        _accessToken = authResponse?.Tokens.AccessToken ?? throw new InvalidOperationException("No access token received");
        _refreshToken = authResponse?.Tokens.RefreshToken ?? throw new InvalidOperationException("No refresh token received");
        _userId = user.Id.ToString();

        _client.DefaultRequestHeaders.Authorization = new("Bearer", _accessToken);
    }

    [Test]
    public async Task Logout_WithValidToken_ShouldInvalidateRefreshToken()
    {
        // Arrange
        var refreshRequest = new { RefreshToken = _refreshToken }; // both endpoints expect the sane JSON object

        // Act
        var logoutResponse = await _client.PostAsJsonAsync("/api/v1/auth/logout", refreshRequest);
        var refreshResponse = await _client.PostAsJsonAsync("/api/v1/auth/refresh", refreshRequest);

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(logoutResponse.StatusCode, Is.EqualTo(HttpStatusCode.OK));
            Assert.That(refreshResponse.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
        });
    }

    [Test]
    // ignore since there is no profile endpoint yet
    [Ignore("Profile endpoint not implemented yet")]
    public async Task Logout_AndThenCallProtectedEndpoint_ShouldReturnUnauthorized()
    {
        // Act - Logout
        await _client.PostAsync("/api/v1/auth/logout", null);
        _client.DefaultRequestHeaders.Authorization = new("Bearer", _accessToken);

        // Act - Try to access protected endpoint
        var protectedResponse = await _client.GetAsync("/api/v1/auth/profile");

        // Assert
        Assert.That(protectedResponse.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }

    [Test]
    // ignore since there is no profile endpoint yet
    [Ignore("Profile endpoint not implemented yet")]
    public async Task Profile_WithInvalidToken_ShouldReturnUnauthorized()
    {
        // Arrange
        _client.DefaultRequestHeaders.Authorization = new("Bearer", "invalid-token");

        // Act
        var response = await _client.GetAsync("/api/v1/auth/profile");

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }
}