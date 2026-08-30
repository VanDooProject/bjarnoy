using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Trade;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Endpoints;

public static class TradeEndpoints
{
    public static IEndpointRouteBuilder MapTradeEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var settlements = app.MapGroup("/api/v1/settlements")
            .WithApiVersionSet(versionSet)
            .WithTags("Trade");

        settlements.MapPost("/{settlementId:guid}/trade-offers", PostOffer)
            .WithName("PostTradeOffer")
            .WithSummary("Posts a trade offer at the longhouse, escrowing the offered goods.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        settlements.MapGet("/{settlementId:guid}/trade-offers/board", Board)
            .WithName("GetTradeBoard")
            .WithSummary("Open offers this settlement is in range to accept.");

        settlements.MapGet("/{settlementId:guid}/trade-offers/mine", Mine)
            .WithName("GetMyTradeOffers")
            .WithSummary("This settlement's own offers, in any state.");

        settlements.MapGet("/{settlementId:guid}/shipments", Shipments)
            .WithName("GetShipments")
            .WithSummary("Cart shipments in transit either way, and recently delivered ones.");

        settlements.MapGet("/{settlementId:guid}/trade-reports", ListReportsForSettlement)
            .WithName("ListSettlementTradeReports")
            .WithSummary("Lists completed trade reports touching a settlement, as poster or acceptor, newest first.");

        var offers = app.MapGroup("/api/v1/trade-offers")
            .WithApiVersionSet(versionSet)
            .WithTags("Trade");

        offers.MapPost("/{offerId:guid}/accept", Accept)
            .WithName("AcceptTradeOffer")
            .WithSummary("Accepts an open offer, escrowing the acceptor's goods and dispatching both shipments.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        offers.MapPost("/{offerId:guid}/cancel", Cancel)
            .WithName("CancelTradeOffer")
            .WithSummary("Withdraws an open offer and refunds its escrow.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        return app;
    }

    private static async Task<Results<Created<TradeOfferResponse>, NotFound, Conflict<ProblemDetails>, BadRequest<ProblemDetails>>> PostOffer(
        Guid settlementId,
        PostTradeOfferRequest request,
        TradeService trade,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!TryParseResource(request.OfferedResource, out var offered) ||
            !TryParseResource(request.RequestedResource, out var requested))
        {
            return TypedResults.BadRequest(new ProblemDetails
            {
                Title = "Unknown resource.",
                Detail = "Valid: wood, stone, food, iron.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        var result = await trade.PostOfferAsync(
            settlementId, offered, request.OfferedAmount, requested, request.RequestedAmount,
            request.GuildOnly, cancellationToken);

        if (result.Outcome == TradePostOutcome.SettlementNotFound)
        {
            return TypedResults.NotFound();
        }

        if (result.Outcome == TradePostOutcome.WorldPaused)
        {
            return TypedResults.Conflict(WorldPausedProblem());
        }

        if (result.Accepted)
        {
            return TypedResults.Created(
                $"/api/v1/trade-offers/{result.Offer!.Id}", TradeOfferResponse.From(result.Offer));
        }

        return TypedResults.Conflict(Problem("The offer was refused.", result.Rejection));
    }

    private static async Task<Ok<IReadOnlyList<TradeOfferResponse>>> Board(
        Guid settlementId, TradeService trade, CancellationToken cancellationToken)
    {
        var offers = await trade.ListBoardAsync(settlementId, cancellationToken);
        return TypedResults.Ok<IReadOnlyList<TradeOfferResponse>>([.. offers.Select(TradeOfferResponse.From)]);
    }

    private static async Task<Ok<IReadOnlyList<TradeOfferResponse>>> Mine(
        Guid settlementId, TradeService trade, CancellationToken cancellationToken)
    {
        var offers = await trade.ListMineAsync(settlementId, cancellationToken);
        return TypedResults.Ok<IReadOnlyList<TradeOfferResponse>>([.. offers.Select(TradeOfferResponse.From)]);
    }

    private static async Task<Ok<IReadOnlyList<ShipmentResponse>>> Shipments(
        Guid settlementId, TradeService trade, CancellationToken cancellationToken)
    {
        var shipments = await trade.ListShipmentsAsync(settlementId, cancellationToken);
        return TypedResults.Ok<IReadOnlyList<ShipmentResponse>>([.. shipments.Select(ShipmentResponse.From)]);
    }

    private static async Task<Ok<IReadOnlyList<TradeReportResponse>>> ListReportsForSettlement(
        Guid settlementId, TradeService trade, CancellationToken cancellationToken)
    {
        var reports = await trade.ListReportsAsync(settlementId, cancellationToken);
        return TypedResults.Ok<IReadOnlyList<TradeReportResponse>>([.. reports.Select(TradeReportResponse.From)]);
    }

    private static async Task<Results<Ok<TradeAcceptResponse>, NotFound, Conflict<ProblemDetails>>> Accept(
        Guid offerId,
        AcceptTradeOfferRequest request,
        TradeService trade,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await trade.AcceptOfferAsync(offerId, request.AcceptorSettlementId, cancellationToken);

        if (result.Outcome is TradeAcceptOutcome.OfferNotFound or TradeAcceptOutcome.SettlementNotFound)
        {
            return TypedResults.NotFound();
        }

        if (result.Outcome == TradeAcceptOutcome.WorldPaused)
        {
            return TypedResults.Conflict(WorldPausedProblem());
        }

        if (!result.Accepted)
        {
            return TypedResults.Conflict(Problem("The offer could not be accepted.", result.Rejection));
        }

        return TypedResults.Ok(new TradeAcceptResponse(
            TradeOfferResponse.From(result.Offer!),
            ShipmentResponse.From(result.ToAcceptor!),
            ShipmentResponse.From(result.ToPoster!)));
    }

    private static async Task<Results<Ok<TradeOfferResponse>, NotFound, Conflict<ProblemDetails>>> Cancel(
        Guid offerId,
        CancelTradeOfferRequest request,
        TradeService trade,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await trade.CancelOfferAsync(offerId, request.SettlementId, cancellationToken);

        if (result.Outcome == TradeCancelOutcome.OfferNotFound)
        {
            return TypedResults.NotFound();
        }

        if (!result.Accepted)
        {
            return TypedResults.Conflict(new ProblemDetails
            {
                Title = "The offer could not be cancelled.",
                Detail = "It is no longer open — already accepted, expired, or already cancelled.",
                Status = StatusCodes.Status409Conflict,
            });
        }

        return TypedResults.Ok(TradeOfferResponse.From(result.Offer!));
    }

    private static bool TryParseResource(string value, out TradeResource resource)
    {
        foreach (var candidate in Enum.GetValues<TradeResource>())
        {
            if (string.Equals(candidate.ToWireName(), value, StringComparison.OrdinalIgnoreCase))
            {
                resource = candidate;
                return true;
            }
        }

        resource = default;
        return false;
    }

    private static ProblemDetails WorldPausedProblem() => new()
    {
        Title = "The world is not accepting commands.",
        Detail = "It is paused, locked or under maintenance.",
        Status = StatusCodes.Status409Conflict,
    };

    // Every rejection here shares 409, but the frontend needs to tell them
    // apart (e.g. GuildOnlyOffer vs NotEnoughResources call for very
    // different UI reactions) — same reasoning as SettlementEndpoints.Problem.
    private static ProblemDetails Problem(string title, TradeRejection rejection)
    {
        var problem = new ProblemDetails
        {
            Title = title,
            Detail = rejection switch
            {
                TradeRejection.ZeroAmount => "Both amounts must be positive.",
                TradeRejection.SameResource => "Offered and requested resources must differ.",
                TradeRejection.RatioExceeded => "That ratio is outside the allowed corridor.",
                TradeRejection.NotEnoughResources => "Not enough resources.",
                TradeRejection.OutOfRange => "That settlement is out of the poster's trade range.",
                TradeRejection.OfferNotOpen => "The offer is no longer open.",
                TradeRejection.GuildOnlyOffer => "Only guild mates may accept this offer.",
                TradeRejection.OwnOffer => "A settlement cannot accept its own offer.",
                TradeRejection.NotEnoughCarts => "Not enough carts free to carry that amount.",
                TradeRejection.LonghouseTooLow => "The longhouse is not high enough level to trade yet.",
                _ => "Refused.",
            },
            Status = StatusCodes.Status409Conflict,
        };

        problem.Extensions["rejection"] = rejection.ToString();
        return problem;
    }
}
