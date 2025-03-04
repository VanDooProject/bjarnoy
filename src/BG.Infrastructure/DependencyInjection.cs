using BG.Core.Interfaces.Repositories;
using BG.Infrastructure.Data;
using BG.Infrastructure.Repositories.PostgreSQL;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BG.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // Configure PostgreSQL
        services.Configure<PostgreSqlSettings>(configuration.GetSection("PostgreSQL"));
        services.AddPostgreSql(configuration);
        services.AddScoped<IUnitOfWork, PostgreSqlUnitOfWork>();

        // Register repositories
        services.AddScoped<IUserRepository, PostgreSqlUserRepository>();
        services.AddScoped<IWorldRepository, PostgreSqlWorldRepository>();
        services.AddScoped<IPlayerRepository, PostgreSqlPlayerRepository>();
        services.AddScoped<IRefreshTokenRepository, PostgreSqlRefreshTokenRepository>();

        return services;
    }
}