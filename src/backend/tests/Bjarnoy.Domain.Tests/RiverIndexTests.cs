using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The river lookups a land army's pathfinding uses (<see cref="RiverIndex"/>, over
/// <c>RiverGenerator.IsWideRiver</c>), on hand-built tiles.
/// </summary>
public class RiverIndexTests
{
    // Tiles run west to east along r = 0; the flow is E (index 0), so an upstream neighbour sits to the W.
    private static RiverTile Tile(int q, RiverTileShape shape, RiverWidth width, TileOrientation[] ins, TileOrientation? @out) =>
        new(new HexCoord(q, 0), shape, ins, @out, width);

    [Fact]
    public void A_river_width_run_is_wide()
    {
        var up = Tile(0, RiverTileShape.Straight, RiverWidth.River, [TileOrientation.W], TileOrientation.E);
        var tile = Tile(1, RiverTileShape.Straight, RiverWidth.River, [TileOrientation.W], TileOrientation.E);

        Assert.True(new RiverIndex([up, tile]).IsWide(tile.Coord));
    }

    [Fact]
    public void A_stream_run_is_not_wide_but_is_a_river()
    {
        var up = Tile(0, RiverTileShape.Straight, RiverWidth.Stream, [TileOrientation.W], TileOrientation.E);
        var tile = Tile(1, RiverTileShape.Straight, RiverWidth.Stream, [TileOrientation.W], TileOrientation.E);
        var index = new RiverIndex([up, tile]);

        Assert.True(index.IsRiver(tile.Coord));
        Assert.False(index.IsWide(tile.Coord));
    }

    [Fact]
    public void A_widen_tile_is_a_stream_in_and_a_river_out_so_it_stays_crossable()
    {
        var up = Tile(0, RiverTileShape.Straight, RiverWidth.Stream, [TileOrientation.W], TileOrientation.E);
        var tile = Tile(1, RiverTileShape.Straight, RiverWidth.Widen, [TileOrientation.W], TileOrientation.E);

        Assert.False(new RiverIndex([up, tile]).IsWide(tile.Coord));
    }

    [Fact]
    public void A_stream_joining_a_river_is_wide_but_two_streams_joining_are_not()
    {
        // The wide-Y geometry for an eastward flow: inflows from the NW and SW neighbours.
        var at = new HexCoord(1, 0);
        var nw = at.Neighbours()[(int)TileOrientation.NW];
        var sw = at.Neighbours()[(int)TileOrientation.SW];

        static RiverTile Feeder(HexCoord from, RiverWidth width, TileOrientation towards) =>
            new(from, RiverTileShape.Straight, [], towards, width);

        var streamFeeder = Feeder(sw, RiverWidth.Stream, TileOrientation.NE);
        var riverStreamY = new RiverTile(at, RiverTileShape.Confluence, [TileOrientation.NW, TileOrientation.SW], TileOrientation.E, RiverWidth.RiverStream);
        Assert.True(new RiverIndex([Feeder(nw, RiverWidth.River, TileOrientation.SE), streamFeeder, riverStreamY]).IsWide(at));

        // Two stream inflows and a river outflow: one river arm only, so it is still crossable.
        var streamY = new RiverTile(at, RiverTileShape.Confluence, [TileOrientation.NW, TileOrientation.SW], TileOrientation.E, RiverWidth.Widen);
        Assert.False(new RiverIndex([Feeder(nw, RiverWidth.Stream, TileOrientation.SE), streamFeeder, streamY]).IsWide(at));
    }

    [Fact]
    public void A_hex_without_a_river_is_neither_a_river_nor_wide()
    {
        var index = new RiverIndex([Tile(1, RiverTileShape.Spring, RiverWidth.Stream, [], TileOrientation.E)]);

        Assert.False(index.IsRiver(new HexCoord(9, 9)));
        Assert.False(index.IsWide(new HexCoord(9, 9)));
    }
}
