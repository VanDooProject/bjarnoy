namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// The one place that knows every per-world cache built from the islands' persisted columns (bog tiles, river tiles, start
/// positions) — <see cref="WorldTerrain"/>, <see cref="WorldRivers"/> and the terrain / start-position payloads of the
/// islands endpoints. Those columns only change when a world's islands are replaced (a reseed, the end of world creation) or the
/// world goes away, and every such place calls <see cref="Invalidate"/>.
/// </summary>
public static class WorldIslandCaches
{
    private static readonly List<IPerWorldCache> Caches = [];

    /// <summary>Registers <paramref name="cache"/> so <see cref="Invalidate"/> clears it; returns it for use in a field initializer.</summary>
    public static PerWorldCache<T> Register<T>(PerWorldCache<T> cache)
    {
        ArgumentNullException.ThrowIfNull(cache);
        lock (Caches)
        {
            Caches.Add(cache);
        }

        return cache;
    }

    /// <summary>Forgets everything cached from <paramref name="worldId"/>'s islands; call it wherever they are replaced or removed.</summary>
    public static void Invalidate(Guid worldId)
    {
        IPerWorldCache[] caches;
        lock (Caches)
        {
            caches = [.. Caches];
        }

        foreach (var cache in caches)
        {
            cache.Invalidate(worldId);
        }
    }
}
