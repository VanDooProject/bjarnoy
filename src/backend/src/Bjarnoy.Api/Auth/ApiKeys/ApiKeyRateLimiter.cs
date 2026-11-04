using System.Collections.Concurrent;

namespace Bjarnoy.Api.Auth.ApiKeys;

/// <summary>
/// An in-memory fixed one-minute-window request counter per API key. Process-local on purpose: a debug key's quota is
/// a safety net against a runaway agent loop, not a billing meter, so it need not survive a restart or span instances.
/// </summary>
/// <remarks>Uses the injected <see cref="TimeProvider"/>, so tests move the window with their fake clock.</remarks>
public sealed class ApiKeyRateLimiter(TimeProvider timeProvider)
{
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    private readonly ConcurrentDictionary<Guid, Counter> _counters = new();

    private sealed class Counter
    {
        public DateTimeOffset WindowStart;

        public int Count;
    }

    /// <summary>
    /// Counts one request for <paramref name="apiKeyId"/>. Returns true when it fits in the quota; otherwise false with
    /// how long until the window resets.
    /// </summary>
    public bool TryAcquire(Guid apiKeyId, int limit, out TimeSpan retryAfter)
    {
        var now = timeProvider.GetUtcNow();
        var counter = _counters.GetOrAdd(apiKeyId, _ => new Counter { WindowStart = now });

        lock (counter)
        {
            if (now - counter.WindowStart >= Window)
            {
                counter.WindowStart = now;
                counter.Count = 0;
            }

            if (counter.Count >= limit)
            {
                retryAfter = counter.WindowStart + Window - now;
                return false;
            }

            counter.Count++;
            retryAfter = TimeSpan.Zero;
        }

        // Keys come and go (revoked, expired); drop windows that have been idle so the map cannot grow forever.
        if (_counters.Count > 1024)
        {
            foreach (var (id, other) in _counters)
            {
                if (now - other.WindowStart >= Window * 2)
                {
                    _counters.TryRemove(id, out _);
                }
            }
        }

        return true;
    }
}
