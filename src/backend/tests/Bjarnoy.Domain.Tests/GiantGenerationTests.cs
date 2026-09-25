using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The "giants" feature's generation rules — see <c>GiantGenerator</c>:
/// footprint shape, candidate qualification (land/terrain, no river, enough
/// Mountain, clear of start positions), non-overlapping placement, and
/// seed-determinism, mirroring how <c>RiverGenerationTests</c> locks down
/// <c>RiverGenerator</c>.
/// </summary>
public class GiantGenerationTests
{
    // Seed 55 at radius 90 is known (found by scanning seeds 1-200) to place
    // two giants on one island — the multi-giant, spacing-constrained case
    // most seeds never exercise.
    private const int TwoGiantSeed = 55;

    private static GeneratedWorld Generate(int seed, int radius = 90) =>
        new WorldGenerator(WorldGenerationOptions.ForSeed(seed) with { Radius = radius })
            .Generate(TestContext.Current.CancellationToken);

    [Fact]
    public void Footprint_is_the_anchor_and_its_six_neighbours()
    {
        var anchor = new HexCoord(3, -2);
        var footprint = Giant.Footprint(anchor);

        Assert.Equal(7, footprint.Count);
        Assert.Equal(anchor, footprint[0]);
        Assert.Equal(new HashSet<HexCoord>(anchor.Neighbours()), new HashSet<HexCoord>(footprint.Skip(1)));
    }

    [Fact]
    public void Across_many_seeds_at_least_one_world_places_a_giant()
    {
        var anyGiants = Enumerable.Range(1, 30)
            .Select(seed => Generate(seed))
            .Any(world => world.Islands.Any(i => i.Giants.Count > 0));

        Assert.True(anyGiants, "expected at least one giant across 30 scanned seeds");
    }

    [Fact]
    public void The_same_seed_produces_the_same_giants()
    {
        var first = Generate(TwoGiantSeed);
        var second = Generate(TwoGiantSeed);

        Assert.Equal(
            first.Islands.Select(i => i.Giants),
            second.Islands.Select(i => i.Giants));
    }

    [Fact]
    public void A_large_island_may_get_two_giants()
    {
        var world = Generate(TwoGiantSeed);
        var island = world.Islands.FirstOrDefault(i => i.Giants.Count(g => g.Family != GiantGenerator.ShrineFamily) == 2);

        Assert.True(island != default, "expected at least one island with two mountain giants");
        Assert.True(island.TileCount >= GiantGenerator.LargeIslandGiantThreshold);
    }

    public static IEnumerable<object[]> ScanSeeds() => Enumerable.Range(1, 60).Select(s => new object[] { s });

