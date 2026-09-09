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
    /// Also the hard reach budget for the multi-lobe shape below: see
    /// <see cref="Validate"/> and <c>docs/design/river-generation.md</c>.
    /// </summary>
    public int IslandCellSize { get; init; } = 23;

    /// <summary>Probability that a given cell holds an island at all.</summary>
    public double IslandChance { get; init; } = 0.45;

    /// <summary>
    /// Raised alongside <see cref="IslandCellSize"/> to compensate for the
    /// multi-lobe shape (below) covering less area than a single disc of the
    /// same radius would — without this bump, elongated/bent islands would
    /// read as noticeably smaller than the round ones they replaced.
    /// </summary>
    public double IslandMinRadius { get; init; } = 5.5;

    public double IslandMaxRadius { get; init; } = 12.9;

    /// <summary>
    /// How many lobes (offset discs chained along a bending spine) an island's
    /// shape is built from. 1 lobe is exactly the old single-disc circle;
    /// 2-4 lobes is what turns the silhouette into an elongated, L- or
    /// U-like shape. See <c>docs/design/river-generation.md</c> for the full
    /// shape algorithm and the hash-offset registry.
    /// </summary>
    public int IslandMinLobes { get; init; } = 2;

    public int IslandMaxLobes { get; init; } = 4;

    /// <summary>
    /// Total spine length an island's lobe chain can stretch to, as a
    /// multiple of its envelope radius. 0 collapses every lobe onto the
    /// centre (back to a circle); 1.0 lets the chain reach out to roughly
    /// the island's own radius beyond the first lobe.
    /// </summary>
    public double IslandMaxElongation { get; init; } = 1.0;

    /// <summary>
    /// How sharply the lobe spine can turn from one segment to the next.
    /// 0 keeps the spine straight (elongated ovals); larger values let it
    /// curl into an L or, near the top of the range, a U/C shape.
    /// </summary>
    public double IslandBendiness { get; init; } = 1.6;

    /// <summary>
    /// Smooth-minimum blend factor applied where two lobes' depths meet, so
    /// the waist between them fills in rather than pinching to a hairline.
    /// 0 is a hard union (today's min-of-discs behaviour).
    /// </summary>
    public double IslandLobeBlend { get; init; } = 0.25;

    /// <summary>Smallest a non-primary lobe's radius can be, as a fraction of the envelope radius.</summary>
    public double IslandLobeMinScale { get; init; } = 0.55;

    /// <summary>Largest a non-primary lobe's radius can be, as a fraction of the envelope radius.</summary>
    public double IslandLobeMaxScale { get; init; } = 0.85;

    /// <summary>
    /// Amplitude, in hexes, of the domain warp applied to the sample point
    /// before measuring distance to a lobe — makes coastlines wobble instead
    /// of tracing perfect arcs. 0 disables the warp entirely.
    /// </summary>
    public double IslandCoastWarp { get; init; } = 1.5;

    /// <summary>Wavelength, in hexes, of the coastline warp's underlying noise field.</summary>
    public double IslandCoastWarpScale { get; init; } = 5.0;

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

        ArgumentOutOfRangeException.ThrowIfLessThan(IslandMinLobes, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandMinLobes, 5);
        ArgumentOutOfRangeException.ThrowIfLessThan(IslandMaxLobes, IslandMinLobes);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandMaxLobes, 5);
        ArgumentOutOfRangeException.ThrowIfNegative(IslandMaxElongation);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandMaxElongation, 1.5);
        ArgumentOutOfRangeException.ThrowIfNegative(IslandBendiness);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandBendiness, 3.0);
        ArgumentOutOfRangeException.ThrowIfNegative(IslandLobeBlend);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandLobeBlend, 0.5);
        ArgumentOutOfRangeException.ThrowIfLessThan(IslandLobeMinScale, 0.3);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandLobeMinScale, 1.0);
        ArgumentOutOfRangeException.ThrowIfLessThan(IslandLobeMaxScale, IslandLobeMinScale);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandLobeMaxScale, 1.0);
        ArgumentOutOfRangeException.ThrowIfNegative(IslandCoastWarp);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandCoastWarp, 4.0);
        ArgumentOutOfRangeException.ThrowIfLessThan(IslandCoastWarpScale, 2.0);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(IslandCoastWarpScale, 12.0);

        if (MountainThreshold >= BeachThreshold)
        {
            throw new ArgumentException(
                $"{nameof(MountainThreshold)} ({MountainThreshold}) must be inside " +
                $"{nameof(BeachThreshold)} ({BeachThreshold}); otherwise mountains would form on the coast.",
                nameof(MountainThreshold));
        }

        // Reach budget: an island's shape is only ever looked up by hexes in the
        // 3x3 block of cells around its own (jittered by up to 0.275*cellSize),
        // so the farthest any lobe/warp can put land from the island's cell
        // centre must stay inside that block. See docs/design/river-generation.md.
        var maxReach = IslandMaxRadius * (IslandMaxElongation + IslandLobeMaxScale) + IslandCoastWarp;
        var reachBudget = 1.225 * IslandCellSize;
        if (maxReach > reachBudget)
        {
            throw new ArgumentException(
                $"Island shape can reach {maxReach:0.##} hexes from its centre, which exceeds the " +
                $"{reachBudget:0.##}-hex budget the {nameof(IslandCellSize)} scan allows; raise " +
                $"{nameof(IslandCellSize)} or lower {nameof(IslandMaxRadius)}/{nameof(IslandMaxElongation)}/" +
                $"{nameof(IslandLobeMaxScale)}/{nameof(IslandCoastWarp)}.",
                nameof(IslandCellSize));
        }

        // Keeps the coastline warp a diffeomorphism (max gradient 1.5/scale per
        // axis, staying below 1) so it can never fold the sample space onto
        // itself and detach a sliver of land from its island.
        if (IslandCoastWarp * 1.5 >= IslandCoastWarpScale)
        {
            throw new ArgumentException(
                $"{nameof(IslandCoastWarp)} ({IslandCoastWarp}) is too large relative to " +
                $"{nameof(IslandCoastWarpScale)} ({IslandCoastWarpScale}); it could tear the coastline apart.",
                nameof(IslandCoastWarp));
        }
    }
}
