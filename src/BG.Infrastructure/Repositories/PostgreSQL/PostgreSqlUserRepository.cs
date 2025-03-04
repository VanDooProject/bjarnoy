using BG.Core.Interfaces.Repositories;
using BG.Core.Models;
using BG.Core.ValueObjects;
using BG.Infrastructure.Data;
using Dapper;

namespace BG.Infrastructure.Repositories.PostgreSQL;

public class PostgreSqlUserRepository : BasePostgreSqlRepository, IUserRepository
{
    public PostgreSqlUserRepository(IUnitOfWork unitOfWork) : base(unitOfWork)
    {
    }

    public async Task<User?> GetByIdAsync(EntityId id)
    {
        const string sql = "SELECT id, username, email, password_hash, roles, created_at FROM users WHERE id = @Id";
        return await Connection.QuerySingleOrDefaultAsync<User>(sql, new { Id = id });
    }

    public async Task<User?> GetByUsernameAsync(string username)
    {
        const string sql = "SELECT id, username, email, password_hash, roles, created_at FROM users WHERE username = @Username";
        return await Connection.QuerySingleOrDefaultAsync<User>(sql, new { Username = username });
    }

    public async Task<User?> GetByEmailAsync(string email)
    {
        const string sql = "SELECT id, username, email, password_hash, roles, created_at FROM users WHERE email = @Email";
        return await Connection.QuerySingleOrDefaultAsync<User>(sql, new { Email = email });
    }

    public async Task CreateAsync(User user)
    {
        const string sql = @"
            INSERT INTO users (id, username, email, password_hash, roles, created_at)
            VALUES (@Id, @Username, @Email, @PasswordHash, @Roles, @CreatedAt)";
        await Connection.ExecuteAsync(sql, user);
    }

    public async Task UpdateAsync(User user)
    {
        const string sql = @"
            UPDATE users 
            SET username = @Username,
                email = @Email,
                password_hash = @PasswordHash,
                roles = @Roles
            WHERE id = @Id";
        await Connection.ExecuteAsync(sql, user);
    }
}