using BG.Core.Models.Enums;
using BG.Core.ValueObjects;
using System.Text.Json.Serialization;

namespace BG.Core.Models;

public class User
{

    public EntityId Id { get; set; }
    public string Username { get; set; }
    public string Email { get; set; }
    public string PasswordHash { get; set; }
    public string[] Roles { get; set; }
    public UserStatus Status { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; }
    
    [JsonConstructor]
    public User() // TODO how to make sure all properties are set?
    {
        Id = EntityId.NewId();
        Username = string.Empty;
        Email = string.Empty;
        PasswordHash = string.Empty;
        Roles = Array.Empty<string>();
        Status = UserStatus.Unconfirmed;
        CreatedAt = DateTime.UtcNow;
    }

    private User(
        string username,
        string email,
        string passwordHash)
    {
        Id = EntityId.NewId();
        Username = username;
        Email = email;
        PasswordHash = passwordHash;
        Roles = Array.Empty<string>();
        Status = UserStatus.Unconfirmed;
        CreatedAt = DateTime.UtcNow;
    }

    public static User Create(
        string username,
        string email,
        string passwordHash) => new(username, email, passwordHash);

    public void UpdateLastOnline()
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

    public void UpdatePassword(string passwordHash)
    {
        PasswordHash = passwordHash;
    }

    public bool HasRole(string role) => Roles.Contains(role);
}