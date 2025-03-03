using BG.Core.ValueObjects;

namespace BG.Core.Models;

public class RefreshToken
{
    public EntityId Id { get; private set; }
    public EntityId UserId { get; private set; }
    public string Token { get; private set; }
    public DateTime ExpiresAt { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? RevokedAt { get; private set; }

    private RefreshToken(
        EntityId id,
        EntityId userId,
        string token,
        DateTime expiresAt,
        DateTime createdAt)
    {
        Id = id;
        UserId = userId;
        Token = token;
        ExpiresAt = expiresAt;
        CreatedAt = createdAt;
    }

    public static RefreshToken Create(
        EntityId userId,
        string token,
        TimeSpan validityPeriod)
    {
        return new RefreshToken(
            EntityId.NewId(),
            userId,
            token,
            DateTime.UtcNow.Add(validityPeriod),
            DateTime.UtcNow);
    }

    public bool IsExpired() => DateTime.UtcNow > ExpiresAt;

    public bool IsValid() => !IsExpired() && !RevokedAt.HasValue;

    public void Revoke()
    {
        RevokedAt = DateTime.UtcNow;
    }
}