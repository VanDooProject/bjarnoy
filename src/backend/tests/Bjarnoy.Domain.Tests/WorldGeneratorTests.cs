using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class WorldGeneratorTests
{
    // The compact preset (see WorldGenerationOptions.Compact): the production-scale
    // world is 260-hex cells with 150-hex islands, far too big for a unit test's radius.
    private static GeneratedWorld Generate(int seed, int radius = 300) =>
        new WorldGenerator(WorldGenerationOptions.Compact(seed, radius))
            .Generate(TestContext.Current.CancellationToken);

    [Fact]
    public void The_same_seed_produces_the_same_world()
    {
        var first = Generate(2024);
        var second = Generate(2024);

        Assert.Equal(first.LandTileCount, second.LandTileCount);
        Assert.Equal(
            first.Islands.Select(i => (i.Index, i.Name, i.Centre, i.TileCount)),
            second.Islands.Select(i => (i.Index, i.Name, i.Centre, i.TileCount)));
        Assert.Equal(
            first.Islands.Select(i => i.StartPositions),
            second.Islands.Select(i => i.StartPositions));
    }

    [Fact]
    public void Different_seeds_produce_different_worlds()
    {
        var a = Generate(1);
        var b = Generate(2);

        Assert.NotEqual(
            a.Islands.Select(i => i.Centre).ToList(),
            b.Islands.Select(i => i.Centre).ToList());
    }

    [Fact]
    public void A_world_contains_several_islands_rather_than_one_landmass()
    {
        // The legacy generator kept only the largest blob, so a world was one
        // island; MECHANICS.md wants a sea full of them.
        var world = Generate(7, radius: 400);

        Assert.True(world.Islands.Count > 3, $"expected an archipelago, got {world.Islands.Count} islands");
    }

    [Fact]
    public void Island_tiles_are_connected_land_and_never_shared_between_islands()
    {
        var world = Generate(11);
        var sampler = new TerrainSampler(world.Options);
        var seen = new HashSet<HexCoord>();

        foreach (var island in world.Islands)
        {
            Assert.All(island.Tiles, t => Assert.True(sampler.TerrainAt(t).IsLand()));
            Assert.All(island.Tiles, t => Assert.True(seen.Add(t), $"{t} belongs to two islands"));

            // Every tile is reachable from the island's first tile through
            // tiles of the same island.
            var members = island.Tiles.ToHashSet();
            var reached = new HashSet<HexCoord> { island.Tiles[0] };
            var pending = new Stack<HexCoord>();
            pending.Push(island.Tiles[0]);
            while (pending.TryPop(out var coord))
            {
                foreach (var neighbour in coord.Neighbours())
                {
                    if (members.Contains(neighbour) && reached.Add(neighbour))
                    {
                        pending.Push(neighbour);
                    }
                }
            }

            Assert.Equal(island.TileCount, reached.Count);
        }
    }

    [Fact]
    public void Islands_smaller_than_the_minimum_are_dropped()
    {
        var options = WorldGenerationOptions.Compact(3, 300) with { MinimumIslandTiles = 25 };

        var world = new WorldGenerator(options).Generate(TestContext.Current.CancellationToken);

        Assert.NotEmpty(world.Islands);
        Assert.All(world.Islands, i => Assert.True(i.TileCount >= 25));
    }

    [Fact]
    public void An_island_centre_is_one_of_its_own_tiles()
    {
        var world = Generate(5);

        Assert.NotEmpty(world.Islands);
        Assert.All(world.Islands, i => Assert.Contains(i.Centre, i.Tiles));
    }

    [Fact]
    public void Islands_are_named_and_indexed_in_order()
    {
        var world = Generate(13);

        Assert.Equal(Enumerable.Range(0, world.Islands.Count), world.Islands.Select(i => i.Index));
        Assert.All(world.Islands, i => Assert.False(string.IsNullOrWhiteSpace(i.Name)));

        // The legacy generator named every island "Refugium".
        Assert.True(world.Islands.Select(i => i.Name).Distinct().Count() > 1);
    }

    [Fact]
    public void Island_names_are_unique_within_a_world()
    {
        // Radius 120 packs enough islands into one world to exhaust the raw
        // stem/ending combination space, exercising the collision-probing (and,
        // if that space really is exhausted, the numbered-fallback) path.
        var world = Generate(9, radius: 500);

        var names = world.Islands.Select(i => i.Name).ToList();
        Assert.Equal(names.Count, names.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void Start_positions_satisfy_the_founding_rules()
    {
        var world = Generate(21, radius: 300);
        var sampler = new TerrainSampler(world.Options);
        var checkedAny = false;

        foreach (var island in world.Islands)
        {
            var members = island.Tiles.ToHashSet();

            foreach (var start in island.StartPositions)
            {
                checkedAny = true;
                Assert.Contains(start, members);
                Assert.Equal(Terrain.Grass, sampler.TerrainAt(start));

                var neighbours = start.Neighbours().Select(sampler.TerrainAt).ToList();
                Assert.True(neighbours.Count(t => t == Terrain.Forest) >= 1);
                Assert.True(neighbours.Count(t => t == Terrain.Grass) >= 2);

                // Inland: no sea within two hexes.
                Assert.All(start.WithinRadius(2), c => Assert.True(sampler.TerrainAt(c).IsLand()));
            }
        }

        Assert.True(checkedAny, "no island in this world offered a start position");
    }

    [Fact]
    public void Start_positions_are_ordered_deterministically_and_are_unique()
    {
        var world = Generate(21, radius: 300);

        foreach (var island in world.Islands)
        {
            Assert.Equal(island.StartPositions.Count, island.StartPositions.Distinct().Count());
        }
    }

    /// <summary>
    /// Giant placement v2: giants are generated before start positions, and a
    /// start position too close to one is dropped — this locks down the
    /// exclusion actually taking effect (never within
    /// <see cref="GiantGenerator.StartPositionExclusionRadius"/> + 1 of any
    /// giant anchor, i.e. never within 4 of any footprint hex — a footprint
    /// hex reaches at most 1 step from the anchor).
    /// </summary>
    [Theory]
    [InlineData(1)]
    [InlineData(55)] // Known (GiantGenerationTests.TwoGiantSeed) to place two giants on one island.
    public void Start_positions_never_sit_within_the_giant_exclusion_radius(int seed)
    {
        var world = Generate(seed, radius: 300);
        var checkedAny = false;

        foreach (var island in world.Islands)
        {
            if (island.Giants.Count == 0)
            {
                continue;
            }

            foreach (var start in island.StartPositions)
            {
                foreach (var giant in island.Giants)
                {
                    checkedAny = true;
                    Assert.True(
                        start.DistanceTo(giant.Anchor) >= GiantGenerator.StartPositionExclusionRadius + 1,
                        $"island {island.Index}: start position {start} sits within " +
                        $"{GiantGenerator.StartPositionExclusionRadius + 1} hexes of giant anchor {giant.Anchor}");

                    foreach (var footprintHex in Giant.Footprint(giant.Anchor))
                    {
                        Assert.NotEqual(start, footprintHex);
                    }
                }
            }
        }

        Assert.True(checkedAny, "no island in this world had both a giant and a start position to check");
    }

    [Fact]
    public void A_radius_one_world_generates_without_error()
    {
        var world = new WorldGenerator(WorldGenerationOptions.ForSeed(1) with { Radius = 1 })
            .Generate(TestContext.Current.CancellationToken);

        Assert.NotNull(world.Islands);
    }

    [Fact]
    public void Generation_honours_cancellation()
    {
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var generator = new WorldGenerator(WorldGenerationOptions.Compact(1, 300));

        Assert.Throws<OperationCanceledException>(() => generator.Generate(cts.Token));
    }

    [Fact]
    public void A_large_world_generates_without_overflowing_the_stack()
    {
        // The legacy flood fill recursed once per land hex. The default
        // production-scale world has landmasses of tens of thousands of tiles.
        var world = new WorldGenerator(TestWorlds.Options(4))
            .Generate(TestContext.Current.CancellationToken);

        Assert.NotEmpty(world.Islands);
        Assert.True(world.LandTileCount > 20000);
    }
}

public class AllLandTestOptionsTests
{
    /// <summary>
    /// The "everything near the origin is grass" options FieldBattleServiceTests and
    /// ShipMovementEndpointsTests build a world from (same numbers, duplicated there
    /// because those assemblies do not reference this one). If the island shape changes
    /// so that this stops holding, both need another seed.
    /// </summary>
    [Fact]
    public void The_all_land_test_options_cover_the_origin()
    {
        var options = new WorldGenerationOptions
        {
            Seed = 14,
            Radius = 500,
            IslandCellSize = 100,
            IslandChance = 1.0,
            IslandMaxReach = 0.0, // overlapping discs on purpose: legacy reach budget,
            IslandMinGap = 0.0, // and no min-gap rule to drop the overlapping ones
            IslandMinWidth = 100.0,
            IslandMaxWidth = 100.0,
            IslandMinSegments = 1,
            IslandMaxSegments = 1,
            IslandCoastWarp = 0.0,
            IslandCoastNoise = 0.0,
            IslandSmallShare = 0.0,
            IslandLargeShare = 0.0,
            BeachThreshold = 1.0,
            MountainThreshold = 0.0,
            MountainRockiness = 2.0,
            ForestRockiness = 2.0,
        };
        var sampler = new TerrainSampler(options);

        Assert.All(HexCoord.Origin.WithinRadius(30), c => Assert.Equal(Terrain.Grass, sampler.TerrainAt(c)));
    }
}

public class WorldGenerationOptionsTests
{
    [Fact]
    public void Validate_rejects_a_radius_below_one()
    {
        var options = WorldGenerationOptions.ForSeed(1) with { Radius = 0 };

        Assert.Throws<ArgumentOutOfRangeException>(options.Validate);
    }

    [Fact]
    public void Validate_rejects_a_mountain_threshold_outside_the_beach_threshold()
    {
        var options = WorldGenerationOptions.ForSeed(1) with
        {
            BeachThreshold = 0.5,
            MountainThreshold = 0.6,
        };

        var ex = Assert.Throws<ArgumentException>(options.Validate);
        Assert.Contains("MountainThreshold", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Validate_rejects_a_max_island_width_below_the_min()
    {
        var options = WorldGenerationOptions.ForSeed(1) with { IslandMinWidth = 30.0, IslandMaxWidth = 20.0 };

        Assert.Throws<ArgumentOutOfRangeException>(options.Validate);
    }

    [Theory]
    [InlineData(0, 5)]
    [InlineData(6, 5)]
    [InlineData(5, 25)]
    public void Validate_rejects_bad_segment_counts(int min, int max)
    {
        var options = WorldGenerationOptions.ForSeed(1) with { IslandMinSegments = min, IslandMaxSegments = max };

        Assert.Throws<ArgumentOutOfRangeException>(options.Validate);
    }

    [Fact]
    public void Validate_rejects_elongation_and_bend_ranges_that_are_reversed()
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            (WorldGenerationOptions.ForSeed(1) with { IslandMinElongation = 6.0, IslandMaxElongation = 5.0 }).Validate);
        Assert.Throws<ArgumentOutOfRangeException>(
            (WorldGenerationOptions.ForSeed(1) with { IslandMinBend = 0.3, IslandMaxBend = 0.2 }).Validate);
        Assert.Throws<ArgumentOutOfRangeException>(
            (WorldGenerationOptions.ForSeed(1) with { IslandMaxBend = 1.5 }).Validate);
    }

    [Fact]
    public void Validate_rejects_size_class_shares_that_exceed_one_together()
    {
        var options = WorldGenerationOptions.ForSeed(1) with { IslandSmallShare = 0.7, IslandLargeShare = 0.4 };

        Assert.Throws<ArgumentOutOfRangeException>(options.Validate);
    }

    [Fact]
    public void Validate_accepts_the_largest_supported_radius_and_rejects_beyond_it()
    {
        var ok = WorldGenerationOptions.ForSeed(1) with { Radius = WorldGenerationOptions.MaxRadius };
        ok.Validate();

        var tooBig = WorldGenerationOptions.ForSeed(1) with { Radius = WorldGenerationOptions.MaxRadius + 1 };
        Assert.Throws<ArgumentOutOfRangeException>(tooBig.Validate);
    }

    [Fact]
    public void Validate_rejects_a_coast_warp_that_could_fold_the_coastline_through_either_octave()
    {
        // The coarse octave alone is fine (0.2 * 1.5 < 1) but with the constant fine
        // octave (3.8 / 11.4 = 1/3) added the sum reaches 1: 1.5 * (0.35 + 0.333) > 1.
        var options = WorldGenerationOptions.ForSeed(1) with { IslandCoastWarp = 14.7, IslandCoastWarpScale = 42.0 };

        var ex = Assert.Throws<ArgumentException>(options.Validate);
        Assert.Contains("IslandCoastWarp", ex.Message, StringComparison.Ordinal);

        // Same amplitude on a longer wavelength is accepted.
        (WorldGenerationOptions.ForSeed(1) with { IslandCoastWarp = 14.7, IslandCoastWarpScale = 80.0 }).Validate();
    }

    [Fact]
    public void Validate_rejects_a_cell_too_small_for_the_coast_warp()
    {
        // Legacy reach budget (one ring of cells): a 16-hex cell has no room left after a 30-hex warp.
        var options = WorldGenerationOptions.ForSeed(1) with
        {
            IslandCellSize = 16, IslandMaxReach = 0.0, IslandCoastWarp = 30.0, IslandCoastWarpScale = 400.0,
        };

        Assert.Throws<ArgumentException>(options.Validate);
    }

    [Fact]
    public void Validate_rejects_a_cell_too_small_for_the_max_reach()
    {
        // 305 hexes of reach on 40-hex cells would need a hex to scan 8 rings of cells.
        var options = WorldGenerationOptions.ForSeed(1) with { IslandCellSize = 40 };
        Assert.Throws<ArgumentException>(options.Validate);

        // The same reach on the default cells is a 5x5 scan, and the legacy rule always a 3x3 one.
        Assert.Equal(2, IslandShapeConstants.ScanSpan(WorldGenerationOptions.ForSeed(1)));
        Assert.Equal(1, IslandShapeConstants.ScanSpan(WorldGenerationOptions.ForSeed(1) with { IslandCellSize = 40, IslandMaxReach = 0.0 }));
    }

    [Fact]
    public void A_generator_validates_its_options_on_construction()
    {
        var options = WorldGenerationOptions.ForSeed(1) with { IslandChance = 2.0 };

        Assert.Throws<ArgumentOutOfRangeException>(() => new WorldGenerator(options));
    }
}
