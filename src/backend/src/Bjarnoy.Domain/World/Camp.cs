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

    /// <summary>Plain bog moss (not a lake, shore, mouth or creek); the family is picked by hash among moosemire, beaverlodge and cranedance.</summary>
    Bog,

    /// <summary>
    /// Open sea, far from any shore: a water camp (<see cref="CampGenerator.PlaceWhaleRoads"/>). It holds no land,
    /// has no guard range and is met by fleets only. Appended last so every earlier value keeps its number.
    /// </summary>
    Sea,
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

    /// <summary>The whale road (3D_assets hextile134): the first water camp, a humpback cow and calf on open sea.</summary>
    public const string Whaleroad = "whaleroad";

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
        // The first water camp, last so no land family's candidate hash moves (it is placed by its own
        // sea pass, CampGenerator.PlaceWhaleRoads, never by PlaceCore).
        new(Whaleroad, CampGround.Sea, CampStrength.Strong, CampLevelSkew.Cubic),
    ];

    public static CampFamilyInfo? Find(string family) => All.FirstOrDefault(f => f.Family == family);

    /// <summary>True for a strong family. An unknown family is not strong.</summary>
    public static bool IsStrong(string family) => Find(family)?.Strength == CampStrength.Strong;

    /// <summary>True for a water camp (a family on <see cref="CampGround.Sea"/>). An unknown family is not.</summary>
    public static bool IsWater(string family) => Find(family)?.Ground == CampGround.Sea;
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

    /// <summary>True for a water camp (it stands on open sea and is met by fleets).</summary>
    public bool IsWater => CampFamilies.IsWater(Family);

    /// <summary>
    /// How many hexes around the camp it guards — see <see cref="CampGenerator.GuardRange(int, CampStrength)"/>.
    /// A water camp holds no land and locks no towers: its range is 0, which for a fleet's route means "the camp's own hex".
    /// </summary>
    public int GuardRange => IsWater ? 0 : CampGenerator.GuardRange(Level, Strong ? CampStrength.Strong : CampStrength.Weak);
}
