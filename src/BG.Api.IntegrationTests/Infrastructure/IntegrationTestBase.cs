using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using BG.API;
using BG.Core.Services;
using BG.Api.IntegrationTests.Infrastructure.TestServices;

namespace BG.Api.IntegrationTests.Infrastructure;

public class IntegrationTestBase
{
    protected readonly WebApplicationFactory<Program> _factory;

    public IntegrationTestBase()
    {
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureAppConfiguration((context, config) =>
                {
                    config.SetBasePath(Directory.GetCurrentDirectory())
                          .AddJsonFile("appsettings.Testing.json", optional: false);
                });

                builder.ConfigureServices(services =>
                {
                    // Replace services with test implementations
                    ConfigureTestServices(services);
                });

                builder.UseSetting("Environment", "Testing");
            });
    }

    protected virtual void ConfigureTestServices(IServiceCollection services)
    {
        // Override service registrations for testing
        // Example:
        var emailService = new TestEmailService();
        services.AddSingleton(emailService);
        services.AddScoped<IEmailService>(sp => emailService);
    }

    [OneTimeTearDown]
    public void TearDown()
    {
        _factory.Dispose();
    }
}