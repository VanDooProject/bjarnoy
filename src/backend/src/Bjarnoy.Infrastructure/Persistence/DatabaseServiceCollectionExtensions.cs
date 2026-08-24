using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

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
        ValidateConnectionString(options.Provider, connectionString);

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

    /// <summary>
    /// Picks the connection string for the configured provider.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <c>ConnectionStrings:gamedb</c> wins over
    /// <c>Database:ConnectionString</c>. That order matters: the named
    /// connection string is what an orchestrator actually wired up for this
    /// process (Aspire injects it from <c>WithReference(gamedb)</c>, a
    /// deployment from its own secret store), whereas
    /// <c>Database:ConnectionString</c> is a static convenience for running the
    /// API on its own.
    /// </para>
    /// <para>
    /// The other way round, a value baked into appsettings silently outranked
    /// the live one: <c>appsettings.Development.json</c> names a SQLite file,
    /// the AppHost overrides only <c>Database__Provider</c> to PostgreSql, and
    /// Npgsql was then handed <c>Data Source=bjarnoy.dev.db</c> and failed deep
    /// inside its connection-string parser.
    /// </para>
    /// </remarks>
    private static string ResolveConnectionString(IConfiguration configuration, DatabaseOptions options)
    {
        var fromConnectionStrings = configuration.GetConnectionString(ConnectionName);
        if (!string.IsNullOrWhiteSpace(fromConnectionStrings))
        {
            return fromConnectionStrings;
        }

        if (!string.IsNullOrWhiteSpace(options.ConnectionString))
        {
            return options.ConnectionString;
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

    /// <summary>
    /// Checks the connection string against the provider that will parse it, so
    /// a mismatch is reported here rather than surfacing later as a driver
    /// error with no mention of configuration.
    /// </summary>
    /// <remarks>
    /// Provider and connection string are two settings that have to agree, and
    /// either can be overridden on its own by an environment variable. When
    /// they disagreed the failure was Npgsql's
    /// <c>Couldn't set data source (Parameter 'data source')</c> — thrown from
    /// the migrator at startup, naming neither the provider nor the setting
    /// that was wrong.
    /// </remarks>
    private static void ValidateConnectionString(DatabaseProvider provider, string connectionString)
    {
        try
        {
            switch (provider)
            {
                case DatabaseProvider.PostgreSql:
                    _ = new NpgsqlConnectionStringBuilder(connectionString);
                    break;

                case DatabaseProvider.Sqlite:
                    _ = new SqliteConnectionStringBuilder(connectionString);
                    break;

                default:
                    throw new InvalidOperationException(
                        $"Unsupported database provider '{provider}'.");
            }
        }
        catch (Exception ex) when (ex is ArgumentException or FormatException)
        {
            // Deliberately does not include the connection string itself, which
            // routinely carries a password.
            throw new InvalidOperationException(
                $"The connection string is not valid for provider '{provider}'. "
                + $"Check that {DatabaseOptions.SectionName}:Provider matches whichever of "
                + $"ConnectionStrings:{ConnectionName} or {DatabaseOptions.SectionName}:ConnectionString "
                + "is in effect — a SQLite 'Data Source=...' string and a PostgreSQL "
                + "'Host=...' string are not interchangeable.",
                ex);
        }
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
