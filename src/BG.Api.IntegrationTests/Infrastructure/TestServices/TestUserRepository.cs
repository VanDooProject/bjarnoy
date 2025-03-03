using BG.Core.Interfaces.Repositories;
using BG.Core.Models;
using BG.Core.ValueObjects;

namespace BG.Api.IntegrationTests.Infrastructure.TestServices;

public class TestUserRepository : IUserRepository
{
    private readonly Dictionary<EntityId, User> _users = new();

    public Task<User?> GetByIdAsync(EntityId id)
    {
        return Task.FromResult(_users.GetValueOrDefault(id));
    }

    public Task<User?> GetByUsernameAsync(string username)
    {
        return Task.FromResult(_users.Values.FirstOrDefault(u => u.Username == username));
    }

    public Task<User?> GetByEmailAsync(string email)
    {
        return Task.FromResult(_users.Values.FirstOrDefault(u => u.Email == email));
    }

    public Task CreateAsync(User user)
    {
        _users[user.Id] = user;
        return Task.CompletedTask;
    }

    public Task UpdateAsync(User user)
    {
        _users[user.Id] = user;
        return Task.CompletedTask;
    }

    public async Task SetUserRolesAndActivate(string username, string[] roles)
    {
        var user = await GetByUsernameAsync(username);
        if (user != null)
        {
            user.UpdateRoles(roles);
            await UpdateAsync(user);
        }
    }
}