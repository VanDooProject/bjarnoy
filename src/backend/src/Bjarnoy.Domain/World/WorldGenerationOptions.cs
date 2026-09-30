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
    /// is <c>3r(r+1)+1</c>, so the default 4000 is ~48M hexes. Terrain is never
    /// enumerated hex by hex at this size: <see cref="WorldGenerator"/> walks the
    /// island cells instead. An island that could cross this radius is not
    /// generated at all (see <see cref="TerrainSampler"/>), so the world edge
    /// never cuts an island in half.
    /// </summary>
    public int Radius { get; init; } = 4000;

    /// <summary>
    /// Edge length, in offset columns/rows, of the grid cell each island is seeded
    /// in. Larger cells mean fewer, further-apart islands. Also the hard reach
    /// budget of every island: an island's land never leaves the 3x3 block of
    /// cells around its own, so an island is shrunk (never cut) to fit.
    /// </summary>
    public int IslandCellSize { get; init; } = 260;

    /// <summary>Probability that a given cell holds an island at all.</summary>
    public double IslandChance { get; init; } = 0.8;

    /// <summary>
    /// Smallest and largest half-width, in hexes, of a class-B island's body
    /// (the width at the middle of its spine, before the per-vertex jitter and
    /// the class scale). A-class islands use <see cref="IslandShapeConstants.SmallScale"/>
    /// of it, C-class <see cref="IslandShapeConstants.LargeScale"/>.
    /// </summary>
    public double IslandMinWidth { get; init; } = 21.0;

    public double IslandMaxWidth { get; init; } = 40.0;

    /// <summary>How many spine vertices (min/max) an island's spine is walked through.</summary>
    public int IslandMinSegments { get; init; } = 5;

    public int IslandMaxSegments { get; init; } = 9;

    /// <summary>
    /// Total spine length (min/max), as a multiple of the island's half-width.
    /// Large values give long crescents and bent fjord islands.
    /// </summary>
    public double IslandMinElongation { get; init; } = 5.0;

    public double IslandMaxElongation { get; init; } = 8.0;

    /// <summary>
    /// Per-step bend of the spine as the tangent of the half turn angle
    /// (min/max; the sign is random per island). 0 is straight, 0.35 is a
    /// tight C.
    /// </summary>
    public double IslandMinBend { get; init; } = 0.12;

    public double IslandMaxBend { get; init; } = 0.35;

    /// <summary>
    /// Amplitude, in hexes, of the large-scale domain warp applied to the
    /// sample point before distance is measured: the fjords, bays and
    /// headlands. 0 disables it. See also <see cref="IslandShapeConstants.Warp2"/>,
    /// the fine second octave.
    /// </summary>
    public double IslandCoastWarp { get; init; } = 9.5;

    /// <summary>Wavelength, in hexes, of the coastline warp's underlying noise field.</summary>
    public double IslandCoastWarpScale { get; init; } = 42.0;

    /// <summary>
    /// Amplitude of the depth noise added to the normalised distance (in units of
    /// island half-width): the roughness of the shoreline itself. Three octaves,
    /// see <see cref="IslandShapeConstants"/>.
    /// </summary>
    public double IslandCoastNoise { get; init; } = 1.0;

    /// <summary>Wavelength, in hexes, of the coarsest depth-noise octave.</summary>
    public double IslandCoastNoiseScale { get; init; } = 49.0;

    /// <summary>Probability that an island cell holds a small (A) island rather than a B.</summary>
    public double IslandSmallShare { get; init; } = 0.3;

    /// <summary>
    /// Probability that an island cell holds a large (C) island. A large island
    /// clears the cells around it, so this is also the share of the map given
    /// to open sea around the big ones.
    /// </summary>
    public double IslandLargeShare { get; init; } = 0.12;

    /// <summary>
    /// Fraction of an island's radius, measured from its centre, beyond which
    /// land becomes beach. The coastal ring the settlers land on.
    /// </summary>
    public double BeachThreshold { get; init; } = 0.9;

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
    /// Land tiles an island needs per river spring: an island gets
    /// <c>round(land / RiverTilesPerSpring)</c> springs, at least 1 and at most
    /// <see cref="MaxSpringsPerIsland"/>. See <c>docs/design/river-generation.md</c>.
    /// </summary>
    public int RiverTilesPerSpring { get; init; } = 500;

    /// <summary>Most springs (and so rivers) one island gets.</summary>
    public int MaxSpringsPerIsland { get; init; } = 24;

    /// <summary>Springs are picked farthest-first; picking stops once the best is closer than this (hexes) to a chosen one.</summary>
    public int MinSpringSpacing { get; init; } = 8;

    /// <summary>
    /// Land tiles an island needs per river outlet (a mouth the whole drainage network of that
    /// part of the island runs to): <c>round(land / OutletTilesPer)</c>, at least 1, at most
    /// <see cref="MaxOutlets"/>.
    /// </summary>
    public int OutletTilesPer { get; init; } = 2000;

    /// <summary>Most outlets one island gets.</summary>
    public int MaxOutlets { get; init; } = 12;

    /// <summary>Outlets are picked farthest-first among bays; picking stops once the best is closer than this (hexes) to a chosen one.</summary>
    public int MinOutletSpacing { get; init; } = 25;

    /// <summary>Weight of the per-tile noise in a drainage step's cost (<c>1 + DrainageNoise * noise</c>): larger meanders the network more.</summary>
    public double DrainageNoise { get; init; } = 1.5;

    /// <summary>Weight of the smooth valley noise (wavelength <see cref="ValleyScale"/>) in a drainage step's cost: coherent valleys make rivers bend and wander.</summary>
    public double ValleyNoise { get; init; } = 6.0;

    /// <summary>Wavelength in hexes of the valley noise.</summary>
    public double ValleyScale { get; init; } = 4.0;

    /// <summary>Extra drainage cost of a mountain tile: rivers go round ranges rather than across them.</summary>
    public double MountainCost { get; init; } = 2.0;

    /// <summary>Drainage cost of a 60 degree turn (a Bend tile).</summary>
    public double BendCost { get; init; } = 0.03;

    /// <summary>Drainage cost of a 120 degree turn (a Bend60 tile).</summary>
    public double SharpBendCost { get; init; } = 1.0;

    /// <summary>
    /// How much longer (in drainage cost) a tributary's way via a drawable junction with an earlier river may be than
    /// running to an outlet on its own and still be taken: larger merges more eagerly.
    /// </summary>
    public double MergeSlack { get; init; } = 6.0;

    /// <summary>Drainage cost within which a tributary looks for a trunk to join (about 1.4 per hex).</summary>
    public double MergeReach { get; init; } = 20.0;

    /// <summary>Drainage cost a junction search takes off a wide-Y junction into a river-width trunk (a stream joining there needs no widening first).</summary>
    public double RiverStreamBonus { get; init; } = 3.0;

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
    /// A scaled-down archipelago — islands of roughly 5-40 hexes across on a 90-hex
    /// cell grid — for tests, previews and small dev worlds. Same algorithm and
    /// shape as the production-scale default, just smaller, so a world of radius
    /// 120-200 already holds a handful of islands with mountains and rivers.
    /// </summary>
    public static WorldGenerationOptions Compact(int seed, int radius = 150) => new()
    {
        Seed = seed,
        Radius = radius,
        IslandCellSize = 90,
        IslandMinWidth = 8.0,
        IslandMaxWidth = 14.0,
        IslandMinSegments = 3,
        IslandMaxSegments = 5,
        IslandMinElongation = 2.0,
        IslandMaxElongation = 4.0,
        IslandCoastWarp = 3.0,
        IslandCoastWarpScale = 14.0,
        IslandCoastNoise = 0.6,
        IslandCoastNoiseScale = 16.0,
    };

    /// <summary>
    /// Validates the options as a set. Called before generation so a bad world
    /// fails at creation rather than halfway through a map.
    /// </summary>
    public void Validate()
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(Radius, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(Radius, MaxRadius);
        ArgumentOutOfRangeException.ThrowIfLessThan(IslandCellSize, 16);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandCellSize, 4096);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(IslandChance);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandChance, 1.0);
        ArgumentOutOfRangeException.ThrowIfNegative(MinimumIslandTiles);
        ArgumentOutOfRangeException.ThrowIfLessThan(MinRiverLength, 2);
        ArgumentOutOfRangeException.ThrowIfNegative(RiverMeanderWeight);
        ArgumentOutOfRangeException.ThrowIfLessThan(RiverTilesPerSpring, 1);
        ArgumentOutOfRangeException.ThrowIfLessThan(MaxSpringsPerIsland, 1);
        ArgumentOutOfRangeException.ThrowIfNegative(MinSpringSpacing);
        ArgumentOutOfRangeException.ThrowIfLessThan(OutletTilesPer, 1);
        ArgumentOutOfRangeException.ThrowIfLessThan(MaxOutlets, 1);
        ArgumentOutOfRangeException.ThrowIfNegative(MinOutletSpacing);
        ArgumentOutOfRangeException.ThrowIfNegative(DrainageNoise);
        ArgumentOutOfRangeException.ThrowIfNegative(ValleyNoise);
        ArgumentOutOfRangeException.ThrowIfLessThan(ValleyScale, 1.0);
        ArgumentOutOfRangeException.ThrowIfNegative(MountainCost);
        ArgumentOutOfRangeException.ThrowIfNegative(BendCost);
        ArgumentOutOfRangeException.ThrowIfNegative(SharpBendCost);
        ArgumentOutOfRangeException.ThrowIfNegative(MergeSlack);
        ArgumentOutOfRangeException.ThrowIfNegative(MergeReach);
        ArgumentOutOfRangeException.ThrowIfNegative(RiverStreamBonus);
        ArgumentOutOfRangeException.ThrowIfNegative(SharpBendPenalty);

        ArgumentOutOfRangeException.ThrowIfLessThan(IslandMinWidth, 2.0);
        ArgumentOutOfRangeException.ThrowIfLessThan(IslandMaxWidth, IslandMinWidth);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandMaxWidth, 200.0);
        ArgumentOutOfRangeException.ThrowIfLessThan(IslandMinSegments, 1);
        ArgumentOutOfRangeException.ThrowIfLessThan(IslandMaxSegments, IslandMinSegments);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandMaxSegments, 24);
        ArgumentOutOfRangeException.ThrowIfNegative(IslandMinElongation);
        ArgumentOutOfRangeException.ThrowIfLessThan(IslandMaxElongation, IslandMinElongation);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandMaxElongation, 20.0);
        ArgumentOutOfRangeException.ThrowIfNegative(IslandMinBend);
        ArgumentOutOfRangeException.ThrowIfLessThan(IslandMaxBend, IslandMinBend);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandMaxBend, 1.0);
        ArgumentOutOfRangeException.ThrowIfNegative(IslandCoastWarp);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandCoastWarp, 60.0);
        ArgumentOutOfRangeException.ThrowIfLessThan(IslandCoastWarpScale, 2.0);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandCoastWarpScale, 400.0);
        ArgumentOutOfRangeException.ThrowIfNegative(IslandCoastNoise);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandCoastNoise, 3.0);
        ArgumentOutOfRangeException.ThrowIfLessThan(IslandCoastNoiseScale, 2.0);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandCoastNoiseScale, 400.0);
        ArgumentOutOfRangeException.ThrowIfNegative(IslandSmallShare);
        ArgumentOutOfRangeException.ThrowIfNegative(IslandLargeShare);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandSmallShare + IslandLargeShare, 1.0);

        if (MountainThreshold >= BeachThreshold)
        {
            throw new ArgumentException(
                $"{nameof(MountainThreshold)} ({MountainThreshold}) must be inside " +
                $"{nameof(BeachThreshold)} ({BeachThreshold}); otherwise mountains would form on the coast.",
                nameof(MountainThreshold));
        }

        // Keeps the two-octave coastline warp a diffeomorphism (max gradient
        // 1.5/scale per axis and octave, the sum staying below 1) so it can never
        // fold the sample space onto itself and detach a sliver of land from its
        // island.
        var warpGradient = 1.5 * ((IslandCoastWarp / IslandCoastWarpScale)
            + (IslandShapeConstants.Warp2 / IslandShapeConstants.WarpScale2));
        if (warpGradient >= 1.0)
        {
            throw new ArgumentException(
                $"{nameof(IslandCoastWarp)} ({IslandCoastWarp}) is too large relative to " +
                $"{nameof(IslandCoastWarpScale)} ({IslandCoastWarpScale}); with the fine warp octave it could " +
                "tear the coastline apart.",
                nameof(IslandCoastWarp));
        }

        // The reach clamp shrinks every island to (1.5 - jitter/2) cells minus the warps;
        // a cell too small for the warps alone has no room for any island.
        if (IslandShapeConstants.ReachBudget(IslandCellSize, IslandCoastWarp) <= 0.0)
        {
            throw new ArgumentException(
                $"{nameof(IslandCellSize)} ({IslandCellSize}) is too small for the coastline warp " +
                $"({nameof(IslandCoastWarp)} {IslandCoastWarp}).",
                nameof(IslandCellSize));
        }
    }

    /// <summary>The largest <see cref="Radius"/> <see cref="Validate"/> accepts.</summary>
    public const int MaxRadius = 5000;
}
