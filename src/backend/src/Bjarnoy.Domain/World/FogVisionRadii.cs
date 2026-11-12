namespace Bjarnoy.Domain.World;

/// <summary>
/// Server-side port of the fog vision-radius formulas the frontend computes
/// in <c>WorldModel.ts</c> (<c>borderRadius</c>/<c>visibleHexes</c>/
/// <c>exploredRadius</c>, <c>WorldModel.ts:361-380</c>) — needed so
/// <see cref="FogMaskGenerator"/> can build a settlement's
/// <see cref="FogVisionSource"/> without the client sending radii it
/// computed itself (per <c>docs/design/map-fog-v2.md</c> §2.3, the
/// generator's sources are backend-derived).
/// </summary>
/// <remarks>
/// Deliberately separate from <c>Settlement.ClaimRadius</c>
/// (<c>Bjarnoy.Domain/Buildings/Settlement.cs</c>) — that governs where a
/// settlement may place buildings, a different game rule with a different
/// formula (<c>1 + level/2</c>) that happens to use the same input. Fog
/// vision and building-claim radius are not guaranteed to move together;
/// keeping them as separate formulas here matches how the frontend already
/// treats them (its own <c>borderRadius</c> is unrelated to claim
/// placement) and avoids silently coupling one gameplay rule to another.
/// </remarks>
public static class FogVisionRadii
{
    /// <summary>Matches the frontend's <c>BASE_BORDER_RADIUS</c> (<c>WorldModel.ts:80</c>).</summary>
    public const int BaseBorderRadius = 2;

    /// <summary>Matches the frontend's <c>FOG_SCOUT_RING</c> (<c>WorldModel.ts:87</c>).</summary>
    public const int ScoutRingHexes = 3;

    /// <summary>
    /// The ramp value at which the client's fog mist is fully opaque (the point the edge noise has shut off). Mirrors the frontend's
    /// <c>FOG_MIST_OPAQUE_AT_RAMP</c> (<c>src/frontend/src/lib/map/fog/fogRamp.ts</c>); <c>FogVisionRadiiTests</c> pins the number.
    /// </summary>
    public const double MistOpaqueAtRamp = 0.8;

    /// <summary>
    /// How far past a settlement's or tower's <see cref="ExploredRadius"/> (straight-line distance) the ground is still visible
    /// through the mist: the unknown ramp's width times <see cref="MistOpaqueAtRamp"/> (11.2 hexes).
    /// </summary>
    public const double SourceMistOpaqueMargin = FogMaskOptions.DefaultUnknownMarginHexes * MistOpaqueAtRamp;

    /// <summary>Where a marching army's own white fog ramp starts, past its vision radius. Mirrors the frontend's <c>ARMY_FOG_WHITE_OFFSET</c> (<c>fogRamp.ts</c>).</summary>
    public const double ArmyFogWhiteOffsetHexes = 0.75;

    /// <summary>The army white ramp's width in hexes. Mirrors the frontend's <c>ARMY_FOG_WHITE_MARGIN</c> (<c>fogRamp.ts</c>).</summary>
    public const int ArmyFogWhiteMarginHexes = 6;

    /// <summary>
    /// How far past a marching army's vision radius (straight-line distance) the ground is still visible through the mist:
    /// <see cref="ArmyFogWhiteOffsetHexes"/> plus the white ramp's width times <see cref="MistOpaqueAtRamp"/> (5.55 hexes).
    /// </summary>
    public const double ArmyMistOpaqueMargin = ArmyFogWhiteOffsetHexes + (ArmyFogWhiteMarginHexes * MistOpaqueAtRamp);

    /// <summary>Slack for comparing a euclidean distance against the margins above (they are sums of binary fractions).</summary>
    public const double ReachEpsilon = 1e-9;

