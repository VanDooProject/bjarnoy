using Bjarnoy.Domain.Buildings;

namespace Bjarnoy.Domain.Trade;

/// <summary>
/// Trade carts, data-driven like <c>UnitDefinition</c> in issue #40 — a single
/// v1 cart type rather than a full catalogue, since the brief calls for one
/// kind of cart. Which building grants carts and radius is a data fact
/// (<see cref="RequiredLonghouseLevel"/>), not structure: swapping the
/// Longhouse for a future Market is a constant edit, not a code change (issue
/// #46 §8).
/// </summary>
public static class TradeCartCatalogue
{
    public const double SpeedHexesPerHour = 6.0;

    public const double CapacityPerCart = 100.0;

    /// <summary>Minimum longhouse level to post or accept trade offers at all.</summary>
    public const int RequiredLonghouseLevel = 2;

    /// <summary>How many carts a shipment of <paramref name="amount"/> needs.</summary>
    public static int CartsRequired(double amount) =>
        Math.Max(1, (int)Math.Ceiling(amount / CapacityPerCart));

    /// <summary>
    /// The settlement's total cart count, driven by longhouse level for now
    /// (see remarks on <see cref="TradeCartCatalogue"/>).
    /// </summary>
    public static int CartCount(this Settlement settlement) => settlement.LonghouseLevel;
}
