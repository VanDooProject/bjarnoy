using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Trade;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Tests.Persistence;

/// <summary>
/// <see cref="TradeOfferEntity.Version"/> is what makes the two deliveries of
/// one trade collide: both write the offer row, so the second writer fails its
/// version check and is retried instead of completing nothing.
/// </summary>
/// <remarks>
/// SQLite cannot reproduce the real interleaving: it serialises writers, so the
/// "two uncommitted transactions each see the other shipment undelivered" case
/// only exists on PostgreSQL (READ COMMITTED). These tests pin the mechanism
/// that resolves it — the version moves on a delivery, and a stale holder of
/// the old version is rejected.
/// </remarks>
public sealed class TradeOfferVersionTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly GameDbContext _db;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public TradeOfferVersionTests()
    {
        _connection.Open();
        _db = NewContext();
        _db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
        GC.SuppressFinalize(this);
    }

    private GameDbContext NewContext() =>
        new(new DbContextOptionsBuilder<GameDbContext>().UseSqlite(_connection).Options);

    private SettlementEntity NewSettlement(Guid worldId, Guid islandId, string owner, int centreQ) => new()
    {
        WorldId = worldId,
        IslandId = islandId,
        UserId = SystemUserIds.Abandoned,
        Name = owner,
        OwnerName = owner,
        OwnerId = owner,
        CentreQ = centreQ,
        CentreR = 0,
        FoundedAt = DateTimeOffset.UnixEpoch,
        Buildings = [new PlacedBuildingEntity { Q = centreQ, R = 0, Type = BuildingType.Longhouse, Level = 1 }],
    };

    /// <summary>An accepted offer with its two (undelivered) shipments; returns the offer id and both shipment ids.</summary>
    private async Task<(Guid Offer, Guid ToAcceptor, Guid ToPoster)> SeedAcceptedOfferAsync()
    {
        var worldId = Guid.CreateVersion7();
        var islandId = Guid.CreateVersion7();
        _db.Worlds.Add(new WorldEntity { Id = worldId, Name = "Test", Radius = 6 });
        _db.Islands.Add(new IslandEntity { Id = islandId, WorldId = worldId, Name = "Home Isle" });
        var poster = NewSettlement(worldId, islandId, "poster", 0);
        var acceptor = NewSettlement(worldId, islandId, "acceptor", 5);
        _db.Settlements.AddRange(poster, acceptor);
        await _db.SaveChangesAsync(Ct);

        var offer = new TradeOfferEntity
        {
            WorldId = worldId,
            PosterSettlementId = poster.Id,
            OfferedResource = TradeResource.Wood,
            OfferedAmount = 10,
            RequestedResource = TradeResource.Stone,
            RequestedAmount = 10,
            State = TradeOfferState.Accepted,
            PostedAt = DateTimeOffset.UnixEpoch,
            ExpiresAt = DateTimeOffset.UnixEpoch.AddDays(1),
        };
        var toAcceptor = Shipment(offer.Id, poster.Id, acceptor.Id, TradeResource.Wood);
        var toPoster = Shipment(offer.Id, acceptor.Id, poster.Id, TradeResource.Stone);
        _db.TradeOffers.Add(offer);
        _db.Shipments.AddRange(toAcceptor, toPoster);
        await _db.SaveChangesAsync(Ct);
        _db.ChangeTracker.Clear();
        return (offer.Id, toAcceptor.Id, toPoster.Id);
    }

    private static ShipmentEntity Shipment(Guid offerId, Guid from, Guid to, TradeResource cargo) => new()
    {
        OfferId = offerId,
        FromSettlementId = from,
        ToSettlementId = to,
        CargoResource = cargo,
        CargoAmount = 10,
        Carts = 1,
        DepartedAt = DateTimeOffset.UnixEpoch,
        ArrivesAt = DateTimeOffset.UnixEpoch.AddHours(1),
        ReturnArrivesAtGameTime = DateTimeOffset.UnixEpoch.AddHours(2),
    };

    /// <summary>What <c>TradeService.SettleDeliveriesAsync</c> does for one shipment: mark it and touch its offer.</summary>
    private static async Task DeliverAsync(GameDbContext db, Guid offerId, Guid shipmentId)
    {
        var shipment = await db.Shipments.SingleAsync(s => s.Id == shipmentId, Ct);
        var offer = await db.TradeOffers.SingleAsync(o => o.Id == offerId, Ct);
        shipment.DeliveredAt = DateTimeOffset.UnixEpoch.AddHours(1);
        offer.Version = Guid.NewGuid();
        await db.SaveChangesAsync(Ct);
    }

    [Fact]
    public async Task Delivering_one_shipment_changes_the_offers_version()
    {
        var (offerId, toAcceptor, _) = await SeedAcceptedOfferAsync();
        var before = (await _db.TradeOffers.AsNoTracking().SingleAsync(o => o.Id == offerId, Ct)).Version;

        await DeliverAsync(_db, offerId, toAcceptor);

        var after = (await _db.TradeOffers.AsNoTracking().SingleAsync(o => o.Id == offerId, Ct)).Version;
        Assert.NotEqual(before, after);
    }

    [Fact]
    public async Task A_second_delivery_that_read_the_old_offer_version_is_rejected()
    {
        var (offerId, toAcceptor, toPoster) = await SeedAcceptedOfferAsync();

        // The second request has read the offer (and its own shipment) already...
        await using var second = NewContext();
        var secondShipment = await second.Shipments.SingleAsync(s => s.Id == toPoster, Ct);
        var secondOffer = await second.TradeOffers.SingleAsync(o => o.Id == offerId, Ct);

        // ...when the first delivery commits.
        await using (var first = NewContext())
        {
            await DeliverAsync(first, offerId, toAcceptor);
        }

        secondShipment.DeliveredAt = DateTimeOffset.UnixEpoch.AddHours(1);
        secondOffer.Version = Guid.NewGuid();
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => second.SaveChangesAsync(Ct));

        // Its delivery did not land: the retry will see the first one and complete the offer.
        await using var check = NewContext();
        Assert.Null((await check.Shipments.SingleAsync(s => s.Id == toPoster, Ct)).DeliveredAt);
        Assert.NotNull((await check.Shipments.SingleAsync(s => s.Id == toAcceptor, Ct)).DeliveredAt);
    }

    [Fact]
    public async Task Changing_an_offers_state_alone_also_moves_its_version()
    {
        var (offerId, _, _) = await SeedAcceptedOfferAsync();
        var offer = await _db.TradeOffers.SingleAsync(o => o.Id == offerId, Ct);
        var before = offer.Version;

        offer.State = TradeOfferState.Delivered;
        await _db.SaveChangesAsync(Ct);

        Assert.NotEqual(before, offer.Version);
    }
}
