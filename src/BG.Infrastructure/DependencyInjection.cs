using BG.Core.Interfaces.Repositories;
using BG.Infrastructure.Data;
using BG.Infrastructure.Data.TypeHandlers;
using BG.Core.ValueObjects;
using Dapper;
using BG.Core.Services;
using BG.Infrastructure.Services;
using BG.Infrastructure.Repositories.PostgreSQL;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using BG.Core.Settings;

namespace BG.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // Configure Dapper type handlers
        SqlMapper.RemoveTypeMap(typeof(EntityId));
        SqlMapper.AddTypeHandler(new EntityIdTypeHandler());

        services.AddPostgreSql(configuration);
        services.AddScoped<IUnitOfWork, PostgreSqlUnitOfWork>();

        // Register repositories
        services.AddScoped<IUserRepository, PostgreSqlUserRepository>();
        services.AddScoped<IWorldRepository, PostgreSqlWorldRepository>();
        services.AddScoped<IPlayerRepository, PostgreSqlPlayerRepository>();
        services.AddScoped<IRefreshTokenRepository, PostgreSqlRefreshTokenRepository>();
        services.AddScoped<IEmailVerificationRepository, PostgreSqlEmailVerificationRepository>();

        // Register services
        services.AddScoped<IPasswordService, BCryptPasswordService>();
        // Register settings
        var authSettings = configuration.GetSection(AuthSettings.ConfigurationSection).Get<AuthSettings>() ?? new AuthSettings();
        services.AddSingleton(authSettings);

        services.AddScoped<ITokenService, JwtTokenService>();

        return services;
    }
}