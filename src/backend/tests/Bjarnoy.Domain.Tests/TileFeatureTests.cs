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

        // Sea/sand/mountain aren't asserted here — they only ever fall back to
        // variant 0 (mountain isn't base/top split and the art pack has no
        // mountaintile*variant* files at all) — but grass/forest should each
        // show more than one variant over a big enough sample, or the "not
        // all have variants" fallback would be indistinguishable from a bug
        // that always returns 0.
        Assert.True(maxSeen > 0, $"expected {terrain} to show more than one variant over this sample");
    }

    [Fact]
    public void Terrains_without_known_variants_always_fall_back_to_zero()
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(11));

        foreach (var coord in HexCoord.Origin.WithinRadius(60))
        {
            var terrain = sampler.TerrainAt(coord);
            if (terrain is Terrain.Sea or Terrain.Sand or Terrain.Mountain)
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
        { 1, "415b88f6388671232e76a94be27b42575c4f5523a3985dd00b9cfd1a8d7b2fe0", "11b649fd1f18d0c3ef9794ca002b58a0938ba529aa9ffea5867b40627c2470d1" },
        { 7, "a495087fe797726e77f67541252861c81a7aaf37eafa445f5cd13b0c0c7e44a7", "3b6fd160b05ac1e715728972bb91098f2ac5cff3ea068fba2121b5c7c94ffbc9" },
        { 42, "ce2fb78d592a6607f216843f6f9ff62cabff4f214df05fcc463ec12efe03a067", "14b38d0fcb2102546951a5166e5d34fa1e9dca51ec27b9f5867c897ba258bc39" },
        { 1337, "10e3b133c8f87cecb9133aaa008148a074a5f4e2d772e010a47ed0696cdfbdfe", "56ca0ee574da6fc22fb12a77faf4874367e960450914a6bc952d6dbff9d88205" },
        { -5, "642a52baef34bf512ebf04097878a2f84c83b40ed87944685c0b372cdae12e86", "4ff9984a91c8f56fc4c2abae6eb2eebee5a8e8b23f4d9022f347ea60c0403763" },
        { 2147483, "0ca5191ff76def31c433f299b6036abe7301ee9d35be1adf58bfbec97718c80c", "648d3d6501d09432ab122a0bbf591c0aaf31a50f074c32c9a190eded8fe4216d" },
        { 0, "3ec7fea9cf6ccc2369f5d026d2a1aa29be1b32c788b176af4a978804df38e601", "66355d016541f7ca1fab84b41acbd25dbfa8191faffea5ad6ad08f158c517ac4" },
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
