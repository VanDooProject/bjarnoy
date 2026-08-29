using Bjarnoy.Domain.Trade;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// A trade offer's stored form. Unlike <see cref="SettlementEntity"/>'s
/// buildings/queue, offers and their <see cref="ShipmentEntity"/> rows are
/// not a nested aggregate synced through one <c>ApplyDomain</c> — each is its
/// own row, queried directly off <c>GameDbContext</c>, because a trade always
/// spans two settlements rather than belonging to one.
/// </summary>
/// <remarks>
/// Everything here is immutable once posted except <see cref="State"/>: the
/// offered/requested amounts, the lane, and the expiry are frozen at post
/// time exactly like the pure <see cref="TradeOffer"/> record they mirror.
/// </remarks>
public class TradeOfferEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    /// <summary>Denormalized from the poster, so the board query can filter by world without a join.</summary>
    public Guid WorldId { get; set; }

    public Guid PosterSettlementId { get; set; }

    public TradeResource OfferedResource { get; set; }

    public double OfferedAmount { get; set; }

    public TradeResource RequestedResource { get; set; }

    public double RequestedAmount { get; set; }

    public bool GuildOnly { get; set; }

    /// <summary>Game instant, not wall time.</summary>
    public DateTimeOffset PostedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public TradeOfferState State { get; set; } = TradeOfferState.Open;

    public TradeOffer ToDomain() => new()
    {
        Id = Id,
        OffererSettlementId = PosterSettlementId,
        OfferedResource = OfferedResource,
        OfferedAmount = OfferedAmount,
        RequestedResource = RequestedResource,
        RequestedAmount = RequestedAmount,
        GuildOnly = GuildOnly,
        PostedAt = PostedAt,
        ExpiresAt = ExpiresAt,
        State = State,
    };
}

/// <summary>
/// One leg of an accepted trade's stored form. <see cref="Movement"/> and
/// <see cref="Shipment.ReturnArrivesAt"/> are a pure function of
/// (from, to, speed, departedAt) — see <see cref="ToDomain"/> — so
/// <see cref="ArrivesAt"/>/<see cref="ReturnArrivesAtGameTime"/> below are a
/// denormalized cache for cheap SQL filtering, not a second source of truth.
/// </summary>
public class ShipmentEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid OfferId { get; set; }

    public Guid FromSettlementId { get; set; }

    public Guid ToSettlementId { get; set; }

    public TradeResource CargoResource { get; set; }

    public double CargoAmount { get; set; }

    public int Carts { get; set; }

    /// <summary>The frozen path's endpoints — a snapshot of both settlements' centres at accept time.</summary>
    public int FromQ { get; set; }

    public int FromR { get; set; }

    public int ToQ { get; set; }

    public int ToR { get; set; }

    /// <summary>Game instant the cart departed.</summary>
    public DateTimeOffset DepartedAt { get; set; }

    /// <summary>Cached <c>Movement.ArrivesAt</c>, for filtering due shipments without recomputing every row.</summary>
    public DateTimeOffset ArrivesAt { get; set; }

    /// <summary>Cached homeward-leg arrival — when the (now empty) carts are free again.</summary>
    public DateTimeOffset ReturnArrivesAtGameTime { get; set; }

    /// <summary>
    /// When this shipment's cargo was deposited into <see cref="ToSettlementId"/>'s
    /// pool. Null until then; makes delivery idempotent across repeated
    /// lazy settles.
    /// </summary>
    public DateTimeOffset? DeliveredAt { get; set; }

    /// <summary>Rebuilds the frozen movement — recomputes identically from the stored endpoints and departure instant.</summary>
    public Shipment ToDomain() => Shipment.Create(
        Id, OfferId, FromSettlementId, ToSettlementId,
        new HexCoord(FromQ, FromR), new HexCoord(ToQ, ToR),
        CargoResource, CargoAmount, DepartedAt);
}

/// <summary>Immutable record of a completed trade — see <see cref="TradeReport"/>.</summary>
public class TradeReportEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid OfferId { get; set; }

    public DateTimeOffset CompletedAt { get; set; }

    public Guid PosterSettlementId { get; set; }

    public Guid AcceptorSettlementId { get; set; }

    public TradeResource OfferedResource { get; set; }

    public double OfferedAmount { get; set; }

    public TradeResource RequestedResource { get; set; }

    public double RequestedAmount { get; set; }

    public bool GuildTrade { get; set; }

    public double TravelHours { get; set; }
}
