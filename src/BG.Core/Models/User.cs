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
    public User()
    {
        Id = EntityId.NewId();
        Username = string.Empty;
        Email = string.Empty;
        PasswordHash = string.Empty;
        Roles = Array.Empty<string>();
        Status = UserStatus.Active;
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
        Status = UserStatus.Active;
        CreatedAt = DateTime.UtcNow;
    }

    public static User Create(
        string username,
        string email,
        string passwordHash) => new(username, email, passwordHash);

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

    public bool HasRole(string role) => Roles.Contains(role);
}