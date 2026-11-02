using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Regression coverage for sand deep inside islands. Every hex past <see cref="WorldGenerationOptions.BeachThreshold"/>
/// used to be sand, but the domain warp and the coast noise leave interior "saddles" where the depth climbs close to 1
/// without the coast opening there, so beach bands showed up a dozen hexes from any sea (seed 20260824 around
/// (-220, -24)). Sand now also needs open sea within <see cref="TerrainSampler.BeachSeaRadius"/> hexes, on green and
/// wasted islands alike. Mirrors the frontend's <c>shoreSand.test.ts</c>; parity of the rule itself is covered by the
/// shared terrain-checksum and island-shape goldens.
/// </summary>
public class ShoreSandTests
{
    private static bool SeaWithin(HexCoord coord, int radius, Func<HexCoord, bool> isSea) =>
        coord.WithinRadius(radius).Any(c => c != coord && isSea(c));

    [Theory]
    [InlineData(-220, -24)]
    [InlineData(-219, -24)]
    [InlineData(-219, -23)]
    public void An_inland_saddle_past_the_beach_threshold_is_not_sand(int q, int r)
    {
        var options = WorldGenerationOptions.ForSeed(20260824);
        var sampler = new TerrainSampler(options);
        var coord = new HexCoord(q, r);

        Assert.True(sampler.IslandDepthAt(coord) > options.BeachThreshold);
        Assert.False(SeaWithin(coord, 12, c => sampler.IslandDepthAt(c) is null));
        Assert.NotEqual(Terrain.Sand, sampler.TerrainAt(coord));
        Assert.NotEqual(Terrain.Sea, sampler.TerrainAt(coord));
    }

    [Fact]
    public void Every_sand_hex_is_within_the_beach_sea_radius_and_the_coast_stays_a_beach()
    {
        var options = WorldGenerationOptions.ForSeed(20260824);
        var sampler = new TerrainSampler(options);
        bool IsSea(HexCoord c) => sampler.IslandDepthAt(c) is null;

        var sand = 0;
        var saddles = 0;
        foreach (var coord in new HexCoord(-220, -24).WithinRadius(150))
        {
            var depth = sampler.IslandDepthAt(coord);
            if (depth is null)
            {
                continue;
            }

            var terrain = sampler.TerrainAt(coord);
            if (terrain == Terrain.Sand)
            {
                sand++;
                Assert.True(SeaWithin(coord, TerrainSampler.BeachSeaRadius, IsSea), $"sand at {coord}");
            }
            else if (depth > options.BeachThreshold)
            {
                saddles++;
                Assert.False(SeaWithin(coord, TerrainSampler.BeachSeaRadius, IsSea), $"no sand at {coord}");
            }

            // A shoreline hex past the threshold is still sand: the beach stays continuous.
            if (depth > options.BeachThreshold && coord.Neighbours().Any(IsSea))
            {
                Assert.Equal(Terrain.Sand, terrain);
            }
        }

        // The old rule made 1449 sand hexes here, 240 of them more than two hexes from the sea.
        Assert.Equal(1209, sand);
        Assert.Equal(240, saddles);
    }

    [Fact]
    public void Wasted_islands_follow_the_same_rule()
    {
        // Seed 1's wasted island around (260, -1691) has saddles of its own.
        var options = WorldGenerationOptions.ForSeed(1);
        var sampler = new TerrainSampler(options);
        bool IsSea(HexCoord c) => sampler.WastedDepthAt(c) is null;

        var sand = 0;
        var saddles = 0;
        foreach (var coord in new HexCoord(260, -1691).WithinRadius(75))
        {
            var terrain = sampler.WastedTerrainAt(coord);
            if (terrain == Terrain.Sea)
            {
                continue;
            }

            if (terrain == Terrain.Sand)
            {
                sand++;
                Assert.True(SeaWithin(coord, TerrainSampler.BeachSeaRadius, IsSea), $"sand at {coord}");
            }
            else if (sampler.WastedDepthAt(coord) > options.BeachThreshold)
            {
                saddles++;
            }
        }

        Assert.True(sand > 200, $"only {sand} wasted sand hexes");
        Assert.True(saddles > 0, "no wasted saddle hexes");
    }
}
