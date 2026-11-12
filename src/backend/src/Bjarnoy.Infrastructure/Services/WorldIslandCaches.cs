using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

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

    /// <summary>
    /// The options <paramref name="db"/> was built from, for <see cref="LoadAsync{T}"/>. Take them while the request's context is
    /// still alive (before handing the loader to a <see cref="PerWorldCache{T}"/>): the loader must not touch <paramref name="db"/> itself.
    /// </summary>
    public static DbContextOptions<GameDbContext> OptionsOf(GameDbContext db)
    {
        ArgumentNullException.ThrowIfNull(db);
        var options = db.GetService<IDbContextOptions>();

        // Same provider and connection, but not the request scope's service provider: it is disposed with the request.
        return new DbContextOptions<GameDbContext>(options.Extensions.ToDictionary(
            e => e.GetType(),
            e => e is CoreOptionsExtension core ? core.WithApplicationServiceProvider(null) : e));
    }

    /// <summary>
    /// Runs <paramref name="load"/> against a <see cref="GameDbContext"/> of its own (same database, <paramref name="options"/>). A
    /// <see cref="PerWorldCache{T}"/> task outlives the request that started it and is awaited by other requests, so it must not read
    /// through the first caller's context (that request's scope disposes it, aborted or not, and every waiter would fail with it);
    /// every cached loader goes through here.
    /// </summary>
    public static async Task<T> LoadAsync<T>(DbContextOptions<GameDbContext> options, Func<GameDbContext, Task<T>> load)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(load);
        await using var db = new GameDbContext(options);
        return await load(db).ConfigureAwait(false);
    }
}
