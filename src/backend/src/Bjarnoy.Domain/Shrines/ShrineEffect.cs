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
/// <param name="LandAttackBonus">
/// Attack bonus for every non-<see cref="Units.UnitClass.Ship"/>,
/// non-<see cref="Units.UnitClass.Civilian"/> unit, e.g. 0.10 for +10% —
/// Thor's domain.
/// </param>
/// <param name="ShipAttackBonus">
/// Attack bonus for <see cref="Units.UnitClass.Ship"/> units, e.g. 0.10 for
/// +10% — Njörd's domain.
/// </param>
public readonly record struct ShrineEffect(
    ResourceAmounts ProductionBonus, double StorageBonus, double LandAttackBonus = 0, double ShipAttackBonus = 0)
{
    public static ShrineEffect Zero => default;

    public static ShrineEffect operator +(ShrineEffect a, ShrineEffect b) => new(
        a.ProductionBonus + b.ProductionBonus,
        a.StorageBonus + b.StorageBonus,
        a.LandAttackBonus + b.LandAttackBonus,
        a.ShipAttackBonus + b.ShipAttackBonus);

    /// <summary>
    /// Clamps every component to <paramref name="maxProductionBonus"/> /
    /// <paramref name="maxStorageBonus"/> / <paramref name="maxAttackBonus"/>
    /// — the stacking cap so a settlement cannot chase an unbounded
    /// percentage by hoarding runes.
    /// </summary>
    public ShrineEffect Capped(double maxProductionBonus, double maxStorageBonus, double maxAttackBonus) => new(
        new ResourceAmounts(
            Math.Min(ProductionBonus.Wood, maxProductionBonus),
            Math.Min(ProductionBonus.Stone, maxProductionBonus),
            Math.Min(ProductionBonus.Food, maxProductionBonus),
            Math.Min(ProductionBonus.Iron, maxProductionBonus)),
        Math.Min(StorageBonus, maxStorageBonus),
        Math.Min(LandAttackBonus, maxAttackBonus),
        Math.Min(ShipAttackBonus, maxAttackBonus));
}
