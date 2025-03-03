using BG.Core.ValueObjects;

namespace BG.Core.Models;

public class EmailVerification
{
    public EntityId Id { get; private set; }
    public EntityId UserId { get; private set; }
    public string Email { get; private set; }
    public string Token { get; private set; }
    public DateTime ExpiresAt { get; private set; }
    public DateTime CreatedAt { get; private set; }

    private EmailVerification(
        EntityId id,
        EntityId userId,
        string email,
        string token,
        DateTime expiresAt,
        DateTime createdAt)
    {
        Id = id;
        UserId = userId;
        Email = email;
        Token = token;
        ExpiresAt = expiresAt;
        CreatedAt = createdAt;
    }

    public static EmailVerification Create(
        EntityId userId,
        string email,
        TimeSpan validityPeriod)
    {
        return new EmailVerification(
            EntityId.NewId(),
            userId,
            email,
            Convert.ToBase64String(Guid.CreateVersion7().ToByteArray()),
            DateTime.UtcNow.Add(validityPeriod),
            DateTime.UtcNow);
    }

    public bool IsExpired()
    {
        return DateTime.UtcNow > ExpiresAt;
    }

    public bool IsValid(string token)
    {
        return !IsExpired() && Token == token;
    }
}