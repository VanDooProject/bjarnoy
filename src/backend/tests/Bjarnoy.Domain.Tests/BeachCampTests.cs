using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>The beach camp (<c>docs/design/skirmish/beach-camp.md</c>): a one-hex settlement centre with a flat stock and no production.</summary>
public class BeachCampTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);
    private static readonly Guid Camp = Guid.Parse("00000000-0000-0000-0000-0000000000c1");
    private static readonly Guid Realm = Guid.Parse("00000000-0000-0000-0000-0000000000a1");

    private static Settlement FoundCamp(HexCoord? at = null)
    {
        var centre = at ?? Centre;
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.BeachCamp, 1)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Camp",
            Centre = centre,
            Buildings = [new PlacedBuilding(centre, BuildingType.BeachCamp, 1)],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(100), production, capacity, T0),
        };
    }

    private static Settlement FoundLonghouse() => new()
    {
        Id = Guid.CreateVersion7(),
        Name = "Bjornstad",
        Centre = Centre,
        Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 1)],
        Resources = ResourcePool.Create(
            ResourceAmounts.Uniform(100),
            BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]).ProductionPerHour,
            BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]).Capacity,
            T0),
    };

    private static RealmSettlement CampAt(int q) =>
        new(Camp, new HexCoord(q, 0), [new PlacedBuilding(new HexCoord(q, 0), BuildingType.BeachCamp, 1)]);

    private static RealmSettlement LonghouseAt(int q, int level = 2) =>
        new(Realm, new HexCoord(q, 0), [new PlacedBuilding(new HexCoord(q, 0), BuildingType.Longhouse, level)]);

    [Fact]
    public void IsBeachCamp_is_true_only_with_a_camp_at_the_centre()
    {
        Assert.True(FoundCamp().IsBeachCamp);
        Assert.False(FoundLonghouse().IsBeachCamp);

        // A camp standing off-centre does not make the settlement a camp.
        var offCentre = FoundLonghouse() with
        {
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 1), new PlacedBuilding(new HexCoord(1, 0), BuildingType.BeachCamp, 1)],
        };
        Assert.False(offCentre.IsBeachCamp);
    }

    [Fact]
    public void A_camp_stores_2000_of_each_resource_and_produces_nothing_even_after_time_passes()
    {
        var camp = FoundCamp();

        var settled = camp.SettleTo(T0.AddDays(3)).Settlement;
        var (production, capacity) = settled.CurrentTotals();

        Assert.Equal(ResourceAmounts.Uniform(2000), capacity);
        Assert.Equal(ResourceAmounts.Zero, production);
        Assert.Equal(ResourceAmounts.Uniform(100), settled.Resources.Stock);
    }

    [Fact]
    public void A_camp_is_not_player_buildable_and_cannot_be_upgraded()
    {
        var camp = FoundCamp();

        var placed = FoundLonghouse().PlanBuild(BuildingType.BeachCamp, new HexCoord(1, 0), Terrain.Sand, T0, Guid.CreateVersion7());
        var upgraded = camp.PlanBuild(BuildingType.BeachCamp, Centre, Terrain.Sand, T0, Guid.CreateVersion7());

        Assert.False(placed.Accepted);
        Assert.Equal(BuildRejection.NewPlacementDisabled, placed.Rejection);
        Assert.False(upgraded.Accepted);
        Assert.Equal(BuildRejection.MaxLevelReached, upgraded.Rejection);
        Assert.Equal(1, BuildingCatalogue.MaxLevelFor(BuildingType.BeachCamp));
    }

    [Fact]
    public void A_camps_claim_is_its_own_hex_only()
    {
        var camp = FoundCamp();

        Assert.True(camp.Claims(Centre));
        Assert.False(camp.Claims(new HexCoord(1, 0)));
        Assert.Equal((Centre, 0), Settlement.CentreDisc(Centre, 0, isBeachCamp: true));
        Assert.Equal(0, BuildingCatalogue.Get(BuildingType.BeachCamp, 1).ClaimRadius);
    }

    [Fact]
    public void A_destroyed_longhouse_still_has_no_disc_and_a_living_one_keeps_its_radius()
    {
        Assert.Null(Settlement.CentreDisc(Centre, 0, isBeachCamp: false));
        Assert.Equal((Centre, 3), Settlement.CentreDisc(Centre, 2, isBeachCamp: false));
    }

    [Fact]
    public void A_camp_touching_a_same_owner_realm_links_one_two_hexes_away_does_not()
    {
        // The level-2 Longhouse at 0 claims radius 3 (hexes 0..3): a camp on hex 4 shares an edge with the rim, hex 5 leaves a gap.
        var touching = new[] { LonghouseAt(0), CampAt(4) };
        var apart = new[] { LonghouseAt(0), CampAt(5) };

        var linked = LinkedGroups.Components(ConnectedRealm.Resolve(touching), [Realm, Camp], GiantIndex.Empty);
        var separate = LinkedGroups.Components(ConnectedRealm.Resolve(apart), [Realm, Camp], GiantIndex.Empty);

        Assert.Single(linked);
        Assert.Equal(2, separate.Count);
    }

    [Fact]
    public void A_camp_adds_no_construction_slots_and_no_tower_limit_to_a_linked_realm()
    {
        var camp = FoundCamp();

        Assert.Equal(0, camp.OwnConstructionSlots);
        Assert.Equal(0, camp.TowerLimit);
        Assert.Equal(0, BuildingCatalogue.MaxTowers(camp.LonghouseLevel));
        Assert.Equal(2, FoundLonghouse().OwnConstructionSlots);
    }

    [Fact]
    public void A_camp_does_not_count_as_a_longhouse_for_building_requirements()
    {
        var camp = FoundCamp();

        Assert.Equal(0, camp.LonghouseLevel);
        var decision = camp.PlanBuild(BuildingType.Lumberjack, Centre, Terrain.Forest, T0, Guid.CreateVersion7());
        Assert.False(decision.Accepted);
    }

    [Fact]
    public void Field_battle_claim_at_a_camp_covers_only_its_own_hex()
    {
        var buildings = new[] { new PlacedBuilding(Centre, BuildingType.BeachCamp, 1) };

        Assert.True(FieldBattleResolver.ClaimAt(Centre, Centre, buildings).Claims);
        Assert.False(FieldBattleResolver.ClaimAt(new HexCoord(1, 0), Centre, buildings).Claims);
    }

    [Fact]
    public void A_camp_is_one_garrison_spot_that_holds_land_units_and_ships()
    {
        var spot = Assert.Single(FoundCamp().GarrisonSpots);

        Assert.Equal(GarrisonSpotKind.BeachCamp, spot.Kind);
        Assert.Equal(Centre, spot.Coord);
        Assert.True(spot.Holds(UnitType.Spearman));
        Assert.True(spot.Holds(UnitType.Snekkja));
    }

    [Fact]
    public void A_fleet_finds_the_camp_as_a_spot_where_a_longhouse_away_from_the_sea_has_none()
    {
        UnitStack[] fleet = [new UnitStack(UnitType.Snekkja, 2), new UnitStack(UnitType.Spearman, 5)];

        Assert.Equal(Centre, FoundCamp().NearestSpotFor(new HexCoord(3, 0), fleet)?.Coord);
        Assert.Null(FoundLonghouse().NearestSpotFor(new HexCoord(3, 0), fleet));
    }
}