    [Theory]
    [MemberData(nameof(ScanSeeds))]
    public void Generated_giants_comply_with_every_placement_rule(int seed)
    {
        var world = Generate(seed);
        var sampler = new WorldGenerator(WorldGenerationOptions.ForSeed(seed) with { Radius = 90 }).Sampler;

        foreach (var island in world.Islands)
        {
            var islandLand = new HashSet<HexCoord>(island.Tiles);
            var riverTiles = new HashSet<HexCoord>(island.RiverTiles.Select(t => t.Coord));

            // Count caps for the island's own size.
            var maxGiants = island.TileCount >= GiantGenerator.LargeIslandGiantThreshold
                ? 2
                : island.TileCount >= GiantGenerator.SmallIslandGiantThreshold
                    ? 1
                    : 0;
            var isClearingFamily = (string family) =>
                family is GiantGenerator.ShrineFamily or GiantGenerator.UtgardFamily;
            var mountainGiants = island.Giants.Count(g => !isClearingFamily(g.Family));
            Assert.True(mountainGiants <= maxGiants, $"island {island.Index}: too many mountain giants for its size");

            // At most one shrine/Utgard per island — it is rolled/placed once, not scored/capped like mountains.
            Assert.True(
                island.Giants.Count(g => isClearingFamily(g.Family)) <= 1,
                $"island {island.Index}: more than one shrine/Utgard");

            foreach (var giant in island.Giants)
            {
                var footprint = Giant.Footprint(giant.Anchor);
                Assert.Equal(7, footprint.Count);

                var mountainCount = 0;
                foreach (var hex in footprint)
                {
                    Assert.Contains(hex, islandLand);
                    Assert.DoesNotContain(hex, riverTiles);

                    var terrain = island.IsWasted ? sampler.WastedTerrainAt(hex) : sampler.TerrainAt(hex);
                    var allowed = isClearingFamily(giant.Family)
                        ? terrain is Terrain.Grass or Terrain.Forest
                        : terrain is Terrain.Grass or Terrain.Forest or Terrain.Mountain;
                    Assert.True(
                        allowed,
                        $"island {island.Index}: giant footprint hex {hex} has disallowed terrain {terrain} for family {giant.Family}");
                    if (terrain == Terrain.Mountain)
                    {
                        mountainCount++;
                    }
                }

                if (isClearingFamily(giant.Family))
                {
                    // Not coastal: every hex within 2 of the anchor is island land.
                    Assert.All(giant.Anchor.WithinRadius(2), c => Assert.Contains(c, islandLand));
                }
                else
                {
                    Assert.True(
                        mountainCount >= GiantGenerator.MinimumMountainHexes,
                        $"island {island.Index}: giant at {giant.Anchor} has only {mountainCount} mountain hexes");
                }

                foreach (var other in island.Giants)
                {
                    if (other.Anchor == giant.Anchor)
                    {
                        continue;
                    }

                    Assert.True(
                        giant.Anchor.DistanceTo(other.Anchor) >= GiantGenerator.MinimumGiantSpacing,
                        $"island {island.Index}: giants at {giant.Anchor} and {other.Anchor} are too close");
                }
            }
        }
    }

    [Fact]
    public void Orientation_matches_the_sampler_at_the_anchor()
    {
        var world = Generate(TwoGiantSeed);
        var sampler = new WorldGenerator(WorldGenerationOptions.ForSeed(TwoGiantSeed) with { Radius = 90 }).Sampler;

        var anyChecked = false;
        foreach (var island in world.Islands)
        {
            foreach (var giant in island.Giants)
            {
                anyChecked = true;
                Assert.Equal(sampler.OrientationAt(giant.Anchor), giant.Orientation);
            }
        }

        Assert.True(anyChecked, "expected at least one giant to check orientation against");
    }

    [Fact]
    public void No_giant_is_ever_a_volcano_on_a_green_island()
    {
        // Volcanoes are a wasted-island-only family — WorldGenerator never
        // places one on a green island (see WastedIslandGenerationTests for
        // the wasted side, which does place them).
        foreach (var seed in Enumerable.Range(1, 60))
        {
            var world = Generate(seed);
            foreach (var island in world.Islands.Where(i => !i.IsWasted))
            {
                Assert.DoesNotContain(island.Giants, g => g.Family == GiantGenerator.VolcanoFamily);
            }
        }
    }

    /// <summary>
    /// Over many island indices the shrine roll (<see cref="GiantGenerator.ShrineChance"/>,
    /// hash-derived from the world seed and island index) fires roughly
    /// 1-in-12 of the time — not exactly, since the hash isn't a uniform RNG
    /// over a small sample, but well within a generous band, and
    /// deterministically so for a fixed seed.
    /// </summary>
    [Fact]
    public void Shrine_roll_fires_at_roughly_one_in_twelve_island_indices()
    {
        const int worldSeed = 4242;
        const int sampleSize = 6000;

        var hits = Enumerable.Range(0, sampleSize)
            .Count(islandIndex => ValueNoise.Hash2(islandIndex, 0, worldSeed + 211) < GiantGenerator.ShrineChance);

        var rate = (double)hits / sampleSize;
        Assert.InRange(rate, 1.0 / 12.0 * 0.7, 1.0 / 12.0 * 1.3);
    }

