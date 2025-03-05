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
            SELECT ""Id"", ""UserId"", ""Email"", ""Token"", ""ExpiresAt"", ""CreatedAt""
            FROM ""EmailVerifications""
            WHERE ""Token"" = @token";

        return await Connection.QuerySingleOrDefaultAsync<EmailVerification>(sql, new { token });
    }

    public async Task<IEnumerable<EmailVerification>> GetVerificationsByUserIdAsync(EntityId userId)
    {
        const string sql = @"
            SELECT ""Id"", ""UserId"", ""Email"", ""Token"", ""ExpiresAt"", ""CreatedAt""
            FROM ""EmailVerifications""
            WHERE ""UserId"" = @userId";

        return await Connection.QueryAsync<EmailVerification>(sql, new { userId });
    }

    public async Task CreateAsync(EmailVerification verification)
    {
        const string sql = @"
            INSERT INTO ""EmailVerifications"" (""Id"", ""UserId"", ""Email"", ""Token"", ""ExpiresAt"", ""CreatedAt"")
            VALUES (@Id, @UserId, @Email, @Token, @ExpiresAt, @CreatedAt)";
        await Connection.ExecuteAsync(sql, verification);
    }

    public async Task DeleteAsync(EntityId verificationId)
    {
        const string sql = @"DELETE FROM ""EmailVerifications"" WHERE ""Id"" = @id";
        await Connection.ExecuteAsync(sql, new { id = verificationId });
    }
}