using BG.Core.Interfaces.Repositories;
using BG.Core.Models;
using BG.Core.ValueObjects;
using BG.Infrastructure.Data;
using Dapper;

namespace BG.Infrastructure.Repositories.PostgreSQL;

public class PostgreSqlWorldRepository : BasePostgreSqlRepository, IWorldRepository
{
    public PostgreSqlWorldRepository(IUnitOfWork unitOfWork) : base(unitOfWork)
    {
    }

    public async Task<World?> GetByIdAsync(EntityId id)
    {
        const string sql = @"
            SELECT ""Id"", ""Name"", ""MaxPlayers"", ""CurrentPlayerCount"", ""Status"", ""CreatedAt""
            FROM ""Worlds"" WHERE ""Id"" = @Id";
        return await Connection.QuerySingleOrDefaultAsync<World>(sql, new { Id = id });
    }

    public async Task<IEnumerable<World>> GetAllAsync()
    {
        const string sql = @"
            SELECT ""Id"", ""Name"", ""MaxPlayers"", ""CurrentPlayerCount"", ""Status"", ""CreatedAt""
            FROM ""Worlds""";
        return await Connection.QueryAsync<World>(sql);
    }

    public async Task<IEnumerable<World>> GetActiveWorldsAsync()
    {
        const string sql = @"
            SELECT ""Id"", ""Name"", ""MaxPlayers"", ""CurrentPlayerCount"", ""Status"", ""CreatedAt""
            FROM ""Worlds"" 
            WHERE ""Status"" = @Status AND ""CurrentPlayerCount"" < ""MaxPlayers""";
        return await Connection.QueryAsync<World>(sql, new { Status = 0 });  // Active status is 0
    }

    public async Task CreateAsync(World world)
    {
        const string sql = @"
            INSERT INTO ""Worlds"" (""Id"", ""Name"", ""MaxPlayers"", ""CurrentPlayerCount"", ""Status"", ""CreatedAt"")
            VALUES (@Id, @Name, @MaxPlayers, @CurrentPlayerCount, @Status, @CreatedAt)";
        await Connection.ExecuteAsync(sql, world);
    }

    public async Task UpdateAsync(World world)
    {
        const string sql = @"
            UPDATE ""Worlds"" 
            SET ""Name"" = @Name,
                ""MaxPlayers"" = @MaxPlayers,
                ""CurrentPlayerCount"" = @CurrentPlayerCount,
                ""Status"" = @Status
            WHERE ""Id"" = @Id";
        await Connection.ExecuteAsync(sql, world);
    }

    public async Task DeleteAsync(EntityId id)
    {
        const string sql = @"DELETE FROM ""Worlds"" WHERE ""Id"" = @Id";
        await Connection.ExecuteAsync(sql, new { Id = id });
    }
}