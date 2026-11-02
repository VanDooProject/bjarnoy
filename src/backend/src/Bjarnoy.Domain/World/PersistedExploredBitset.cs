using System.Numerics;

namespace Bjarnoy.Domain.World;

/// <summary>
/// One chunk's persisted explored history: either a bitset over the chunk's
/// 64 x 64 texels, or the single "every hex in here is explored" flag.
/// </summary>
/// <param name="Bits">
/// <see cref="PersistedExploredBitset.ByteCount"/> bytes, one bit per texel
/// in <see cref="FogChunkLayout.LocalIndex"/> order; <see langword="null"/>
/// when the chunk is untouched or <paramref name="IsFull"/>.
/// </param>
/// <param name="IsFull">
/// Every hex texel of the chunk is explored. Stored as a flag with no bits,
/// which is what keeps the mountains of fully scouted ground cheap (512 bytes
/// per chunk down to a row with a boolean).
/// </param>
public readonly record struct ExploredChunkData(byte[]? Bits, bool IsFull)
{
    /// <summary>An untouched chunk — nothing explored.</summary>
    public static ExploredChunkData None => default;

    /// <summary>A completely explored chunk.</summary>
    public static ExploredChunkData Full => new(null, true);

    public bool IsEmpty => !IsFull && Bits is null;
}

/// <summary>
/// Per-chunk explored-history bitsets, per <c>docs/design/map-fog-v2.md</c>
/// §1e/§3. Pure bit-packing only: no I/O, no notion of "who" or "which
/// world" — <c>PlayerExploredChunkEntity</c> (<c>Bjarnoy.Infrastructure</c>)
/// owns that.
/// </summary>
/// <remarks>
/// <para>
/// A chunk is 64 x 64 texels (<see cref="FogChunkLayout"/>), so its bitset is
/// a fixed 512 bytes regardless of the world's size. Bits are only ever set
/// at hex texels (even parity, <see cref="FogMaskLayout.IsHexTexel"/>) — the
/// odd-parity interpolation texels are derived by
/// <see cref="FogMaskGenerator"/>'s averaging pass. Indexing the full texel
/// grid rather than a hex-only index costs half the bits but keeps one
/// indexing scheme (<see cref="FogChunkLayout.LocalIndex"/>).
/// </para>
/// <para>
/// Compression: a chunk whose every hex texel is set is promoted to
/// <see cref="ExploredChunkData.Full"/> and drops its bits; merging into a
/// full chunk is a no-op. An untouched chunk is <see cref="ExploredChunkData.None"/>
/// and is never stored at all.
/// </para>
/// </remarks>
public static class PersistedExploredBitset
{
    /// <summary>Bytes of one chunk's bitset.</summary>
    public const int ByteCount = FogChunkLayout.TexelsPerChunk / 8;

    private const int BytesPerRow = FogChunkLayout.ChunkSize / 8;

    /// <summary>
    /// The bits that are set in a completely explored chunk, per byte: even
    /// local rows carry hexes at even columns (0x55), odd rows at odd
    /// columns (0xAA).
    /// </summary>
    private static byte FullRowByte(int localRow) => (localRow & 1) == 0 ? (byte)0x55 : (byte)0xAA;

    /// <summary>Whether <paramref name="hex"/> is explored according to <paramref name="data"/> for <paramref name="chunk"/>.</summary>
    public static bool Contains(FogChunkCoord chunk, ExploredChunkData data, HexCoord hex)
    {
        var texel = FogMaskLayout.ToTexel(hex);
        if (FogChunkLayout.ChunkOf(texel) != chunk)
        {
            return false;
        }

        return data.IsFull || (data.Bits is not null && GetBit(data.Bits, FogChunkLayout.LocalIndex(texel)));
    }

    /// <summary>Whether the texel at <paramref name="texel"/> (inside <paramref name="chunk"/>) is explored.</summary>
    public static bool ContainsTexel(FogChunkCoord chunk, ExploredChunkData data, MaskTexel texel) =>
        FogChunkLayout.ChunkOf(texel) == chunk
        && FogMaskLayout.IsHexTexel(texel)
        && (data.IsFull || (data.Bits is not null && GetBit(data.Bits, FogChunkLayout.LocalIndex(texel))));

