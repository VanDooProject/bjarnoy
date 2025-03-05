using BG.Core.Interfaces.Repositories;
using BG.Core.Models;
using BG.Core.ValueObjects;
using BG.Infrastructure.Data;
using Dapper;

namespace BG.Infrastructure.Repositories.PostgreSQL;

public class PostgreSqlEmailVerificationRepository : BasePostgreSqlRepository, IEmailVerificationRepository
{
    public PostgreSqlEmailVerificationRepository(IUnitOfWork unitOfWork) : base(unitOfWork)
    {
    }

    public async Task<EmailVerification?> GetVerificationByTokenAsync(string token)
    {
        const string sql = @"
            SELECT id as Id, user_id as UserId, email as Email, token as Token, expires_at as ExpiresAt, created_at as CreatedAt
            FROM ""EmailVerifications""
            WHERE token = @token";

        return await Connection.QuerySingleOrDefaultAsync<EmailVerification>(sql, new { token });
    }

    public async Task<IEnumerable<EmailVerification>> GetVerificationsByUserIdAsync(EntityId userId)
    {
        const string sql = @"
            SELECT id as Id, user_id as UserId, email as Email, token as Token, expires_at as ExpiresAt, created_at as CreatedAt
            FROM ""EmailVerifications""
            WHERE user_id = @userId";

        return await Connection.QueryAsync<EmailVerification>(sql, new { userId });
    }

    public async Task CreateAsync(EmailVerification verification)
    {
        const string sql = @"
            INSERT INTO ""EmailVerifications"" (id, user_id, email, token, expires_at, created_at)
            VALUES (@Id, @UserId, @Email, @Token, @ExpiresAt, @CreatedAt)";

        await Connection.ExecuteAsync(sql, verification);
    }

    public async Task DeleteAsync(EntityId verificationId)
    {
        const string sql = @"DELETE FROM ""EmailVerifications"" WHERE id = @id";
        await Connection.ExecuteAsync(sql, new { id = verificationId });
    }
}