using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Combat;

/// <summary>
/// The outcome of one attack on a settlement (<see cref="AttackResolver.Resolve"/>): a land army fights one land fight, a fleet
/// first a ship fight and then, with its passengers, a land fight (<c>docs/design/economy.md</c>, "Fleets").
/// </summary>
/// <param name="ShipFight">The attacker's ships against all the defender's ships; <see langword="null"/> when not fought (a land army, or a defender with no ships).</param>
/// <param name="LandFight">The land troops against the defender's land units; <see langword="null"/> when not fought (a fleet without passengers, a lost ship fight, a Dockyard target).</param>
/// <param name="Drowned">The passengers the surviving ships could not carry, drowned before the land fight (or after a lost ship fight).</param>
/// <param name="FireShipsBurned">The Fire Ships burned by the fire damage: the levels taken times ten.</param>
/// <param name="FireSiege">The fire damage to a building standing in the water; <see cref="SiegeOutcome.None"/> when nothing burned.</param>
/// <param name="LandSiege">The siege engines' damage after a won land fight; <see cref="SiegeOutcome.None"/> when none happened.</param>
/// <param name="AttackerLosses">Everything the attacker lost: ship fight, drowned, land fight, burned Fire Ships.</param>
/// <param name="AttackerSurvivors">What sails or walks home.</param>
/// <param name="DefenderHomeLosses">The defender's own garrison's losses, both fights together.</param>
/// <param name="DefenderGuestLosses">The guests' pooled losses, both fights together.</param>
/// <param name="Loot">Taken after a won land fight; capped by the surviving ships' carry capacity for a fleet.</param>
/// <param name="Refill">The food taken from the target's stock first, on top of the loot, to refill the army's provisions (the same won fight as the loot).</param>
/// <param name="Winner">The attacker when no fight was lost (a fight not fought counts as not lost), otherwise the defender.</param>
/// <param name="Buildings">The defender's buildings after both sieges.</param>
public sealed record AttackPlan(
    BattlePlan? ShipFight,
    BattlePlan? LandFight,
    IReadOnlyList<UnitStack> Drowned,
    int FireShipsBurned,
    SiegeOutcome FireSiege,
    SiegeOutcome LandSiege,
    IReadOnlyList<UnitStack> AttackerLosses,
    IReadOnlyList<UnitStack> AttackerSurvivors,
    IReadOnlyList<UnitStack> DefenderHomeLosses,
    IReadOnlyList<UnitStack> DefenderGuestLosses,
    ResourceAmounts Loot,
    double Refill,
    BattleWinner Winner,
    IReadOnlyList<PlacedBuilding> Buildings)
{
    /// <summary>
    /// The attack as one <see cref="BattlePlan"/> for the callers that need a single summary: the final attacker losses and
    /// survivors, the defender's losses and survivors of both fights, the loot, the winner, and the powers of the deciding fight (the
    /// land fight when fought, else the ship fight).
    /// </summary>
    public BattlePlan Overall
    {
        get
        {
            var deciding = LandFight ?? ShipFight;
            return new BattlePlan(
                AttackerLosses,
                AttackerSurvivors,
                [.. (ShipFight?.DefenderLosses ?? []), .. (LandFight?.DefenderLosses ?? [])],
                [.. (ShipFight?.DefenderSurvivors ?? []), .. (LandFight?.DefenderSurvivors ?? [])],
                Loot,
                Winner,
                deciding?.AttackPower ?? 0,
                deciding?.DefensePower ?? 0);
        }
    }
}

