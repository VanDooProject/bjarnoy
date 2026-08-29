namespace Bjarnoy.Domain.Trade;

/// <summary>Why a trade action (post, accept) was refused.</summary>
public enum TradeRejection
{
    None = 0,
    ZeroAmount,
    SameResource,
    RatioExceeded,
    NotEnoughResources,
    OutOfRange,
    OfferNotOpen,
    GuildOnlyOffer,
    OwnOffer,
    NotEnoughCarts,
    LonghouseTooLow,
}
