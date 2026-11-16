using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests.Infrastructure;

/// <summary>Marks exactly the given hexes as already explored by an owner, by writing their persisted fog chunks.</summary>
internal static class ExploredHexSeeding
{
    public static async Task SeedExploredHexesAsync(
        this BjarnoyApiFactory factory, Guid worldId, string ownerId, IEnumerable<HexCoord> hexes, CancellationToken cancellationToken)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        foreach (var (chunk, inChunk) in PersistedExploredBitset.GroupByChunk(hexes))
        {
            var data = PersistedExploredBitset.Encode(chunk, inChunk);
            db.PlayerExploredChunks.Add(new PlayerExploredChunkEntity
            {
                WorldId = worldId, OwnerId = ownerId, ChunkU = chunk.U, ChunkV = chunk.V,
                Bits = data.Bits, IsFull = data.IsFull, UpdatedAt = DateTimeOffset.UnixEpoch,
            });
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}
