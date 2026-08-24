using DotNet.Testcontainers.Builders;
using Testcontainers.PostgreSql;

namespace Bjarnoy.Api.IntegrationTests.Infrastructure;

/// <summary>
/// A throwaway PostgreSQL container for the tests that must run against the
/// production provider.
/// </summary>
/// <remarks>
/// SQLite covers the endpoints; this covers the things only PostgreSQL can
/// answer — that the PostgreSQL migration set applies cleanly, and that the
/// model behaves the same on both dialects.
/// </remarks>
public sealed class PostgreSqlFixture : IAsyncLifetime
{
    private PostgreSqlContainer? _container;

    /// <summary>
    /// Why the container is unavailable, or <see langword="null"/> if it started.
    /// </summary>
    /// <remarks>
    /// Docker is not available everywhere these tests run, and a developer
    /// machine without it should still get a green suite rather than a wall of
    /// failures. Tests in this fixture skip with this reason instead.
    /// </remarks>
    public string? SkipReason { get; private set; }

    public string ConnectionString =>
        _container?.GetConnectionString()
        ?? throw new InvalidOperationException($"PostgreSQL is unavailable: {SkipReason}");

    public async ValueTask InitializeAsync()
    {
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

        GC.SuppressFinalize(this);
    }
}
