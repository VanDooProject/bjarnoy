using BG.Core.Interfaces.Repositories;
using BG.Core.Models;
using BG.Core.ValueObjects;
using BG.Infrastructure.Data;
using Dapper;

namespace BG.Infrastructure.Repositories.PostgreSQL;

public class PostgreSqlRefreshTokenRepository : BasePostgreSqlRepository, IRefreshTokenRepository
{
    public PostgreSqlRefreshTokenRepository(IUnitOfWork unitOfWork) : base(unitOfWork)
    {
    }

    public async Task<RefreshToken?> GetByTokenAsync(string token)
    {
        const string sql = "SELECT id, token, user_id, expires_at, created_at, revoked_at FROM refresh_tokens WHERE token = @Token";
        return await Connection.QuerySingleOrDefaultAsync<RefreshToken>(sql, new { Token = token });
    }

    public async Task<RefreshToken?> GetByIdAsync(EntityId id)
    {
        const string sql = "SELECT id, token, user_id, expires_at, created_at, revoked_at FROM refresh_tokens WHERE id = @Id";
        return await Connection.QuerySingleOrDefaultAsync<RefreshToken>(sql, new { Id = id });
    }

    public async Task<IEnumerable<RefreshToken>> GetActiveTokensByUserIdAsync(EntityId userId)
    {
        const string sql = @"
            SELECT id, token, user_id, expires_at, created_at, revoked_at 
            FROM refresh_tokens 
            WHERE user_id = @UserId 
            AND revoked_at IS NULL 
            AND expires_at > NOW()";
        return await Connection.QueryAsync<RefreshToken>(sql, new { UserId = userId });
    }

    public async Task CreateAsync(RefreshToken token)
    {
        const string sql = @"
            INSERT INTO refresh_tokens (id, token, user_id, expires_at, created_at, revoked_at)
            VALUES (@Id, @Token, @UserId, @ExpiresAt, @CreatedAt, @RevokedAt)";
        await Connection.ExecuteAsync(sql, token);
    }

    public async Task UpdateAsync(RefreshToken token)
    {
        const string sql = @"
            UPDATE refresh_tokens 
            SET token = @Token,
                user_id = @UserId,
                expires_at = @ExpiresAt,
                revoked_at = @RevokedAt
            WHERE id = @Id";
        await Connection.ExecuteAsync(sql, token);
    }

    public async Task DeleteAsync(EntityId id)
    {
        const string sql = "DELETE FROM refresh_tokens WHERE id = @Id";
        await Connection.ExecuteAsync(sql, new { Id = id });
    }

    public async Task RevokeAllForUserAsync(EntityId userId)
    {
        const string sql = @"
            UPDATE refresh_tokens 
            SET revoked_at = NOW() 
            WHERE user_id = @UserId 
            AND revoked_at IS NULL";
        await Connection.ExecuteAsync(sql, new { UserId = userId });
    }
}