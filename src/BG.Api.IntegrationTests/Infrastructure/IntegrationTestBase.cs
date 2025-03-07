using Microsoft.AspNetCore.Mvc.Testing;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using BG.API;
using BG.Core.Services;
using BG.Core.Interfaces.Repositories;
using BG.Api.IntegrationTests.Infrastructure.TestServices;

namespace BG.Api.IntegrationTests.Infrastructure;

public class IntegrationTestBase
{
    protected readonly WebApplicationFactory<Program> _factory;
    protected static JsonSerializerOptions StrictJsonOptions => new()
    {
        //PropertyNameCaseInsensitive = false,
        PropertyNameCaseInsensitive = true,
        //DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        //ReferenceHandler = ReferenceHandler.IgnoreCycles,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    protected string TestId { get; private set; }
    
    protected HttpClient CreateClientWithStrictJson()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Accept.Add(
            new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/json"));
        return client;
    }


    public IntegrationTestBase()
    {

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                // builder.ConfigureAppConfiguration((context, config) =>
                // {
                //     config.SetBasePath(Directory.GetCurrentDirectory())
                //           .AddJsonFile("appsettings.Testing.json", optional: false)
                //           .AddEnvironmentVariables() // so testing does not overwrite them
                //           ;
                // });

                builder.ConfigureServices(services =>
                {
                    // Replace services with test implementations
                    ConfigureTestServices(services);
                });

                builder.UseSetting("Environment", "Testing");
            });
    }

    [SetUp]
    public void SetUp()
    {
        TestId = Guid.CreateVersion7().ToString("N");
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
            var descriptor = services.Single(d => d.ServiceType == typeof(IUserRepository));
            if (descriptor != null)
            {
                services.Remove(descriptor);
                var userRepository = new TestUserRepository();
                services.AddScoped<IUserRepository>(sp => userRepository);
            }
            
            descriptor = services.Single(d => d.ServiceType == typeof(IWorldRepository));
            if (descriptor != null)
            {
                services.Remove(descriptor);
                services.AddScoped<IWorldRepository>(sp => new TestWorldRepository());
            }

            descriptor = services.Single(d => d.ServiceType == typeof(IPlayerRepository));
            if (descriptor != null)
            {
                services.Remove(descriptor);
                services.AddScoped<IPlayerRepository>(sp => new TestPlayerRepository());
            }
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