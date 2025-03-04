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
        const string sql = "SELECT id, name, max_players, current_player_count, created_at FROM worlds WHERE id = @Id";
        return await Connection.QuerySingleOrDefaultAsync<World>(sql, new { Id = id });
    }

    public async Task<IEnumerable<World>> GetAllAsync()
    {
        const string sql = "SELECT id, name, max_players, current_player_count, created_at FROM worlds";
        return await Connection.QueryAsync<World>(sql);
    }

    public async Task<IEnumerable<World>> GetActiveWorldsAsync()
    {
        const string sql = @"SELECT id, name, max_players, current_player_count, created_at 
                           FROM worlds WHERE current_player_count < max_players";
        return await Connection.QueryAsync<World>(sql);
    }

    public async Task CreateAsync(World world)
    {
        const string sql = @"
            INSERT INTO worlds (id, name, max_players, current_player_count, created_at)
            VALUES (@Id, @Name, @MaxPlayers, @CurrentPlayerCount, @CreatedAt)";
        await Connection.ExecuteAsync(sql, world);
    }

    public async Task UpdateAsync(World world)
    {
        const string sql = @"
            UPDATE worlds 
            SET name = @Name,
                max_players = @MaxPlayers,
                current_player_count = @CurrentPlayerCount
            WHERE id = @Id";
        await Connection.ExecuteAsync(sql, world);
    }

    public async Task DeleteAsync(EntityId id)
    {
        const string sql = "DELETE FROM worlds WHERE id = @Id";
        await Connection.ExecuteAsync(sql, new { Id = id });
    }
}