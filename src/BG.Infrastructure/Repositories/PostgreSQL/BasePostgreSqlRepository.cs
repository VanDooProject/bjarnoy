using Npgsql;

namespace BG.Infrastructure.Repositories.PostgreSQL;

public abstract class BasePostgreSqlRepository
{
    protected readonly string _connectionString;

    protected BasePostgreSqlRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    protected async Task<NpgsqlConnection> CreateConnectionAsync()
    {
        var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        return connection;
    }
