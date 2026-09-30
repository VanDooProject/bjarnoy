namespace Bjarnoy.Domain.World;

/// <summary>Whether a wildlife camp will block towers once camp gameplay lands — see <c>docs/design/wildlife-camps.md</c>.</summary>
public enum CampStrength
{
    /// <summary>Guards only its nearest hexes; will not block towers. The seal haul-out, hare warren, deer glade, otter slide, and the beaver and crane bog camps.</summary>
    Weak,

    /// <summary>Guards a wide stretch of land; will block towers. Wolves, boars, bears, Fenrir.</summary>
    Strong,
}

/// <summary>Which kind of ground a camp family is placed on.</summary>
public enum CampGround
{
    Grass,
    Forest,
    Sand,
    Mountain,

    /// <summary>A river tile of shape <see cref="RiverTileShape.Straight"/> (river width, once streams exist).</summary>
    RiverStraight,

    /// <summary>Grass on a wasted island (the wasteland art family).</summary>
    Wasteland,

    /// <summary>Plain bog ground. Bog terrain lands in a later PR: no camp is placed on it yet.</summary>
    Bog,
}

/// <summary>How a family's level roll is skewed inside <c>1..MaxCampLevel</c>; both skews favour low levels.</summary>
public enum CampLevelSkew
{
    /// <summary>Quadraticer: <c>u^2</c>, about 63% on levels 1-2 (weak camps).</summary>
    Quadratic,

    /// <summary>Cubicr: <c>u^1.5</c>, about 71% on levels 1-3 (strong camps).</summary>
    Cubic,
}

/// <summary>One row of the shared camp family table.</summary>
/// <param name="Family">The tile-art family name, also the wire name.</param>
public sealed record CampFamilyInfo(string Family, CampGround Ground, CampStrength Strength, CampLevelSkew LevelSkew);

/// <summary>
/// The shared camp family table — family, ground, strength, level skew. Mirrored
/// one to one by <c>src/frontend/src/lib/map/campPlacement.ts</c> (<c>CAMP_FAMILIES</c>).
/// </summary>
public static class CampFamilies
{
    public const string Wolfden = "wolfden";
    public const string Boarwallow = "boarwallow";
    public const string Bearrapids = "bearrapids";
    public const string Fenrirbrood = "fenrirbrood";
    public const string Sealhaulout = "sealhaulout";
    public const string Walrushaulout = "walrushaulout";
    public const string Eagleeyrie = "eagleeyrie";
    public const string Moosemire = "moosemire";
    public const string Beaverlodge = "beaverlodge";
    public const string Cranedance = "cranedance";
    public const string Deerglade = "deerglade";
    public const string Harewarren = "harewarren";
    public const string Otterslide = "otterslide";

    public static IReadOnlyList<CampFamilyInfo> All { get; } =
    [
        new(Wolfden, CampGround.Grass, CampStrength.Strong, CampLevelSkew.Cubic),
        new(Boarwallow, CampGround.Forest, CampStrength.Strong, CampLevelSkew.Cubic),
        new(Bearrapids, CampGround.RiverStraight, CampStrength.Strong, CampLevelSkew.Cubic),
        new(Fenrirbrood, CampGround.Wasteland, CampStrength.Strong, CampLevelSkew.Cubic),
        new(Sealhaulout, CampGround.Sand, CampStrength.Weak, CampLevelSkew.Quadratic),
        new(Walrushaulout, CampGround.Sand, CampStrength.Strong, CampLevelSkew.Cubic),
        new(Eagleeyrie, CampGround.Mountain, CampStrength.Strong, CampLevelSkew.Cubic),
        new(Moosemire, CampGround.Bog, CampStrength.Strong, CampLevelSkew.Cubic),
        new(Beaverlodge, CampGround.Bog, CampStrength.Weak, CampLevelSkew.Quadratic),
        new(Cranedance, CampGround.Bog, CampStrength.Weak, CampLevelSkew.Quadratic),
        // The weak camps of grass, forest and river (3D_assets hextile130-132), after the strong ones
        // so each ground's first family keeps its candidate hash (CampGenerator.PlaceCore).
        new(Harewarren, CampGround.Grass, CampStrength.Weak, CampLevelSkew.Quadratic),
        new(Deerglade, CampGround.Forest, CampStrength.Weak, CampLevelSkew.Quadratic),
        new(Otterslide, CampGround.RiverStraight, CampStrength.Weak, CampLevelSkew.Quadratic),
    ];

    public static CampFamilyInfo? Find(string family) => All.FirstOrDefault(f => f.Family == family);

    /// <summary>True for a strong family. An unknown family is not strong.</summary>
    public static bool IsStrong(string family) => Find(family)?.Strength == CampStrength.Strong;
}

/// <summary>
/// A wildlife camp on one hex: a family of animals that guards land around it. Spawn and
/// render only for now — no gameplay reads it yet.
/// </summary>
/// <param name="Coord">The hex the camp stands on.</param>
/// <param name="Family">One of <see cref="CampFamilies"/>.</param>
/// <param name="Level">Rolled at spawn, <c>1..CampGenerator.MaxCampLevel</c>; sets <see cref="GuardRange"/>.</param>
/// <param name="Orientation">
/// The tile's own orientation (a bearrapids camp follows its river). The guarded art only
/// ships one to three rotations; the client maps this onto the kept ones by modulo.
/// </param>
public readonly record struct Camp(HexCoord Coord, string Family, int Level, TileOrientation Orientation)
{
    public bool Strong => CampFamilies.IsStrong(Family);

    /// <summary>How many hexes around the camp it guards — see <see cref="CampGenerator.GuardRange(int, CampStrength)"/>.</summary>
    public int GuardRange => CampGenerator.GuardRange(Level, Strong ? CampStrength.Strong : CampStrength.Weak);
}
