using Bjarnoy.Domain.Buildings;

namespace Bjarnoy.Domain.Trade;

/// <summary>Where an offer stands in its lifecycle.</summary>
public enum TradeOfferState
{
    Open,
    Accepted,
    Delivered,
    Cancelled,
    Expired,
}

/// <summary>The outcome of asking to post an offer, mirroring <see cref="BuildDecision"/>.</summary>
public sealed record TradeDecision(TradeRejection Rejection, TradeOffer? Offer = null)
{
    public bool Accepted => Rejection == TradeRejection.None && Offer is not null;

    public static TradeDecision Rejected(TradeRejection reason) => new(reason);

    public static TradeDecision Accept(TradeOffer offer) => new(TradeRejection.None, offer);
}

/// <summary>The outcome of asking to accept an offer: the two shipments it puts on the road.</summary>
public sealed record TradeAcceptDecision(
    TradeRejection Rejection,
    TradeOffer? Offer = null,
    Shipment? ToAcceptor = null,
    Shipment? ToPoster = null)
{
    public bool Accepted => Rejection == TradeRejection.None && Offer is not null;

    public static TradeAcceptDecision Rejected(TradeRejection reason) => new(reason);

    public static TradeAcceptDecision Accept(TradeOffer offer, Shipment toAcceptor, Shipment toPoster) =>
        new(TradeRejection.None, offer, toAcceptor, toPoster);
}

/// <summary>
/// An offer posted at a settlement's longhouse: give <see cref="OfferedResource"/>,
/// want <see cref="RequestedResource"/> back, within the ratio corridor from
/// <see cref="TradeRatio"/>. Settles lazily like a <see cref="BuildOrder"/> —
/// <see cref="IsOpen"/> and <see cref="ExpireIfDue"/> are pure reads of a
/// clock, nothing ticks it closed.
/// </summary>
public sealed record TradeOffer
{
    public static readonly TimeSpan DefaultLifetime = TimeSpan.FromHours(24);

    public required Guid Id { get; init; }

    public required Guid OffererSettlementId { get; init; }

    /// <summary>What the poster gives.</summary>
    public required TradeResource OfferedResource { get; init; }

    public required double OfferedAmount { get; init; }

    /// <summary>What the poster wants back.</summary>
    public required TradeResource RequestedResource { get; init; }

    public required double RequestedAmount { get; init; }

    /// <summary>Only guild mates (1:8 lane) may accept this offer.</summary>
    public required bool GuildOnly { get; init; }

    public required DateTimeOffset PostedAt { get; init; }

    public required DateTimeOffset ExpiresAt { get; init; }

    public TradeOfferState State { get; init; } = TradeOfferState.Open;

    /// <summary>Whether this offer can still be accepted at <paramref name="now"/>.</summary>
    public bool IsOpen(DateTimeOffset now) => State == TradeOfferState.Open && now < ExpiresAt;

    /// <summary>
    /// Validates a proposed offer against the ratio, longhouse-level and
    /// cart-availability rules, without touching any settlement's resources.
    /// Call <see cref="Post"/> next to actually escrow and create it.
    /// </summary>
    public static TradeDecision Plan(
        Guid id,
        Settlement offerer,
        TradeResource offeredResource,
        double offeredAmount,
        TradeResource requestedResource,
        double requestedAmount,
        bool guildOnly,
        DateTimeOffset now,
        TimeSpan? lifetime = null)
    {
        var rejection = TradeRatio.Validate(
            offeredResource, offeredAmount, requestedResource, requestedAmount, isGuildTrade: guildOnly);
        if (rejection != TradeRejection.None)
        {
            return TradeDecision.Rejected(rejection);
        }

        if (offerer.LonghouseLevel < TradeCartCatalogue.RequiredLonghouseLevel)
        {
            return TradeDecision.Rejected(TradeRejection.LonghouseTooLow);
        }

        if (TradeCartCatalogue.CartsRequired(offeredAmount) > offerer.CartCount())
        {
            return TradeDecision.Rejected(TradeRejection.NotEnoughCarts);
        }

        // Issue #158 stage 1c: what is reserved for the waiting build queue
        // cannot be offered up for trade either.
        if (!offerer.CanAffordAvailable(offeredResource.Only(offeredAmount), now))
        {
            return TradeDecision.Rejected(TradeRejection.NotEnoughResources);
        }

        return TradeDecision.Accept(new TradeOffer
        {
            Id = id,
            OffererSettlementId = offerer.Id,
            OfferedResource = offeredResource,
            OfferedAmount = offeredAmount,
            RequestedResource = requestedResource,
            RequestedAmount = requestedAmount,
            GuildOnly = guildOnly,
            PostedAt = now,
            ExpiresAt = now + (lifetime ?? DefaultLifetime),
        });
    }

