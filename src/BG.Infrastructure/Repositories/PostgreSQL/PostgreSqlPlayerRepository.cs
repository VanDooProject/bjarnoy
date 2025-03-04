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
        const string sql = "SELECT id, user_id, world_id, name, created_at FROM players WHERE id = @Id";
        return await Connection.QuerySingleOrDefaultAsync<Player>(sql, new { Id = id });
    }

    public async Task<IEnumerable<Player>> GetPlayersByUserIdAsync(EntityId userId)
    {
        const string sql = "SELECT id, user_id, world_id, name, created_at FROM players WHERE user_id = @UserId";
        return await Connection.QueryAsync<Player>(sql, new { UserId = userId });
    }

    public async Task<IEnumerable<Player>> GetPlayersByWorldIdAsync(EntityId worldId)
    {
        const string sql = "SELECT id, user_id, world_id, name, created_at FROM players WHERE world_id = @WorldId";
        return await Connection.QueryAsync<Player>(sql, new { WorldId = worldId });
    }

    public async Task<int> GetPlayerCountByWorldIdAsync(EntityId worldId)
    {
        const string sql = "SELECT COUNT(*) FROM players WHERE world_id = @WorldId";
        return await Connection.ExecuteScalarAsync<int>(sql, new { WorldId = worldId });
    }

    public async Task<Player?> GetByUserAndWorldAsync(EntityId userId, EntityId worldId)
    {
        const string sql = @"SELECT id, user_id, world_id, name, created_at 
                           FROM players WHERE user_id = @UserId AND world_id = @WorldId";
        return await Connection.QuerySingleOrDefaultAsync<Player>(sql, new { UserId = userId, WorldId = worldId });
    }

    public async Task CreateAsync(Player player)
    {
        const string sql = @"
            INSERT INTO players (id, user_id, world_id, name, created_at)
            VALUES (@Id, @UserId, @WorldId, @Name, @CreatedAt)";
        await Connection.ExecuteAsync(sql, player);
    }

    public async Task UpdateAsync(Player player)
    {
        const string sql = @"
            UPDATE players 
            SET user_id = @UserId,
                world_id = @WorldId,
                name = @Name
            WHERE id = @Id";
        await Connection.ExecuteAsync(sql, player);
    }
}