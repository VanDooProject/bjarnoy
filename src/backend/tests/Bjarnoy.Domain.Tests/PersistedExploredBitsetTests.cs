using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class PersistedExploredBitsetTests
{
    private static readonly FogChunkCoord Chunk = new(0, 0);

    /// <summary>Every hex whose texel lies in <paramref name="chunk"/>.</summary>
    private static List<HexCoord> HexesOfChunk(FogChunkCoord chunk)
    {
        var bounds = FogChunkLayout.Bounds(chunk);
        var hexes = new List<HexCoord>();
        for (var v = bounds.MinV; v < bounds.MaxV; v++)
        {
            for (var u = bounds.MinU; u < bounds.MaxU; u++)
            {
                var texel = new MaskTexel(u, v);
                if (FogMaskLayout.IsHexTexel(texel))
                {
                    hexes.Add(FogMaskLayout.ToHex(texel));
                }
            }
        }

        return hexes;
    }

    [Fact]
    public void A_chunk_bitset_is_a_fixed_512_bytes()
    {
        Assert.Equal(512, PersistedExploredBitset.ByteCount);
    }

    [Fact]
    public void Encode_and_decode_round_trip_a_partial_chunk()
    {
        var hexes = HexesOfChunk(Chunk).Take(300).ToHashSet();

        var data = PersistedExploredBitset.Encode(Chunk, hexes);

        Assert.False(data.IsFull);
        Assert.Equal(PersistedExploredBitset.ByteCount, data.Bits!.Length);
        Assert.Equal(hexes, PersistedExploredBitset.Decode(Chunk, data));
        Assert.Equal(300, PersistedExploredBitset.Count(data));
    }

    [Fact]
    public void Decode_of_an_untouched_chunk_is_the_empty_set()
    {
        Assert.Empty(PersistedExploredBitset.Decode(Chunk, ExploredChunkData.None));
        Assert.True(ExploredChunkData.None.IsEmpty);
    }

    [Fact]
    public void Merge_ors_new_hexes_in_without_clearing_existing_ones_and_reports_growth()
    {
        var existing = PersistedExploredBitset.Encode(Chunk, [HexCoord.Origin]);

        var merged = PersistedExploredBitset.Merge(Chunk, existing, [new HexCoord(2, 0)], out var grew);

        Assert.True(grew);
        Assert.Equal(
            new HashSet<HexCoord> { HexCoord.Origin, new(2, 0) },
            PersistedExploredBitset.Decode(Chunk, merged));
    }

    [Fact]
    public void Merge_does_not_mutate_the_input_bits()
    {
        var existing = PersistedExploredBitset.Encode(Chunk, [HexCoord.Origin]);
        var before = (byte[])existing.Bits!.Clone();

        PersistedExploredBitset.Merge(Chunk, existing, [new HexCoord(2, 0)], out _);

        Assert.Equal(before, existing.Bits);
    }

    [Fact]
    public void Merge_of_hexes_already_explored_reports_no_growth_and_returns_the_same_data()
    {
        var existing = PersistedExploredBitset.Encode(Chunk, [HexCoord.Origin, new HexCoord(1, 0)]);

        var merged = PersistedExploredBitset.Merge(Chunk, existing, [HexCoord.Origin], out var grew);

        Assert.False(grew);
        Assert.Same(existing.Bits, merged.Bits);
    }

    [Fact]
    public void Merge_ignores_hexes_that_belong_to_another_chunk()
    {
        var elsewhere = new HexCoord(200, 0);
        Assert.NotEqual(Chunk, FogChunkLayout.ChunkOf(elsewhere));

        var merged = PersistedExploredBitset.Merge(Chunk, ExploredChunkData.None, [elsewhere], out var grew);

        Assert.False(grew);
        Assert.True(merged.IsEmpty);
    }

    [Fact]
    public void Merging_every_hex_of_a_chunk_promotes_it_to_full_and_drops_the_bits()
    {
        var all = HexesOfChunk(Chunk);
        Assert.Equal(FogChunkLayout.HexTexelsPerChunk, all.Count);

        var merged = PersistedExploredBitset.Merge(Chunk, ExploredChunkData.None, all, out var grew);

        Assert.True(grew);
        Assert.True(merged.IsFull);
        Assert.Null(merged.Bits);
        Assert.Equal(FogChunkLayout.HexTexelsPerChunk, PersistedExploredBitset.Count(merged));
    }

    [Fact]
    public void One_hex_short_of_complete_is_not_full_and_the_last_hex_completes_it_across_merges()
    {
        var all = HexesOfChunk(Chunk);

        var almost = PersistedExploredBitset.Merge(Chunk, ExploredChunkData.None, all.Take(all.Count - 1), out _);
        Assert.False(almost.IsFull);
        Assert.NotNull(almost.Bits);

        var completed = PersistedExploredBitset.Merge(Chunk, almost, [all[^1]], out var grew);
        Assert.True(grew);
        Assert.True(completed.IsFull);
        Assert.Null(completed.Bits);
    }

    [Fact]
    public void Merging_into_a_full_chunk_is_a_no_op()
    {
        var merged = PersistedExploredBitset.Merge(Chunk, ExploredChunkData.Full, [HexCoord.Origin], out var grew);

        Assert.False(grew);
        Assert.True(merged.IsFull);
    }

    [Fact]
    public void A_full_chunk_contains_every_hex_of_the_chunk_and_none_outside_it()
    {
        Assert.All(HexesOfChunk(Chunk), h => Assert.True(PersistedExploredBitset.Contains(Chunk, ExploredChunkData.Full, h)));
        Assert.False(PersistedExploredBitset.Contains(Chunk, ExploredChunkData.Full, new HexCoord(200, 0)));
    }

    [Fact]
    public void Full_chunks_work_in_negative_chunk_space_too()
    {
        var chunk = new FogChunkCoord(-2, -5);
        var all = HexesOfChunk(chunk);

        var merged = PersistedExploredBitset.Merge(chunk, ExploredChunkData.None, all, out _);

        Assert.True(merged.IsFull);
        Assert.Equal(all.ToHashSet(), PersistedExploredBitset.Decode(chunk, merged));
    }

    [Fact]
    public void GroupByChunk_buckets_hexes_by_the_chunk_their_texel_lands_in()
    {
        var hexes = HexCoord.Origin.WithinRadius(40).ToList();

        var groups = PersistedExploredBitset.GroupByChunk(hexes);

        Assert.Equal(hexes.Count, groups.Values.Sum(g => g.Count));
        Assert.All(groups, g => Assert.All(g.Value, h => Assert.Equal(g.Key, FogChunkLayout.ChunkOf(h))));
        Assert.True(groups.Count > 1, "a radius-40 disc must straddle several chunks");
    }
}
