using Bjarnoy.Domain.Economy;

namespace Bjarnoy.Domain.Trade;

/// <summary>
/// The resource named on one side of a trade offer. A trade is always
/// single-resource-for-single-resource in v1 (see the trade design, issue
/// #46) — <see cref="ResourceAmounts"/> is the four-resource stock/rate type,
/// this is "which one of the four".
/// </summary>
public enum TradeResource
{
    Wood,
    Stone,
    Food,
    Iron,
}

public static class TradeResourceExtensions
{
    /// <summary>The component of <paramref name="amounts"/> named by <paramref name="resource"/>.</summary>
    public static double Amount(this ResourceAmounts amounts, TradeResource resource) => resource switch
    {
        TradeResource.Wood => amounts.Wood,
        TradeResource.Stone => amounts.Stone,
        TradeResource.Food => amounts.Food,
        TradeResource.Iron => amounts.Iron,
        _ => throw new ArgumentOutOfRangeException(nameof(resource), resource, "Unknown trade resource"),
    };

    /// <summary>A <see cref="ResourceAmounts"/> holding only <paramref name="amount"/> of this resource.</summary>
    public static ResourceAmounts Only(this TradeResource resource, double amount) => resource switch
    {
        TradeResource.Wood => new ResourceAmounts(amount, 0, 0, 0),
        TradeResource.Stone => new ResourceAmounts(0, amount, 0, 0),
        TradeResource.Food => new ResourceAmounts(0, 0, amount, 0),
        TradeResource.Iron => new ResourceAmounts(0, 0, 0, amount),
        _ => throw new ArgumentOutOfRangeException(nameof(resource), resource, "Unknown trade resource"),
    };
}
