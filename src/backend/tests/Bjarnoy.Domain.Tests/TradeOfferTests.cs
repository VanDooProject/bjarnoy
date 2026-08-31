using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Trade;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class TradeOfferTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    /// <summary>
    /// A settlement with a longhouse high enough to post/accept trades (5
    /// carts, trade radius 8), and capacity/stock large enough that tests
    /// exercise the trade rules rather than incidentally tripping unrelated
    /// storage clamps.
    /// </summary>
    private static Settlement Village(HexCoord centre, double stock = 10_000)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 5)]);

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = centre,
            Buildings = [new PlacedBuilding(centre, BuildingType.Longhouse, 5)],
            Resources = ResourcePool.Create(
                ResourceAmounts.Uniform(stock), production, ResourceAmounts.Uniform(1_000_000), T0),
        };
    }

    private static TradeOffer PostedOffer(
        Settlement offerer,
        out Settlement settledOfferer,
        TradeResource offeredResource = TradeResource.Wood,
        double offeredAmount = 400,
        TradeResource requestedResource = TradeResource.Iron,
        double requestedAmount = 200,
        bool guildOnly = false)
    {
        var decision = TradeOffer.Plan(
            Guid.CreateVersion7(), offerer, offeredResource, offeredAmount, requestedResource, requestedAmount,
            guildOnly, T0);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");

        settledOfferer = TradeOffer.Post(offerer, decision.Offer!, T0);
        return decision.Offer!;
    }

    [Fact]
    public void Posting_an_offer_escrows_the_offered_goods()
    {
        var offerer = Village(HexCoord.Origin);

        PostedOffer(offerer, out var settled, offeredAmount: 400, requestedAmount: 200);

        Assert.Equal(offerer.Resources.At(T0).Wood - 400, settled.Resources.At(T0).Wood, 6);
    }

    [Fact]
    public void Posting_beyond_the_open_market_ratio_is_rejected_and_spends_nothing()
    {
        var offerer = Village(HexCoord.Origin);

        var decision = TradeOffer.Plan(
            Guid.CreateVersion7(), offerer, TradeResource.Wood, 500, TradeResource.Iron, 200, guildOnly: false, T0);

        Assert.Equal(TradeRejection.RatioExceeded, decision.Rejection);
        Assert.False(decision.Accepted);
    }

    [Fact]
    public void Posting_with_too_low_a_longhouse_is_rejected()
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        var offerer = new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Smaby",
            Centre = HexCoord.Origin,
            Buildings = [new PlacedBuilding(HexCoord.Origin, BuildingType.Longhouse, 1)],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(10_000), production, capacity, T0),
        };

        var decision = TradeOffer.Plan(
            Guid.CreateVersion7(), offerer, TradeResource.Wood, 100, TradeResource.Iron, 100, guildOnly: false, T0);

        Assert.Equal(TradeRejection.LonghouseTooLow, decision.Rejection);
    }

    [Fact]
    public void Posting_more_than_can_be_afforded_is_rejected()
    {
        var offerer = Village(HexCoord.Origin, stock: 100);

        var decision = TradeOffer.Plan(
            Guid.CreateVersion7(), offerer, TradeResource.Wood, 400, TradeResource.Iron, 200, guildOnly: false, T0);

        Assert.Equal(TradeRejection.NotEnoughResources, decision.Rejection);
    }

    [Fact]
    public void Posting_more_than_available_carts_can_carry_is_rejected()
    {
        // Longhouse level 5 => 5 carts => 500 capacity; 501 needs a 6th cart.
        var offerer = Village(HexCoord.Origin);

        var decision = TradeOffer.Plan(
            Guid.CreateVersion7(), offerer, TradeResource.Wood, 501, TradeResource.Iron, 251, guildOnly: false, T0);

        Assert.Equal(TradeRejection.NotEnoughCarts, decision.Rejection);
    }

    [Fact]
    public void Accepting_escrows_the_acceptors_goods_and_freezes_two_shipments()
    {
        var poster = Village(new HexCoord(0, 0));
        var offer = PostedOffer(poster, out poster, offeredAmount: 400, requestedAmount: 200);

        var acceptor = Village(new HexCoord(2, 0));
        var decision = offer.PlanAccept(
            poster, acceptor, isGuildTrade: false, T0, Guid.CreateVersion7(), Guid.CreateVersion7());
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");

        var settledAcceptor = TradeOffer.Accept(acceptor, decision, T0);

        Assert.Equal(acceptor.Resources.At(T0).Iron - 200, settledAcceptor.Resources.At(T0).Iron, 6);
        Assert.Equal(TradeOfferState.Accepted, decision.Offer!.State);

        Assert.Equal(poster.Id, decision.ToAcceptor!.FromSettlementId);
        Assert.Equal(acceptor.Id, decision.ToAcceptor.ToSettlementId);
        Assert.Equal(TradeResource.Wood, decision.ToAcceptor.CargoResource);
        Assert.Equal(400, decision.ToAcceptor.CargoAmount);

        Assert.Equal(acceptor.Id, decision.ToPoster!.FromSettlementId);
        Assert.Equal(poster.Id, decision.ToPoster.ToSettlementId);
        Assert.Equal(TradeResource.Iron, decision.ToPoster.CargoResource);
        Assert.Equal(200, decision.ToPoster.CargoAmount);
    }

    [Fact]
    public void A_settlement_cannot_accept_its_own_offer()
    {
        var poster = Village(HexCoord.Origin);
        var offer = PostedOffer(poster, out poster);

        var decision = offer.PlanAccept(
            poster, poster, isGuildTrade: false, T0, Guid.CreateVersion7(), Guid.CreateVersion7());

        Assert.Equal(TradeRejection.OwnOffer, decision.Rejection);
    }

    [Fact]
    public void Accepting_is_refused_outside_the_posters_trade_radius()
    {
        var poster = Village(new HexCoord(0, 0));
        var offer = PostedOffer(poster, out poster);

        // Trade radius is 3 + longhouse level (5) = 8.
        var farAway = Village(new HexCoord(9, 0));
        var decision = offer.PlanAccept(
            poster, farAway, isGuildTrade: false, T0, Guid.CreateVersion7(), Guid.CreateVersion7());

        Assert.Equal(TradeRejection.OutOfRange, decision.Rejection);
    }

    [Fact]
    public void Accepting_a_guild_only_offer_without_being_guild_mates_is_refused()
    {
        var poster = Village(new HexCoord(0, 0));
        var offer = PostedOffer(
            poster, out poster, offeredResource: TradeResource.Wood, offeredAmount: 400,
            requestedResource: TradeResource.Iron, requestedAmount: 50, guildOnly: true);

        var acceptor = Village(new HexCoord(1, 0));
        var decision = offer.PlanAccept(
            poster, acceptor, isGuildTrade: false, T0, Guid.CreateVersion7(), Guid.CreateVersion7());

        Assert.Equal(TradeRejection.GuildOnlyOffer, decision.Rejection);
    }

    [Fact]
    public void Accepting_a_guild_only_offer_as_a_guild_mate_succeeds()
    {
        var poster = Village(new HexCoord(0, 0));
        var offer = PostedOffer(
            poster, out poster, offeredResource: TradeResource.Wood, offeredAmount: 400,
            requestedResource: TradeResource.Iron, requestedAmount: 50, guildOnly: true);

        var acceptor = Village(new HexCoord(1, 0));
        var decision = offer.PlanAccept(
            poster, acceptor, isGuildTrade: true, T0, Guid.CreateVersion7(), Guid.CreateVersion7());

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
    }

    [Fact]
    public void Accepting_an_offer_that_is_not_open_is_refused()
    {
        var poster = Village(HexCoord.Origin);
        var offer = PostedOffer(poster, out poster);
        var cancelled = offer.Cancel(T0);

        var acceptor = Village(new HexCoord(1, 0));
        var decision = cancelled.PlanAccept(
            poster, acceptor, isGuildTrade: false, T0, Guid.CreateVersion7(), Guid.CreateVersion7());

        Assert.Equal(TradeRejection.OfferNotOpen, decision.Rejection);
    }

    [Fact]
    public void Accepting_after_expiry_is_refused()
    {
        var poster = Village(HexCoord.Origin);
        var offer = PostedOffer(poster, out poster);

        var acceptor = Village(new HexCoord(1, 0));
        var decision = offer.PlanAccept(
            poster, acceptor, isGuildTrade: false, offer.ExpiresAt.AddSeconds(1),
            Guid.CreateVersion7(), Guid.CreateVersion7());

        Assert.Equal(TradeRejection.OfferNotOpen, decision.Rejection);
    }

    [Fact]
    public void Cancelling_an_open_offer_moves_it_to_cancelled()
    {
        var poster = Village(HexCoord.Origin);
        var offer = PostedOffer(poster, out poster);

        var cancelled = offer.Cancel(T0);

        Assert.Equal(TradeOfferState.Cancelled, cancelled.State);
        Assert.False(cancelled.IsOpen(T0));
    }

    [Fact]
    public void Cancelling_an_offer_that_already_moved_on_is_a_no_op()
    {
        var poster = Village(HexCoord.Origin);
        var offer = PostedOffer(poster, out poster);
        var accepted = offer with { State = TradeOfferState.Accepted };

        var stillAccepted = accepted.Cancel(T0);

        Assert.Equal(TradeOfferState.Accepted, stillAccepted.State);
    }

    [Fact]
    public void An_overdue_open_offer_expires_lazily_on_read()
    {
        var poster = Village(HexCoord.Origin);
        var offer = PostedOffer(poster, out poster);

        var stillOpenRecord = offer.ExpireIfDue(offer.ExpiresAt.AddSeconds(-1));
        Assert.Equal(TradeOfferState.Open, stillOpenRecord.State);

        var expired = offer.ExpireIfDue(offer.ExpiresAt);
        Assert.Equal(TradeOfferState.Expired, expired.State);
    }

    [Fact]
    public void Two_shipments_from_an_accept_deliver_via_deposit_at_arrival()
    {
        var poster = Village(new HexCoord(0, 0));
        var offer = PostedOffer(poster, out poster, offeredAmount: 400, requestedAmount: 200);

        var acceptor = Village(new HexCoord(2, 0));
        var decision = offer.PlanAccept(
            poster, acceptor, isGuildTrade: false, T0, Guid.CreateVersion7(), Guid.CreateVersion7());
        var settledAcceptor = TradeOffer.Accept(acceptor, decision, T0);

        var toAcceptor = decision.ToAcceptor!;
        var toPoster = decision.ToPoster!;

        var deliveredAcceptor = settledAcceptor.Resources.Deposit(
            toAcceptor.CargoResource.Only(toAcceptor.CargoAmount), toAcceptor.Movement.ArrivesAt);
        var deliveredPoster = poster.Resources.Deposit(
            toPoster.CargoResource.Only(toPoster.CargoAmount), toPoster.Movement.ArrivesAt);

        Assert.True(toAcceptor.HasArrived(toAcceptor.Movement.ArrivesAt));
        Assert.Equal(
            settledAcceptor.Resources.At(toAcceptor.Movement.ArrivesAt).Wood + 400,
            deliveredAcceptor.At(toAcceptor.Movement.ArrivesAt).Wood, 6);
        Assert.Equal(
            poster.Resources.At(toPoster.Movement.ArrivesAt).Iron + 200,
            deliveredPoster.At(toPoster.Movement.ArrivesAt).Iron, 6);
    }

    [Fact]
    public void A_trade_report_captures_both_sides_and_the_slower_legs_travel_time()
    {
        var poster = Village(new HexCoord(0, 0));
        var offer = PostedOffer(poster, out poster, offeredAmount: 400, requestedAmount: 200);

        var acceptor = Village(new HexCoord(2, 0));
        var decision = offer.PlanAccept(
            poster, acceptor, isGuildTrade: false, T0, Guid.CreateVersion7(), Guid.CreateVersion7());

        var report = TradeReport.From(Guid.CreateVersion7(), decision.Offer!, decision.ToAcceptor!, decision.ToPoster!, guildTrade: false);

        Assert.Equal(offer.Id, report.OfferId);
        Assert.Equal(poster.Id, report.PosterSettlementId);
        Assert.Equal(acceptor.Id, report.AcceptorSettlementId);
        Assert.Equal(TradeResource.Wood, report.OfferedResource);
        Assert.Equal(400, report.OfferedAmount);
        Assert.Equal(TradeResource.Iron, report.RequestedResource);
        Assert.Equal(200, report.RequestedAmount);
        Assert.False(report.GuildTrade);

        var expectedHours = (decision.ToAcceptor!.Movement.ArrivesAt - T0).TotalHours;
        Assert.Equal(expectedHours, report.TravelHours, 6);
        Assert.Equal(decision.ToAcceptor.Movement.ArrivesAt, report.CompletedAt);
    }
}
