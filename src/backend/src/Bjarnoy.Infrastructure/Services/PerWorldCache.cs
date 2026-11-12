using System.Collections.Concurrent;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>A per-world cache that <see cref="WorldIslandCaches.Invalidate"/> can clear without knowing its value type.</summary>
public interface IPerWorldCache
{
    /// <summary>Forgets what is kept for <paramref name="worldId"/>.</summary>
    void Invalidate(Guid worldId);
}

/// <summary>
/// Keeps one lazily loaded value per world in memory: the first caller starts the load, everyone else awaits the same task.
/// A load that faults or is canceled is dropped again so the next call retries; at most <see cref="MaxCachedWorlds"/> worlds are kept, the
/// least recently used first out.
/// </summary>
/// <remarks>
/// The cached task outlives the request that started it, so the loader must not be tied to that request's cancellation
/// (pass <see cref="CancellationToken.None"/> to its queries); a caller that gives up only stops waiting
/// (<see cref="Task.WaitAsync(CancellationToken)"/>).
/// </remarks>
public sealed class PerWorldCache<T> : IPerWorldCache
{
    /// <summary>How many worlds a cache keeps by default.</summary>
    public const int DefaultMaxCachedWorlds = 8;

    private sealed class Entry(Func<Task<T>> load)
    {
        // Lazy so that when several first callers race, only the entry that wins the dictionary starts a load.
        private readonly Lazy<Task<T>> _data = new(load);

        public Task<T> Data => _data.Value;

        public long LastUsedTicks { get; set; } = Environment.TickCount64;
    }

    private readonly ConcurrentDictionary<Guid, Entry> _entries = new();

    /// <param name="maxCachedWorlds">How many worlds are kept; the least recently used beyond that are dropped.</param>
    public PerWorldCache(int maxCachedWorlds = DefaultMaxCachedWorlds)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maxCachedWorlds);
        MaxCachedWorlds = maxCachedWorlds;
    }

    public int MaxCachedWorlds { get; }

    /// <summary>How many worlds are cached right now.</summary>
    public int Count => _entries.Count;

    public bool Contains(Guid worldId) => _entries.ContainsKey(worldId);

    /// <summary>The value of <paramref name="worldId"/>, loading it with <paramref name="load"/> when it is not cached (or its last load failed).</summary>
    public async Task<T> GetAsync(Guid worldId, Func<Task<T>> load, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(load);

        if (!_entries.TryGetValue(worldId, out var entry))
        {
            entry = _entries.GetOrAdd(worldId, _ => new Entry(load));
            Trim();
        }

        entry.LastUsedTicks = Environment.TickCount64;
        try
        {
            return await entry.Data.WaitAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception) when (entry.Data.IsCompleted && !entry.Data.IsCompletedSuccessfully)
        {
            // Faulted or canceled: drop it so the next call retries. (A caller that merely stopped waiting leaves the load running: not completed.)
            _entries.TryRemove(new KeyValuePair<Guid, Entry>(worldId, entry));
            throw;
        }
    }

    /// <summary>Forgets <paramref name="worldId"/>'s value; the next call loads it again.</summary>
    public void Invalidate(Guid worldId) => _entries.TryRemove(worldId, out _);

    private void Trim()
    {
        while (_entries.Count > MaxCachedWorlds)
        {
            var oldest = _entries.OrderBy(kv => kv.Value.LastUsedTicks).First().Key;
            _entries.TryRemove(oldest, out _);
        }
    }
}
