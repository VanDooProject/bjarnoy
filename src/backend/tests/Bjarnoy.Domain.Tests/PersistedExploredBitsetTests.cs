using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class PersistedExploredBitsetTests
{
    [Fact]
    public void Encode_and_decode_round_trip_every_hex_in_radius()
    {
        var bounds = FogMaskLayout.WorldBounds(6);
        var hexes = HexCoord.Origin.WithinRadius(6).ToHashSet();

        var bits = PersistedExploredBitset.Encode(bounds, hexes);
        var decoded = PersistedExploredBitset.Decode(bounds, bits);

        Assert.Equal(hexes, decoded);
    }

    [Fact]
    public void Decode_of_null_or_empty_bits_is_the_empty_set()
    {
        var bounds = FogMaskLayout.WorldBounds(4);

        Assert.Empty(PersistedExploredBitset.Decode(bounds, null));
        Assert.Empty(PersistedExploredBitset.Decode(bounds, []));
    }

    [Fact]
    public void Merge_ors_new_hexes_in_without_touching_existing_ones()
    {
        var bounds = FogMaskLayout.WorldBounds(6);
        var existing = PersistedExploredBitset.Encode(bounds, new HashSet<HexCoord> { HexCoord.Origin });

        var merged = PersistedExploredBitset.Merge(bounds, existing, [new HexCoord(2, 0)], out var grew);

        Assert.True(grew);
        var decoded = PersistedExploredBitset.Decode(bounds, merged);
        Assert.Contains(HexCoord.Origin, decoded);
        Assert.Contains(new HexCoord(2, 0), decoded);
        Assert.Equal(2, decoded.Count);
    }

    [Fact]
    public void Merge_reports_no_growth_when_every_hex_was_already_set()
    {
        var bounds = FogMaskLayout.WorldBounds(6);
        var existing = PersistedExploredBitset.Encode(bounds, new HashSet<HexCoord> { HexCoord.Origin, new(1, 0) });

        var merged = PersistedExploredBitset.Merge(bounds, existing, [HexCoord.Origin], out var grew);

        Assert.False(grew);
        Assert.Equal(existing, merged);
    }

    [Fact]
    public void Merge_starting_from_null_behaves_like_encoding_fresh()
    {
        var bounds = FogMaskLayout.WorldBounds(6);

        var merged = PersistedExploredBitset.Merge(bounds, null, [HexCoord.Origin], out var grew);

        Assert.True(grew);
        Assert.Equal(new HashSet<HexCoord> { HexCoord.Origin }, PersistedExploredBitset.Decode(bounds, merged));
    }

    [Fact]
    public void Merge_ignores_hexes_outside_the_bounds()
    {
        var bounds = FogMaskLayout.WorldBounds(2);
        var outside = new HexCoord(100, 100);

        var merged = PersistedExploredBitset.Merge(bounds, null, [outside], out var grew);

        Assert.False(grew);
        Assert.Empty(PersistedExploredBitset.Decode(bounds, merged));
    }

    [Fact]
    public void ByteCount_covers_every_texel_including_interpolation_ones()
    {
        var bounds = new MaskBounds(-1, -1, 2, 2); // 3x3 = 9 texels
        Assert.Equal(2, PersistedExploredBitset.ByteCount(bounds)); // ceil(9/8)
    }
}
