using BG.Core.ValueObjects;
using System;
using System.Text.Json.Serialization;

namespace BG.Core.Models;

public class RefreshToken
{
    public EntityId Id { get; set; }
    public required EntityId UserId { get; set; }
    public required string Token { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? RevokedAt { get; set; }

    //[Obsolete("This constructor is for JSON deserialization only. Use RefreshToken.Create() for creating new instances.", error: true)]
    [JsonConstructor]
    private RefreshToken()
    {
    }

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
        return new RefreshToken()
        {
            Id = EntityId.NewId(),
            UserId = userId,
            Token = token,
            ExpiresAt = DateTime.UtcNow.Add(validityPeriod),
            CreatedAt = DateTime.UtcNow,
        };
    }

    public bool IsExpired() => DateTime.UtcNow > ExpiresAt;

    public bool IsValid() => !IsExpired() && !RevokedAt.HasValue;

    public void Revoke()
    {
        RevokedAt = DateTime.UtcNow;
    }
}