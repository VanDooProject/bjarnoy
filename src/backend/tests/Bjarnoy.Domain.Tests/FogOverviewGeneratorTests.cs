using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class FogOverviewGeneratorTests
{
    private static readonly IReadOnlyDictionary<FogChunkCoord, ExploredChunkData> NoHistory =
        new Dictionary<FogChunkCoord, ExploredChunkData>();

    private static FogMaskCell CellAt(FogOverview overview, int u, int v)
    {
        var col = (u - overview.Bounds.MinU) / overview.Factor;
        var row = (v - overview.Bounds.MinV) / overview.Factor;
        return overview.Grid[new MaskTexel(col, row)];
    }

    [Fact]
    public void A_small_world_is_not_coarsened_and_a_huge_one_fits_the_side_limit()
    {
        Assert.Equal(1, FogOverviewGenerator.FactorFor(20));
        Assert.Equal(16, FogOverviewGenerator.FactorFor(4000));

        foreach (var radius in new[] { 0, 100, 511, 512, 1500, 4000, 10000 })
        {
            var factor = FogOverviewGenerator.FactorFor(radius);
            var bounds = FogOverviewGenerator.OverviewBounds(radius, factor);
            Assert.True(bounds.Width / factor <= FogOverviewGenerator.MaxSide, $"width at radius {radius}");
            Assert.True(bounds.Height / factor <= FogOverviewGenerator.MaxSide, $"height at radius {radius}");
            Assert.Equal(0, FogChunkLayout.ChunkSize % factor);
        }
    }

    [Fact]
    public void Overview_bounds_are_floored_and_ceiled_to_the_factor_and_cover_the_world()
    {
        foreach (var factor in new[] { 1, 2, 16, 64 })
        {
            var world = FogMaskLayout.WorldBounds(100);
            var bounds = FogOverviewGenerator.OverviewBounds(100, factor);

            Assert.True(bounds.MinU < 0 && bounds.MinV < 0);
            Assert.Equal(0, bounds.MinU % factor);
            Assert.Equal(0, bounds.MinV % factor);
            Assert.Equal(0, bounds.MaxU % factor);
            Assert.Equal(0, bounds.MaxV % factor);
            Assert.True(bounds.MinU <= world.MinU && world.MinU - bounds.MinU < factor);
            Assert.True(bounds.MinV <= world.MinV && world.MinV - bounds.MinV < factor);
            Assert.True(bounds.MaxU >= world.MaxU && bounds.MaxU - world.MaxU < factor);
            Assert.True(bounds.MaxV >= world.MaxV && bounds.MaxV - world.MaxV < factor);
        }
    }

    [Fact]
    public void Nothing_explored_and_no_source_is_unknown_and_out_of_sight_everywhere()
    {
        var overview = FogOverviewGenerator.Generate(4000, NoHistory, []);

        Assert.Equal(16, overview.Factor);
        Assert.Equal(overview.Bounds.Width / 16, overview.Grid.Bounds.Width);
        Assert.Equal(overview.Bounds.Height / 16, overview.Grid.Bounds.Height);
        Assert.All(overview.Grid.Cells, c => Assert.Equal(new FogMaskCell(255, 255, 0), c));
    }

    [Fact]
    public void A_fully_explored_chunk_reads_explored_on_its_blocks_only()
    {
        var chunk = new FogChunkCoord(0, 0);
        var history = new Dictionary<FogChunkCoord, ExploredChunkData> { [chunk] = ExploredChunkData.Full };

        var overview = FogOverviewGenerator.Generate(4000, history, []);

        Assert.Equal(0, CellAt(overview, 0, 0).Unknown);
        Assert.Equal(0, CellAt(overview, 63, 63).Unknown);
        Assert.Equal(255, CellAt(overview, 64, 0).Unknown);
        Assert.Equal(255, CellAt(overview, -1, 0).Unknown);
        Assert.Equal(255, CellAt(overview, 0, 64).Unknown);
        Assert.Equal(4 * 4, overview.Grid.Cells.Count(c => c.Unknown == 0));
        Assert.All(overview.Grid.Cells, c => Assert.Equal(255, c.OutOfSight));
    }

    [Fact]
    public void A_partly_explored_chunk_reads_the_explored_share_of_each_block()
    {
        // At factor 16 a block has 128 hexes. Explore 32 of them in the block at texels (0..15, 0..15)
        // (rows 0-3, whole rows of hexes: 8 per row) and nothing in the next block over.
        var chunk = new FogChunkCoord(0, 0);
        var hexes = new List<HexCoord>();
        for (var v = 0; v < 4; v++)
        {
            for (var u = 0; u < 16; u++)
            {
                if (FogMaskLayout.IsHexTexel(new MaskTexel(u, v)))
                {
                    hexes.Add(FogMaskLayout.ToHex(new MaskTexel(u, v)));
                }
            }
        }

        Assert.Equal(32, hexes.Count);
        var history = new Dictionary<FogChunkCoord, ExploredChunkData> { [chunk] = PersistedExploredBitset.Encode(chunk, hexes) };

        var overview = FogOverviewGenerator.Generate(4000, history, []);

        Assert.Equal(16, overview.Factor);
        Assert.Equal(255 - (int)Math.Round(255 * 32 / 128.0, MidpointRounding.AwayFromZero), CellAt(overview, 0, 0).Unknown);
        Assert.Equal(255, CellAt(overview, 16, 0).Unknown);
        Assert.Equal(255, CellAt(overview, 0, 16).Unknown);
    }

    [Fact]
    public void A_source_dims_only_the_blocks_around_it()
    {
        var source = new FogVisionSource(new HexCoord(0, 0), ExploredRadius: 10, VisibleRadius: 20);

        var overview = FogOverviewGenerator.Generate(4000, NoHistory, [source]);

        var centre = FogMaskLayout.ToTexel(source.Coord);
        Assert.True(CellAt(overview, centre.U, centre.V).OutOfSight < 255);
        Assert.Equal(255, CellAt(overview, 400, 800).OutOfSight);
        Assert.Equal(255, CellAt(overview, -400, -800).OutOfSight);
        Assert.Equal(255, CellAt(overview, 0, 0).Unknown);
        // The disc spans u +-20 and v +-40 texels: at most 4 x 6 blocks of 16.
        Assert.True(overview.Grid.Cells.Count(c => c.OutOfSight < 255) <= 4 * 6);
    }

    [Fact]
    public void A_block_wholly_inside_a_visible_disc_reads_fully_visible()
    {
        // Radius 40 covers well over one 16 x 16-texel block around the origin.
        var source = new FogVisionSource(new HexCoord(0, 0), ExploredRadius: 40, VisibleRadius: 40);

        var overview = FogOverviewGenerator.Generate(4000, NoHistory, [source]);

        Assert.Equal(0, CellAt(overview, 16, 16).OutOfSight);
    }

    [Fact]
    public void Overlapping_sources_are_not_counted_twice()
    {
        var one = new FogVisionSource(new HexCoord(0, 0), 10, 10);
        var twin = one with { };
        var nearby = new FogVisionSource(new HexCoord(1, 0), 10, 10);

        var alone = FogOverviewGenerator.Generate(4000, NoHistory, [one]);
        var doubled = FogOverviewGenerator.Generate(4000, NoHistory, [one, twin]);
        var overlapped = FogOverviewGenerator.Generate(4000, NoHistory, [one, nearby]);

        Assert.Equal(alone.Grid.Cells, doubled.Grid.Cells);
        var aloneVisible = alone.Grid.Cells.Sum(c => 255 - c.OutOfSight);
        var overlappedVisible = overlapped.Grid.Cells.Sum(c => 255 - c.OutOfSight);
        Assert.True(overlappedVisible >= aloneVisible);
        Assert.True(overlappedVisible < 2 * aloneVisible);
    }
}
