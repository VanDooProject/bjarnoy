namespace Bjarnoy.Domain.World;

/// <summary>
/// A whole-world, coarse fog "overview": the detailed mask's texel space cut
/// into <see cref="Factor"/> x <see cref="Factor"/> blocks, one overview texel per block.
/// </summary>
/// <param name="Factor">Detailed texels per overview texel, per axis.</param>
/// <param name="Bounds">The area the grid covers, in detailed texels (aligned to <paramref name="Factor"/>).</param>
/// <param name="Grid">
/// One cell per block, row-major, with <see cref="FogMaskBuffer.Bounds"/> = <c>(0, 0, width, height)</c>
/// so <c>FogMaskPngEncoder</c> encodes it as is.
/// </param>
public sealed record FogOverview(int Factor, MaskBounds Bounds, FogMaskBuffer Grid);

/// <summary>
/// Pure generator for the coarse whole-world fog overview (<c>docs/design/map-fog-v2.md</c> §3, "Overview").
/// R / G of a block are the share of its hexes that are unexplored / out of sight; B is 0. Cost scales with the
/// stored chunks, the source discs and the grid size, never with the world's full-resolution area.
/// </summary>
public static class FogOverviewGenerator
{
    /// <summary>Bump when the output for the same inputs changes (part of the served version).</summary>
    public const int Version = 1;

    /// <summary>The most overview texels per axis.</summary>
    public const int MaxSide = 1024;

    private const int MaxFactor = 64;

    /// <summary>The smallest power of two in [1, 64] whose overview grid fits <see cref="MaxSide"/> on both axes (64 if none).</summary>
    public static int FactorFor(int worldRadius)
    {
        for (var factor = 1; factor < MaxFactor; factor *= 2)
        {
            var bounds = OverviewBounds(worldRadius, factor);
            if (bounds.Width / factor <= MaxSide && bounds.Height / factor <= MaxSide)
            {
                return factor;
            }
        }

        return MaxFactor;
    }

    /// <summary>The world's texel bounds widened to multiples of <paramref name="factor"/> (floor for the minimum, ceiling for the maximum).</summary>
    public static MaskBounds OverviewBounds(int worldRadius, int factor)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(factor, 1);
        var world = FogMaskLayout.WorldBounds(worldRadius);
        return new MaskBounds(
            FloorDiv(world.MinU, factor) * factor,
            FloorDiv(world.MinV, factor) * factor,
            -FloorDiv(-world.MaxU, factor) * factor,
            -FloorDiv(-world.MaxV, factor) * factor);
    }

    public static FogOverview Generate(
        int worldRadius,
        IReadOnlyDictionary<FogChunkCoord, ExploredChunkData> explored,
        IReadOnlyList<FogVisionSource> sources)
    {
        ArgumentNullException.ThrowIfNull(explored);
        ArgumentNullException.ThrowIfNull(sources);

        var factor = FactorFor(worldRadius);
        var bounds = OverviewBounds(worldRadius, factor);
        var width = bounds.Width / factor;
        var height = bounds.Height / factor;
        var exploredCount = new int[width * height];
        var visibleCount = new int[width * height];

        // Explored hexes per block.
        foreach (var (chunk, data) in explored)
        {
            if (data.IsEmpty)
            {
                continue;
            }

            var chunkBounds = FogChunkLayout.Bounds(chunk);
            if (data.IsFull)
            {
                for (var v = chunkBounds.MinV; v < chunkBounds.MaxV; v += factor)
                {
                    for (var u = chunkBounds.MinU; u < chunkBounds.MaxU; u += factor)
                    {
                        if (TryBlock(bounds, factor, width, u, v, out var index))
                        {
                            exploredCount[index] += HexTexelsInBlock(u, v, factor);
                        }
                    }
                }

                continue;
            }

            var bits = data.Bits!;
            for (var i = 0; i < FogChunkLayout.TexelsPerChunk; i++)
            {
                if ((bits[i >> 3] & (1 << (i & 7))) == 0)
                {
                    continue;
                }

                var u = chunkBounds.MinU + (i % FogChunkLayout.ChunkSize);
                var v = chunkBounds.MinV + (i / FogChunkLayout.ChunkSize);
                if (TryBlock(bounds, factor, width, u, v, out var index))
                {
                    exploredCount[index]++;
                }
            }
        }

        // Visible hexes per block: the union of the source discs, with the detailed generator's distance.
        var seen = new HashSet<MaskTexel>();
        foreach (var source in sources)
        {
            if (source.VisibleRadius < 0)
            {
                continue;
            }

            foreach (var hex in source.Coord.WithinRadius(HexOffsets.ReachSteps(source.VisibleRadius)))
            {
                if (HexCoord.EuclideanDistance(hex, source.Coord) > source.VisibleRadius)
                {
                    continue;
                }

                var texel = FogMaskLayout.ToTexel(hex);
                if (TryBlock(bounds, factor, width, texel.U, texel.V, out var index) && seen.Add(texel))
                {
                    visibleCount[index]++;
                }
            }
        }

        var cells = new FogMaskCell[width * height];
        for (var row = 0; row < height; row++)
        {
            for (var col = 0; col < width; col++)
            {
                var index = (row * width) + col;
                var total = HexTexelsInBlock(bounds.MinU + (col * factor), bounds.MinV + (row * factor), factor);
                cells[index] = total == 0
                    ? new FogMaskCell(255, 255, 0)
                    : new FogMaskCell(Complement(exploredCount[index], total), Complement(visibleCount[index], total), 0);
            }
        }

        return new FogOverview(factor, bounds, new FogMaskBuffer { Bounds = new MaskBounds(0, 0, width, height), Cells = cells });
    }

    private static byte Complement(int count, int total) =>
        (byte)(255 - (int)Math.Round(255.0 * Math.Min(count, total) / total, MidpointRounding.AwayFromZero));

    private static bool TryBlock(MaskBounds bounds, int factor, int width, int u, int v, out int index)
    {
        index = 0;
        if (u < bounds.MinU || u >= bounds.MaxU || v < bounds.MinV || v >= bounds.MaxV)
        {
            return false;
        }

        index = (((v - bounds.MinV) / factor) * width) + ((u - bounds.MinU) / factor);
        return true;
    }

    /// <summary>Hex (even-parity) texels in the factor x factor block whose minimum corner is (u, v).</summary>
    private static int HexTexelsInBlock(int u, int v, int factor) =>
        factor == 1 ? (FogMaskLayout.IsHexTexel(new MaskTexel(u, v)) ? 1 : 0) : factor * factor / 2;

    private static int FloorDiv(int value, int divisor) =>
        (value / divisor) - ((value % divisor != 0 && (value < 0) != (divisor < 0)) ? 1 : 0);
}
