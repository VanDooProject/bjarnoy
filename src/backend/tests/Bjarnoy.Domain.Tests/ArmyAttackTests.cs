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
        IReadOnlyList<UnitStack>? requested = null) => Army.PlanDispatch(
            settlement,
            requested ?? [new UnitStack(UnitType.Axeman, 20)],
            provisions,
            [],
            TargetHex,
            T0,
            Guid.CreateVersion7(),
            AllGrass(),
            ArmyMission.Attack,
            targetSettlementId);

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
}