    /// <summary>
    /// The settlement's realm-border radius, in hexes. Mirrors the
    /// frontend's <c>borderRadius(settlement)</c>.
    /// </summary>
    public static int BorderRadius(int longhouseLevel)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(longhouseLevel);
        return BaseBorderRadius + (longhouseLevel / 2);
    }

    /// <summary>
    /// Radius currently in line of sight — the fog mask's G (out-of-sight)
    /// ring boundary. Mirrors the frontend's <c>visibleHexes</c> radius
    /// (<c>borderRadius(settlement) + 1</c>).
    /// </summary>
    public static int VisibleRadius(int longhouseLevel) => BorderRadius(longhouseLevel) + 1;

    /// <summary>
    /// Radius that counts as scouted/explored — the fog mask's R (unknown)
    /// ring boundary. Mirrors the frontend's <c>exploredRadius(settlement)</c>
    /// (<c>borderRadius(settlement) + FOG_SCOUT_RING</c>).
    /// </summary>
    public static int ExploredRadius(int longhouseLevel) => BorderRadius(longhouseLevel) + ScoutRingHexes;

    /// <summary>
    /// Builds the <see cref="FogVisionSource"/> a settlement's centre contributes to the
    /// mask, or <see langword="null"/> when it has none: a settlement whose Longhouse is destroyed (level 0) sees nothing
    /// around its centre. That is decided by the same <see cref="Buildings.Settlement.CentreDisc"/> that decides whether
    /// it has a claim, so sight and claim cannot drift apart. <paramref name="bonusRings"/> is Odin's Ravens
    /// (<see cref="Buildings.Settlement.VisionBonusRings"/>): extra rings on both the explored and the visible radius.
    /// A beach camp (<paramref name="isBeachCamp"/>) sees like a level-1 Longhouse, fixed: it has no Longhouse level of its own.
    /// </summary>
    public static FogVisionSource? ToVisionSource(HexCoord coord, int longhouseLevel, int bonusRings = 0, bool isBeachCamp = false)
    {
        var level = isBeachCamp ? BeachCampSightLevel : longhouseLevel;
        return Buildings.Settlement.LonghouseDisc(coord, level) is null
            ? null
            : new FogVisionSource(
                coord,
                ExploredRadius(level) + Math.Max(0, bonusRings),
                VisibleRadius(level) + Math.Max(0, bonusRings));
    }

    /// <summary>The Longhouse level a beach camp sees like (explored and visible radius), whatever it is.</summary>
    public const int BeachCampSightLevel = 1;

    /// <summary>
    /// A single standing <see cref="Buildings.BuildingType.Tower"/>'s own
    /// satellite border radius, centred on that tower's own hex rather than
    /// the settlement centre — the fog-vision analogue of
    /// <see cref="Buildings.Settlement.TowerClaimRadius"/>, kept as its own
    /// formula rather than reading that one directly (see this class's own
    /// remarks on why fog vision and building-claim radius are deliberately
    /// separate). One hex of reach per tower level, starting at level 1, with
    /// no "+1" floor: a non-positive level (no tower, or a level-0 foundation
    /// stub) contributes nothing.
    /// </summary>
    public static int TowerBorderRadius(int towerLevel) => Math.Max(0, towerLevel);

    /// <summary>A tower's own line-of-sight reach — mirrors <see cref="VisibleRadius"/>.</summary>
    public static int TowerVisibleRadius(int towerLevel) => TowerBorderRadius(towerLevel) + 1;

    /// <summary>A tower's own scouted/explored reach — mirrors <see cref="ExploredRadius"/>.</summary>
    public static int TowerExploredRadius(int towerLevel) => TowerBorderRadius(towerLevel) + ScoutRingHexes;

    /// <summary>
    /// Builds the <see cref="FogVisionSource"/> a single standing Tower
    /// contributes to the mask, centred on the tower's own hex — every
    /// standing Tower adds one of these alongside the settlement's own
    /// <see cref="ToVisionSource"/>, the same way <see cref="Buildings.Settlement.ClaimDiscsFor"/>
    /// adds one satellite claim disc per Tower alongside the centre disc.
    /// </summary>
    public static FogVisionSource ToTowerVisionSource(HexCoord coord, int towerLevel, int bonusRings = 0) =>
        new(
            coord,
            TowerExploredRadius(towerLevel) + Math.Max(0, bonusRings),
            TowerVisibleRadius(towerLevel) + Math.Max(0, bonusRings));

    /// <summary>
    /// How far around its current hex a travelling army sees, and so how far its walked ground counts as "permanently explored"
    /// (§1e's "Growth" trigger for <c>PersistedExploredBitset</c>): the highest <see cref="Units.UnitDefinition.VisionRadius"/> among the
    /// unit types actually in it (count above zero), plus <paramref name="bonusRings"/> from the Odin Statue's Ravens of its home settlement.
    /// The one place this is computed: the live disc, the walked-ground reveal and the army contract's <c>visionRadius</c> (which the
    /// client's live fog layer draws) all read it. An army without any unit sees only the Ravens' rings.
    /// </summary>
    public static int ArmyVisionRadius(IEnumerable<Units.UnitStack> stacks, int bonusRings = 0)
    {
        ArgumentNullException.ThrowIfNull(stacks);

        return stacks.Where(s => s.Count > 0).Select(s => Units.UnitCatalogue.Get(s.Type).VisionRadius).DefaultIfEmpty(0).Max()
            + Math.Max(0, bonusRings);
    }
}
