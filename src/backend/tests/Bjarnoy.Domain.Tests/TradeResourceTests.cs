using Bjarnoy.Domain.Trade;

namespace Bjarnoy.Domain.Tests;

public class TradeResourceTests
{
    [Theory]
    [InlineData(TradeResource.Wood, "wood")]
    [InlineData(TradeResource.Stone, "stone")]
    [InlineData(TradeResource.Food, "food")]
    [InlineData(TradeResource.Iron, "iron")]
    public void ToWireName_is_lowercase(TradeResource resource, string expected)
    {
        Assert.Equal(expected, resource.ToWireName());
    }

    [Fact]
    public void Only_holds_just_that_resource()
    {
        var amounts = TradeResource.Iron.Only(150);

        Assert.Equal(0, amounts.Wood);
        Assert.Equal(0, amounts.Stone);
        Assert.Equal(0, amounts.Food);
        Assert.Equal(150, amounts.Iron);
    }

    [Fact]
    public void Amount_reads_back_the_matching_component()
    {
        var amounts = new Economy.ResourceAmounts(1, 2, 3, 4);

        Assert.Equal(1, amounts.Amount(TradeResource.Wood));
        Assert.Equal(2, amounts.Amount(TradeResource.Stone));
        Assert.Equal(3, amounts.Amount(TradeResource.Food));
        Assert.Equal(4, amounts.Amount(TradeResource.Iron));
    }
}
