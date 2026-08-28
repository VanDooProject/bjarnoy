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
    /// is <c>3r(r+1)+1</c>, so a radius of 60 is ~11k hexes.
    /// </summary>
    public int Radius { get; init; } = 60;

    /// <summary>
    /// Edge length, in offset columns/rows, of the grid cell each island is seeded
    /// in. Larger cells mean fewer, further-apart islands.
    /// </summary>
    public int IslandCellSize { get; init; } = 9;

    /// <summary>Probability that a given cell holds an island at all.</summary>
    public double IslandChance { get; init; } = 0.45;

    public double IslandMinRadius { get; init; } = 2.4;

    public double IslandMaxRadius { get; init; } = 5.6;

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

        if (MountainThreshold >= BeachThreshold)
        {
            throw new ArgumentException(
                $"{nameof(MountainThreshold)} ({MountainThreshold}) must be inside " +
                $"{nameof(BeachThreshold)} ({BeachThreshold}); otherwise mountains would form on the coast.",
                nameof(MountainThreshold));
        }
    }
}
