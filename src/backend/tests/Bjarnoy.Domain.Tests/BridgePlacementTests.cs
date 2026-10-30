using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The Bridge (<c>docs/design/economy.md</c> section 5): the catalogue entry (unlock, prerequisite, four levels with their own costs) and the
/// placement rule <c>Settlement.PlanBuild</c> applies on top of the usual claim / prerequisite checks: only on a wide river hex of shape
/// Straight, Bend or Bend60, not on a stream or a wasted island.
/// </summary>
public sealed class BridgePlacementTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);
    private static readonly HexCoord Span = new(2, 0);

    private static Settlement Home(int longhouseLevel = 7, int townSquareLevel = 1, params (HexCoord At, BuildingType Type, int Level)[] extra)
    {
        List<PlacedBuilding> buildings =
        [
            new(Centre, BuildingType.Longhouse, longhouseLevel),
            new(new HexCoord(-1, 0), BuildingType.TownSquare, townSquareLevel),
            .. extra.Select(e => new PlacedBuilding(e.At, e.Type, e.Level)),
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

    private static BuildDecision Plan(
        Settlement settlement, HexCoord? at = null, RiverTileShape? shape = RiverTileShape.Straight, bool wide = true, bool wasted = false,
        RiverVariant variant = RiverVariant.Plain, Terrain terrain = Terrain.Grass) =>
        settlement.PlanBuild(
            BuildingType.Bridge, at ?? Span, terrain, T0, Guid.CreateVersion7(), maxWaitingOrders: 5,
            riverShapeAt: shape, riverVariantAt: variant, isWideRiverAt: wide, onWastedIsland: wasted);

    [Fact]
    public void The_bridge_unlocks_at_longhouse_7_behind_a_town_square_and_has_four_levels_with_their_own_costs()
    {
        Assert.Equal(32, (int)BuildingType.Bridge);
        Assert.Equal("bridge", BuildingType.Bridge.ToWireName());
        Assert.Equal(4, BuildingCatalogue.MaxLevelFor(BuildingType.Bridge));
        Assert.Equal(7, BuildingCatalogue.UnlockLevel(BuildingType.Bridge));
        Assert.Contains(BuildingType.Bridge, BuildingCatalogue.AllTypes);
        Assert.Null(BuildingCatalogue.TryGet(BuildingType.Bridge, 5));
        Assert.Equal(new BuildingPrerequisite(BuildingType.TownSquare, 1), Assert.Single(BuildingCatalogue.Get(BuildingType.Bridge, 1).Prerequisites));
        Assert.Empty(BuildingCatalogue.Get(BuildingType.Bridge, 2).Prerequisites);

        (int Level, ResourceAmounts Cost, TimeSpan Time)[] expected =
        [
            (1, new(Wood: 120, Stone: 0, Food: 20, Iron: 0), TimeSpan.FromMinutes(10)),
            (2, new(Wood: 220, Stone: 0, Food: 30, Iron: 0), TimeSpan.FromMinutes(20)),
            (3, new(Wood: 380, Stone: 160, Food: 40, Iron: 0), TimeSpan.FromMinutes(45)),
            (4, new(Wood: 660, Stone: 340, Food: 60, Iron: 0), TimeSpan.FromMinutes(90)),
        ];
        foreach (var (level, cost, time) in expected)
        {
            var definition = BuildingCatalogue.Get(BuildingType.Bridge, level);
            Assert.Equal(cost, definition.Cost);
            Assert.Equal(time, definition.BuildDuration);
            Assert.Equal(7, definition.RequiredLonghouseLevel);
            Assert.Equal(0, definition.ClaimRadius);
            Assert.Equal(ResourceAmounts.Zero, definition.ProductionPerHour);
            Assert.Equal(ResourceAmounts.Zero, definition.StorageCapacity);
        }
    }

    [Fact]
    public void A_bridge_is_refused_below_longhouse_7_and_without_a_town_square()
    {
        Assert.Equal(BuildRejection.LonghouseTooLow, Plan(Home(longhouseLevel: 6)).Rejection);
        var none = Plan(Home(townSquareLevel: 0));
        Assert.Equal(BuildRejection.RequiredBuildingTooLow, none.Rejection);
        Assert.Equal(new BuildingPrerequisite(BuildingType.TownSquare, 1), none.MissingPrerequisite);
    }

    [Theory]
    [InlineData(RiverTileShape.Straight)]
    [InlineData(RiverTileShape.Bend)]
    [InlineData(RiverTileShape.Bend60)]
    public void A_bridge_is_accepted_on_a_wide_straight_bend_or_bend60(RiverTileShape shape)
    {
        var decision = Plan(Home(), shape: shape);
        Assert.True(decision.Accepted, decision.Rejection.ToString());
        Assert.Equal(1, decision.Order!.TargetLevel);
    }

    [Theory]
    [InlineData(RiverVariant.Plain)]
    [InlineData(RiverVariant.Loop)]
    [InlineData(RiverVariant.Meander)]
    [InlineData(RiverVariant.Island)]
    public void Any_river_art_variant_takes_a_bridge(RiverVariant variant) =>
        Assert.True(Plan(Home(), shape: RiverTileShape.Bend60, variant: variant).Accepted);

    [Theory]
    [InlineData(Terrain.Grass)]
    [InlineData(Terrain.Forest)]
    [InlineData(Terrain.Sand)]
    public void Whatever_land_lies_under_the_river_is_allowed(Terrain terrain) =>
        Assert.True(Plan(Home(), terrain: terrain).Accepted);

    [Theory]
    [InlineData(RiverTileShape.Spring)]
    [InlineData(RiverTileShape.Confluence)]
    [InlineData(RiverTileShape.Mouth)]
    public void A_bridge_is_refused_on_a_spring_confluence_or_mouth(RiverTileShape shape) =>
        Assert.Equal(BuildRejection.TerrainNotAllowed, Plan(Home(), shape: shape).Rejection);

    [Fact]
    public void A_bridge_is_refused_on_dry_land()
    {
        Assert.Equal(BuildRejection.TerrainNotAllowed, Plan(Home(), shape: null, wide: false).Rejection);
    }

    [Fact]
    public void A_bridge_is_refused_on_a_stream_with_its_own_rejection()
    {
        Assert.Equal(BuildRejection.BridgeNeedsWideRiver, Plan(Home(), wide: false).Rejection);
        Assert.Equal(BuildRejection.BridgeNeedsWideRiver, Plan(Home(), shape: RiverTileShape.Bend, wide: false).Rejection);
    }

    [Fact]
    public void A_bridge_is_refused_on_a_wasted_island() =>
        Assert.Equal(BuildRejection.TerrainNotAllowed, Plan(Home(), wasted: true).Rejection);

    [Fact]
    public void A_bridge_is_refused_outside_the_claim() =>
        Assert.Equal(BuildRejection.HexNotInSettlement, Plan(Home(), at: new HexCoord(60, 0)).Rejection);

    [Fact]
    public void A_bridge_is_refused_on_an_occupied_hex() =>
        Assert.Equal(BuildRejection.HexOccupied, Plan(Home(extra: [(Span, BuildingType.Farm, 1)])).Rejection);

    [Fact]
    public void A_standing_bridge_is_raised_level_by_level_up_to_four()
    {
        var level1 = Home(extra: [(Span, BuildingType.Bridge, 1)]);
        var next = Plan(level1);
        Assert.True(next.Accepted, next.Rejection.ToString());
        Assert.Equal(2, next.Order!.TargetLevel);
        Assert.Equal(TimeSpan.FromMinutes(20), next.Order.BaseDuration);

        Assert.Equal(BuildRejection.MaxLevelReached, Plan(Home(extra: [(Span, BuildingType.Bridge, 4)])).Rejection);
    }
}
