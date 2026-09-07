using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Services.PlotReservations;

namespace Bjarnoy.Infrastructure.Tests.PlotReservations;

public class InMemoryPlotReservationStoreTests
{
    private static readonly Guid WorldId = Guid.NewGuid();
    private static readonly Guid IslandId = Guid.NewGuid();
    private readonly TestTimeProvider _time = new(DateTimeOffset.UtcNow);

    private InMemoryPlotReservationStore CreateStore() => new(_time);

    private PlotReservation Reservation(string ownerId, HexCoord plot, TimeSpan ttl, string ip = "ip-1", string fingerprint = "fp-1") =>
        new(WorldId, ownerId, IslandId, plot, ip, fingerprint, _time.GetUtcNow() + ttl);

    [Fact]
    public void A_live_reservation_is_returned_and_an_expired_one_is_not()
    {
        var store = CreateStore();
        store.UpsertReservation(Reservation("owner-1", new HexCoord(1, 1), TimeSpan.FromMinutes(3)));

        Assert.NotNull(store.GetReservation(WorldId, "owner-1"));

        _time.Advance(TimeSpan.FromMinutes(3) + TimeSpan.FromSeconds(1));

        Assert.Null(store.GetReservation(WorldId, "owner-1"));
    }

    [Fact]
    public void UpsertReservation_replaces_the_same_owners_previous_reservation()
    {
        var store = CreateStore();
        store.UpsertReservation(Reservation("owner-1", new HexCoord(1, 1), TimeSpan.FromMinutes(3)));
        store.UpsertReservation(Reservation("owner-1", new HexCoord(9, 9), TimeSpan.FromMinutes(3)));

        var reservation = store.GetReservation(WorldId, "owner-1");

        Assert.Equal(new HexCoord(9, 9), reservation!.Plot);
        Assert.Single(store.LiveReservations(WorldId));
    }

    [Fact]
    public void IsBlockedByOtherOwner_is_true_within_spacing_and_false_for_the_same_owner()
    {
        var store = CreateStore();
        store.UpsertReservation(Reservation("owner-1", new HexCoord(0, 0), TimeSpan.FromMinutes(3)));

        Assert.True(store.IsBlockedByOtherOwner(WorldId, new HexCoord(5, 0), "owner-2", reservationSpacing: 17));
        Assert.False(store.IsBlockedByOtherOwner(WorldId, new HexCoord(20, 0), "owner-2", reservationSpacing: 17));
        Assert.False(store.IsBlockedByOtherOwner(WorldId, new HexCoord(5, 0), "owner-1", reservationSpacing: 17));
    }

    [Fact]
    public void CountLiveOwnersByIp_excludes_the_given_owner_and_expired_reservations()
    {
        var store = CreateStore();
        store.UpsertReservation(Reservation("owner-1", new HexCoord(0, 0), TimeSpan.FromMinutes(3), ip: "shared-ip"));
        store.UpsertReservation(Reservation("owner-2", new HexCoord(30, 0), TimeSpan.FromMinutes(3), ip: "shared-ip"));
        store.UpsertReservation(Reservation("owner-3", new HexCoord(60, 0), TimeSpan.FromSeconds(1), ip: "shared-ip"));

        Assert.Equal(3, store.CountLiveOwnersByIp(WorldId, "shared-ip", excludingOwnerId: "owner-x"));
        Assert.Equal(2, store.CountLiveOwnersByIp(WorldId, "shared-ip", excludingOwnerId: "owner-1"));

        _time.Advance(TimeSpan.FromSeconds(2));

        Assert.Equal(2, store.CountLiveOwnersByIp(WorldId, "shared-ip", excludingOwnerId: "owner-x"));
    }

    [Fact]
    public void Release_removes_both_the_reservation_and_the_last_suggestion()
    {
        var store = CreateStore();
        store.UpsertReservation(Reservation("owner-1", new HexCoord(0, 0), TimeSpan.FromMinutes(3)));
        store.RememberSuggestion(new LastSuggestion(WorldId, "owner-1", IslandId, new HexCoord(0, 0), _time.GetUtcNow() + TimeSpan.FromHours(24)));

        store.Release(WorldId, "owner-1");

        Assert.Null(store.GetReservation(WorldId, "owner-1"));
        Assert.Null(store.GetLastSuggestion(WorldId, "owner-1"));
    }

    [Fact]
    public void ClearWorld_drops_everything_for_that_world_only()
    {
        var store = CreateStore();
        var otherWorldId = Guid.NewGuid();
        store.UpsertReservation(Reservation("owner-1", new HexCoord(0, 0), TimeSpan.FromMinutes(3)));
        store.UpsertReservation(new PlotReservation(otherWorldId, "owner-1", IslandId, new HexCoord(0, 0), "ip", "fp", _time.GetUtcNow() + TimeSpan.FromMinutes(3)));

        store.ClearWorld(WorldId);

        Assert.Null(store.GetReservation(WorldId, "owner-1"));
        Assert.NotNull(store.GetReservation(otherWorldId, "owner-1"));
    }
}
