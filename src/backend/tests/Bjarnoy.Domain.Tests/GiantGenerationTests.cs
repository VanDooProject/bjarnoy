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
        var island = world.Islands.Single(i => i.Giants.Count == 2);

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
            Assert.True(island.Giants.Count <= maxGiants, $"island {island.Index}: too many giants for its size");

            foreach (var giant in island.Giants)
            {
                var footprint = Giant.Footprint(giant.Anchor);
                Assert.Equal(7, footprint.Count);

                var mountainCount = 0;
                foreach (var hex in footprint)
                {
                    Assert.Contains(hex, islandLand);
                    Assert.DoesNotContain(hex, riverTiles);

                    var terrain = sampler.TerrainAt(hex);
                    Assert.True(
                        terrain is Terrain.Grass or Terrain.Forest or Terrain.Mountain,
                        $"island {island.Index}: giant footprint hex {hex} has disallowed terrain {terrain}");
                    if (terrain == Terrain.Mountain)
                    {
                        mountainCount++;
                    }

                    foreach (var start in island.StartPositions)
                    {
                        Assert.True(
                            hex.DistanceTo(start) >= GiantGenerator.StartPositionExclusionRadius,
                            $"island {island.Index}: giant at {giant.Anchor} sits within " +
                            $"{GiantGenerator.StartPositionExclusionRadius} hexes of start position {start}");
                    }
                }

                Assert.True(
                    mountainCount >= GiantGenerator.MinimumMountainHexes,
                    $"island {island.Index}: giant at {giant.Anchor} has only {mountainCount} mountain hexes");

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
}
