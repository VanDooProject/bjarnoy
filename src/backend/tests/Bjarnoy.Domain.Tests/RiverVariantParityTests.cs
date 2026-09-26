using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Locks <see cref="TerrainSampler.RiverVariantAt"/> to the frontend's
/// mirroring <c>riverVariantAt</c> (<c>src/frontend/src/lib/map/worldGenerator.ts</c>),
/// the same way <see cref="TerrainSamplerParityTests"/> locks <c>TerrainAt</c>.
/// </summary>
/// <remarks>
/// The expected variants below were confirmed by running both
/// implementations side by side over this same fixture set and diffing
/// their output — they agreed on every case before this test existed.
/// Regenerate them from the TypeScript (never from this code) if either
/// implementation's salt or weights are intentionally changed.
/// </remarks>
public class RiverVariantParityTests
{
    public static TheoryData<int, int, int, RiverTileShape, RiverVariant> FrontendVariants => new()
    {
        { 1, 0, 0, RiverTileShape.Straight, RiverVariant.Plain },
        { 1, 3, -2, RiverTileShape.Straight, RiverVariant.Island },
        { 1, -5, 4, RiverTileShape.Bend, RiverVariant.Meander },
        { 1, 10, 10, RiverTileShape.Bend60, RiverVariant.Plain },
        { 12345, 0, 0, RiverTileShape.Straight, RiverVariant.Plain },
        { 12345, 7, -3, RiverTileShape.Bend, RiverVariant.Meander },
        { 12345, -8, 2, RiverTileShape.Bend60, RiverVariant.Plain },
        { 12345, 100, -50, RiverTileShape.Straight, RiverVariant.Meander },
        { 777, 1, 1, RiverTileShape.Straight, RiverVariant.Meander },
        { 777, 2, -2, RiverTileShape.Bend, RiverVariant.Plain },
        { 777, -3, 3, RiverTileShape.Bend60, RiverVariant.Plain },
        { 777, 20, 20, RiverTileShape.Bend60, RiverVariant.Plain },
        { 777, -20, -20, RiverTileShape.Bend, RiverVariant.Meander },
        { 999999, 0, 0, RiverTileShape.Straight, RiverVariant.Plain },
        { 999999, 5, 5, RiverTileShape.Bend, RiverVariant.Meander },
        { 999999, -5, -5, RiverTileShape.Bend60, RiverVariant.Loop },
        { 1, 0, 0, RiverTileShape.Spring, RiverVariant.Plain },
        { 1, 0, 0, RiverTileShape.Confluence, RiverVariant.Plain },
        { 1, 0, 0, RiverTileShape.Mouth, RiverVariant.Plain },
    };

    [Theory]
    [MemberData(nameof(FrontendVariants))]
    public void RiverVariantAt_matches_the_frontend_generator(
        int seed, int q, int r, RiverTileShape shape, RiverVariant expected)
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(seed));
        Assert.Equal(expected, sampler.RiverVariantAt(new HexCoord(q, r), shape));
    }

    [Fact]
    public void Weights_land_close_to_their_targets_over_many_hexes()
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(2026));
        var straightCounts = new Dictionary<RiverVariant, int>();
        var bend60Counts = new Dictionary<RiverVariant, int>();
        const int extent = 120;
        var total = 0;

        for (var q = -extent; q <= extent; q++)
        {
            for (var r = -extent; r <= extent; r++)
            {
                total++;
                var straight = sampler.RiverVariantAt(new HexCoord(q, r), RiverTileShape.Straight);
                straightCounts[straight] = straightCounts.GetValueOrDefault(straight) + 1;
                var bend60 = sampler.RiverVariantAt(new HexCoord(q, r), RiverTileShape.Bend60);
                bend60Counts[bend60] = bend60Counts.GetValueOrDefault(bend60) + 1;
            }
        }

        // Loose bounds (a statistical sanity check, not an exact weight
        // assertion) — 40/40/20 for Straight, 85/15 for Bend60.
        Assert.InRange(straightCounts.GetValueOrDefault(RiverVariant.Plain) / (double)total, 0.35, 0.45);
        Assert.InRange(straightCounts.GetValueOrDefault(RiverVariant.Meander) / (double)total, 0.35, 0.45);
        Assert.InRange(straightCounts.GetValueOrDefault(RiverVariant.Island) / (double)total, 0.15, 0.25);
        Assert.InRange(bend60Counts.GetValueOrDefault(RiverVariant.Plain) / (double)total, 0.80, 0.90);
        Assert.InRange(bend60Counts.GetValueOrDefault(RiverVariant.Loop) / (double)total, 0.10, 0.20);
    }
}
