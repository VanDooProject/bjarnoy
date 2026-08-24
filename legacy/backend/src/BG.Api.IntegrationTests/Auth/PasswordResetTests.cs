using System.Net;
using System.Net.Http.Json;
using BG.Api.IntegrationTests.Infrastructure;
using BG.Api.IntegrationTests.Infrastructure.TestServices;
using BG.Core.Services;
using Microsoft.Extensions.DependencyInjection;

namespace BG.Api.IntegrationTests.Auth;

public class PasswordResetTests : IntegrationTestBase
{
    private readonly TestEmailService _emailService;

    public PasswordResetTests()
    {
        _emailService = new TestEmailService();
    }

    protected override void ConfigureTestServices(IServiceCollection services)
    {
        services.AddSingleton<IEmailService>(_emailService);
    }

    [Test]
    public async Task RequestPasswordReset_WithValidEmail_ShouldSendEmail()
    {
        // Arrange
        var client = _factory.CreateClient();
        var user = new
        {
            Username = "resettest",
            Email = "reset@example.com",
            Password = "Test123!"
        };

        await client.PostAsJsonAsync("/api/v1/auth/register", user);

        // Act
        var response = await client.PostAsJsonAsync("/api/v1/auth/request-password-reset", new
        {
            Email = user.Email
        });

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var resetToken = _emailService.GetLastResetToken(user.Email);
        Assert.That(resetToken, Is.Not.Null);
    }

    [Test]
    public async Task RequestPasswordReset_WithInvalidEmail_ShouldReturnOk()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var response = await client.PostAsJsonAsync("/api/v1/auth/request-password-reset", new
        {
            Email = "nonexistent@example.com"
        });

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    [Test]
    public async Task ResetPassword_WithValidToken_ShouldAllowLogin()
    {
        // Arrange
        var client = _factory.CreateClient();
        var user = new
        {
            Username = "resettest2",
            Email = "reset2@example.com",
            Password = "Test123!"
        };

        await client.PostAsJsonAsync("/api/v1/auth/register", user);
        // TODO does this work since account is not yet activated??
        await client.PostAsJsonAsync("/api/v1/auth/request-password-reset", new { Email = user.Email });
        var resetToken = _emailService.GetLastResetToken(user.Email);

        // Act
        var resetResponse = await client.PostAsJsonAsync("/api/v1/auth/reset-password", new
        {
            Token = resetToken,
            NewPassword = "NewTest123!"
        });

        // Assert
        Assert.That(resetResponse.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        // Verify old password doesn't work
        var oldLoginResponse = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            Username = user.Username,
            Password = user.Password
        });
        Assert.That(oldLoginResponse.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));

        // Verify new password works
        var newLoginResponse = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            Username = user.Username,
            Password = "NewTest123!"
        });
        Assert.That(newLoginResponse.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    [Test]
    public async Task ResetPassword_WithInvalidToken_ShouldFail()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var response = await client.PostAsJsonAsync("/api/v1/auth/reset-password", new
        {
            Token = "invalid-token",
            NewPassword = "NewTest123!"
        });

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [OneTimeTearDown]
    public new void TearDown()
    {
        _emailService.Clear();
        base.TearDown();
    }
}