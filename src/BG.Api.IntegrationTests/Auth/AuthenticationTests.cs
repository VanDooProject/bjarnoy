using System.Net;
using System.Net.Http.Json;
using BG.Api.IntegrationTests.Infrastructure;
using BG.API.Models.Auth;

namespace BG.Api.IntegrationTests.Auth;

public class AuthenticationTests : IntegrationTestBase
{
    [Test]
    public async Task Register_WithValidData_ShouldSucceed()
    {
        // Arrange
        var client = _factory.CreateClient();
        var request = new
        {
            Username = $"test-{TestId}",
            Email = $"test-{TestId}@example.com",
            Password = "Test123!"
        };

        // Act
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", request);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var content = await response.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.Multiple(() =>
        {
            Assert.That(content, Is.Not.Null);
            Assert.That(content!.Tokens.AccessToken, Is.Not.Empty);
            Assert.That(content.Tokens.RefreshToken, Is.Not.Empty);
        });
    }

    [Test]
    public async Task Register_WithDuplicateUsername_ShouldFail()
    {
        // Arrange
        var client = _factory.CreateClient();
        var request = new
        {
            Username = $"test2-{TestId}",
            Email = $"test2-{TestId}@example.com",
            Password = "Test123!"
        };

        // Act
        await client.PostAsJsonAsync("/api/v1/auth/register", request);
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", request);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task Login_WithValidCredentials_ShouldSucceed()
    {
        // Arrange
        var client = _factory.CreateClient();
        var user = new
        {
            Username = $"login-{TestId}",
            Email = $"login-{TestId}@example.com",
            Password = "Test123!"
        };

        await client.PostAsJsonAsync("/api/v1/auth/register", user);

        // Act
        var loginResponse = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            Username = user.Username,
            Password = user.Password
        });

        // Assert
        Assert.That(loginResponse.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var content = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.Multiple(() =>
        {
            Assert.That(content, Is.Not.Null);
            Assert.That(content!.Tokens.AccessToken, Is.Not.Empty);
            Assert.That(content.Tokens.RefreshToken, Is.Not.Empty);
        });
    }

    [Test]
    public async Task Login_WithInvalidPassword_ShouldFail()
    {
        // Arrange
        var client = _factory.CreateClient();
        var user = new
        {
            Username = $"wrong-{TestId}",
            Email = $"wrong-{TestId}@example.com",
            Password = "Test123!"
        };

        await client.PostAsJsonAsync("/api/v1/auth/register", user);

        // Act
        var loginResponse = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            Username = user.Username,
            Password = "WrongPass123!"
        });

        // Assert
        Assert.That(loginResponse.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }

    [Test]
    public async Task Login_WithNonExistentUser_ShouldFail()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var loginResponse = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            Username = "nonexistent",
            Password = "Test123!"
        });

        // Assert
        Assert.That(loginResponse.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }
}