using Bjarnoy.Domain.World;
using Bjarnoy.Domain.World.Review;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The world review (<see cref="WorldReview"/>): the cut-off rule set of PR #366 (wide rivers and mountains impassable), the
/// bog and landing checks, the generator guarantees it re-checks, and the order seeds are ranked in.
/// </summary>
public class WorldReviewTests
{
    private static readonly TileOrientation E = TileOrientation.E;
    private static readonly TileOrientation W = TileOrientation.W;
    private static readonly TileOrientation SE = TileOrientation.SE;

    // ---- wide rivers (#366's isWideRiverTile) ----

    private static Dictionary<HexCoord, RiverTile> Rivers(params RiverTile[] tiles) => tiles.ToDictionary(t => t.Coord);

    /// <summary>A straight run flowing east: the water comes from the west neighbour and leaves to the east.</summary>
    private static RiverTile Run(int q, RiverWidth width, RiverTileShape shape = RiverTileShape.Straight) =>
        new(new HexCoord(q, 0), shape, shape == RiverTileShape.Spring ? [] : [W], shape == RiverTileShape.Mouth ? null : E, width);

    [Fact]
    public void A_river_width_run_is_wide_and_a_stream_is_not()
    {
        var rivers = Rivers(Run(0, RiverWidth.River), Run(1, RiverWidth.River), Run(2, RiverWidth.Stream), Run(3, RiverWidth.Stream));

        Assert.True(CutOffLandCheck.IsWideRiver(rivers[new HexCoord(1, 0)], rivers));
        Assert.False(CutOffLandCheck.IsWideRiver(rivers[new HexCoord(3, 0)], rivers));
    }

    [Fact]
    public void A_widen_tile_is_crossable_but_the_river_below_it_is_not()
    {
        // stream -> widen (stream in, river out) -> river
        var rivers = Rivers(Run(0, RiverWidth.Stream), Run(1, RiverWidth.Widen), Run(2, RiverWidth.River));

        Assert.False(CutOffLandCheck.IsWideRiver(rivers[new HexCoord(1, 0)], rivers));
        Assert.True(CutOffLandCheck.IsWideRiver(rivers[new HexCoord(2, 0)], rivers));
    }

    [Fact]
    public void A_river_stream_Y_is_wide_and_a_stream_stream_confluence_is_not()
    {
        // The Y at (1,0) takes a river from the west and a stream from the south-east, and flows out east.
        RiverTile Y(RiverWidth width) => new(new HexCoord(1, 0), RiverTileShape.Confluence, [W, SE], E, width);
        var stream = new RiverTile(new HexCoord(1, 1), RiverTileShape.Spring, [], TileOrientation.NW, RiverWidth.Stream);

        var riverStream = Rivers(Run(0, RiverWidth.River), stream, Y(RiverWidth.RiverStream));
        Assert.True(CutOffLandCheck.IsWideRiver(riverStream[new HexCoord(1, 0)], riverStream));

        var twoStreams = Rivers(Run(0, RiverWidth.Stream), stream, Y(RiverWidth.Widen));
        Assert.False(CutOffLandCheck.IsWideRiver(twoStreams[new HexCoord(1, 0)], twoStreams));
    }

    [Fact]
    public void A_river_mouth_counts_its_sea_side_as_an_arm()
    {
        var rivers = Rivers(Run(0, RiverWidth.River), Run(1, RiverWidth.River, RiverTileShape.Mouth));
        Assert.True(CutOffLandCheck.IsWideRiver(rivers[new HexCoord(1, 0)], rivers));

        // A river tile fed by a lake (no river tile upstream) is wide; a stream fed the same way is not.
        var fromLake = Rivers(Run(5, RiverWidth.River));
        Assert.True(CutOffLandCheck.IsWideRiver(fromLake[new HexCoord(5, 0)], fromLake));
        var streamFromLake = Rivers(Run(5, RiverWidth.Stream));
        Assert.False(CutOffLandCheck.IsWideRiver(streamFromLake[new HexCoord(5, 0)], streamFromLake));
    }

    // ---- cut-off regions on a hand-built island ----

    /// <summary>
    /// A disc of radius 6: grass, with a ring of mountain at distance 3 from the centre except where <paramref name="gap"/>
    /// says, enclosing a 19-hex valley.
    /// </summary>
    private static ReviewedIsland Valley(
        bool gap = false, IReadOnlyList<HexCoord>? startPositions = null, IReadOnlyList<RiverTile>? rivers = null)
    {
        var tiles = HexCoord.Origin.WithinRadius(6).OrderBy(t => t.Q).ThenBy(t => t.R).ToList();
        var gapHex = new HexCoord(3, 0);
        Terrain TerrainOf(HexCoord c) =>
            c.DistanceTo(HexCoord.Origin) == 3 && !(gap && c == gapHex) ? Terrain.Mountain : Terrain.Grass;

        var island = new GeneratedIsland
        {
            Index = 0,
            Name = "Valley",
            Tiles = tiles,
            Centre = HexCoord.Origin,
            StartPositions = startPositions ?? [],
            RiverTiles = rivers ?? [],
            Giants = [],
        };
        return new ReviewedIsland(island, TerrainOf);
    }

