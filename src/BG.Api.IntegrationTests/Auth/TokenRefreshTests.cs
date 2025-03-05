using System.Net;
using System.Net.Http.Json;
using BG.API.Models.Auth;
using BG.Api.IntegrationTests.Infrastructure;

namespace BG.Api.IntegrationTests.Auth;

public class TokenRefreshTests : IntegrationTestBase
{
    private HttpClient? _client;
    private string _refreshToken = string.Empty;
    private const string Username = "refreshtest";
    private const string Password = "Test123!";

    [SetUp]
    public async Task Setup()
    {
        _client = _factory.CreateClient();

        // Register and login to get initial tokens
        await _client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            Username,
            Email = "refresh@example.com",
            Password
        });

        var loginResponse = await _client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            Username,
            Password
        });

        var authResponse = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
        _refreshToken = authResponse?.Tokens.RefreshToken ?? throw new InvalidOperationException("No refresh token received");
    }

    [TearDown]
    public void Cleanup()
    {
        _client?.Dispose();
    }

    [Test]
    public async Task RefreshToken_WithValidToken_ShouldReturnNewTokens()
    {
        // Act
        var response = await _client!.PostAsJsonAsync("/api/v1/auth/refresh", new
        {
            RefreshToken = _refreshToken
        });

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var newTokens = await response.Content.ReadFromJsonAsync<AuthTokenResponse>();
        Assert.Multiple(() =>
        {
            Assert.That(newTokens, Is.Not.Null);
            Assert.That(newTokens!.AccessToken, Is.Not.Empty.Or.Null);
            Assert.That(newTokens.RefreshToken, Is.Not.Empty.Or.Null);
            Assert.That(newTokens.RefreshToken, Is.Not.EqualTo(_refreshToken));
        });
    }

    [Test]
    public async Task RefreshToken_WithInvalidToken_ShouldFail()
    {
        // Act
        var response = await _client!.PostAsJsonAsync("/api/v1/auth/refresh", new
        {
            RefreshToken = "invalid-token"
        });

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }

    [Test]
    public async Task RefreshToken_WhenRevokedAfterUse_ShouldFail()
    {
        // Act - First refresh
        var firstResponse = await _client!.PostAsJsonAsync("/api/v1/auth/refresh", new
        {
            RefreshToken = _refreshToken
        });
        
        // Act - Second refresh with same token
        var secondResponse = await _client!.PostAsJsonAsync("/api/v1/auth/refresh", new
        {
            RefreshToken = _refreshToken
        });

        // Assert
        Assert.Multiple(() =>
        {
            Assert.That(firstResponse.StatusCode, Is.EqualTo(HttpStatusCode.OK));
            Assert.That(secondResponse.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
        });
    }
}