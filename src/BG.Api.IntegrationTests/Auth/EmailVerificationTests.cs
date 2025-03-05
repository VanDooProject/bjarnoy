using System.Net;
using System.Net.Http.Json;
using BG.Api.IntegrationTests.Infrastructure;
using BG.Api.IntegrationTests.Infrastructure.TestServices;
using BG.Core.Services;
using Microsoft.Extensions.DependencyInjection;

namespace BG.Api.IntegrationTests.Auth;

public class EmailVerificationTests : IntegrationTestBase
{
    private readonly TestEmailService _emailService;

    public EmailVerificationTests()
    {
        _emailService = new TestEmailService();
    }

    protected override void ConfigureTestServices(IServiceCollection services)
    {
        services.AddSingleton<IEmailService>(_emailService);
    }

    [Test]
    public async Task VerifyEmail_WithValidToken_ShouldSucceed()
    {
        // Arrange
        var client = _factory.CreateClient();
        var user = new
        {
            Username = $"verify-{TestId}",
            Email = $"verify-{TestId}@example.com",
            Password = "Test123!"
        };

        var registerResponse = await client.PostAsJsonAsync("/api/v1/auth/register", user);
        Assert.That(registerResponse.StatusCode, Is.EqualTo(HttpStatusCode.OK), $"Registration failed: {registerResponse.ReasonPhrase}");
        var token = _emailService.GetLastVerificationToken(user.Email);
        Assert.That(token, Is.Not.Null, "Verification token not found");

        // Act
        var response = await client.PostAsJsonAsync("/api/v1/auth/verify-email", new { Token = token });

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    [Test]
    public async Task VerifyEmail_WithInvalidToken_ShouldFail()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var response = await client.PostAsJsonAsync("/api/v1/auth/verify-email", new { Token = "invalid" });

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