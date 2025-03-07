using System.Net;
using System.Net.Http.Json;
using BG.Api.IntegrationTests.Infrastructure;
using BG.API.Models.Auth;

namespace BG.Api.IntegrationTests.Auth;

public class AuthenticationTests : IntegrationTestBase
{
    [Test]
    public async Task Register_WithMissingProperty_ShouldFail()
    {
        // Arrange
        var client = CreateClientWithStrictJson();
        // TODO do not allow anonymous objects for (current version) api requests (since we actually have a model for this)
        var request = new { Username = $"test-{TestId}", Email = $"test-{TestId}@example.com" }; // Missing Password

        // Act
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", request, StrictJsonOptions);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task Register_WithValidData_ShouldSucceed()
    {
        // Arrange
        var client = CreateClientWithStrictJson();
        var request = new RegisterRequest(
            $"test-{TestId}",
            $"test-{TestId}@example.com",
            "Test123!"
        );

        // Act
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", request, StrictJsonOptions);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var content = await response.Content.ReadFromJsonAsync<AuthResponse>(StrictJsonOptions);
        Assert.Multiple(() =>
        {
            Assert.That(content, Is.Not.Null);
            Assert.That(content!.Tokens, Is.Not.Null);
            Assert.That(content!.Tokens!.AccessToken, Is.Not.Null.Or.Empty);
            Assert.That(content.Tokens.RefreshToken, Is.Not.Null.Or.Empty);
        });
    }

    [Test]
    public async Task Register_WithDuplicateUsername_ShouldFail()
    {
        // Arrange
        var client = CreateClientWithStrictJson();
        var request = new
        {
            Username = $"test2-{TestId}",
            Email = $"test2-{TestId}@example.com",
            Password = "Test123!"
        };

        // Act
        await client.PostAsJsonAsync("/api/v1/auth/register", request, StrictJsonOptions);
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", request, StrictJsonOptions);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task Login_WithValidCredentials_ShouldSucceed()
    {
        // Arrange
        var client = CreateClientWithStrictJson();
        var user = new
        {
            Username = $"login-{TestId}",
            Email = $"login-{TestId}@example.com",
            Password = "Test123!"
        };

        await client.PostAsJsonAsync("/api/v1/auth/register", user, StrictJsonOptions);

        // Act
        var loginResponse = await client.PostAsJsonAsync("/api/v1/auth/login",
            new LoginRequest(user.Username, user.Password), StrictJsonOptions);

        // Assert
        Assert.That(loginResponse.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var content = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>(StrictJsonOptions);
        Assert.Multiple(() =>
        {
            Assert.That(content, Is.Not.Null);
            Assert.That(content!.Tokens, Is.Not.Null);
            Assert.That(content!.Tokens.AccessToken, Is.Not.Null.Or.Empty);
            Assert.That(content.Tokens.RefreshToken, Is.Not.Null.Or.Empty);
        });
    }

    [Test]
    public async Task Login_WithInvalidPassword_ShouldFail()
    {
        // Arrange
        var client = CreateClientWithStrictJson();
        var user = new
        {
            Username = $"wrong-{TestId}",
            Email = $"wrong-{TestId}@example.com",
            Password = "Test123!"
        };

        await client.PostAsJsonAsync("/api/v1/auth/register", user, StrictJsonOptions);

        // Act
        var loginResponse = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            Username = user.Username,
            Password = "WrongPass123!"
        }, StrictJsonOptions);

        // Assert
        Assert.That(loginResponse.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }

    [Test]
    public async Task Login_WithNonExistentUser_ShouldFail()
    {
        // Arrange
        var client = CreateClientWithStrictJson();

        // Act
        var loginResponse = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            Username = "nonexistent",
            Password = "Test123!"
        }, StrictJsonOptions);

        // Assert
        Assert.That(loginResponse.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }
}