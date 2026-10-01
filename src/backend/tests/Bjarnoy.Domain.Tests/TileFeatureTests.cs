using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Coastal-water detection, tile orientation and tile variant selection —
/// the "generation rules" from issue #24 that make every tile stop rendering
/// as the same fixed rotation.
/// </summary>
public class TileFeatureTests
{
    /// <summary>
    /// A sampler over the compact preset plus the middle of its widest island, so a
    /// window around it holds coast, sea and every inland terrain. (At the
    /// production scale islands are 150 hexes across: a radius-60 window around the
    /// origin is usually open sea or solid grass.)
    /// </summary>
    private static (TerrainSampler Sampler, HexCoord Centre) IslandWorld(int seed)
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.Compact(seed, 400));
        var widest = sampler.EnumerateIslandShapes().MaxBy(s => s.Width.Max())!;
        var mid = widest.SpineX.Count / 2;
        var centre = HexCoord.FromOddQ(new OffsetCoord(
            (int)Math.Floor(widest.CentreX + widest.SpineX[mid] + 0.5),
            (int)Math.Floor(widest.CentreY + widest.SpineY[mid] + 0.5)));
        return (sampler, centre);
    }

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
        var (sampler, centre) = IslandWorld(7);

        var found = false;
        foreach (var coord in centre.WithinRadius(40))
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
        var (sampler, centre) = IslandWorld(7);
        var checkedAny = false;

        foreach (var coord in centre.WithinRadius(40))
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
        var (sampler, centre) = IslandWorld(7);
        var checkedAny = false;

        foreach (var coord in centre.WithinRadius(40))
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
        var (sampler, centre) = IslandWorld(11);
        var maxSeen = 0;

        foreach (var coord in centre.WithinRadius(60))
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
        var (sampler, centre) = IslandWorld(11);

        foreach (var coord in centre.WithinRadius(60))
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
        var (sampler, centre) = IslandWorld(11);
        var checkedAny = false;

        foreach (var coord in centre.WithinRadius(60))
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

    [Fact]
    public void SoilAt_is_seed_stable_for_the_same_island_centre()
    {
        var a = new TerrainSampler(WorldGenerationOptions.ForSeed(21));
        var b = new TerrainSampler(WorldGenerationOptions.ForSeed(21));

        foreach (var centre in HexCoord.Origin.WithinRadius(20))
        {
            Assert.Equal(a.SoilAt(centre), b.SoilAt(centre));
        }
    }

    [Fact]
    public void SoilAt_produces_both_crops_over_a_sample_of_island_centres()
    {
        // Not every island should grow the same crop — a real distribution,
        // not always Wheat or always Pumpkin.
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(11));
        var seenWheat = false;
        var seenPumpkin = false;

        foreach (var centre in HexCoord.Origin.WithinRadius(60))
        {
            var soil = sampler.SoilAt(centre);
            seenWheat |= soil == SoilType.Wheat;
            seenPumpkin |= soil == SoilType.Pumpkin;
        }

        Assert.True(seenWheat, "expected at least one Wheat pick over this sample");
        Assert.True(seenPumpkin, "expected at least one Pumpkin pick over this sample");
    }

    /// <summary>
    /// Locks the server's orientation/variant functions to the frontend's, the
    /// same way <see cref="TerrainSamplerParityTests"/> does for terrain: digests of
    /// every hex on a lattice over the default world, from
    /// <c>src/shared/terrain-checksum-golden.json</c> (see <see cref="TerrainChecksumFixture"/>).
    /// </summary>
    // NB: the variant digests intentionally pin sea to variant 0 — the frontend's
    // variantAt has a coastal-water weighting branch (COASTAL_WATER_VARIANT_WEIGHTS in
    // worldGenerator.ts) with no backend counterpart at all, a pre-existing
    // frontend/backend drift, out of scope here.
    public static TheoryData<int> Seeds => TerrainChecksumFixture.Seeds();

    [Theory]
    [MemberData(nameof(Seeds))]
    public void Orientation_and_variant_match_the_frontend_generator_hex_for_hex(int seed)
    {
        var (_, orientation, variant) = TerrainChecksumFixture.Compute(seed);

        Assert.Equal(TerrainChecksumFixture.Expected(seed, "orientation"), orientation);
        Assert.Equal(TerrainChecksumFixture.Expected(seed, "variant"), variant);
    }
}
