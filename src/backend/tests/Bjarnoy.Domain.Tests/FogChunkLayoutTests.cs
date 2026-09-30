using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class FogChunkLayoutTests
{
    [Theory]
    [InlineData(0, 0)]
    [InlineData(63, 0)]
    [InlineData(64, 1)]
    [InlineData(-1, -1)]
    [InlineData(-64, -1)]
    [InlineData(-65, -2)]
    public void Chunks_use_floor_division_so_negative_texels_tile_without_a_double_wide_chunk_at_zero(int texel, int chunk)
    {
        Assert.Equal(new FogChunkCoord(chunk, chunk), FogChunkLayout.ChunkOf(new MaskTexel(texel, texel)));
    }

    [Fact]
    public void Bounds_of_a_chunk_contain_exactly_the_texels_that_map_back_to_it()
    {
        foreach (var chunk in new[] { new FogChunkCoord(0, 0), new FogChunkCoord(-1, 2), new FogChunkCoord(3, -4) })
        {
            var bounds = FogChunkLayout.Bounds(chunk);
            Assert.Equal(FogChunkLayout.ChunkSize, bounds.Width);
            Assert.Equal(FogChunkLayout.ChunkSize, bounds.Height);

            for (var v = bounds.MinV - 1; v <= bounds.MaxV; v++)
            {
                for (var u = bounds.MinU - 1; u <= bounds.MaxU; u++)
                {
                    var texel = new MaskTexel(u, v);
                    Assert.Equal(bounds.Contains(texel), FogChunkLayout.ChunkOf(texel) == chunk);
                }
            }
        }
    }

    [Fact]
    public void Local_index_is_a_bijection_over_a_chunk_and_hex_parity_matches_local_parity()
    {
        var chunk = new FogChunkCoord(-1, -3);
        var bounds = FogChunkLayout.Bounds(chunk);
        var seen = new HashSet<int>();
        var hexTexels = 0;

        for (var v = bounds.MinV; v < bounds.MaxV; v++)
        {
            for (var u = bounds.MinU; u < bounds.MaxU; u++)
            {
                var texel = new MaskTexel(u, v);
                var index = FogChunkLayout.LocalIndex(texel);
                Assert.InRange(index, 0, FogChunkLayout.TexelsPerChunk - 1);
                Assert.True(seen.Add(index));

                var localParityEven = (((index % FogChunkLayout.ChunkSize) + (index / FogChunkLayout.ChunkSize)) & 1) == 0;
                Assert.Equal(FogMaskLayout.IsHexTexel(texel), localParityEven);
                if (FogMaskLayout.IsHexTexel(texel))
                {
                    hexTexels++;
                }
            }
        }

        Assert.Equal(FogChunkLayout.HexTexelsPerChunk, hexTexels);
    }

    [Fact]
    public void World_chunk_range_covers_every_hex_of_the_world()
    {
        const int radius = 100;
        var (min, max) = FogChunkLayout.WorldChunkRange(radius);

        foreach (var hex in HexCoord.Origin.WithinRadius(radius))
        {
            var chunk = FogChunkLayout.ChunkOf(hex);
            Assert.InRange(chunk.U, min.U, max.U);
            Assert.InRange(chunk.V, min.V, max.V);
        }
    }

    [Fact]
    public void A_radius_4000_world_is_a_few_thousand_chunks_not_a_multi_megabyte_bitset()
    {
        var (min, max) = FogChunkLayout.WorldChunkRange(4000);

        var chunks = (long)(max.U - min.U + 1) * (max.V - min.V + 1);

        // 126 x 252 — and a player only ever has rows for the ones they touched.
        Assert.Equal(126L * 252, chunks);
    }
}
