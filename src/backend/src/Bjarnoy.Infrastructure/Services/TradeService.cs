using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Trade;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Infrastructure.Services;

public enum TradePostOutcome
{
    Applied,
    Rejected,
    SettlementNotFound,
    WorldPaused,
}

public sealed record TradePostResult(
    TradePostOutcome Outcome, TradeOfferEntity? Offer = null, TradeRejection Rejection = TradeRejection.None)
{
    public bool Accepted => Outcome == TradePostOutcome.Applied && Offer is not null;
}

public enum TradeAcceptOutcome
{
    Applied,
    Rejected,
    OfferNotFound,
    SettlementNotFound,
    WorldPaused,
}

public sealed record TradeAcceptResult(
    TradeAcceptOutcome Outcome,
    TradeOfferEntity? Offer = null,
    ShipmentEntity? ToAcceptor = null,
    ShipmentEntity? ToPoster = null,
    TradeRejection Rejection = TradeRejection.None)
{
    public bool Accepted => Outcome == TradeAcceptOutcome.Applied && Offer is not null;
}

public enum TradeCancelOutcome
{
    Applied,
    Rejected,
    OfferNotFound,
}

public sealed record TradeCancelResult(TradeCancelOutcome Outcome, TradeOfferEntity? Offer = null)
{
    public bool Accepted => Outcome == TradeCancelOutcome.Applied && Offer is not null;
}

