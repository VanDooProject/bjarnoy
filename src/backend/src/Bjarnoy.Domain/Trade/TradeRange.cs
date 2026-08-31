using Bjarnoy.Domain.Buildings;

namespace Bjarnoy.Domain.Trade;

/// <summary>
/// "Others (in range) can view and accept" — mirrors <see cref="Settlement.Claims"/>:
/// a straight-line hex-distance predicate, cheap enough to evaluate for a whole
/// map query. The cart itself still walks the real path (see <see cref="CartMovement"/>).
/// </summary>
public static class TradeRangeExtensions
{
    /// <summary>Trade radius at longhouse level 0; grows with the longhouse like <see cref="Settlement.ClaimRadius"/>.</summary>
    public const int BaseTradeRadius = 3;

    /// <summary>
    /// How far this settlement's board (today the longhouse, later a Market —
    /// see issue #46 §8) broadcasts its offers.
    /// </summary>
    public static int TradeRadius(this Settlement settlement) =>
        BaseTradeRadius + settlement.LonghouseLevel;

    /// <summary>
    /// Whether <paramref name="other"/> is within <paramref name="poster"/>'s
    /// trade radius. Deliberately asymmetric — the radius belongs to the
    /// poster's board, not to the settlement asking.
    /// </summary>
    public static bool InTradeRange(this Settlement poster, Settlement other) =>
        poster.Centre.DistanceTo(other.Centre) <= poster.TradeRadius();
}
