using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class HexPathfinderTests
{
    private static Func<HexCoord, Terrain> AllGrass() => _ => Terrain.Grass;

    [Fact]
    public void Finds_the_shortest_path_on_open_grass_terrain()
    {
        var from = new HexCoord(0, 0);
        var to = new HexCoord(3, -1);

        var path = HexPathfinder.FindPath(from, to, AllGrass(), isLandUnit: true);

        Assert.NotNull(path);
        Assert.Equal(from, path![0]);
        Assert.Equal(to, path[^1]);
        // Uniform terrain: the path length equals hex distance plus one (both endpoints included).
        Assert.Equal(from.DistanceTo(to) + 1, path.Count);
    }

    [Fact]
    public void Search_with_a_small_budget_reports_the_limit_and_the_budget_as_expanded()
    {
        var search = HexPathfinder.Search(new HexCoord(0, 0), new HexCoord(20, 0), AllGrass(), isLandUnit: true, maxExpandedNodes: 5);

        Assert.True(search.LimitReached);
        Assert.Null(search.Path);
        Assert.Equal(5, search.Expanded);
    }

    [Fact]
    public void Search_that_finds_its_route_reports_how_many_nodes_it_expanded()
    {
        var search = HexPathfinder.Search(new HexCoord(0, 0), new HexCoord(4, 0), AllGrass(), isLandUnit: true);

        Assert.False(search.LimitReached);
        Assert.NotNull(search.Path);
        Assert.InRange(search.Expanded, 1, HexPathfinder.MaxExpandedNodes);

        // Exactly that budget is enough, one less is not.
        Assert.NotNull(HexPathfinder.Search(new HexCoord(0, 0), new HexCoord(4, 0), AllGrass(), isLandUnit: true, maxExpandedNodes: search.Expanded).Path);
        Assert.True(HexPathfinder.Search(new HexCoord(0, 0), new HexCoord(4, 0), AllGrass(), isLandUnit: true, maxExpandedNodes: search.Expanded - 1).LimitReached);
    }

    [Fact]
    public void Returns_a_single_hex_path_when_from_and_to_are_the_same()
    {
        var coord = new HexCoord(2, 2);

        var path = HexPathfinder.FindPath(coord, coord, AllGrass(), isLandUnit: true);

        Assert.Equal([coord], path);
    }

    [Fact]
    public void Prefers_cheaper_terrain_over_a_shorter_raw_distance()
    {
        // A straight line from (0,0) to (4,0) crosses bog (cost 2.0);
        // a one-hex detour through grass (cost 1.0) is cheaper overall
        // than the "shorter" direct route, even though it visits one more
        // hex. (Bog stands in for the mountain this test used before
        // mountains became impassable: that case is covered by
        // Mountains_are_impassable_to_land_armies below.)
        var mountainLine = new HashSet<HexCoord>
        {
            new(1, 0), new(2, 0), new(3, 0),
        };

        Terrain TerrainAt(HexCoord c) => mountainLine.Contains(c) ? Terrain.Bog : Terrain.Grass;

        var from = new HexCoord(0, 0);
        var to = new HexCoord(4, 0);

        var path = HexPathfinder.FindPath(from, to, TerrainAt, isLandUnit: true);

        Assert.NotNull(path);
        // The cheapest route detours around the mountain line entirely
        // rather than crossing it, even though that means more hexes.
        Assert.DoesNotContain(path!, mountainLine.Contains);
    }

    [Fact]
    public void Returns_null_when_the_only_route_crosses_sea()
    {
        var seaWall = new HashSet<HexCoord>();
        for (var r = -10; r <= 10; r++)
        {
            seaWall.Add(new HexCoord(2, r));
        }

        Terrain TerrainAt(HexCoord c) => seaWall.Contains(c) ? Terrain.Sea : Terrain.Grass;

        var from = new HexCoord(0, 0);
        var to = new HexCoord(5, 0);

        var path = HexPathfinder.FindPath(from, to, TerrainAt, isLandUnit: true);

        Assert.Null(path);
    }

    [Fact]
    public void Returns_null_when_the_destination_itself_is_sea()
    {
        Terrain TerrainAt(HexCoord c) => c == new HexCoord(3, 0) ? Terrain.Sea : Terrain.Grass;

        var path = HexPathfinder.FindPath(new HexCoord(0, 0), new HexCoord(3, 0), TerrainAt, isLandUnit: true);

        Assert.Null(path);
    }

    [Fact]
    public void Respects_a_hand_built_obstacle_course()
    {
        // A narrow corridor: everything is sea except a winding one-hex-wide
        // grass path from (0,0) to (0,4).
        var corridor = new HashSet<HexCoord>
        {
            new(0, 0), new(1, 0), new(1, 1), new(0, 2), new(0, 3), new(0, 4),
        };

        Terrain TerrainAt(HexCoord c) => corridor.Contains(c) ? Terrain.Grass : Terrain.Sea;

        var path = HexPathfinder.FindPath(new HexCoord(0, 0), new HexCoord(0, 4), TerrainAt, isLandUnit: true);

        Assert.NotNull(path);
        Assert.All(path!, c => Assert.Contains(c, corridor));
        // Consecutive hexes in the path must actually be neighbours.
        for (var i = 1; i < path!.Count; i++)
        {
            Assert.Equal(1, path[i - 1].DistanceTo(path[i]));
        }
    }

    [Fact]
    public void Fleet_finds_a_path_across_open_sea()
    {
        var from = new HexCoord(0, 0);
        var to = new HexCoord(3, -1);

        var path = HexPathfinder.FindPath(from, to, _ => Terrain.Sea, isLandUnit: false);

        Assert.NotNull(path);
        Assert.Equal(from, path![0]);
        Assert.Equal(to, path[^1]);
        Assert.Equal(from.DistanceTo(to) + 1, path.Count);
    }

    [Fact]
    public void Fleet_path_is_blocked_by_land()
    {
        var landWall = new HashSet<HexCoord>();
        for (var r = -10; r <= 10; r++)
        {
            landWall.Add(new HexCoord(2, r));
        }

        Terrain TerrainAt(HexCoord c) => landWall.Contains(c) ? Terrain.Grass : Terrain.Sea;

        var path = HexPathfinder.FindPath(new HexCoord(0, 0), new HexCoord(5, 0), TerrainAt, isLandUnit: false);

        Assert.Null(path);
    }

    [Fact]
    public void Fleet_may_beach_at_a_land_destination_reachable_by_sea()
    {
        // A fleet's own home settlement and an attack target's settlement are
        // always land hexes, even coastal ones — FindPath exempts exactly the
        // two route endpoints from the sea-only rule so a fleet can still
        // depart its own harbor and land at a shoreline target (issue #40
        // phase 6 §4; see the isLandUnit remarks on FindPath).
        Terrain TerrainAt(HexCoord c) => c == new HexCoord(3, 0) ? Terrain.Grass : Terrain.Sea;

        var path = HexPathfinder.FindPath(new HexCoord(0, 0), new HexCoord(3, 0), TerrainAt, isLandUnit: false);

        Assert.NotNull(path);
        Assert.Equal(new HexCoord(3, 0), path![^1]);
    }

    [Fact]
    public void Fleet_cannot_beach_when_the_land_destination_has_no_adjacent_sea()
    {
        // The destination endpoint exemption only waives the *terrain* check
        // for the final hop — it still has to be reachable through actual
        // open sea from somewhere. A land destination entirely walled off by
        // more land is still unreachable.
        var landBlob = new HashSet<HexCoord>
        {
            new(3, 0), new(4, 0), new(4, -1), new(3, -1), new(2, 0), new(2, 1), new(3, 1),
        };
        Terrain TerrainAt(HexCoord c) => landBlob.Contains(c) ? Terrain.Grass : Terrain.Sea;

        var path = HexPathfinder.FindPath(new HexCoord(0, 0), new HexCoord(3, 0), TerrainAt, isLandUnit: false);

        Assert.Null(path);
    }

    [Fact]
    public void Land_pathing_is_unaffected_by_the_sea_cost_table_existing()
    {
        // Byte-for-byte the same scenario as Prefers_cheaper_terrain_over_a_shorter_raw_distance,
        // re-run after fleet support was added — nothing about the land
        // terrain-cost table should have changed.
        var mountainLine = new HashSet<HexCoord> { new(1, 0), new(2, 0), new(3, 0) };
        Terrain TerrainAt(HexCoord c) => mountainLine.Contains(c) ? Terrain.Mountain : Terrain.Grass;

        var path = HexPathfinder.FindPath(new HexCoord(0, 0), new HexCoord(4, 0), TerrainAt, isLandUnit: true);

        Assert.NotNull(path);
        Assert.DoesNotContain(path!, mountainLine.Contains);
    }

    [Fact]
    public void Waypoint_concatenation_visits_every_stop_in_order()
    {
        HexCoord home = new(0, 0);
        HexCoord waypoint = new(3, 0);
        HexCoord destination = new(3, 3);

        var leg1 = HexPathfinder.FindPath(home, waypoint, AllGrass(), isLandUnit: true)!;
        var leg2 = HexPathfinder.FindPath(waypoint, destination, AllGrass(), isLandUnit: true)!;

        List<HexCoord> fullPath = [.. leg1, .. leg2.Skip(1)];

        Assert.Equal(home, fullPath[0]);
        Assert.Contains(waypoint, fullPath);
        Assert.Equal(destination, fullPath[^1]);
        Assert.True(fullPath.IndexOf(waypoint) < fullPath.IndexOf(destination));

        // No duplicated joint hex between the two legs.
        Assert.Equal(fullPath.Count, fullPath.Distinct().Count());
    }

    [Fact]
    public void Cumulative_hours_reflect_terrain_cost_not_just_hex_count()
    {
        var path = new List<HexCoord> { new(0, 0), new(1, 0), new(2, 0) };
        Terrain TerrainAt(HexCoord c) => c == new HexCoord(2, 0) ? Terrain.Bog : Terrain.Grass;

        var hours = HexPathfinder.CumulativeHours(path, TerrainAt, hexesPerHour: 2.0);

        Assert.Equal(0, hours[0]);
        Assert.Equal(0.5, hours[1], 6); // grass: 1.0 / 2.0
        Assert.Equal(0.5 + 0.75, hours[2], 6); // + (grass 1.0 + bog 2.0) / 2 / 2.0
    }

    [Fact]
    public void Cumulative_hours_scale_down_with_the_world_speed_factor()
    {
        var path = new List<HexCoord> { new(0, 0), new(1, 0), new(2, 0) };
        Terrain TerrainAt(HexCoord c) => c == new HexCoord(2, 0) ? Terrain.Bog : Terrain.Grass;

        var normal = HexPathfinder.CumulativeHours(path, TerrainAt, hexesPerHour: 2.0);
        var doubled = HexPathfinder.CumulativeHours(path, TerrainAt, hexesPerHour: 2.0, speedFactor: 2.0);

        Assert.Equal(normal[1] / 2.0, doubled[1], 6);
        Assert.Equal(normal[2] / 2.0, doubled[2], 6);
    }

    // --- River crossing cost (issue #159 part A) ---------------------------

    [Fact]
    public void Routes_around_a_river_when_the_detour_is_cheaper_than_the_crossing_penalty()
    {
        // A short river straight across the direct line; going around it
        // costs less than RiverCrossingCost (8.0) on top of the crossing's
        // own terrain cost, so the cheapest route detours entirely.
        var river = new HashSet<HexCoord> { new(2, 0) };
        bool IsRiver(HexCoord c) => river.Contains(c);

        var from = new HexCoord(0, 0);
        var to = new HexCoord(4, 0);

        var path = HexPathfinder.FindPath(from, to, AllGrass(), isLandUnit: true, IsRiver)!;

        Assert.NotNull(path);
        Assert.DoesNotContain(path, river.Contains);
    }

    [Fact]
    public void Crosses_a_river_when_no_detour_exists_within_the_search_bounds()
    {
        // The exact same shape as Returns_null_when_the_only_route_crosses_sea
        // (a wall spanning the whole padded search box), but with a river
        // instead of sea. Sea returns null; a river never does — it only
        // adds a crossing cost, so the search still finds a route straight
        // through the wall rather than failing outright.
        var riverWall = new HashSet<HexCoord>();
        for (var r = -10; r <= 10; r++)
        {
            riverWall.Add(new HexCoord(2, r));
        }

        bool IsRiver(HexCoord c) => riverWall.Contains(c);

        var from = new HexCoord(0, 0);
        var to = new HexCoord(4, 0);

        var path = HexPathfinder.FindPath(from, to, AllGrass(), isLandUnit: true, IsRiver)!;

        Assert.NotNull(path);
        Assert.Contains(new HexCoord(2, 0), path);
    }

    [Fact]
    public void Cumulative_hours_bill_a_river_hex_half_when_entered_and_half_when_left()
    {
        var path = new List<HexCoord> { new(0, 0), new(1, 0), new(2, 0) };
        bool IsRiver(HexCoord c) => c == new HexCoord(2, 0);

        var hours = HexPathfinder.CumulativeHours(path, _ => Terrain.Grass, hexesPerHour: 1.0, isRiver: IsRiver);

        Assert.Equal(0, hours[0]);
        Assert.Equal(1.0, hours[1], 6); // grass, no river
        Assert.Equal(1.0 + ((1.0 + 1.0 + HexPathfinder.RiverCrossingCost) / 2), hours[2], 6); // half grass, half the stream
    }

    [Fact]
    public void River_penalty_is_ignored_for_fleets()
    {
        // River tiles are land terrain and already impassable to a fleet
        // (Terrain.Grass has no entry in the sea cost table), so a fleet
        // sailing open sea is unaffected by isRiver regardless of what it
        // reports.
        var path = new List<HexCoord> { new(0, 0), new(1, 0), new(2, 0) };

        var withRiver = HexPathfinder.CumulativeHours(
            path, _ => Terrain.Sea, hexesPerHour: 1.0, isLandUnit: false, isRiver: _ => true);
        var withoutRiver = HexPathfinder.CumulativeHours(
            path, _ => Terrain.Sea, hexesPerHour: 1.0, isLandUnit: false, isRiver: null);

        Assert.Equal(withoutRiver, withRiver);
    }

    [Fact]
    public void Stopping_mid_river_and_resuming_bills_the_same_total_as_one_march()
    {
        // Guards the "additive-on-entry, not an edge crossing" property the
        // issue calls out: a one-hex-wide corridor A-B with a single river
        // tile M in the middle. Splitting the trip into two marches that
        // stop and restart exactly on the river tile — or waypointing
        // through it in one dispatch — must bill the same total hours as one
        // continuous march. If the penalty were instead charged per edge
        // (entry and exit), stopping on the river would halve it.
        HexCoord[] corridor = [new(0, 0), new(1, 0), new(2, 0), new(3, 0), new(4, 0)];
        var river = new HexCoord(2, 0);
        bool IsRiver(HexCoord c) => c == river;

        var oneMarch = HexPathfinder.CumulativeHours(corridor, AllGrass(), hexesPerHour: 1.0, isRiver: IsRiver);
        var totalOneMarch = oneMarch[^1];

        var leg1 = corridor[..3]; // A, .., M
        var leg2 = corridor[2..]; // M, .., B
        var hours1 = HexPathfinder.CumulativeHours(leg1, AllGrass(), hexesPerHour: 1.0, isRiver: IsRiver);
        var hours2 = HexPathfinder.CumulativeHours(leg2, AllGrass(), hexesPerHour: 1.0, isRiver: IsRiver);
        var totalTwoMarches = hours1[^1] + hours2[^1];

        Assert.Equal(totalOneMarch, totalTwoMarches, 6);

        // Same trip again, waypointed through the river tile within one
        // dispatch (dropping the joint hex, exactly as Army.PlanDispatch
        // does when chaining legs).
        List<HexCoord> waypointedPath = [.. leg1, .. leg2.Skip(1)];
        var waypointed = HexPathfinder.CumulativeHours(waypointedPath, AllGrass(), hexesPerHour: 1.0, isRiver: IsRiver);

        Assert.Equal(totalOneMarch, waypointed[^1], 6);
    }

    // --- Movement rules: wide rivers and mountains stop land armies, streams cost a flat 9 ---

    /// <summary>A wall of hexes across the whole padded search box, so no detour exists.</summary>
    private static HashSet<HexCoord> Wall(int q)
    {
        var wall = new HashSet<HexCoord>();
        for (var r = -15; r <= 15; r++)
        {
            wall.Add(new HexCoord(q, r));
        }

        return wall;
    }

    [Fact]
    public void A_wide_river_blocks_a_land_army()
    {
        var river = Wall(2);

        var path = HexPathfinder.FindPath(
            new HexCoord(0, 0), new HexCoord(4, 0), AllGrass(), isLandUnit: true,
            isRiver: river.Contains, isWideRiver: river.Contains);

        Assert.Null(path);
    }

    [Fact]
    public void A_wide_river_hex_is_routed_around_not_through()
    {
        var wide = new HashSet<HexCoord> { new(2, 0) };

        var path = HexPathfinder.FindPath(
            new HexCoord(0, 0), new HexCoord(4, 0), AllGrass(), isLandUnit: true,
            isRiver: wide.Contains, isWideRiver: wide.Contains)!;

        Assert.NotNull(path);
        Assert.DoesNotContain(path, wide.Contains);
        Assert.Equal(new HexCoord(4, 0), path[^1]);
    }

    [Fact]
    public void A_stream_is_crossed_at_a_flat_nine_when_there_is_no_detour()
    {
        var stream = Wall(2);

        var path = HexPathfinder.FindPath(
            new HexCoord(0, 0), new HexCoord(4, 0), AllGrass(), isLandUnit: true,
            isRiver: stream.Contains, isWideRiver: _ => false)!;

        Assert.NotNull(path);
        Assert.Contains(new HexCoord(2, 0), path);
        var hours = HexPathfinder.CumulativeHours(path, AllGrass(), hexesPerHour: 1.0, isRiver: stream.Contains, isWideRiver: _ => false);
        Assert.Equal(1.0 + 9.0 + 1.0 + 1.0, hours[^1], 6);
        // Half the stream is billed wading in, half wading out.
        Assert.Equal((1.0 + 1.0 + HexPathfinder.RiverCrossingCost) / 2, hours[2] - hours[1], 6);
        Assert.Equal((1.0 + HexPathfinder.RiverCrossingCost + 1.0) / 2, hours[3] - hours[2], 6);
    }

    [Fact]
    public void A_stream_on_a_mountain_is_walkable_at_a_flat_nine()
    {
        var mountainStream = new HexCoord(2, 0);
        Terrain TerrainAt(HexCoord c) => c == mountainStream ? Terrain.Mountain : Terrain.Grass;
        bool IsRiver(HexCoord c) => c == mountainStream;
        var path = new List<HexCoord> { new(1, 0), mountainStream, new(3, 0) };

        var hours = HexPathfinder.CumulativeHours(path, TerrainAt, hexesPerHour: 1.0, isRiver: IsRiver, isWideRiver: _ => false);

        // Flat 1.0 + RiverCrossingCost = 9, not the mountain's own cost plus 8.
        Assert.Equal(5.0, hours[1], 6);
        Assert.Equal(10.0, hours[2], 6);
    }

    [Fact]
    public void A_stream_on_a_mountain_wall_lets_the_pathfinder_through()
    {
        var wall = Wall(2);
        var stream = new HexCoord(2, 0);
        Terrain TerrainAt(HexCoord c) => wall.Contains(c) ? Terrain.Mountain : Terrain.Grass;

        var path = HexPathfinder.FindPath(
            new HexCoord(0, 0), new HexCoord(4, 0), TerrainAt, isLandUnit: true,
            isRiver: c => c == stream, isWideRiver: _ => false)!;

        Assert.NotNull(path);
        Assert.Contains(stream, path);
    }

    [Fact]
    public void Search_tells_a_cut_off_target_apart_from_a_search_that_ran_out_of_budget()
    {
        var near = new HexCoord(5, 0);
        var far = new HexCoord(250, 0);

        Terrain Ringed(HexCoord target, HexCoord c) => target.Neighbours().Contains(c) ? Terrain.Mountain : Terrain.Sea;

        // Close by, the whole reachable sea is explored: provably no route.
        var cutOff = HexPathfinder.Search(new HexCoord(0, 0), near, c => Ringed(near, c), isLandUnit: false);
        Assert.Null(cutOff.Path);
        Assert.False(cutOff.LimitReached);

        // Far out, the search stops at its node cap: unknown, reported as too long rather than as cut off.
        var tooFar = HexPathfinder.Search(new HexCoord(0, 0), far, c => Ringed(far, c), isLandUnit: false);
        Assert.Null(tooFar.Path);
        Assert.True(tooFar.LimitReached);

        Assert.Null(HexPathfinder.FindPath(new HexCoord(0, 0), far, c => Ringed(far, c), isLandUnit: false));
    }

    [Fact]
    public void Mountains_are_impassable_to_land_armies()
    {
        var wall = Wall(2);
        Terrain TerrainAt(HexCoord c) => wall.Contains(c) ? Terrain.Mountain : Terrain.Grass;

        Assert.Null(HexPathfinder.FindPath(new HexCoord(0, 0), new HexCoord(4, 0), TerrainAt, isLandUnit: true));
        // The destination itself being a mountain is refused too.
        Assert.Null(HexPathfinder.FindPath(new HexCoord(0, 0), new HexCoord(2, 0), TerrainAt, isLandUnit: true));
    }

    [Fact]
    public void A_target_inside_a_ring_of_mountains_has_no_route()
    {
        var target = new HexCoord(5, 0);
        var ring = target.Neighbours().ToHashSet();
        Terrain TerrainAt(HexCoord c) => ring.Contains(c) ? Terrain.Mountain : Terrain.Grass;

        Assert.Null(HexPathfinder.FindPath(new HexCoord(0, 0), target, TerrainAt, isLandUnit: true));
    }

    [Fact]
    public void The_blocked_hook_is_optional_and_makes_a_hex_impassable_when_given()
    {
        var wall = Wall(2);

        Assert.NotNull(HexPathfinder.FindPath(new HexCoord(0, 0), new HexCoord(4, 0), AllGrass(), isLandUnit: true));
        Assert.Null(HexPathfinder.FindPath(
            new HexCoord(0, 0), new HexCoord(4, 0), AllGrass(), isLandUnit: true, blocked: wall.Contains));
    }

    [Fact]
    public void The_movement_rules_do_not_touch_fleets()
    {
        // A fleet on open sea is not affected by the river lookups, whatever they report.
        var path = HexPathfinder.FindPath(
            new HexCoord(0, 0), new HexCoord(3, 0), _ => Terrain.Sea, isLandUnit: false,
            isRiver: _ => true, isWideRiver: _ => true, blocked: _ => true);

        Assert.NotNull(path);
        Assert.Equal(4, path!.Count);
    }

    // --- A step is billed half and half ------------------------------------

    private static Func<HexCoord, Terrain> Row(params Terrain[] terrains) =>
        c => c.R == 0 && c.Q >= 0 && c.Q < terrains.Length ? terrains[c.Q] : Terrain.Sea;

    private static List<HexCoord> Line(int count) => [.. Enumerable.Range(0, count).Select(q => new HexCoord(q, 0))];

    [Fact]
    public void A_step_costs_half_the_hex_left_and_half_the_hex_entered()
    {
        var terrain = Row(Terrain.Grass, Terrain.Forest, Terrain.Grass);
        var path = Line(3);

        var hours = HexPathfinder.CumulativeHours(path, terrain, hexesPerHour: 1.0);

        Assert.Equal((1.0 + 1.3) / 2, hours[1], 9);
        Assert.Equal((1.0 + 1.3) / 2 + ((1.3 + 1.0) / 2), hours[2], 9);
        // The same route walked back costs the same.
        var back = HexPathfinder.CumulativeHours([.. path.AsEnumerable().Reverse()], terrain, hexesPerHour: 1.0);
        Assert.Equal(hours[^1], back[^1], 9);
    }

    [Fact]
    public void FindPath_prices_steps_half_and_half_so_a_forest_detour_is_judged_by_both_halves()
    {
        // A grass corridor around a forest hex is only taken when it is cheaper by the half-and-half price: the direct line over
        // the forest costs 1.15 + 1.15 = 2.3, the detour over grass 3 steps of 1.0.
        var forest = new HexCoord(1, 0);
        Terrain TerrainAt(HexCoord c) => c == forest ? Terrain.Forest : Terrain.Grass;

        var path = HexPathfinder.FindPath(new HexCoord(0, 0), new HexCoord(2, 0), TerrainAt, isLandUnit: true)!;

        Assert.Equal([new HexCoord(0, 0), forest, new HexCoord(2, 0)], path);
        Assert.Equal(2.3, HexPathfinder.CumulativeHours(path, TerrainAt, hexesPerHour: 1.0)[^1], 9);
    }

    [Fact]
    public void An_army_standing_under_a_wall_built_on_its_hex_leaves_at_the_ground_price()
    {
        var wall = new HexCoord(0, 0);
        var terrain = Row(Terrain.Forest, Terrain.Grass, Terrain.Grass);

        var path = HexPathfinder.FindPath(wall, new HexCoord(2, 0), terrain, isLandUnit: true, blocked: c => c == wall);

        Assert.NotNull(path);
        var hours = HexPathfinder.CumulativeHours(path!, terrain, hexesPerHour: 1.0, blocked: c => c == wall);
        Assert.Equal((1.3 + 1.0) / 2, hours[1], 9);
        // Entering the same hex stays shut.
        Assert.Null(HexPathfinder.FindPath(new HexCoord(2, 0), wall, terrain, isLandUnit: true, blocked: c => c == wall));
    }

    [Fact]
    public void An_army_standing_on_a_wide_river_whose_bridge_is_gone_leaves_it_at_twelve()
    {
        var river = new HexCoord(0, 0);
        var terrain = Row(Terrain.Grass, Terrain.Grass, Terrain.Grass);

        var path = HexPathfinder.FindPath(river, new HexCoord(2, 0), terrain, isLandUnit: true, isRiver: c => c == river, isWideRiver: c => c == river);

        Assert.NotNull(path);
        Assert.Equal(1.0 + HexPathfinder.BurntBridgeLeaveCost, 12.0);
        var hours = HexPathfinder.CumulativeHours(path!, terrain, hexesPerHour: 1.0, isRiver: c => c == river, isWideRiver: c => c == river);
        Assert.Equal((12.0 + 1.0) / 2, hours[1], 9);
        // Entering it is still impossible without a bridge.
        Assert.Null(HexPathfinder.FindPath(new HexCoord(2, 0), river, terrain, isLandUnit: true, isRiver: c => c == river, isWideRiver: c => c == river));
    }

    [Fact]
    public void An_army_standing_on_a_wide_river_with_a_bridge_leaves_at_the_bridge_price()
    {
        var river = new HexCoord(0, 0);
        var terrain = Row(Terrain.Grass, Terrain.Grass);

        var hours = HexPathfinder.CumulativeHours(
            Line(2), terrain, hexesPerHour: 1.0, isRiver: c => c == river, isWideRiver: c => c == river,
            bridgeCost: c => c == river ? 1.0 + HexPathfinder.CausewayCrossingCost : null);

        Assert.Equal((6.0 + 1.0) / 2, hours[1], 9);
    }

    [Fact]
    public void An_army_on_a_plain_mountain_has_no_route_out()
    {
        var terrain = Row(Terrain.Mountain, Terrain.Grass, Terrain.Grass);

        // FindPath refuses a mountain origin (a land army's endpoints must be enterable terrain)...
        Assert.Null(HexPathfinder.FindPath(new HexCoord(0, 0), new HexCoord(2, 0), terrain, isLandUnit: true));
        // ...while a stored path leaving one is charged as impassable.
        Assert.True(double.IsPositiveInfinity(HexPathfinder.CumulativeHours(Line(2), terrain, hexesPerHour: 1.0)[1]));
    }

    [Fact]
    public void Leaving_a_hex_costs_what_entering_it_costs_wherever_entering_is_allowed()
    {
        // Streams, half-open ends, bridges, gates and every ground: the leave price equals the enter price for any hex that can be entered.
        var stream = new HexCoord(1, 0);
        var halfOpen = new HexCoord(2, 0);
        var gate = new HexCoord(3, 0);
        var terrain = Row(Terrain.Grass, Terrain.Mountain, Terrain.Forest, Terrain.Sand, Terrain.Bog);
        bool IsRiver(HexCoord c) => c == stream;

        foreach (var hex in Line(5))
        {
            var intoHex = HexPathfinder.CumulativeHours(
                [new HexCoord(0, 1), hex], c => c == new HexCoord(0, 1) ? Terrain.Grass : terrain(c), hexesPerHour: 1.0,
                isRiver: IsRiver, isWideRiver: _ => false, blocked: gate.Equals, friendlyGate: gate.Equals, halfOpen: halfOpen.Equals)[1];
            if (double.IsPositiveInfinity(intoHex))
            {
                continue;
            }

            var outOfHex = HexPathfinder.CumulativeHours(
                [hex, new HexCoord(0, 1)], c => c == new HexCoord(0, 1) ? Terrain.Grass : terrain(c), hexesPerHour: 1.0,
                isRiver: IsRiver, isWideRiver: _ => false, blocked: gate.Equals, friendlyGate: gate.Equals, halfOpen: halfOpen.Equals)[1];
            Assert.Equal(intoHex, outOfHex, 9);
        }
    }

    [Fact]
    public void EdgeHours_are_crossed_after_half_the_leave_price_of_the_hex_left()
    {
        var terrain = Row(Terrain.Grass, Terrain.Forest, Terrain.Bog);
        var path = Line(3);

        var edges = HexPathfinder.EdgeHours(path, terrain, hexesPerHour: 2.0);
        var hours = HexPathfinder.CumulativeHours(path, terrain, hexesPerHour: 2.0);

        Assert.Equal(3, edges.Count);
        Assert.Equal(0.0, edges[0]);
        Assert.Equal(1.0 / 2 / 2.0, edges[1], 9); // half of the grass origin at 2 hexes/hour
        Assert.Equal(hours[1] + (1.3 / 2 / 2.0), edges[2], 9); // half of the forest, after the centre of the forest
        for (var i = 1; i < path.Count; i++)
        {
            Assert.InRange(edges[i], hours[i - 1], hours[i]);
        }
    }

    [Fact]
    public void A_fleet_leaves_and_enters_a_land_endpoint_at_the_flat_fallback_so_its_hours_stay_plain()
    {
        // Harbour (land) -> three sea hexes -> shore target (land): every step costs 1.0.
        Terrain TerrainAt(HexCoord c) => c.Q is 0 or 4 ? Terrain.Grass : Terrain.Sea;
        var path = Line(5);

        var hours = HexPathfinder.CumulativeHours(path, TerrainAt, hexesPerHour: 1.0, isLandUnit: false);
        var found = HexPathfinder.FindPath(path[0], path[^1], TerrainAt, isLandUnit: false);

        Assert.Equal([0.0, 1.0, 2.0, 3.0, 4.0], hours);
        Assert.Equal(path, found);
        Assert.Equal([0.0, 0.5, 1.5, 2.5, 3.5], HexPathfinder.EdgeHours(path, TerrainAt, 1.0, isLandUnit: false));
    }

    [Fact]
    public void A_fleet_beaching_on_sand_pays_twice_a_sea_hex_for_that_endpoint_while_other_land_stays_at_one()
    {
        var path = Line(4);
        Terrain Sand(HexCoord c) => c.Q == 3 ? Terrain.Sand : Terrain.Sea;
        Terrain Grass(HexCoord c) => c.Q == 3 ? Terrain.Grass : Terrain.Sea;

        var sandHours = HexPathfinder.CumulativeHours(path, Sand, hexesPerHour: 1.0, isLandUnit: false);
        var grassHours = HexPathfinder.CumulativeHours(path, Grass, hexesPerHour: 1.0, isLandUnit: false);

        // the last step is half a sea hex plus half the beach
        Assert.Equal([0.0, 1.0, 2.0, 3.0], grassHours);
        Assert.Equal([0.0, 1.0, 2.0, 3.5], sandHours);
        Assert.Equal([0.0, 0.5, 1.5, 2.5], HexPathfinder.EdgeHours(path, Sand, 1.0, isLandUnit: false));
        Assert.Equal(HexPathfinder.FleetSandCost, 2.0);
        Assert.Equal(path, HexPathfinder.FindPath(path[0], path[^1], Sand, isLandUnit: false));
    }

    [Fact]
    public void A_fleet_pushing_off_a_sand_harbour_pays_the_sand_price_for_that_endpoint_too()
    {
        Terrain Harbour(HexCoord c) => c.Q == 0 ? Terrain.Sand : Terrain.Sea;
        var path = Line(3);

        var hours = HexPathfinder.CumulativeHours(path, Harbour, hexesPerHour: 1.0, isLandUnit: false);

        Assert.Equal([0.0, 1.5, 2.5], hours);
        Assert.Equal([0.0, 1.0, 2.0], HexPathfinder.EdgeHours(path, Harbour, 1.0, isLandUnit: false));
    }

    [Fact]
    public void Open_sea_route_follows_the_straight_line_between_the_endpoints()
    {
        var from = new HexCoord(0, 0);
        var to = new HexCoord(30, -12);

        var path = HexPathfinder.FindPath(from, to, _ => Terrain.Sea, isLandUnit: false);

        Assert.NotNull(path);
        Assert.Equal(from, path![0]);
        Assert.Equal(to, path[^1]);
        Assert.Equal(from.DistanceTo(to) + 1, path.Count);
        var line = StraightLine(from, to);
        foreach (var hex in path)
        {
            Assert.True(line.Min(l => l.DistanceTo(hex)) <= 1, $"{hex} is more than one hex off the straight line");
        }
    }

    [Fact]
    public void Finds_a_route_into_a_cove_that_opens_away_from_the_start_within_the_expansion_cap()
    {
        // A 250-hex run to a goal inside a mountain cove (radius 40, 2 thick) whose opening faces
        // away from the start, so the search aimed at the goal runs into the cove's near wall.
        // Expanding every equal-f hex side by side blew through the 20,000-node cap and found no
        // route; breaking ties toward the goal and the straight line finds the way round.
        var from = new HexCoord(0, 0);
        var goal = new HexCoord(250, -250);
        const int radius = 40;
        Terrain TerrainAt(HexCoord c)
        {
            var d = c.DistanceTo(goal);
            var inRing = d == radius || d == radius + 1;
            return inRing && c.Q <= goal.Q + 1 ? Terrain.Mountain : Terrain.Sea;
        }

        var search = HexPathfinder.Search(from, goal, TerrainAt, isLandUnit: false);

        Assert.False(search.LimitReached);
        Assert.NotNull(search.Path);
        Assert.Equal(goal, search.Path![^1]);
        Assert.Equal(ShortestHexCount(from, goal, TerrainAt), search.Path.Count);
    }

    [Fact]
    public void Finds_a_long_sea_route_that_detours_around_a_land_barrier()
    {
        // The shape of a real fleet dispatch: 300 hexes straight, but a land barrier across the way
        // (row r = -150 up to q = 150) forces a ~450-hex detour. A* has to expand everything cheaper than
        // that route, which is far more than the old 20,000-node cap allowed.
        var from = new HexCoord(0, 0);
        var to = new HexCoord(0, -300);
        Terrain TerrainAt(HexCoord c) => c.R == -150 && c.Q <= 150 ? Terrain.Mountain : Terrain.Sea;

        var search = HexPathfinder.Search(from, to, TerrainAt, isLandUnit: false);

        Assert.False(search.LimitReached);
        Assert.NotNull(search.Path);
        Assert.Equal(to, search.Path![^1]);
        // The route crosses the barrier row at its open end (151, -150).
        var gap = new HexCoord(151, -150);
        Assert.Equal(from.DistanceTo(gap) + gap.DistanceTo(to) + 1, search.Path.Count);
        Assert.True(search.Path.Count > from.DistanceTo(to) * 1.4);
    }

    /// <summary>Breadth-first hex count of the shortest route over sea (uniform cost), inside the search's own bounding box.</summary>
    private static int ShortestHexCount(HexCoord from, HexCoord to, Func<HexCoord, Terrain> terrainAt)
    {
        var padding = Math.Max(10, from.DistanceTo(to));
        var dist = new Dictionary<HexCoord, int> { [from] = 1 };
        var queue = new Queue<HexCoord>([from]);
        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (current == to)
            {
                return dist[current];
            }

            foreach (var n in current.Neighbours())
            {
                var inBox = n.Q >= Math.Min(from.Q, to.Q) - padding && n.Q <= Math.Max(from.Q, to.Q) + padding
                    && n.R >= Math.Min(from.R, to.R) - padding && n.R <= Math.Max(from.R, to.R) + padding;
                if (inBox && terrainAt(n) == Terrain.Sea && dist.TryAdd(n, dist[current] + 1))
                {
                    queue.Enqueue(n);
                }
            }
        }

        return -1;
    }

    /// <summary>The standard hex line (cube lerp and round) from <paramref name="a"/> to <paramref name="b"/>.</summary>
    private static List<HexCoord> StraightLine(HexCoord a, HexCoord b)
    {
        var n = a.DistanceTo(b);
        var line = new List<HexCoord>();
        for (var i = 0; i <= n; i++)
        {
            var t = (double)i / n;
            double x = a.Q + ((b.Q - a.Q) * t), z = a.R + ((b.R - a.R) * t), y = -x - z;
            double rx = Math.Round(x), ry = Math.Round(y), rz = Math.Round(z);
            double dx = Math.Abs(rx - x), dy = Math.Abs(ry - y), dz = Math.Abs(rz - z);
            if (dx > dy && dx > dz) rx = -ry - rz;
            else if (dy > dz) ry = -rx - rz;
            else rz = -rx - ry;
            line.Add(new HexCoord((int)rx, (int)rz));
        }

        return line;
    }
}
