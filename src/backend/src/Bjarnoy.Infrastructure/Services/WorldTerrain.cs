using System.Collections.Concurrent;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// The terrain the game rules see: the seed's terrain with every island's persisted bogland laid over it (bog moss and bog
/// lakes are placed per island by <see cref="BogGenerator"/>, not derivable from the seed). Everything that decides where an
/// army walks, where a ship sails or what may be built asks a sampler from here.
/// </summary>
/// <remarks>
/// The overlay of a world is loaded once and kept (a world's bog only changes when it is reseeded, which calls
/// <see cref="Invalidate"/>): reading every island's bog column on each request would cost more than the request. At most
/// <see cref="MaxCachedWorlds"/> worlds are kept, oldest use first out.
/// </remarks>
public static class WorldTerrain
{
    /// <summary>How many worlds' overlays are kept in memory.</summary>
    public const int MaxCachedWorlds = 8;

    private sealed class Entry(Task<IReadOnlyDictionary<HexCoord, Terrain>> overlay)
    {
        public Task<IReadOnlyDictionary<HexCoord, Terrain>> Overlay { get; } = overlay;

        public long LastUsedTicks { get; set; } = Environment.TickCount64;
    }

    private static readonly ConcurrentDictionary<Guid, Entry> Cache = new();

    /// <summary>The sampler for <paramref name="world"/>, with its bog laid over the seed's terrain.</summary>
    public static async Task<TerrainSampler> SamplerAsync(GameDbContext db, WorldEntity world, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(world);
        var overlay = await OverlayAsync(db, world.Id, cancellationToken).ConfigureAwait(false);
        return new TerrainSampler(world.ToGenerationOptions()).WithBogOverlay(overlay);
    }

    /// <summary>The bog overlay (bog / lake per hex) of a world's islands.</summary>
    public static async Task<IReadOnlyDictionary<HexCoord, Terrain>> OverlayAsync(GameDbContext db, Guid worldId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(db);

        if (!Cache.TryGetValue(worldId, out var entry))
        {
            var created = new Entry(LoadAsync(db, worldId));
            entry = Cache.GetOrAdd(worldId, created);
            Trim();
        }

        entry.LastUsedTicks = Environment.TickCount64;
        try
        {
            return await entry.Overlay.WaitAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception) when (entry.Overlay.IsFaulted)
        {
            Cache.TryRemove(new KeyValuePair<Guid, Entry>(worldId, entry));
            throw;
        }
    }

    /// <summary>Forgets a world's overlay; call it when its islands are regenerated.</summary>
    public static void Invalidate(Guid worldId) => Cache.TryRemove(worldId, out _);

    private static async Task<IReadOnlyDictionary<HexCoord, Terrain>> LoadAsync(GameDbContext db, Guid worldId)
    {
        var islands = await db.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId)
            .Select(i => i.BogTiles)
            .ToListAsync(CancellationToken.None).ConfigureAwait(false);

        var overlay = new Dictionary<HexCoord, Terrain>();
        foreach (var tile in islands.SelectMany(tiles => tiles))
        {
            overlay[new HexCoord(tile.Q, tile.R)] = tile.Kind == (int)BogTileKind.Lake ? Terrain.Lake : Terrain.Bog;
        }

        return overlay;
    }

    private static void Trim()
    {
        while (Cache.Count > MaxCachedWorlds)
        {
            var oldest = Cache.OrderBy(kv => kv.Value.LastUsedTicks).First().Key;
            Cache.TryRemove(oldest, out _);
        }
    }
}
