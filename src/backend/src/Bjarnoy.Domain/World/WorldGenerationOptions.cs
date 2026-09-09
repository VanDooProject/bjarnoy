namespace Bjarnoy.Domain.World;

/// <summary>
/// Everything that turns a seed into a world. Persisted alongside the world so a
/// map stays reproducible even if the defaults change in a later release.
/// </summary>
public sealed record WorldGenerationOptions
{
    /// <summary>Seed for every hash in the generator. Same seed, same world.</summary>
    public required int Seed { get; init; }

    /// <summary>
    /// Radius of the generated sea, in hexes from the origin. The number of hexes
    /// is <c>3r(r+1)+1</c>, so a radius of 90 is ~25k hexes. Raised alongside
    /// <see cref="IslandMinRadius"/>/<see cref="IslandMaxRadius"/> so a bigger
    /// default world still has room for several islands rather than one or two
    /// dominating the whole sea.
    /// </summary>
    public int Radius { get; init; } = 90;

    /// <summary>
    /// Edge length, in offset columns/rows, of the grid cell each island is seeded
    /// in. Larger cells mean fewer, further-apart islands. Scaled up alongside
    /// <see cref="IslandMinRadius"/>/<see cref="IslandMaxRadius"/> so bigger
    /// islands keep roughly the same overlap/spacing ratio the smaller ones had.
    /// </summary>
    public int IslandCellSize { get; init; } = 20;

    /// <summary>Probability that a given cell holds an island at all.</summary>
    public double IslandChance { get; init; } = 0.45;

    /// <summary>
    /// Doubled from the original 2.4/5.6 pair: most islands were coming out too
    /// small to reliably grow a qualifying (2+ tile) mountain cluster, which is
    /// the only thing that gives an island a river — bigger islands mean more
    /// inland area for mountains to form in, and therefore more islands with
    /// rivers, without changing the river algorithm itself.
    /// </summary>
    public double IslandMinRadius { get; init; } = 4.8;

    public double IslandMaxRadius { get; init; } = 11.2;

    /// <summary>
    /// Fraction of an island's radius, measured from its centre, beyond which
    /// land becomes beach. The coastal ring the settlers land on.
    /// </summary>
    public double BeachThreshold { get; init; } = 0.82;

    /// <summary>
    /// Fraction of an island's radius within which terrain is allowed to rise to
    /// mountain, so ridges form inland rather than on the coast.
    /// </summary>
    public double MountainThreshold { get; init; } = 0.4;

    /// <summary>Rockiness above which an inland hex becomes mountain.</summary>
    public double MountainRockiness { get; init; } = 0.72;

    /// <summary>Rockiness above which a lowland hex is forest rather than grass.</summary>
    public double ForestRockiness { get; init; } = 0.52;

    /// <summary>
    /// Landmasses smaller than this are noise rather than islands: they are
    /// discovered by the flood fill but not recorded or offered as start ground.
    /// </summary>
    public int MinimumIslandTiles { get; init; } = 6;

    /// <summary>
    /// A traced river shorter than this (in tiles, spring to mouth inclusive)
    /// is discarded rather than rendered. See <c>docs/design/river-generation.md</c>.
    /// </summary>
    public int MinRiverLength { get; init; } = 2;

    /// <summary>
    /// How much a river's path wanders sideways instead of taking the
    /// steepest descent to the coast at every step: 0 is a straight radial
    /// line, larger values meander more. See <c>docs/design/river-generation.md</c>.
    /// </summary>
    public double RiverMeanderWeight { get; init; } = 0.35;

    /// <summary>
    /// Subtracted from a candidate step's score when it would turn 120° off
    /// straight-ahead (a <see cref="RiverTileShape.Bend60"/> tile) rather than
    /// continue straight or take the gentler 60°-off <see cref="RiverTileShape.Bend"/>
    /// turn — legal since the vendor art pack ships a dedicated
    /// <c>rivertile_bend60_*</c> family, but still biased to be rarer than the
    /// two gentler shapes, the way real river meanders favour a shallow turn
    /// over a sharp one. See <c>docs/design/river-generation.md</c>.
    /// </summary>
    public double SharpBendPenalty { get; init; } = 0.5;

    public static WorldGenerationOptions ForSeed(int seed) => new() { Seed = seed };

    /// <summary>
    /// Validates the options as a set. Called before generation so a bad world
    /// fails at creation rather than halfway through a map.
    /// </summary>
    public void Validate()
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(Radius, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(Radius, 1000);
        ArgumentOutOfRangeException.ThrowIfLessThan(IslandCellSize, 2);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(IslandChance);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandChance, 1.0);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(IslandMinRadius);
        ArgumentOutOfRangeException.ThrowIfLessThan(IslandMaxRadius, IslandMinRadius);
        ArgumentOutOfRangeException.ThrowIfNegative(MinimumIslandTiles);
        ArgumentOutOfRangeException.ThrowIfLessThan(MinRiverLength, 2);
        ArgumentOutOfRangeException.ThrowIfNegative(RiverMeanderWeight);
        ArgumentOutOfRangeException.ThrowIfNegative(SharpBendPenalty);

        if (MountainThreshold >= BeachThreshold)
        {
            throw new ArgumentException(
                $"{nameof(MountainThreshold)} ({MountainThreshold}) must be inside " +
                $"{nameof(BeachThreshold)} ({BeachThreshold}); otherwise mountains would form on the coast.",
                nameof(MountainThreshold));
        }
    }
}
