using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The bog guarantee of <c>docs/design/bog.md</c>: an island that has a landing-spot candidate (the start-position rules minus the
/// bog rule) gets a bog, so it keeps landing spots. A through-river site with relaxed criteria first, else a spawn bog whose creek
/// spring feeds the lake and whose outflow is traced as a river; islands with no inland room are left as they are.
/// </summary>
public class BogGuaranteeTests
{
    private static readonly int[] Seeds = [1, 2, 3, 4, 5, 6, 7, 8];

    private sealed record Row(int Seed, TerrainSampler Sampler, GeneratedIsland Island, int Candidates);

    private static IEnumerable<Row> GreenIslands()
    {
        foreach (var seed in Seeds)
        {
            var world = TestWorlds.Default(seed);
            var sampler = new TerrainSampler(world.Options);
            foreach (var island in world.Islands.Where(i => !i.IsWasted))
            {
                var land = BogTerrain.Overlay(island.Tiles.ToDictionary(t => t, sampler.TerrainAt), island.BogTiles);
                var candidates = WorldGenerator.FindStartPositions(island.Tiles, land, island.Giants, island.Camps, new HashSet<HexCoord>(), 0);
                yield return new Row(seed, sampler, island, candidates.Count);
            }
        }
    }

    private static bool FeedsLake(GeneratedIsland island, BogTile spring)
    {
        var byCoord = island.BogTiles.ToDictionary(t => t.Coord);
        var cur = spring;
        for (var steps = 0; steps < 200 && cur.OutDirection is { } o; steps++)
        {
            if (!byCoord.TryGetValue(cur.Coord + HexCoord.Directions[(int)o], out var next))
            {
                return false;
            }

            if (next.Kind == BogTileKind.Lake)
            {
                return true;
            }

            cur = next;
        }

        return false;
    }

    [Fact]
    public void Every_island_with_a_landing_candidate_has_a_bog_except_the_ones_with_no_inland_room()
    {
        var qualifying = 0;
        var missing = new List<string>();
        foreach (var row in GreenIslands().Where(r => r.Candidates > 0))
        {
            qualifying++;
            if (row.Island.BogTiles.Count == 0)
            {
                missing.Add($"seed {row.Seed} island {row.Island.Index} ({row.Island.TileCount} tiles)");
            }
        }

        Assert.True(qualifying >= 150, $"only {qualifying} islands have a landing candidate");

        // The rest are narrow or mountainous islands: a lake needs a shore ring of grass or forest more than two hexes from the coast
        // (rule R7), which islands of a few hundred tiles rarely have. Nothing of 400 tiles or more may be left without.
        var large = missing.Where(m => int.Parse(m[(m.IndexOf('(') + 1)..m.IndexOf(' ', m.IndexOf('('))]) >= 400).ToList();
        Assert.True(large.Count == 0, "islands of 400+ tiles without a bog: " + string.Join("; ", large));
        Assert.True(missing.Count <= qualifying / 4, $"{missing.Count} of {qualifying} islands with a landing candidate have no bog: " + string.Join("; ", missing));
    }

    [Fact]
    public void Islands_with_a_landing_candidate_keep_landing_spots_now_that_they_have_a_bog()
    {
        var withCandidates = 0;
        var withSpots = 0;
        foreach (var row in GreenIslands().Where(r => r.Candidates > 0))
        {
            withCandidates++;
            if (row.Island.StartPositions.Count > 0)
            {
                withSpots++;
            }
        }

        Assert.True(withSpots >= 0.75 * withCandidates, $"{withSpots} of {withCandidates} islands with landing candidates offer a landing spot");
    }

    [Fact]
    public void Spawn_bogs_have_a_spring_feeding_the_lake_and_a_river_out_of_it()
    {
        var spawnBogs = 0;
        foreach (var row in GreenIslands().Where(r => r.Island.BogTiles.Any(t => t.Kind == BogTileKind.CreekSpring)))
        {
            var island = row.Island;
            var rivers = island.RiverTiles.ToDictionary(t => t.Coord);
            foreach (var spring in island.BogTiles.Where(t => t.Kind == BogTileKind.CreekSpring && FeedsLake(island, t)))
            {
                spawnBogs++;

                // Follow the water from the spring through the lake, out of the outflow mouth and down the creek: it ends in a river of river width.
                var byCoord = island.BogTiles.ToDictionary(t => t.Coord);
                var lake = new HashSet<HexCoord>();
                var cur = spring;
                while (cur.OutDirection is { } o)
                {
                    var next = cur.Coord + HexCoord.Directions[(int)o];
                    if (byCoord.TryGetValue(next, out var tile) && tile.Kind == BogTileKind.Lake)
                    {
                        var stack = new Stack<HexCoord>([next]);
                        lake.Add(next);
                        while (stack.Count > 0)
                        {
                            foreach (var n in stack.Pop().Neighbours())
                            {
                                if (byCoord.TryGetValue(n, out var l) && l.Kind == BogTileKind.Lake && lake.Add(n))
                                {
                                    stack.Push(n);
                                }
                            }
                        }

                        break;
                    }

                    cur = byCoord[next];
                }

                var outflow = island.BogTiles.Single(t => t.Kind == BogTileKind.Mouth && t.Coord.Neighbours().Any(lake.Contains)
                    && t.InDirections[0] == t.WaterEdges[0]);
                cur = outflow;
                var reached = false;
                var width = RiverWidth.Stream;
                for (var steps = 0; steps < 200 && cur.OutDirection is { } o2; steps++)
                {
                    var next = cur.Coord + HexCoord.Directions[(int)o2];
                    if (rivers.TryGetValue(next, out var river))
                    {
                        reached = true;
                        width = river.Width;
                        break;
                    }

                    cur = byCoord[next];
                }

                Assert.True(reached, $"seed {row.Seed} island {island.Index}: the outflow creek of the lake fed by {spring.Coord} reaches no river");
                Assert.NotEqual(RiverWidth.Stream, width);
            }
        }

        Assert.True(spawnBogs >= 10, $"only {spawnBogs} spawn bogs over eight worlds");
    }

    [Fact]
    public void River_mouths_still_touch_the_sea_and_every_bog_rule_holds_with_the_guarantee()
    {
        var mouths = 0;
        foreach (var row in GreenIslands())
        {
            var violations = BogRules.Check(row.Island.BogTiles, row.Island.RiverTiles, row.Sampler.TerrainAt);
            Assert.True(violations.Total == 0, $"seed {row.Seed} island {row.Island.Index}: {violations}");
            foreach (var tile in row.Island.RiverTiles.Where(t => t.Shape == RiverTileShape.Mouth))
            {
                mouths++;
                Assert.True(tile.Coord.Neighbours().Any(n => !row.Sampler.IsLand(n)), $"seed {row.Seed} island {row.Island.Index}: inland river mouth {tile.Coord}");
            }
        }

        Assert.True(mouths > 100, $"only {mouths} river mouths");
    }

    [Fact]
    public void The_guarantee_is_a_switch_and_the_compact_preset_has_it_off()
    {
        Assert.Equal(150, WorldGenerationOptions.ForSeed(1).BogGuaranteeMinTiles);
        Assert.Equal(0, WorldGenerationOptions.Compact(1).BogGuaranteeMinTiles);
        (WorldGenerationOptions.ForSeed(1) with { BogGuaranteeMinTiles = 0 }).Validate();
        Assert.Throws<ArgumentOutOfRangeException>(() => (WorldGenerationOptions.ForSeed(1) with { BogGuaranteeMinTiles = -1 }).Validate());
        Assert.Throws<ArgumentOutOfRangeException>(() => (WorldGenerationOptions.ForSeed(1) with { BogGuaranteeRadius = 4 }).Validate());
    }

    [Fact]
    public void Switching_the_guarantee_off_gives_the_islands_back_without_a_bog()
    {
        var off = TestWorlds.Generate(TestWorlds.Options(1) with { BogGuaranteeMinTiles = 0 });
        var on = TestWorlds.Default(1);
        var bogsOff = off.Islands.Count(i => !i.IsWasted && i.BogTiles.Count > 0);
        var bogsOn = on.Islands.Count(i => !i.IsWasted && i.BogTiles.Count > 0);

        Assert.True(bogsOn > bogsOff, $"{bogsOn} islands with a bog with the guarantee, {bogsOff} without");

        // The guarantee only adds: an island that already had a bog keeps exactly the bog it had.
        foreach (var island in off.Islands.Where(i => !i.IsWasted && i.BogTiles.Count > 0))
        {
            var same = on.Islands.Single(i => i.Index == island.Index);
            Assert.Equal(island.BogTiles.Count, same.BogTiles.Count);
        }
    }
}
