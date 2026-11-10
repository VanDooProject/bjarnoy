using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Movement;

public class MovementPositionTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private static Func<HexCoord, Terrain> Row(params Terrain[] terrains) =>
        c => c.R == 0 && c.Q >= 0 && c.Q < terrains.Length ? terrains[c.Q] : Terrain.Sea;

    private static Bjarnoy.Domain.Movement.Movement Build(Func<HexCoord, Terrain> terrain, int count)
    {
        List<HexCoord> path = [.. Enumerable.Range(0, count).Select(q => new HexCoord(q, 0))];
        List<HexCoord> back = [.. path.AsEnumerable().Reverse()];
        return Bjarnoy.Domain.Movement.Movement.Create(
            T0,
            path,
            HexPathfinder.CumulativeHours(path, terrain, 1.0),
            HexPathfinder.EdgeHours(path, terrain, 1.0),
            back,
            HexPathfinder.CumulativeHours(back, terrain, 1.0),
            HexPathfinder.EdgeHours(back, terrain, 1.0),
            provisionsAtDeparture: 1000,
            upkeepPerHour: 1);
    }

    [Fact]
    public void PositionAt_switches_hex_at_the_shared_edge_not_at_the_centre()
    {
        // grass -> bog: cumulative [0, 1.5], edge into the bog after half of the grass hex's 1.0 = 0.5.
        var movement = Build(Row(Terrain.Grass, Terrain.Bog), 2);
        Assert.Equal(0.5, movement.EdgeHours[1], 9);
        Assert.Equal(1.5, movement.CumulativeHours[1], 9);

        Assert.Equal(new HexCoord(0, 0), movement.PositionAt(T0.AddHours(0.49)));
        Assert.Equal(new HexCoord(1, 0), movement.PositionAt(T0.AddHours(0.5)));
        Assert.Equal(new HexCoord(1, 0), movement.PositionAt(T0.AddHours(1.0)));
    }

    [Fact]
    public void Arrival_stays_on_the_last_centre()
    {
        var movement = Build(Row(Terrain.Grass, Terrain.Bog), 2);

        Assert.Equal(T0.AddHours(1.5), movement.ArrivesAt);
        Assert.Equal(new HexCoord(1, 0), movement.PositionAt(movement.ArrivesAt));
    }

    [Fact]
    public void The_return_leg_carries_its_own_edge_schedule()
    {
        var movement = Build(Row(Terrain.Grass, Terrain.Bog), 2);

        // Home from the bog: half of the bog's 2.0 is spent before the edge into the grass.
        Assert.Equal(1.0, movement.ReturnEdgeHours[1], 9);
        Assert.Equal(1.5, movement.ReturnCumulativeHours[1], 9);
    }
}
