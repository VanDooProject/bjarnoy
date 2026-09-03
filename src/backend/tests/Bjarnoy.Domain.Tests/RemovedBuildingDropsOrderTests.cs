using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Issue #158 stage 1b: removing a building from <see cref="Settlement.Buildings"/>
/// must take any build order still targeting that hex with it — otherwise the
/// next <see cref="Settlement.SettleTo"/> finds nothing standing there and
/// silently rebuilds it, undoing the removal. One reproduction per affected
/// path, written before the fix per AGENTS.MD's bug rule (kept here as
/// regression coverage).
/// </summary>
public sealed class RemovedBuildingDropsOrderTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);

    private static Settlement Found()
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 1)],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(100_000), production, capacity, T0),
        };
    }

    [Fact]
    public void Admin_setting_a_buildings_level_drops_a_pending_order_on_that_hex()
    {
        // A Farm is queued on a fresh hex (stakes a level-0 stub), then an
        // admin directly overwrites that hex's level before the order
        // completes. The stale order must not be left to silently overwrite
        // the admin's edit on the next settle.
        var settlement = Found();
        var coord = new HexCoord(1, 0);
        var decision = settlement.PlanBuild(BuildingType.Farm, coord, Terrain.Grass, T0, Guid.CreateVersion7());
        Assert.True(decision.Accepted);
        var queued = settlement.Enqueue(decision.Order!, T0);
        Assert.Single(queued.Queue);

        var result = queued.SetBuildingLevel(coord, level: 1, T0);
        Assert.True(result.Accepted);

        Assert.DoesNotContain(result.Settlement!.Queue, o => o.Coord == coord);

        // The reproduction: settling past the order's original completion
        // instant must not resurrect it or overwrite the admin's level.
        var settled = result.Settlement.SettleTo(decision.Order!.CompletesAt!.Value.AddMinutes(1)).Settlement;
        var atCoord = Assert.Single(settled.Buildings, b => b.Coord == coord);
        Assert.Equal(1, atCoord.Level);
    }

    [Fact]
    public void Admin_razing_a_building_drops_its_pending_order()
    {
        var settlement = Found();
        var coord = new HexCoord(1, 0);
        var decision = settlement.PlanBuild(BuildingType.Farm, coord, Terrain.Grass, T0, Guid.CreateVersion7());
        var queued = settlement.Enqueue(decision.Order!, T0);

        var result = queued.RazeBuilding(coord, T0);
        Assert.True(result.Accepted);
        Assert.DoesNotContain(result.Settlement!.Queue, o => o.Coord == coord);

        var settled = result.Settlement.SettleTo(decision.Order!.CompletesAt!.Value.AddMinutes(1)).Settlement;
        Assert.DoesNotContain(settled.Buildings, b => b.Coord == coord);
    }

    [Fact]
    public void Admin_placing_a_different_building_on_a_hex_drops_its_pending_order()
    {
        var settlement = Found();
        var coord = new HexCoord(1, 0);
        var decision = settlement.PlanBuild(BuildingType.Farm, coord, Terrain.Grass, T0, Guid.CreateVersion7());
        var queued = settlement.Enqueue(decision.Order!, T0);

        var result = queued.PlaceBuilding(coord, BuildingType.Quarry, 1, Terrain.Mountain, isCoastalWater: false, T0);
        Assert.True(result.Accepted, $"expected accept, got {result.Rejection}");
        Assert.DoesNotContain(result.Settlement!.Queue, o => o.Coord == coord);

        var settled = result.Settlement.SettleTo(decision.Order!.CompletesAt!.Value.AddMinutes(1)).Settlement;
        var atCoord = Assert.Single(settled.Buildings, b => b.Coord == coord);
        Assert.Equal(BuildingType.Quarry, atCoord.Type);
        Assert.Equal(1, atCoord.Level);
    }

    [Fact]
    public void A_catapult_destroying_a_building_outright_drops_its_pending_upgrade_order()
    {
        // A Farm already stands at level 1 and has an upgrade order queued
        // (level 2). A catapult strike destroys the Farm entirely
        // (LevelAfter 0) — the pending upgrade order must go with it, or
        // SettleTo would find nothing at that hex and add the finished
        // upgrade back, resurrecting a building the siege just removed.
        var settlement = Found();
        var coord = new HexCoord(1, 0);
        var first = settlement.PlanBuild(BuildingType.Farm, coord, Terrain.Grass, T0, Guid.CreateVersion7());
        var built = settlement.Enqueue(first.Order!, T0).SettleTo(first.Order!.CompletesAt!.Value).Settlement;

        var upgrade = built.PlanBuild(BuildingType.Farm, coord, Terrain.Grass, first.Order!.CompletesAt!.Value, Guid.CreateVersion7());
        Assert.True(upgrade.Accepted);
        var withUpgrade = built.Enqueue(upgrade.Order!, first.Order!.CompletesAt!.Value);
        Assert.Single(withUpgrade.Queue);

        var siege = SiegeResolver.Resolve(
            [new UnitStack(UnitType.Catapult, 20)], withUpgrade.Buildings, coord, seed: 1);
        Assert.True(siege.Applied);
        Assert.Equal(0, siege.LevelAfter);
        Assert.DoesNotContain(siege.UpdatedBuildings!, b => b.Coord == coord);

        var afterSiege = withUpgrade.WithSiegeDamage(siege.UpdatedBuildings!, siege.TargetCoord!.Value, first.Order!.CompletesAt!.Value);

        Assert.DoesNotContain(afterSiege.Queue, o => o.Coord == coord);

        // The reproduction: settling past the upgrade's original completion
        // instant must not resurrect the destroyed building.
        var settled = afterSiege.SettleTo(upgrade.Order!.CompletesAt!.Value.AddMinutes(1)).Settlement;
        Assert.DoesNotContain(settled.Buildings, b => b.Coord == coord);
    }

    [Fact]
    public void A_catapult_merely_reducing_a_level_leaves_the_pending_order_alone()
    {
        // Counterpart to the above: when the target survives (level reduced,
        // not removed), any pending order for that hex still completes
        // normally — only outright removal drops the order. A high standing
        // level (well above what one catapult can destroy — see
        // SiegeResolver.LevelsDestroyed) lets the building survive a weak
        // siege; built directly rather than by stepping through several real
        // completions, since only the "does the order survive" behaviour is
        // under test here, not the levelling path itself.
        var (production, _) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 5), (BuildingType.Farm, 8)]);
        var coord = new HexCoord(1, 0);
        var settlement = new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings =
            [
                new PlacedBuilding(Centre, BuildingType.Longhouse, 5),
                new PlacedBuilding(coord, BuildingType.Farm, 8),
            ],
            // A fixed, generous capacity rather than the catalogue's own
            // (which would clamp a level-9 Farm's cost out of reach) — this
            // test is about siege/order interaction, not the economy.
            Resources = ResourcePool.Create(
                ResourceAmounts.Uniform(1_000_000), production, ResourceAmounts.Uniform(1_000_000), T0),
        };

        var upgrade = settlement.PlanBuild(BuildingType.Farm, coord, Terrain.Grass, T0, Guid.CreateVersion7());
        Assert.True(upgrade.Accepted, $"expected accept, got {upgrade.Rejection}");
        var withUpgrade = settlement.Enqueue(upgrade.Order!, T0);
        Assert.Single(withUpgrade.Queue);

        // A weak siege (1 catapult) that reduces but does not remove the
        // level-8 Farm.
        var siege = SiegeResolver.Resolve(
            [new UnitStack(UnitType.Catapult, 1)], withUpgrade.Buildings, coord, seed: 1);
        Assert.True(siege.Applied);
        Assert.True(siege.LevelAfter > 0, "sanity: the Farm must survive the weak siege for this test to be meaningful");

        var afterSiege = withUpgrade.WithSiegeDamage(siege.UpdatedBuildings!, siege.TargetCoord!.Value, T0);

        Assert.Contains(afterSiege.Queue, o => o.Coord == coord);
    }
}
