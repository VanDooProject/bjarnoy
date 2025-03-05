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
        const string sql = @"SELECT ""Id"", ""Username"", ""Email"", ""PasswordHash"", ""Roles"", ""CreatedAt"" FROM ""Users"" WHERE ""Id"" = @Id";
        return await Connection.QuerySingleOrDefaultAsync<User>(sql, new { Id = id });
    }

    public async Task<User?> GetByUsernameAsync(string username)
    {
        const string sql = @"SELECT ""Id"", ""Username"", ""Email"", ""PasswordHash"", ""Roles"", ""CreatedAt"" FROM ""Users"" WHERE ""Username"" = @Username";
        return await Connection.QuerySingleOrDefaultAsync<User>(sql, new { Username = username });
    }

    public async Task<User?> GetByEmailAsync(string email)
    {
        const string sql = @"SELECT ""Id"", ""Username"", ""Email"", ""PasswordHash"", ""Roles"", ""CreatedAt"" FROM ""Users"" WHERE ""Email"" = @Email";
        return await Connection.QuerySingleOrDefaultAsync<User>(sql, new { Email = email });
    }

    public async Task CreateAsync(User user)
    {
        const string sql = @"
            INSERT INTO ""Users"" (""Id"", ""Username"", ""Email"", ""PasswordHash"", ""Roles"", ""CreatedAt"")
            VALUES (@Id, @Username, @Email, @PasswordHash, @Roles, @CreatedAt)";
        await Connection.ExecuteAsync(sql, user);
    }

    public async Task UpdateAsync(User user)
    {
        const string sql = @"
            UPDATE ""Users"" 
            SET ""Username"" = @Username,
                ""Email"" = @Email,
                ""PasswordHash"" = @PasswordHash,
                ""Roles"" = @Roles
            WHERE ""Id"" = @Id";
        await Connection.ExecuteAsync(sql, user);
    }

    public async Task SetUserRolesAndActivate(string username, string[] roles)
    {
        const string sql = @"
            UPDATE ""Users"" 
            SET ""Roles"" = @Roles,
                ""Status"" = 'active'
            WHERE ""Username"" = @Username";
        await Connection.ExecuteAsync(sql, new { Username = username, Roles = roles });
    }
}