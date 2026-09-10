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
    public void FishingHutOrientation_faces_the_settlements_own_shore_not_a_strangers()
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
            for (var i = 0; i < neighbours.Length; i++)
            {
                if (!sampler.IsLand(neighbours[i]))
                {
                    continue;
                }

                // A settlement centred right on this land neighbour is at
                // distance 0 from it and >=1 from any other land neighbour
                // the hex has — so it must uniquely win, whatever
                // CoastalOrientation's land-neighbour average would say.
                Assert.Equal((TileOrientation)i, sampler.FishingHutOrientation(coord, neighbours[i]));
                checkedAny = true;
            }
        }

        Assert.True(checkedAny, "expected at least one coastal hex with a land neighbour in this world");
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
        // fallback would be indistinguishable from a bug that always
        // returns 0.
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

    [Fact]
    public void MountainShapeAt_matches_VariantAt_for_mountain_hexes()
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(11));
        var checkedAny = false;

        foreach (var coord in HexCoord.Origin.WithinRadius(60))
        {
            if (sampler.TerrainAt(coord) != Terrain.Mountain)
            {
                continue;
            }

            checkedAny = true;
            Assert.Equal((MountainShape)sampler.VariantAt(coord), sampler.MountainShapeAt(coord));
        }

        Assert.True(checkedAny, "expected at least one mountain hex in this sample");
    }

    [Fact]
    public void SpringMountainShapeAt_only_ever_returns_a_spring_capable_shape()
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(11));
        var seenSaddleback = false;
        var seenCorrie = false;

        foreach (var coord in HexCoord.Origin.WithinRadius(60))
        {
            var shape = sampler.SpringMountainShapeAt(coord);
            Assert.True(shape.IsSpringCapable(), $"{shape} at {coord} is not spring-capable");
            seenSaddleback |= shape == MountainShape.Saddleback;
            seenCorrie |= shape == MountainShape.Corrie;
        }

        Assert.True(seenSaddleback, "expected at least one Saddleback pick over this sample");
        Assert.True(seenCorrie, "expected at least one Corrie pick over this sample");
    }

    [Fact]
    public void SpringMountainShapeAt_is_seed_stable_and_independent_of_MountainShapeAt()
    {
        var a = new TerrainSampler(WorldGenerationOptions.ForSeed(21));
        var b = new TerrainSampler(WorldGenerationOptions.ForSeed(21));

        foreach (var coord in HexCoord.Origin.WithinRadius(20))
        {
            Assert.Equal(a.SpringMountainShapeAt(coord), b.SpringMountainShapeAt(coord));
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
    // NB: the variant checksums below intentionally match the frontend's
    // variantAt *without* its coastal-water weighting branch — that branch
    // (COASTAL_WATER_VARIANT_WEIGHTS in worldGenerator.ts) has no backend
    // counterpart at all, a pre-existing frontend/backend drift discovered
    // while regenerating these fixtures for the bigger-island change, not
    // introduced by it. Out of scope here; left for a follow-up.
    //
    // Regenerated again for the de-rounded island-shape retune (see
    // WorldGenerationOptions's IslandMaxElongation/IslandCellSize doc
    // comments) — both the default radius/cellSize/elongation/lobe values
    // changed, which moves every seed's terrain and, with it, orientation
    // and variant.
    public static TheoryData<int, string, string> FrontendChecksums => new()
    {
        { 1, "5cda829c7a61a1db4fb11a7d3e80b3777eb984425c88dbbc834500e0aa3ab006", "203c2bf505745a7cc2c335170ae10578f35cf84bd26051e01444b14067b06688" },
        { 7, "f4b0ed310d0d6b6258ebdec73192398a1ed43a6931f951e67283ff9cb3863d48", "fb36916cd980eaef15d770eb36e4a8ed224cae52543123308ef4b17ec46443a5" },
        { 42, "e07986114909a18be4955d2a2ceb8861a014b2edf31a1c106b2f61a06dfcac7c", "232c00c468f3d611f0fc7b637400655069f3ca175fcc365781911e4c8fdd4a12" },
        { 1337, "078f11e7487ae33a92b0bb1c54b4c8e92ade7df0c8ce2d47b87dd3af98e28fbd", "b5044cfa12ca4074f8ec4bc77f3a3a621f9210a57796af6873a530b629fc6d21" },
        { -5, "9487f166a78af661b72ccc96058e796f66ba793e7406d30508fcf4b01a4f0c2f", "4698ea7c33a1c3e766c114cd613f83310d8831ae154dc40a468e671f036f53db" },
        { 2147483, "4c15491175ffde03cd24c993e6ac54112c4140a552295126fd7f0699e3b9202c", "050cb12228a38f6e472843ccc096b768e1fd06c71ca1dd7ab21a1c57dc21651f" },
        { 0, "ac2a959db5fe774c26bae3693c60bad60988643120372a3141996041b8c1dcad", "bce472b021db23a20f7376ae4808e46df02787cf1b976f904f75e888edcf552f" },
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
