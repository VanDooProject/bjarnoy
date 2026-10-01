using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The landing-spot rule of <c>docs/design/bog.md</c> ("Decisions"): a start position needs plain bog within
/// <see cref="WorldGenerationOptions.BogReach"/> hexes, so an island without bog offers none.
/// </summary>
public class LandingSpotBogTests
{
    private static readonly HexCoord Origin = new(0, 0);

    /// <summary>A grass disc of radius 20 with one forest hex next to the origin: the origin is a valid start but for the bog rule.</summary>
    private static Dictionary<HexCoord, Terrain> Meadow()
    {
        var land = Origin.WithinRadius(20).ToDictionary(c => c, _ => Terrain.Grass);
        land[new HexCoord(1, 0)] = Terrain.Forest;
        return land;
    }

    private static List<HexCoord> Spots(Dictionary<HexCoord, Terrain> land, IReadOnlySet<HexCoord> plainBog, int reach) =>
        WorldGenerator.FindStartPositions([.. land.Keys], land, [], [], plainBog, reach);

    private static HexCoord AtDistance(int distance) => new(distance, 0);

    [Fact]
    public void A_spot_with_plain_bog_exactly_at_the_reach_is_kept()
    {
        var land = Meadow();
        land[AtDistance(12)] = Terrain.Bog;

        Assert.Contains(Origin, Spots(land, new HashSet<HexCoord> { AtDistance(12) }, reach: 12));
    }

    [Fact]
    public void A_spot_with_plain_bog_one_hex_beyond_the_reach_is_dropped()
    {
        var land = Meadow();
        land[AtDistance(13)] = Terrain.Bog;

        Assert.DoesNotContain(Origin, Spots(land, new HashSet<HexCoord> { AtDistance(13) }, reach: 12));
    }

    [Fact]
    public void An_island_without_plain_bog_offers_no_spot_at_all()
    {
        var land = Meadow();

        Assert.Empty(Spots(land, new HashSet<HexCoord>(), reach: 12));
        // Sanity: the same meadow does offer spots once the rule is switched off.
        Assert.Contains(Origin, Spots(land, new HashSet<HexCoord>(), reach: 0));
    }

    [Fact]
    public void Only_plain_bog_counts_a_lake_shore_or_creek_in_reach_does_not_keep_a_spot()
    {
        var land = Meadow();
        land[AtDistance(6)] = Terrain.Bog; // stands for a shore or creek hex: bog terrain, but not in the plain-bog set

        Assert.DoesNotContain(Origin, Spots(land, new HashSet<HexCoord>(), reach: 12));
    }

    [Fact]
    public void The_default_reach_is_12_and_the_rule_can_be_switched_off()
    {
        Assert.Equal(12, WorldGenerationOptions.ForSeed(1).BogReach);
        Assert.Throws<ArgumentOutOfRangeException>(() => (WorldGenerationOptions.ForSeed(1) with { BogReach = -1 }).Validate());
        (WorldGenerationOptions.ForSeed(1) with { BogReach = 0 }).Validate();
    }

    [Fact]
    public void The_compact_preset_has_the_rule_off_because_its_islands_are_too_small_for_bog()
    {
        Assert.Equal(0, WorldGenerationOptions.Compact(1).BogReach);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public void Every_generated_landing_spot_has_plain_bog_within_reach_and_islands_without_bog_have_none(int seed)
    {
        var world = TestWorlds.Default(seed);
        var checkedSpots = 0;

        foreach (var island in world.Islands.Where(i => !i.IsWasted))
        {
            var plainBog = island.BogTiles.Where(t => t.Kind == BogTileKind.Bog).Select(t => t.Coord).ToHashSet();
            if (plainBog.Count == 0)
            {
                Assert.Empty(island.StartPositions);
                continue;
            }

            foreach (var spot in island.StartPositions)
            {
                checkedSpots++;
                Assert.True(
                    plainBog.Any(b => b.DistanceTo(spot) <= world.Options.BogReach),
                    $"seed {seed}: spot {spot} has no plain bog within {world.Options.BogReach}");
            }
        }

        Assert.True(checkedSpots > 0, "no island of this seed offered a landing spot");
    }
}
