namespace Bjarnoy.Domain.Trade;

/// <summary>
/// Immutable record of a completed trade, one per offer, mirroring the
/// troop system's <c>BattleReport</c> (issue #40 §6). Unlike a battle report
/// both parties see full detail — there is nothing to hide from a
/// counterparty who agreed to the numbers.
/// </summary>
public sealed record TradeReport
{
    public required Guid Id { get; init; }

    public required Guid OfferId { get; init; }

    public required DateTimeOffset CompletedAt { get; init; }

    public required Guid PosterSettlementId { get; init; }

    public required Guid AcceptorSettlementId { get; init; }

    /// <summary>What the poster gave (and the acceptor received).</summary>
    public required TradeResource OfferedResource { get; init; }

    public required double OfferedAmount { get; init; }

    /// <summary>What the poster received (and the acceptor gave).</summary>
    public required TradeResource RequestedResource { get; init; }

    public required double RequestedAmount { get; init; }

    public required bool GuildTrade { get; init; }

    /// <summary>Travel time of the slower of the two legs.</summary>
    public required double TravelHours { get; init; }

    /// <summary>
    /// Builds the report for a completed trade from its two settled shipments.
    /// Call once both have arrived — the later of the two <see cref="Shipment.Movement"/>
    /// arrival instants is the trade's completion time.
    /// </summary>
    public static TradeReport From(Guid id, TradeOffer offer, Shipment toAcceptor, Shipment toPoster, bool guildTrade)
    {
        var completedAt = toAcceptor.Movement.ArrivesAt > toPoster.Movement.ArrivesAt
            ? toAcceptor.Movement.ArrivesAt
            : toPoster.Movement.ArrivesAt;

        var outboundHours = (toAcceptor.Movement.ArrivesAt - toAcceptor.Movement.DepartedAt).TotalHours;
        var returnHours = (toPoster.Movement.ArrivesAt - toPoster.Movement.DepartedAt).TotalHours;

        return new TradeReport
        {
            Id = id,
            OfferId = offer.Id,
            CompletedAt = completedAt,
            PosterSettlementId = offer.OffererSettlementId,
            AcceptorSettlementId = toAcceptor.ToSettlementId,
            OfferedResource = offer.OfferedResource,
            OfferedAmount = offer.OfferedAmount,
            RequestedResource = offer.RequestedResource,
            RequestedAmount = offer.RequestedAmount,
            GuildTrade = guildTrade,
            TravelHours = Math.Max(outboundHours, returnHours),
        };
    }
}
