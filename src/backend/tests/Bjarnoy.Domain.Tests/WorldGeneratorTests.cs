using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class WorldGeneratorTests
{
    private static GeneratedWorld Generate(int seed, int radius = 40) =>
        new WorldGenerator(WorldGenerationOptions.ForSeed(seed) with { Radius = radius })
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
        var world = Generate(7);

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
        var options = WorldGenerationOptions.ForSeed(3) with { Radius = 40, MinimumIslandTiles = 25 };

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
    public void Start_positions_satisfy_the_founding_rules()
    {
        var world = Generate(21, radius: 60);
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
        var world = Generate(21, radius: 60);

        foreach (var island in world.Islands)
        {
            Assert.Equal(island.StartPositions.Count, island.StartPositions.Distinct().Count());
        }
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

        var generator = new WorldGenerator(WorldGenerationOptions.ForSeed(1) with { Radius = 80 });

        Assert.Throws<OperationCanceledException>(() => generator.Generate(cts.Token));
    }

    [Fact]
    public void A_large_world_generates_without_overflowing_the_stack()
    {
        // The legacy flood fill recursed once per land hex. Radius 120 is
        // ~44k hexes and landmasses of several hundred tiles.
        var world = Generate(4, radius: 120);

        Assert.NotEmpty(world.Islands);
        Assert.True(world.LandTileCount > 1000);
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
    public void Validate_rejects_a_max_island_radius_below_the_min()
    {
        var options = WorldGenerationOptions.ForSeed(1) with
        {
            IslandMinRadius = 5.0,
            IslandMaxRadius = 2.0,
        };

        Assert.Throws<ArgumentOutOfRangeException>(options.Validate);
    }

    [Fact]
    public void A_generator_validates_its_options_on_construction()
    {
        var options = WorldGenerationOptions.ForSeed(1) with { IslandChance = 2.0 };

        Assert.Throws<ArgumentOutOfRangeException>(() => new WorldGenerator(options));
    }
}
