using BG.Core.Models;
using BG.Core.ValueObjects;

namespace BG.Core.Interfaces.Repositories;

public interface IUserRepository
{
    Task<User?> GetByIdAsync(EntityId id);
    Task<User?> GetByUsernameAsync(string username);
    Task<User?> GetByEmailAsync(string email);
    Task CreateAsync(User user);
    Task UpdateAsync(User user);
    Task SetUserRolesAndActivate(string username, string[] roles);
}