    /// <summary>
    /// Escrows the offered goods on <paramref name="offerer"/> and returns the
    /// settled settlement alongside the (already-validated) offer — the
    /// pay-then-append step, mirroring <see cref="Settlement.Enqueue"/>.
    /// </summary>
    public static Settlement Post(Settlement offerer, TradeOffer plannedOffer, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(plannedOffer);

        if (!offerer.TrySpendAvailable(plannedOffer.OfferedResource.Only(plannedOffer.OfferedAmount), now, out var paid))
        {
            throw new InvalidOperationException("Cannot post an offer that is not affordable; call Plan first.");
        }

        return offerer with { Resources = paid };
    }

    /// <summary>
    /// Validates an accept against openness, range, the guild lane and cart
    /// availability, and — if accepted — freezes both shipments. Does not
    /// touch <paramref name="acceptor"/>'s resources; call <see cref="Accept"/>
    /// next to escrow and commit.
    /// </summary>
    public TradeAcceptDecision PlanAccept(
        Settlement poster,
        Settlement acceptor,
        bool isGuildTrade,
        DateTimeOffset now,
        Guid outboundShipmentId,
        Guid returnShipmentId)
    {
        if (!IsOpen(now))
        {
            return TradeAcceptDecision.Rejected(TradeRejection.OfferNotOpen);
        }

        if (acceptor.Id == OffererSettlementId)
        {
            return TradeAcceptDecision.Rejected(TradeRejection.OwnOffer);
        }

        if (GuildOnly && !isGuildTrade)
        {
            return TradeAcceptDecision.Rejected(TradeRejection.GuildOnlyOffer);
        }

        if (!poster.InTradeRange(acceptor))
        {
            return TradeAcceptDecision.Rejected(TradeRejection.OutOfRange);
        }

        if (acceptor.LonghouseLevel < TradeCartCatalogue.RequiredLonghouseLevel)
        {
            return TradeAcceptDecision.Rejected(TradeRejection.LonghouseTooLow);
        }

        if (TradeCartCatalogue.CartsRequired(RequestedAmount) > acceptor.CartCount())
        {
            return TradeAcceptDecision.Rejected(TradeRejection.NotEnoughCarts);
        }

        // Issue #158 stage 1c.
        if (!acceptor.CanAffordAvailable(RequestedResource.Only(RequestedAmount), now))
        {
            return TradeAcceptDecision.Rejected(TradeRejection.NotEnoughResources);
        }

        var toAcceptor = Shipment.Create(
            outboundShipmentId, Id, poster.Id, acceptor.Id, poster.Centre, acceptor.Centre,
            OfferedResource, OfferedAmount, now);

        var toPoster = Shipment.Create(
            returnShipmentId, Id, acceptor.Id, poster.Id, acceptor.Centre, poster.Centre,
            RequestedResource, RequestedAmount, now);

        return TradeAcceptDecision.Accept(this with { State = TradeOfferState.Accepted }, toAcceptor, toPoster);
    }

    /// <summary>
    /// Escrows the acceptor's goods and commits an already-validated accept —
    /// mirroring <see cref="Post"/>. The poster's side was escrowed at post
    /// time, so only <paramref name="acceptor"/> pays here.
    /// </summary>
    public static Settlement Accept(Settlement acceptor, TradeAcceptDecision decision, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(decision);
        if (decision.ToPoster is null)
        {
            throw new InvalidOperationException("Cannot accept a decision that was not produced by PlanAccept.");
        }

        if (!acceptor.TrySpendAvailable(decision.ToPoster.CargoResource.Only(decision.ToPoster.CargoAmount), now, out var paid))
        {
            throw new InvalidOperationException("Cannot accept an offer that is not affordable; call PlanAccept first.");
        }

        return acceptor with { Resources = paid };
    }

    /// <summary>
    /// Withdraws this offer while it is still open. Accepting a trade is
    /// final for the counterparty who already paid, so cancellation is
    /// refused once <see cref="State"/> has moved past <see cref="TradeOfferState.Open"/>.
    /// The caller refunds <see cref="OfferedResource"/>/<see cref="OfferedAmount"/>
    /// to the offerer's pool via <c>ResourcePool.Deposit</c>.
    /// </summary>
    public TradeOffer Cancel(DateTimeOffset now) =>
        IsOpen(now) ? this with { State = TradeOfferState.Cancelled } : this;

    /// <summary>
    /// Flips an overdue open offer to <see cref="TradeOfferState.Expired"/>.
    /// A no-op otherwise — the same lazy, read-time settling as <c>BuildOrder.IsComplete</c>.
    /// The caller refunds the escrow exactly as for <see cref="Cancel"/>.
    /// </summary>
    public TradeOffer ExpireIfDue(DateTimeOffset now) =>
        State == TradeOfferState.Open && now >= ExpiresAt
            ? this with { State = TradeOfferState.Expired }
            : this;

    /// <summary>Marks the offer delivered once both shipments have arrived.</summary>
    public TradeOffer Deliver() => this with { State = TradeOfferState.Delivered };
}
