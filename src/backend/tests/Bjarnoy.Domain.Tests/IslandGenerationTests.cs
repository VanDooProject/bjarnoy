using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The island shape's own rules (not the frontend agreement, which
/// <see cref="IslandShapeGoldenTests"/> covers): islands are never cut — at a cell border, or
/// by the world edge — never reach further than their cell block scans, come in the
/// advertised size classes, and the cell-based <see cref="WorldGenerator"/> finds exactly
/// the landmasses a brute-force scan of every hex does.
/// </summary>
public class IslandGenerationTests
{
    private static int Round(double v) => (int)Math.Floor(v + 0.5);

    private static HexCoord CentreHex(IslandShape s) =>
        HexCoord.FromOddQ(new OffsetCoord(Round(s.CentreX), Round(s.CentreY)));

    private static int Cell(int coordinate, int cellSize) => (int)Math.Floor((double)coordinate / cellSize);

    // ---- world edge --------------------------------------------------------------------

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public void No_land_lies_beyond_the_world_radius_at_any_scale(int seed)
    {
        foreach (var options in new[]
        {
            WorldGenerationOptions.Compact(seed, 260),
            WorldGenerationOptions.Compact(seed, 420) with { IslandChance = 1.0 },
            TestWorlds.Options(seed),
        })
        {
            var world = TestWorlds.Generate(options);
            Assert.All(world.Islands, i => Assert.All(i.Tiles, t => Assert.True(
                t.DistanceTo(HexCoord.Origin) <= options.Radius,
                $"seed {seed} radius {options.Radius}: island {i.Index} tile {t} is past the world edge")));
        }
    }

    [Fact]
    public void An_island_that_could_cross_the_radius_is_dropped_and_one_that_cannot_is_kept()
    {
        // The rule, exactly: hex distance of the rounded centre + 1.42 * reach must fit the
        // radius. For every island of a big world, shrink the world to just under that
        // and the cell yields no island; grow it to just over and the cell yields it again.
        var big = new TerrainSampler(WorldGenerationOptions.ForSeed(11) with { Radius = 4000 });
        var checkedShapes = 0;
        foreach (var shape in big.EnumerateIslandShapes().Take(25))
        {
            var need = CentreHex(shape).DistanceTo(HexCoord.Origin) + (1.42 * shape.Reach);
            var tooSmall = new TerrainSampler(WorldGenerationOptions.ForSeed(11) with { Radius = (int)Math.Floor(need) - 1 });
            var justRight = new TerrainSampler(WorldGenerationOptions.ForSeed(11) with { Radius = (int)Math.Ceiling(need) + 1 });

            Assert.Null(tooSmall.IslandShapeAt(shape.CellCol, shape.CellRow));
            Assert.NotNull(justRight.IslandShapeAt(shape.CellCol, shape.CellRow));
            checkedShapes++;
        }

        Assert.True(checkedShapes >= 10, "the big world should hold plenty of islands to check");
    }

    [Fact]
    public void Shrinking_the_world_never_moves_an_island_it_keeps()
    {
        // Dropping at the edge must not change any surviving island: same centre, same shape.
        var big = new TerrainSampler(WorldGenerationOptions.ForSeed(6) with { Radius = 2500 });
        var small = new TerrainSampler(WorldGenerationOptions.ForSeed(6) with { Radius = 1000 });

        var kept = small.EnumerateIslandShapes().ToList();
        Assert.NotEmpty(kept);
        foreach (var shape in kept)
        {
            var same = big.IslandShapeAt(shape.CellCol, shape.CellRow)!;
            Assert.Equal(shape.CentreX, same.CentreX);
            Assert.Equal(shape.CentreY, same.CentreY);
            Assert.Equal(shape.Width, same.Width);
        }
    }

    // ---- reach clamp / never cut at cell borders ---------------------------------------

