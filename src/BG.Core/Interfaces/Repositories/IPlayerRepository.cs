using BG.Core.Models;
using BG.Core.ValueObjects;

namespace BG.Core.Interfaces.Repositories;

public interface IPlayerRepository
{
    Task<Player?> GetPlayerByIdAsync(EntityId id);
    Task<IEnumerable<Player>> GetPlayersByUserIdAsync(EntityId userId);
    Task<IEnumerable<Player>> GetPlayersByWorldIdAsync(EntityId worldId);
    Task<int> GetPlayerCountByWorldIdAsync(EntityId worldId);
    Task CreateAsync(Player player);
    Task UpdateAsync(Player player);
}