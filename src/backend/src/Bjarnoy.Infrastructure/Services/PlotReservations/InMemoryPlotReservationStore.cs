using System.Collections.Concurrent;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Infrastructure.Services.PlotReservations;

/// <summary>
/// Process-local <see cref="IPlotReservationStore"/>: a <see cref="ConcurrentDictionary{TKey,TValue}"/>
/// per world, each guarded by its own lock so a suggestion computation
/// (read neighbours, decide, write) is atomic against a concurrent visitor's
/// request for the same world. Expiry is lazy — every read filters on
/// <see cref="DateTimeOffset"/> against the injected <see cref="TimeProvider"/>,
/// the same "advance the clock in tests, never branch on being in a test"
/// idiom as <c>UserActivityService</c> — rather than relying on
/// <see cref="Microsoft.Extensions.Caching.Memory.IMemoryCache"/> eviction,
/// which cannot enumerate ("every live reservation on this island") or count
/// ("how many owners behind this IP") the way the suggestion algorithm and
/// abuse caps need to.
/// </summary>
/// <remarks>
/// Known limitation, not built here: this store is per-process. Behind more
/// than one backend instance, a visitor pinned on instance A is unknown to
/// instance B — a future remedy is either a shared store (Redis, behind this
/// same interface) or routing a given <c>OwnerId</c> to the same instance.
/// Today's deployment is single-instance, so in-memory is the right first
/// cut; the interface is the seam for either remedy later.
/// </remarks>
public sealed class InMemoryPlotReservationStore(TimeProvider timeProvider) : IPlotReservationStore
{
    private sealed class WorldBucket
    {
        public readonly Lock Gate = new();
        public readonly Dictionary<string, PlotReservation> Reservations = [];
        public readonly Dictionary<string, LastSuggestion> LastSuggestions = [];
    }

    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ConcurrentDictionary<Guid, WorldBucket> _worlds = new();

    private WorldBucket BucketFor(Guid worldId) => _worlds.GetOrAdd(worldId, static _ => new WorldBucket());

    public PlotReservation? GetReservation(Guid worldId, string ownerId)
    {
        var bucket = BucketFor(worldId);
        var now = _timeProvider.GetUtcNow();
        lock (bucket.Gate)
        {
            if (bucket.Reservations.TryGetValue(ownerId, out var reservation) && reservation.ExpiresAt > now)
            {
                return reservation;
            }

            bucket.Reservations.Remove(ownerId);
            return null;
        }
    }

    public IReadOnlyList<PlotReservation> LiveReservations(Guid worldId, Guid? islandId = null)
    {
        var bucket = BucketFor(worldId);
        var now = _timeProvider.GetUtcNow();
        lock (bucket.Gate)
        {
            return [.. bucket.Reservations.Values
                .Where(r => r.ExpiresAt > now && (islandId is null || r.IslandId == islandId))];
        }
    }

    public int CountLiveOwnersByIp(Guid worldId, string ipKey, string excludingOwnerId) =>
        CountLiveOwners(worldId, r => r.IpKey == ipKey, excludingOwnerId);

    public int CountLiveOwnersByFingerprint(Guid worldId, string fingerprintKey, string excludingOwnerId) =>
        CountLiveOwners(worldId, r => r.FingerprintKey == fingerprintKey, excludingOwnerId);

    private int CountLiveOwners(Guid worldId, Func<PlotReservation, bool> match, string excludingOwnerId)
    {
        var bucket = BucketFor(worldId);
        var now = _timeProvider.GetUtcNow();
        lock (bucket.Gate)
        {
            return bucket.Reservations.Values
                .Count(r => r.ExpiresAt > now && r.OwnerId != excludingOwnerId && match(r));
        }
    }

    public void UpsertReservation(PlotReservation reservation)
    {
        var bucket = BucketFor(reservation.WorldId);
        lock (bucket.Gate)
        {
            bucket.Reservations[reservation.OwnerId] = reservation;
        }
    }

    public LastSuggestion? GetLastSuggestion(Guid worldId, string ownerId)
    {
        var bucket = BucketFor(worldId);
        var now = _timeProvider.GetUtcNow();
        lock (bucket.Gate)
        {
            if (bucket.LastSuggestions.TryGetValue(ownerId, out var suggestion) && suggestion.ExpiresAt > now)
            {
                return suggestion;
            }

            bucket.LastSuggestions.Remove(ownerId);
            return null;
        }
    }

    public void RememberSuggestion(LastSuggestion suggestion)
    {
        var bucket = BucketFor(suggestion.WorldId);
        lock (bucket.Gate)
        {
            bucket.LastSuggestions[suggestion.OwnerId] = suggestion;
        }
    }

    public void Release(Guid worldId, string ownerId)
    {
        var bucket = BucketFor(worldId);
        lock (bucket.Gate)
        {
            bucket.Reservations.Remove(ownerId);
            bucket.LastSuggestions.Remove(ownerId);
        }
    }

    public bool IsBlockedByOtherOwner(Guid worldId, HexCoord plot, string ownerId, int reservationSpacing)
    {
        var bucket = BucketFor(worldId);
        var now = _timeProvider.GetUtcNow();
        lock (bucket.Gate)
        {
            return bucket.Reservations.Values.Any(r =>
                r.ExpiresAt > now && r.OwnerId != ownerId && r.Plot.DistanceTo(plot) < reservationSpacing);
        }
    }

    public void ClearWorld(Guid worldId) => _worlds.TryRemove(worldId, out _);
}