/// <summary>
/// Pure resolution of an attack or raid on a settlement: a land army fights the defender's land units; a fleet fights the
/// defender's ships first and, only if that is won (or there is nothing to fight), lands its passengers against the defender's land
/// units. No I/O, no clock — the seed is a parameter, like <see cref="BattleResolver.Resolve"/>. <see cref="Army.SettleArrival"/> is
/// the one caller; the simulator calls it too, so the rules live in one place.
/// </summary>
public static class AttackResolver
{
    /// <param name="attackerStacks">The attacking army as dispatched, at the moment of battle.</param>
    /// <param name="defenderHome">The defender's own garrison, ships included, settled to the battle instant.</param>
    /// <param name="defenderGuests">The guest armies' pooled stacks standing in the settlement, ships included.</param>
    /// <param name="defenseBonusPercent">The tower bonus; applies to both fights.</param>
    /// <param name="lootAvailable">The defender's settled stock at the battle instant.</param>
    /// <param name="raid">A raid caps the losses in both fights (<see cref="BattleResolver.Resolve"/>).</param>
    /// <param name="landAttackBonusPercent">Applies to the land fight only.</param>
    /// <param name="shipAttackBonusPercent">Applies to the ship fight only.</param>
    /// <param name="targetBuildingCoord">The building the army was sent at (<see cref="Army.TargetBuildingCoord"/>).</param>
    /// <param name="defenderBuildings">The defender's buildings as of the battle instant.</param>
    /// <param name="terrainAt">Needed for a fleet: Fire Ships only burn a building standing on a sea hex.</param>
    /// <param name="provisionsAtBattle">The attacker's provisions at the battle instant: a won land fight refills them from the target's food first.</param>
    public static AttackPlan Resolve(
        IReadOnlyList<UnitStack> attackerStacks,
        IReadOnlyList<UnitStack> defenderHome,
        IReadOnlyList<UnitStack> defenderGuests,
        double defenseBonusPercent,
        ResourceAmounts lootAvailable,
        int seed,
        bool raid,
        double landAttackBonusPercent,
        double shipAttackBonusPercent,
        HexCoord? targetBuildingCoord,
        IReadOnlyList<PlacedBuilding> defenderBuildings,
        Func<HexCoord, Terrain>? terrainAt,
        double provisionsAtBattle)
    {
        ArgumentNullException.ThrowIfNull(attackerStacks);
        ArgumentNullException.ThrowIfNull(defenderHome);
        ArgumentNullException.ThrowIfNull(defenderGuests);
        ArgumentNullException.ThrowIfNull(defenderBuildings);

        var homeLand = ShipCargo.Passengers(defenderHome);
        var guestLand = ShipCargo.Passengers(defenderGuests);

        if (ShipCargo.Ships(attackerStacks).Count == 0)
        {
            return ResolveLandArmy(
                attackerStacks, homeLand, guestLand, defenseBonusPercent, lootAvailable, seed, raid, landAttackBonusPercent,
                targetBuildingCoord, defenderBuildings, provisionsAtBattle);
        }

        ArgumentNullException.ThrowIfNull(terrainAt);
        return ResolveFleet(
            attackerStacks, defenderHome, defenderGuests, homeLand, guestLand, defenseBonusPercent, lootAvailable, seed, raid,
            landAttackBonusPercent, shipAttackBonusPercent, targetBuildingCoord, defenderBuildings, terrainAt, provisionsAtBattle);
    }

    private static AttackPlan ResolveLandArmy(
        IReadOnlyList<UnitStack> attackerStacks,
        IReadOnlyList<UnitStack> homeLand,
        IReadOnlyList<UnitStack> guestLand,
        double defenseBonusPercent,
        ResourceAmounts lootAvailable,
        int seed,
        bool raid,
        double landAttackBonusPercent,
        HexCoord? targetBuildingCoord,
        IReadOnlyList<PlacedBuilding> defenderBuildings,
        double provisionsAtBattle)
    {
        var landFight = BattleResolver.Resolve(
            attackerStacks, Army.MergeStacksByType(homeLand, guestLand), defenseBonusPercent, ResourceAmounts.Zero, seed,
            raid, landAttackBonusPercent);

        // The land army carries the loot itself; the food that refills its provisions comes off the top.
        var (loot, refill) = landFight.Winner == BattleWinner.Attacker
            ? BattleResolver.TakeLootAndRefill(
                BattleResolver.CarryCapacity(landFight.AttackerSurvivors), BattleResolver.FoodCapacity(landFight.AttackerSurvivors),
                provisionsAtBattle, lootAvailable)
            : (ResourceAmounts.Zero, 0);
        landFight = landFight with { LootTaken = loot };

        var siege = landFight.Winner == BattleWinner.Attacker
            ? SiegeResolver.Resolve(landFight.AttackerSurvivors, defenderBuildings, targetBuildingCoord, seed)
            : SiegeOutcome.None;

        return new AttackPlan(
            ShipFight: null,
            LandFight: landFight,
            Drowned: [],
            FireShipsBurned: 0,
            FireSiege: SiegeOutcome.None,
            LandSiege: siege,
            AttackerLosses: landFight.AttackerLosses,
            AttackerSurvivors: landFight.AttackerSurvivors,
            DefenderHomeLosses: Army.SplitPooledByOwner(landFight.DefenderLosses, homeLand, guestLand, wantHome: true),
            DefenderGuestLosses: Army.SplitPooledByOwner(landFight.DefenderLosses, homeLand, guestLand, wantHome: false),
            Loot: loot,
            Refill: refill,
            Winner: landFight.Winner,
            Buildings: siege.Applied ? siege.UpdatedBuildings! : defenderBuildings);
    }

