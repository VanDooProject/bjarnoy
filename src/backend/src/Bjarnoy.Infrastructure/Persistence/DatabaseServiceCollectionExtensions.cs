using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Infrastructure.Persistence;

public static class DatabaseServiceCollectionExtensions
{
    /// <summary>Name of the connection string Aspire wires up for the database.</summary>
    public const string ConnectionName = "gamedb";

    /// <summary>
    /// Registers <see cref="GameDbContext"/> against the configured provider,
    /// along with the migrator.
    /// </summary>
    /// <remarks>
    /// EF Core migrations are provider-specific SQL, so each provider gets its
    /// own migrations assembly and this is the one place that maps between them.
    /// </remarks>
    public static IServiceCollection AddGameDatabase(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        services.AddOptions<DatabaseOptions>()
            .Bind(configuration.GetSection(DatabaseOptions.SectionName))
            .ValidateOnStart();

        var options = configuration.GetSection(DatabaseOptions.SectionName).Get<DatabaseOptions>()
            ?? new DatabaseOptions();
        var connectionString = ResolveConnectionString(configuration, options);

        services.AddDbContext<GameDbContext>(builder =>
        {
            switch (options.Provider)
            {
                case DatabaseProvider.PostgreSql:
                    builder.UseNpgsql(connectionString, npgsql =>
                        npgsql.MigrationsAssembly(MigrationAssemblies.PostgreSql));
                    break;

                case DatabaseProvider.Sqlite:
                    builder.UseSqlite(connectionString, sqlite =>
                        sqlite.MigrationsAssembly(MigrationAssemblies.Sqlite));
                    break;

                default:
                    throw new InvalidOperationException(
                        $"Unsupported database provider '{options.Provider}'.");
            }
        });

        services.AddScoped<DatabaseMigrator>();

        return services;
    }

    private static string ResolveConnectionString(IConfiguration configuration, DatabaseOptions options)
    {
        if (!string.IsNullOrWhiteSpace(options.ConnectionString))
        {
            return options.ConnectionString;
        }

        var fromConnectionStrings = configuration.GetConnectionString(ConnectionName);
        if (!string.IsNullOrWhiteSpace(fromConnectionStrings))
        {
            return fromConnectionStrings;
        }

        if (options.Provider == DatabaseProvider.Sqlite)
        {
            // A single-container deployment should not need configuring to run.
            return "Data Source=bjarnoy.db";
        }

        throw new InvalidOperationException(
            $"No connection string for provider '{options.Provider}'. Set " +
            $"ConnectionStrings:{ConnectionName} or {DatabaseOptions.SectionName}:ConnectionString.");
    }
}

/// <summary>
/// Assembly names of the provider-specific migration projects. Referenced by
/// name rather than by type so the API does not have to reference both.
/// </summary>
public static class MigrationAssemblies
{
    public const string PostgreSql = "Bjarnoy.Migrations.PostgreSql";
    public const string Sqlite = "Bjarnoy.Migrations.Sqlite";
}