/// <summary>
/// Trade offers, acceptance, cart shipments and delivery.
/// </summary>
/// <remarks>
/// <para>
/// Follows the same shape as <see cref="SettlementService"/>: every method
/// converts wall time to game time through the settlement's world clock
/// before touching the domain, and a read that finds nothing due writes
/// nothing.
/// </para>
/// <para>
/// Guild membership is not wired up yet — there is no Guild domain type in
/// this codebase (see the design in issue #46 §3). <see cref="AcceptOfferAsync"/>
/// hardcodes <c>isGuildTrade = false</c>, so a <c>GuildOnly</c> offer can be
/// posted but never accepted until a real Guild system lands and this one
/// constant is replaced with a real membership lookup — tracked as phase 5
/// of the trade design.
/// </para>
/// </remarks>
public sealed class TradeService(
    GameDbContext dbContext,
    TimeProvider timeProvider,
    LinkedGroupLoader groups,
    ILogger<TradeService> logger)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly LinkedGroupLoader _groups = groups;
    private readonly ILogger<TradeService> _logger = logger;

    /// <summary>Posts an offer, escrowing the offered goods up front.</summary>
    public async Task<TradePostResult> PostOfferAsync(
        Guid settlementId,
        TradeResource offeredResource,
        double offeredAmount,
        TradeResource requestedResource,
        double requestedAmount,
        bool guildOnly,
        CancellationToken cancellationToken = default)
    {
        // A linked realm trades from its shared stock (docs/design/economy.md section 5): the escrow is drawn from the pool.
        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new TradePostResult(TradePostOutcome.SettlementNotFound);
        }

        var settlement = session.Anchor;
        if (!session.Clock.AllowsCommands)
        {
            return new TradePostResult(TradePostOutcome.WorldPaused);
        }

        var now = session.Now;
        var settled = session.View(settlementId);

        var decision = TradeOffer.Plan(
            Guid.CreateVersion7(), settled, offeredResource, offeredAmount, requestedResource, requestedAmount,
            guildOnly, now);

        if (!decision.Accepted)
        {
            await SaveIfChangedAsync(session, cancellationToken).ConfigureAwait(false);
            return new TradePostResult(TradePostOutcome.Rejected, Rejection: decision.Rejection);
        }

        var paid = TradeOffer.Post(settled, decision.Offer!, now);
        session.Apply(settlementId, paid);
        session.WriteBack();

        var entity = new TradeOfferEntity
        {
            Id = decision.Offer!.Id,
            WorldId = settlement.WorldId,
            PosterSettlementId = settlement.Id,
            OfferedResource = offeredResource,
            OfferedAmount = offeredAmount,
            RequestedResource = requestedResource,
            RequestedAmount = requestedAmount,
            GuildOnly = guildOnly,
            PostedAt = now,
            ExpiresAt = decision.Offer.ExpiresAt,
            State = TradeOfferState.Open,
        };
        _dbContext.TradeOffers.Add(entity);

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Settlement {Id} posted trade offer {OfferId}: {OfferedAmount} {OfferedResource} for {RequestedAmount} {RequestedResource}.",
            settlementId, entity.Id, offeredAmount, offeredResource, requestedAmount, requestedResource);

        return new TradePostResult(TradePostOutcome.Applied, entity);
    }

    /// <summary>Withdraws an open offer, refunding its escrow.</summary>
    public async Task<TradeCancelResult> CancelOfferAsync(
        Guid offerId, Guid settlementId, CancellationToken cancellationToken = default)
    {
        var offerEntity = await _dbContext.TradeOffers
            .FirstOrDefaultAsync(o => o.Id == offerId, cancellationToken).ConfigureAwait(false);

        if (offerEntity is null || offerEntity.PosterSettlementId != settlementId)
        {
            return new TradeCancelResult(TradeCancelOutcome.OfferNotFound);
        }

        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return new TradeCancelResult(TradeCancelOutcome.OfferNotFound);
        }

        var now = session.Now;
        var domainOffer = offerEntity.ToDomain();
        if (!domainOffer.IsOpen(now))
        {
            return new TradeCancelResult(TradeCancelOutcome.Rejected);
        }

        offerEntity.State = domainOffer.Cancel(now).State;

        var settled = session.View(settlementId);
        var refunded = settled with
        {
            Resources = settled.Resources.Deposit(offerEntity.OfferedResource.Only(offerEntity.OfferedAmount), now),
        };
        session.Apply(settlementId, refunded);
        session.WriteBack();

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Trade offer {OfferId} cancelled by settlement {SettlementId}.", offerId, settlementId);

        return new TradeCancelResult(TradeCancelOutcome.Applied, offerEntity);
    }

    /// <summary>Accepts an open offer: escrows the acceptor's goods and dispatches both shipments.</summary>
    public async Task<TradeAcceptResult> AcceptOfferAsync(
        Guid offerId, Guid acceptorSettlementId, CancellationToken cancellationToken = default)
    {
        var offerEntity = await _dbContext.TradeOffers
            .FirstOrDefaultAsync(o => o.Id == offerId, cancellationToken).ConfigureAwait(false);
        if (offerEntity is null)
        {
            return new TradeAcceptResult(TradeAcceptOutcome.OfferNotFound);
        }

        // Both sides trade from their linked realm's shared stock. The acceptor decides the clock; the poster's group is settled
        // to the same instant, and when both settlements belong to one group the session is shared so it is written back once.
        var acceptorSession = await _groups.LoadAsync(acceptorSettlementId, ct: cancellationToken).ConfigureAwait(false);
        if (acceptorSession is null)
        {
            return new TradeAcceptResult(TradeAcceptOutcome.SettlementNotFound);
        }

        var posterSession = acceptorSession.Members.Any(m => m.Id == offerEntity.PosterSettlementId)
            ? acceptorSession
            : await _groups.LoadAsync(offerEntity.PosterSettlementId, acceptorSession.Now, ct: cancellationToken).ConfigureAwait(false);
        if (posterSession is null)
        {
            return new TradeAcceptResult(TradeAcceptOutcome.SettlementNotFound);
        }

        if (!acceptorSession.Clock.AllowsCommands)
        {
            return new TradeAcceptResult(TradeAcceptOutcome.WorldPaused);
        }

        var now = acceptorSession.Now;
        var settledPoster = posterSession.View(offerEntity.PosterSettlementId);
        var settledAcceptor = acceptorSession.View(acceptorSettlementId);

        // No Guild domain exists yet — see the remarks on this class. A
        // GuildOnly offer is therefore always rejected here with
        // GuildOnlyOffer until real membership resolution replaces this.
        const bool isGuildTrade = false;

        var decision = offerEntity.ToDomain().PlanAccept(
            settledPoster, settledAcceptor, isGuildTrade, now, Guid.CreateVersion7(), Guid.CreateVersion7());

        if (!decision.Accepted)
        {
            var changed = posterSession.WriteBack();
            if (!ReferenceEquals(posterSession, acceptorSession))
            {
                changed |= acceptorSession.WriteBack();
            }

            if (changed)
            {
                await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            }

            return new TradeAcceptResult(TradeAcceptOutcome.Rejected, Rejection: decision.Rejection);
        }

        var paidAcceptor = TradeOffer.Accept(settledAcceptor, decision, now);

        posterSession.Apply(offerEntity.PosterSettlementId, settledPoster);
        acceptorSession.Apply(acceptorSettlementId, paidAcceptor);
        posterSession.WriteBack();
        if (!ReferenceEquals(posterSession, acceptorSession))
        {
            acceptorSession.WriteBack();
        }

        offerEntity.State = TradeOfferState.Accepted;

        var toAcceptorEntity = ToEntity(decision.ToAcceptor!);
        var toPosterEntity = ToEntity(decision.ToPoster!);
        _dbContext.Shipments.AddRange(toAcceptorEntity, toPosterEntity);

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "Trade offer {OfferId} accepted by settlement {AcceptorId}; carts dispatched.", offerId, acceptorSettlementId);

        return new TradeAcceptResult(TradeAcceptOutcome.Applied, offerEntity, toAcceptorEntity, toPosterEntity);
    }

    /// <summary>Open offers a settlement may currently see and accept: unexpired, not its own, and in the poster's trade range.</summary>
    public async Task<IReadOnlyList<TradeOfferEntity>> ListBoardAsync(
        Guid settlementId, CancellationToken cancellationToken = default)
    {
        await SettleDeliveriesAsync(settlementId, cancellationToken).ConfigureAwait(false);

        var settlement = await LoadSettlementAsync(settlementId, cancellationToken).ConfigureAwait(false);
        if (settlement?.World is null)
        {
            return [];
        }

        var now = settlement.World.ToClock().ToGameTime(_timeProvider.GetUtcNow());
        var domainSettlement = settlement.ToDomain();

        // SQLite's EF provider cannot translate a DateTimeOffset comparison
        // server-side (see WorldService's due-endboss check for the same
        // workaround), so ExpiresAt is filtered client-side after fetching
        // everything else that's cheap to express in SQL.
        var openOffers = (await _dbContext.TradeOffers
            .Where(o => o.WorldId == settlement.WorldId
                && o.State == TradeOfferState.Open
                && o.PosterSettlementId != settlementId)
            .ToListAsync(cancellationToken).ConfigureAwait(false))
            .Where(o => o.ExpiresAt > now)
            .ToList();

        if (openOffers.Count == 0)
        {
            return [];
        }

        var posterIds = openOffers.Select(o => o.PosterSettlementId).Distinct().ToList();
        var posters = await _dbContext.Settlements
            .Include(s => s.Buildings)
            .Where(s => posterIds.Contains(s.Id))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        var postersById = posters.ToDictionary(p => p.Id);

        // Range is a hex-distance predicate over the whole world's postings,
        // which SQL cannot express portably — same reasoning as
        // SettlementService.FoundAsync's spacing check.
        return
        [
            .. openOffers.Where(o =>
                postersById.TryGetValue(o.PosterSettlementId, out var poster)
                && poster.ToDomain().InTradeRange(domainSettlement)),
        ];
    }

    /// <summary>This settlement's own offers, most recent first, in any state.</summary>
    public async Task<IReadOnlyList<TradeOfferEntity>> ListMineAsync(
        Guid settlementId, CancellationToken cancellationToken = default)
    {
        await SettleDeliveriesAsync(settlementId, cancellationToken).ConfigureAwait(false);
        await SettleExpiriesAsync(settlementId, cancellationToken).ConfigureAwait(false);

        // Ordered client-side: SQLite's EF provider doesn't support
        // DateTimeOffset in ORDER BY at all (a stricter limitation than the
        // WHERE-clause one noted elsewhere in this file).
        var offers = await _dbContext.TradeOffers
            .Where(o => o.PosterSettlementId == settlementId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return [.. offers.OrderByDescending(o => o.PostedAt)];
    }

    /// <summary>Completed trade reports touching this settlement either way, most recently completed first.</summary>
    public async Task<IReadOnlyList<TradeReportEntity>> ListReportsAsync(
        Guid settlementId, CancellationToken cancellationToken = default)
    {
        // Ordered client-side: SQLite's EF provider doesn't support
        // DateTimeOffset in ORDER BY — same workaround as ListMineAsync above.
        var reports = await _dbContext.TradeReports
            .Where(r => r.PosterSettlementId == settlementId || r.AcceptorSettlementId == settlementId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return [.. reports.OrderByDescending(r => r.CompletedAt)];
    }

    /// <summary>Shipments touching this settlement either way, most recently departed first.</summary>
    public async Task<IReadOnlyList<ShipmentEntity>> ListShipmentsAsync(
        Guid settlementId, CancellationToken cancellationToken = default)
    {
        await SettleDeliveriesAsync(settlementId, cancellationToken).ConfigureAwait(false);

        var shipments = await _dbContext.Shipments
            .Where(s => s.FromSettlementId == settlementId || s.ToSettlementId == settlementId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        return [.. shipments.OrderByDescending(s => s.DepartedAt)];
    }

    /// <summary>
    /// Applies any shipments addressed to <paramref name="settlementId"/> that
    /// have arrived: deposits their cargo and marks them delivered. A read
    /// that finds nothing due writes nothing, like every other lazy settle
    /// in this codebase.
    /// </summary>
    public async Task SettleDeliveriesAsync(Guid settlementId, CancellationToken cancellationToken = default)
    {
        // Nothing in transit to this settlement: nothing to load or settle.
        var inbound = await _dbContext.Shipments
            .Where(s => s.ToSettlementId == settlementId && s.DeliveredAt == null)
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        if (inbound.Count == 0)
        {
            return;
        }

        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return;
        }

        var now = session.Now;

        // ArrivesAt is filtered client-side — see the same note in ListBoardAsync.
        var due = inbound.Where(s => s.ArrivesAt <= now).ToList();
        if (due.Count == 0)
        {
            return;
        }

        // The cargo goes into the linked realm's shared stock.
        var settled = session.View(settlementId);
        foreach (var shipment in due)
        {
            settled = settled with
            {
                Resources = settled.Resources.Deposit(
                    shipment.CargoResource.Only(shipment.CargoAmount), shipment.ArrivesAt),
            };
            shipment.DeliveredAt = now;
        }

        session.Apply(settlementId, settled);
        session.WriteBack();

        // Touch every offer whose shipment lands here, in the same save. The
        // poster's and the acceptor's settlements deliver in separate requests;
        // without a shared row each would mark only its own shipment (in its
        // own uncommitted transaction under READ COMMITTED), see the other one
        // still undelivered in TryCompleteOfferAsync, and neither would
        // complete the offer, leaving it Accepted forever. Both writing the
        // offer row makes the second writer wait on the row lock, fail its
        // version check and be retried by ConcurrentWriteExecutor, this time
        // seeing both deliveries.
        var offerIds = due.Select(s => s.OfferId).Distinct().ToList();
        var offers = await _dbContext.TradeOffers
            .Where(o => offerIds.Contains(o.Id))
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        foreach (var offer in offers)
        {
            offer.Version = Guid.NewGuid();
        }

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Settlement {Id} received {Count} shipment(s).", settlementId, due.Count);

        foreach (var offerId in offerIds)
        {
            await TryCompleteOfferAsync(offerId, cancellationToken).ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Once both legs of a trade have landed, writes the <see cref="TradeReport"/>
    /// and flips the offer to Delivered. A no-op if either leg is still in
    /// transit or a report already exists (the other settlement's delivery
    /// may have gotten here first).
    /// </summary>
    private async Task TryCompleteOfferAsync(Guid offerId, CancellationToken cancellationToken)
    {
        var alreadyReported = await _dbContext.TradeReports
            .AnyAsync(r => r.OfferId == offerId, cancellationToken).ConfigureAwait(false);
        if (alreadyReported)
        {
            return;
        }

        var shipments = await _dbContext.Shipments
            .Where(s => s.OfferId == offerId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        if (shipments.Count < 2 || shipments.Any(s => s.DeliveredAt is null))
        {
            return;
        }

        var offerEntity = await _dbContext.TradeOffers
            .FirstOrDefaultAsync(o => o.Id == offerId, cancellationToken).ConfigureAwait(false);
        if (offerEntity is null)
        {
            return;
        }

        var toAcceptor = shipments.First(s => s.FromSettlementId == offerEntity.PosterSettlementId);
        var toPoster = shipments.First(s => s.FromSettlementId != offerEntity.PosterSettlementId);

        var domainOffer = offerEntity.ToDomain();
        var report = TradeReport.From(
            Guid.CreateVersion7(), domainOffer, toAcceptor.ToDomain(), toPoster.ToDomain(),
            guildTrade: domainOffer.GuildOnly);

        _dbContext.TradeReports.Add(new TradeReportEntity
        {
            Id = report.Id,
            OfferId = report.OfferId,
            CompletedAt = report.CompletedAt,
            PosterSettlementId = report.PosterSettlementId,
            AcceptorSettlementId = report.AcceptorSettlementId,
            OfferedResource = report.OfferedResource,
            OfferedAmount = report.OfferedAmount,
            RequestedResource = report.RequestedResource,
            RequestedAmount = report.RequestedAmount,
            GuildTrade = report.GuildTrade,
            TravelHours = report.TravelHours,
        });
        offerEntity.State = TradeOfferState.Delivered;

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Flips this settlement's overdue open offers to Expired and refunds their escrow.</summary>
    private async Task SettleExpiriesAsync(Guid settlementId, CancellationToken cancellationToken)
    {
        var open = await _dbContext.TradeOffers
            .Where(o => o.PosterSettlementId == settlementId && o.State == TradeOfferState.Open)
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        if (open.Count == 0)
        {
            return;
        }

        var session = await _groups.LoadAsync(settlementId, ct: cancellationToken).ConfigureAwait(false);
        if (session is null)
        {
            return;
        }

        var now = session.Now;

        // ExpiresAt is filtered client-side — see the same note in ListBoardAsync.
        var overdue = open.Where(o => o.ExpiresAt <= now).ToList();
        if (overdue.Count == 0)
        {
            return;
        }

        // The escrow goes back into the linked realm's shared stock.
        var settled = session.View(settlementId);
        foreach (var offer in overdue)
        {
            settled = settled with
            {
                Resources = settled.Resources.Deposit(offer.OfferedResource.Only(offer.OfferedAmount), now),
            };
            offer.State = TradeOfferState.Expired;
        }

        session.Apply(settlementId, settled);
        session.WriteBack();
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }

    private static ShipmentEntity ToEntity(Shipment shipment) => new()
    {
        Id = shipment.Id,
        OfferId = shipment.OfferId,
        FromSettlementId = shipment.FromSettlementId,
        ToSettlementId = shipment.ToSettlementId,
        CargoResource = shipment.CargoResource,
        CargoAmount = shipment.CargoAmount,
        Carts = shipment.Carts,
        FromQ = shipment.Movement.Path[0].Coord.Q,
        FromR = shipment.Movement.Path[0].Coord.R,
        ToQ = shipment.Movement.Path[^1].Coord.Q,
        ToR = shipment.Movement.Path[^1].Coord.R,
        DepartedAt = shipment.Movement.DepartedAt,
        ArrivesAt = shipment.Movement.ArrivesAt,
        ReturnArrivesAtGameTime = shipment.ReturnArrivesAt,
    };

    private Task<SettlementEntity?> LoadSettlementAsync(Guid settlementId, CancellationToken cancellationToken) =>
        _dbContext.Settlements
            .Include(s => s.World)
            .Include(s => s.Buildings)
            .Include(s => s.Queue)
            .Include(s => s.Runes)
            .FirstOrDefaultAsync(s => s.Id == settlementId, cancellationToken);

    /// <summary>Writes the session back and saves when settling changed anything: a real change worth keeping even if the request was refused.</summary>
    private async Task SaveIfChangedAsync(LinkedGroupSession session, CancellationToken cancellationToken)
    {
        if (session.WriteBack())
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
    }
}
