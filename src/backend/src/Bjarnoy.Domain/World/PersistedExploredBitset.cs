namespace Bjarnoy.Domain.World;

/// <summary>
/// A per-player, per-world explored-history bitset — one bit per mask texel
/// over a <see cref="MaskBounds"/> region, per
/// <c>docs/design/map-fog-v2.md</c> §1e. Pure bit-packing only: no I/O, no
/// notion of "who" or "which world" — <c>PlayerExploredEntity</c>
/// (<c>Bjarnoy.Infrastructure</c>) owns that.
/// </summary>
/// <remarks>
/// Only ever set at hex texels (even-parity, <see cref="FogMaskLayout.IsHexTexel"/>)
/// — the interpolation-only odd-parity texels are always derived by
/// <see cref="FogMaskGenerator"/>'s own averaging pass and never need a bit of
/// their own. Sizing the bitset over the full texel bounds anyway (rather
/// than a tighter hex-only index) keeps the bit index identical to
/// <see cref="FogMaskBuffer"/>'s own <c>(v - MinV) * Width + (u - MinU)</c>
/// row-major indexing, so no second indexing scheme has to be kept in sync
/// with it — the unused odd-parity bits are a fixed, small (half the texels)
/// space cost for that simplicity.
/// </remarks>
public static class PersistedExploredBitset
{
    /// <summary>Number of bytes needed to hold one bit per texel in <paramref name="bounds"/>.</summary>
    public static int ByteCount(MaskBounds bounds) => ((bounds.Width * bounds.Height) + 7) / 8;

    /// <summary>Packs every hex in <paramref name="hexes"/> that falls within <paramref name="bounds"/> into a fresh bitset.</summary>
    public static byte[] Encode(MaskBounds bounds, IReadOnlySet<HexCoord> hexes)
    {
        var bits = new byte[ByteCount(bounds)];
        foreach (var hex in hexes)
        {
            SetBit(bits, bounds, FogMaskLayout.ToTexel(hex));
        }

        return bits;
    }

    /// <summary>Unpacks a bitset (as produced by <see cref="Encode"/> or <see cref="Merge"/>) back into the set of explored hexes.</summary>
    public static HashSet<HexCoord> Decode(MaskBounds bounds, byte[]? bits)
    {
        var hexes = new HashSet<HexCoord>();
        if (bits is null || bits.Length == 0)
        {
            return hexes;
        }

        for (var v = bounds.MinV; v < bounds.MaxV; v++)
        {
            for (var u = bounds.MinU; u < bounds.MaxU; u++)
            {
                var texel = new MaskTexel(u, v);
                if (FogMaskLayout.IsHexTexel(texel) && GetBit(bits, bounds, texel))
                {
                    hexes.Add(FogMaskLayout.ToHex(texel));
                }
            }
        }

        return hexes;
    }

    /// <summary>
    /// OR-s <paramref name="newlyExplored"/> into <paramref name="existing"/> (a
    /// prior <see cref="Encode"/>/<see cref="Merge"/> result, or
    /// <see langword="null"/> for "nothing explored yet") — append-only, per
    /// §1e: a hex already set never gets cleared. <paramref name="grew"/> is
    /// <see langword="true"/> only when at least one new bit was actually set,
    /// so a caller can skip writing back an unchanged row.
    /// </summary>
    public static byte[] Merge(MaskBounds bounds, byte[]? existing, IEnumerable<HexCoord> newlyExplored, out bool grew)
    {
        var bits = existing is { Length: > 0 } ? (byte[])existing.Clone() : new byte[ByteCount(bounds)];
        grew = false;

        foreach (var hex in newlyExplored)
        {
            var texel = FogMaskLayout.ToTexel(hex);
            if (!bounds.Contains(texel))
            {
                continue;
            }

            if (!GetBit(bits, bounds, texel))
            {
                SetBit(bits, bounds, texel);
                grew = true;
            }
        }

        return bits;
    }

    private static int TexelIndex(MaskBounds bounds, MaskTexel texel) =>
        ((texel.V - bounds.MinV) * bounds.Width) + (texel.U - bounds.MinU);

    private static bool GetBit(byte[] bits, MaskBounds bounds, MaskTexel texel)
    {
        var index = TexelIndex(bounds, texel);
        return (bits[index / 8] & (1 << (index % 8))) != 0;
    }

    private static void SetBit(byte[] bits, MaskBounds bounds, MaskTexel texel)
    {
        var index = TexelIndex(bounds, texel);
        bits[index / 8] |= (byte)(1 << (index % 8));
    }
}
