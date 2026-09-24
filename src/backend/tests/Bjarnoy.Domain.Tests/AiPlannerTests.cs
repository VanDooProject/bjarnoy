using Bjarnoy.Domain.Ai;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Coverage for <see cref="AiPlanner"/> — see <c>docs/design/ai-players.md</c>'s "Planner" section.</summary>
public sealed class AiPlannerTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);
    private static readonly HexCoord OtherHex = new(1, 0);
    private static readonly HexCoord ThirdHex = new(0, 1);

    /// <summary>A settlement rich enough that affordability is never the thing under test unless <paramref name="stock"/> overrides that.</summary>
    private static Settlement Found(
        int longhouseLevel = 1,
        double stock = 1_000_000,
        IReadOnlyList<UnitStack>? garrison = null,
        params PlacedBuilding[] extraBuildings)
    {
        var buildings = new List<PlacedBuilding> { new(Centre, BuildingType.Longhouse, longhouseLevel) };
        buildings.AddRange(extraBuildings);

        var (production, capacity) = BuildingCatalogue.Totals(buildings.Select(b => (b.Type, b.Level)));

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = buildings,
            Garrison = garrison ?? [],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(stock), production, capacity, T0),
        };
    }

    private static AiSnapshot Snapshot(
        Settlement settlement,
        AiPersonality personality,
        IReadOnlyList<AiHex> hexes,
        IReadOnlyList<AiObjective>? objectives = null,
        IReadOnlyList<AiNeighbour>? neighbours = null,
        bool hasArmyAway = false,
        bool hasShoreline = false,
        int seed = 1) =>
        new(
            settlement,
            T0,
            SpeedFactor: 1.0,
            hexes,
            AiProfiles.For(personality),
            objectives ?? [],
            neighbours ?? [],
            hasArmyAway,
            hasShoreline,
            seed);

    private static AiHex Grass(HexCoord coord) => new(coord, Terrain.Grass, IsCoastalWater: false, RiverShape: null);

    private static AiHex Sea(HexCoord coord) => new(coord, Terrain.Sea, IsCoastalWater: false, RiverShape: null);

    // --- Build: only accepted PlanBuild candidates are ever proposed ------

    [Fact]
    public void No_build_is_planned_when_the_settlement_cannot_afford_anything()
    {
        var settlement = Found(stock: 0);
        var snapshot = Snapshot(settlement, AiPersonality.Balanced, [Grass(OtherHex)]);

        var actions = AiPlanner.Plan(snapshot);

        Assert.DoesNotContain(actions, a => a is AiBuild);
    }

    [Fact]
    public void No_build_is_planned_on_terrain_nothing_can_stand_on()
    {
        var settlement = Found();
        // Open sea, not coastal: no land producer allows it, and no
        // RequiresCoastalWater building (FishingHut/FisherHut/Dockyard)
        // qualifies either since IsCoastalWater is false here.
        var snapshot = Snapshot(settlement, AiPersonality.Balanced, [Sea(OtherHex)]);

        var actions = AiPlanner.Plan(snapshot);

        Assert.DoesNotContain(actions, a => a is AiBuild);
    }

    // --- Stay fed -----------------------------------------------------------

    [Fact]
    public void A_starving_settlement_builds_a_food_producer_first()
    {
        // 50 Thralls' upkeep (50/hour) dwarfs the level-1 longhouse's own
        // passive food production (10/hour), so net food is deeply negative.
        var garrison = new[] { new UnitStack(UnitType.Thrall, 50) };
        var settlement = Found(garrison: garrison);
        var snapshot = Snapshot(settlement, AiPersonality.Balanced, [Grass(OtherHex)]);

        var actions = AiPlanner.Plan(snapshot);

        var firstBuild = Assert.IsType<AiBuild>(actions[0]);
        Assert.Contains(
            firstBuild.Type,
            new[] { BuildingType.Farm, BuildingType.PumpkinFarm, BuildingType.FishingHut, BuildingType.FisherHut });
    }

    // --- Personality steers the same snapshot differently --------------------

    /// <summary>
    /// An existing, already-maxed-out iron producer keeps Iron from being the
    /// scarcest resource, so the scarcity bonus (which would otherwise favour
    /// Iron for every personality alike) does not confound this comparison —
    /// only the personality weights decide which of the two remaining
    /// candidates (Farm vs. a second MagicTower) wins.
    /// </summary>
    private static Settlement FoundForPersonalityComparison() =>
        // A stock well clear of both zero and full capacity: enough to
        // afford any single-hex candidate here, but not so much that
        // ResourcePool.Create's clamp-to-capacity pins every stock at 100%
        // and spuriously triggers the storage-near-cap bonus for everyone.
        Found(stock: 600, extraBuildings: new PlacedBuilding(ThirdHex, BuildingType.MagicTower, 5));

    [Fact]
    public void Economic_prefers_a_plain_producer_over_the_iron_producer()
    {
        var settlement = FoundForPersonalityComparison();
        var snapshot = Snapshot(settlement, AiPersonality.Economic, [Grass(ThirdHex), Grass(OtherHex)]);

        var actions = AiPlanner.Plan(snapshot);

        var firstBuild = Assert.IsType<AiBuild>(actions[0]);
        Assert.Equal(BuildingType.Farm, firstBuild.Type);
    }

    [Fact]
    public void Aggressive_prefers_the_iron_producer_over_a_plain_producer()
    {
        var settlement = FoundForPersonalityComparison();
        var snapshot = Snapshot(settlement, AiPersonality.Aggressive, [Grass(ThirdHex), Grass(OtherHex)]);

        var actions = AiPlanner.Plan(snapshot);

        var firstBuild = Assert.IsType<AiBuild>(actions[0]);
        Assert.Equal(BuildingType.MagicTower, firstBuild.Type);
    }

    // --- Open objectives steer the build choice ------------------------------

    [Fact]
    public void An_open_ReachBuildingLevel_objective_steers_the_choice_to_that_building()
    {
        var settlement = Found();
        var objectives = new[]
        {
            new AiObjective { Kind = AiObjectiveKind.ReachBuildingLevel, Building = BuildingType.StorageHouse, Target = 2 },
        };
        var snapshot = Snapshot(settlement, AiPersonality.Balanced, [Grass(OtherHex)], objectives);

        var actions = AiPlanner.Plan(snapshot);

        var firstBuild = Assert.IsType<AiBuild>(actions[0]);
        Assert.Equal(BuildingType.StorageHouse, firstBuild.Type);
    }

    [Fact]
    public void A_locked_ReachBuildingLevel_objective_steers_the_choice_to_its_unmet_prerequisite()
    {
        // Longhouse 10 satisfies GreatStorehouse's own RequiredLonghouseLevel,
        // but no StorageHouse stands yet — GreatStorehouse also needs
        // StorageHouse 10 (BuildingCatalogue.PrerequisiteTable). A one-step
        // greedy planner would never propose GreatStorehouse (PlanBuild
        // rejects it) and would fall back to whatever else scores highest;
        // with prerequisite chaining, the objective boost redirects to
        // StorageHouse instead.
        var settlement = Found(longhouseLevel: 10);
        var objectives = new[]
        {
            new AiObjective { Kind = AiObjectiveKind.ReachBuildingLevel, Building = BuildingType.GreatStorehouse, Target = 1 },
        };
        var snapshot = Snapshot(settlement, AiPersonality.Balanced, [Grass(OtherHex)], objectives);

        var actions = AiPlanner.Plan(snapshot);

        var firstBuild = Assert.IsType<AiBuild>(actions[0]);
        Assert.Equal(BuildingType.StorageHouse, firstBuild.Type);
    }

    [Fact]
    public void An_unreachable_ReachBuildingLevel_objective_does_not_crash_or_loop()
    {
        // Longhouse far too low for anything in GreatStorehouse's chain —
        // exercises the depth-limited, cycle-safe walk with nothing to boost
        // other than the Longhouse itself.
        var settlement = Found(longhouseLevel: 1);
        var objectives = new[]
        {
            new AiObjective { Kind = AiObjectiveKind.ReachBuildingLevel, Building = BuildingType.GreatStorehouse, Target = 1 },
        };
        var snapshot = Snapshot(settlement, AiPersonality.Balanced, [Grass(OtherHex)], objectives);

        var actions = AiPlanner.Plan(snapshot);

        // Should still plan *something* sensible (not GreatStorehouse, which
        // PlanBuild would reject) rather than throwing or hanging.
        Assert.DoesNotContain(actions, a => a is AiBuild build && build.Type == BuildingType.GreatStorehouse);
    }

    [Fact]
    public void A_GarrisonStrength_objective_with_no_training_building_steers_toward_one()
    {
        // Longhouse 5 with a level-5 Tower standing satisfies Barracks'
        // prerequisites (Tower 5), so the only thing left blocking Barracks
        // is nothing — it should now directly win the boost.
        var settlement = Found(longhouseLevel: 5, extraBuildings: new PlacedBuilding(OtherHex, BuildingType.Tower, 5));
        var objectives = new[] { new AiObjective { Kind = AiObjectiveKind.GarrisonStrength, Target = 10 } };
        var snapshot = Snapshot(settlement, AiPersonality.Economic, [Grass(ThirdHex)], objectives);

        var actions = AiPlanner.Plan(snapshot);

        var firstBuild = Assert.IsType<AiBuild>(actions[0]);
        Assert.Equal(BuildingType.Barracks, firstBuild.Type);
    }

    // --- BuildingBias ----------------------------------------------------------

    [Fact]
    public void A_zero_BuildingBias_excludes_that_type_from_every_candidate()
    {
        var settlement = Found();
        var profile = AiProfiles.For(AiPersonality.Balanced) with
        {
            BuildingBias = new Dictionary<BuildingType, double> { [BuildingType.Farm] = 0.0 },
        };
        var snapshot = new AiSnapshot(
            settlement, T0, SpeedFactor: 1.0, [Grass(OtherHex)], profile, [], [], false, false, Seed: 1);

        var actions = AiPlanner.Plan(snapshot);

        Assert.DoesNotContain(actions, a => a is AiBuild build && build.Type == BuildingType.Farm);
    }

    [Fact]
    public void A_high_BuildingBias_promotes_that_type_over_an_otherwise_stronger_candidate()
    {
        // Balanced weighs Economy and Storage equally (1.0 each), so with no
        // bias the cheaper of Farm (cost 180) and StorageHouse (cost 270)
        // wins on the cost tie-break — Farm. A moderate stock (rather than
        // Found()'s default, which pins every stock at capacity and would
        // spuriously favour StorageHouse via the near-capacity bonus — see
        // FoundForPersonalityComparison's own comment) keeps that the honest
        // baseline, so a large bias on StorageHouse alone can be shown to
        // flip the outcome.
        var settlement = Found(stock: 600);
        // MagicTower would otherwise win this comparison on its own (Iron
        // being the scarcest resource with none produced yet) — excluded via
        // bias 0 so the test isolates the Farm-vs-StorageHouse tie-break this
        // is actually about.
        var baseline = AiProfiles.For(AiPersonality.Balanced) with
        {
            BuildingBias = new Dictionary<BuildingType, double> { [BuildingType.MagicTower] = 0.0 },
        };
        var baselineSnapshot = new AiSnapshot(
            settlement, T0, SpeedFactor: 1.0, [Grass(OtherHex)], baseline, [], [], false, false, Seed: 1);
        var baselineActions = AiPlanner.Plan(baselineSnapshot);
        Assert.Equal(BuildingType.Farm, Assert.IsType<AiBuild>(baselineActions[0]).Type);

        var promoted = baseline with
        {
            BuildingBias = new Dictionary<BuildingType, double>
            {
                [BuildingType.MagicTower] = 0.0,
                [BuildingType.StorageHouse] = 5.0,
            },
        };
        var promotedSnapshot = new AiSnapshot(
            settlement, T0, SpeedFactor: 1.0, [Grass(OtherHex)], promoted, [], [], false, false, Seed: 1);

        var actions = AiPlanner.Plan(promotedSnapshot);

        var firstBuild = Assert.IsType<AiBuild>(actions[0]);
        Assert.Equal(BuildingType.StorageHouse, firstBuild.Type);
    }

    // --- Train ---------------------------------------------------------------

    [Fact]
    public void A_garrison_below_target_trains_a_preferred_unit_within_its_deficit()
    {
        var settlement = Found(extraBuildings: new PlacedBuilding(OtherHex, BuildingType.Barracks, 1));
        // No open hexes left to build on, so only the train step can fire.
        var snapshot = Snapshot(settlement, AiPersonality.Balanced, []);

        var actions = AiPlanner.Plan(snapshot);

        var train = Assert.Single(actions.OfType<AiTrain>());
        Assert.Equal(UnitType.Spearman, train.Unit);
        // Balanced's GarrisonPerLonghouseLevel is 3, at longhouse level 1, from an empty garrison.
        Assert.InRange(train.Count, 1, 3);
    }

    [Fact]
    public void Nothing_is_trained_once_the_garrison_target_is_already_met()
    {
        var garrison = new[] { new UnitStack(UnitType.Spearman, 10) };
        var settlement = Found(garrison: garrison, extraBuildings: new PlacedBuilding(OtherHex, BuildingType.Barracks, 1));
        var snapshot = Snapshot(settlement, AiPersonality.Balanced, []);

        var actions = AiPlanner.Plan(snapshot);

        Assert.DoesNotContain(actions, a => a is AiTrain);
    }

    // --- Raid ------------------------------------------------------------------

    private static (Settlement Settlement, UnitStack[] Garrison) SettlementWithMixedGarrison()
    {
        // Axeman (attack 40 > defense 15) is offensive; Spearman
        // (attack 15 < defense 35) is defensive and must stay home.
        var garrison = new[] { new UnitStack(UnitType.Axeman, 5), new UnitStack(UnitType.Spearman, 5) };
        return (Found(garrison: garrison), garrison);
    }

    [Fact]
    public void Aggressive_raids_the_weakest_neighbour_it_can_beat_with_only_offensive_units()
    {
        var (settlement, _) = SettlementWithMixedGarrison();
        var weak = new AiNeighbour(Guid.CreateVersion7(), new HexCoord(10, 0), EstimatedDefense: 100);
        var strong = new AiNeighbour(Guid.CreateVersion7(), new HexCoord(20, 0), EstimatedDefense: 1000);
        // Own offensive power: 5 Axemen * 40 attack = 200.
        // 100 * 1.3 = 130 <= 200 (beatable); 1000 * 1.3 = 1300 > 200 (not).
        var snapshot = Snapshot(settlement, AiPersonality.Aggressive, [], neighbours: [strong, weak]);

        var actions = AiPlanner.Plan(snapshot);

        var raid = Assert.Single(actions.OfType<AiRaid>());
        Assert.Equal(weak.SettlementId, raid.TargetSettlementId);
        var sent = Assert.Single(raid.Units);
        Assert.Equal(UnitType.Axeman, sent.Type);
        Assert.Equal(5, sent.Count);
    }

    [Fact]
    public void Aggressive_does_not_raid_a_neighbour_it_cannot_beat()
    {
        var (settlement, _) = SettlementWithMixedGarrison();
        var strong = new AiNeighbour(Guid.CreateVersion7(), new HexCoord(20, 0), EstimatedDefense: 1000);
        var snapshot = Snapshot(settlement, AiPersonality.Aggressive, [], neighbours: [strong]);

        var actions = AiPlanner.Plan(snapshot);

        Assert.DoesNotContain(actions, a => a is AiRaid);
    }

    [Theory]
    [InlineData(AiPersonality.Economic)]
    [InlineData(AiPersonality.Defensive)]
    public void Never_attacking_personalities_never_raid_even_a_trivial_target(AiPersonality personality)
    {
        var (settlement, _) = SettlementWithMixedGarrison();
        var trivial = new AiNeighbour(Guid.CreateVersion7(), new HexCoord(10, 0), EstimatedDefense: 1);
        var snapshot = Snapshot(settlement, personality, [], neighbours: [trivial]);

        var actions = AiPlanner.Plan(snapshot);

        Assert.DoesNotContain(actions, a => a is AiRaid);
    }

    [Fact]
    public void An_army_already_away_blocks_raiding_even_when_strong_enough()
    {
        var (settlement, _) = SettlementWithMixedGarrison();
        var trivial = new AiNeighbour(Guid.CreateVersion7(), new HexCoord(10, 0), EstimatedDefense: 1);
        var snapshot = Snapshot(settlement, AiPersonality.Aggressive, [], neighbours: [trivial], hasArmyAway: true);

        var actions = AiPlanner.Plan(snapshot);

        Assert.DoesNotContain(actions, a => a is AiRaid);
    }

    [Fact]
    public void A_garrison_with_no_offensive_units_never_raids()
    {
        // Only Spearman (defensive) at home.
        var garrison = new[] { new UnitStack(UnitType.Spearman, 20) };
        var settlement = Found(garrison: garrison);
        var trivial = new AiNeighbour(Guid.CreateVersion7(), new HexCoord(10, 0), EstimatedDefense: 1);
        var snapshot = Snapshot(settlement, AiPersonality.Aggressive, [], neighbours: [trivial]);

        var actions = AiPlanner.Plan(snapshot);

        Assert.DoesNotContain(actions, a => a is AiRaid);
    }

    // --- Determinism -----------------------------------------------------------

    [Fact]
    public void The_same_snapshot_always_plans_the_same_actions()
    {
        var settlement = Found(extraBuildings: new PlacedBuilding(OtherHex, BuildingType.Barracks, 1));
        var snapshot = Snapshot(settlement, AiPersonality.Balanced, [Grass(ThirdHex)]);

        var first = AiPlanner.Plan(snapshot);
        var second = AiPlanner.Plan(snapshot);

        Assert.Equal(first, second);
    }

    // --- EstimateDefense ---------------------------------------------------------

    [Fact]
    public void EstimateDefense_sums_defense_times_count_over_the_garrison()
    {
        var garrison = new[] { new UnitStack(UnitType.Spearman, 3), new UnitStack(UnitType.Axeman, 2) };
        var settlement = Found(garrison: garrison);

        // Spearman defense 35 * 3 = 105; Axeman defense 15 * 2 = 30.
        Assert.Equal(135, AiPlanner.EstimateDefense(settlement));
    }
}

