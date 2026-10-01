using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>The wide-river rule a land army's pathfinding uses (<see cref="RiverArms"/>), on hand-built tiles.</summary>
public class RiverArmsTests
{
    // Tiles run west to east along r = 0; the flow is E (index 0), so an upstream neighbour sits to the W.
    private static RiverTile Tile(int q, RiverTileShape shape, RiverWidth width, TileOrientation[] ins, TileOrientation? @out) =>
        new(new HexCoord(q, 0), shape, ins, @out, width);

    private static Func<HexCoord, RiverTile?> Lookup(params RiverTile[] tiles)
    {
        var map = tiles.ToDictionary(t => t.Coord);
        return c => map.TryGetValue(c, out var t) ? t : null;
    }

    [Fact]
    public void A_river_width_run_is_wide()
    {
        var up = Tile(0, RiverTileShape.Straight, RiverWidth.River, [TileOrientation.W], TileOrientation.E);
        var tile = Tile(1, RiverTileShape.Straight, RiverWidth.River, [TileOrientation.W], TileOrientation.E);

        Assert.True(RiverArms.IsWide(tile, Lookup(up, tile)));
    }

    [Fact]
    public void A_stream_run_is_not_wide()
    {
        var up = Tile(0, RiverTileShape.Straight, RiverWidth.Stream, [TileOrientation.W], TileOrientation.E);
        var tile = Tile(1, RiverTileShape.Straight, RiverWidth.Stream, [TileOrientation.W], TileOrientation.E);

        Assert.False(RiverArms.IsWide(tile, Lookup(up, tile)));
    }

    [Fact]
    public void A_widen_tile_is_a_stream_in_and_a_river_out_so_it_stays_crossable()
    {
        var up = Tile(0, RiverTileShape.Straight, RiverWidth.Stream, [TileOrientation.W], TileOrientation.E);
        var tile = Tile(1, RiverTileShape.Straight, RiverWidth.Widen, [TileOrientation.W], TileOrientation.E);

        Assert.Equal((1, 1), RiverArms.Count(tile, Lookup(up, tile)));
        Assert.False(RiverArms.IsWide(tile, Lookup(up, tile)));
    }

    [Fact]
    public void A_stream_joining_a_river_is_wide_but_two_streams_joining_are_not()
    {
        // Confluence at (1,0): inflows from the W (river or stream) and from the NW neighbour (1, -1)... use the E-flowing wide-Y
        // geometry out + 2 / out + 4: inflows NW (2) and SW (4).
        var nw = new HexCoord(1, 0).Neighbours()[(int)TileOrientation.NW];
        var sw = new HexCoord(1, 0).Neighbours()[(int)TileOrientation.SW];

        RiverTile Feeder(HexCoord at, RiverWidth width, TileOrientation towards) =>
            new(at, RiverTileShape.Straight, [], towards, width);

        var riverFeeder = Feeder(nw, RiverWidth.River, TileOrientation.SE);
        var streamFeeder = Feeder(sw, RiverWidth.Stream, TileOrientation.NE);
        var riverStreamY = new RiverTile(
            new HexCoord(1, 0), RiverTileShape.Confluence, [TileOrientation.NW, TileOrientation.SW], TileOrientation.E, RiverWidth.RiverStream);
        Assert.True(RiverArms.IsWide(riverStreamY, Lookup(riverFeeder, streamFeeder, riverStreamY)));

        var otherStream = Feeder(nw, RiverWidth.Stream, TileOrientation.SE);
        var streamY = new RiverTile(
            new HexCoord(1, 0), RiverTileShape.Confluence, [TileOrientation.NW, TileOrientation.SW], TileOrientation.E, RiverWidth.Widen);
        // Two stream inflows and a river outflow: one river arm only, so it is still crossable.
        Assert.False(RiverArms.IsWide(streamY, Lookup(otherStream, streamFeeder, streamY)));
    }

    [Fact]
    public void A_river_index_answers_both_lookups_and_ignores_hexes_without_a_river()
    {
        var up = Tile(0, RiverTileShape.Spring, RiverWidth.Stream, [], TileOrientation.E);
        var tile = Tile(1, RiverTileShape.Straight, RiverWidth.Stream, [TileOrientation.W], TileOrientation.E);
        var index = new RiverIndex([up, tile]);

        Assert.True(index.IsRiver(new HexCoord(1, 0)));
        Assert.False(index.IsWide(new HexCoord(1, 0)));
        Assert.False(index.IsRiver(new HexCoord(9, 9)));
        Assert.False(index.IsWide(new HexCoord(9, 9)));
    }
}
