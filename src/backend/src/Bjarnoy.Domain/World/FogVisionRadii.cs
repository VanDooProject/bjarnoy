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

    /// <summary>Builds the <see cref="FogVisionSource"/> a settlement contributes to the mask.</summary>
    public static FogVisionSource ToVisionSource(HexCoord coord, int longhouseLevel) =>
        new(coord, ExploredRadius(longhouseLevel), VisibleRadius(longhouseLevel));

    /// <summary>
    /// How far around a travelling army's current hex counts as "walked, now
    /// permanently explored" — §1e's "Growth" trigger for
    /// <c>PersistedExploredBitset</c>. Deliberately not a per-unit-type value:
    /// no unit anywhere in <c>UnitCatalogue</c> has a vision stat today, and
    /// §1c's real-time shader bonus (a separate, ephemeral thing — see
    /// <c>fogShader.ts</c>) uses the same flat radius, so there is only one
    /// number to tune rather than two that could quietly drift apart.
    /// </summary>
    public const int ArmyVisionRadiusHexes = 2;
}
