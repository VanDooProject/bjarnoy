using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Coastal-hex predicate tests (issue #40 phase 6 §3).</summary>
public class ShorelineTests
{
    [Fact]
    public void A_land_hex_next_to_sea_is_a_shoreline()
    {
        var coastHex = new HexCoord(0, 0);
        var seaNeighbour = coastHex.Neighbours()[0];

        Terrain TerrainAt(HexCoord c) => c == seaNeighbour ? Terrain.Sea : Terrain.Grass;

        Assert.True(Shoreline.IsShoreline(coastHex, TerrainAt));
    }

    [Fact]
    public void A_land_hex_fully_surrounded_by_land_is_not_a_shoreline()
    {
        Assert.False(Shoreline.IsShoreline(HexCoord.Origin, _ => Terrain.Grass));
    }

    [Fact]
    public void A_sea_hex_itself_is_never_a_shoreline_even_next_to_land()
    {
        var seaHex = new HexCoord(0, 0);
        var landNeighbour = seaHex.Neighbours()[0];

        Terrain TerrainAt(HexCoord c) => c == landNeighbour ? Terrain.Grass : Terrain.Sea;

        Assert.False(Shoreline.IsShoreline(seaHex, TerrainAt));
    }
}
