using BG.Core.Models.Enums;
using BG.Core.ValueObjects;

namespace BG.Core.Models;

public class User
{
    public EntityId Id { get; private set; }
    public string Username { get; private set; }
    public string Email { get; private set; }
    public string PasswordHash { get; private set; } // are there secure strings in c#?
    public DateTime CreatedAt { get; private set; }
    public DateTime? LastLoginAt { get; private set; }
    public UserStatus Status { get; private set; }
    public string[] Roles { get; private set; }

    private User(
        EntityId id,
        string username,
        string email,
        string passwordHash,
        DateTime createdAt,
        UserStatus status = UserStatus.Active,
        string[]? roles = null)
    {
        Id = id;
        Username = username;
        Email = email;
        PasswordHash = passwordHash;
        CreatedAt = createdAt;
        Status = status;
        Roles = roles ?? Array.Empty<string>();
    }

    public static User Create(
        string username,
        string email,
        string passwordHash)
    {
        return new User(
            EntityId.NewId(),
            username,
            email,
            passwordHash,
            DateTime.UtcNow);
    }

    public void UpdateLogin()
    {
        LastLoginAt = DateTime.UtcNow;
    }

    public void UpdateStatus(UserStatus status)
    {
        Status = status;
    }

    public void UpdateRoles(string[] roles)
    {
        Roles = roles;
    }

    public bool HasRole(string role)
    {
        return Roles.Contains(role);
    }
}