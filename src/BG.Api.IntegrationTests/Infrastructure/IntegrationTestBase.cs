using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using BG.API;
using BG.Core.Services;
using BG.Core.Interfaces.Repositories;
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
        var configuration = services.BuildServiceProvider()
            .GetRequiredService<IConfiguration>();
        
        services.Configure<TestSettings>(configuration.GetSection(TestSettings.ConfigurationKey));
        var testSettings = configuration.GetSection(TestSettings.ConfigurationKey).Get<TestSettings>() ?? new TestSettings();
        
        var useMockServices = testSettings.UseMockServices;
        var useTestEmailService = testSettings.UseTestEmailService;

        if (useMockServices)
        {
            var descriptor = services.FirstOrDefault(d => d.ServiceType == typeof(IUserRepository));
            if (descriptor != null)
            {
                services.Remove(descriptor);
                var userRepository = new TestUserRepository();
                services.AddScoped<IUserRepository>(sp => userRepository);
            }
            
            descriptor = services.FirstOrDefault(d => d.ServiceType == typeof(IWorldRepository));
            if (descriptor != null)
                services.Remove(descriptor);
            
            descriptor = services.FirstOrDefault(d => d.ServiceType == typeof(IPlayerRepository));
            if (descriptor != null)
                services.Remove(descriptor);
        }

        if (useTestEmailService)
        {
            var emailService = new TestEmailService();
            services.AddSingleton<IEmailService>(emailService);
        }
    }

    [OneTimeTearDown]
    public void TearDown()
    {
        _factory.Dispose();
    }
}