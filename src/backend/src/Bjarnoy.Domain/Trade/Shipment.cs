using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Trade;

/// <summary>
/// One leg of an accepted trade: cargo, in carts, walking a frozen path from
/// one settlement to another, then walking home empty. Accepting an offer
/// produces two of these (see <see cref="TradeOffer.Accept"/>) — the poster's
/// goods to the acceptor, and the acceptor's goods to the poster.
/// </summary>
public sealed record Shipment
{
    public required Guid Id { get; init; }

    public required Guid OfferId { get; init; }

    public required Guid FromSettlementId { get; init; }

    public required Guid ToSettlementId { get; init; }

    public required TradeResource CargoResource { get; init; }

    public required double CargoAmount { get; init; }

    public required int Carts { get; init; }

    /// <summary>The outbound leg, frozen at accept time.</summary>
    public required CartMovement Movement { get; init; }

    /// <summary>When the (now empty) carts are back home and free to be reused.</summary>
    public required DateTimeOffset ReturnArrivesAt { get; init; }

    /// <summary>Whether the cargo has reached <see cref="ToSettlementId"/> by <paramref name="now"/>.</summary>
    public bool HasArrived(DateTimeOffset now) => Movement.HasArrived(now);

    /// <summary>Whether the carts are back home and countable again in <see cref="TradeCartCatalogue.CartCount"/>.</summary>
    public bool HasReturned(DateTimeOffset now) => now >= ReturnArrivesAt;

    /// <summary>
    /// Freezes a one-way shipment: an outbound leg from <paramref name="fromCoord"/>
    /// to <paramref name="toCoord"/>, and the homeward leg the empty carts take back,
    /// departing the instant the outbound leg arrives.
    /// </summary>
    public static Shipment Create(
        Guid id,
        Guid offerId,
        Guid fromSettlementId,
        Guid toSettlementId,
        HexCoord fromCoord,
        HexCoord toCoord,
        TradeResource cargoResource,
        double cargoAmount,
        DateTimeOffset departedAt)
    {
        var outbound = CartMovement.Create(fromCoord, toCoord, TradeCartCatalogue.SpeedHexesPerHour, departedAt);
        var homeward = CartMovement.Create(toCoord, fromCoord, TradeCartCatalogue.SpeedHexesPerHour, outbound.ArrivesAt);

        return new Shipment
        {
            Id = id,
            OfferId = offerId,
            FromSettlementId = fromSettlementId,
            ToSettlementId = toSettlementId,
            CargoResource = cargoResource,
            CargoAmount = cargoAmount,
            Carts = TradeCartCatalogue.CartsRequired(cargoAmount),
            Movement = outbound,
            ReturnArrivesAt = homeward.ArrivesAt,
        };
    }
}
