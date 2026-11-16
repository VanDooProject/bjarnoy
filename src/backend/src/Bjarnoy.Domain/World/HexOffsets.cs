using System.Collections.Concurrent;

namespace Bjarnoy.Domain.World;

/// <summary>An axial hex offset and its euclidean length (<see cref="HexCoord.EuclideanDistance"/>) in hexes.</summary>
public readonly record struct HexOffset(HexCoord Offset, double Distance);

/// <summary>
/// The hex offsets within a euclidean radius of a hex — the straight-line discs the fog margins are measured in
/// (<c>docs/design/map-fog-v2.md</c> §1h). Computed once per radius and shared.
/// </summary>
public static class HexOffsets
{
    /// <summary>
    /// Upper bound on step count per unit of euclidean hex distance (2/√3): a hex at euclidean distance d is at most
    /// ceil(d · this) steps (<see cref="HexCoord.Distance"/>) away.
    /// </summary>
    public const double StepsPerEuclideanUnit = 1.1547005383792517;

    private static readonly ConcurrentDictionary<double, HexOffset[]> Cache = new();

    /// <summary>The step radius (<see cref="HexCoord.WithinRadius"/>) that covers every offset within euclidean <paramref name="radius"/>.</summary>
    public static int ReachSteps(double radius)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(radius);
        return (int)Math.Ceiling(radius * StepsPerEuclideanUnit);
    }

    /// <summary>
    /// Every offset (the origin, distance 0, included) whose euclidean length is at most <paramref name="radius"/>, nearest first
    /// (ties in axial order). The returned list is shared and must not be modified.
    /// </summary>
    public static IReadOnlyList<HexOffset> Within(double radius)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(radius);
        return Cache.GetOrAdd(radius, Build);
    }

    private static HexOffset[] Build(double radius) =>
    [
        .. HexCoord.Origin.WithinRadius(ReachSteps(radius))
            .Select(o => new HexOffset(o, HexCoord.EuclideanDistance(o, HexCoord.Origin)))
            .Where(o => o.Distance <= radius)
            .OrderBy(o => o.Distance)
            .ThenBy(o => o.Offset.Q)
            .ThenBy(o => o.Offset.R),
    ];
}