    [Fact]
    public void A_valley_ringed_by_mountains_is_cut_off()
    {
        var regions = CutOffLandCheck.CutOffRegions(Valley(), out var walkable);

        Assert.Single(regions);
        Assert.Equal(19, regions[0].Count);
        Assert.Equal(127 - 18, walkable);
    }

    [Fact]
    public void A_pass_through_the_ring_or_a_landing_spot_inside_it_makes_the_valley_reachable()
    {
        Assert.Empty(CutOffLandCheck.CutOffRegions(Valley(gap: true), out _));
        Assert.Empty(CutOffLandCheck.CutOffRegions(Valley(startPositions: [new HexCoord(0, 1)]), out _));
    }

    [Fact]
    public void A_wide_river_closing_the_pass_cuts_the_valley_off_again_but_a_stream_does_not()
    {
        // The pass hex (3,0) carries a river flowing east out of the valley, fed from (2,0) inside it.
        RiverTile[] Through(RiverWidth width) =>
        [
            new(new HexCoord(2, 0), RiverTileShape.Spring, [], E, width),
            new(new HexCoord(3, 0), RiverTileShape.Straight, [W], E, width),
            new(new HexCoord(4, 0), RiverTileShape.Straight, [W], E, width),
        ];

        Assert.Single(CutOffLandCheck.CutOffRegions(Valley(gap: true, rivers: Through(RiverWidth.River)), out _));
        Assert.Empty(CutOffLandCheck.CutOffRegions(Valley(gap: true, rivers: Through(RiverWidth.Stream)), out _));
    }

    // ---- the review of generated worlds ----

    [Fact]
    public void A_generated_world_breaks_no_generator_guarantee_and_its_summary_matches_its_findings()
    {
        var world = TestWorlds.Default(1);
        var review = WorldReview.Review(world, TestContext.Current.CancellationToken);
        var s = review.Summary;

        Assert.Equal(0, s.BogRuleViolations);
        Assert.Equal(0, s.InlandRiverMouths);
        Assert.Equal(1, s.Seed);
        Assert.Equal(world.Islands.Count(i => !i.IsWasted), s.GreenIslands);
        Assert.Equal(world.Islands.Sum(i => i.StartPositions.Count), s.LandingSpots);
        Assert.True(s.LandingSpots > 0);
        Assert.Equal(review.Findings.Count, s.Errors + s.Warnings + s.Infos);
        Assert.Equal(review.Findings.Count(f => f.Kind == WorldReviewFindingKind.CutOffLand), s.CutOffRegions);
        Assert.True(s.CutOffTiles >= review.Findings.Where(f => f.Kind == WorldReviewFindingKind.CutOffLand).Sum(f => f.Size));
        Assert.InRange(s.CutOffShare, 0.0, s.WorstIslandCutOffShare);

        // Worst first: severity never improves down the list.
        Assert.Equal(review.Findings.OrderBy(f => f.Severity).Select(f => f.Severity), review.Findings.Select(f => f.Severity));

        // Every finding points at a hex of the island it names.
        var tiles = world.Islands.ToDictionary(i => i.Index, i => i.Tiles.ToHashSet());
        Assert.All(review.Findings, f => Assert.Contains(f.Hex, tiles[f.IslandIndex]));
    }

    [Fact]
    public void Missing_bog_and_landing_findings_agree_with_the_islands_they_name()
    {
        var world = TestWorlds.Default(2);
        var islands = world.Islands.ToDictionary(i => i.Index);
        var review = WorldReview.Review(world, TestContext.Current.CancellationToken);

        foreach (var f in review.Findings.Where(f => f.Kind == WorldReviewFindingKind.MissingBog))
        {
            Assert.Empty(islands[f.IslandIndex].BogTiles);
            Assert.True(islands[f.IslandIndex].TileCount >= world.Options.BogGuaranteeMinTiles);
        }

        foreach (var f in review.Findings.Where(f => f.Kind == WorldReviewFindingKind.NoLandingSpots))
        {
            Assert.Empty(islands[f.IslandIndex].StartPositions);
        }

        // The other direction: an island with no spots and no candidate is not reported.
        var context = new WorldReviewContext(world, TestContext.Current.CancellationToken);
        var reported = review.Findings.Where(f => f.Kind == WorldReviewFindingKind.NoLandingSpots).Select(f => f.IslandIndex).ToHashSet();
        var expected = context.GreenIslands.Where(i => i.LandingCandidates.Count > 0 && i.Island.StartPositions.Count == 0).Select(i => i.Index);
        Assert.Equal(expected.ToHashSet(), reported);
    }

    [Fact]
    public void The_review_is_deterministic()
    {
        var world = TestWorlds.Default(3);
        var a = WorldReview.Review(world, TestContext.Current.CancellationToken);
        var b = WorldReview.Review(world, TestContext.Current.CancellationToken);

        Assert.Equal(a.Summary, b.Summary);
        Assert.Equal(a.Findings, b.Findings);
    }

