using BG.Core.Models.Enums;
using BG.Core.ValueObjects;
using System;

namespace BG.Core.Models;

public class World
{
    public EntityId Id { get; set; }
    public string Name { get; set; }
    public int MaxPlayers { get; set; }
    public int CurrentPlayerCount { get; set; } // gets joined in the db
    public WorldStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }

    [Obsolete("This constructor is for JSON deserialization only. Use World.Create() for creating new instances.", error: true)]
    public World() // TODO ignore warning
    {
    }

    public World(
        EntityId id,
        string name,
        int maxPlayers)
    {
        Id = id;
        Name = name;
        MaxPlayers = maxPlayers;
        Status = WorldStatus.Active;
        CurrentPlayerCount = 0;
        CreatedAt = DateTime.UtcNow;
    }

    public bool IsFull()
    {
        return Status == WorldStatus.Full || CurrentPlayerCount >= MaxPlayers;
    }

    public void UpdateStatus(WorldStatus status)
    {
        Status = status;
    }
    
    public bool CanJoin()
    {
        return Status == WorldStatus.Active && !IsFull();
    }
}