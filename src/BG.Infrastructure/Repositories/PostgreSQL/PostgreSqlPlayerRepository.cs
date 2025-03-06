using BG.Core.Interfaces.Repositories;
using BG.Core.Models;
using BG.Core.ValueObjects;
using BG.Infrastructure.Data;
using Dapper;

namespace BG.Infrastructure.Repositories.PostgreSQL;

public class PostgreSqlPlayerRepository : BasePostgreSqlRepository, IPlayerRepository
{
    public PostgreSqlPlayerRepository(IUnitOfWork unitOfWork) : base(unitOfWork)
    {
    }

    public async Task<Player?> GetPlayerByIdAsync(EntityId id)
    {
        const string sql = @"SELECT ""Id"", ""UserId"", ""WorldId"", ""Name"", ""CreatedAt"" FROM ""Players"" WHERE ""Id"" = @Id";
        return await Connection.QuerySingleOrDefaultAsync<Player>(sql, new { Id = id });
    }

    public async Task<IEnumerable<Player>> GetPlayersByUserIdAsync(EntityId userId)
    {
        const string sql = @"SELECT ""Id"", ""UserId"", ""WorldId"", ""Name"", ""CreatedAt"" FROM ""Players"" WHERE ""UserId"" = @UserId";
        return await Connection.QueryAsync<Player>(sql, new { UserId = userId });
    }

    public async Task<IEnumerable<Player>> GetPlayersByWorldIdAsync(EntityId worldId)
    {
        const string sql = @"SELECT ""Id"", ""UserId"", ""WorldId"", ""Name"", ""CreatedAt"" FROM ""Players"" WHERE ""WorldId"" = @WorldId";
        return await Connection.QueryAsync<Player>(sql, new { WorldId = worldId });
    }

    public async Task<int> GetPlayerCountByWorldIdAsync(EntityId worldId)
    {
        const string sql = @"SELECT COUNT(*) FROM ""Players"" WHERE ""WorldId"" = @WorldId";
        return await Connection.ExecuteScalarAsync<int>(sql, new { WorldId = worldId });
    }

    public async Task<Player?> GetByUserAndWorldAsync(EntityId userId, EntityId worldId)
    {
        const string sql = @"SELECT ""Id"", ""UserId"", ""WorldId"", ""Name"", ""CreatedAt""
                           FROM ""Players"" WHERE ""UserId"" = @UserId AND ""WorldId"" = @WorldId";
        return await Connection.QuerySingleOrDefaultAsync<Player>(sql, new { UserId = userId, WorldId = worldId });
    }

    public async Task CreateAsync(Player player)
    {
        const string sql = @"
            INSERT INTO ""Players"" (""Id"", ""UserId"", ""WorldId"", ""Name"", ""CreatedAt"")
            VALUES (@Id, @UserId, @WorldId, @Name, @CreatedAt)";
        await Connection.ExecuteAsync(sql, player);
    }

    public async Task UpdateAsync(Player player)
    {
        const string sql = @"
            UPDATE ""Players"" 
            SET ""UserId"" = @UserId,
                ""WorldId"" = @WorldId,
                ""Name"" = @Name
            WHERE ""Id"" = @Id";
        await Connection.ExecuteAsync(sql, player);
    }
}