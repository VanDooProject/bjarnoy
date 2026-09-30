namespace Bjarnoy.Domain.World;

/// <summary>
/// The island-shape constants that are not admin knobs: identical on the
/// backend and in <c>worldGenerator.ts</c>, so they live in code on both sides
/// rather than in the persisted <see cref="WorldGenerationOptions"/>.
/// </summary>
public static class IslandShapeConstants
{
    /// <summary>Jitter of an island's centre inside its cell, as a fraction of the cell size.</summary>
    public const double Jitter = 0.55;

    /// <summary>How much narrower the spine's tips are than its middle (0 = not at all).</summary>
    public const double Taper = 0.5;

    /// <summary>Per-vertex width jitter range, as a fraction of the tapered width.</summary>
    public const double WidthMinScale = 0.6;

    public const double WidthMaxScale = 1.0;

    /// <summary>The fine second warp octave: amplitude (hexes) and wavelength (hexes).</summary>
    public const double Warp2 = 3.8;

    public const double WarpScale2 = 11.4;

    /// <summary>Weights of the second and third depth-noise octaves relative to the first.</summary>
    public const double Octave2 = 0.7;

    public const double Octave3 = 0.45;

    /// <summary>Satellite islets: at most this many per island, radius and distance as fractions of the vertex width.</summary>
    public const int IsletMax = 5;

    public const double IsletRadiusMin = 0.3;
    public const double IsletRadiusMax = 0.7;
    public const double IsletDistanceMin = 1.6;
    public const double IsletDistanceMax = 3.2;

    /// <summary>Width multipliers of the small (A) and large (C) size classes; B is 1.</summary>
    public const double SmallScale = 0.55;

    public const double LargeScale = 1.6;

    /// <summary>
    /// The farthest, in hexes, an island's land may be from its centre before the
    /// island is shrunk: it must stay inside the 3x3 cell block every hex scans,
    /// after the centre's jitter and both warp octaves.
    /// </summary>
    public static double ReachBudget(double cellSize, double warp) =>
        ((1.5 - (Jitter / 2)) * cellSize) - (warp + Warp2);

    /// <summary>
    /// The largest fraction of an island's half-width the depth noise can add to
    /// the shoreline, plus one: land can be at most this many half-widths from a
    /// spine point.
    /// </summary>
    public static double NoiseReachFactor(double noise) =>
        1.0 + ((noise * 0.5) * ((1.0 + Octave2) + Octave3));
}

/// <summary>Size class of an island cell: small (A), medium (B) or large (C).</summary>
public enum IslandSizeClass
{
    Small = 0,
    Medium = 1,
    Large = 2,
}

/// <summary>
/// One island cell's shape: a bent spine of vertices with a width each, plus a
/// few satellite islets. Everything is in odd-q offset space (column, row).
/// Built once per cell and cached by <see cref="TerrainSampler"/>; the numbers
/// come from hashes of the cell alone, so it never depends on its neighbours
/// (except for the large-island suppression rule, which hashes them too).
/// </summary>
public sealed class IslandShape
{
    internal IslandShape(
        int cellCol,
        int cellRow,
        double centreX,
        double centreY,
        double[] spineX,
        double[] spineY,
        double[] width,
        double[] isletX,
        double[] isletY,
        double[] isletRadius,
        double reach,
        IslandSizeClass sizeClass,
        double clampFactor,
        double noiseReachFactor,
        double warpSum)
    {
        CellCol = cellCol;
        CellRow = cellRow;
        CentreX = centreX;
        CentreY = centreY;
        SpineX = spineX;
        SpineY = spineY;
        Width = width;
        IsletX = isletX;
        IsletY = isletY;
        IsletRadius = isletRadius;
        Reach = reach;
        SizeClass = sizeClass;
        ClampFactor = clampFactor;

        // Tight bounding box of every place land can be, for scanning.
        var minX = double.MaxValue;
        var minY = double.MaxValue;
        var maxX = double.MinValue;
        var maxY = double.MinValue;
        for (var k = 0; k < spineX.Length; k++)
        {
            var e = width[k] * noiseReachFactor;
            minX = Math.Min(minX, centreX + spineX[k] - e);
            maxX = Math.Max(maxX, centreX + spineX[k] + e);
            minY = Math.Min(minY, centreY + spineY[k] - e);
            maxY = Math.Max(maxY, centreY + spineY[k] + e);
        }

        for (var i = 0; i < isletX.Length; i++)
        {
            var e = isletRadius[i] * noiseReachFactor;
            minX = Math.Min(minX, centreX + isletX[i] - e);
            maxX = Math.Max(maxX, centreX + isletX[i] + e);
            minY = Math.Min(minY, centreY + isletY[i] - e);
            maxY = Math.Max(maxY, centreY + isletY[i] + e);
        }

        MinCol = (int)Math.Floor(minX - warpSum);
        MaxCol = (int)Math.Ceiling(maxX + warpSum);
        MinRow = (int)Math.Floor(minY - warpSum);
        MaxRow = (int)Math.Ceiling(maxY + warpSum);
    }

    public int CellCol { get; }

    public int CellRow { get; }

    /// <summary>Jittered centre of the island, offset space.</summary>
    public double CentreX { get; }

    public double CentreY { get; }

    /// <summary>Spine vertices relative to the centre.</summary>
    public IReadOnlyList<double> SpineX { get; }

    public IReadOnlyList<double> SpineY { get; }

    /// <summary>Half-width at each spine vertex.</summary>
    public IReadOnlyList<double> Width { get; }

    /// <summary>Satellite islets relative to the centre: position and radius.</summary>
    public IReadOnlyList<double> IsletX { get; }

    public IReadOnlyList<double> IsletY { get; }

    public IReadOnlyList<double> IsletRadius { get; }

    /// <summary>
    /// The farthest any land of this island can be from <see cref="CentreX"/>/<see cref="CentreY"/>,
    /// warps included. Never more than the cell-scan budget.
    /// </summary>
    public double Reach { get; }

    public IslandSizeClass SizeClass { get; }

    /// <summary>1 unless the island was too big for its cell block and shrunk to fit.</summary>
    public double ClampFactor { get; }

    /// <summary>Inclusive offset-space box (column/row) outside which no hex of this island can be land.</summary>
    public int MinCol { get; }

    public int MaxCol { get; }

    public int MinRow { get; }

    public int MaxRow { get; }

    internal double[] SpineXArray => (double[])SpineX;

    internal double[] SpineYArray => (double[])SpineY;

    internal double[] WidthArray => (double[])Width;

    internal double[] IsletXArray => (double[])IsletX;

    internal double[] IsletYArray => (double[])IsletY;

    internal double[] IsletRadiusArray => (double[])IsletRadius;
}