    [Fact]
    public void An_island_never_reaches_further_than_its_cell_block_scans()
    {
        // Extreme shape knobs: long, wide, bendy, warped — the reach clamp has to shrink these.
        var extreme = WorldGenerationOptions.ForSeed(5) with
        {
            Radius = 5000,
            IslandMinWidth = 60.0,
            IslandMaxWidth = 90.0,
            IslandMinElongation = 12.0,
            IslandMaxElongation = 18.0,
            IslandMaxSegments = 12,
            IslandCoastWarp = 20.0,
            IslandCoastWarpScale = 120.0,
        };
        foreach (var options in new[] { WorldGenerationOptions.ForSeed(5) with { Radius = 5000 }, extreme })
        {
            var sampler = new TerrainSampler(options);
            var cs = options.IslandCellSize;
            var clamped = 0;
            foreach (var shape in sampler.EnumerateIslandShapes().Take(60))
            {
                if (shape.ClampFactor < 1.0)
                {
                    clamped++;
                }

                // Everything an island can claim sits inside the 3x3 block of cells around its
                // own: the box outside which no hex is land never leaves it.
                Assert.True(shape.MinCol >= (shape.CellCol - 1) * cs, $"cell {shape.CellCol},{shape.CellRow}: box starts left of the block");
                Assert.True(shape.MaxCol < (shape.CellCol + 2) * cs, $"cell {shape.CellCol},{shape.CellRow}: box ends right of the block");
                Assert.True(shape.MinRow >= (shape.CellRow - 1) * cs, $"cell {shape.CellCol},{shape.CellRow}: box starts above the block");
                Assert.True(shape.MaxRow < (shape.CellRow + 2) * cs, $"cell {shape.CellCol},{shape.CellRow}: box ends below the block");
                Assert.True(shape.Reach <= ((1.5 - (IslandShapeConstants.Jitter / 2)) * cs) + 1e-9);
            }

            Assert.True(options == extreme ? clamped > 0 : true, "the extreme options must actually exercise the clamp");
        }
    }

    [Theory]
    [InlineData(4)]
    [InlineData(9)]
    public void An_island_is_never_cut_at_a_cell_border(int seed)
    {
        // "Cut at a cell border" would mean an island claiming a hex that the hex does not
        // scan (that hex sees its own cell and the eight around it, nothing further). Walk
        // the whole reach box of every island in a compact world and check that every hex
        // the island alone says is land is one whose 3x3 block includes the island's own cell
        // — and that the island does claim land at all.
        var options = WorldGenerationOptions.Compact(seed, 600) with { IslandChance = 1.0 };
        var sampler = new TerrainSampler(options);
        var cs = options.IslandCellSize;
        var landHexes = 0;

        foreach (var shape in sampler.EnumerateIslandShapes())
        {
            // A box one cell wider than the scan box on every side, so a claim beyond it would show.
            for (var col = shape.MinCol - cs; col <= shape.MaxCol + cs; col++)
            {
                for (var row = shape.MinRow - cs; row <= shape.MaxRow + cs; row++)
                {
                    var hex = HexCoord.FromOddQ(new OffsetCoord(col, row));
                    if (sampler.DepthOfShape(shape, hex, wasted: false) is null)
                    {
                        continue;
                    }

                    landHexes++;
                    Assert.True(
                        Math.Abs(Cell(col, cs) - shape.CellCol) <= 1 && Math.Abs(Cell(row, cs) - shape.CellRow) <= 1,
                        $"cell {shape.CellCol},{shape.CellRow} claims ({col},{row}), outside the block a hex there scans");
                    Assert.InRange(col, shape.MinCol, shape.MaxCol);
                    Assert.InRange(row, shape.MinRow, shape.MaxRow);
                }
            }
        }

        Assert.True(landHexes > 1000, $"only {landHexes} land hexes: the world is too empty to test anything");
    }

    [Fact]
    public void Land_sits_within_reach_of_its_islands_centre()
    {
        // Reach is the farthest land from the centre, warps included: every land hex an island
        // alone claims is within Reach of the centre (in offset space).
        var options = WorldGenerationOptions.ForSeed(3);
        var sampler = new TerrainSampler(options);
        foreach (var shape in sampler.EnumerateIslandShapes().Take(6))
        {
            for (var col = shape.MinCol; col <= shape.MaxCol; col += 3)
            {
                for (var row = shape.MinRow; row <= shape.MaxRow; row += 3)
                {
                    var hex = HexCoord.FromOddQ(new OffsetCoord(col, row));
                    if (sampler.DepthOfShape(shape, hex, wasted: false) is null)
                    {
                        continue;
                    }

                    var dx = col - shape.CentreX;
                    var dy = row - shape.CentreY;
                    Assert.True(
                        Math.Sqrt((dx * dx) + (dy * dy)) <= shape.Reach + 1e-9,
                        $"land at ({col},{row}) is farther than reach {shape.Reach:0.#} from cell {shape.CellCol},{shape.CellRow}'s centre");
                }
            }
        }
    }

