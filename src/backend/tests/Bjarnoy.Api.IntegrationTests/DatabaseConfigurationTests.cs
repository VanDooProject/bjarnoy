using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// How the provider and the connection string are resolved from configuration.
/// </summary>
/// <remarks>
/// These exist because the two settings have to agree and either can be
/// overridden on its own. Under Aspire that went wrong exactly once:
/// appsettings.Development.json named a SQLite file, the AppHost overrode only
/// <c>Database__Provider</c> to PostgreSql, and the API died at startup inside
/// Npgsql's connection-string parser.
/// </remarks>
public class DatabaseConfigurationTests
{
    private const string PostgresConnectionString =
        "Host=localhost;Port=5432;Database=gamedb;Username=postgres;Password=secret";

    private const string SqliteConnectionString = "Data Source=bjarnoy.dev.db";

    private static ServiceProvider Build(Dictionary<string, string?> settings)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddGameDatabase(configuration);
        return services.BuildServiceProvider();
    }

    private static (string Provider, string ConnectionString) ResolvedBy(ServiceProvider provider)
    {
        using var scope = provider.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<GameDbContext>().Database;
        return (database.ProviderName!, database.GetConnectionString()!);
    }

    [Fact]
    public void The_orchestrators_connection_string_wins_over_the_one_baked_into_appsettings()
    {
        // Exactly the Aspire case: a SQLite string sitting in appsettings, a
        // provider override from the environment, and the real connection
        // string injected as ConnectionStrings:gamedb.
        using var provider = Build(new Dictionary<string, string?>
        {
            ["Database:Provider"] = "PostgreSql",
            ["Database:ConnectionString"] = SqliteConnectionString,
            [$"ConnectionStrings:{DatabaseServiceCollectionExtensions.ConnectionName}"] =
                PostgresConnectionString,
        });

        var (providerName, connectionString) = ResolvedBy(provider);

        Assert.Equal("Npgsql.EntityFrameworkCore.PostgreSQL", providerName);

        // Asserting the connection string, not just the provider, is the whole
        // point: with the old precedence the provider was still PostgreSql and
        // it was the connection string that came from the wrong place.
        Assert.Contains("Host=localhost", connectionString, StringComparison.Ordinal);
        Assert.DoesNotContain("Data Source", connectionString, StringComparison.Ordinal);
    }

    [Fact]
    public void The_appsettings_connection_string_is_used_when_nothing_was_injected()
    {
        // Standalone `dotnet run`: no orchestrator, so the local convenience
        // setting is still what configures the database.
        using var provider = Build(new Dictionary<string, string?>
        {
            ["Database:Provider"] = "Sqlite",
            ["Database:ConnectionString"] = SqliteConnectionString,
        });

        var (providerName, connectionString) = ResolvedBy(provider);

        Assert.Equal("Microsoft.EntityFrameworkCore.Sqlite", providerName);
        Assert.Contains("bjarnoy.dev.db", connectionString, StringComparison.Ordinal);
    }

    [Fact]
    public void PostgreSql_can_run_from_Database_connection_string_without_the_named_one()
    {
        // AppHost also exports Database__ConnectionString explicitly, so the API
        // still starts even if the named connection string is not present.
        using var provider = Build(new Dictionary<string, string?>
        {
            ["Database:Provider"] = "PostgreSql",
            ["Database:ConnectionString"] = PostgresConnectionString,
        });

        var (providerName, connectionString) = ResolvedBy(provider);

        Assert.Equal("Npgsql.EntityFrameworkCore.PostgreSQL", providerName);
        Assert.Contains("Host=localhost", connectionString, StringComparison.Ordinal);
    }

    [Fact]
    public void Sqlite_needs_no_configuration_at_all()
    {
        using var provider = Build([]);

        var (providerName, connectionString) = ResolvedBy(provider);

        Assert.Equal("Microsoft.EntityFrameworkCore.Sqlite", providerName);
        Assert.Contains("bjarnoy.db", connectionString, StringComparison.Ordinal);
    }

    [Fact]
    public void PostgreSql_without_a_connection_string_says_which_settings_to_set()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => Build(new Dictionary<string, string?>
        {
            ["Database:Provider"] = "PostgreSql",
        }));

        Assert.Contains("ConnectionStrings:gamedb", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void A_sqlite_connection_string_under_the_postgresql_provider_fails_with_a_usable_message()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => Build(new Dictionary<string, string?>
        {
            ["Database:Provider"] = "PostgreSql",
            [$"ConnectionStrings:{DatabaseServiceCollectionExtensions.ConnectionName}"] =
                SqliteConnectionString,
        }));

        // The failure this replaces was Npgsql's "Couldn't set data source
        // (Parameter 'data source')", thrown from the migrator, naming neither
        // the provider nor the setting at fault.
        Assert.Contains("Database:Provider", ex.Message, StringComparison.Ordinal);
        Assert.Contains("PostgreSql", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void The_failure_message_never_repeats_the_connection_string()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => Build(new Dictionary<string, string?>
        {
            ["Database:Provider"] = "Sqlite",
            [$"ConnectionStrings:{DatabaseServiceCollectionExtensions.ConnectionName}"] =
                "Host=localhost;Username=postgres;Password=hunter2;Timeout=notanumber",
        }));

        // Connection strings carry passwords; a startup error routinely ends up
        // in a log aggregator.
        Assert.DoesNotContain("hunter2", ex.Message, StringComparison.Ordinal);
        Assert.DoesNotContain("hunter2", ex.ToString(), StringComparison.Ordinal);
    }
}