/// <summary>Coverage for <see cref="AiObjective.IsMet"/>.</summary>
public sealed class AiObjectiveTests
{
    private static readonly HexCoord Centre = new(0, 0);

    private static Settlement Found(int longhouseLevel, params PlacedBuilding[] extraBuildings)
    {
        var buildings = new List<PlacedBuilding> { new(Centre, BuildingType.Longhouse, longhouseLevel) };
        buildings.AddRange(extraBuildings);
        var (production, capacity) = BuildingCatalogue.Totals(buildings.Select(b => (b.Type, b.Level)));

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = buildings,
            Resources = ResourcePool.Create(ResourceAmounts.Zero, production, capacity, DateTimeOffset.UtcNow),
        };
    }

    [Theory]
    [InlineData(5, 5, true)]
    [InlineData(4, 5, false)]
    [InlineData(6, 5, true)]
    public void ReachLonghouseLevel_compares_the_longhouse_level(int actual, double target, bool expected)
    {
        var settlement = Found(actual);
        var objective = new AiObjective { Kind = AiObjectiveKind.ReachLonghouseLevel, Target = target };

        Assert.Equal(expected, objective.IsMet(settlement));
    }

    [Fact]
    public void ReachBuildingLevel_is_unmet_with_no_such_building_standing()
    {
        var settlement = Found(1);
        var objective = new AiObjective
        {
            Kind = AiObjectiveKind.ReachBuildingLevel, Building = BuildingType.StorageHouse, Target = 1,
        };

        Assert.False(objective.IsMet(settlement));
    }

    [Fact]
    public void ReachBuildingLevel_reads_the_highest_standing_level_of_that_type()
    {
        var settlement = Found(1, new PlacedBuilding(new HexCoord(1, 0), BuildingType.StorageHouse, 3));
        var met = new AiObjective { Kind = AiObjectiveKind.ReachBuildingLevel, Building = BuildingType.StorageHouse, Target = 3 };
        var unmet = new AiObjective { Kind = AiObjectiveKind.ReachBuildingLevel, Building = BuildingType.StorageHouse, Target = 4 };

        Assert.True(met.IsMet(settlement));
        Assert.False(unmet.IsMet(settlement));
    }

    [Fact]
    public void GarrisonStrength_sums_unit_counts_regardless_of_type()
    {
        var settlement = Found(1) with
        {
            Garrison = [new UnitStack(UnitType.Spearman, 4), new UnitStack(UnitType.Axeman, 6)],
        };
        var met = new AiObjective { Kind = AiObjectiveKind.GarrisonStrength, Target = 10 };
        var unmet = new AiObjective { Kind = AiObjectiveKind.GarrisonStrength, Target = 11 };

        Assert.True(met.IsMet(settlement));
        Assert.False(unmet.IsMet(settlement));
    }

    [Fact]
    public void ProductionRate_reads_the_net_hourly_rate_for_that_resource()
    {
        // Level-1 Longhouse alone produces Wood: 10/hour.
        var settlement = Found(1);
        var met = new AiObjective
        {
            Kind = AiObjectiveKind.ProductionRate, Resource = Trade.TradeResource.Wood, Target = 10,
        };
        var unmet = new AiObjective
        {
            Kind = AiObjectiveKind.ProductionRate, Resource = Trade.TradeResource.Wood, Target = 11,
        };

        Assert.True(met.IsMet(settlement));
        Assert.False(unmet.IsMet(settlement));
    }
}
