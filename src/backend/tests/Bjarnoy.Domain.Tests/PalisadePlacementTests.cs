using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Palisades;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The Palisade and the Palisade Gate (<c>docs/design/economy.md</c> section 5): the catalogue entry (unlock, prerequisite, levels, cost) and
/// the placement rules <c>Settlement.PlanBuild</c> applies on top of the usual terrain / claim / prerequisite checks: no branch, a gate
/// only on a straight, no river / mountain / bog, the sea end on a coastal-water hex touching exactly one land wall.
/// </summary>
public sealed class PalisadePlacementTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);

    /// <summary>A rich settlement at the given Longhouse level, a level-5 Tower behind the centre, and the given standing wall hexes.</summary>
    private static Settlement Walled(int longhouseLevel = 7, int towerLevel = 5, params (HexCoord At, BuildingType Type)[] walls)
    {
        List<PlacedBuilding> buildings =
        [
            new(Centre, BuildingType.Longhouse, longhouseLevel),
            new(new HexCoord(-1, 0), BuildingType.Tower, towerLevel),
            .. walls.Select(w => new PlacedBuilding(w.At, w.Type, 1)),
        ];
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = buildings,
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(1_000_000), production, capacity, T0),
        };
    }

    private static (HexCoord, BuildingType) Wall(int q, int r) => (new HexCoord(q, r), BuildingType.Palisade);

    private static (HexCoord, BuildingType) Gate(int q, int r) => (new HexCoord(q, r), BuildingType.PalisadeGate);

    private static BuildDecision Plan(
        Settlement settlement, BuildingType type, HexCoord at, Terrain terrain = Terrain.Grass, bool coastal = false,
        RiverTileShape? river = null, IReadOnlyDictionary<HexCoord, Terrain>? terrainAround = null)
    {
        Terrain TerrainAt(HexCoord c) => terrainAround is not null && terrainAround.TryGetValue(c, out var t) ? t : Terrain.Grass;
        return settlement.PlanBuild(
            type, at, terrain, T0, Guid.CreateVersion7(), maxWaitingOrders: 5, isCoastalWater: coastal, riverShapeAt: river,
            palisades: new PalisadeLayout(new HashSet<HexCoord>(), new HashSet<HexCoord>(), TerrainAt));
    }

    [Fact]
    public void The_palisade_and_the_gate_share_one_catalogue_entry_unlocking_at_longhouse_7_behind_a_level_5_tower()
    {
        Assert.Equal(30, (int)BuildingType.Palisade); // persisted ints must not shift
        Assert.Equal(31, (int)BuildingType.PalisadeGate);
        Assert.Equal("palisade", BuildingType.Palisade.ToWireName());
        Assert.Equal("palisadegate", BuildingType.PalisadeGate.ToWireName());

        foreach (var type in new[] { BuildingType.Palisade, BuildingType.PalisadeGate })
        {
            Assert.Equal(3, BuildingCatalogue.MaxLevelFor(type));
            Assert.Equal(7, BuildingCatalogue.UnlockLevel(type));
            Assert.Contains(type, BuildingCatalogue.AllTypes);
            Assert.Null(BuildingCatalogue.TryGet(type, 4));

            var one = BuildingCatalogue.Get(type, 1);
            Assert.Equal(new ResourceAmounts(Wood: 40, Stone: 10, Food: 0, Iron: 0), one.Cost);
            Assert.Equal(TimeSpan.FromMinutes(2), one.BuildDuration);
            Assert.Equal(7, one.RequiredLonghouseLevel);
            Assert.Equal(new BuildingPrerequisite(BuildingType.Tower, 5), Assert.Single(one.Prerequisites));

            // The standard growth: cost x1.30, time x1.33 per level, and the Longhouse never has to be above the unlock level... except
            // that a building's level can never exceed it, so level 3 still only needs LH 7.
            var three = BuildingCatalogue.Get(type, 3);
            Assert.Equal(one.Cost * 1.30 * 1.30, three.Cost);
            Assert.Equal(TimeSpan.FromSeconds(Math.Round(120 * 1.33 * 1.33)), three.BuildDuration);
            Assert.Equal(7, three.RequiredLonghouseLevel);
        }
    }

    [Fact]
    public void The_palisade_is_refused_below_longhouse_7_and_without_a_level_5_tower()
    {
        Assert.Equal(BuildRejection.LonghouseTooLow, Plan(Walled(longhouseLevel: 6), BuildingType.Palisade, new HexCoord(1, 0)).Rejection);
        var weakTower = Plan(Walled(towerLevel: 4), BuildingType.Palisade, new HexCoord(1, 0));
        Assert.Equal(BuildRejection.RequiredBuildingTooLow, weakTower.Rejection);
        Assert.Equal(new BuildingPrerequisite(BuildingType.Tower, 5), weakTower.MissingPrerequisite);
        var ok = Plan(Walled(), BuildingType.Palisade, new HexCoord(1, 0));
        Assert.True(ok.Accepted, ok.Rejection.ToString());
        Assert.Equal(new ResourceAmounts(Wood: 40, Stone: 10, Food: 0, Iron: 0), BuildingCatalogue.Get(BuildingType.Palisade, 1).Cost);
    }

    [Theory]
    [InlineData(Terrain.Grass)]
    [InlineData(Terrain.Forest)]
    [InlineData(Terrain.Sand)]
    public void A_palisade_stands_on_grass_forest_or_sand(Terrain terrain) =>
        Assert.True(Plan(Walled(), BuildingType.Palisade, new HexCoord(1, 0), terrain).Accepted);

    [Theory]
    [InlineData(Terrain.Mountain)]
    [InlineData(Terrain.Bog)]
    [InlineData(Terrain.Lake)]
    public void A_palisade_is_refused_on_a_mountain_bog_or_lake(Terrain terrain) =>
        Assert.Equal(BuildRejection.TerrainNotAllowed, Plan(Walled(), BuildingType.Palisade, new HexCoord(1, 0), terrain).Rejection);

    [Theory]
    [InlineData(RiverTileShape.Straight)]
    [InlineData(RiverTileShape.Bend)]
    [InlineData(RiverTileShape.Spring)]
    public void A_palisade_is_refused_on_any_river_hex(RiverTileShape shape) =>
        Assert.Equal(BuildRejection.TerrainNotAllowed, Plan(Walled(), BuildingType.Palisade, new HexCoord(1, 0), river: shape).Rejection);

    [Fact]
    public void A_palisade_is_refused_outside_the_claim_and_on_an_occupied_hex()
    {
        Assert.Equal(BuildRejection.HexNotInSettlement, Plan(Walled(), BuildingType.Palisade, new HexCoord(30, 0)).Rejection);
        Assert.Equal(BuildRejection.HexOccupied, Plan(Walled(), BuildingType.Palisade, Centre).Rejection);
        // Another wall hex already stands there: a gate does not replace it either.
        Assert.Equal(BuildRejection.HexOccupied, Plan(Walled(walls: Wall(1, 0)), BuildingType.PalisadeGate, new HexCoord(1, 0)).Rejection);
    }

    [Fact]
    public void A_hex_that_would_end_up_with_three_wall_neighbours_is_refused_as_a_branch()
    {
        // (2,0) has the wall hexes (1,0), (3,0) and (2,-1) around it: a third arm.
        var settlement = Walled(walls: [Wall(1, 0), Wall(3, 0), Wall(2, -1)]);

        Assert.Equal(BuildRejection.PalisadeWouldBranch, Plan(settlement, BuildingType.Palisade, new HexCoord(2, 0)).Rejection);

        // Two arms are fine: a straight.
        Assert.True(Plan(Walled(walls: [Wall(1, 0), Wall(3, 0)]), BuildingType.Palisade, new HexCoord(2, 0)).Accepted);
    }

    [Fact]
    public void A_new_hex_that_would_give_an_existing_wall_hex_a_third_neighbour_is_refused()
    {
        // (2,0) already joins (1,0) and (3,0); a wall on (2,-1) would be its third neighbour.
        var settlement = Walled(walls: [Wall(1, 0), Wall(2, 0), Wall(3, 0)]);

        Assert.Equal(BuildRejection.PalisadeWouldBranch, Plan(settlement, BuildingType.Palisade, new HexCoord(2, -1)).Rejection);
    }

    [Fact]
    public void Queued_wall_orders_count_as_wall_hexes_for_the_branch_rule()
    {
        // A wall ordered but not started has no foundation yet; it still counts when the next hex is judged.
        var settlement = Walled(walls: [Wall(1, 0), Wall(3, 0)]);
        var queued = settlement with
        {
            Queue =
            [
                new BuildOrder
                {
                    Id = Guid.CreateVersion7(), Type = BuildingType.Palisade, TargetLevel = 1, Coord = new HexCoord(2, -1),
                    QueuedAt = T0, BaseDuration = TimeSpan.FromMinutes(2),
                },
            ],
        };

        Assert.Equal(BuildRejection.PalisadeWouldBranch, Plan(queued, BuildingType.Palisade, new HexCoord(2, 0)).Rejection);
    }

    [Fact]
    public void A_gate_is_accepted_between_two_opposite_wall_hexes()
    {
        var settlement = Walled(walls: [Wall(1, 0), Wall(3, 0)]);

        var decision = Plan(settlement, BuildingType.PalisadeGate, new HexCoord(2, 0));

        Assert.True(decision.Accepted, decision.Rejection.ToString());
        Assert.Equal(BuildingType.PalisadeGate, decision.Order!.Type);
    }

    [Fact]
    public void A_gate_is_refused_on_a_bend_and_where_it_has_no_wall_neighbours()
    {
        // (2,0) with wall neighbours (1,0) [W] and (2,-1) [NW]: adjacent edges, the tight bend.
        Assert.Equal(
            BuildRejection.GateNotOnStraight,
            Plan(Walled(walls: [Wall(1, 0), Wall(2, -1)]), BuildingType.PalisadeGate, new HexCoord(2, 0)).Rejection);

        // The wide bend (W and SE, one edge skipped) is no straight either.
        Assert.Equal(
            BuildRejection.GateNotOnStraight,
            Plan(Walled(walls: [Wall(1, 0), Wall(2, 1)]), BuildingType.PalisadeGate, new HexCoord(2, 0)).Rejection);

        // On its own, or as a wall's end, there is nothing to be a straight between.
        Assert.Equal(BuildRejection.GateNotOnStraight, Plan(Walled(), BuildingType.PalisadeGate, new HexCoord(2, 0)).Rejection);
        Assert.Equal(
            BuildRejection.GateNotOnStraight,
            Plan(Walled(walls: Wall(1, 0)), BuildingType.PalisadeGate, new HexCoord(2, 0)).Rejection);
    }

    [Fact]
    public void A_wall_that_would_turn_or_branch_a_standing_gate_is_refused()
    {
        var settlement = Walled(walls: [Wall(1, 0), Gate(2, 0), Wall(3, 0)]);

        // (2,-1) touches the gate: a third neighbour for it.
        Assert.Equal(BuildRejection.PalisadeWouldBranch, Plan(settlement, BuildingType.Palisade, new HexCoord(2, -1)).Rejection);
        // A gate still waiting for its second neighbour is fine to extend.
        var waiting = Walled(walls: [Wall(1, 0), Gate(2, 0)]);
        Assert.True(Plan(waiting, BuildingType.Palisade, new HexCoord(3, 0)).Accepted);
        // ... but not so that it turns: (2,-1) joins the waiting gate at a right angle.
        Assert.Equal(BuildRejection.GateNotOnStraight, Plan(waiting, BuildingType.Palisade, new HexCoord(2, -1)).Rejection);
    }

    [Fact]
    public void The_sea_end_stands_on_a_coastal_water_hex_touching_exactly_one_land_wall()
    {
        // Land walls (1,0) and (2,0); (3,0) is coastal sea.
        var settlement = Walled(walls: [Wall(1, 0), Wall(2, 0)]);
        var sea = new Dictionary<HexCoord, Terrain> { [new HexCoord(3, 0)] = Terrain.Sea, [new HexCoord(3, -1)] = Terrain.Sea };

        var accepted = Plan(settlement, BuildingType.Palisade, new HexCoord(3, 0), Terrain.Sea, coastal: true, terrainAround: sea);
        Assert.True(accepted.Accepted, accepted.Rejection.ToString());

        // Not coastal (open sea with no land beside it): not a placeable hex at all.
        Assert.Equal(
            BuildRejection.TerrainNotAllowed,
            Plan(settlement, BuildingType.Palisade, new HexCoord(3, 0), Terrain.Sea, coastal: false, terrainAround: sea).Rejection);

        // Touching no wall at all.
        Assert.Equal(
            BuildRejection.TerrainNotAllowed,
            Plan(Walled(), BuildingType.Palisade, new HexCoord(3, 0), Terrain.Sea, coastal: true, terrainAround: sea).Rejection);

        // A gate is never a sea end.
        Assert.Equal(
            BuildRejection.TerrainNotAllowed,
            Plan(settlement, BuildingType.PalisadeGate, new HexCoord(3, 0), Terrain.Sea, coastal: true, terrainAround: sea).Rejection);
    }

    [Fact]
    public void A_sea_hex_touching_two_wall_hexes_is_a_branch()
    {
        // Walls (2,0) and (3,-1) both touch the sea hex (3,0).
        var settlement = Walled(walls: [Wall(2, 0), Wall(3, -1)]);
        var sea = new Dictionary<HexCoord, Terrain> { [new HexCoord(3, 0)] = Terrain.Sea };

        Assert.Equal(
            BuildRejection.PalisadeWouldBranch,
            Plan(settlement, BuildingType.Palisade, new HexCoord(3, 0), Terrain.Sea, coastal: true, terrainAround: sea).Rejection);
    }

    [Fact]
    public void A_sea_end_takes_no_second_wall_hex_and_no_wall_runs_out_over_the_water()
    {
        // The sea end (3,0) already stands on (2,0)'s east side; another land wall at (3,-1) would be its second neighbour.
        var settlement = Walled(walls: [Wall(1, 0), Wall(2, 0), Wall(3, 0)]);
        var sea = new Dictionary<HexCoord, Terrain> { [new HexCoord(3, 0)] = Terrain.Sea };

        Assert.Equal(
            BuildRejection.PalisadeWouldBranch,
            Plan(settlement, BuildingType.Palisade, new HexCoord(3, -1), terrainAround: sea).Rejection);
    }

    [Fact]
    public void Raising_a_standing_wall_hex_a_level_is_never_refused_by_the_wall_rules()
    {
        var settlement = Walled(walls: [Wall(1, 0), Wall(2, 0), Wall(3, 0)]);

        var decision = Plan(settlement, BuildingType.Palisade, new HexCoord(2, 0));

        Assert.True(decision.Accepted, decision.Rejection.ToString());
        Assert.Equal(2, decision.Order!.TargetLevel);
    }
}
