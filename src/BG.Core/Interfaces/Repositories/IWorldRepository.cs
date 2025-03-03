using BG.Core.Models;
using BG.Core.ValueObjects;

namespace BG.Core.Interfaces.Repositories;

public interface IWorldRepository
{
    Task<World?> GetByIdAsync(EntityId id);
    Task<IEnumerable<World>> GetActiveWorldsAsync();
    Task CreateAsync(World world);
    Task UpdateAsync(World world);
}