using Bjarnoy.Domain.Palisades;

namespace Bjarnoy.Domain.World;

/// <summary>Which of an Utgard's two wall rings a wall hex belongs to.</summary>
public enum UtgardRing
{
    Inner = 0,
    Outer = 1,
}

/// <summary>
/// One hex of an Utgard wall: the shared palisade piece it draws as (<see cref="PalisadeRules"/>), the camera file, whether it is a
/// gate, and its current level (2 full, 1 damaged, 0 breached rubble). A sea hex carrying the shore end is a wall too
/// (<see cref="PalisadePiece.EndCoast"/>).
/// </summary>
public readonly record struct UtgardWall(HexCoord Coord, UtgardRing Ring, PalisadePiece Piece, TileOrientation Dir, bool IsGate, int Level);

/// <summary>A Jötun watchtower on one hex; <paramref name="Orientation"/> is the tile's own orientation, like a giant's.</summary>
public readonly record struct JotunTower(HexCoord Coord, TileOrientation Orientation);

/// <summary>
/// Tuning constants of the endgame map (<c>docs/design/endgame.md</c>): wall rings and watchtowers. Mirrored by
/// <c>endgamePlacement.ts</c>; the golden <c>src/shared/endgame-placement-golden.json</c> pins both.
/// </summary>
public static class EndgameRules
{
    /// <summary>Hex distance of the inner ring from Utgard's anchor (two hexes clear of the 7-hex fortress).</summary>
    public const int InnerRingRadius = 3;

    /// <summary>Hex distance of the outer ring from Utgard's anchor.</summary>
    public const int OuterRingRadius = 6;

    /// <summary>A ring is built only when at least this share of its hexes can take a wall.</summary>
    public const double MinRingLandShare = 0.6;

    /// <summary>Gates per ring, on straight pieces as far apart as the ring allows.</summary>
    public const int GatesPerRing = 2;

    /// <summary>Inner ring walls stand at this level (also the ring's maximum).</summary>
    public const int InnerRingLevel = 2;

    /// <summary>Outer ring walls stand at this level (also the ring's maximum).</summary>
    public const int OuterRingLevel = 1;

    /// <summary>Land tiles per watchtower (<c>floor(land / TilesPerTower + 0.5)</c>).</summary>
    public const double TilesPerTower = 120.0;

    public const int MinTowers = 3;

    public const int MaxTowers = 6;

    /// <summary>Minimum hex distance between two towers, and between a tower and any Utgard footprint hex.</summary>
    public const int MinTowerSpacing = 5;

    /// <summary>
    /// The owner key of every Utgard wall in the movement rules' <c>PalisadeIndex</c>. A fixed key that belongs to no account and no
    /// guild, so a jötnar gate is never friendly to a player.
    /// </summary>
    public static readonly Guid JotnarOwnerKey = new("6a6f746e-6172-4a6f-8f74-6e6172776c6c");

    public static int RingRadius(UtgardRing ring) => ring == UtgardRing.Inner ? InnerRingRadius : OuterRingRadius;

    public static int RingLevel(UtgardRing ring) => ring == UtgardRing.Inner ? InnerRingLevel : OuterRingLevel;

    /// <summary>How many watchtowers an island of this many land tiles gets. <c>floor(x + 0.5)</c>, not banker's rounding, so TS can mirror it.</summary>
    public static int TowerCountFor(int landTiles) =>
        Math.Clamp((int)Math.Floor((landTiles / TilesPerTower) + 0.5), MinTowers, MaxTowers);
}
