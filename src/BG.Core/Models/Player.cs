using BG.Core.ValueObjects;
using System;
using System.Diagnostics.CodeAnalysis;

namespace BG.Core.Models;

public class Player
{
    public EntityId Id { get; set; }
    public EntityId UserId { get; set; }
    public EntityId WorldId { get; set; }
    public string Name { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsActive { get; set; }
    public EntityId? DelegatedToUserId { get; set; } // there should be multiple delegations
    public DateTime? DelegationExpiresAt { get; set; }

    [Obsolete("This constructor is for JSON deserialization only. Use Player.Create() for creating new instances.", error: true)]
    [SuppressMessage("", "CS8618", Justification = "Required for JSON deserialization")]
    public Player()
    {
    }

    private Player(
        EntityId id,
        EntityId userId,
        EntityId worldId,
        string name,
        DateTime createdAt,
        bool isActive = true)
    {
        Id = id;
        UserId = userId;
        WorldId = worldId;
        Name = name;
        CreatedAt = createdAt;
        IsActive = isActive;
    }

    public static Player Create(
        EntityId userId,
        EntityId worldId,
        string name)
    {
        return new Player(
            EntityId.NewId(),
            userId,
            worldId,
            name,
            DateTime.UtcNow);
    }

    public void DelegateTo(EntityId userId, DateTime expiresAt)
    {
        DelegatedToUserId = userId;
        DelegationExpiresAt = expiresAt;
    }

    public void RevokeDelegation()
    {
        DelegatedToUserId = null;
        DelegationExpiresAt = null;
    }

    public void UpdateActive(bool isActive)
    {
        IsActive = isActive;
    }

    public bool IsDelegatedTo(EntityId userId)
    {
        return DelegatedToUserId == userId 
            && DelegationExpiresAt.HasValue 
            && DelegationExpiresAt.Value > DateTime.UtcNow;
    }
}