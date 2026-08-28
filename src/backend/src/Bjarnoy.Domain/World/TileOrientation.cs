namespace Bjarnoy.Domain.World;

/// <summary>
/// Which of the tile art pack's six camera rotations a hex renders with. The
/// values line up 1:1 with <see cref="HexCoord.Directions"/> by index (0=E,
/// 1=NE, 2=NW, 3=W, 4=SW, 5=SE), so a direction index can be cast straight to
/// an orientation.
/// </summary>
/// <remarks>
/// The rest of the game reads every tile via the same <c>_SE</c> art
/// regardless of its neighbours (<c>src/frontend/src/lib/map/textures.ts</c>).
/// This is the type that lets that change per hex once the renderer picks it
/// up: today's contract only carries what's computed here.
/// </remarks>
public enum TileOrientation
{
    E = 0,
    NE = 1,
    NW = 2,
    W = 3,
    SW = 4,
    SE = 5,
}

public static class TileOrientationExtensions
{
    /// <summary>The wire name for an orientation, matching the asset pack's own suffixes.</summary>
    public static string ToWireName(this TileOrientation orientation) => orientation switch
    {
        TileOrientation.E => "E",
        TileOrientation.NE => "NE",
        TileOrientation.NW => "NW",
        TileOrientation.W => "W",
        TileOrientation.SW => "SW",
        TileOrientation.SE => "SE",
        _ => throw new ArgumentOutOfRangeException(nameof(orientation), orientation, "Unknown orientation"),
    };
}