    private static AttackPlan ResolveFleet(
        IReadOnlyList<UnitStack> attackerStacks,
        IReadOnlyList<UnitStack> defenderHome,
        IReadOnlyList<UnitStack> defenderGuests,
        IReadOnlyList<UnitStack> homeLand,
        IReadOnlyList<UnitStack> guestLand,
        double defenseBonusPercent,
        ResourceAmounts lootAvailable,
        int seed,
        bool raid,
        double landAttackBonusPercent,
        double shipAttackBonusPercent,
        HexCoord? targetBuildingCoord,
        IReadOnlyList<PlacedBuilding> defenderBuildings,
        Func<HexCoord, Terrain> terrainAt,
        double provisionsAtBattle)
    {
        var (ships, passengers) = ShipCargo.SplitForFight(attackerStacks);
        var homeShips = ShipCargo.Ships(defenderHome);
        var guestShips = ShipCargo.Ships(defenderGuests);
        var defenderShips = Army.MergeStacksByType(homeShips, guestShips);

        // The ship fight: every attacking ship against every defending ship, home and guest alike. A defender without ships has
        // nobody to fight at sea: no fight, no losses, and it counts as won.
        BattlePlan? shipFight = defenderShips.Count == 0
            ? null
            : BattleResolver.Resolve(
                ships, defenderShips, defenseBonusPercent, ResourceAmounts.Zero, seed, raid,
                landAttackBonusPercent, shipAttackBonusPercent);
        var shipWon = shipFight is null || shipFight.Winner == BattleWinner.Attacker;
        var shipLosses = shipFight?.AttackerLosses ?? [];
        var shipSurvivors = shipFight?.AttackerSurvivors ?? ships;

        // The passengers the surviving ships cannot carry drown, whatever the ship fight's outcome.
        var (kept, drowned) = ShipCargo.DropOverflow(shipSurvivors, passengers);

        var defenderHomeLosses = shipFight is null
            ? []
            : Army.SplitPooledByOwner(shipFight.DefenderLosses, homeShips, guestShips, wantHome: true);
        var defenderGuestLosses = shipFight is null
            ? []
            : Army.SplitPooledByOwner(shipFight.DefenderLosses, homeShips, guestShips, wantHome: false);

        if (!shipWon)
        {
            return new AttackPlan(
                shipFight, LandFight: null, drowned, FireShipsBurned: 0, SiegeOutcome.None, SiegeOutcome.None,
                AttackerLosses: Army.MergeStacksByType(shipLosses, drowned),
                AttackerSurvivors: [.. shipSurvivors, .. kept],
                defenderHomeLosses, defenderGuestLosses, ResourceAmounts.Zero, Refill: 0, BattleWinner.Defender, defenderBuildings);
        }

        // The land fight: what is still aboard against the defender's land units. A Dockyard stands in the water: a fleet sent at it
        // only fights at sea.
        var target = targetBuildingCoord is { } coord ? defenderBuildings.Cast<PlacedBuilding?>().FirstOrDefault(b => b!.Value.Coord == coord) : null;
        var skipLandFight = kept.Count == 0 || target?.Type == BuildingType.Dockyard;
        var landFight = skipLandFight
            ? null
            : BattleResolver.Resolve(
                kept, Army.MergeStacksByType(homeLand, guestLand), defenseBonusPercent, ResourceAmounts.Zero, seed, raid,
                landAttackBonusPercent, shipAttackBonusPercent);
        var landWon = landFight is not null && landFight.Winner == BattleWinner.Attacker;
        var landLost = landFight is not null && !landWon;

        // Fire damage first, then the siege engines on what is left.
        var fireShips = shipSurvivors.Where(s => s.Type == UnitType.FireShip).Sum(s => s.Count);
        var (fireSiege, burned) = SiegeResolver.Burn(fireShips, defenderBuildings, targetBuildingCoord, terrainAt);
        var buildings = fireSiege.Applied ? fireSiege.UpdatedBuildings! : defenderBuildings;

        var landSiege = landWon
            ? SiegeResolver.Resolve(landFight!.AttackerSurvivors, buildings, targetBuildingCoord, seed)
            : SiegeOutcome.None;
        if (landSiege.Applied)
        {
            buildings = landSiege.UpdatedBuildings!;
        }

        IReadOnlyList<UnitStack> burnedStacks = burned > 0 ? [new UnitStack(UnitType.FireShip, burned)] : [];
        var landLosses = landFight?.AttackerLosses ?? [];
        var landPassengers = landFight is null ? kept : landFight.AttackerSurvivors;
        var survivors = (IReadOnlyList<UnitStack>)[.. Army.SubtractStacks(shipSurvivors, burnedStacks), .. landPassengers];

        // A fleet's loot is capped by what its surviving ships carry; the passengers' capacity does not count. The food that
        // refills the provisions of everyone aboard comes off the top.
        var (loot, refill) = landWon
            ? BattleResolver.TakeLootAndRefill(
                BattleResolver.CarryCapacity(shipSurvivors), BattleResolver.FoodCapacity(survivors), provisionsAtBattle, lootAvailable)
            : (ResourceAmounts.Zero, 0);
        if (landFight is not null)
        {
            landFight = landFight with { LootTaken = loot };
        }

        if (landFight is not null)
        {
            defenderHomeLosses = Army.MergeStacksByType(
                defenderHomeLosses, Army.SplitPooledByOwner(landFight.DefenderLosses, homeLand, guestLand, wantHome: true));
            defenderGuestLosses = Army.MergeStacksByType(
                defenderGuestLosses, Army.SplitPooledByOwner(landFight.DefenderLosses, homeLand, guestLand, wantHome: false));
        }

        return new AttackPlan(
            shipFight,
            landFight,
            drowned,
            burned,
            fireSiege,
            landSiege,
            AttackerLosses: Army.MergeStacksByType(Army.MergeStacksByType(shipLosses, drowned), Army.MergeStacksByType(landLosses, burnedStacks)),
            AttackerSurvivors: survivors,
            defenderHomeLosses,
            defenderGuestLosses,
            loot,
            refill,
            landLost ? BattleWinner.Defender : BattleWinner.Attacker,
            buildings);
    }
}
