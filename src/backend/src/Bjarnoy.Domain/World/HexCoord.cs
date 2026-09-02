namespace Bjarnoy.Domain.World;

/// <summary>
/// Axial hex coordinate (flat-top orientation), the lattice shared by the world
/// map and the settlement view. Mirrors <c>src/frontend/src/lib/hex/coords.ts</c>
/// so client and server describe the same hex by the same pair.
/// </summary>
/// <remarks>
/// See https://www.redblobgames.com/grids/hexagons/. This replaces the legacy
/// <c>HexCoordinates3D</c>, which was a mutable class compared by distance with a
/// tolerance; a record struct gives real value equality, so a coordinate can be a
/// dictionary key without a linear scan.
/// </remarks>
public readonly record struct HexCoord(int Q, int R)
{
    /// <summary>Third cube axis, always <c>-Q - R</c>.</summary>
    public int S => -Q - R;

    private static readonly HexCoord[] DirectionVectors =
    [
        new(1, 0), new(1, -1), new(0, -1),
        new(-1, 0), new(-1, 1), new(0, 1),
    ];

    /// <summary>
    /// The six axial direction vectors, in the order the frontend uses.
    /// </summary>
    public static ReadOnlySpan<HexCoord> Directions => DirectionVectors;

    public static HexCoord Origin => new(0, 0);

    public static HexCoord operator +(HexCoord a, HexCoord b) => new(a.Q + b.Q, a.R + b.R);

    public static HexCoord operator -(HexCoord a, HexCoord b) => new(a.Q - b.Q, a.R - b.R);

    /// <summary>Hex distance, i.e. the number of steps between two hexes.</summary>
    public static int Distance(HexCoord a, HexCoord b)
    {
        var d = a - b;
        return Math.Max(Math.Abs(d.Q), Math.Max(Math.Abs(d.R), Math.Abs(d.S)));
    }

    public int DistanceTo(HexCoord other) => Distance(this, other);

    /// <summary>
    /// Straight-line distance between two hex centres, in hex-spacing units —
    /// the round metric, as opposed to <see cref="Distance"/>'s step count.
    /// Mirrors the frontend's <c>hexEuclideanDistance</c> (<c>hex/coords.ts</c>).
    /// </summary>
    /// <remarks>
    /// The two differ in <em>shape</em>, not just precision, which matters
    /// wherever a distance is rendered rather than counted. A
    /// <see cref="Distance"/> disk is a hexagon: its six axis directions reach
    /// ~15% further from the centre than the directions between them (a
    /// displacement of d steps is d wide along an axis and 0.866·d between
    /// axes). Every contour of such a field has six corners, which is exactly
    /// what the fog ramp built on it shows once the client's edge shading is
    /// soft enough to see the shape of — noise can scramble a contour, but not
    /// a bias that points the same six ways everywhere.
    ///
    /// Gameplay reach stays <see cref="Distance"/>; this is for the fog mask's
    /// ramp, where the question is "how far away does this <em>look</em>".
    ///
    /// Never larger than <see cref="Distance"/> for the same pair, and never
    /// smaller than √3/2 of it, so a Distance-based enumeration around a
    /// euclidean query is complete once widened by 2/√3.
    /// </remarks>
    public static double EuclideanDistance(HexCoord a, HexCoord b)
    {
        // Axial -> cartesian at unit centre spacing: adjacent hexes land
        // exactly 1 apart, so the result is directly comparable with a
        // Distance-based radius.
        var d = a - b;
        var x = d.Q + (d.R / 2.0);
        var y = d.R * (Math.Sqrt(3.0) / 2.0);
        return Math.Sqrt((x * x) + (y * y));
    }

    /// <summary>
    /// The six adjacent hexes. The legacy implementation walked the 3x3 square
    /// around a hex and so returned eight, two of them at distance 2.
    /// </summary>
    public HexCoord[] Neighbours()
    {
        var result = new HexCoord[6];
        for (var i = 0; i < 6; i++)
        {
            result[i] = this + Directions[i];
        }

        return result;
    }

    /// <summary>All hexes within <paramref name="radius"/> steps, including this one.</summary>
    public IEnumerable<HexCoord> WithinRadius(int radius)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(radius);

        for (var dq = -radius; dq <= radius; dq++)
        {
            var rMin = Math.Max(-radius, -dq - radius);
            var rMax = Math.Min(radius, -dq + radius);
            for (var dr = rMin; dr <= rMax; dr++)
            {
                yield return new HexCoord(Q + dq, R + dr);
            }
        }
    }

    /// <summary>
    /// Odd-q offset coordinates, the roughly-square space the renderer and the
    /// island placement grid work in.
    /// </summary>
    public OffsetCoord ToOddQ() => new(Q, R + ((Q - (Q & 1)) / 2));

    public static HexCoord FromOddQ(OffsetCoord offset) =>
        new(offset.Col, offset.Row - ((offset.Col - (offset.Col & 1)) / 2));

    public override string ToString() => $"({Q}|{R})";
}

/// <summary>Odd-q offset coordinate, the column/row form of <see cref="HexCoord"/>.</summary>
public readonly record struct OffsetCoord(int Col, int Row);
