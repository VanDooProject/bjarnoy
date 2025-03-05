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
        const string sql = @"SELECT ""Id"", ""Token"", ""UserId"", ""ExpiresAt"", ""CreatedAt"", ""RevokedAt"" FROM ""RefreshTokens"" WHERE ""Token"" = @Token";
        return await Connection.QuerySingleOrDefaultAsync<RefreshToken>(sql, new { Token = token });
    }

    public async Task<RefreshToken?> GetByIdAsync(EntityId id)
    {
        const string sql = @"SELECT ""Id"", ""Token"", ""UserId"", ""ExpiresAt"", ""CreatedAt"", ""RevokedAt"" FROM ""RefreshTokens"" WHERE ""Id"" = @Id";
        return await Connection.QuerySingleOrDefaultAsync<RefreshToken>(sql, new { Id = id });
    }

    public async Task<IEnumerable<RefreshToken>> GetActiveTokensByUserIdAsync(EntityId userId)
    {
        const string sql = @"
            SELECT ""Id"", ""Token"", ""UserId"", ""ExpiresAt"", ""CreatedAt"", ""RevokedAt"" 
            FROM ""RefreshTokens"" 
            WHERE ""UserId"" = @UserId 
            AND ""RevokedAt"" IS NULL 
            AND ""ExpiresAt"" > NOW()";
        return await Connection.QueryAsync<RefreshToken>(sql, new { UserId = userId });
    }

    public async Task CreateAsync(RefreshToken token)
    {
        const string sql = @"
            INSERT INTO ""RefreshTokens"" (""Id"", ""Token"", ""UserId"", ""ExpiresAt"", ""CreatedAt"", ""RevokedAt"")
            VALUES (@Id, @Token, @UserId, @ExpiresAt, @CreatedAt, @RevokedAt)";
        await Connection.ExecuteAsync(sql, token);
    }

    public async Task UpdateAsync(RefreshToken token)
    {
        const string sql = @"
            UPDATE ""RefreshTokens"" 
            SET ""Token"" = @Token,
                ""UserId"" = @UserId,
                ""ExpiresAt"" = @ExpiresAt,
                ""RevokedAt"" = @RevokedAt
            WHERE ""Id"" = @Id";
        await Connection.ExecuteAsync(sql, token);
    }

    public async Task DeleteAsync(EntityId id)
    {
        const string sql = @"DELETE FROM ""RefreshTokens"" WHERE ""Id"" = @Id";
        await Connection.ExecuteAsync(sql, new { Id = id });
    }

    public async Task RevokeAllForUserAsync(EntityId userId)
    {
        const string sql = @"
            UPDATE ""RefreshTokens"" 
            SET ""RevokedAt"" = NOW() 
            WHERE ""UserId"" = @UserId 
            AND ""RevokedAt"" IS NULL";
        await Connection.ExecuteAsync(sql, new { UserId = userId });
    }
}