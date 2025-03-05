using BG.Core.Interfaces.Repositories;
using BG.Core.Models;
using BG.Core.ValueObjects;

namespace BG.Api.IntegrationTests.Infrastructure.TestServices;

public class TestRefreshTokenRepository : IRefreshTokenRepository
{
    private readonly Dictionary<EntityId, RefreshToken> _tokens = new();

    public Task<RefreshToken?> GetByTokenAsync(string token)
    {
        return Task.FromResult(_tokens.Values.FirstOrDefault(t => t.Token == token));
    }

    public Task<RefreshToken?> GetByIdAsync(EntityId id)
    {
        return Task.FromResult(_tokens.GetValueOrDefault(id));
    }

    public Task<IEnumerable<RefreshToken>> GetActiveTokensByUserIdAsync(EntityId userId)
    {
        var now = DateTime.UtcNow;
        return Task.FromResult(
            _tokens.Values.Where(t =>
                t.UserId == userId &&
                t.RevokedAt == null &&
                t.ExpiresAt > now));
    }

    public Task CreateAsync(RefreshToken token)
    {
        _tokens[token.Id] = token;
        return Task.CompletedTask;
    }

    public Task UpdateAsync(RefreshToken token)
    {
        _tokens[token.Id] = token;
        return Task.CompletedTask;
    }

    public Task DeleteAsync(EntityId id)
    {
        _tokens.Remove(id);
        return Task.CompletedTask;
    }

    public Task RevokeAllForUserAsync(EntityId userId)
    {
        var now = DateTime.UtcNow;
        foreach (var token in _tokens.Values.Where(t => t.UserId == userId && t.RevokedAt == null))
        {
            token.Revoke();
            _tokens[token.Id] = token;
        }
        return Task.CompletedTask;
    }
}