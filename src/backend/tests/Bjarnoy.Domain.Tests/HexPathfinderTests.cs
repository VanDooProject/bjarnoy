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
    public void Returns_a_single_hex_path_when_from_and_to_are_the_same()
    {
        var coord = new HexCoord(2, 2);

        var path = HexPathfinder.FindPath(coord, coord, AllGrass(), isLandUnit: true);

        Assert.Equal([coord], path);
    }

    [Fact]
    public void Prefers_cheaper_terrain_over_a_shorter_raw_distance()
    {
        // A straight line from (0,0) to (4,0) crosses mountain (cost 2.0);
        // a one-hex detour through grass (cost 1.0) is cheaper overall
        // (5 x 1.0 = 5.0) than the "shorter" direct route (4 x 2.0 = 8.0
        // for the mountain hexes plus whatever grass borders them), even
        // though it visits one more hex.
        var mountainLine = new HashSet<HexCoord>
        {
            new(1, 0), new(2, 0), new(3, 0),
        };

        Terrain TerrainAt(HexCoord c) => mountainLine.Contains(c) ? Terrain.Mountain : Terrain.Grass;

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
        Terrain TerrainAt(HexCoord c) => c == new HexCoord(2, 0) ? Terrain.Mountain : Terrain.Grass;

        var hours = HexPathfinder.CumulativeHours(path, TerrainAt, hexesPerHour: 2.0);

        Assert.Equal(0, hours[0]);
        Assert.Equal(0.5, hours[1], 6); // grass: 1.0 / 2.0
        Assert.Equal(0.5 + 1.0, hours[2], 6); // + mountain: 2.0 / 2.0
    }

    [Fact]
    public void Cumulative_hours_scale_down_with_the_world_speed_factor()
    {
        var path = new List<HexCoord> { new(0, 0), new(1, 0), new(2, 0) };
        Terrain TerrainAt(HexCoord c) => c == new HexCoord(2, 0) ? Terrain.Mountain : Terrain.Grass;

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
    public void Cumulative_hours_bill_the_river_crossing_penalty_on_entry()
    {
        var path = new List<HexCoord> { new(0, 0), new(1, 0), new(2, 0) };
        bool IsRiver(HexCoord c) => c == new HexCoord(2, 0);

        var hours = HexPathfinder.CumulativeHours(path, _ => Terrain.Grass, hexesPerHour: 1.0, isRiver: IsRiver);

        Assert.Equal(0, hours[0]);
        Assert.Equal(1.0, hours[1], 6); // grass, no river
        Assert.Equal(1.0 + 1.0 + HexPathfinder.RiverCrossingCost, hours[2], 6); // grass + river penalty
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
}
