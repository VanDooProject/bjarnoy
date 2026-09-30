namespace Bjarnoy.Domain.World;

/// <summary>
/// A chunk address in the fixed 64 x 64-texel grid laid over the doubled-row
/// texel space (<see cref="FogMaskLayout"/>). Chunk <c>(cu, cv)</c> covers
/// texels <c>[cu * 64, cu * 64 + 64) x [cv * 64, cv * 64 + 64)</c>, negative
/// coordinates included (floor division), so the grid tiles the plane
/// without gaps and does not depend on any world's radius.
/// </summary>
public readonly record struct FogChunkCoord(int U, int V);

/// <summary>
/// The chunk grid that persisted explored history, mask generation, caching
/// and delivery are all keyed on — <c>docs/design/map-fog-v2.md</c> §3.
/// </summary>
/// <remarks>
/// The grid is anchored at texel (0, 0), not at a world's own
/// <see cref="FogMaskLayout.WorldBounds"/> minimum, so a chunk address means
/// the same thing whatever the world's radius (a reseed to another radius
/// does not shift every stored chunk). 64 is even, so a texel's parity
/// (<see cref="FogMaskLayout.IsHexTexel"/>) equals its local-index parity
/// inside a chunk: exactly half of a chunk's 4096 texels are hexes.
/// </remarks>
public static class FogChunkLayout
{
    public const int ChunkSize = 64;

    /// <summary>Texels in a chunk.</summary>
    public const int TexelsPerChunk = ChunkSize * ChunkSize;

    /// <summary>Real-hex (even-parity) texels in a chunk — what "fully explored" has to cover.</summary>
    public const int HexTexelsPerChunk = TexelsPerChunk / 2;

    private static int FloorDiv(int value, int divisor) =>
        (value / divisor) - ((value % divisor != 0 && (value < 0) != (divisor < 0)) ? 1 : 0);

    public static FogChunkCoord ChunkOf(MaskTexel texel) =>
        new(FloorDiv(texel.U, ChunkSize), FloorDiv(texel.V, ChunkSize));

    public static FogChunkCoord ChunkOf(HexCoord hex) => ChunkOf(FogMaskLayout.ToTexel(hex));

    /// <summary>The texels a chunk covers, half-open.</summary>
    public static MaskBounds Bounds(FogChunkCoord chunk) => new(
        chunk.U * ChunkSize,
        chunk.V * ChunkSize,
        (chunk.U * ChunkSize) + ChunkSize,
        (chunk.V * ChunkSize) + ChunkSize);

    /// <summary>Index of a texel inside its own chunk, row-major, <c>0..4095</c>.</summary>
    public static int LocalIndex(MaskTexel texel)
    {
        var localU = texel.U - (FloorDiv(texel.U, ChunkSize) * ChunkSize);
        var localV = texel.V - (FloorDiv(texel.V, ChunkSize) * ChunkSize);
        return (localV * ChunkSize) + localU;
    }

    /// <summary>
    /// The inclusive rectangle of chunks that intersect <paramref name="bounds"/>
    /// (a half-open texel box).
    /// </summary>
    public static (FogChunkCoord Min, FogChunkCoord Max) ChunkRange(MaskBounds bounds) =>
        (ChunkOf(new MaskTexel(bounds.MinU, bounds.MinV)),
         ChunkOf(new MaskTexel(bounds.MaxU - 1, bounds.MaxV - 1)));

    /// <summary>The inclusive chunk rectangle covering a whole world of <paramref name="radius"/>.</summary>
    public static (FogChunkCoord Min, FogChunkCoord Max) WorldChunkRange(int radius) =>
        ChunkRange(FogMaskLayout.WorldBounds(radius));
}
