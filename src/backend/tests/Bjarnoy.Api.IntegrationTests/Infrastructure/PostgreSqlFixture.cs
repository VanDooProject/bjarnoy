using DotNet.Testcontainers.Builders;
using Npgsql;
using Testcontainers.PostgreSql;

namespace Bjarnoy.Api.IntegrationTests.Infrastructure;

/// <summary>
/// A throwaway PostgreSQL database for the tests that must run against the
/// production provider — a container by default, or a scratch database on an
/// already-running server when <see cref="ExternalServerVariable"/> is set.
/// </summary>
/// <remarks>
/// SQLite covers the endpoints; this covers the things only PostgreSQL can
/// answer — that the PostgreSQL migration set applies cleanly, and that the
/// model behaves the same on both dialects.
/// </remarks>
public sealed class PostgreSqlFixture : IAsyncLifetime
{
    /// <summary>
    /// Connection string of an existing PostgreSQL server to use instead of a
    /// container, for machines that have PostgreSQL but no usable Docker (e.g.
    /// a sandbox whose egress blocks image pulls). The login needs
    /// <c>CREATEDB</c>: each run creates its own uniquely named database there
    /// and drops it afterwards, so the server's other databases — and the
    /// database named in the connection string — are never touched.
    /// </summary>
    public const string ExternalServerVariable = "BJARNOY_TEST_POSTGRES";

    private PostgreSqlContainer? _container;

    private string? _externalServer;

    private string? _externalDatabase;

    /// <summary>
    /// Why PostgreSQL is unavailable, or <see langword="null"/> if it started.
    /// </summary>
    /// <remarks>
    /// Docker is not available everywhere these tests run, and a developer
    /// machine without it should still get a green suite rather than a wall of
    /// failures. Tests in this fixture skip with this reason instead.
    /// </remarks>
    public string? SkipReason { get; private set; }

    public string ConnectionString =>
        (_externalDatabase is not null
            ? new NpgsqlConnectionStringBuilder(_externalServer) { Database = _externalDatabase }.ConnectionString
            : _container?.GetConnectionString())
        ?? throw new InvalidOperationException($"PostgreSQL is unavailable: {SkipReason}");

    public async ValueTask InitializeAsync()
    {
        var external = Environment.GetEnvironmentVariable(ExternalServerVariable);
        if (!string.IsNullOrWhiteSpace(external))
        {
            await CreateExternalDatabaseAsync(external);
            return;
        }

        try
        {
            _container = new PostgreSqlBuilder("postgres:18-alpine")
                .WithWaitStrategy(Wait.ForUnixContainer().UntilCommandIsCompleted("pg_isready"))
                .Build();

            await _container.StartAsync(TestContext.Current.CancellationToken);
        }
        catch (Exception ex)
        {
            SkipReason = $"could not start a PostgreSQL container ({ex.GetType().Name}: {ex.Message})";
            _container = null;
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_container is not null)
        {
            await _container.DisposeAsync();
        }

        if (_externalDatabase is not null)
        {
            // Pooled connections into the scratch database would block the
            // DROP; FORCE (PostgreSQL 13+) terminates any that remain.
            NpgsqlConnection.ClearAllPools();
            await ExecuteOnServerAsync($"DROP DATABASE IF EXISTS \"{_externalDatabase}\" WITH (FORCE)");
        }

        GC.SuppressFinalize(this);
    }

    private async Task CreateExternalDatabaseAsync(string server)
    {
        _externalServer = server;
        var database = $"bjarnoy_test_{Guid.NewGuid():N}";

        // Unlike a container, a misconfigured server the developer asked for
        // explicitly is a real failure, not a reason to skip silently.
        await ExecuteOnServerAsync($"CREATE DATABASE \"{database}\"");
        _externalDatabase = database;
    }

    private async Task ExecuteOnServerAsync(string sql)
    {
        await using var connection = new NpgsqlConnection(_externalServer);
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
    }
}
