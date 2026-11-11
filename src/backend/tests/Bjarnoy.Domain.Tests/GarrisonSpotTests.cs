using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// A garrison stands at spots — the longhouse hex, every tower, every dock — and training, starvation and destroyed buildings
/// act on them (<c>docs/design/garrison.md</c>).
/// </summary>
public class GarrisonSpotTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);

    private static Settlement Found(bool centreHarboursShips = false, params PlacedBuilding[] extra)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 5)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            CentreHarboursShips = centreHarboursShips,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 5), .. extra],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(1_000_000), production, capacity, T0),
        };
    }

    private static PlacedBuilding Tower(int q, int r, int level = 1) => new(new HexCoord(q, r), BuildingType.Tower, level);

    private static PlacedBuilding Dock(int q, int r) => new(new HexCoord(q, r), BuildingType.Dockyard, 1);

    private static TrainingOrder Batch(HexCoord at, UnitType type, int count) => new()
    {
        Id = Guid.CreateVersion7(),
        BuildingCoord = at,
        UnitType = type,
        Count = count,
        StartedAt = T0,
        PerUnitDuration = TimeSpan.FromMinutes(1),
    };

    private static Settlement TrainedAt(Settlement settlement, HexCoord at, UnitType type, int count = 4) =>
        (settlement with { TrainingQueue = [Batch(at, type, count)] }).SettleTo(T0.AddHours(1)).Settlement;

    [Fact]
    public void The_spots_are_the_longhouse_then_every_tower_and_dock_by_q_then_r_empty_ones_included()
    {
        var settlement = Found(false, Tower(5, 0), Dock(3, 3), Tower(-2, 1), Dock(3, -1))
            .WithGarrisonAt(new HexCoord(5, 0), [new UnitStack(UnitType.Spearman, 2)]);

        var spots = settlement.GarrisonSpots;

        Assert.Equal(
            [(Centre, GarrisonSpotKind.Longhouse), (new HexCoord(-2, 1), GarrisonSpotKind.Tower), (new HexCoord(3, -1), GarrisonSpotKind.Dock),
                (new HexCoord(3, 3), GarrisonSpotKind.Dock), (new HexCoord(5, 0), GarrisonSpotKind.Tower)],
            spots.Select(s => (s.Coord, s.Kind)));
        Assert.Equal(2, spots.Single(s => s.Coord == new HexCoord(5, 0)).Stacks.Single().Count);
        Assert.Empty(spots[0].Stacks);
    }

    [Fact]
    public void A_foundation_under_construction_is_not_a_spot_and_a_tower_outside_the_realm_is()
    {
        var outside = Tower(4, 0) with { OutsideRealmSince = T0 };
        var settlement = Found(false, outside, Tower(6, 0, level: 0));

        Assert.Equal([Centre, new HexCoord(4, 0)], settlement.GarrisonSpots.Select(s => s.Coord));
    }

    [Fact]
    public void Land_units_stand_at_longhouse_and_tower_never_at_a_dock_and_ships_at_a_dock_or_a_harbouring_longhouse()
    {
        var inland = Found(false, Tower(2, 0), Dock(3, 0)).GarrisonSpots;
        var harbour = Found(true, Tower(2, 0), Dock(3, 0)).GarrisonSpots;

        Assert.True(inland[0].Holds(UnitType.Spearman));
        Assert.False(inland[0].Holds(UnitType.Karve));
        Assert.True(inland.Single(s => s.Kind == GarrisonSpotKind.Tower).Holds(UnitType.Spearman));
        Assert.False(inland.Single(s => s.Kind == GarrisonSpotKind.Tower).Holds(UnitType.Karve));
        Assert.False(inland.Single(s => s.Kind == GarrisonSpotKind.Dock).Holds(UnitType.Spearman));
        Assert.True(inland.Single(s => s.Kind == GarrisonSpotKind.Dock).Holds(UnitType.Longship));
        Assert.True(harbour[0].Holds(UnitType.Karve));
        Assert.True(harbour[0].Holds(UnitType.Spearman));
    }

    [Fact]
    public void Garrison_is_the_total_over_all_spots()
    {
        var settlement = Found(false, Tower(2, 0))
            .WithGarrisonAt(Centre, [new UnitStack(UnitType.Spearman, 3), new UnitStack(UnitType.Thrall, 1)])
            .WithGarrisonAt(new HexCoord(2, 0), [new UnitStack(UnitType.Spearman, 4)]);

        Assert.Equal(
            [new UnitStack(UnitType.Thrall, 1), new UnitStack(UnitType.Spearman, 7)], settlement.Garrison);
    }

    [Fact]
    public void Trained_land_units_join_the_nearest_tower_or_longhouse_measured_from_the_training_building()
    {
        var barracks = new HexCoord(9, 0);
        var settlement = Found(false, Tower(7, 0), Tower(-3, 0));

        var trained = TrainedAt(settlement, barracks, UnitType.Spearman);

        Assert.Equal(4, trained.GarrisonAt(new HexCoord(7, 0)).Single().Count);
        Assert.Empty(trained.GarrisonAt(Centre));
        Assert.Empty(trained.GarrisonAt(new HexCoord(-3, 0)));
    }

    [Fact]
    public void A_land_batch_trained_next_to_the_longhouse_joins_the_longhouse_not_a_farther_tower()
    {
        var settlement = Found(false, Tower(7, 0));

        var trained = TrainedAt(settlement, new HexCoord(1, 0), UnitType.Spearman);

        Assert.Equal(4, trained.GarrisonAt(Centre).Single().Count);
        Assert.Empty(trained.GarrisonAt(new HexCoord(7, 0)));
    }

    [Fact]
    public void Equally_near_spots_break_the_tie_by_q_then_r()
    {
        // (2,0) and (1,1) are both two hexes from the barracks at (2,2)... pick a barracks with two equal distances.
        var barracks = new HexCoord(0, 4);
        var a = new HexCoord(2, 2);
        var b = new HexCoord(-2, 6);
        Assert.Equal(barracks.DistanceTo(a), barracks.DistanceTo(b));
        var settlement = Found(false, Tower(a.Q, a.R), Tower(b.Q, b.R));

        var trained = TrainedAt(settlement, barracks, UnitType.Spearman);

        Assert.Equal(4, trained.GarrisonAt(b).Single().Count); // lower Q
        Assert.Empty(trained.GarrisonAt(a));
    }

    [Fact]
    public void Trained_ships_join_the_nearest_dock_never_a_tower_or_an_inland_longhouse()
    {
        var settlement = Found(false, Tower(3, 0), Dock(8, 0), Dock(-6, 0));

        var trained = TrainedAt(settlement, new HexCoord(-6, 0), UnitType.Karve);

        Assert.Equal(4, trained.GarrisonAt(new HexCoord(-6, 0)).Single().Count);
        Assert.Empty(trained.GarrisonAt(Centre));
        Assert.Empty(trained.GarrisonAt(new HexCoord(3, 0)));
    }

    [Fact]
    public void A_harbouring_longhouse_is_a_spot_for_ships_too()
    {
        var settlement = Found(true, Dock(9, 0));

        var trained = TrainedAt(settlement, new HexCoord(1, 0), UnitType.Karve);

        Assert.Equal(4, trained.GarrisonAt(Centre).Single().Count);
    }

    [Fact]
    public void Starvation_deaths_are_split_across_the_spots_in_proportion_to_what_stands_at_each()
    {
        var upkeep = UnitCatalogue.Get(UnitType.Thrall).UpkeepPerHour;
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        var total = (int)Math.Ceiling(production.Food / upkeep) + 40;
        var atCentre = total * 3 / 4;
        var atTower = total - atCentre;
        var tower = new HexCoord(2, 0);

        var pool = ResourcePool.Create(
            ResourceAmounts.Zero, production with { Food = production.Food - (total * upkeep) }, capacity, T0);
        var settlement = (Found(false, Tower(2, 0)) with
        {
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 1), Tower(2, 0)],
            Resources = pool,
        })
            .WithGarrisonAt(Centre, [new UnitStack(UnitType.Thrall, atCentre)])
            .WithGarrisonAt(tower, [new UnitStack(UnitType.Thrall, atTower)]);

        var result = settlement.SettleTo(T0.AddHours(1));

        var killed = Settlement.StarvationKills(production.Food, [new UnitStack(UnitType.Thrall, total)]).Sum(k => k.Count);
        Assert.InRange(killed, 1, total - 1);
        Assert.Equal(killed, result.Deaths.Sum(d => d.Count));
        var split = ProportionalAllocator.Allocate(killed, [atCentre, atTower]);
        Assert.Equal(atCentre - split[0], result.Settlement.GarrisonAt(Centre).Single().Count);
        Assert.Equal(atTower - split[1], result.Settlement.GarrisonAt(tower).Single().Count);
    }

    [Fact]
    public void The_garrison_of_a_destroyed_tower_is_split_off_as_an_orphaned_group()
    {
        var tower = new HexCoord(2, 0);
        var settlement = Found(false, Tower(2, 0))
            .WithGarrisonAt(tower, [new UnitStack(UnitType.Spearman, 8), new UnitStack(UnitType.Bowman, 2)])
            .WithGarrisonAt(Centre, [new UnitStack(UnitType.Spearman, 5)]);
        var razed = settlement with { Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 5)] };

        var (rest, orphans) = razed.TakeOrphanedGarrisons();

        var orphan = Assert.Single(orphans);
        Assert.Equal(tower, orphan.From);
        Assert.Equal([new UnitStack(UnitType.Spearman, 8), new UnitStack(UnitType.Bowman, 2)], orphan.Stacks);
        Assert.Equal([new UnitStack(UnitType.Spearman, 5)], rest.Garrison);
        Assert.Empty(rest.TakeOrphanedGarrisons().Orphaned);
    }

    [Fact]
    public void A_standing_spot_has_no_orphans()
    {
        var settlement = Found(false, Tower(2, 0)).WithGarrisonAt(new HexCoord(2, 0), [new UnitStack(UnitType.Spearman, 8)]);

        Assert.Empty(settlement.TakeOrphanedGarrisons().Orphaned);
    }

    [Fact]
    public void Home_losses_come_off_the_spots_pro_rata_per_type()
    {
        var tower = new HexCoord(2, 0);
        var settlement = Found(false, Tower(2, 0))
            .WithGarrisonAt(Centre, [new UnitStack(UnitType.Spearman, 30)])
            .WithGarrisonAt(tower, [new UnitStack(UnitType.Spearman, 10)]);

        var after = settlement.WithHomeDeaths([new UnitStack(UnitType.Spearman, 8)]);

        Assert.Equal(24, after.GarrisonAt(Centre).Single().Count);
        Assert.Equal(8, after.GarrisonAt(tower).Single().Count);
    }

    [Fact]
    public void Guests_are_read_per_spot_from_the_armies_standing_there()
    {
        var host = Guid.CreateVersion7();
        var tower = new HexCoord(2, 0);
        Army Guest(HexCoord spot, params UnitStack[] stacks) => new()
        {
            Id = Guid.CreateVersion7(),
            SettlementId = Guid.CreateVersion7(),
            HomeSpot = Centre,
            Stacks = stacks,
            Location = new ArmyLocation.Supporting(host, spot),
        };

        var guests = new[]
        {
            Guest(tower, new UnitStack(UnitType.Spearman, 3)),
            Guest(tower, new UnitStack(UnitType.Spearman, 2), new UnitStack(UnitType.Bowman, 1)),
            Guest(Centre, new UnitStack(UnitType.Axeman, 9)),
        };

        Assert.Equal([new UnitStack(UnitType.Spearman, 5), new UnitStack(UnitType.Bowman, 1)], Army.GuestsAt(guests, host, tower));
        Assert.Equal([new UnitStack(UnitType.Axeman, 9)], Army.GuestsAt(guests, host, Centre));
        Assert.Empty(Army.GuestsAt(guests, Guid.CreateVersion7(), tower));
    }

    [Fact]
    public void A_dispatch_for_admin_garrison_edits_must_name_a_spot_that_can_hold_the_unit()
    {
        var settlement = Found(false, Tower(2, 0), Dock(4, 0));

        var atTower = settlement.AdjustGarrison(new HexCoord(2, 0), UnitType.Spearman, 3, T0);
        var shipsAtTower = settlement.AdjustGarrison(new HexCoord(2, 0), UnitType.Karve, 1, T0);
        var landAtDock = settlement.AdjustGarrison(new HexCoord(4, 0), UnitType.Spearman, 1, T0);
        var nowhere = settlement.AdjustGarrison(new HexCoord(1, 0), UnitType.Spearman, 1, T0);

        Assert.True(atTower.Accepted);
        Assert.Equal(3, atTower.Settlement!.GarrisonAt(new HexCoord(2, 0)).Single().Count);
        Assert.Equal(AdminGarrisonEditRejection.NoFittingSpot, shipsAtTower.Rejection);
        Assert.Equal(AdminGarrisonEditRejection.NoFittingSpot, landAtDock.Rejection);
        Assert.Equal(AdminGarrisonEditRejection.NoFittingSpot, nowhere.Rejection);
    }
}
