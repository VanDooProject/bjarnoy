using System.Text.Json;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The whale road's cross-language anti-drift guard. <c>src/shared/whale-placement-golden.json</c> is read by this suite
/// and by the frontend's <c>whalePlacement.golden.test.ts</c>: each side computes the sea pass of the same island
/// (its tiles plus the land of the islands around it, a world seed, an island index) with its OWN production
/// implementation (<see cref="CampGenerator.PlaceWhaleRoads"/> here, <c>placeWhaleRoads</c> there) and asserts the
/// fixture's frozen, ORDER-SENSITIVE camp list.
/// </summary>
public class WhalePlacementGoldenTests
{
    private static readonly IReadOnlyList<Scenario> Scenarios = LoadScenarios();

    public static IEnumerable<object[]> Cases() => Scenarios.Select(s => new object[] { s });

    [Theory]
    [MemberData(nameof(Cases))]
    public void Matches_the_shared_golden_fixture(Scenario scenario)
    {
        var tiles = scenario.Tiles.Select(t => new HexCoord(t[0], t[1])).ToList();
        var land = tiles.Concat(scenario.OtherLand.Select(t => new HexCoord(t[0], t[1]))).ToHashSet();

        var actual = CampGenerator.PlaceWhaleRoads(tiles, land.Contains, scenario.WorldSeed, scenario.IslandIndex);

        Assert.Equal(scenario.Camps.Count, actual.Count);
        for (var i = 0; i < scenario.Camps.Count; i++)
        {
            var expected = scenario.Camps[i];
            var got = actual[i];
            Assert.True(
                expected.Q == got.Coord.Q && expected.R == got.Coord.R && expected.Family == got.Family && expected.Level == got.Level,
                $"{scenario.Name}: whale road #{i} mismatch - expected ({expected.Q},{expected.R},{expected.Family},L{expected.Level}), "
                + $"got ({got.Coord.Q},{got.Coord.R},{got.Family},L{got.Level}).");
        }
    }

    [Fact]
    public void The_fixture_covers_neighbouring_land_that_changes_the_answer()
    {
        var scenario = Scenarios.Single(s => s.Name == "green_island_with_neighbours");
        var tiles = scenario.Tiles.Select(t => new HexCoord(t[0], t[1])).ToList();
        var own = tiles.ToHashSet();

        var alone = CampGenerator.PlaceWhaleRoads(tiles, own.Contains, scenario.WorldSeed, scenario.IslandIndex);

        Assert.NotEmpty(scenario.OtherLand);
        Assert.NotEqual(alone.Select(p => p.Coord), scenario.Camps.Select(c => new HexCoord(c.Q, c.R)));
    }

    private static IReadOnlyList<Scenario> LoadScenarios()
    {
        var json = File.ReadAllText(GoldenFixturePath());
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var raw = JsonSerializer.Deserialize<RawFixture>(json, options)
            ?? throw new InvalidOperationException("whale-placement-golden.json deserialized to null.");
        return raw.Scenarios;
    }

    private static string GoldenFixturePath()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Bjarnoy.slnx")))
        {
            dir = dir.Parent;
        }

        if (dir?.Parent is null)
        {
            throw new InvalidOperationException("Could not locate Bjarnoy.slnx while searching for the repo root.");
        }

        return Path.Combine(dir.Parent.FullName, "shared", "whale-placement-golden.json");
    }

    private sealed class RawFixture
    {
        public List<Scenario> Scenarios { get; set; } = [];
    }

    public sealed class Scenario
    {
        public string Name { get; set; } = "";

        public int WorldSeed { get; set; }

        public int IslandIndex { get; set; }

        public List<int[]> Tiles { get; set; } = [];

        public List<int[]> OtherLand { get; set; } = [];

        public List<CampDto> Camps { get; set; } = [];

        public override string ToString() => Name;
    }

    public sealed class CampDto
    {
        public int Q { get; set; }

        public int R { get; set; }

        public string Family { get; set; } = "";

        public int Level { get; set; }
    }
}
