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
    public void Throws_for_sea_units_rather_than_silently_pathing_like_a_land_unit()
    {
        Assert.Throws<NotSupportedException>(
            () => HexPathfinder.FindPath(HexCoord.Origin, new HexCoord(1, 0), AllGrass(), isLandUnit: false));
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
}
