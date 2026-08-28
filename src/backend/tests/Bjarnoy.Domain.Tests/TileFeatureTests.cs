using System.Security.Cryptography;
using System.Text;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Coastal-water detection, tile orientation and tile variant selection —
/// the "generation rules" from issue #24 that make every tile stop rendering
/// as the same fixed rotation.
/// </summary>
public class TileFeatureTests
{
    [Fact]
    public void Open_sea_is_never_coastal()
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(7));

        // Far outside any island's radius: guaranteed open sea with no land
        // neighbours at all.
        var coord = new HexCoord(1000, 1000);
        Assert.False(sampler.IsCoastalWater(coord));
    }

    [Fact]
    public void Land_is_never_coastal_water()
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(7));
        var coord = HexCoord.Origin;

        // Origin is always inside the (0,0) island cell's possible radius in
        // this generator's math, but what matters here is just the invariant:
        // whatever the terrain, land can't also count as coastal water.
        if (sampler.IsLand(coord))
        {
            Assert.False(sampler.IsCoastalWater(coord));
        }
    }

    [Fact]
    public void A_sea_hex_next_to_land_is_coastal()
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(7));

        var found = false;
        foreach (var coord in HexCoord.Origin.WithinRadius(40))
        {
            if (!sampler.IsLand(coord))
            {
                continue;
            }

            foreach (var neighbour in coord.Neighbours())
            {
                if (!sampler.IsLand(neighbour))
                {
                    Assert.True(sampler.IsCoastalWater(neighbour));
                    found = true;
                }
            }
        }

        Assert.True(found, "expected at least one coastline in this world");
    }

    [Fact]
    public void Coastal_orientation_faces_the_land_neighbour_when_there_is_exactly_one()
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(7));
        var checkedAny = false;

        foreach (var coord in HexCoord.Origin.WithinRadius(40))
        {
            if (!sampler.IsCoastalWater(coord))
            {
                continue;
            }

            var neighbours = coord.Neighbours();
            var landDirections = new List<int>();
            for (var i = 0; i < neighbours.Length; i++)
            {
                if (sampler.IsLand(neighbours[i]))
                {
                    landDirections.Add(i);
                }
            }

            // With several land neighbours the snapped average direction can
            // legitimately land on a compass point that isn't itself a land
            // neighbour (e.g. land at E and NW averages to NE); the
            // unambiguous case to lock down is a single land neighbour, where
            // the orientation must point exactly at it.
            if (landDirections.Count != 1)
            {
                continue;
            }

            checkedAny = true;
            Assert.Equal((TileOrientation)landDirections[0], sampler.OrientationAt(coord));
        }

        Assert.True(checkedAny, "expected at least one single-land-neighbour coastal hex in this world");
    }

    [Fact]
    public void An_override_wins_regardless_of_terrain()
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(7));
        var coord = HexCoord.Origin;

        Assert.Equal(TileOrientation.NW, sampler.OrientationAt(coord, TileOrientation.NW));
    }

    [Fact]
    public void Orientation_is_seed_stable()
    {
        var a = new TerrainSampler(WorldGenerationOptions.ForSeed(99));
        var b = new TerrainSampler(WorldGenerationOptions.ForSeed(99));

        foreach (var coord in HexCoord.Origin.WithinRadius(20))
        {
            Assert.Equal(a.OrientationAt(coord), b.OrientationAt(coord));
        }
    }

    [Theory]
    [InlineData(Terrain.Grass)]
    [InlineData(Terrain.Forest)]
    [InlineData(Terrain.Mountain)]
    public void Variants_stay_within_the_terrains_known_range(Terrain terrain)
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(11));
        var maxSeen = 0;

        foreach (var coord in HexCoord.Origin.WithinRadius(60))
        {
            if (sampler.TerrainAt(coord) != terrain)
            {
                continue;
            }

            var variant = sampler.VariantAt(coord);
            Assert.True(variant >= 0);
            maxSeen = Math.Max(maxSeen, variant);
        }

        // Sea/sand aren't asserted here — they only ever fall back to variant
        // 0 — but grass/forest/mountain should each show more than one
        // variant over a big enough sample, or the "not all have variants"
        // fallback would be indistinguishable from a bug that always returns 0.
        Assert.True(maxSeen > 0, $"expected {terrain} to show more than one variant over this sample");
    }

    [Fact]
    public void Terrains_without_known_variants_always_fall_back_to_zero()
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(11));

        foreach (var coord in HexCoord.Origin.WithinRadius(60))
        {
            var terrain = sampler.TerrainAt(coord);
            if (terrain is Terrain.Sea or Terrain.Sand)
            {
                Assert.Equal(0, sampler.VariantAt(coord));
            }
        }
    }

    /// <summary>
    /// Locks the server's orientation/variant functions to the frontend's, the
    /// same way <see cref="TerrainSamplerParityTests"/> does for terrain.
    /// Checksums produced by running the mirrored logic in
    /// <c>src/frontend/src/lib/map/worldGenerator.ts</c> under Node over
    /// <c>[-60, 60]^2</c> for each seed: the orientation's numeric index
    /// (0-5, matching <see cref="TileOrientation"/>'s own values — a first
    /// letter would collide between NE/NW and SW/SE) for the orientation
    /// checksum, and the variant digit itself for the variant checksum, both
    /// in q-major order.
    /// </summary>
    public static TheoryData<int, string, string> FrontendChecksums => new()
    {
        { 1, "041cef86959b17aecb560d3c7407e80b04c7dd10d1aaf3ac816c5f9dc45c4426", "bfb22b52135d73e7298e64088a3b395fd2c502c515b8da6a7281f2156ad48e11" },
        { 7, "c0a7bae4c78bec590c1a5f23f700a511e50998292c02c3d71a9e75ff183ba3e2", "236eb1e0d2e102e6317f9a2657ca714157af840369d96f3374d567d1a662d5c3" },
        { 42, "2a84f0cb4241cfad6109a18dd0288b3eaa06632b7787388f3956daab8c9a65f5", "dae78477f2a060c641da0caa4ff9ad9f442e8115b96e2d59118a9f965a4bcbc2" },
        { 1337, "1d8997ff229025428923145c710bb0c43a656bb43f0ccd743a35e26c6b5a7fcd", "587948135d81e4fd46ffbefed052408682df7b3d37afe8a27f94a9aeaf4f0129" },
        { -5, "d28bd1687d55e9f5cefa62b9a50b3b58822ed486d5dc84e7ddaa398056f4d720", "5ed48a46eefafac6f38f7d550ae4ac505ea1d78291fda6d2499d54be70e061a6" },
        { 2147483, "efce899f26227d329ded02c22da1dda3652751b9b3715341deb2648546e89a77", "5d9c534d8e061eb1ed92077ea80608a1659f986e38d805e50a913e324d53a888" },
        { 0, "e7818abf704628a800baf5407c85c983c3dcdbfb40dbdae45ef335f1018c3467", "0eae24eeb2cb92d62b399c679923757f045ecc63941d03f777a7a71afaa1011d" },
    };

    [Theory]
    [MemberData(nameof(FrontendChecksums))]
    public void Orientation_and_variant_match_the_frontend_generator_hex_for_hex(
        int seed,
        string expectedOrientation,
        string expectedVariant)
    {
        const int extent = 60;
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(seed));
        var orientationIndices = new StringBuilder((((2 * extent) + 1) * ((2 * extent) + 1)));
        var variantDigits = new StringBuilder((((2 * extent) + 1) * ((2 * extent) + 1)));

        for (var q = -extent; q <= extent; q++)
        {
            for (var r = -extent; r <= extent; r++)
            {
                var coord = new HexCoord(q, r);
                orientationIndices.Append((int)sampler.OrientationAt(coord));
                variantDigits.Append(sampler.VariantAt(coord));
            }
        }

        var actualOrientation = Convert.ToHexStringLower(
            SHA256.HashData(Encoding.UTF8.GetBytes(orientationIndices.ToString())));
        var actualVariant = Convert.ToHexStringLower(
            SHA256.HashData(Encoding.UTF8.GetBytes(variantDigits.ToString())));

        Assert.Equal(expectedOrientation, actualOrientation);
        Assert.Equal(expectedVariant, actualVariant);
    }
}
