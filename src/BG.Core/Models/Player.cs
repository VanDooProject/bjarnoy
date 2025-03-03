using BG.Core.ValueObjects;

namespace BG.Core.Models;

public class Player
{
    public EntityId Id { get; private set; }
    public EntityId UserId { get; private set; }
    public EntityId WorldId { get; private set; }
    public string Name { get; private set; }
    public DateTime JoinedAt { get; private set; }
    public bool IsActive { get; private set; }
    public EntityId? DelegatedToUserId { get; private set; } // there should be multiple delegations
    public DateTime? DelegationExpiresAt { get; private set; }

    private Player(
        EntityId id,
        EntityId userId,
        EntityId worldId,
        string name,
        DateTime joinedAt,
        bool isActive = true)
    {
        Id = id;
        UserId = userId;
        WorldId = worldId;
        Name = name;
        JoinedAt = joinedAt;
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