    [Fact]
    public void A_broken_island_is_reported_as_errors()
    {
        // Take a real island and break it by hand: a river mouth in the middle of the land and a lone lake tile with no outflow.
        var world = TestWorlds.Compact(5);
        var island = world.Islands.Where(i => !i.IsWasted).MaxBy(i => i.TileCount)!;
        var land = island.Tiles.ToHashSet();
        var inland = island.Tiles.Where(t => t.WithinRadius(3).All(land.Contains)).Take(2).ToList();
        Assert.Equal(2, inland.Count);

        var mouth = new RiverTile(inland[0], RiverTileShape.Mouth, [TileOrientation.W], null, RiverWidth.River);
        var lake = new BogTile(inland[1], BogTileKind.Lake, [], null, []);
        var broken = world with
        {
            Islands = [.. world.Islands.Select(i => i.Index == island.Index
                ? i with { RiverTiles = [.. i.RiverTiles, mouth], BogTiles = [.. i.BogTiles, lake] }
                : i)],
        };

        var review = WorldReview.Review(broken, TestContext.Current.CancellationToken);

        Assert.Contains(review.Findings, f => f.Kind == WorldReviewFindingKind.InlandRiverMouth
            && f.Severity == WorldReviewSeverity.Error && f.Hex == inland[0] && f.IslandIndex == island.Index);
        Assert.Contains(review.Findings, f => f.Kind == WorldReviewFindingKind.BogRuleViolation
            && f.Severity == WorldReviewSeverity.Error && f.IslandIndex == island.Index);
        Assert.Equal(1, review.Summary.InlandRiverMouths);
        Assert.True(review.Summary.BogRuleViolations > 0);
        Assert.True(review.Summary.Errors >= 2);
    }

    [Fact]
    public void Each_check_runs_on_its_own()
    {
        var world = TestWorlds.Default(1);
        var all = WorldReview.Review(world, TestContext.Current.CancellationToken);

        foreach (var check in WorldReview.DefaultChecks)
        {
            var alone = WorldReview.Review(world, [check], TestContext.Current.CancellationToken);
            var kinds = alone.Findings.Select(f => f.Kind).Distinct().ToList();
            Assert.True(kinds.Count <= 1, $"{check.GetType().Name} reported {string.Join(", ", kinds)}");
            if (kinds.Count == 1)
            {
                Assert.Equal(all.Findings.Where(f => f.Kind == kinds[0]), alone.Findings);
            }
        }
    }

    [Fact]
    public void A_wasted_island_beside_a_green_one_is_reported()
    {
        var options = TestWorlds.Options(1);
        GeneratedIsland Island(int index, int q, bool wasted) => new()
        {
            Index = index,
            Name = $"I{index}",
            Tiles = [.. new HexCoord(q, 0).WithinRadius(2)],
            Centre = new HexCoord(q, 0),
            StartPositions = [],
            RiverTiles = [],
            Giants = [],
            IsWasted = wasted,
        };

        // Green at q=0 reaches q=2; wasted at q=5 reaches down to q=3 (adjacent), at q=9 down to q=7 (5 away), at q=40 far off.
        var world = new GeneratedWorld
        {
            Options = options,
            Islands = [Island(0, 0, false), Island(1, 5, true), Island(2, 9, true), Island(3, 40, true)],
            LandTileCount = 19,
        };

        var findings = new List<WorldReviewFinding>();
        new WastedNearGreenCheck().Run(new WorldReviewContext(world, TestContext.Current.CancellationToken), findings, TestContext.Current.CancellationToken);

        var touching = Assert.Single(findings, f => f.IslandIndex == 1);
        Assert.Equal(WorldReviewSeverity.Warn, touching.Severity);
        Assert.Equal(1, touching.Size);
        Assert.Equal(new HexCoord(3, 0), touching.Hex);
        Assert.DoesNotContain(findings, f => f.IslandIndex == 2); // 5 > WastedNearDistance
        Assert.DoesNotContain(findings, f => f.IslandIndex == 3);

        var near = world with { Islands = [Island(0, 0, false), Island(1, 7, true)] };
        findings.Clear();
        new WastedNearGreenCheck().Run(new WorldReviewContext(near, TestContext.Current.CancellationToken), findings, TestContext.Current.CancellationToken);
        var info = Assert.Single(findings);
        Assert.Equal(WorldReviewSeverity.Info, info.Severity);
        Assert.Equal(3, info.Size);
    }

    [Fact]
    public void Seeds_rank_by_errors_then_warnings_then_cut_off_land_then_landing_spots()
    {
        WorldReviewSummary S(int seed, int errors, int warnings, int cutOff, int spots) =>
            new(seed, 1000, 0, 0, 0, spots, 0, 0, 0, 0, cutOff, 0, 0, 0, 0, 0, errors, warnings, 0);

        var list = new List<WorldReviewSummary>
        {
            S(1, 1, 0, 0, 100),
            S(2, 0, 3, 0, 100),
            S(3, 0, 1, 500, 100),
            S(4, 0, 1, 100, 50),
            S(5, 0, 1, 100, 80),
        };
        list.Sort(WorldReviewSummary.BestFirst);

        Assert.Equal([5, 4, 3, 2, 1], list.Select(s => s.Seed));
    }
}