    [Fact]
    public void Shrine_roll_is_deterministic_for_a_given_seed_and_island_index()
    {
        var first = ValueNoise.Hash2(3, 0, 4242 + 211);
        var second = ValueNoise.Hash2(3, 0, 4242 + 211);

        Assert.Equal(first, second);
    }

    /// <summary>
    /// Builds a small synthetic island directly against <see cref="GiantGenerator.PlaceCore"/>
    /// so the shrine rule can be exercised without hunting for a real seed
    /// that happens to roll one — see <c>GiantPlacementGoldenTests</c> for the
    /// cross-language golden fixture built the same way.
    /// </summary>
    [Fact]
    public void PlaceCore_places_a_shrine_on_a_qualifying_non_coastal_clearing()
    {
        var (tiles, land) = BuildRingIsland(centreTerrain: Terrain.Grass, ringTerrain: Terrain.Grass, ringRadius: 8);

        // Find a (worldSeed, islandIndex) pair that rolls the shrine chance for this island.
        var (worldSeed, islandIndex) = FindShrineRollingSeed();

        var placements = GiantGenerator.PlaceCore(tiles, land, new HashSet<HexCoord>(), worldSeed, islandIndex);

        var shrine = Assert.Single(placements, p => p.Family == GiantGenerator.ShrineFamily);
        foreach (var hex in Giant.Footprint(shrine.Anchor))
        {
            Assert.Equal(Terrain.Grass, land[hex]);
        }

        Assert.All(shrine.Anchor.WithinRadius(2), c => Assert.Contains(c, tiles));
    }

    [Fact]
    public void PlaceCore_skips_the_shrine_when_no_non_coastal_spot_qualifies()
    {
        // A one-hex-wide strip, well past the shrine size threshold — no hex
        // on it has a whole radius-2 neighbourhood on the island (its
        // neighbours off the strip's own row are never island land), so no
        // anchor ever qualifies as a shrine candidate.
        var tiles = Enumerable.Range(0, GiantGenerator.SmallIslandGiantThreshold + 10)
            .Select(i => new HexCoord(i, 0))
            .ToList();
        var land = tiles.ToDictionary(t => t, _ => Terrain.Grass);

        var (worldSeed, islandIndex) = FindShrineRollingSeed();

        var placements = GiantGenerator.PlaceCore(tiles, land, new HashSet<HexCoord>(), worldSeed, islandIndex);

        Assert.DoesNotContain(placements, p => p.Family == GiantGenerator.ShrineFamily);
    }

    /// <summary>Finds a (worldSeed, islandIndex) pair whose shrine roll succeeds, for tests that need one deterministically.</summary>
    private static (int WorldSeed, int IslandIndex) FindShrineRollingSeed()
    {
        const int worldSeed = 4242;
        for (var islandIndex = 0; islandIndex < 2000; islandIndex++)
        {
            if (ValueNoise.Hash2(islandIndex, 0, worldSeed + 211) < GiantGenerator.ShrineChance)
            {
                return (worldSeed, islandIndex);
            }
        }

        throw new InvalidOperationException("No island index rolled the shrine chance within 2000 tries — ShrineChance may have changed.");
    }

    /// <summary>A big enough disc island for shrine tests: `ringRadius` sets how far from centre the island reaches (all land), which controls whether any anchor's radius-2 neighbourhood stays fully on-island.</summary>
    private static (List<HexCoord> Tiles, Dictionary<HexCoord, Terrain> Land) BuildRingIsland(Terrain centreTerrain, Terrain ringTerrain, int ringRadius)
    {
        var tiles = new List<HexCoord>();
        var land = new Dictionary<HexCoord, Terrain>();
        foreach (var coord in HexCoord.Origin.WithinRadius(ringRadius))
        {
            var terrain = coord == HexCoord.Origin ? centreTerrain : ringTerrain;
            tiles.Add(coord);
            land[coord] = terrain;
        }

        return (tiles, land);
    }
}
