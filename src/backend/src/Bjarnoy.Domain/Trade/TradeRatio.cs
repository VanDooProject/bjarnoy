namespace Bjarnoy.Domain.Trade;

/// <summary>
/// The trade-ratio rule from the design brief (issue #46): a player may offer
/// at most <see cref="DefaultMaxRatio"/> units of one resource for one unit of
/// another on the open market, or <see cref="GuildMaxRatio"/> between guild
/// mates.
/// </summary>
/// <remarks>
/// A pure function with no guild lookup of its own — <paramref name="isGuildTrade"/>
/// (see <see cref="Validate"/>) is a fact the caller resolves and hands in.
/// There is no Guild domain type yet; the rule will not need to change when
/// one exists; only how the bool is produced will.
/// </remarks>
public static class TradeRatio
{
    /// <summary>Max ratio (offered:requested or requested:offered) on the open market.</summary>
    public const int DefaultMaxRatio = 2;

    /// <summary>Max ratio between guild mates.</summary>
    public const int GuildMaxRatio = 8;

    /// <summary>
    /// Whether an offer of <paramref name="offeredAmount"/> <paramref name="offeredResource"/>
    /// for <paramref name="requestedAmount"/> <paramref name="requestedResource"/> is within the
    /// allowed ratio corridor.
    /// </summary>
    public static TradeRejection Validate(
        TradeResource offeredResource,
        double offeredAmount,
        TradeResource requestedResource,
        double requestedAmount,
        bool isGuildTrade)
    {
        if (offeredAmount <= 0 || requestedAmount <= 0)
        {
            return TradeRejection.ZeroAmount;
        }

        if (offeredResource == requestedResource)
        {
            return TradeRejection.SameResource;
        }

        var maxRatio = isGuildTrade ? GuildMaxRatio : DefaultMaxRatio;

        // Symmetric corridor: at 1:2 you may post 400 for 200 or 200 for 400,
        // but never 500 for 200 in either direction.
        if (offeredAmount > maxRatio * requestedAmount || requestedAmount > maxRatio * offeredAmount)
        {
            return TradeRejection.RatioExceeded;
        }

        return TradeRejection.None;
    }
}
