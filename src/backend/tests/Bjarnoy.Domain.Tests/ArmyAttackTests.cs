using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Attack mission dispatch and battle-arrival tests (issue #40 phase 3).</summary>
public class ArmyAttackTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Home = new(0, 0);
    private static readonly HexCoord TargetHex = new(4, 0);

    private static Func<HexCoord, Terrain> AllGrass() => _ => Terrain.Grass;

    private static Settlement Found(
        Guid? id = null,
        HexCoord? centre = null,
        IReadOnlyList<UnitStack>? garrison = null,
        double food = 1_000_000,
        int longhouseLevel = 5,
        IReadOnlyList<PlacedBuilding>? extraBuildings = null)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);
        var home = centre ?? Home;

        return new Settlement
        {
            Id = id ?? Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = home,
            Buildings = [new PlacedBuilding(home, BuildingType.Longhouse, longhouseLevel), .. extraBuildings ?? []],
            Garrison = garrison ?? [new UnitStack(UnitType.Spearman, 1000), new UnitStack(UnitType.Axeman, 1000)],
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 1_000_000, Stone: 1_000_000, Food: food, Iron: 1_000_000),
                production, capacity, T0),
        };
    }

    private static DispatchDecision DispatchAttack(
        Settlement settlement,
        Guid targetSettlementId,
        double provisions,
        IReadOnlyList<UnitStack>? requested = null,
        HexCoord? targetBuildingCoord = null) => Army.PlanDispatch(
            settlement,
            requested ?? [new UnitStack(UnitType.Axeman, 20)],
            provisions,
            [],
            TargetHex,
            T0,
            Guid.CreateVersion7(),
            AllGrass(),
            ArmyMission.Attack,
            targetSettlementId,
            targetBuildingCoord);

    [Fact]
    public void Attack_dispatch_is_rejected_without_a_target_settlement()
    {
        var settlement = Found();

        var decision = Army.PlanDispatch(
            settlement, [new UnitStack(UnitType.Axeman, 5)], 40, [], TargetHex, T0,
            Guid.CreateVersion7(), AllGrass(), ArmyMission.Attack, targetSettlementId: null);

        Assert.Equal(DispatchRejection.TargetSettlementRequired, decision.Rejection);
    }

    [Fact]
    public void Attack_dispatch_is_rejected_against_ones_own_settlement()
    {
        var settlement = Found();

        var decision = DispatchAttack(settlement, settlement.Id, provisions: 40);

        Assert.Equal(DispatchRejection.CannotAttackOwnSettlement, decision.Rejection);
    }

    [Fact]
    public void Attack_dispatch_produces_an_army_with_the_mission_and_target_recorded()
    {
        var settlement = Found();
        var targetId = Guid.CreateVersion7();

        var decision = DispatchAttack(settlement, targetId, provisions: 100);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(ArmyMission.Attack, decision.Army!.Mission);
        Assert.Equal(targetId, decision.Army.TargetSettlementId);
        Assert.Equal(ResourceAmounts.Zero, decision.Army.Loot);
    }

    [Fact]
    public void SettleArrival_is_a_no_op_before_the_outbound_leg_arrives()
    {
        var settlement = Found();
        var decision = DispatchAttack(settlement, Guid.CreateVersion7(), provisions: 100);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(centre: TargetHex);
        var arrival = Army.SettleArrival(army, defender, defenderSpeedFactor: 1.0, movement.ArrivesAt.AddMinutes(-1), seed: 1);

        Assert.False(arrival.Fought);
        Assert.Same(army, arrival.Army);
        Assert.Null(arrival.Battle);
    }

    [Fact]
    public void An_undefended_target_falls_at_no_cost_and_survivors_start_the_return_leg()
    {
        var settlement = Found();
        var decision = DispatchAttack(settlement, Guid.CreateVersion7(), provisions: 100);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(centre: TargetHex, garrison: []);
        var arrival = Army.SettleArrival(army, defender, defenderSpeedFactor: 1.0, movement.ArrivesAt, seed: 7);

        Assert.True(arrival.Fought);
        Assert.Equal(BattleWinner.Attacker, arrival.Battle!.Winner);
        Assert.NotNull(arrival.Army);

        var survivor = arrival.Army!;
        Assert.Equal(20, survivor.Stacks.Single(s => s.Type == UnitType.Axeman).Count);

        var returning = (ArmyLocation.InTransit)survivor.Location;
        Assert.True(returning.Movement.IsReturning);
        Assert.Equal(movement.ArrivesAt, returning.Movement.DepartedAt);
        Assert.Equal(movement.ReturnPath, returning.Movement.Path);

        // Loot is carried on the army, not yet in any settlement's stock.
        Assert.NotEqual(ResourceAmounts.Zero, survivor.Loot);

        // The defender itself is untouched otherwise — nothing to lose.
        Assert.Empty(arrival.DefenderSettlement.Garrison);
    }

    [Fact]
    public void A_strong_garrison_wipes_out_the_attacker_with_no_return_trip()
    {
        var settlement = Found();
        var decision = DispatchAttack(
            settlement, Guid.CreateVersion7(), provisions: 5, requested: [new UnitStack(UnitType.Spearman, 1)]);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(centre: TargetHex, garrison: [new UnitStack(UnitType.Axeman, 1000)]);
        var arrival = Army.SettleArrival(army, defender, defenderSpeedFactor: 1.0, movement.ArrivesAt, seed: 3);

        Assert.True(arrival.Fought);
        Assert.Equal(BattleWinner.Defender, arrival.Battle!.Winner);
        Assert.Null(arrival.Army);
        Assert.Equal(ResourceAmounts.Zero, arrival.Battle.LootTaken);
    }

    [Fact]
    public void A_near_even_fight_leaves_both_sides_with_real_losses_and_partial_loot_on_the_return_leg()
    {
        var settlement = Found();
        // 20 Axemen (Attack 800) vs a garrison built to survive but be hurt:
        // 20 Spearmen (Defense 700).
        var decision = DispatchAttack(
            settlement, Guid.CreateVersion7(), provisions: 200,
            requested: [new UnitStack(UnitType.Axeman, 20)]);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(centre: TargetHex, garrison: [new UnitStack(UnitType.Spearman, 20)]);
        var arrival = Army.SettleArrival(army, defender, defenderSpeedFactor: 1.0, movement.ArrivesAt, seed: 99);

        Assert.True(arrival.Fought);
        Assert.Equal(BattleWinner.Attacker, arrival.Battle!.Winner);
        Assert.NotNull(arrival.Army);

        var survivor = arrival.Army!;
        var survivorCount = survivor.Stacks.Sum(s => s.Count);
        Assert.InRange(survivorCount, 1, 19); // real losses, not a clean sweep

        Assert.Empty(arrival.DefenderSettlement.Garrison); // attacker won: defender loses everything
        Assert.NotEqual(ResourceAmounts.Zero, survivor.Loot);

        var returning = (ArmyLocation.InTransit)survivor.Location;
        Assert.True(returning.Movement.IsReturning);
    }

    [Fact]
    public void The_defenders_stock_and_garrison_reflect_the_battle_when_read_afterward()
    {
        var settlement = Found();
        var decision = DispatchAttack(settlement, Guid.CreateVersion7(), provisions: 100);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(centre: TargetHex, garrison: [], food: 10_000);
        var lootAvailableBefore = defender.Resources.At(movement.ArrivesAt);

        var arrival = Army.SettleArrival(army, defender, defenderSpeedFactor: 1.0, movement.ArrivesAt, seed: 5);

        var lootTaken = arrival.Battle!.LootTaken;
        Assert.True(lootTaken.Wood > 0 || lootTaken.Stone > 0 || lootTaken.Food > 0 || lootTaken.Iron > 0);

        var stockAfter = arrival.DefenderSettlement.Resources.At(movement.ArrivesAt);
        Assert.Equal(lootAvailableBefore.Wood - lootTaken.Wood, stockAfter.Wood, 4);
        Assert.Equal(lootAvailableBefore.Food - lootTaken.Food, stockAfter.Food, 4);
    }

    [Fact]
    public void Settling_mid_journey_does_not_trigger_a_battle_early()
    {
        var settlement = Found();
        var decision = DispatchAttack(settlement, Guid.CreateVersion7(), provisions: 100);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var midway = movement.DepartedAt + TimeSpan.FromHours(movement.CumulativeHours[^1] / 2.0);
        var defender = Found(centre: TargetHex, garrison: []);

        var arrival = Army.SettleArrival(army, defender, defenderSpeedFactor: 1.0, midway, seed: 1);

        Assert.False(arrival.Fought);
        Assert.Equal(army, arrival.Army);
    }

    [Fact]
    public void Guest_defenders_combine_their_defense_power_with_the_home_garrison()
    {
        var settlement = Found();
        var decision = DispatchAttack(
            settlement, Guid.CreateVersion7(), provisions: 100, requested: [new UnitStack(UnitType.Axeman, 10)]);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(centre: TargetHex, garrison: [new UnitStack(UnitType.Spearman, 10)]);
        var guestDefenders = new[] { new UnitStack(UnitType.Spearman, 10) };

        var withoutGuests = Army.SettleArrival(army, defender, 1.0, movement.ArrivesAt, seed: 1);
        var withGuests = Army.SettleArrival(army, defender, 1.0, movement.ArrivesAt, seed: 1, guestDefenders);

        Assert.True(withGuests.Battle!.DefensePower > withoutGuests.Battle!.DefensePower);
    }

    [Fact]
    public void Defensive_battle_losses_are_split_between_home_and_guest_proportional_to_their_pre_battle_holding()
    {
        var settlement = Found();
        // Strong enough attacker that the defense loses, but not everything —
        // a partial loss actually exercises ProportionalAllocator's split
        // rather than the trivial "100% to everyone" attacker-win case.
        var decision = DispatchAttack(
            settlement, Guid.CreateVersion7(), provisions: 100, requested: [new UnitStack(UnitType.Axeman, 12)]);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        // 30 home Spearmen, 10 guest Spearmen — a 3:1 pre-battle split.
        var defender = Found(centre: TargetHex, garrison: [new UnitStack(UnitType.Spearman, 30)]);
        var guestDefenders = new[] { new UnitStack(UnitType.Spearman, 10) };

        var arrival = Army.SettleArrival(army, defender, 1.0, movement.ArrivesAt, seed: 42, guestDefenders);

        Assert.True(arrival.Fought);
        Assert.Equal(BattleWinner.Defender, arrival.Battle!.Winner);

        var homeSurvivors = arrival.DefenderSettlement.Garrison.Sum(s => s.Count);
        var homeLosses = 30 - homeSurvivors;
        var guestLosses = arrival.GuestLosses.Sum(s => s.Count);

        Assert.True(homeLosses > 0, "expected the home garrison to take some losses");
        Assert.True(guestLosses > 0, "expected the guest to take some losses too — not just the home garrison");

        // Losses split roughly 3:1 (home:guest), matching the 3:1 pre-battle
        // holding — within a unit or two either way from largest-remainder
        // rounding on small counts.
        var ratio = (double)homeLosses / guestLosses;
        Assert.InRange(ratio, 1.5, 6.0);

        // The pooled total the resolver actually computed is fully accounted
        // for between the two sides — nothing lost or double-counted.
        var pooledDefenderLoss = arrival.Battle.DefenderLosses.Sum(s => s.Count);
        Assert.Equal(pooledDefenderLoss, homeLosses + guestLosses);
    }

    [Fact]
    public void An_attacker_win_wipes_out_both_home_and_guest_defenders_fully()
    {
        var settlement = Found();
        var decision = DispatchAttack(settlement, Guid.CreateVersion7(), provisions: 100);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(centre: TargetHex, garrison: [new UnitStack(UnitType.Spearman, 5)]);
        var guestDefenders = new[] { new UnitStack(UnitType.Spearman, 3) };

        var arrival = Army.SettleArrival(army, defender, 1.0, movement.ArrivesAt, seed: 1, guestDefenders);

        Assert.Equal(BattleWinner.Attacker, arrival.Battle!.Winner);
        Assert.Empty(arrival.DefenderSettlement.Garrison); // home wiped
        Assert.Equal(3, arrival.GuestLosses.Single().Count); // guest wiped, exactly its pre-battle count
    }

    [Fact]
    public void Tower_level_raises_the_defense_bonus_applied_in_battle()
    {
        var settlement = Found();
        var decision = DispatchAttack(
            settlement, Guid.CreateVersion7(), provisions: 100, requested: [new UnitStack(UnitType.Axeman, 10)]);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var garrison = new[] { new UnitStack(UnitType.Spearman, 10) };
        var noTower = Found(centre: TargetHex, garrison: garrison);
        var withTower = Found(
            centre: TargetHex, garrison: garrison,
            extraBuildings: [new PlacedBuilding(new HexCoord(99, 99), BuildingType.Tower, 4)]);

        var withoutBonus = Army.SettleArrival(army, noTower, 1.0, movement.ArrivesAt, seed: 1);
        var withBonus = Army.SettleArrival(army, withTower, 1.0, movement.ArrivesAt, seed: 1);

        Assert.Equal(0.0, BuildingCatalogue.TowerDefenseBonusPercent(0));
        Assert.True(withBonus.Battle!.DefensePower > withoutBonus.Battle!.DefensePower);
    }

    // --- Catapult targeting & building destruction (issue #40 phase 5) ---

    /// <summary>
    /// A pure-Catapult army cannot even carry provisions for its own round
    /// trip (Catapult's <c>FoodCarryCapacity</c> is 0), so every siege test
    /// below tags along enough Provisioners (high <c>FoodCarryCapacity</c>,
    /// near-zero combat contribution) to actually clear <c>PlanDispatch</c>'s
    /// food-range check — a real player would do the same.
    /// </summary>
    private static IReadOnlyList<UnitStack> CatapultForce(int catapults) =>
        [new UnitStack(UnitType.Catapult, catapults), new UnitStack(UnitType.Provisioner, catapults)];

    /// <summary>
    /// Comfortably covers <see cref="CatapultForce"/>'s round trip to
    /// <see cref="TargetHex"/> without exceeding either its carry capacity or
    /// <see cref="Found"/>'s default settlement's (fairly modest) food
    /// storage capacity.
    /// </summary>
    private static double ProvisionsFor(int catapults) => 45.0 * catapults;

    /// <summary>Fleet attack shoreline validation (issue #40 phase 6 §4).</summary>
    [Fact]
    public void Fleet_attack_is_accepted_when_the_target_has_a_shoreline_hex()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Karve, 5)]);
        Terrain TerrainAt(HexCoord c) => c == TargetHex ? Terrain.Grass : Terrain.Sea;

        var decision = Army.PlanDispatch(
            settlement, [new UnitStack(UnitType.Karve, 5)], 100, [], TargetHex, T0,
            Guid.CreateVersion7(), TerrainAt, ArmyMission.Attack, Guid.CreateVersion7(),
            targetClaimDiscs: [(TargetHex, 0)]);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
    }

    [Fact]
    public void Fleet_attack_is_rejected_against_a_fully_inland_settlement()
    {
        var settlement = Found(garrison: [new UnitStack(UnitType.Karve, 5)]);
        var landBlob = TargetHex.Neighbours().Append(TargetHex).ToHashSet();
        Terrain TerrainAt(HexCoord c) => landBlob.Contains(c) ? Terrain.Grass : Terrain.Sea;

        var decision = Army.PlanDispatch(
            settlement, [new UnitStack(UnitType.Karve, 5)], 100, [], TargetHex, T0,
            Guid.CreateVersion7(), TerrainAt, ArmyMission.Attack, Guid.CreateVersion7(),
            targetClaimDiscs: [(TargetHex, 0)]);

        Assert.Equal(DispatchRejection.DefenderHasNoShoreline, decision.Rejection);
    }

    [Fact]
    public void A_land_armys_attack_is_unaffected_by_the_shoreline_check()
    {
        // Entirely land terrain, no sea anywhere — a fleet dispatched here
        // would find no shoreline at all, but a land army never even runs
        // that check.
        var settlement = Found();

        var decision = DispatchAttack(settlement, Guid.CreateVersion7(), provisions: 100);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
    }

    [Fact]
    public void A_target_building_may_only_be_named_for_an_attack_mission()
    {
        var settlement = Found();

        var decision = Army.PlanDispatch(
            settlement, [new UnitStack(UnitType.Axeman, 5)], 40, [], TargetHex, T0,
            Guid.CreateVersion7(), AllGrass(), ArmyMission.Move, targetSettlementId: null,
            targetBuildingCoord: new HexCoord(1, 1));

        Assert.Equal(DispatchRejection.TargetBuildingRequiresAttackMission, decision.Rejection);
    }

    [Fact]
    public void An_attack_dispatch_may_name_a_target_building()
    {
        var settlement = Found();
        var targetBuilding = new HexCoord(1, 1);

        var decision = DispatchAttack(settlement, Guid.CreateVersion7(), provisions: 100, targetBuildingCoord: targetBuilding);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(targetBuilding, decision.Army!.TargetBuildingCoord);
    }

    [Fact]
    public void An_attack_dispatch_with_no_target_building_leaves_it_null()
    {
        var settlement = Found();

        var decision = DispatchAttack(settlement, Guid.CreateVersion7(), provisions: 100);

        Assert.Null(decision.Army!.TargetBuildingCoord);
    }

    [Fact]
    public void A_won_battle_with_surviving_catapults_destroys_levels_on_the_named_target()
    {
        var settlement = Found(garrison: CatapultForce(20)); // 800 siege power
        var farmHex = new HexCoord(5, 5);
        var decision = DispatchAttack(
            settlement, Guid.CreateVersion7(), provisions: ProvisionsFor(20),
            requested: CatapultForce(20), targetBuildingCoord: farmHex);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(
            centre: TargetHex, garrison: [],
            extraBuildings: [new PlacedBuilding(farmHex, BuildingType.Farm, 5)]);

        var arrival = Army.SettleArrival(army, defender, 1.0, movement.ArrivesAt, seed: 1);

        Assert.True(arrival.Fought);
        Assert.Equal(BattleWinner.Attacker, arrival.Battle!.Winner);
        Assert.NotNull(arrival.Siege);
        Assert.True(arrival.Siege!.Applied);
        Assert.Equal(farmHex, arrival.Siege.TargetCoord);
        Assert.Equal(BuildingType.Farm, arrival.Siege.TargetType);
        Assert.Equal(0, arrival.Siege.LevelAfter); // 800 siege power vastly exceeds level 5
        Assert.DoesNotContain(arrival.DefenderSettlement.Buildings, b => b.Coord == farmHex);
    }

    [Fact]
    public void An_explicit_target_building_gone_by_arrival_falls_back_to_a_random_pick()
    {
        var settlement = Found(garrison: CatapultForce(20));
        var goneHex = new HexCoord(9, 9); // never actually placed on the defender
        var decision = DispatchAttack(
            settlement, Guid.CreateVersion7(), provisions: ProvisionsFor(20),
            requested: CatapultForce(20), targetBuildingCoord: goneHex);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        // Only the Longhouse stands on the defender; the named target never
        // existed there at all.
        var defender = Found(centre: TargetHex, garrison: []);

        var arrival = Army.SettleArrival(army, defender, 1.0, movement.ArrivesAt, seed: 1);

        Assert.True(arrival.Siege!.Applied);
        Assert.NotEqual(goneHex, arrival.Siege.TargetCoord);
        Assert.Equal(BuildingType.Longhouse, arrival.Siege.TargetType); // the only building actually present
    }

    [Fact]
    public void No_target_building_specified_picks_randomly_but_deterministically_for_a_given_seed()
    {
        var settlement = Found(garrison: CatapultForce(5)); // partial damage, not a clean sweep
        var decision = DispatchAttack(
            settlement, Guid.CreateVersion7(), provisions: ProvisionsFor(5), requested: CatapultForce(5));
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(
            centre: TargetHex, garrison: [],
            extraBuildings:
            [
                new PlacedBuilding(new HexCoord(5, 5), BuildingType.Farm, 3),
                new PlacedBuilding(new HexCoord(6, 6), BuildingType.Tower, 3),
            ]);

        var first = Army.SettleArrival(army, defender, 1.0, movement.ArrivesAt, seed: 123);
        var second = Army.SettleArrival(army, defender, 1.0, movement.ArrivesAt, seed: 123);

        Assert.Equal(first.Siege!.TargetCoord, second.Siege!.TargetCoord);
        Assert.Equal(first.Siege.TargetType, second.Siege.TargetType);
    }

    [Fact]
    public void Destroying_the_longhouse_razes_the_settlement_without_throwing_anywhere_reachable()
    {
        var settlement = Found(garrison: CatapultForce(20)); // 800 siege power
        var decision = DispatchAttack(
            settlement, Guid.CreateVersion7(), provisions: ProvisionsFor(20),
            requested: CatapultForce(20), targetBuildingCoord: TargetHex); // the Longhouse's own hex
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(centre: TargetHex, garrison: [], longhouseLevel: 5);

        var arrival = Army.SettleArrival(army, defender, 1.0, movement.ArrivesAt, seed: 1);

        Assert.True(arrival.Siege!.SettlementRazed);
        Assert.Equal(0, arrival.DefenderSettlement.LonghouseLevel);
        Assert.Equal(1, arrival.DefenderSettlement.ClaimRadius); // 1 + (0 / 2) — the level-0 floor, not a crash
        Assert.Empty(arrival.DefenderSettlement.Buildings);

        // Reading the razed settlement further does not throw anywhere
        // reachable from ordinary settlement operations — the assertion here
        // is just that this call returns at all.
        var resettled = arrival.DefenderSettlement.SettleTo(movement.ArrivesAt.AddHours(1));
        Assert.NotNull(resettled.Settlement);
    }

    [Fact]
    public void A_non_longhouse_building_reduced_to_zero_is_removed_and_the_hex_freed_but_the_settlement_is_not_razed()
    {
        var settlement = Found(garrison: CatapultForce(20));
        var towerHex = new HexCoord(3, 3);
        var decision = DispatchAttack(
            settlement, Guid.CreateVersion7(), provisions: ProvisionsFor(20),
            requested: CatapultForce(20), targetBuildingCoord: towerHex);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(
            centre: TargetHex, garrison: [],
            extraBuildings: [new PlacedBuilding(towerHex, BuildingType.Tower, 3)]);

        var arrival = Army.SettleArrival(army, defender, 1.0, movement.ArrivesAt, seed: 1);

        Assert.False(arrival.Siege!.SettlementRazed);
        Assert.DoesNotContain(arrival.DefenderSettlement.Buildings, b => b.Coord == towerHex);
        Assert.True(arrival.DefenderSettlement.LonghouseLevel > 0);
    }

    [Fact]
    public void Defender_win_never_applies_siege_damage_even_when_the_attacker_brought_catapults()
    {
        var settlement = Found(garrison: CatapultForce(1)); // trivially weak attack
        var decision = DispatchAttack(
            settlement, Guid.CreateVersion7(), provisions: ProvisionsFor(1),
            requested: CatapultForce(1));
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(centre: TargetHex, garrison: [new UnitStack(UnitType.Axeman, 1000)]);

        var arrival = Army.SettleArrival(army, defender, 1.0, movement.ArrivesAt, seed: 1);

        Assert.Equal(BattleWinner.Defender, arrival.Battle!.Winner);
        Assert.NotNull(arrival.Siege);
        Assert.False(arrival.Siege!.Applied);
        Assert.Equal(defender.Buildings.Count, arrival.DefenderSettlement.Buildings.Count);
    }

    // --- Raid mission (issue #40 phase 7) ---

    private static DispatchDecision DispatchRaid(
        Settlement settlement,
        Guid targetSettlementId,
        double provisions,
        IReadOnlyList<UnitStack>? requested = null,
        HexCoord? targetBuildingCoord = null) => Army.PlanDispatch(
            settlement,
            requested ?? [new UnitStack(UnitType.Axeman, 20)],
            provisions,
            [],
            TargetHex,
            T0,
            Guid.CreateVersion7(),
            AllGrass(),
            ArmyMission.Raid,
            targetSettlementId,
            targetBuildingCoord);

    [Fact]
    public void Raid_dispatch_is_rejected_without_a_target_settlement()
    {
        var settlement = Found();

        var decision = Army.PlanDispatch(
            settlement, [new UnitStack(UnitType.Axeman, 5)], 40, [], TargetHex, T0,
            Guid.CreateVersion7(), AllGrass(), ArmyMission.Raid, targetSettlementId: null);

        Assert.Equal(DispatchRejection.TargetSettlementRequired, decision.Rejection);
    }

    [Fact]
    public void Raid_dispatch_is_rejected_against_ones_own_settlement()
    {
        var settlement = Found();

        var decision = DispatchRaid(settlement, settlement.Id, provisions: 40);

        Assert.Equal(DispatchRejection.CannotAttackOwnSettlement, decision.Rejection);
    }

    [Fact]
    public void Raid_dispatch_produces_an_army_with_the_mission_and_target_recorded()
    {
        var settlement = Found();
        var targetId = Guid.CreateVersion7();

        var decision = DispatchRaid(settlement, targetId, provisions: 100);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(ArmyMission.Raid, decision.Army!.Mission);
        Assert.Equal(targetId, decision.Army.TargetSettlementId);
    }

    [Fact]
    public void A_raid_dispatch_may_also_name_a_target_building_just_like_attack()
    {
        var settlement = Found();
        var targetBuilding = new HexCoord(1, 1);

        var decision = DispatchRaid(settlement, Guid.CreateVersion7(), provisions: 100, targetBuildingCoord: targetBuilding);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        Assert.Equal(targetBuilding, decision.Army!.TargetBuildingCoord);
    }

    [Fact]
    public void SettleArrival_fights_a_raid_army_on_arrival_just_like_an_attack()
    {
        var settlement = Found();
        var decision = DispatchRaid(settlement, Guid.CreateVersion7(), provisions: 100);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(centre: TargetHex, garrison: [new UnitStack(UnitType.Spearman, 20)]);
        var arrival = Army.SettleArrival(army, defender, defenderSpeedFactor: 1.0, movement.ArrivesAt, seed: 1);

        Assert.True(arrival.Fought);
        Assert.NotNull(arrival.Battle);
    }

    [Fact]
    public void A_raid_that_wins_leaves_the_defender_with_survivors_unlike_a_plain_attack_win()
    {
        var settlement = Found();
        var requested = new[] { new UnitStack(UnitType.Axeman, 30) };
        var defenderGarrison = new[] { new UnitStack(UnitType.Spearman, 20) };

        var raidDecision = DispatchRaid(settlement, Guid.CreateVersion7(), provisions: 200, requested: requested);
        var raidArmy = raidDecision.Army!;
        var raidMovement = ((ArmyLocation.InTransit)raidArmy.Location).Movement;
        var raidDefender = Found(centre: TargetHex, garrison: defenderGarrison);
        var raidArrival = Army.SettleArrival(raidArmy, raidDefender, 1.0, raidMovement.ArrivesAt, seed: 7);

        var attackDecision = DispatchAttack(settlement, Guid.CreateVersion7(), provisions: 200, requested: requested);
        var attackArmy = attackDecision.Army!;
        var attackMovement = ((ArmyLocation.InTransit)attackArmy.Location).Movement;
        var attackDefender = Found(centre: TargetHex, garrison: defenderGarrison);
        var attackArrival = Army.SettleArrival(attackArmy, attackDefender, 1.0, attackMovement.ArrivesAt, seed: 7);

        Assert.Equal(BattleWinner.Attacker, raidArrival.Battle!.Winner);
        Assert.Equal(BattleWinner.Attacker, attackArrival.Battle!.Winner);

        Assert.Empty(attackArrival.DefenderSettlement.Garrison); // a plain attack win wipes the defender
        Assert.NotEmpty(raidArrival.DefenderSettlement.Garrison); // a raid win leaves survivors
    }

    [Fact]
    public void A_won_raid_still_carries_loot_home_on_the_return_leg()
    {
        var settlement = Found();
        var decision = DispatchRaid(settlement, Guid.CreateVersion7(), provisions: 100);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(centre: TargetHex, garrison: []);
        var arrival = Army.SettleArrival(army, defender, 1.0, movement.ArrivesAt, seed: 7);

        Assert.Equal(BattleWinner.Attacker, arrival.Battle!.Winner);
        Assert.NotNull(arrival.Army);
        Assert.NotEqual(ResourceAmounts.Zero, arrival.Army!.Loot);
    }

    [Fact]
    public void Existing_attack_behavior_is_unaffected_by_the_raid_mission_existing()
    {
        // Regression: dispatching and resolving an ordinary Attack still
        // behaves exactly as before Raid was added.
        var settlement = Found();
        var decision = DispatchAttack(settlement, Guid.CreateVersion7(), provisions: 100);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(centre: TargetHex, garrison: []);
        var arrival = Army.SettleArrival(army, defender, defenderSpeedFactor: 1.0, movement.ArrivesAt, seed: 7);

        Assert.True(arrival.Fought);
        Assert.Equal(BattleWinner.Attacker, arrival.Battle!.Winner);
        Assert.Empty(arrival.DefenderSettlement.Garrison); // a plain attack still wipes an empty garrison out fully
    }

    [Fact]
    public void Destroying_the_defenders_only_farm_reduces_its_food_production_rate_on_the_next_settle()
    {
        var settlement = Found(garrison: CatapultForce(20)); // 800 siege power
        var farmHex = new HexCoord(5, 5);
        var decision = DispatchAttack(
            settlement, Guid.CreateVersion7(), provisions: ProvisionsFor(20),
            requested: CatapultForce(20), targetBuildingCoord: farmHex);
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var defender = Found(
            centre: TargetHex, garrison: [],
            extraBuildings: [new PlacedBuilding(farmHex, BuildingType.Farm, 5)]);
        var foodRateBefore = defender.CurrentTotals().ProductionPerHour.Food;

        var arrival = Army.SettleArrival(army, defender, 1.0, movement.ArrivesAt, seed: 1);

        Assert.True(arrival.Siege!.Applied);
        Assert.Equal(BuildingType.Farm, arrival.Siege.TargetType);

        // Settlement.SettleTo already recomputed production from the reduced
        // Buildings list as part of SettleArrival — no extra code needed for
        // this to fall out, just confirming it actually does.
        var foodRateAfter = arrival.DefenderSettlement.Resources.RatePerHour.Food;
        Assert.True(foodRateAfter < foodRateBefore, "destroying the only Farm should reduce the food rate");

        // Settling further forward stays consistent — reading it again does
        // not silently un-apply the damage.
        var resettled = arrival.DefenderSettlement.SettleTo(movement.ArrivesAt.AddHours(2)).Settlement;
        Assert.Equal(foodRateAfter, resettled.Resources.RatePerHour.Food, 6);
    }

    /// <summary>
    /// Issue #158: a raid taking the defender's stock below what the waiting
    /// (premium) queue has reserved drops the first unfunded order and every
    /// order behind it, at the instant of the raid.
    /// </summary>
    [Fact]
    public void A_raid_dropping_the_stock_below_reservations_prunes_the_waiting_queue()
    {
        var (production, _) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        var farmCost = BuildingCatalogue.Get(BuildingType.Farm, 1).Cost;

        // Enough stock to cover two active builds (already spent, filling
        // both construction slots) plus two more orders' reservations, with
        // nothing to spare.
        var defenderStock = farmCost * 4;
        var defender = new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Target",
            Centre = TargetHex,
            Buildings = [new PlacedBuilding(TargetHex, BuildingType.Longhouse, 1)],
            Garrison = [],
            Resources = ResourcePool.Create(
                defenderStock, production, ResourceAmounts.Uniform(10_000), T0),
        };

        var neighbours = TargetHex.Neighbours();

        // Fill both construction slots first, so the next two orders have
        // nowhere to go but the waiting queue.
        var active1 = defender.PlanBuild(
            BuildingType.Farm, neighbours[0], Terrain.Grass, T0, Guid.CreateVersion7());
        var withActive1 = defender.Enqueue(active1.Order!, T0);
        var active2 = withActive1.PlanBuild(
            BuildingType.Farm, neighbours[1], Terrain.Grass, T0, Guid.CreateVersion7());
        var withActive2 = withActive1.Enqueue(active2.Order!, T0);
        Assert.Equal(0, withActive2.FreeSlots);

        var waitingA = withActive2.PlanBuild(
            BuildingType.Farm, neighbours[2], Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 3);
        Assert.True(waitingA.Accepted, $"expected accept, got {waitingA.Rejection}");
        Assert.True(waitingA.Order!.IsWaiting);
        var withA = withActive2.Enqueue(waitingA.Order!, T0);
        var waitingB = withA.PlanBuild(
            BuildingType.Farm, neighbours[3], Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 3);
        Assert.True(waitingB.Accepted, $"expected accept, got {waitingB.Rejection}");
        Assert.True(waitingB.Order!.IsWaiting);
        var withBoth = withA.Enqueue(waitingB.Order!, T0);

        Assert.Equal(2, withBoth.WaitingOrders.Count());
        Assert.Equal(farmCost.Wood * 2, withBoth.ReservedResources.Wood, 6);

        var defender2 = withBoth;

        // A large, undefended raid: carry capacity comfortably exceeds the
        // defender's entire stock, so essentially everything is looted.
        var attackerHome = Found(garrison: [new UnitStack(UnitType.Axeman, 500)]);
        var decision = DispatchAttack(
            attackerHome, defender.Id, provisions: 1000, requested: [new UnitStack(UnitType.Axeman, 500)]);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        var army = decision.Army!;
        var movement = ((ArmyLocation.InTransit)army.Location).Movement;

        var arrival = Army.SettleArrival(army, defender2, defenderSpeedFactor: 1.0, movement.ArrivesAt, seed: 11);

        Assert.True(arrival.Fought);
        Assert.Equal(BattleWinner.Attacker, arrival.Battle!.Winner);
        Assert.NotEqual(ResourceAmounts.Zero, arrival.Battle.LootTaken);

        // Both waiting orders — reserved but never actually deducted — are
        // dropped at the raid's own instant, no refund, nothing else.
        Assert.Empty(arrival.DefenderSettlement.WaitingOrders);
    }
}
