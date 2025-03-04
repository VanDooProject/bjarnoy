using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BG.Infrastructure.Data;

public static class DbServiceCollectionExtensions
{
    /// <summary>
    /// Adds PostgreSQL database services with connection pooling.
    /// Registers PostgreSqlConnectionService as a singleton to maintain the connection pool
    /// throughout the application lifecycle.
    /// </summary>
    public static IServiceCollection AddPostgreSql(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<PostgreSqlSettings>(configuration.GetSection("PostgreSQL"));
        services.AddSingleton<PostgreSqlConnectionService>();

        return services;
    }
}