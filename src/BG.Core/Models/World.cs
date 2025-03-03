using BG.Core.Models.Enums;
using BG.Core.ValueObjects;

namespace BG.Core.Models;

public class World
{
    public EntityId Id { get; private set; }
    public string Name { get; private set; }
    public int MaxPlayers { get; private set; }
    public WorldStatus Status { get; private set; }
    public DateTime CreatedAt { get; private set; }

    private World(
        EntityId id,
        string name,
        int maxPlayers,
        WorldStatus status,
        DateTime createdAt)
    {
        Id = id;
        Name = name;
        MaxPlayers = maxPlayers;
        Status = status;
        CreatedAt = createdAt;
    }

    public static World Create(string name, int maxPlayers)
    {
        return new World(
            EntityId.NewId(),
            name,
            maxPlayers,
            WorldStatus.Active,
            DateTime.UtcNow);
    }

    public void UpdateStatus(WorldStatus status)
    {
        Status = status;
    }
}