using System.Text.Json;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Giant placement v2's cross-language anti-drift guard.
/// <c>src/shared/giant-placement-golden.json</c> is read by this suite and by
/// the frontend's <c>giantPlacement.golden.test.ts</c> — each side computes
/// against the same synthetic island (tiles/terrain, rivers, world seed,
/// island index) using its OWN production placement implementation
/// (<see cref="GiantGenerator.PlaceCore"/> here, <c>placeGiants</c> there),
/// then asserts the fixture's frozen, ORDER-SENSITIVE giants list. Mirrors
/// <see cref="TerritoryGoldenTests"/>'s own pattern for loading a
/// <c>src/shared/*.json</c> fixture.
/// </summary>
public class GiantPlacementGoldenTests
{
    private static readonly IReadOnlyList<Scenario> Scenarios = LoadScenarios();

    public static IEnumerable<object[]> Cases() => Scenarios.Select(s => new object[] { s });

    [Theory]
    [MemberData(nameof(Cases))]
    public void Matches_the_shared_golden_fixture(Scenario scenario)
    {
        var tiles = scenario.Tiles.Select(t => new HexCoord((int)t[0].GetInt32(), (int)t[1].GetInt32())).ToList();
        var land = new Dictionary<HexCoord, Terrain>();
        for (var i = 0; i < scenario.Tiles.Count; i++)
        {
            var raw = scenario.Tiles[i];
            var terrain = ParseTerrain(raw[2].GetString()!);
            land[tiles[i]] = terrain;
        }

        var rivers = scenario.Rivers.Select(r => new HexCoord(r[0], r[1])).ToHashSet();

        var actual = GiantGenerator.PlaceCore(tiles, land, rivers, scenario.WorldSeed, scenario.IslandIndex);

        Assert.Equal(scenario.Giants.Count, actual.Count);
        for (var i = 0; i < scenario.Giants.Count; i++)
        {
            var expected = scenario.Giants[i];
            Assert.True(
                expected.Q == actual[i].Anchor.Q && expected.R == actual[i].Anchor.R && expected.Family == actual[i].Family,
                $"{scenario.Name}: giant #{i} mismatch — expected ({expected.Q},{expected.R},{expected.Family}), " +
                $"got ({actual[i].Anchor.Q},{actual[i].Anchor.R},{actual[i].Family}).");
        }
    }

    private static Terrain ParseTerrain(string wireName) => wireName switch
    {
        "sea" => Terrain.Sea,
        "sand" => Terrain.Sand,
        "grass" => Terrain.Grass,
        "forest" => Terrain.Forest,
        "mountain" => Terrain.Mountain,
        _ => throw new InvalidOperationException($"Unknown terrain wire name '{wireName}'."),
    };

    private static IReadOnlyList<Scenario> LoadScenarios()
    {
        var json = File.ReadAllText(GoldenFixturePath());
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var raw = JsonSerializer.Deserialize<RawFixture>(json, options)
            ?? throw new InvalidOperationException("giant-placement-golden.json deserialized to null.");

        return raw.Scenarios;
    }

    /// <summary>Walks up from the test assembly's output directory to find the repo root — mirrors <c>TerritoryGoldenTests.GoldenFixturePath</c>.</summary>
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

        return Path.Combine(dir.Parent.FullName, "shared", "giant-placement-golden.json");
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

        public List<List<JsonElement>> Tiles { get; set; } = [];

        public List<int[]> Rivers { get; set; } = [];

        public List<GiantDto> Giants { get; set; } = [];

        public override string ToString() => Name;
    }

    public sealed class GiantDto
    {
        public int Q { get; set; }

        public int R { get; set; }

        public string Family { get; set; } = "";
    }
}
