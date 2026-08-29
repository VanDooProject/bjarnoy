using Bjarnoy.Domain.Economy;

namespace Bjarnoy.Domain.Shrines;

/// <summary>
/// A percentage bonus a shrine's own favour or a slotted rune contributes.
/// </summary>
/// <remarks>
/// Unlike a <c>BuildingDefinition</c>'s <c>ProductionPerHour</c> and
/// <c>StorageCapacity</c>, which are flat amounts added to a settlement's
/// totals, this is a fraction — 0.10 means "+10%" — applied on top of those
/// additive totals. It is the game's first multiplicative modifier; see
/// <c>Settlement.CurrentTotals</c>.
/// </remarks>
/// <param name="ProductionBonus">
/// Per-resource production bonus, e.g. <c>Wood: 0.10</c> for +10% wood.
/// </param>
/// <param name="StorageBonus">Overall storage capacity bonus, e.g. 0.10 for +10%.</param>
public readonly record struct ShrineEffect(ResourceAmounts ProductionBonus, double StorageBonus)
{
    public static ShrineEffect Zero => default;

    public static ShrineEffect operator +(ShrineEffect a, ShrineEffect b) =>
        new(a.ProductionBonus + b.ProductionBonus, a.StorageBonus + b.StorageBonus);

    /// <summary>
    /// Clamps every component to <paramref name="maxProductionBonus"/> /
    /// <paramref name="maxStorageBonus"/> — the stacking cap so a settlement
    /// cannot chase an unbounded percentage by hoarding runes.
    /// </summary>
    public ShrineEffect Capped(double maxProductionBonus, double maxStorageBonus) => new(
        new ResourceAmounts(
            Math.Min(ProductionBonus.Wood, maxProductionBonus),
            Math.Min(ProductionBonus.Stone, maxProductionBonus),
            Math.Min(ProductionBonus.Food, maxProductionBonus),
            Math.Min(ProductionBonus.Iron, maxProductionBonus)),
        Math.Min(StorageBonus, maxStorageBonus));
}
