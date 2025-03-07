using System.Net;
using System.Net.Http.Json;
using BG.Api.IntegrationTests.Infrastructure;
using BG.Api.IntegrationTests.Infrastructure.TestServices;
using BG.Core.Services;
using BG.Core.Settings;
using BG.Core.Models.Enums;
using BG.Core.Interfaces.Repositories;
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
        base.ConfigureTestServices(services);

        // Configure email service
        var descriptor = services.Single(d => d.ServiceType == typeof(IEmailService));
        services.Remove(descriptor);
        services.AddSingleton<IEmailService>(_emailService);
        
        // Configure auth settings
        descriptor = services.Single(d => d.ServiceType == typeof(AuthSettings));
        services.Remove(descriptor);
        services.AddSingleton(new AuthSettings { SkipEmailVerification = false });
    }

    [Test]
    public async Task VerifyEmail_WithValidToken_ShouldSucceed()
    {
        // Arrange
        var client = CreateClientWithStrictJson();
        var user = new
        {
            Username = $"verify-{TestId}",
            Email = $"verify-{TestId}@example.com",
            Password = "Test123!"
        };

        var registerResponse = await client.PostAsJsonAsync("/api/v1/auth/register", user, StrictJsonOptions);
        Assert.That(registerResponse.StatusCode, Is.EqualTo(HttpStatusCode.OK), $"Registration failed: {registerResponse.ReasonPhrase}");

        // TODO add polly retry since we actually could be too fast here; is this really a thing? we use transactions (TODO check if we actually use transactions)
        var token = _emailService.GetLastVerificationToken(user.Email);
        Assert.That(token, Is.Not.Null, "Verification token not found");

        // Act
        var response = await client.PostAsJsonAsync("/api/v1/auth/verify-email", new { Token = token }, StrictJsonOptions);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
    }

    [Test]
    public async Task VerifyEmail_WithInvalidToken_ShouldFail()
    {
        // Arrange
        var client = CreateClientWithStrictJson();

        // Act
        var response = await client.PostAsJsonAsync("/api/v1/auth/verify-email", new { Token = "invalid" }, StrictJsonOptions);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task Register_WithSkipVerificationEnabled_ShouldCreateActiveUser()
    {
        // Arrange
        var client = CreateClientWithStrictJson();
        var user = new
        {
            Username = $"active-{TestId}",
            Email = $"active-{TestId}@example.com",
            Password = "Test123!"
        };

        using (var scope = _factory.Services.CreateScope())
        {
            var authSettings = scope.ServiceProvider.GetRequiredService<AuthSettings>();
            authSettings.SkipEmailVerification = true;
        }

        // Act
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", user, StrictJsonOptions);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        using (var scope = _factory.Services.CreateScope())
        {
            var userRepo = scope.ServiceProvider.GetRequiredService<IUserRepository>();
            var createdUser = await userRepo.GetByEmailAsync(user.Email);
            Assert.That(createdUser, Is.Not.Null);
            Assert.That(createdUser!.Status, Is.EqualTo(UserStatus.Active));
            Assert.That(_emailService.GetLastVerificationToken(user.Email), Is.Null);
        }
    }

    [Test]
    public async Task Register_WithSkipVerificationDisabled_ShouldCreateUnconfirmedUser()
    {
        // Arrange
        var client = CreateClientWithStrictJson();
        var user = new
        {
            Username = $"unconfirmed-{TestId}",
            Email = $"unconfirmed-{TestId}@example.com",
            Password = "Test123!"
        };

        using (var scope = _factory.Services.CreateScope())
        {
            var authSettings = scope.ServiceProvider.GetRequiredService<AuthSettings>();
            authSettings.SkipEmailVerification = false;
        }

        // Act
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", user, StrictJsonOptions);

        // Assert
        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        using (var scope = _factory.Services.CreateScope())
        {
            var userRepo = scope.ServiceProvider.GetRequiredService<IUserRepository>();
            var createdUser = await userRepo.GetByEmailAsync(user.Email);
            Assert.That(createdUser, Is.Not.Null);
            Assert.That(createdUser!.Status, Is.EqualTo(UserStatus.Unconfirmed));
            Assert.That(_emailService.GetLastVerificationToken(user.Email), Is.Not.Null);
        }
    }

    [OneTimeTearDown]
    public new void TearDown()
    {
        _emailService.Clear();
        base.TearDown();
    }
}