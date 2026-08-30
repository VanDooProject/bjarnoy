using Bjarnoy.Domain.Trade;

namespace Bjarnoy.Domain.Tests;

public class TradeRatioTests
{
    [Theory]
    [InlineData(400, 200)] // 2:1, exactly at the open-market limit
    [InlineData(200, 400)] // 1:2 the other way
    [InlineData(100, 100)] // 1:1, always fine
    public void Open_market_trades_within_1_to_2_are_accepted(double offered, double requested)
    {
        var rejection = TradeRatio.Validate(
            TradeResource.Wood, offered, TradeResource.Iron, requested, isGuildTrade: false);

        Assert.Equal(TradeRejection.None, rejection);
    }

    [Theory]
    [InlineData(401, 200)]
    [InlineData(200, 401)]
    public void Open_market_trades_beyond_1_to_2_are_rejected(double offered, double requested)
    {
        var rejection = TradeRatio.Validate(
            TradeResource.Wood, offered, TradeResource.Iron, requested, isGuildTrade: false);

        Assert.Equal(TradeRejection.RatioExceeded, rejection);
    }

    [Theory]
    [InlineData(1600, 200)] // 8:1, exactly at the guild limit
    [InlineData(200, 1600)] // 1:8 the other way
    public void Guild_trades_within_1_to_8_are_accepted(double offered, double requested)
    {
        var rejection = TradeRatio.Validate(
            TradeResource.Wood, offered, TradeResource.Iron, requested, isGuildTrade: true);

        Assert.Equal(TradeRejection.None, rejection);
    }

    [Fact]
    public void A_guild_only_ratio_still_rejects_an_open_market_offer_beyond_1_to_2()
    {
        // The wider corridor is a fact about the *pair*, not the resource —
        // an offer must be validated against the lane it was actually posted
        // in, which callers do by passing isGuildTrade for that lane.
        var rejection = TradeRatio.Validate(
            TradeResource.Wood, 1600, TradeResource.Iron, 200, isGuildTrade: false);

        Assert.Equal(TradeRejection.RatioExceeded, rejection);
    }

    [Fact]
    public void Guild_trades_beyond_1_to_8_are_still_rejected()
    {
        var rejection = TradeRatio.Validate(
            TradeResource.Wood, 1601, TradeResource.Iron, 200, isGuildTrade: true);

        Assert.Equal(TradeRejection.RatioExceeded, rejection);
    }

    [Theory]
    [InlineData(0, 100)]
    [InlineData(100, 0)]
    [InlineData(-1, 100)]
    public void Zero_or_negative_amounts_are_rejected(double offered, double requested)
    {
        var rejection = TradeRatio.Validate(
            TradeResource.Wood, offered, TradeResource.Iron, requested, isGuildTrade: false);

        Assert.Equal(TradeRejection.ZeroAmount, rejection);
    }

    [Fact]
    public void Trading_a_resource_for_itself_is_rejected()
    {
        var rejection = TradeRatio.Validate(
            TradeResource.Wood, 100, TradeResource.Wood, 100, isGuildTrade: false);

        Assert.Equal(TradeRejection.SameResource, rejection);
    }
}
