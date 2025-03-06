using BG.Core.ValueObjects;
using System;
using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Serialization;

namespace BG.Core.Models;

public class Player
{
    public EntityId Id { get; set; }
    public EntityId UserId { get; set; }
    public EntityId WorldId { get; set; }
    public required string Name { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsActive { get; set; }
    public EntityId? DelegatedToUserId { get; set; }
    public DateTime? DelegationExpiresAt { get; set; }

    //[Obsolete("This constructor is for JSON deserialization only. Use Player.Create() for creating new instances.", error: true)]
    //[SuppressMessage("", "CS8618", Justification = "Required for JSON deserialization")]
    [JsonConstructor]
    private Player()
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
        return new Player
        {
            Id = EntityId.NewId(),
            UserId = userId,
            WorldId = worldId,
            Name = name,
            CreatedAt = DateTime.UtcNow,
            IsActive = true
        };
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