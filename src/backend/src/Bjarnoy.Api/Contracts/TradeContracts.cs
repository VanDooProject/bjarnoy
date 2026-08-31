using System.ComponentModel.DataAnnotations;
using Bjarnoy.Domain.Trade;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.Contracts;

public sealed record PostTradeOfferRequest(
    [property: Required] string OfferedResource,
    [property: Range(0.0001, double.MaxValue)] double OfferedAmount,
    [property: Required] string RequestedResource,
    [property: Range(0.0001, double.MaxValue)] double RequestedAmount,
    bool GuildOnly = false);

/// <param name="AcceptorSettlementId">The settlement accepting the offer — pays the requested side.</param>
public sealed record AcceptTradeOfferRequest([property: Required] Guid AcceptorSettlementId);

/// <param name="SettlementId">Must be the offer's poster, or the cancellation is refused.</param>
public sealed record CancelTradeOfferRequest([property: Required] Guid SettlementId);

public sealed record TradeOfferResponse(
    Guid Id,
    Guid PosterSettlementId,
    string OfferedResource,
    double OfferedAmount,
    string RequestedResource,
    double RequestedAmount,
    bool GuildOnly,
    string State,
    DateTimeOffset PostedAtGameTime,
    DateTimeOffset ExpiresAtGameTime)
{
    public static TradeOfferResponse From(TradeOfferEntity entity)
    {
        ArgumentNullException.ThrowIfNull(entity);

        return new TradeOfferResponse(
            entity.Id,
            entity.PosterSettlementId,
            entity.OfferedResource.ToWireName(),
            entity.OfferedAmount,
            entity.RequestedResource.ToWireName(),
            entity.RequestedAmount,
            entity.GuildOnly,
            entity.State.ToString().ToLowerInvariant(),
            entity.PostedAt,
            entity.ExpiresAt);
    }
}

public sealed record ShipmentResponse(
    Guid Id,
    Guid OfferId,
    Guid FromSettlementId,
    Guid ToSettlementId,
    string CargoResource,
    double CargoAmount,
    int Carts,
    int FromQ,
    int FromR,
    int ToQ,
    int ToR,
    DateTimeOffset DepartedAtGameTime,
    DateTimeOffset ArrivesAtGameTime,
    DateTimeOffset ReturnArrivesAtGameTime,
    bool Delivered)
{
    public static ShipmentResponse From(ShipmentEntity entity)
    {
        ArgumentNullException.ThrowIfNull(entity);

        return new ShipmentResponse(
            entity.Id,
            entity.OfferId,
            entity.FromSettlementId,
            entity.ToSettlementId,
            entity.CargoResource.ToWireName(),
            entity.CargoAmount,
            entity.Carts,
            entity.FromQ,
            entity.FromR,
            entity.ToQ,
            entity.ToR,
            entity.DepartedAt,
            entity.ArrivesAt,
            entity.ReturnArrivesAtGameTime,
            entity.DeliveredAt is not null);
    }
}

public sealed record TradeAcceptResponse(TradeOfferResponse Offer, ShipmentResponse ToAcceptor, ShipmentResponse ToPoster);

/// <summary>Wire shape of a completed <see cref="TradeReport"/> — mirrors <see cref="TradeReportEntity"/>, see design doc §7.</summary>
public sealed record TradeReportResponse(
    Guid Id,
    Guid OfferId,
    DateTimeOffset CompletedAt,
    Guid PosterSettlementId,
    Guid AcceptorSettlementId,
    string OfferedResource,
    double OfferedAmount,
    string RequestedResource,
    double RequestedAmount,
    bool GuildTrade,
    double TravelHours)
{
    public static TradeReportResponse From(TradeReportEntity entity)
    {
        ArgumentNullException.ThrowIfNull(entity);

        return new TradeReportResponse(
            entity.Id,
            entity.OfferId,
            entity.CompletedAt,
            entity.PosterSettlementId,
            entity.AcceptorSettlementId,
            entity.OfferedResource.ToWireName(),
            entity.OfferedAmount,
            entity.RequestedResource.ToWireName(),
            entity.RequestedAmount,
            entity.GuildTrade,
            entity.TravelHours);
    }
}
