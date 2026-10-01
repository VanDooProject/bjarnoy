using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using MovementRecord = Bjarnoy.Domain.Movement.Movement;

namespace Bjarnoy.Domain.Tests.Camps;

/// <summary>
/// Fleets and the whale road (<c>docs/design/wildlife-camps.md</c>, "Water camps"): the ambush at the camp's own hex,
/// hunting by ship and the dispatch rejections between land units, fleets and land and water camps.
/// </summary>
public class WhaleRoadFleetTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Home = new(0, 0);
    private static readonly HexCoord WhaleHex = new(8, 0);
    private static readonly HexCoord LandCampHex = new(-1, 0);

    // Home and the hex west of it are land, everything else open sea.
    private static Terrain Terr(HexCoord c) => c == Home || c == LandCampHex ? Terrain.Grass : Terrain.Sea;

    private static Camp Whale(int level = 1) => new(WhaleHex, CampFamilies.Whaleroad, level, TileOrientation.SE);

    private static Settlement Found()
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 5)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Home,
            Buildings = [new PlacedBuilding(Home, BuildingType.Longhouse, 5)],
            Garrison = [new UnitStack(UnitType.Longship, 20), new UnitStack(UnitType.Karve, 20), new UnitStack(UnitType.Axeman, 100)],
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 1_000_000, Stone: 1_000_000, Food: 1_000_000, Iron: 1_000_000),
                production, capacity, T0),
        };
    }

    private static DispatchDecision Dispatch(
        UnitStack[] units, HexCoord target, bool targetIsWater, HexCoord? destination = null,
        ArmyMission mission = ArmyMission.Hunt) => Army.PlanDispatch(
            Found(), units, 50, [], destination ?? target, T0, Guid.CreateVersion7(), Terr, mission,
            targetCampCoord: mission == ArmyMission.Hunt ? target : null, targetCampIsWater: targetIsWater);

    private static Army Hunter(UnitStack[]? units = null)
    {
        units ??= [new UnitStack(UnitType.Longship, 5)];
        var food = units.Sum(u => UnitCatalogue.Get(u.Type).FoodCarryCapacity * u.Count);
        var decision = Army.PlanDispatch(
            Found(), units, food, [], WhaleHex, T0, Guid.CreateVersion7(), Terr, ArmyMission.Hunt,
            targetCampCoord: WhaleHex, targetCampIsWater: true);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        return decision.Army!;
    }

    // ---- dispatch ------------------------------------------------------------------------------------------------

    [Fact]
    public void A_fleet_may_hunt_a_water_camp_and_sails_to_its_own_sea_hex()
    {
        var army = Hunter();

        Assert.True(army.IsFleet);
        Assert.Equal(ArmyMission.Hunt, army.Mission);
        Assert.Equal(WhaleHex, army.TargetCampCoord);
        Assert.Equal(WhaleHex, ((ArmyLocation.InTransit)army.Location).Movement.Path[^1]);
        Assert.Equal(WhaleHex, Army.HuntRouteDestination(WhaleHex, Home, Terr, isFleet: true));
    }

    [Fact]
    public void Land_units_cannot_hunt_a_water_camp()
    {
        var decision = Dispatch([new UnitStack(UnitType.Axeman, 10)], WhaleHex, targetIsWater: true);

        Assert.Equal(DispatchRejection.HuntRequiresFleet, decision.Rejection);
    }

    [Fact]
    public void A_fleet_cannot_hunt_a_land_camp()
    {
        var decision = Dispatch([new UnitStack(UnitType.Longship, 5)], LandCampHex, targetIsWater: false);

        Assert.Equal(DispatchRejection.HuntRequiresLandUnits, decision.Rejection);
    }

    [Fact]
    public void Land_units_still_hunt_land_camps_and_a_hunt_needs_a_camp()
    {
        var land = Dispatch([new UnitStack(UnitType.Axeman, 10)], LandCampHex, targetIsWater: false, destination: LandCampHex);
        Assert.True(land.Accepted, $"expected accept, got {land.Rejection}");

        var noCamp = Army.PlanDispatch(
            Found(), [new UnitStack(UnitType.Longship, 5)], 50, [], WhaleHex, T0, Guid.CreateVersion7(), Terr, ArmyMission.Hunt);
        Assert.Equal(DispatchRejection.NoCampAtDestination, noCamp.Rejection);
    }

    [Fact]
    public void A_fleet_hunt_needs_the_round_trip_food()
    {
        var decision = Army.PlanDispatch(
            Found(), [new UnitStack(UnitType.Longship, 5)], 1, [], WhaleHex, T0, Guid.CreateVersion7(), Terr, ArmyMission.Hunt,
            targetCampCoord: WhaleHex, targetCampIsWater: true);

        Assert.Equal(DispatchRejection.InsufficientProvisionsForRoundTrip, decision.Rejection);
    }

    // ---- ambush ----------------------------------------------------------------------------------------------------

    private static MovementRecord SeaRoute(int from = 0, int to = 16, int r = 0)
    {
        var path = Enumerable.Range(from, to - from + 1).Select(q => new HexCoord(q, r)).ToList();
        var hours = Enumerable.Range(0, path.Count).Select(i => (double)i).ToList();
        return new MovementRecord
        {
            DepartedAt = T0,
            Path = path,
            CumulativeHours = hours,
            ReturnPath = [.. path.AsEnumerable().Reverse()],
            ReturnCumulativeHours = hours,
            TurnAroundAt = T0.AddHours(path.Count - 1),
        };
    }

    private static CampAmbushHit? Find(MovementRecord m, Camp camp, CampState? state = null, HexCoord? exempt = null, double untilHours = 48) =>
        CampAmbush.FindEarliest(m, [(camp, state ?? CampState.Pristine(camp, T0.AddDays(-5)))], _ => false, exempt, T0.AddHours(-1), T0.AddHours(untilHours));

    [Fact]
    public void A_fleet_is_ambushed_when_its_route_enters_the_whale_roads_own_hex()
    {
        var hit = Find(SeaRoute(), Whale());

        Assert.NotNull(hit);
        Assert.Equal(WhaleHex, hit.Value.Hex);
        Assert.Equal(T0.AddHours(8), hit.Value.At);
    }

    [Fact]
    public void A_fleet_sailing_past_the_neighbouring_hex_is_not_ambushed()
    {
        Assert.Null(Find(SeaRoute(r: 1), Whale()));
        Assert.Null(Find(SeaRoute(to: 7), Whale()));
    }

    [Fact]
    public void A_calm_whale_road_lets_a_fleet_pass_and_a_hunting_fleet_is_exempt_from_its_own_target()
    {
        var camp = Whale();
        var calm = CampState.Pristine(camp, T0.AddDays(-5)) with { CalmUntil = T0.AddDays(5) };

        Assert.Null(Find(SeaRoute(), camp, calm));
        Assert.Null(Find(SeaRoute(), camp, exempt: camp.Coord));
    }

    [Fact]
    public void A_whale_road_cleared_just_before_the_fleet_arrives_has_no_fighters_to_ambush_with()
    {
        var camp = Whale();
        var cleared = CampState.Pristine(camp, T0.AddDays(-5)).AfterFight(camp, T0.AddHours(7), CampGarrison.Empty) with { CalmUntil = null };

        Assert.Null(Find(SeaRoute(), camp, cleared, untilHours: 12));
    }

    [Fact]
    public void The_ambush_fight_is_raid_capped_and_a_beaten_fleet_turns_home_over_the_sea()
    {
        var army = Hunter([new UnitStack(UnitType.Karve, 2)]);
        var camp = Whale(level: 5);
        var garrison = CampGarrison.Full(CampStrength.Strong, 5);

        var plan = CampBattleResolver.CampAttack(garrison, camp, army.Stacks, seed: 1);

        Assert.Equal(CampFightWinner.Camp, plan.Winner);
        Assert.True(plan.ArmyLosses.Sum(s => s.Count) <= 1, "both sides lose at most half");
        Assert.True(plan.BeastLosses.Total <= garrison.Total / 2);

        var survivors = army with { Stacks = plan.ArmySurvivors };
        var retreat = survivors.ForceFieldRetreat(T0.AddHours(8), WhaleHex, Home, Terr);

        var leg = ((ArmyLocation.InTransit)retreat.Location).Movement;
        Assert.True(leg.IsReturning);
        Assert.True(leg.RetreatImmune);
        Assert.Equal(WhaleHex, leg.Path[0]);
        Assert.Equal(Home, leg.Path[^1]);
        Assert.All(leg.Path.Skip(1).Take(leg.Path.Count - 2), h => Assert.Equal(Terrain.Sea, Terr(h)));
        Assert.True(leg.CumulativeHours[^1] > 0);
    }

    [Fact]
    public void A_fleet_that_beats_the_ambush_sails_on_and_the_camp_is_calm_afterwards()
    {
        var camp = Whale(level: 1);
        var garrison = CampGarrison.Full(CampStrength.Strong, 1);
        var army = Hunter([new UnitStack(UnitType.Longship, 20)]);

        var plan = CampBattleResolver.CampAttack(garrison, camp, army.Stacks, seed: 2);
        Assert.Equal(CampFightWinner.Army, plan.Winner);

        var next = CampState.Pristine(camp, T0.AddDays(-1)).AfterFight(camp, T0.AddHours(8), plan.BeastSurvivors);
        Assert.True(next.IsCalmAt(T0.AddHours(8 + 23)));
        Assert.False(next.IsAggressiveAt(camp, T0.AddHours(8 + 23), insideRealm: false));
        Assert.True(next.IsAggressiveAt(camp, T0.AddHours(8 + 25), insideRealm: false));
    }

    // ---- hunting ---------------------------------------------------------------------------------------------------

    [Fact]
    public void A_fleet_that_wins_clears_the_whale_road_and_carries_food_home_within_its_capacity()
    {
        var camp = Whale(level: 1);
        var state = CampState.Pristine(camp, T0);
        var army = Hunter([new UnitStack(UnitType.Longship, 5)]);
        var arrivesAt = ((ArmyLocation.InTransit)army.Location).Movement.ArrivesAt;
        var garrison = state.GarrisonAt(camp, arrivesAt, insideRealm: false);

        var plan = CampBattleResolver.Hunt(army.Stacks, garrison, camp, state.EffectiveLevel(camp), seed: 4, 0, state.Leftover);

        // 5 longships attack 300 against the garrison's defense 195.
        Assert.Equal(CampFightWinner.Army, plan.Winner);
        Assert.True(plan.BeastSurvivors.IsEmpty);

        var carry = plan.ArmySurvivors.Sum(s => UnitCatalogue.Get(s.Type).CarryCapacity * s.Count);
        Assert.Equal(0, plan.Loot.Wood);
        Assert.Equal(0, plan.Loot.Stone);
        Assert.Equal(0, plan.Loot.Iron);
        Assert.True(plan.Loot.Food > 0);
        Assert.True(plan.Loot.Food <= carry, $"loot {plan.Loot.Food} exceeds the ships' capacity {carry}");
        Assert.Equal(Math.Floor(CampRules.StrongLootBase), plan.LootAvailable.Food);

        // What the ships cannot carry stays on the whale road.
        var after = state.AfterHunt(camp, arrivesAt, plan);
        Assert.Equal(plan.LootAvailable.Food - plan.Loot.Food, after.Leftover.Food);
        Assert.Equal(1, after.Clears);

        var returning = army.SettleHuntArrival(plan, arrivesAt);
        Assert.NotNull(returning);
        Assert.Equal(plan.Loot, returning!.Loot);
        Assert.True(returning.IsFleet);
        Assert.Equal(Home, ((ArmyLocation.InTransit)returning.Location).Movement.Path[^1]);
    }

    [Fact]
    public void A_fleet_that_loses_is_gone_and_the_whale_road_keeps_its_survivors()
    {
        var camp = Whale(level: 5);
        var state = CampState.Pristine(camp, T0);
        var army = Hunter([new UnitStack(UnitType.Karve, 3)]);
        var arrivesAt = ((ArmyLocation.InTransit)army.Location).Movement.ArrivesAt;

        var plan = CampBattleResolver.Hunt(
            army.Stacks, state.GarrisonAt(camp, arrivesAt, false), camp, state.EffectiveLevel(camp), seed: 5, 0, state.Leftover);

        Assert.Equal(CampFightWinner.Camp, plan.Winner);
        Assert.False(plan.BeastSurvivors.IsEmpty);
        Assert.Equal(ResourceAmounts.Zero, plan.Loot);
        Assert.Null(army.SettleHuntArrival(plan, arrivesAt));
        Assert.Equal(0, state.AfterHunt(camp, arrivesAt, plan).Clears);
    }

    [Fact]
    public void A_fleet_at_an_already_cleared_whale_road_only_picks_up_the_leftover_food()
    {
        var camp = Whale(level: 1);
        var cleared = CampState.Pristine(camp, T0).AfterFight(camp, T0, CampGarrison.Empty) with
        {
            ClearedAt = T0,
            Leftover = new ResourceAmounts(0, 0, 500, 0),
        };
        var army = Hunter([new UnitStack(UnitType.Karve, 1)]);

        // Inside a realm the cleared camp is still empty at the instant it was cleared; the pickup takes the leftover only.
        var plan = CampBattleResolver.Hunt(army.Stacks, CampGarrison.Empty, camp, 1, seed: 1, 0, cleared.Leftover);

        Assert.Equal(CampFightWinner.Army, plan.Winner);
        Assert.Equal(new ResourceAmounts(0, 0, 200, 0), plan.Loot); // one karve carries 200
        Assert.Equal(new ResourceAmounts(0, 0, 300, 0), cleared.AfterPickup(plan.Loot).Leftover);
    }
}
