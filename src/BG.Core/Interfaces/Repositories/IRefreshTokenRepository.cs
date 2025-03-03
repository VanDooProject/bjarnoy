using BG.Core.Models;
using BG.Core.ValueObjects;

namespace BG.Core.Interfaces.Repositories;

public interface IRefreshTokenRepository
{
    Task<RefreshToken?> GetByTokenAsync(string token);
    Task<RefreshToken?> GetByIdAsync(EntityId id);
    Task<IEnumerable<RefreshToken>> GetActiveTokensByUserIdAsync(EntityId userId);
    Task CreateAsync(RefreshToken token);
    Task UpdateAsync(RefreshToken token);
    Task DeleteAsync(EntityId id);
    Task RevokeAllForUserAsync(EntityId userId);
}