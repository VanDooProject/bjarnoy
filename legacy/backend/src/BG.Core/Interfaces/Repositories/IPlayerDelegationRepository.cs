using BG.Core.Models;
using BG.Core.ValueObjects;

namespace BG.Core.Interfaces.Repositories;

public interface IPlayerDelegationRepository
{
    Task<IEnumerable<PlayerDelegation>> GetDelegationsByPlayerIdAsync(EntityId playerId);
    Task<PlayerDelegation?> GetDelegationByDelegateIdAsync(EntityId userId);
    Task<PlayerDelegation?> GetActiveDelegationByDelegateIdAsync(EntityId userId);
    Task CreateAsync(PlayerDelegation delegation);
    Task DeleteAsync(EntityId delegationId);
}