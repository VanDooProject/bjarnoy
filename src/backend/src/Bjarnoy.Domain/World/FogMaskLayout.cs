namespace Bjarnoy.Domain.World;

/// <summary>
/// A texel in the doubled-row mask space (see <see cref="FogMaskLayout"/>).
/// </summary>
public readonly record struct MaskTexel(int U, int V);

/// <summary>
/// Axis-aligned box of mask texels, half-open on the high edge
/// (<c>[MinU, MaxU)</c> x <c>[MinV, MaxV)</c>), matching the fixed-size chunk
/// grid the fog mask is delivered in.
/// </summary>
public readonly record struct MaskBounds(int MinU, int MinV, int MaxU, int MaxV)
{
    public int Width => MaxU - MinU;

    public int Height => MaxV - MinV;

    public bool Contains(MaskTexel texel) =>
        texel.U >= MinU && texel.U < MaxU && texel.V >= MinV && texel.V < MaxV;
}

/// <summary>
/// The world-to-texel coordinate space the fog mask is baked in and sampled
/// from, per <c>docs/design/map-fog-v2.md</c> §2.1.
/// </summary>
/// <remarks>
/// <see cref="HexCoord.ToOddQ"/> already gives the odd-q offset column/row a
/// hex lives at. A naive <c>(col, row)</c> texture needs a per-column
/// half-row shift when sampled in the shader, which breaks bilinear
/// filtering across column boundaries. This "doubled-row" space instead maps
/// every real hex onto an even-parity texel (<c>u + v</c> even) via
/// <c>u = col</c>, <c>v = 2*row + (col &amp; 1)</c> — an exact affine
/// world-&gt;texel map with no branching. The odd-parity texels in between
/// (<c>u + v</c> odd) have no hex of their own; the generator fills them by
/// averaging their four diagonal hex neighbours (see
/// <see cref="FogMaskGenerator"/>) so hardware bilinear filtering
/// interpolates correctly across the whole texture.
/// </remarks>
public static class FogMaskLayout
{
    /// <summary>Maps a hex onto its even-parity texel in doubled-row space.</summary>
    public static MaskTexel ToTexel(HexCoord hex)
    {
        var offset = hex.ToOddQ();
        var u = offset.Col;
        var v = (2 * offset.Row) + (offset.Col & 1);
        return new MaskTexel(u, v);
    }

    /// <summary>
    /// Inverse of <see cref="ToTexel"/>. Only meaningful for an even-parity
    /// texel (<c>u + v</c> even) — odd-parity texels are interpolation-only
    /// and have no corresponding hex.
    /// </summary>
    public static HexCoord ToHex(MaskTexel texel)
    {
        var col = texel.U;
        var row = (texel.V - (col & 1)) / 2;
        return HexCoord.FromOddQ(new OffsetCoord(col, row));
    }

    /// <summary>Whether a texel lands on a real hex rather than an interpolation cell.</summary>
    public static bool IsHexTexel(MaskTexel texel) => ((texel.U + texel.V) & 1) == 0;

    /// <summary>
    /// The four hexes diagonally surrounding an odd-parity interpolation
    /// texel, in doubled-row space (i.e. the four even-parity texels one step
    /// away along each diagonal). An odd-parity generator cell is filled by
    /// averaging these.
    /// </summary>
    public static IEnumerable<MaskTexel> DiagonalNeighboursForInterpolation(MaskTexel texel)
    {
        yield return texel with { U = texel.U - 1 };
        yield return texel with { U = texel.U + 1 };
        yield return texel with { V = texel.V - 1 };
        yield return texel with { V = texel.V + 1 };
    }

    /// <summary>
    /// The smallest <see cref="MaskBounds"/> covering every hex within
    /// <paramref name="radius"/> of the origin, i.e. the whole-world texel
    /// bounding box for a world of that <c>Radius</c> (see
    /// <see cref="WorldGenerationOptions.Radius"/>).
    /// </summary>
    /// <remarks>
    /// Closed form, O(1): with <c>u = q</c> and <c>v = 2r + q</c> (the odd-q
    /// offset algebra collapses to that for every hex, negative or not), a
    /// hex disc of radius R spans <c>u in [-R, R]</c> and
    /// <c>v = r + (q + r) in [-2R, 2R]</c> — the extremes are hit at
    /// <c>(q, r) = (+-R, 0)</c> and <c>(0, +-R)</c>. Walking the disc
    /// instead would be ~48M hexes at radius 4000.
    /// </remarks>
    public static MaskBounds WorldBounds(int radius)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(radius);

        // Every even-parity texel needs its odd-parity interpolation
        // neighbours available too, so the box grows by one texel on every
        // side of the tight hex bound.
        return new MaskBounds(-radius - 1, (-2 * radius) - 1, radius + 2, (2 * radius) + 2);
    }
}
