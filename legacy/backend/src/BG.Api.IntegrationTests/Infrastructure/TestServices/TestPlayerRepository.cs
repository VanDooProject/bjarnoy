using BG.Core.Interfaces.Repositories;
using BG.Core.Models;
using BG.Core.ValueObjects;

namespace BG.Api.IntegrationTests.Infrastructure.TestServices;

public class TestPlayerRepository : IPlayerRepository
{
    private readonly Dictionary<EntityId, Player> _players = new();

    public Task<Player?> GetPlayerByIdAsync(EntityId id)
    {
        return Task.FromResult(_players.GetValueOrDefault(id));
    }

    public Task<IEnumerable<Player>> GetPlayersByUserIdAsync(EntityId userId)
    {
        return Task.FromResult(_players.Values.Where(p => p.UserId == userId));
    }

    public Task<IEnumerable<Player>> GetPlayersByWorldIdAsync(EntityId worldId)
    {
        return Task.FromResult(_players.Values.Where(p => p.WorldId == worldId));
    }

    public Task<int> GetPlayerCountByWorldIdAsync(EntityId worldId)
    {
        return Task.FromResult(_players.Values.Count(p => p.WorldId == worldId));
    }

    public Task<Player?> GetByUserAndWorldAsync(EntityId userId, EntityId worldId)
    {
        return Task.FromResult(_players.Values.FirstOrDefault(p => 
            p.UserId == userId && p.WorldId == worldId));
    }

    public Task CreateAsync(Player player)
    {
        _players[player.Id] = player;
        return Task.CompletedTask;
    }

    public Task UpdateAsync(Player player)
    {
        _players[player.Id] = player;
        return Task.CompletedTask;
    }
}