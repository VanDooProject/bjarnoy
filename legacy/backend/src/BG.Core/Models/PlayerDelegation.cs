using BG.Core.ValueObjects;

namespace BG.Core.Models;

public class PlayerDelegation
{
    public EntityId Id { get; private set; }
    public EntityId PlayerId { get; private set; }
    public EntityId DelegatedToUserId { get; private set; }
    public DateTime ExpiresAt { get; private set; }
    public string[] Permissions { get; private set; }
    public DateTime CreatedAt { get; private set; }

    private PlayerDelegation(
        EntityId id,
        EntityId playerId,
        EntityId delegatedToUserId,
        DateTime expiresAt,
        string[] permissions,
        DateTime createdAt)
    {
        Id = id;
        PlayerId = playerId;
        DelegatedToUserId = delegatedToUserId;
        ExpiresAt = expiresAt;
        Permissions = permissions;
        CreatedAt = createdAt;
    }

    public static PlayerDelegation Create(
        EntityId playerId,
        EntityId delegatedToUserId,
        DateTime expiresAt,
        string[] permissions)
    {
        return new PlayerDelegation(
            EntityId.NewId(),
            playerId,
            delegatedToUserId,
            expiresAt,
            permissions,
            DateTime.UtcNow);
    }

    public bool IsExpired()
    {
        return DateTime.UtcNow > ExpiresAt;
    }

    public bool HasPermission(string permission)
    {
        return Permissions.Contains(permission);
    }
}