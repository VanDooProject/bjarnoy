using System.Text.Json;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// River generation's cross-language anti-drift guard.
/// <c>src/shared/river-generation-golden.json</c> is read by this suite and by
/// the frontend's <c>riverGenerator.golden.test.ts</c> — each side computes
/// against the same island (tiles/terrain, world seed, island index, wasted/
/// allowConfluence flags) using its OWN production river-tracing
/// implementation (<see cref="RiverGenerator.Generate"/> here,
/// <c>generateRivers</c> there), then asserts the fixture's frozen,
/// ORDER-SENSITIVE river tile list. Mirrors
/// <see cref="GiantPlacementGoldenTests"/>'s own pattern for loading a
/// <c>src/shared/*.json</c> fixture.
/// </summary>
public class RiverGenerationGoldenTests
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
            land[tiles[i]] = ParseTerrain(raw[2].GetString()!);
        }

        var options = WorldGenerationOptions.ForSeed(scenario.WorldSeed) with { Radius = 45 };
        var sampler = new TerrainSampler(options);

        var actual = RiverGenerator.Generate(
            tiles, land, sampler, options, scenario.IslandIndex, scenario.Wasted, scenario.AllowConfluence);

        Assert.Equal(scenario.Rivers.Count, actual.Count);
        for (var i = 0; i < scenario.Rivers.Count; i++)
        {
            var expected = scenario.Rivers[i];
            var got = actual[i];

            Assert.True(
                expected.Q == got.Coord.Q && expected.R == got.Coord.R,
                $"{scenario.Name}: river tile #{i} coord mismatch — expected ({expected.Q},{expected.R}), got ({got.Coord.Q},{got.Coord.R}).");
            Assert.True(
                expected.Shape == ShapeWireName(got.Shape),
                $"{scenario.Name}: river tile #{i} ({expected.Q},{expected.R}) shape mismatch — expected {expected.Shape}, got {ShapeWireName(got.Shape)}.");
            Assert.True(
                expected.InDirections.SequenceEqual(got.InDirections.Select(d => d.ToWireName())),
                $"{scenario.Name}: river tile #{i} ({expected.Q},{expected.R}) inDirections mismatch — expected [{string.Join(",", expected.InDirections)}], got [{string.Join(",", got.InDirections.Select(d => d.ToWireName()))}].");
            Assert.True(
                expected.OutDirection == got.OutDirection?.ToWireName(),
                $"{scenario.Name}: river tile #{i} ({expected.Q},{expected.R}) outDirection mismatch — expected {expected.OutDirection ?? "null"}, got {got.OutDirection?.ToWireName() ?? "null"}.");
        }
    }

    private static string ShapeWireName(RiverTileShape shape) => shape switch
    {
        RiverTileShape.Spring => "spring",
        RiverTileShape.Straight => "straight",
        RiverTileShape.Bend => "bend",
        RiverTileShape.Confluence => "confluence",
        RiverTileShape.Mouth => "mouth",
        RiverTileShape.Bend60 => "bend60",
        _ => throw new InvalidOperationException($"Unknown shape {shape}"),
    };

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
            ?? throw new InvalidOperationException("river-generation-golden.json deserialized to null.");

        return raw.Scenarios;
    }

    /// <summary>Walks up from the test assembly's output directory to find the repo root — mirrors <c>GiantPlacementGoldenTests.GoldenFixturePath</c>.</summary>
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

        return Path.Combine(dir.Parent.FullName, "shared", "river-generation-golden.json");
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

        public bool Wasted { get; set; }

        public bool AllowConfluence { get; set; } = true;

        public List<List<JsonElement>> Tiles { get; set; } = [];

        public List<RiverTileDto> Rivers { get; set; } = [];

        public override string ToString() => Name;
    }

    public sealed class RiverTileDto
    {
        public int Q { get; set; }

        public int R { get; set; }

        public string Shape { get; set; } = "";

        public List<string> InDirections { get; set; } = [];

        public string? OutDirection { get; set; }
    }
}
