namespace Bjarnoy.Domain.World;

/// <summary>Whether a wildlife camp will block towers once camp gameplay lands — see <c>docs/design/wildlife-camps.md</c>.</summary>
public enum CampStrength
{
    /// <summary>Guards only its nearest hexes; will not block towers. Seals, eagles, and the bog camps.</summary>
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

/// <summary>How a family's level roll is skewed inside <c>1..MaxCampLevel</c>.</summary>
public enum CampLevelSkew
{
    /// <summary>Mostly low levels (weak camps).</summary>
    Low,

    /// <summary>Mostly high levels (strong camps).</summary>
    High,
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
    public const string Eagleeyrie = "eagleeyrie";
    public const string Moosemire = "moosemire";
    public const string Beaverlodge = "beaverlodge";
    public const string Cranedance = "cranedance";

    public static IReadOnlyList<CampFamilyInfo> All { get; } =
    [
        new(Wolfden, CampGround.Grass, CampStrength.Strong, CampLevelSkew.High),
        new(Boarwallow, CampGround.Forest, CampStrength.Strong, CampLevelSkew.High),
        new(Bearrapids, CampGround.RiverStraight, CampStrength.Strong, CampLevelSkew.High),
        new(Fenrirbrood, CampGround.Wasteland, CampStrength.Strong, CampLevelSkew.High),
        new(Sealhaulout, CampGround.Sand, CampStrength.Weak, CampLevelSkew.Low),
        new(Eagleeyrie, CampGround.Mountain, CampStrength.Weak, CampLevelSkew.Low),
        new(Moosemire, CampGround.Bog, CampStrength.Weak, CampLevelSkew.Low),
        new(Beaverlodge, CampGround.Bog, CampStrength.Weak, CampLevelSkew.Low),
        new(Cranedance, CampGround.Bog, CampStrength.Weak, CampLevelSkew.Low),
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
