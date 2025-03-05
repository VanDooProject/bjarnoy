using System.Collections.Concurrent;
using BG.Core.Models;
using BG.Core.Interfaces.Repositories;
using BG.Core.Models.Enums;
using BG.Core.ValueObjects;

namespace BG.Api.IntegrationTests.Infrastructure.TestServices;

public class TestUserRepository : IUserRepository
{
    private readonly ConcurrentDictionary<EntityId, User> _users = new();
    private readonly ConcurrentDictionary<string, User> _usersByUsername = new();
    private readonly ConcurrentDictionary<string, User> _usersByEmail = new();

    public Task<User?> GetByIdAsync(EntityId id)
    {
        return Task.FromResult(_users.GetValueOrDefault(id));
    }

    public Task<User?> GetByUsernameAsync(string username)
    {
        return Task.FromResult(_usersByUsername.GetValueOrDefault(username));
    }

    public Task<User?> GetByEmailAsync(string email)
    {
        return Task.FromResult(_usersByEmail.GetValueOrDefault(email));
    }

    public Task CreateAsync(User user)
    {
        _users[user.Id] = user;
        _usersByUsername[user.Username] = user;
        _usersByEmail[user.Email] = user;
        return Task.CompletedTask;
    }

    public Task UpdateAsync(User user)
    {
        if (_users.TryGetValue(user.Id, out var existingUser))
        {
            _usersByUsername.TryRemove(existingUser.Username, out _);
            _usersByEmail.TryRemove(existingUser.Email, out _);
            
            _users[user.Id] = user;
            _usersByUsername[user.Username] = user;
            _usersByEmail[user.Email] = user;
        }
        return Task.CompletedTask;
    }

    public Task SetUserRolesAndActivate(string username, string[] roles)
    {
        if (_usersByUsername.TryGetValue(username, out var user))
        {
            user.UpdateRoles(roles);
            user.UpdateStatus(UserStatus.Active);
            var updatedUser = user;

            _users[user.Id] = updatedUser;
            _usersByUsername[username] = updatedUser;
            _usersByEmail[user.Email] = updatedUser;
        }
        return Task.CompletedTask;
    }

    public void Clear()
    {
        _users.Clear();
        _usersByUsername.Clear();
        _usersByEmail.Clear();
    }
}