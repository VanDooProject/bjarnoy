using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// How bridges open wide rivers to land armies (<c>docs/design/economy.md</c> section 5, <see cref="BridgeIndex"/>): a wide river is shut
/// without one; level 1 and 2 make the crossing slower than any terrain, level 3 is as free as the land, level 4 is free for the owner and
/// their friends only. The scene is a strip of grass (q 0..6, r -3..3) cut in two by a wide river down the column q = 3 whose ends are closed by mountains.
/// </summary>
public sealed class BridgeMovementTests
{
    private static readonly Guid Owner = Guid.Parse("00000000-0000-0000-0000-00000000000a");
    private static readonly Guid Friend = Guid.Parse("00000000-0000-0000-0000-00000000000c");
    private static readonly Guid Stranger = Guid.Parse("00000000-0000-0000-0000-00000000000b");

    private static readonly HexCoord West = new(1, 0);
    private static readonly HexCoord East = new(5, 0);
    private static readonly HexCoord Span = new(3, 0);

    private static Dictionary<HexCoord, Terrain> Strip()
    {
        var terrain = new Dictionary<HexCoord, Terrain>();
        for (var q = 0; q <= 6; q++)
        {
            for (var r = -3; r <= 3; r++)
            {
                terrain[new HexCoord(q, r)] = Terrain.Grass;
            }
        }

        terrain[new HexCoord(3, -4)] = Terrain.Mountain;
        terrain[new HexCoord(3, 4)] = Terrain.Mountain;
        return terrain;
    }

    private static bool IsRiver(HexCoord h) => h.Q == 3 && h.R is >= -3 and <= 3;

    private static BridgeIndex Index(IReadOnlyDictionary<HexCoord, Terrain> terrain, int? level, Guid? owner = null, Func<Guid, Guid, bool>? friends = null) =>
        new(level is { } l ? [new StandingBridge(Span, l, owner ?? Owner)] : [], h => terrain.GetValueOrDefault(h, Terrain.Sea), friends);

    private static bool Friends(Guid a, Guid b) => (a == Owner && b == Friend) || (a == Friend && b == Owner);

    private static IReadOnlyList<HexCoord>? Route(IReadOnlyDictionary<HexCoord, Terrain> terrain, BridgeIndex bridges, Guid walker, Func<HexCoord, bool>? wide = null) =>
        HexPathfinder.FindPath(
            West, East, h => terrain.GetValueOrDefault(h, Terrain.Sea), true,
            IsRiver, wide ?? IsRiver, bridgeCost: bridges.ForOwner(walker));

    private static double Hours(IReadOnlyDictionary<HexCoord, Terrain> terrain, BridgeIndex bridges, Guid walker, IReadOnlyList<HexCoord> path) =>
        HexPathfinder.CumulativeHours(
            path, h => terrain.GetValueOrDefault(h, Terrain.Sea), 1.0, isRiver: IsRiver, isWideRiver: IsRiver, bridgeCost: bridges.ForOwner(walker))[^1];

    [Fact]
    public void Without_a_bridge_the_wide_river_is_shut_to_everyone()
    {
        var terrain = Strip();
        Assert.Null(Route(terrain, Index(terrain, null), Owner));
        Assert.Null(Route(terrain, Index(terrain, null), Stranger));
    }

    [Fact]
    public void A_foundation_does_not_open_the_river()
    {
        var terrain = Strip();
        Assert.Null(Route(terrain, Index(terrain, 0), Owner));
    }

    [Theory]
    [InlineData(1, 3 + 6.0)] // three grass steps plus the span
    [InlineData(2, 3 + 4.0)]
    [InlineData(3, 3 + 1.0)]
    [InlineData(4, 3 + 1.0)]
    public void Each_level_prices_the_crossing_for_the_owner_and_for_a_stranger_alike_up_to_level_3(int level, double expected)
    {
        var terrain = Strip();
        var bridges = Index(terrain, level);

        var path = Route(terrain, bridges, Owner);
        Assert.NotNull(path);
        Assert.Contains(Span, path!);
        Assert.Equal(expected, Hours(terrain, bridges, Owner, path));

        if (level <= 3)
        {
            var strangerPath = Route(terrain, bridges, Stranger);
            Assert.NotNull(strangerPath);
            Assert.Equal(expected, Hours(terrain, bridges, Stranger, strangerPath!));
        }
    }