    // ---- size classes ------------------------------------------------------------------

    [Fact]
    public void Size_classes_come_in_the_advertised_mix_and_order_by_size()
    {
        var options = WorldGenerationOptions.ForSeed(21) with { Radius = WorldGenerationOptions.MaxRadius };
        var sampler = new TerrainSampler(options);
        var shapes = sampler.EnumerateIslandShapes().ToList();
        Assert.True(shapes.Count > 200, $"only {shapes.Count} islands in a radius-5000 world");

        double Share(IslandSizeClass c) => (double)shapes.Count(s => s.SizeClass == c) / shapes.Count;

        // Mostly B, some A, a few C (a large island also clears its neighbours, which thins
        // the medium/small classes around it).
        Assert.True(Share(IslandSizeClass.Medium) > Share(IslandSizeClass.Small), "B should be the most common class");
        Assert.InRange(Share(IslandSizeClass.Small), 0.15, 0.45);
        Assert.InRange(Share(IslandSizeClass.Large), 0.03, 0.20);

        // A < B < C by island size (widest half-width of the spine).
        double MeanWidth(IslandSizeClass c) => shapes.Where(s => s.SizeClass == c).Average(s => s.Width.Max() / s.ClampFactor);
        Assert.True(MeanWidth(IslandSizeClass.Small) < MeanWidth(IslandSizeClass.Medium));
        Assert.True(MeanWidth(IslandSizeClass.Medium) < MeanWidth(IslandSizeClass.Large));
    }

    [Fact]
    public void A_large_island_clears_the_cells_around_it()
    {
        var options = WorldGenerationOptions.ForSeed(21) with { Radius = WorldGenerationOptions.MaxRadius };
        var sampler = new TerrainSampler(options);
        var large = sampler.EnumerateIslandShapes().Where(s => s.SizeClass == IslandSizeClass.Large).ToList();
        Assert.NotEmpty(large);

        foreach (var l in large)
        {
            for (var dc = -1; dc <= 1; dc++)
            {
                for (var dr = -1; dr <= 1; dr++)
                {
                    if (dc == 0 && dr == 0)
                    {
                        continue;
                    }

                    var neighbour = sampler.IslandShapeAt(l.CellCol + dc, l.CellRow + dr);
                    if (neighbour is null)
                    {
                        continue;
                    }

                    // The only neighbour that can survive a kept large island is another
                    // large island that lost the tie-break and was demoted to medium.
                    var rawHash = ValueNoise.Hash2(neighbour.CellCol, neighbour.CellRow, options.Seed + 301);
                    Assert.True(
                        neighbour.SizeClass == IslandSizeClass.Medium && rawHash > 1.0 - options.IslandLargeShare,
                        $"large island at {l.CellCol},{l.CellRow} has a surviving {neighbour.SizeClass} neighbour at {neighbour.CellCol},{neighbour.CellRow}");
                }
            }
        }
    }

    // ---- cell-based generation vs brute force ------------------------------------------

    /// <summary>The landmasses of <paramref name="isLand"/> over every hex of the world disc, by flood fill.</summary>
    private static List<HashSet<HexCoord>> BruteForceLandmasses(int radius, Func<HexCoord, bool> isLand)
    {
        var land = new HashSet<HexCoord>(HexCoord.Origin.WithinRadius(radius).Where(isLand));
        var seen = new HashSet<HexCoord>();
        var masses = new List<HashSet<HexCoord>>();
        foreach (var start in land.OrderBy(c => c.Q).ThenBy(c => c.R))
        {
            if (!seen.Add(start))
            {
                continue;
            }

            var mass = new HashSet<HexCoord> { start };
            var pending = new Stack<HexCoord>();
            pending.Push(start);
            while (pending.TryPop(out var c))
            {
                foreach (var n in c.Neighbours())
                {
                    if (land.Contains(n) && seen.Add(n))
                    {
                        mass.Add(n);
                        pending.Push(n);
                    }
                }
            }

            masses.Add(mass);
        }

        return masses;
    }

