using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using BG.API;

namespace BG.Api.IntegrationTests.Infrastructure;

public class IntegrationTestBase
{
    protected readonly WebApplicationFactory<Program> _factory;

    public IntegrationTestBase()
    {
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
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
        // services.AddScoped<IEmailService, TestEmailService>();
    }

    [OneTimeTearDown]
    public void TearDown()
    {
        _factory.Dispose();
    }
}