    /// <summary>Whether every hex texel of a chunk is set in <paramref name="bits"/>.</summary>
    public static bool IsComplete(byte[] bits)
    {
        if (bits.Length != ByteCount)
        {
            return false;
        }

        for (var row = 0; row < FogChunkLayout.ChunkSize; row++)
        {
            var expected = FullRowByte(row);
            for (var b = 0; b < BytesPerRow; b++)
            {
                if ((bits[(row * BytesPerRow) + b] & expected) != expected)
                {
                    return false;
                }
            }
        }

        return true;
    }

    /// <summary>Number of explored hexes in a chunk.</summary>
    public static int Count(ExploredChunkData data)
    {
        if (data.IsFull)
        {
            return FogChunkLayout.HexTexelsPerChunk;
        }

        return data.Bits is null ? 0 : data.Bits.Sum(b => BitOperations.PopCount(b));
    }

    /// <summary>Packs every hex of <paramref name="hexes"/> that falls inside <paramref name="chunk"/> into a fresh chunk.</summary>
    public static ExploredChunkData Encode(FogChunkCoord chunk, IEnumerable<HexCoord> hexes) =>
        Merge(chunk, ExploredChunkData.None, hexes, out _);

    /// <summary>Unpacks a chunk back into the set of explored hexes (test/debug use — never on a request path).</summary>
    public static HashSet<HexCoord> Decode(FogChunkCoord chunk, ExploredChunkData data)
    {
        var hexes = new HashSet<HexCoord>();
        if (data.IsEmpty)
        {
            return hexes;
        }

        var bounds = FogChunkLayout.Bounds(chunk);
        for (var v = bounds.MinV; v < bounds.MaxV; v++)
        {
            for (var u = bounds.MinU; u < bounds.MaxU; u++)
            {
                var texel = new MaskTexel(u, v);
                if (ContainsTexel(chunk, data, texel))
                {
                    hexes.Add(FogMaskLayout.ToHex(texel));
                }
            }
        }

        return hexes;
    }

    /// <summary>
    /// OR-s <paramref name="newlyExplored"/> into <paramref name="existing"/> —
    /// append-only, per §1e: a hex already set never gets cleared. Hexes that
    /// belong to another chunk are ignored (callers group by
    /// <see cref="FogChunkLayout.ChunkOf(HexCoord)"/> first). Returns a full
    /// chunk once every hex texel is set. <paramref name="grew"/> is
    /// <see langword="true"/> only when at least one new bit was actually set,
    /// so a caller can skip writing back an unchanged row. The input's byte
    /// array is never mutated.
    /// </summary>
    public static ExploredChunkData Merge(
        FogChunkCoord chunk, ExploredChunkData existing, IEnumerable<HexCoord> newlyExplored, out bool grew)
    {
        grew = false;
        if (existing.IsFull)
        {
            return existing;
        }

        byte[]? bits = null;
        foreach (var hex in newlyExplored)
        {
            var texel = FogMaskLayout.ToTexel(hex);
            if (FogChunkLayout.ChunkOf(texel) != chunk)
            {
                continue;
            }

            var index = FogChunkLayout.LocalIndex(texel);
            if (existing.Bits is not null && GetBit(existing.Bits, index))
            {
                continue;
            }

            bits ??= existing.Bits is { Length: ByteCount } ? (byte[])existing.Bits.Clone() : new byte[ByteCount];
            if (!GetBit(bits, index))
            {
                SetBit(bits, index);
                grew = true;
            }
        }

        if (!grew)
        {
            return existing;
        }

        return IsComplete(bits!) ? ExploredChunkData.Full : new ExploredChunkData(bits, false);
    }

    /// <summary>
    /// Convenience over <see cref="Merge"/>: groups <paramref name="hexes"/> by
    /// chunk.
    /// </summary>
    public static Dictionary<FogChunkCoord, List<HexCoord>> GroupByChunk(IEnumerable<HexCoord> hexes)
    {
        var groups = new Dictionary<FogChunkCoord, List<HexCoord>>();
        foreach (var hex in hexes)
        {
            var chunk = FogChunkLayout.ChunkOf(hex);
            if (!groups.TryGetValue(chunk, out var list))
            {
                groups[chunk] = list = [];
            }

            list.Add(hex);
        }

        return groups;
    }

    private static bool GetBit(byte[] bits, int index) => (bits[index >> 3] & (1 << (index & 7))) != 0;

    private static void SetBit(byte[] bits, int index) => bits[index >> 3] |= (byte)(1 << (index & 7));
}