    [Fact]
    public void The_step_costs_are_the_causeway_and_footbridge_constants_over_the_base_step()
    {
        var terrain = Strip();
        Assert.Equal(1.0 + HexPathfinder.CausewayCrossingCost, Index(terrain, 1).CrossingCost(Span, Owner));
        Assert.Equal(6.0, Index(terrain, 1).CrossingCost(Span, Owner));
        Assert.Equal(1.0 + HexPathfinder.FootbridgeCrossingCost, Index(terrain, 2).CrossingCost(Span, Owner));
        Assert.Equal(4.0, Index(terrain, 2).CrossingCost(Span, Owner));
    }

    [Fact]
    public void A_kings_bridge_costs_the_terrain_under_it()
    {
        var terrain = Strip();
        terrain[Span] = Terrain.Forest;
        Assert.Equal(1.3, Index(terrain, 3).CrossingCost(Span, Stranger));
        terrain[Span] = Terrain.Sand;
        Assert.Equal(1.1, Index(terrain, 3).CrossingCost(Span, Stranger));
    }

    [Fact]
    public void A_guarded_bridge_opens_for_its_owner_and_friends_and_not_for_strangers()
    {
        var terrain = Strip();
        var bridges = Index(terrain, 4, friends: Friends);

        Assert.NotNull(Route(terrain, bridges, Owner));
        Assert.NotNull(Route(terrain, bridges, Friend));
        Assert.Null(Route(terrain, bridges, Stranger));
        Assert.Null(bridges.CrossingCost(Span, Stranger));
    }

    [Fact]
    public void A_level_3_bridge_is_open_to_a_stranger_where_the_level_4_one_was_not()
    {
        var terrain = Strip();
        Assert.Null(Route(terrain, Index(terrain, 4), Stranger));
        Assert.NotNull(Route(terrain, Index(terrain, 3), Stranger));
    }

    [Fact]
    public void A_bridge_never_changes_the_price_of_a_stream()
    {
        var terrain = Strip();
        var bridges = Index(terrain, 1);

        // The river is only a stream here: the flat stream price, whatever bridge stands on it.
        var path = Route(terrain, bridges, Owner, wide: _ => false);
        Assert.NotNull(path);
        Assert.Equal(3 + 1.0 + HexPathfinder.RiverCrossingCost, HexPathfinder.CumulativeHours(path!, h => terrain.GetValueOrDefault(h, Terrain.Sea), 1.0, isRiver: IsRiver, isWideRiver: _ => false, bridgeCost: bridges.ForOwner(Owner))[^1], 1e-9);
    }

    [Fact]
    public void A_sieged_guarded_bridge_loses_its_levels_and_the_river_shuts_again()
    {
        var terrain = Strip();
        List<PlacedBuilding> buildings = [new(new HexCoord(0, 0), BuildingType.Longhouse, 7), new(Span, BuildingType.Bridge, 4)];

        // One catapult is 40 siege power: floor(sqrt(20)) = 4 levels, the whole guarded bridge.
        var outcome = SiegeResolver.Resolve([new UnitStack(UnitType.Catapult, 1)], buildings, requestedTargetCoord: Span, seed: 1);

        Assert.True(outcome.Applied);
        Assert.Equal(BuildingType.Bridge, outcome.TargetType);
        Assert.Equal(4, outcome.LevelBefore);
        Assert.DoesNotContain(outcome.UpdatedBuildings!, b => b.Type == BuildingType.Bridge);

        var after = new BridgeIndex(
            outcome.UpdatedBuildings!.Where(b => b.Type == BuildingType.Bridge).Select(b => new StandingBridge(b.Coord, b.Level, Owner)),
            h => terrain.GetValueOrDefault(h, Terrain.Sea));
        Assert.Null(Route(terrain, after, Owner));
        Assert.Null(Route(terrain, after, Stranger));
    }

    [Fact]
    public void The_route_rules_pass_the_bridge_on_with_or_without_walls()
    {
        var terrain = Strip();
        var noWalls = new PalisadeIndex([], h => terrain.GetValueOrDefault(h, Terrain.Sea), _ => false);

        Assert.Null(new LandRouteIndex(noWalls, Index(terrain, null)).ForOwner(Owner));

        var rules = new LandRouteIndex(noWalls, Index(terrain, 2)).ForOwner(Owner);
        Assert.NotNull(rules?.BridgeCost);
        Assert.Equal(4.0, rules!.BridgeCost!(Span));
        Assert.False(rules.Blocked(Span));
    }
}