    [Theory]
    [InlineData(1, 300)]
    [InlineData(2, 300)]
    [InlineData(3, 500)]
    public void Cell_based_generation_finds_exactly_the_landmasses_a_full_scan_finds(int seed, int radius)
    {
        var options = WorldGenerationOptions.Compact(seed, radius) with { IslandChance = 1.0 };
        var world = TestWorlds.Generate(options);
        var sampler = new TerrainSampler(options);

        foreach (var (wasted, isLand) in new (bool, Func<HexCoord, bool>)[]
        {
            (false, c => sampler.IsLand(c)),
            (true, c => sampler.WastedTerrainAt(c).IsLand()),
        })
        {
            var expected = BruteForceLandmasses(radius, isLand)
                .Where(m => m.Count >= options.MinimumIslandTiles)
                .OrderBy(m => m.Min(c => (c.Q, c.R)))
                .ToList();
            var actual = world.Islands.Where(i => i.IsWasted == wasted).ToList();

            Assert.Equal(expected.Count, actual.Count);
            for (var i = 0; i < expected.Count; i++)
            {
                Assert.True(
                    expected[i].SetEquals(actual[i].Tiles),
                    $"seed {seed} radius {radius} (wasted: {wasted}) island #{i}: {actual[i].TileCount} tiles vs brute force {expected[i].Count}");
            }
        }

        // Sizes of what was thrown away never inflate the count past what a full scan sees.
        var bruteTotal = BruteForceLandmasses(radius, c => sampler.IsLand(c)).Sum(m => m.Count);
        var keptTotal = world.Islands.Where(i => !i.IsWasted).Sum(i => i.TileCount);
        Assert.InRange(world.LandTileCount, keptTotal, bruteTotal);
    }

    [Fact]
    public void Islands_are_indexed_by_their_lowest_tile_and_their_tiles_are_sorted()
    {
        var world = TestWorlds.Compact(5, 500);
        var green = world.Islands.Where(i => !i.IsWasted).ToList();
        Assert.True(green.Count > 3);

        Assert.Equal(Enumerable.Range(0, world.Islands.Count), world.Islands.Select(i => i.Index));
        foreach (var island in world.Islands)
        {
            Assert.Equal(island.Tiles.OrderBy(t => t.Q).ThenBy(t => t.R), island.Tiles);
        }

        var firsts = green.Select(i => (i.Tiles[0].Q, i.Tiles[0].R)).ToList();
        Assert.Equal(firsts.OrderBy(t => t.Q).ThenBy(t => t.R), firsts);
    }

    [Fact]
    public void Parallel_per_island_work_gives_the_same_world_every_time()
    {
        var options = WorldGenerationOptions.Compact(8, 500) with { IslandChance = 1.0 };
        var first = new WorldGenerator(options).Generate(TestContext.Current.CancellationToken);
        var second = new WorldGenerator(options).Generate(TestContext.Current.CancellationToken);

        Assert.Equal(first.LandTileCount, second.LandTileCount);
        Assert.Equal(
            first.Islands.Select(i => (i.Index, i.Name, i.Centre, i.Tiles.Count, i.RiverTiles.Count, i.Giants.Count)),
            second.Islands.Select(i => (i.Index, i.Name, i.Centre, i.Tiles.Count, i.RiverTiles.Count, i.Giants.Count)));
        Assert.Equal(first.Islands.Select(i => i.StartPositions), second.Islands.Select(i => i.StartPositions));
        Assert.Equal(first.Islands.Select(i => i.RiverTiles), second.Islands.Select(i => i.RiverTiles));
    }

    [Fact]
    public void Wasted_islands_still_never_touch_green_land_with_the_new_shape()
    {
        var world = TestWorlds.Default(6);
        var sampler = new TerrainSampler(world.Options);
        var wastedIslands = world.Islands.Where(i => i.IsWasted).ToList();
        Assert.NotEmpty(wastedIslands);

        foreach (var tile in wastedIslands.SelectMany(i => i.Tiles))
        {
            Assert.False(sampler.IsLand(tile), $"wasted tile {tile} is green land");
            Assert.All(tile.Neighbours(), n => Assert.False(sampler.IsLand(n), $"wasted tile {tile} touches green land at {n}"));
        }
    }
}
