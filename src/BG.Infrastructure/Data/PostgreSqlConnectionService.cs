using System.Data;
using Microsoft.Extensions.Options;
using Npgsql;

namespace BG.Infrastructure.Data;

/// <summary>
/// Provides managed PostgreSQL database connections with connection pooling.
/// Uses Npgsql's built-in ADO.NET connection pool for efficient connection management.
/// 
/// Key features:
/// - Automatic connection pooling (min: 1, max: 100 by default)
/// - Connection reuse within the pool
/// - Automatic connection cleanup
/// - Thread-safe connection handling
/// </summary>
public class PostgreSqlConnectionService
{
    private readonly NpgsqlDataSource _dataSource;

    public PostgreSqlConnectionService(IOptions<PostgreSqlSettings> settings)
    {
        var s = settings.Value;
        var builder = new NpgsqlConnectionStringBuilder(s.GetConnectionString())
        {
            Pooling = s.EnablePooling,
            MinPoolSize = s.MinPoolSize,
            MaxPoolSize = s.MaxPoolSize,
            ConnectionIdleLifetime = s.ConnectionIdleLifetime,
            ConnectionPruningInterval = s.ConnectionPruningInterval,
            CommandTimeout = s.CommandTimeout,
            IncludeErrorDetail = s.IncludeErrorDetail
        };

        _dataSource = NpgsqlDataSource.Create(builder.ToString());
    }

    /// <summary>
    /// Gets a connection from the pool. If no connection is available and MaxPoolSize
    /// is not reached, creates a new connection. Otherwise waits for a connection
    /// to become available.
    /// </summary>
    internal NpgsqlConnection CreateConnection()
    {
        return _dataSource.CreateConnection();
    }
}