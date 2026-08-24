using BG.Core.Interfaces.Repositories;
using BG.Core.Models;
using BG.Core.Models.Enums;
using BG.Core.ValueObjects;

namespace BG.Api.IntegrationTests.Infrastructure.TestServices;

public class TestWorldRepository : IWorldRepository
{
    private readonly Dictionary<EntityId, BG.Core.Models.World> _worlds = new();

    public Task<BG.Core.Models.World?> GetByIdAsync(EntityId id)
    {
        return Task.FromResult(_worlds.GetValueOrDefault(id));
    }

    public Task<IEnumerable<BG.Core.Models.World>> GetAllAsync()
    {
        return Task.FromResult(_worlds.Values.AsEnumerable());
    }

    public Task<IEnumerable<BG.Core.Models.World>> GetActiveWorldsAsync()
    {
        return Task.FromResult(_worlds.Values.Where(w => w.Status == WorldStatus.Active));
    }

    public Task CreateAsync(BG.Core.Models.World entity)
    {
        _worlds[entity.Id] = entity;
        return Task.CompletedTask;
    }

    public Task UpdateAsync(BG.Core.Models.World entity)
    {
        _worlds[entity.Id] = entity;
        return Task.CompletedTask;
    }

    public Task DeleteAsync(EntityId id)
    {
        _worlds.Remove(id);
        return Task.CompletedTask;
    }
}