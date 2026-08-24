namespace Bjarnoy.Domain.World;

/// <summary>
/// Deterministic, allocation-free value noise: a 2D hash smoothed with
/// smoothstep and bilinear interpolation.
/// </summary>
/// <remarks>
/// <para>
/// This is a faithful port of the hash and noise functions in
/// <c>src/frontend/src/lib/map/worldGenerator.ts</c>, down to the JavaScript
/// integer-coercion semantics, so that server and client classify the same hex
/// identically. That matters because terrain is never stored: a world persists
/// as a seed, and both sides derive tiles from it on demand.
/// </para>
/// <para>
/// It replaces the legacy generator's dependency on the <c>SimplexNoise</c>
/// package, whose seed was a global static — two worlds generated concurrently
/// overwrote each other's noise field. Every function here is pure.
/// </para>
/// </remarks>
public static class ValueNoise
{
    private const double TwoPow32 = 4294967296.0;

    /// <summary>
    /// ECMAScript <c>ToUint32</c>: truncate towards zero, then take the value
    /// modulo 2^32. This is what JavaScript's <c>&gt;&gt;&gt;</c> and <c>^</c>
    /// operators do to a double before operating on it.
    /// </summary>
    private static uint ToUint32(double value)
    {
        if (double.IsNaN(value) || double.IsInfinity(value))
        {
            return 0;
        }

        var truncated = Math.Truncate(value) % TwoPow32;
        if (truncated < 0)
        {
            truncated += TwoPow32;
        }

        return (uint)truncated;
    }

    private static int ToInt32(double value) => unchecked((int)ToUint32(value));

    /// <summary>
    /// Hashes a lattice point to a value in <c>[0, 1)</c>. The multiplications
    /// are done in <see cref="double"/> — not <see cref="int"/> — because that
    /// is what JavaScript does, and the products overflow 53 bits of mantissa,
    /// so the rounding is part of the function's identity.
    /// </summary>
    public static double Hash2(int x, int y, int seed)
    {
        var h = ((double)x * 374761393.0) + ((double)y * 668265263.0) + ((double)seed * 2147483647.0);

        var i = ToInt32(h);
        i = ToInt32(unchecked(i ^ (int)(ToUint32(i) >> 13)) * 1274126177.0);
        i = unchecked(i ^ (int)(ToUint32(i) >> 16));

        return ToUint32(i) % 100000 / 100000.0;
    }

    private static double Smooth(double t) => t * t * (3.0 - (2.0 * t));

    /// <summary>Bilinear value noise sampled on a lattice of the given cell size.</summary>
    public static double Sample(double x, double y, int seed, double cell)
    {
        var sx = x / cell;
        var sy = y / cell;
        var x0 = (int)Math.Floor(sx);
        var y0 = (int)Math.Floor(sy);
        var tx = Smooth(sx - x0);
        var ty = Smooth(sy - y0);

        var v00 = Hash2(x0, y0, seed);
        var v10 = Hash2(x0 + 1, y0, seed);
        var v01 = Hash2(x0, y0 + 1, seed);
        var v11 = Hash2(x0 + 1, y0 + 1, seed);

        var a = v00 + ((v10 - v00) * tx);
        var b = v01 + ((v11 - v01) * tx);
        return a + ((b - a) * ty);
    }
}
